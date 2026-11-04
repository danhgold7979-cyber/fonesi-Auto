import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readPersistenceFile } from './persistence-files.ts';
import { SecretProviderError, createSecretProvider } from './secret-provider.ts';
import type { NativeSecretProvider } from './secret-provider.ts';
import {
  initializeVaultFiles,
  vaultInventory,
  readVaultCiphertext,
  writeVaultCiphertext,
  replaceVaultIndex,
  VAULT_ENTRY_LIMIT,
  VAULT_TOTAL_LIMIT,
} from './secret-files.ts';
import {
  snapshotRef,
  snapshotBytes,
  parseIndex,
  serializeIndex,
  parseInitializationReceipt,
  serializeInitializationReceipt,
  encodeSecretPayload,
  decodeSecretPayload,
  secretRevisionFilename,
  validSecretId,
  makeSecretSuccess,
  makeSecretFailure,
} from '../secret-contract.ts';
import type {
  SecretRef,
  SecretIndex,
  SecretIndexEntry,
  SecretOperation,
  SecretResult,
  SecretFailureCode,
} from '../secret-contract.ts';
import type { VaultAuditFields, LogHealth } from '../log-contract.ts';

export type SecretProvider = Readonly<{
  encrypt: (plaintext: string) => Promise<Uint8Array>;
  decrypt: (
    ciphertext: Uint8Array,
  ) => Promise<Readonly<{ result: string; shouldReEncrypt: boolean }>>;
}>;
export type SecretStoreOptions = Readonly<{
  root: string;
  storeId: string;
  assertOwned: () => Promise<void>;
  provider: SecretProvider;
  audit: (fields: VaultAuditFields) => Promise<LogHealth>;
}>;
type CallerState = { active: boolean; methods: ReadonlySet<SecretOperation> };
class StoreFault extends Error {
  readonly fixedCode: SecretFailureCode;
  constructor(code: SecretFailureCode) {
    super(code);
    this.fixedCode = code;
  }
}
function fault(code: SecretFailureCode): never {
  throw new StoreFault(code);
}
const required = <T>(value: T | null): T => (value === null ? fault('STORE_INVALID') : value);
const refOf = (entry: SecretIndexEntry): SecretRef => ({
  version: 1,
  id: entry.id,
  revision: entry.revision,
});

