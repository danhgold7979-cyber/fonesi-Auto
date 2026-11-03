// Private core ledger only. The caller holds the data-root lease and serialized
// setup lane, validates immutable-package exclusion, all payloads and the 128MiB
// aggregate budget. These records do not certify consent, licenses or binaries.
import { lstat, realpath, opendir, mkdir, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export type ProvisionCandidate = Readonly<{ manifestSha256: string; archiveSha256: string }>;
export type ProvisionIntentInput = Readonly<{
  operationId: string;
  kind: 'INSTALL' | 'ROLLBACK';
  route: 'OFFICIAL_DOWNLOAD' | 'LOCAL_ARCHIVE' | 'RETAINED_RUNTIME';
  manifestSha256: string;
  archiveSha256: string;
  recipientDecisionId: string;
}>;
export type ProvisionOperationProvenance = Readonly<
  Pick<ProvisionIntentInput, 'operationId' | 'kind' | 'manifestSha256' | 'archiveSha256'>
>;
export type ProvisionLedgerState = Readonly<{
  revision: number;
  activeSha256: string | null;
  previousActiveSha256: string | null;
  lastSettlementSha256: string;
  operationIds: readonly string[];
  operations: readonly ProvisionOperationProvenance[];
}>;
export type ProvisionOperation = Readonly<{ operationId: string; revision: number }>;
type Intent = ProvisionIntentInput &
  Readonly<{
    version: 1;
    storeId: string;
    revision: number;
    previousSettlementSha256: string;
    previousActiveSha256: string | null;
  }>;
type Settlement = Readonly<{
  version: 1;
  storeId: string;
  operationId: string;
  revision: number;
  intentSha256: string;
  outcome: 'ACTIVATED' | 'NOT_ACTIVATED';
  activeSha256: string | null;
  previousActiveSha256: string | null;
}>;
const intentKeys = [
  'version',
  'storeId',
  'operationId',
  'revision',
  'previousSettlementSha256',
  'kind',
  'route',
  'manifestSha256',
  'archiveSha256',
  'previousActiveSha256',
  'recipientDecisionId',
];
const settledKeys = [
  'version',
  'storeId',
  'operationId',
  'revision',
  'intentSha256',
  'outcome',
  'activeSha256',
  'previousActiveSha256',
];
const inputKeys = [
  'operationId',
  'kind',
  'route',
  'manifestSha256',
  'archiveSha256',
  'recipientDecisionId',
];
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && v.length === 64 && /^[0-9a-f]+$/.test(v);
const digest = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
function fail(code = 'RECOVERY_REQUIRED'): never {
  throw new Error(code);
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('INVALID_REQUEST');
  if (Reflect.ownKeys(value).length !== keys.length) fail('INVALID_REQUEST');
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) fail('INVALID_REQUEST');
    out[key] = d.value;
  }
  return out;
}
function canonical(raw: string, keys: readonly string[]): Record<string, unknown> {
  try {
    const v = record(JSON.parse(raw), keys);
    if (JSON.stringify(v) !== raw) fail();
    return v;
  } catch {
    return fail();
  }
}
function input(value: unknown): ProvisionIntentInput {
  const v = record(value, inputKeys);
  if (
    !uuid(v.operationId) ||
    !uuid(v.recipientDecisionId) ||
    !hash(v.manifestSha256) ||
    !hash(v.archiveSha256) ||
    !['INSTALL', 'ROLLBACK'].includes(v.kind as string) ||
    (v.kind === 'ROLLBACK'
      ? v.route !== 'RETAINED_RUNTIME'
      : !['OFFICIAL_DOWNLOAD', 'LOCAL_ARCHIVE'].includes(v.route as string))
  )
    fail('INVALID_REQUEST');
  return Object.freeze(v) as ProvisionIntentInput;
}
async function directory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path) fail();
}
async function names(path: string, max: number): Promise<string[]> {
  await directory(path);
  const out: string[] = [];
  const dir = await opendir(path);
  for await (const entry of dir) {
    if (out.length === max) fail('LIMIT_EXCEEDED');
    out.push(entry.name);
  }
  return out;
}
async function read(path: string): Promise<string> {
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > 4096 ||
    (await realpath(path)) !== path
  )
    fail();
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.size !== before.size ||
      stat.nlink !== 1
    )
      fail();
    const bytes = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) fail();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, bytesRead),
    );
  } finally {
    await file.close();
  }
}
export function createPlatformToolsProvisionLedger(
  options: Readonly<{
    dataRoot: string;
    storeId: string;
    assertOwnedSync: () => void;
    acceptedCandidates: readonly ProvisionCandidate[];
  }>,
) {
  const dataRoot = options.dataRoot,
    storeId = options.storeId,
    owned = options.assertOwnedSync;
  if (
    typeof dataRoot !== 'string' ||
    resolve(dataRoot) !== dataRoot ||
    !uuid(storeId) ||
    typeof owned !== 'function'
  )
    fail('INVALID_REQUEST');
  if (
    !Array.isArray(options.acceptedCandidates) ||
    options.acceptedCandidates.length < 1 ||
    options.acceptedCandidates.length > 4
  )
    fail('INVALID_REQUEST');
  const candidates = options.acceptedCandidates.map((value) => {
    const row = record(value, ['manifestSha256', 'archiveSha256']);
    if (!hash(row.manifestSha256) || !hash(row.archiveSha256)) fail('INVALID_REQUEST');
    return Object.freeze(row) as ProvisionCandidate;
  });
  if (new Set(candidates.map((x) => x.archiveSha256)).size !== candidates.length)
    fail('INVALID_REQUEST');
  const root = join(dataRoot, 'platform-tools-runtime'),
    operations = join(root, 'operations');
  const marker = JSON.stringify({ version: 1, storeId, kind: 'PLATFORM_TOOLS_RUNTIME' }),
    genesis = digest(marker);
  const tokens = new WeakMap<
    object,
    { intent: Intent; raw: string; prior: ProvisionLedgerState }
  >();
  let busy = false,
    uncertain = false;
  function fence() {
    try {
      owned();
    } catch {
      fail('OWNER_REVOKED');
    }
    if (uncertain) fail('RECOVERY_REQUIRED');
  }
  async function guard<T>(run: () => Promise<T>): Promise<T> {
    if (busy) fail('BUSY');
    fence();
    busy = true;
    try {
      return await run();
    } finally {
      busy = false;
    }
  }
  async function write(path: string, raw: string, admit: () => void = () => {}) {
    if (Buffer.byteLength(raw) > 4096) fail('LIMIT_EXCEEDED');
    fence();
    let issued = false;
    try {
      admit();
      fence();
      const file = await open(path, 'wx', 0o600);
      issued = true;
      try {
        fence();
        await file.writeFile(raw, 'utf8');
        fence();
        await file.sync();
        fence();
      } finally {
        await file.close();
      }
      fence();
      if ((await read(path)) !== raw) fail();
      fence();
    } catch (error) {
      if (issued) {
        uncertain = true;
        fail('OUTCOME_UNKNOWN');
      }
      throw error;
    }
  }
  async function inspect(
    allowPending = false,
  ): Promise<{ state: ProvisionLedgerState; pending: Intent | null; raw: string | null }> {
    await directory(dataRoot);
    fence();
    const entries = await names(root, 4);
    fence();
    if (
      entries.length !== 4 ||
      entries.some(
        (x) => !['.platform-tools-owner.json', 'operations', 'runtimes', 'staging'].includes(x),
      )
    )
      fail();
    if ((await read(join(root, '.platform-tools-owner.json'))) !== marker) fail();
    fence();
    for (const name of ['operations', 'runtimes', 'staging']) {
      await directory(join(root, name));
      fence();
    }
    const files = await names(operations, 256);
    fence();
    const intents = new Map<number, { intent: Intent; raw: string }>(),
      settled = new Map<string, { value: Settlement; raw: string }>();
    for (const name of files) {
      const match = /^operation-([0-9a-f-]{36})\.(intent|settled)\.json$/.exec(name);
      if (!match || !uuid(match[1])) fail();
      const raw = await read(join(operations, name));
      fence();
      if (match[2] === 'intent') {
        const v = canonical(raw, intentKeys);
        let i: ProvisionIntentInput;
        try {
          i = input(Object.fromEntries(inputKeys.map((k) => [k, v[k]])));
        } catch {
          return fail();
        }
        if (
          v.version !== 1 ||
          v.storeId !== storeId ||
          v.operationId !== match[1] ||
          !Number.isSafeInteger(v.revision) ||
          Object.is(v.revision, -0) ||
          (v.revision as number) < 1 ||
          (v.revision as number) > 128 ||
          !hash(v.previousSettlementSha256) ||
          (v.previousActiveSha256 !== null && !hash(v.previousActiveSha256)) ||
          !candidates.some(
            (c) => c.manifestSha256 === i.manifestSha256 && c.archiveSha256 === i.archiveSha256,
          )
        )
          fail();
        if (intents.has(v.revision as number)) fail();
        intents.set(v.revision as number, { intent: Object.freeze(v) as Intent, raw });
      } else {
        const v = canonical(raw, settledKeys);
        if (
          v.version !== 1 ||
          v.storeId !== storeId ||
          v.operationId !== match[1] ||
          !Number.isSafeInteger(v.revision) ||
          !hash(v.intentSha256) ||
          !['ACTIVATED', 'NOT_ACTIVATED'].includes(v.outcome as string) ||
          (v.activeSha256 !== null && !hash(v.activeSha256)) ||
          (v.previousActiveSha256 !== null && !hash(v.previousActiveSha256))
        )
          fail();
        settled.set(match[1], { value: Object.freeze(v) as Settlement, raw });
      }
    }
    let state: ProvisionLedgerState = Object.freeze({
      revision: 0,
      activeSha256: null,
      previousActiveSha256: null,
      lastSettlementSha256: genesis,
      operationIds: Object.freeze([]),
      operations: Object.freeze([]),
    });
    let pending: Intent | null = null,
      pendingRaw: string | null = null;
    for (let revision = 1; revision <= intents.size; revision++) {
      const pair = intents.get(revision);
      if (!pair || pending) fail();
      const i = pair.intent;
      if (
        i.previousSettlementSha256 !== state.lastSettlementSha256 ||
        i.previousActiveSha256 !== state.activeSha256
      )
        fail();
      if (i.kind === 'ROLLBACK' && i.archiveSha256 !== state.previousActiveSha256) fail();
      const s = settled.get(i.operationId);
      if (!s) {
        pending = i;
        pendingRaw = pair.raw;
        state = Object.freeze({
          ...state,
          operationIds: Object.freeze([...state.operationIds, i.operationId]),
          operations: Object.freeze([
            ...state.operations,
            Object.freeze({
              operationId: i.operationId,
              kind: i.kind,
              manifestSha256: i.manifestSha256,
              archiveSha256: i.archiveSha256,
            }),
          ]),
        });
        continue;
      }
      const v = s.value;
      if (v.revision !== revision || v.intentSha256 !== digest(pair.raw)) fail();
      const active = v.outcome === 'ACTIVATED' ? i.archiveSha256 : state.activeSha256;
      const previous = v.outcome === 'ACTIVATED' ? state.activeSha256 : state.previousActiveSha256;
      if (v.activeSha256 !== active || v.previousActiveSha256 !== previous) fail();
      state = Object.freeze({
        revision,
        activeSha256: active,
        previousActiveSha256: previous,
        lastSettlementSha256: digest(s.raw),
        operationIds: Object.freeze([...state.operationIds, i.operationId]),
        operations: Object.freeze([
          ...state.operations,
          Object.freeze({
            operationId: i.operationId,
            kind: i.kind,
            manifestSha256: i.manifestSha256,
            archiveSha256: i.archiveSha256,
          }),
        ]),
      });
      settled.delete(i.operationId);
    }
    if (settled.size || (!allowPending && pending)) fail();
    fence();
    return { state, pending, raw: pendingRaw };
  }
  return Object.freeze({
    initialize: () =>
      guard(async () => {
        await directory(dataRoot);
        fence();
        try {
          await lstat(root);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          fence();
          await mkdir(root, { mode: 0o700 });
          fence();
          await write(join(root, '.platform-tools-owner.json'), marker);
          for (const name of ['operations', 'runtimes', 'staging']) {
            fence();
            await mkdir(join(root, name), { mode: 0o700 });
            fence();
          }
        }
        await inspect();
      }),
    readState: () => guard(async () => (await inspect()).state),
    readPending: (token: ProvisionOperation) =>
      guard(async () => {
        const binding = token && typeof token === 'object' ? tokens.get(token) : undefined;
        if (!binding) fail('INVALID_REQUEST');
        const observed = await inspect(true);
        if (observed.raw !== binding.raw) fail();
        return observed.state;
      }),
    begin: (expectedRevision: number, value: unknown) => {
      const request = input(value);
      return guard(async () => {
        const { state } = await inspect();
        if (
          !Number.isSafeInteger(expectedRevision) ||
          Object.is(expectedRevision, -0) ||
          expectedRevision < 0
        )
          fail('INVALID_REQUEST');
        if (expectedRevision !== state.revision) fail('STALE_REVISION');
        if (state.revision === 128) fail('LIMIT_EXCEEDED');
        if (
          !candidates.some(
            (c) =>
              c.manifestSha256 === request.manifestSha256 &&
              c.archiveSha256 === request.archiveSha256,
          )
        )
          fail('INVALID_REQUEST');
        if (request.kind === 'ROLLBACK' && request.archiveSha256 !== state.previousActiveSha256)
          fail('INVALID_REQUEST');
        const intent: Intent = Object.freeze({
          version: 1,
          storeId,
          operationId: request.operationId,
          revision: state.revision + 1,
          previousSettlementSha256: state.lastSettlementSha256,
          kind: request.kind,
          route: request.route,
          manifestSha256: request.manifestSha256,
          archiveSha256: request.archiveSha256,
          previousActiveSha256: state.activeSha256,
          recipientDecisionId: request.recipientDecisionId,
        });
        const raw = JSON.stringify(intent);
        await write(join(operations, `operation-${request.operationId}.intent.json`), raw);
        const token = Object.freeze({
          operationId: request.operationId,
          revision: intent.revision,
        });
        tokens.set(token, { intent, raw, prior: state });
        return token;
      });
    },
    settle: (
      token: ProvisionOperation,
      outcome: 'ACTIVATED' | 'NOT_ACTIVATED',
      admit: () => void,
    ) =>
      guard(async () => {
        const binding = token && typeof token === 'object' ? tokens.get(token) : undefined;
        if (
          !binding ||
          typeof admit !== 'function' ||
          !['ACTIVATED', 'NOT_ACTIVATED'].includes(outcome)
        )
          fail('INVALID_REQUEST');
        const observed = await inspect(true);
        if (
          observed.raw !== binding.raw ||
          observed.state.lastSettlementSha256 !== binding.prior.lastSettlementSha256
        )
          fail();
        const { intent, prior } = binding;
        const value: Settlement = {
          version: 1,
          storeId,
          operationId: intent.operationId,
          revision: intent.revision,
          intentSha256: digest(binding.raw),
          outcome,
          activeSha256: outcome === 'ACTIVATED' ? intent.archiveSha256 : prior.activeSha256,
          previousActiveSha256:
            outcome === 'ACTIVATED' ? prior.activeSha256 : prior.previousActiveSha256,
        };
        await write(
          join(operations, `operation-${intent.operationId}.settled.json`),
          JSON.stringify(value),
          admit,
        );
        tokens.delete(token);
        return (await inspect()).state;
      }),
  });
}
