// Private core only. No production recipient issuer, downloader, IPC or executable activation.
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
import { snapshotPlatformToolsArchive } from './platform-tools-archive.ts';
import { createPlatformToolsProvisionLedger } from './platform-tools-provision-ledger.ts';
import { createPlatformToolsProvisionFiles } from './platform-tools-provision-files.ts';
export const PROVISION_CODES = [
  'INVALID_REQUEST',
  'TERMS_REQUIRED',
  'TERMS_DECLINED',
  'OWNER_REVOKED',
  'BUSY',
  'STALE_REVISION',
  'LIMIT_EXCEEDED',
  'ARCHIVE_REJECTED',
  'DOWNLOAD_FAILED',
  'STORAGE_FAILED',
  'OUTCOME_UNKNOWN',
  'RECOVERY_REQUIRED',
] as const;
export type ProvisionCode = (typeof PROVISION_CODES)[number];
export type RecipientDecision = Readonly<{
  decisionId: string;
  accepted: boolean;
  route: 'OFFICIAL_DOWNLOAD' | 'LOCAL_ARCHIVE' | 'RETAINED_RUNTIME';
  archivePath: string | null;
}>;
export type ProvisionResult =
  | Readonly<{
      ok: true;
      status: 'VERIFIED_LOCAL';
      revision: number;
      archiveSha256: string;
      manifestSha256: string;
    }>
  | Readonly<{ ok: false; outcome: 'NOT_ACTIVATED' | 'OUTCOME_UNKNOWN'; code: ProvisionCode }>;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const manifestSha256 = createHash('sha256')
  .update(JSON.stringify(PLATFORM_TOOLS_CANDIDATE))
  .digest('hex');