export class SecretStore {
  private readonly directory: string;
  private readonly storeId: string;
  private readonly assertOwned: () => Promise<void>;
  private readonly provider: SecretProvider;
  private readonly audit: (fields: VaultAuditFields) => Promise<LogHealth>;
  private readonly callers = new WeakMap<object, CallerState>();
  private readonly statusCaller: object;
  private busy = false;
  private closed = false;
  private uncertain = false;
  private active: Promise<SecretResult> | null = null;
  private initializing: Promise<void> | null = null;
  constructor(options: SecretStoreOptions) {
    if (!validSecretId(options.storeId)) fault('STORE_INVALID');
    this.directory = join(options.root, 'vault');
    this.storeId = options.storeId;
    this.assertOwned = options.assertOwned;
    this.provider = Object.freeze({
      encrypt: options.provider.encrypt.bind(options.provider),
      decrypt: options.provider.decrypt.bind(options.provider),
    });
    this.audit = options.audit;
    this.statusCaller = this.grant(['STATUS']);
  }
  grant(methods: readonly SecretOperation[]): object {
    if (
      this.closed ||
      methods.some((m) => !['CREATE', 'READ', 'REPLACE', 'DELETE', 'STATUS'].includes(m))
    )
      fault('UNAUTHORIZED');
    const token = Object.freeze({});
    this.callers.set(token, { active: true, methods: new Set(methods) });
    return token;
  }
  revoke(caller: object): void {
    const state = this.callers.get(caller);
    if (state) state.active = false;
  }
  private localAdmission(caller: unknown, operation: SecretOperation): void {
    if (this.closed || this.uncertain) fault('OWNER_REVOKED');
    const state =
      typeof caller === 'object' && caller !== null ? this.callers.get(caller) : undefined;
    if (!state?.active || !state.methods.has(operation)) fault('UNAUTHORIZED');
  }
  private async admit(caller: unknown, operation: SecretOperation): Promise<void> {
    this.localAdmission(caller, operation);
    try {
      await this.assertOwned();
    } catch {
      fault('OWNER_REVOKED');
    }
    this.localAdmission(caller, operation);
  }
  initialize(kind: 'FRESH' | 'RESTORED'): Promise<void> {
    if (kind !== 'FRESH' || this.closed || this.busy) fault('STORE_INVALID');
    this.busy = true;
    const pending = (async () => {
      await this.assertOwned();
      if (this.closed) fault('OWNER_REVOKED');
      await initializeVaultFiles(
        this.directory,
        this.storeId,
        required(serializeIndex({ version: 1, storeId: this.storeId, entries: [] })),
        required(
          serializeInitializationReceipt({ version: 1, storeId: this.storeId, format: 'VAULT_V1' }),
        ),
      );
    })().finally(() => {
      this.busy = false;
      this.initializing = null;
    });
    this.initializing = pending;
    return pending;
  }
  verify(): Promise<void> {
    if (this.closed || this.busy) fault('STORE_INVALID');
    this.busy = true;
    const pending = (async () => {
      await this.assertOwned();
      await this.load();
      if (this.closed) fault('OWNER_REVOKED');
    })().finally(() => {
      this.busy = false;
      this.initializing = null;
    });
    this.initializing = pending;
    return pending;
  }
  shutdown(): Promise<void> {
    return this.close();
  }
  private async decrypt(path: string, reference: SecretRef): Promise<Uint8Array> {
    const cipher = await readVaultCiphertext(path);
    let output: Readonly<{ result: string; shouldReEncrypt: boolean }>;
    try {
      output = await this.provider.decrypt(cipher);
    } catch (error) {
      if (
        error instanceof SecretProviderError &&
        ['KEY_UNAVAILABLE', 'OWNER_REVOKED', 'DECRYPTION_FAILED'].includes(error.code)
      )
        fault(error.code as SecretFailureCode);
      fault('DECRYPTION_FAILED');
    } finally {
      cipher.fill(0);
    }
    if (typeof output.result !== 'string' || typeof output.shouldReEncrypt !== 'boolean')
      fault('DECRYPTION_FAILED');
    if (output.shouldReEncrypt) fault('KEY_UNAVAILABLE');
    const bytes = decodeSecretPayload(output.result, {
      storeId: this.storeId,
      id: reference.id,
      revision: reference.revision,
      purpose: 'PROXY_CREDENTIAL',
    });
    if (!bytes) fault('DECRYPTION_FAILED');
    return bytes;
  }
  private async load(): Promise<{ index: SecretIndex; raw: string; count: number; bytes: number }> {
    const inventory = await vaultInventory(this.directory);
    if ((await readPersistenceFile(join(this.directory, '.owner'), 36)) !== this.storeId)
      fault('STORE_INVALID');
    if (
      !parseInitializationReceipt(
        await readPersistenceFile(join(this.directory, 'initialized.json')),
        this.storeId,
      )
    )
      fault('STORE_INVALID');
    const raw = await readPersistenceFile(join(this.directory, 'index.json'));
    const index = required(parseIndex(raw, this.storeId));
    let total = 0;
    for (const [, size] of inventory) total += size;
    // Only the committed index confers authority. Bounded exact-named inactive
    // partial writes are retained, never parsed/adopted or automatically pruned.
    for (const entry of index.entries) {
      if (entry.state === 'ACTIVE') {
        const reference = refOf(entry),
          name = required(secretRevisionFilename(reference));
        if (!inventory.has(name)) fault('STORE_INVALID');
        const bytes = await this.decrypt(join(this.directory, name), reference);
        bytes.fill(0);
      }
    }
    return { index, raw, count: inventory.size, bytes: total };
  }
  private async auditEvent(
    operation: SecretOperation,
    phase: 'INTENT' | 'RESULT',
    diagnosticId: string,
    reference: SecretRef | null,
    code: string,
  ): Promise<LogHealth> {
    try {
      return await this.audit({
        operation,
        phase,
        diagnosticId,
        secretId: reference?.id ?? null,
        revision: reference?.revision ?? null,
        code,
      } as VaultAuditFields);
    } catch {
      return 'DEGRADED';
    }
  }
  private run(
    operation: SecretOperation,
    caller: unknown,
    input: unknown,
    bytesInput?: unknown,
    purpose?: unknown,
  ): Promise<SecretResult> {
    if (this.busy)
      return Promise.resolve(required(makeSecretFailure(operation, 'BUSY', 'DEGRADED')));
    const parsed = operation === 'CREATE' ? null : snapshotRef(input);
    if ((parsed && !parsed.ok) || (operation === 'CREATE' && purpose !== 'PROXY_CREDENTIAL'))
      return Promise.resolve(
        required(
          makeSecretFailure(
            operation,
            parsed && !parsed.ok ? parsed.code : 'INVALID_REQUEST',
            'DEGRADED',
          ),
        ),
      );
    const bytes =
      operation === 'CREATE' || operation === 'REPLACE' ? snapshotBytes(bytesInput) : null;
    if ((operation === 'CREATE' || operation === 'REPLACE') && !bytes)
      return Promise.resolve(required(makeSecretFailure(operation, 'INVALID_REQUEST', 'DEGRADED')));
    const reference = parsed?.ok ? parsed.value : null;
    this.busy = true;
    const pending = this.execute(operation, caller, reference, bytes).finally(() => {
      bytes?.fill(0);
      this.busy = false;
      this.active = null;
    });
    this.active = pending;
    return pending;
  }
  private async execute(
    operation: SecretOperation,
    caller: unknown,
    reference: SecretRef | null,
    input: Uint8Array | null,
  ): Promise<SecretResult> {
    let auditHealth: LogHealth = 'DEGRADED';
    let diagnostic: string | null = null;
    let returned: Uint8Array | null = null;
    try {
      await this.admit(caller, operation);
      diagnostic = randomUUID();
      const current = await this.load();
      const entry = reference
        ? current.index.entries.find((e) => e.id === reference.id)
        : undefined;
      if (operation === 'STATUS') {
        const status = !entry
          ? 'MISSING'
          : entry.revision !== reference?.revision
            ? 'STALE_REFERENCE'
            : entry.state === 'DELETED'
              ? 'DELETED'
              : 'AVAILABLE';
        auditHealth = await this.auditEvent(operation, 'RESULT', diagnostic, reference, 'OK');
        await this.admit(caller, operation);
        return required(
          makeSecretSuccess(operation, 'OBSERVED', { reference, status }, auditHealth),
        );
      }
      if (operation !== 'CREATE') {
        if (!entry) fault('NOT_FOUND');
        if (entry.revision !== reference?.revision) fault('STALE_REFERENCE');
        if (entry.state === 'DELETED' && operation !== 'DELETE') fault('DELETED');
      }
      if ((await this.auditEvent(operation, 'INTENT', diagnostic, reference, 'OK')) !== 'AVAILABLE')
        fault('AUDIT_UNAVAILABLE');
      await this.admit(caller, operation);
      if (operation === 'READ') {
        returned = await this.decrypt(
          join(this.directory, required(secretRevisionFilename(reference))),
          required(reference),
        );
        if (
          (await this.auditEvent(operation, 'RESULT', diagnostic, reference, 'OK')) !== 'AVAILABLE'
        )
          fault('AUDIT_UNAVAILABLE');
        await this.admit(caller, operation);
        this.localAdmission(caller, operation);
        const result = required(
          makeSecretSuccess(operation, 'READ', { reference, bytes: returned }, 'AVAILABLE'),
        );
        returned.fill(0);
        returned = null;
        return result;
      }
      if (operation === 'DELETE' && entry?.state === 'DELETED') {
        auditHealth = await this.auditEvent(operation, 'RESULT', diagnostic, reference, 'OK');
        await this.admit(caller, operation);
        return required(
          makeSecretSuccess(operation, 'UNCHANGED', { reference, deleted: true }, auditHealth),
        );
      }
      if (operation === 'REPLACE' && reference?.revision === Number.MAX_SAFE_INTEGER)
        fault('REVISION_EXHAUSTED');
      const next: SecretRef =
        operation === 'CREATE'
          ? { version: 1, id: randomUUID(), revision: 1 }
          : operation === 'REPLACE'
            ? { ...required(reference), revision: required(reference).revision + 1 }
            : required(reference);
      const nextEntry: SecretIndexEntry = {
        id: next.id,
        revision: next.revision,
        purpose: 'PROXY_CREDENTIAL',
        state: operation === 'DELETE' ? 'DELETED' : 'ACTIVE',
      };
      const entries = current.index.entries
        .filter((e) => e.id !== next.id)
        .concat(nextEntry)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const replacement = required(serializeIndex({ version: 1, storeId: this.storeId, entries }));
      if (
        current.count + 2 > VAULT_ENTRY_LIMIT ||
        current.bytes + 32768 + 65536 > VAULT_TOTAL_LIMIT
      )
        fault('STORE_INVALID');
      if (operation !== 'DELETE') {
        const plaintext = required(
          encodeSecretPayload({
            storeId: this.storeId,
            id: next.id,
            revision: next.revision,
            purpose: 'PROXY_CREDENTIAL',
            bytes: input,
          }),
        );
        let cipher: Uint8Array;
        try {
          cipher = await this.provider.encrypt(plaintext);
        } catch (error) {
          if (error instanceof SecretProviderError && error.code === 'OWNER_REVOKED')
            fault('OWNER_REVOKED');
          fault('KEY_UNAVAILABLE');
        }
        try {
          await writeVaultCiphertext(
            join(this.directory, required(secretRevisionFilename(next))),
            cipher,
          );
        } finally {
          cipher.fill(0);
        }
        const verified = await this.decrypt(
          join(this.directory, required(secretRevisionFilename(next))),
          next,
        );
        try {
          if (!input || verified.length !== input.length || verified.some((v, i) => v !== input[i]))
            fault('DECRYPTION_FAILED');
        } finally {
          verified.fill(0);
        }
      }
      let publicationStarted = false;
      try {
        await replaceVaultIndex(
          this.directory,
          current.raw,
          replacement,
          async () => {
            await this.admit(caller, operation);
          },
          () => {
            this.localAdmission(caller, operation);
            publicationStarted = true;
          },
        );
      } catch (error) {
        if (publicationStarted) {
          this.uncertain = true;
          fault('OWNER_REVOKED');
        }
        throw error;
      }
      auditHealth = await this.auditEvent(operation, 'RESULT', diagnostic, next, 'OK');
      return required(
        makeSecretSuccess(
          operation,
          'COMMITTED',
          operation === 'DELETE' ? { reference: next, deleted: true } : { reference: next },
          auditHealth,
        ),
      );
    } catch (error) {
      const code = error instanceof StoreFault ? error.fixedCode : 'WRITE_FAILED';
      if (diagnostic)
        auditHealth = await this.auditEvent(operation, 'RESULT', diagnostic, reference, code);
      if (code === 'AUDIT_UNAVAILABLE') auditHealth = 'DEGRADED';
      return required(makeSecretFailure(operation, code, auditHealth));
    } finally {
      returned?.fill(0);
    }
  }
  create(caller: unknown, purpose: unknown, bytes: unknown): Promise<SecretResult> {
    return this.run('CREATE', caller, null, bytes, purpose);
  }
  read(caller: unknown, reference: unknown): Promise<SecretResult> {
    return this.run('READ', caller, reference);
  }
  replace(caller: unknown, reference: unknown, bytes: unknown): Promise<SecretResult> {
    return this.run('REPLACE', caller, reference, bytes);
  }
  delete(caller: unknown, reference: unknown): Promise<SecretResult> {
    return this.run('DELETE', caller, reference);
  }
  status(reference: unknown): Promise<SecretResult> {
    return this.run('STATUS', this.statusCaller, reference);
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.initializing;
    await this.active;
  }
}

// Keep provider error identity within the same emitted bundle. Native callers use
// this facade, not independently bundled adapter/store constructor composition.
export function createNativeSecretStore(
  options: Omit<SecretStoreOptions, 'provider'> & Readonly<{ provider: NativeSecretProvider }>,
): SecretStore {
  return new SecretStore({
    ...options,
    provider: createSecretProvider(options.provider, options.assertOwned),
  });
}
