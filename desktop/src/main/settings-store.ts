import { randomUUID } from 'node:crypto';
import {
  DEFAULT_PREFERENCES,
  snapshotSettings,
  snapshotNativeWindowState,
  snapshotPatch,
  validSettingsRevision,
  type SettingsSnapshot,
  type PublicSettings,
  type SettingsRequest,
  type SettingsMethod,
  type SettingsErrorCode,
  type NativeWindowState,
} from '../settings-contract.ts';
import type { SettingsAuditFields } from '../log-contract.ts';
export type SettingsAudit = SettingsAuditFields;
type Health = 'AVAILABLE' | 'DEGRADED';
export type SettingsResult =
  | Readonly<{
      ok: true;
      outcome: 'OBSERVED' | 'UNCHANGED' | 'COMMITTED';
      settings: PublicSettings;
      diagnosticId: string;
      auditHealth: Health;
    }>
  | Readonly<{
      ok: false;
      code: SettingsErrorCode;
      diagnosticId: string | null;
      auditHealth: Health;
    }>;
export interface SettingsDatabase {
  readSettings(): SettingsSnapshot;
  readPreviousSettings(): SettingsSnapshot | null;
  commitSettings(
    expectedRevision: number,
    next: SettingsSnapshot,
    admit: () => void,
  ):
    | { ok: true; value: SettingsSnapshot }
    | { ok: false; code: 'CONFLICT' | 'WRITE_FAILED' | 'OUTCOME_UNKNOWN' | 'RECOVERY_REQUIRED' };
}
export interface SettingsStoreOptions {
  db: SettingsDatabase;
  assertOwned(): Promise<void>;
  assertOwnedSync(): void;
  audit(fields: SettingsAudit): Promise<Health>;
  confirm(action: 'RESET' | 'RESTORE'): Promise<boolean>;
  readWindow(): NativeWindowState;
  windowOwned(): boolean;
}
export type SettingsCaller = Readonly<{ readonly settingsCaller: true }>;
class Fault extends Error {
  readonly code: SettingsErrorCode;
  constructor(code: SettingsErrorCode) {
    super(code);
    this.code = code;
  }
}
function publicSnapshot(value: SettingsSnapshot): PublicSettings {
  return Object.freeze({
    revision: value.revision,
    theme: value.theme,
    dockWidth: value.dockWidth,
    tileWidth: value.tileWidth,
    persistence: 'PERSISTED',
  });
}
const methods: readonly SettingsMethod[] = [
  'preferences.get',
  'preferences.update',
  'preferences.reset',
  'preferences.restorePrevious',
];
export class SettingsStore {
  private state: 'RUNNING' | 'DRAINING' | 'CLOSED' = 'RUNNING';
  private callers = new WeakMap<
    SettingsCaller,
    { methods: readonly SettingsMethod[]; admit: () => void }
  >();
  private active: Promise<SettingsResult> | null = null;
  private latest: NativeWindowState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closing: Promise<SettingsResult | null> | null = null;
  private uncertain = false;
  private windowResult: SettingsResult | null = null;
  get lastWindowResult(): SettingsResult | null {
    return this.windowResult;
  }
  private readonly options: SettingsStoreOptions;
  constructor(options: SettingsStoreOptions) {
    const db = options.db;
    this.options = Object.freeze({
      db: Object.freeze({
        readSettings: db.readSettings.bind(db),
        readPreviousSettings: db.readPreviousSettings.bind(db),
        commitSettings: db.commitSettings.bind(db),
      }),
      assertOwned: options.assertOwned.bind(options),
      assertOwnedSync: options.assertOwnedSync.bind(options),
      audit: options.audit.bind(options),
      confirm: options.confirm.bind(options),
      readWindow: options.readWindow.bind(options),
      windowOwned: options.windowOwned.bind(options),
    });
  }
  grant(allowed: readonly SettingsMethod[], admit: () => void): SettingsCaller {
    if (
      this.state !== 'RUNNING' ||
      allowed.length === 0 ||
      allowed.some((m) => !methods.includes(m)) ||
      typeof admit !== 'function'
    )
      throw new Fault('INVALID_SHAPE');
    const token = Object.freeze({ settingsCaller: true as const });
    this.callers.set(token, { methods: Object.freeze([...new Set(allowed)]), admit });
    return token;
  }
  private admission(token: SettingsCaller | null, method: SettingsMethod | null) {
    this.options.assertOwnedSync();
    if (token === null) {
      if (this.state === 'CLOSED' || !this.options.windowOwned())
        throw new Fault('SESSION_REVOKED');
      return;
    }
    if (this.state !== 'RUNNING') throw new Fault('SESSION_REVOKED');
    const caller = this.callers.get(token);
    if (!caller || method === null || !caller.methods.includes(method))
      throw new Fault('UNTRUSTED_SENDER');
    try {
      caller.admit();
    } catch {
      throw new Fault('SESSION_REVOKED');
    }
  }
  private rows() {
    const current = snapshotSettings(this.options.db.readSettings()),
      rawPrevious = this.options.db.readPreviousSettings(),
      previous = snapshotSettings(rawPrevious);
    if (
      !current ||
      (current.revision > 0 && rawPrevious === null) ||
      (current.revision === 0 && rawPrevious !== null)
    )
      throw new Fault('RECOVERY_REQUIRED');
    if (rawPrevious !== null && (!previous || previous.revision >= current.revision))
      throw new Fault('RECOVERY_REQUIRED');
    return { current, previous };
  }
  private async audit(fields: SettingsAudit): Promise<Health> {
    try {
      return (await this.options.audit(Object.freeze(fields))) === 'AVAILABLE'
        ? 'AVAILABLE'
        : 'DEGRADED';
    } catch {
      return 'DEGRADED';
    }
  }
  execute(token: SettingsCaller, request: SettingsRequest): Promise<SettingsResult> {
    if (token === null || typeof token !== 'object' || !this.callers.has(token))
      return Promise.resolve({
        ok: false,
        code: 'UNTRUSTED_SENDER',
        diagnosticId: null,
        auditHealth: 'DEGRADED',
      });
    if (this.active)
      return Promise.resolve({
        ok: false,
        code: 'BUSY',
        diagnosticId: null,
        auditHealth: 'DEGRADED',
      });
    // Snapshot all validated primitives before any asynchronous boundary.
    let captured: SettingsRequest;
    try {
      if (!methods.includes(request.method)) throw new Fault('INVALID_SHAPE');
      if (request.method === 'preferences.get')
        captured = { version: 1, requestId: request.requestId, method: request.method };
      else {
        if (!validSettingsRevision(request.expectedRevision)) throw new Fault('INVALID_SHAPE');
        if (request.method === 'preferences.update') {
          const patch = snapshotPatch(request.patch);
          if (!patch) throw new Fault('INVALID_SHAPE');
          captured = { ...request, patch };
        } else captured = { ...request };
      }
    } catch {
      return Promise.resolve({
        ok: false,
        code: 'INVALID_SHAPE',
        diagnosticId: null,
        auditHealth: 'DEGRADED',
      });
    }
    return this.start(() => this.run(token, captured, null));
  }
  private start(work: () => Promise<SettingsResult>): Promise<SettingsResult> {
    const promise = work();
    this.active = promise;
    void promise.finally(() => {
      if (this.active === promise) this.active = null;
      if (this.state === 'RUNNING' && this.latest) this.schedule();
    });
    return promise;
  }
  private async run(
    token: SettingsCaller | null,
    request: SettingsRequest | null,
    native: NativeWindowState | null,
  ): Promise<SettingsResult> {
    let diagnosticId: string;
    try {
      diagnosticId = randomUUID();
    } catch {
      return { ok: false, code: 'INTERNAL_FAILURE', diagnosticId: null, auditHealth: 'DEGRADED' };
    }
    const operation =
      request === null
        ? 'WINDOW'
        : request.method === 'preferences.get'
          ? 'READ'
          : request.method === 'preferences.update'
            ? 'UPDATE'
            : request.method === 'preferences.reset'
              ? 'RESET'
              : 'RESTORE';
    let expectedRevision: number | null =
      request && request.method !== 'preferences.get' ? request.expectedRevision : null;
    let resultingRevision: number | null = null;
    let committed = false;
    try {
      this.admission(token, request?.method ?? null);
      await this.options.assertOwned();
      this.admission(token, request?.method ?? null);
      let { current, previous } = this.rows();
      if (operation === 'READ') {
        // Uncertain writes remain blocked for this instance; owner must reopen/validate the database.
        const auditHealth = await this.audit({
          operation,
          phase: 'RESULT',
          diagnosticId,
          expectedRevision: null,
          resultingRevision: current.revision,
          code: 'OK',
        });
        this.admission(token, request?.method ?? null);
        return {
          ok: true,
          outcome: 'OBSERVED',
          settings: publicSnapshot(current),
          diagnosticId,
          auditHealth,
        };
      }
      if (this.uncertain) throw new Fault('OUTCOME_UNKNOWN');
      if (expectedRevision !== null && expectedRevision !== current.revision)
        throw new Fault('CONFLICT');
      if (operation === 'RESET' || operation === 'RESTORE') {
        if ((await this.options.confirm(operation)) !== true) throw new Fault('CANCELLED');
        await this.options.assertOwned();
        this.admission(token, request?.method ?? null);
        ({ current, previous } = this.rows());
        if (expectedRevision !== current.revision) throw new Fault('CONFLICT');
      }
      let next: SettingsSnapshot;
      if (native) next = { ...current, ...native };
      else if (request?.method === 'preferences.update') next = { ...current, ...request.patch };
      else if (operation === 'RESET') next = { ...current, ...DEFAULT_PREFERENCES };
      else if (previous) next = { ...previous, revision: current.revision };
      else throw new Fault('RECOVERY_REQUIRED');
      if (JSON.stringify(next) === JSON.stringify(current)) {
        const auditHealth = await this.audit({
          operation,
          phase: 'RESULT',
          diagnosticId,
          expectedRevision: current.revision,
          resultingRevision: current.revision,
          code: 'OK',
        });
        this.admission(token, request?.method ?? null);
        return {
          ok: true,
          outcome: 'UNCHANGED',
          settings: publicSnapshot(current),
          diagnosticId,
          auditHealth,
        };
      }
      if (current.revision === Number.MAX_SAFE_INTEGER) throw new Fault('WRITE_FAILED');
      expectedRevision = current.revision;
      next = { ...next, revision: current.revision + 1 };
      if (
        (await this.audit({
          operation,
          phase: 'INTENT',
          diagnosticId,
          expectedRevision,
          resultingRevision: null,
          code: 'OK',
        })) !== 'AVAILABLE'
      )
        throw new Fault('WRITE_FAILED');
      await this.options.assertOwned();
      this.admission(token, request?.method ?? null);
      let stored: SettingsSnapshot;
      try {
        const result = this.options.db.commitSettings(current.revision, next, () =>
          this.admission(token, request?.method ?? null),
        );
        if (!result.ok) {
          if (result.code === 'OUTCOME_UNKNOWN') this.uncertain = true;
          throw new Fault(result.code);
        }
        stored = result.value;
      } catch (error) {
        if (error instanceof Fault) throw error;
        this.uncertain = true;
        throw new Fault('OUTCOME_UNKNOWN');
      }
      committed = true;
      const valid = snapshotSettings(stored);
      if (!valid || JSON.stringify(valid) !== JSON.stringify(snapshotSettings(next))) {
        this.uncertain = true;
        throw new Fault('OUTCOME_UNKNOWN');
      }
      resultingRevision = valid.revision;
      const auditHealth = await this.audit({
        operation,
        phase: 'RESULT',
        diagnosticId,
        expectedRevision,
        resultingRevision,
        code: 'OK',
      });
      return {
        ok: true,
        outcome: 'COMMITTED',
        settings: publicSnapshot(valid),
        diagnosticId,
        auditHealth,
      };
    } catch (error) {
      const code =
        error instanceof Fault ? error.code : committed ? 'OUTCOME_UNKNOWN' : 'RECOVERY_REQUIRED';
      const auditHealth = await this.audit({
        operation,
        phase: 'RESULT',
        diagnosticId,
        expectedRevision,
        resultingRevision,
        code,
      });
      return { ok: false, code, diagnosticId, auditHealth };
    }
  }
  observeWindow(): void {
    if (this.state !== 'RUNNING' || !this.options.windowOwned()) return;
    const captured = snapshotNativeWindowState(this.options.readWindow());
    if (!captured) return;
    this.latest = captured;
    this.schedule();
  }
  private schedule() {
    if (this.timer || this.state !== 'RUNNING') return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.active) return;
      const native = this.latest;
      this.latest = null;
      if (native)
        void this.start(() => this.run(null, null, native)).then((result) => {
          this.windowResult = result;
        });
    }, 250);
  }
  shutdown(): Promise<SettingsResult | null> {
    if (this.closing) return this.closing;
    this.state = 'DRAINING';
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    let final: NativeWindowState | null = null;
    try {
      if (this.options.windowOwned()) final = snapshotNativeWindowState(this.options.readWindow());
    } catch {
      final = null;
    }
    this.latest = null;
    this.closing = (async () => {
      if (this.active) await this.active;
      try {
        return final
          ? await this.run(null, null, final)
          : {
              ok: false as const,
              code: 'SESSION_REVOKED' as const,
              diagnosticId: null,
              auditHealth: 'DEGRADED' as const,
            };
      } finally {
        this.state = 'CLOSED';
      }
    })();
    return this.closing;
  }
}