function decision(value: unknown): RecipientDecision | null {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== 4
    )
      return null;
    const out: Record<string, unknown> = {};
    for (const k of ['decisionId', 'accepted', 'route', 'archivePath']) {
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (!d || !('value' in d) || !d.enumerable) return null;
      out[k] = d.value;
    }
    if (
      !uuid(out.decisionId) ||
      typeof out.accepted !== 'boolean' ||
      !['OFFICIAL_DOWNLOAD', 'LOCAL_ARCHIVE', 'RETAINED_RUNTIME'].includes(out.route as string) ||
      (out.route === 'LOCAL_ARCHIVE'
        ? typeof out.archivePath !== 'string' ||
          out.archivePath.length > 32768 ||
          out.archivePath !== resolve(out.archivePath)
        : out.archivePath !== null)
    )
      return null;
    return Object.freeze(out) as RecipientDecision;
  } catch {
    return null;
  }
}
function failure(code: ProvisionCode, unknown = false): ProvisionResult {
  return Object.freeze({ ok: false, outcome: unknown ? 'OUTCOME_UNKNOWN' : 'NOT_ACTIVATED', code });
}
function known(error: unknown): ProvisionCode {
  try {
    const d =
      error && typeof error === 'object'
        ? Object.getOwnPropertyDescriptor(error, 'message')
        : undefined;
    return d && 'value' in d && PROVISION_CODES.includes(d.value) ? d.value : 'STORAGE_FAILED';
  } catch {
    return 'STORAGE_FAILED';
  }
}
async function selectedArchive(file: string, admit: () => void) {
  admit();
  const before = await lstat(file);
  admit();
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size !== PLATFORM_TOOLS_CANDIDATE.archive.bytes ||
    (await realpath(file)) !== file
  )
    throw Error('ARCHIVE_REJECTED');
  admit();
  const h = await open(file, 'r');
  try {
    const s = await h.stat();
    admit();
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.dev !== before.dev ||
      s.ino !== before.ino ||
      s.size !== before.size
    )
      throw Error('ARCHIVE_REJECTED');
    const raw = Buffer.alloc(PLATFORM_TOOLS_CANDIDATE.archive.bytes + 1);
    let used = 0;
    while (used < raw.length) {
      const r = await h.read(raw, used, raw.length - used, used);
      admit();
      if (!r.bytesRead) break;
      used += r.bytesRead;
    }
    if (used !== PLATFORM_TOOLS_CANDIDATE.archive.bytes) throw Error('ARCHIVE_REJECTED');
    admit();
    const after = await h.stat();
    if (
      after.size !== s.size ||
      after.mtimeMs !== s.mtimeMs ||
      after.ctimeMs !== s.ctimeMs ||
      after.nlink !== 1
    )
      throw Error('ARCHIVE_REJECTED');
    return snapshotPlatformToolsArchive(raw.subarray(0, used));
  } finally {
    await h.close();
  }
}
export function createPlatformToolsProvisioner(
  options: Readonly<{
    dataRoot: string;
    storeId: string;
    assertOwnedSync: () => void;
    assertIdleSync: () => void;
    assertDataLocation: (path: string) => void;
    clock: () => number;
    newId: () => string;
    recipient: Readonly<{
      read: (grant: unknown) => unknown;
      isCurrent: (grant: unknown, decisionId: string) => boolean;
    }>;
    readOfficialArchive?: (signal: AbortSignal) => Promise<unknown>;
  }>,
) {
  const dataRoot = options.dataRoot,
    storeId = options.storeId,
    owned = options.assertOwnedSync.bind(options),
    idle = options.assertIdleSync.bind(options),
    location = options.assertDataLocation.bind(options),
    clock = options.clock.bind(options),
    newId = options.newId.bind(options),
    readDecision = options.recipient.read.bind(options.recipient),
    currentDecision = options.recipient.isCurrent.bind(options.recipient),
    fetch = options.readOfficialArchive?.bind(options);
  location(dataRoot);
  owned();
  let closed = false,
    uncertain = false,
    active: Promise<unknown> | null = null,
    sequence = 0,
    laneTaken = false,
    activeAbort: AbortController | null = null,
    closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  const ledger = createPlatformToolsProvisionLedger({
      dataRoot: dataRoot,
      storeId: storeId,
      assertOwnedSync: () => {
        location(dataRoot);
        owned();
        if (closed || uncertain) throw Error('OWNER_REVOKED');
      },
      acceptedCandidates: [
        { manifestSha256, archiveSha256: PLATFORM_TOOLS_CANDIDATE.archive.sha256 },
      ],
    }),
    files = createPlatformToolsProvisionFiles({ dataRoot: dataRoot, assertOwnedSync: owned });
  const ids = new Set<string>();
  function owner() {
    try {
      location(dataRoot);
      owned();
    } catch {
      throw Error('OWNER_REVOKED');
    }
    if (closed) throw Error('OWNER_REVOKED');
    if (uncertain) throw Error('RECOVERY_REQUIRED');
  }
  return Object.freeze({
    status(): Promise<
      Readonly<{
        status: 'NOT_PROVISIONED' | 'VERIFIED_LOCAL' | 'RECOVERY_REQUIRED';
        revision: number | null;
        archiveSha256: string | null;
      }>
    > {
      if (laneTaken || active)
        return Promise.resolve(
          Object.freeze({ status: 'RECOVERY_REQUIRED', revision: null, archiveSha256: null }),
        );
      laneTaken = true;
      const pending = (async () => {
        try {
          owner();
          try {
            await lstat(join(dataRoot, 'platform-tools-runtime'));
          } catch (e) {
            if ((e as { code?: string }).code === 'ENOENT') {
              owner();
              return Object.freeze({ status: 'NOT_PROVISIONED', revision: 0, archiveSha256: null });
            }
            throw e;
          }
          const state = await ledger.readState();
          owner();
          await files.scan(state.operationIds, owner);
          if (state.activeSha256 === null)
            return Object.freeze({
              status: 'NOT_PROVISIONED',
              revision: state.revision,
              archiveSha256: null,
            });
          await files.verifyRuntime(owner);
          owner();
          return Object.freeze({
            status: 'VERIFIED_LOCAL',
            revision: state.revision,
            archiveSha256: state.activeSha256,
          });
        } catch {
          return Object.freeze({
            status: 'RECOVERY_REQUIRED',
            revision: null,
            archiveSha256: null,
          });
        } finally {
          laneTaken = false;
        }
      })();
      active = pending;
      void pending.then(
        () => {
          if (active === pending) active = null;
        },
        () => {
          if (active === pending) active = null;
        },
      );
      return pending;
    },
    run(
      grant: unknown,
      expectedRevision: number,
      kind: 'INSTALL' | 'ROLLBACK' = 'INSTALL',
    ): Promise<ProvisionResult> {
      if (closed) return Promise.resolve(failure('OWNER_REVOKED'));
      if (uncertain) return Promise.resolve(failure('RECOVERY_REQUIRED'));
      if (laneTaken || active) return Promise.resolve(failure('BUSY'));
      if (!integer(expectedRevision) || !['INSTALL', 'ROLLBACK'].includes(kind))
        return Promise.resolve(failure('INVALID_REQUEST'));
      laneTaken = true;
      const early = (code: ProvisionCode) => {
        laneTaken = false;
        return Promise.resolve(failure(code));
      };
      let accepted: RecipientDecision | null, start: number;
      try {
        owner();
        accepted = decision(readDecision(grant));
        if (!accepted) return early('TERMS_REQUIRED');
        if (!accepted.accepted) return early('TERMS_DECLINED');
        if ((kind === 'ROLLBACK') !== (accepted.route === 'RETAINED_RUNTIME'))
          return early('INVALID_REQUEST');
        start = clock();
        if (!integer(start)) return early('INVALID_REQUEST');
      } catch {
        return early('OWNER_REVOKED');
      }
      const d = accepted,
        token = ++sequence,
        abort = new AbortController();
      activeAbort = abort;
      let timedOut = false,
        mutated = false,
        intended = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      function admit() {
        owner();
        try {
          idle();
        } catch {
          throw Error('BUSY');
        }
        const now = clock();
        owner();
        if (!integer(now) || now < start || now - start >= 120000) throw Error('OUTCOME_UNKNOWN');
        if (currentDecision(grant, d.decisionId) !== true) throw Error('TERMS_REQUIRED');
        owner();
        try {
          idle();
        } catch {
          throw Error('BUSY');
        }
        if (currentDecision(grant, d.decisionId) !== true) throw Error('TERMS_REQUIRED');
        owner();
        if (closed || uncertain || token !== sequence || timedOut) throw Error('OWNER_REVOKED');
      }
      let operation: Awaited<ReturnType<typeof ledger.begin>> | undefined;
      const task = Promise.resolve().then(async (): Promise<ProvisionResult> => {
        try {
          admit();
          await ledger.initialize();
          admit();
          let state = await ledger.readState();
          admit();
          await files.scan(state.operationIds, admit);
          if (state.revision !== expectedRevision) throw Error('STALE_REVISION');
          if (
            kind === 'INSTALL' &&
            state.activeSha256 === PLATFORM_TOOLS_CANDIDATE.archive.sha256
          ) {
            await files.verifyRuntime(admit);
            admit();
            return Object.freeze({
              ok: true,
              status: 'VERIFIED_LOCAL',
              revision: state.revision,
              archiveSha256: state.activeSha256,
              manifestSha256,
            });
          }
          if (state.revision >= 128 || ids.size >= 128) throw Error('LIMIT_EXCEEDED');
          const operationId = newId();
          admit();
          if (
            !uuid(operationId) ||
            ids.has(operationId) ||
            state.operationIds.includes(operationId) ||
            operationId === d.decisionId
          )
            throw Error('INVALID_REQUEST');
          ids.add(operationId);
          if (
            kind === 'ROLLBACK' &&
            (state.previousActiveSha256 === null ||
              state.previousActiveSha256 !== PLATFORM_TOOLS_CANDIDATE.archive.sha256)
          )
            throw Error('RECOVERY_REQUIRED');
          operation = await ledger.begin(expectedRevision, {
            operationId,
            kind,
            route: d.route,
            manifestSha256,
            archiveSha256: PLATFORM_TOOLS_CANDIDATE.archive.sha256,
            recipientDecisionId: d.decisionId,
          });
          intended = true;
          admit();
          state = await ledger.readPending(operation);
          admit();
          if (kind === 'INSTALL') {
            let archive: unknown;
            try {
              archive =
                d.route === 'LOCAL_ARCHIVE'
                  ? await selectedArchive(d.archivePath as string, admit)
                  : fetch
                    ? await fetch(abort.signal)
                    : (() => {
                        throw Error('DOWNLOAD_FAILED');
                      })();
            } catch (e) {
              if (known(e) === 'STORAGE_FAILED') throw Error('DOWNLOAD_FAILED');
              throw e;
            }
            admit();
            await files.stageAndPublish(operationId, archive, state.operationIds, admit, () => {
              mutated = true;
            });
            admit();
          } else await files.verifyRuntime(admit);
          await files.scan(state.operationIds, admit);
          await files.verifyRuntime(admit);
          admit();
          const settled = await ledger.settle(operation, 'ACTIVATED', admit);
          admit();
          return Object.freeze({
            ok: true,
            status: 'VERIFIED_LOCAL',
            revision: settled.revision,
            archiveSha256: PLATFORM_TOOLS_CANDIDATE.archive.sha256,
            manifestSha256,
          });
        } catch (e) {
          const code = known(e);
          if (
            operation &&
            intended &&
            !mutated &&
            !timedOut &&
            ['ARCHIVE_REJECTED', 'DOWNLOAD_FAILED', 'LIMIT_EXCEEDED'].includes(code)
          ) {
            try {
              admit();
              await ledger.settle(operation, 'NOT_ACTIVATED', admit);
              admit();
              return failure(code);
            } catch {
              uncertain = true;
              return failure('OUTCOME_UNKNOWN', true);
            }
          }
          if (intended || mutated || code === 'OUTCOME_UNKNOWN') {
            uncertain = true;
            return failure('OUTCOME_UNKNOWN', true);
          }
          return failure(code);
        }
      });
      active = task;
      const timeout = new Promise<ProvisionResult>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          uncertain = true;
          abort.abort();
          resolve(failure('OUTCOME_UNKNOWN', true));
        }, 120000);
      });
      void task.finally(() => {
        if (timer !== undefined) clearTimeout(timer);
        if (active === task) {
          active = null;
          laneTaken = false;
          activeAbort = null;
        }
      });
      return Promise.race([task, timeout]);
    },
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      if (closing) return closing;
      closed = true;
      ++sequence;
      activeAbort?.abort();
      const pending = active;
      if (!pending) {
        closing = Promise.resolve('RETIRED');
        return closing;
      }
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            pending.then(() => 'RETIRED' as const),
            new Promise<'UNRETIRED'>((resolve) => {
              timer = setTimeout(() => {
                uncertain = true;
                resolve('UNRETIRED');
              }, 120000);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get retired() {
      return active === null && !laneTaken;
    },
  });
}
