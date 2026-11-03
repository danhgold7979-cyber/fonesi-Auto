// Private byte-observation custody only: never an executable, server or recipient grant.
import { lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  PLATFORM_TOOLS_KNOWN_CANDIDATES,
  resolvePlatformToolsCandidate,
} from './platform-tools-catalog.ts';
import { createPlatformToolsProvisionLedger } from './platform-tools-provision-ledger.ts';
import { createPlatformToolsProvisionFiles } from './platform-tools-provision-files.ts';
export type RuntimeCustodyCode =
  | 'BUSY'
  | 'CLOSED'
  | 'OWNER_REVOKED'
  | 'INVALID_TOKEN'
  | 'BINARY_UNAVAILABLE'
  | 'RECOVERY_REQUIRED'
  | 'UNRETIRED';
export type RuntimeCustodyToken = Readonly<Record<never, never>>;
export type RuntimeReadObservation = Readonly<{
  release: string;
  archiveSha256: string;
  manifestSha256: string;
  installationRevision: number;
  adbPath: string;
}>;
type Refusal = Readonly<{ ok: false; code: RuntimeCustodyCode }>;
type Retirement = Readonly<{ ok: true; status: 'RETIRED' | 'UNRETIRED' }> | Refusal;
type ReadResult =
  | Readonly<{
      ok: true;
      status: 'READ_VERIFIED_ONLY';
      token: RuntimeCustodyToken;
      observation: RuntimeReadObservation;
    }>
  | Refusal;
type Holder = {
  token: RuntimeCustodyToken;
  kind: 'SETUP' | 'READ';
  valid: boolean;
  inspection: Promise<ReadResult> | null;
  pinned: string | null;
  denial: RuntimeCustodyCode | null;
};
const refused = (code: RuntimeCustodyCode): Refusal => Object.freeze({ ok: false, code });
const retired = (status: 'RETIRED' | 'UNRETIRED'): Retirement =>
  Object.freeze({ ok: true, status });
export function createPlatformToolsRuntimeCustody(
  options: Readonly<{
    dataRoot: string;
    storeId: string;
    assertOwnedSync: () => void;
    assertDataLocation: (root: string) => void;
  }>,
) {
  const dataRoot = options.dataRoot,
    storeId = options.storeId,
    owned = options.assertOwnedSync.bind(options),
    location = options.assertDataLocation.bind(options);
  if (
    typeof dataRoot !== 'string' ||
    resolve(dataRoot) !== dataRoot ||
    typeof storeId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(storeId)
  )
    throw Error('RECOVERY_REQUIRED');
  let holder: Holder | null = null,
    stopped = false,
    closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  const failures = new WeakMap<object, RuntimeCustodyCode>();
  const tokens = new WeakMap<object, Holder>();
  let finishClose: (() => void) | null = null;
  function fail(code: RuntimeCustodyCode): never {
    const error = new Error(code);
    failures.set(error, code);
    throw error;
  }
  function classify(error: unknown): RuntimeCustodyCode {
    return error && typeof error === 'object'
      ? (failures.get(error) ?? 'RECOVERY_REQUIRED')
      : 'RECOVERY_REQUIRED';
  }
  function check(h: Holder) {
    if (holder !== h || !h.valid || stopped) {
      h.denial = stopped ? 'CLOSED' : 'INVALID_TOKEN';
      fail(h.denial);
    }
    try {
      location(dataRoot);
      owned();
    } catch {
      h.denial = 'OWNER_REVOKED';
      fail('OWNER_REVOKED');
    }
    if (holder !== h || !h.valid || stopped) {
      h.denial = stopped ? 'CLOSED' : 'INVALID_TOKEN';
      fail(h.denial);
    }
  }
  function notify() {
    if (!holder) finishClose?.();
  }
  function drop(h: Holder) {
    h.valid = false;
    if (holder === h) holder = null;
    tokens.delete(h.token);
    notify();
  }
  function reserve(kind: Holder['kind']): Holder | Refusal {
    if (stopped) return refused('CLOSED');
    if (holder) return refused('BUSY');
    const h: Holder = {
      token: Object.freeze({}),
      kind,
      valid: true,
      inspection: null,
      pinned: null,
      denial: null,
    };
    holder = h;
    tokens.set(h.token, h);
    try {
      check(h);
      return h;
    } catch (error) {
      drop(h);
      return refused(classify(error));
    }
  }
  function exact(token: unknown, kind: Holder['kind']): Holder | null {
    if (!token || typeof token !== 'object') return null;
    const h = tokens.get(token);
    return h && h === holder && h.kind === kind ? h : null;
  }
  async function inspect(h: Holder): Promise<ReadResult> {
    try {
      check(h);
      try {
        await lstat(join(dataRoot, 'platform-tools-runtime'));
      } catch (error) {
        check(h);
        const d =
          error && typeof error === 'object'
            ? Object.getOwnPropertyDescriptor(error, 'code')
            : null;
        if (d && 'value' in d && d.value === 'ENOENT') fail('BINARY_UNAVAILABLE');
        throw error;
      }
      check(h);
      const ledger = createPlatformToolsProvisionLedger({
        dataRoot,
        storeId,
        assertOwnedSync: () => check(h),
        acceptedCandidates: PLATFORM_TOOLS_KNOWN_CANDIDATES.map((entry) => ({
          manifestSha256: entry.manifestSha256,
          archiveSha256: entry.candidate.archive.sha256,
        })),
      });
      const before = await ledger.readState();
      check(h);
      const files = createPlatformToolsProvisionFiles({
        dataRoot,
        assertOwnedSync: () => check(h),
      });
      await files.scan(before.operations, () => check(h));
      check(h);
      if (before.activeSha256 === null) {
        const unchanged = await ledger.readState();
        check(h);
        if (JSON.stringify(unchanged) !== JSON.stringify(before)) fail('RECOVERY_REQUIRED');
        fail('BINARY_UNAVAILABLE');
      }
      const selected = resolvePlatformToolsCandidate(before.activeSha256);
      if (
        !selected?.launchAllowed ||
        !Number.isSafeInteger(before.revision) ||
        before.revision <= 0 ||
        Object.is(before.revision, -0)
      )
        fail('RECOVERY_REQUIRED');
      const pinned = JSON.stringify(before);
      if (h.pinned !== null && h.pinned !== pinned) fail('RECOVERY_REQUIRED');
      await files.verifyRuntime(() => check(h), selected);
      check(h);
      const after = await ledger.readState();
      check(h);
      if (JSON.stringify(after) !== pinned) fail('RECOVERY_REQUIRED');
      h.pinned = pinned;
      return Object.freeze({
        ok: true,
        status: 'READ_VERIFIED_ONLY',
        token: h.token,
        observation: Object.freeze({
          release: selected.candidate.release,
          archiveSha256: selected.candidate.archive.sha256,
          manifestSha256: selected.manifestSha256,
          installationRevision: before.revision,
          adbPath: join(
            dataRoot,
            'platform-tools-runtime',
            'runtimes',
            'runtime-' + before.activeSha256,
            'adb.exe',
          ),
        }),
      });
    } catch (error) {
      h.valid = false;
      return refused(h.denial ?? classify(error));
    }
  }
  function run(h: Holder, fresh: boolean): Promise<ReadResult> {
    const pending = inspect(h);
    h.inspection = pending;
    return pending.then(
      (value) => {
        let result = value;
        if (value.ok) {
          try {
            check(h);
          } catch (error) {
            h.valid = false;
            result = refused(h.denial ?? classify(error));
          }
        }
        h.inspection = null;
        if (fresh && !result.ok) drop(h);
        notify();
        return result;
      },
      () => {
        h.inspection = null;
        h.valid = false;
        if (fresh) drop(h);
        notify();
        return refused('RECOVERY_REQUIRED');
      },
    );
  }
  return Object.freeze({
    reserveSetup(): Readonly<{ ok: true; token: RuntimeCustodyToken }> | Refusal {
      const h = reserve('SETUP');
      return 'ok' in h ? h : Object.freeze({ ok: true, token: h.token });
    },
    assertSetup(token: unknown): void {
      const h = exact(token, 'SETUP');
      if (!h) fail('INVALID_TOKEN');
      check(h);
    },
    releaseSetup(token: unknown, completed: unknown): Retirement {
      const h = exact(token, 'SETUP');
      if (!h || typeof completed !== 'boolean') return refused('INVALID_TOKEN');
      if (!completed) {
        stopped = true;
        h.valid = false;
        return retired('UNRETIRED');
      }
      drop(h);
      return retired('RETIRED');
    },
    assertRead(token: unknown): void {
      const h = exact(token, 'READ');
      if (!h?.pinned || h.inspection) fail('INVALID_TOKEN');
      check(h);
    },
    // Internal-only final fence: no owner/location callbacks and no new observation.
    assertReadInternal(token: unknown): void {
      const h = exact(token, 'READ');
      if (!h?.pinned || h.inspection || !h.valid || stopped) fail('INVALID_TOKEN');
    },
    acquireRead(): Promise<ReadResult> {
      const h = reserve('READ');
      return 'ok' in h ? Promise.resolve(h) : run(h, true);
    },
    revalidateRead(token: unknown): Promise<ReadResult> {
      const h = exact(token, 'READ');
      if (!h?.valid) return Promise.resolve(refused('INVALID_TOKEN'));
      if (h.inspection) return Promise.resolve(refused('BUSY'));
      if (stopped) return Promise.resolve(refused('CLOSED'));
      return run(h, false);
    },
    async releaseRead(token: unknown): Promise<Retirement> {
      const h = exact(token, 'READ');
      if (!h) return refused('INVALID_TOKEN');
      h.valid = false;
      if (h.inspection) await h.inspection;
      if (exact(token, 'READ') !== h) return refused('INVALID_TOKEN');
      drop(h);
      return retired('RETIRED');
    },
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      if (closing) return closing;
      stopped = true;
      if (holder) holder.valid = false;
      closing = new Promise((resolveClose) => {
        if (!holder) {
          resolveClose('RETIRED');
          return;
        }
        const timer = setTimeout(() => {
          finishClose = null;
          resolveClose('UNRETIRED');
        }, 120000);
        finishClose = () => {
          clearTimeout(timer);
          finishClose = null;
          resolveClose('RETIRED');
        };
      });
      return closing;
    },
    get retired() {
      return holder === null;
    },
  });
}
export type PlatformToolsRuntimeCustody = ReturnType<typeof createPlatformToolsRuntimeCustody>;
