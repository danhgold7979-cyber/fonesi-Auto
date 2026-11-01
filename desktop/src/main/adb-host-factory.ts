/** Fixed VERSION-only private native transport. Not installed in production main. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { createHostAdapter } from './adb-host-adapter.ts';
import { createHostBridge } from './adb-host-bridge.ts';
import type {
  PlatformToolsRuntimeCustody,
  RuntimeReadObservation,
} from './platform-tools-runtime-custody.ts';
import type { PersistenceEntry } from './persistence-entry.ts';
import { resolvePlatformToolsCandidate } from './platform-tools-catalog.ts';
import {
  HOST_ASSETS,
  hostHash,
  hostUuid,
  hostNames,
  hostWrite,
  readHostContext,
  createHostRoot,
  assertHostPathBudget,
  cleanupHostRoot,
} from './adb-host-context.ts';
type Bindings = Readonly<{
  platform: string;
  parentPid: number;
  systemRoot: string;
  spawn(
    executable: string,
    args: readonly string[],
    options: Parameters<typeof spawn>[2],
  ): ChildProcessWithoutNullStreams;
}>;
const realBindings = (): Bindings => ({
  platform: process.platform,
  parentPid: process.pid,
  systemRoot: process.env.SystemRoot ?? '',
  spawn: (exe, args, options) => spawn(exe, [...args], options) as ChildProcessWithoutNullStreams,
});
function fail(): never {
  throw Error('HOST_FACTORY_REJECTED');
}
// Windows servicing may hardlink this fixed OS executable. Owned files still use hostPlain.
function systemExecutable(path: string) {
  const s = lstatSync(path);
  if (
    resolve(path) !== path ||
    !s.isFile() ||
    s.isSymbolicLink() ||
    realpathSync.native(path) !== path ||
    s.size < 1 ||
    s.size > 512 * 1024 * 1024
  )
    fail();
  return Object.freeze({ dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs });
}
const BOOTSTRAP_PROGRESS = [
  'ENVIRONMENT',
  'CONTEXT',
  'ASSETS',
  'COMPILE_BEGIN',
  'COMPILE_END',
  'PARENT_BEGIN',
  'PARENT_END',
  'READER',
  'CLOSE',
] as const;
const OTHER_PROGRESS = [
  'READER_REQUEST_ACCEPTED',
  'READER_PROVIDER_ENTERED',
  'READER_RESPONSE_WRITE',
  'READER_RESPONSE_FLUSH',
  'NATIVE_ADMISSION',
  'NATIVE_LAUNCH',
  'NATIVE_LAUNCH_END',
  'NATIVE_EXIT',
  'NATIVE_RETIRE_BEGIN',
  'NATIVE_RETIRE_END',
] as const;
const COMPILE_IDS = [
  'SOURCE_CODE_ERROR',
  'COMPILER_ERRORS',
  'ASSEMBLY_NOT_FOUND',
  'ASSEMBLY_LOAD_ERRORS',
  'COMMAND_NOT_FOUND',
  'PARAMETER_BINDING',
  'OTHER',
] as const;
const COMPILE_TYPES = [
  'IO',
  'PATH_TOO_LONG',
  'ACCESS',
  'WIN32',
  'EXTERNAL',
  'DIRECTORY_NOT_FOUND',
  'INVALID_OPERATION',
  'ARGUMENT',
  'FILE_NOT_FOUND',
  'FILE_LOAD',
  'BAD_IMAGE',
  'CMDLET',
  'COMMAND_NOT_FOUND',
  'PARAMETER_BINDING',
  'OTHER',
  'NONE',
] as const;
const TEMP_REASONS = [
  'UNAVAILABLE',
  'ACCESS',
  'PATH_TOO_LONG',
  'NOT_FOUND',
  'DISK_FULL',
  'BUFFER_TOO_SMALL',
  'INVALID_NAME',
  'OTHER',
] as const;
const TEMP_RELATIONS = ['UNAVAILABLE', 'PROFILE', 'RUN', 'OTHER', 'EMPTY'] as const;
const TEMP_LENGTHS = ['UNAVAILABLE', 'LE247', 'FROM248_TO259', 'GE260', 'EMPTY'] as const;
type CompileFailure = Readonly<{
  id: (typeof COMPILE_IDS)[number];
  type: (typeof COMPILE_TYPES)[number];
  inner: (typeof COMPILE_TYPES)[number];
  cs: string;
  tempReason: string;
  tempRelation: (typeof TEMP_RELATIONS)[number];
  tempLength: (typeof TEMP_LENGTHS)[number];
}>;
function compileFrame(line: string): CompileFailure | null {
  const parts = line.split('|');
  if (parts.length !== 8 || parts[0] !== 'HOST_BOOTSTRAP_COMPILE_ERROR') return null;
  const [, id, type, inner, cs, tempReason, tempRelation, tempLength] = parts;
  if (
    !COMPILE_IDS.some((v) => v === id) ||
    !COMPILE_TYPES.some((v) => v === type) ||
    !COMPILE_TYPES.some((v) => v === inner) ||
    !(
      typeof cs === 'string' &&
      (cs === 'OTHER' || cs === 'NONE' || (cs.length === 6 && /^CS[0-9]{4}$/.test(cs)))
    )
  )
    return null;
  if (
    !(
      TEMP_REASONS.some((v) => v === tempReason) ||
      (typeof tempReason === 'string' &&
        /^WIN32_0[0-4][0-9]{2}$/.test(tempReason) &&
        tempReason.length === 10 &&
        tempReason !== 'WIN32_0000')
    ) ||
    !TEMP_RELATIONS.some((v) => v === tempRelation) ||
    !TEMP_LENGTHS.some((v) => v === tempLength)
  )
    return null;
  const unavailable = [tempReason, tempRelation, tempLength].every((v) => v === 'UNAVAILABLE');
  if (
    !unavailable &&
    (cs !== 'CS1619' ||
      [tempReason, tempRelation, tempLength].some((v) => v === 'UNAVAILABLE') ||
      (tempRelation === 'EMPTY') !== (tempLength === 'EMPTY'))
  )
    return null;
  return Object.freeze({
    id,
    type,
    inner,
    cs,
    tempReason,
    tempRelation,
    tempLength,
  }) as CompileFailure;
}
const observationKey = (o: RuntimeReadObservation) =>
  JSON.stringify([o.release, o.archiveSha256, o.manifestSha256, o.installationRevision, o.adbPath]);
export function createHostFactory(
  options: Readonly<{
    entry: PersistenceEntry;
    launchRoot: string;
    desktopRoot: string;
    runtimeCustody: PlatformToolsRuntimeCustody;
    expectedInstallationRevision?: number;
    assertOwnedSync(): void;
    now(): number;
    diagnosticId(): string;
  }>,
  bindings: Bindings = realBindings(),
) {
  const entry = Object.freeze({ ...options.entry }),
    launchRoot = options.launchRoot,
    desktopRoot = options.desktopRoot;
  const owned = options.assertOwnedSync.bind(options),
    clock = options.now.bind(options),
    diagnostic = options.diagnosticId.bind(options);
  const expectedInstallationRevision = options.expectedInstallationRevision;
  if (
    expectedInstallationRevision !== undefined &&
    (!Number.isSafeInteger(expectedInstallationRevision) || expectedInstallationRevision < 1)
  )
    fail();
  const custody = options.runtimeCustody,
    start = bindings.spawn.bind(bindings),
    parentPid = bindings.parentPid,
    systemRoot = bindings.systemRoot;
  if (bindings.platform !== 'win32' || resolve(systemRoot) !== systemRoot) fail();
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const systemIdentity = systemExecutable(powershell);
  owned();
  const context = readHostContext(entry, launchRoot, desktopRoot, parentPid),
    sessionId = randomUUID();
  if (hostNames(launchRoot).some((n) => n === '.host-session' || n.startsWith('host-session')))
    fail();
  if (!hostUuid(sessionId)) fail();
  const nativePaths = Object.freeze([
    ...HOST_ASSETS.map((name) => join(desktopRoot, name)),
    context.receipt.parentImagePath,
  ]);
  assertHostPathBudget(launchRoot, sessionId, undefined, nativePaths);
  let stopped = false,
    broken = false,
    clean = false,
    child: ChildProcessWithoutNullStreams | null = null;
  let readToken: object | null = null,
    liveObservation: RuntimeReadObservation | null = null,
    pinned: string | null = null;
  let root: ReturnType<typeof createHostRoot> | null = null,
    bootstrap = '',
    inputEnded = false,
    inputEndSent = false,
    stderrBytes = 0;
  let diagnosticLine = '',
    helperPhase: string | null = null,
    phaseCount = 0;
  let compileFailure: CompileFailure | null = null,
    compileFrames = 0;
  const progress = new Set<string>();
  let bootstrapProgress = 0,
    requestWriteCompleted = false;
  let writes = 0,
    childResult: { code: number | null; signal: string | null } | null = null;
  let resolveChild: (() => void) | null = null;
  const childDone = new Promise<void>((r) => {
    resolveChild = r;
  });
  let receive: ((bytes: Uint8Array) => void) | null = null,
    ended: (() => void) | null = null;
  function fence() {
    owned();
    const again = readHostContext(entry, launchRoot, desktopRoot, parentPid);
    if (
      again.launchOwner !== context.launchOwner ||
      again.launchDev !== context.launchDev ||
      again.launchIno !== context.launchIno ||
      again.receiptSha256 !== context.receiptSha256 ||
      JSON.stringify(again.assets) !== JSON.stringify(context.assets)
    )
      fail();
    owned();
  }
  function currentRuntime(o: RuntimeReadObservation) {
    const descriptors = Object.getOwnPropertyDescriptors(o);
    const keys = ['release', 'archiveSha256', 'manifestSha256', 'installationRevision', 'adbPath'];
    if (
      !Object.isFrozen(o) ||
      Reflect.ownKeys(descriptors).length !== keys.length ||
      keys.some((k) => !descriptors[k] || !('value' in descriptors[k]))
    )
      fail();
    const selected = resolvePlatformToolsCandidate(o.archiveSha256);
    if (
      !selected?.launchAllowed ||
      o.release !== selected.candidate.release ||
      o.manifestSha256 !== selected.manifestSha256 ||
      !Number.isSafeInteger(o.installationRevision) ||
      o.installationRevision < 1 ||
      (expectedInstallationRevision !== undefined &&
        o.installationRevision !== expectedInstallationRevision) ||
      o.adbPath !==
        join(
          entry.root,
          'platform-tools-runtime',
          'runtimes',
          'runtime-' + o.archiveSha256,
          'adb.exe',
        )
    )
      fail();
    if (
      stopped ||
      broken ||
      !readToken ||
      !liveObservation ||
      observationKey(o) !== observationKey(liveObservation)
    )
      fail();
    custody.assertRead(readToken);
    fence();
    custody.assertRead(readToken);
    owned();
    if (stopped || broken || !readToken || observationKey(o) !== observationKey(liveObservation))
      fail();
    if (pinned !== null && pinned !== observationKey(o)) fail();
    assertHostPathBudget(launchRoot, sessionId, o.adbPath, nativePaths);
  }
  function closeInput() {
    inputEnded = true;
    if (!child || inputEndSent) return;
    inputEndSent = true;
    try {
      child.stdin.end();
    } catch {
      broken = true;
    }
  }
  function channelFailure() {
    broken = true;
    closeInput();
    ended?.();
  }
  function initializeChild() {
    if (child) return;
    const o = liveObservation;
    if (!o) fail();
    currentRuntime(o);
    const selected = resolvePlatformToolsCandidate(o.archiveSha256);
    const exePin = selected?.candidate.files.find((f) => f.path === 'adb.exe')?.sha256;
    if (!selected?.launchAllowed || !exePin) fail();
    pinned = observationKey(o);
    root = createHostRoot(launchRoot, sessionId, entry.ownerToken, () => currentRuntime(o));
    bootstrap = JSON.stringify({
      version: 2,
      operationSet: 'VERSION_ONLY',
      sessionId,
      launchId: context.receipt.launchId,
      storeId: entry.storeId,
      ownerToken: entry.ownerToken,
      parentReceiptSha256: context.receiptSha256,
      readySha256: context.receipt.readySha256,
      runRoot: root.root,
      adbPath: o.adbPath,
      adbExeSha256: exePin,
      candidateArchiveSha256: o.archiveSha256,
      candidateManifestSha256: o.manifestSha256,
      installationRevision: o.installationRevision,
      expectedRelease: selected.versionObservation.release,
      expectedBuildGrammar: selected.versionObservation.buildGrammar,
      assets: context.assets,
    });
    hostWrite(join(root.root, 'bootstrap.json'), bootstrap, 8192, () => currentRuntime(o));
    const env: NodeJS.ProcessEnv = {
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      TEMP: join(root.root, 'profile'),
      TMP: join(root.root, 'profile'),
    };
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      join(desktopRoot, HOST_ASSETS[0]),
      join(root.root, 'bootstrap.json'),
      hostHash(bootstrap),
    ];
    currentRuntime(o);
    owned();
    const currentSystem = systemExecutable(powershell);
    if (
      currentSystem.dev !== systemIdentity.dev ||
      currentSystem.ino !== systemIdentity.ino ||
      currentSystem.size !== systemIdentity.size ||
      currentSystem.mtimeMs !== systemIdentity.mtimeMs
    )
      fail();
    if (stopped || broken) fail();
    child = start(powershell, args, {
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: root.root,
      env,
    });
    child.stdout.on('data', (bytes: Buffer) => {
      if (bytes.length > 65536) {
        channelFailure();
        return;
      }
      receive?.(bytes);
    });
    child.stderr.on('data', (bytes: Buffer) => {
      stderrBytes += bytes.length;
      if (stderrBytes > 65536) {
        channelFailure();
        return;
      }
      let rejected = false;
      for (const byte of bytes) {
        if (byte === 10) {
          const line = diagnosticLine.endsWith('\r') ? diagnosticLine.slice(0, -1) : diagnosticLine;
          const phase =
            /^HOST_BOOTSTRAP_PHASE_(ENVIRONMENT|CONTEXT|ASSETS|COMPILE|PARENT|READER|CLOSE)$/.exec(
              line,
            );
          const marker = /^HOST_(BOOTSTRAP|READER|NATIVE)_PROGRESS_([A-Z_]+)$/.exec(line);
          if (line.startsWith('HOST_BOOTSTRAP_COMPILE_ERROR')) {
            compileFrames++;
            compileFailure = compileFrames === 1 ? compileFrame(line) : null;
            if (compileFailure) helperPhase = 'COMPILE';
            rejected = true;
          } else if (phase) {
            phaseCount++;
            helperPhase = phaseCount === 1 ? (phase[1] ?? null) : null;
            rejected = true;
          } else if (marker) {
            const key = marker[1] + '_' + marker[2];
            const bootstrapMarker = marker[1] === 'BOOTSTRAP';
            const valid = bootstrapMarker
              ? marker[2] === BOOTSTRAP_PROGRESS[bootstrapProgress]
              : OTHER_PROGRESS.some((value) => value === key);
            if (!valid || progress.has(key) || progress.size >= 19) rejected = true;
            else {
              progress.add(key);
              if (bootstrapMarker) bootstrapProgress++;
            }
          } else rejected = true;
          diagnosticLine = '';
        } else if (byte < 128 && diagnosticLine.length < 1024) {
          diagnosticLine += String.fromCharCode(byte);
        } else {
          rejected = true;
        }
      }
      if (rejected) channelFailure();
    });
    child.on('error', channelFailure);
    child.stdout.on('error', channelFailure);
    child.stderr.on('error', channelFailure);
    child.stdin.on('error', channelFailure);
    child.on('close', (code, signal) => {
      childResult = { code, signal };
      resolveChild?.();
      resolveChild = null;
      ended?.();
    });
    if (inputEnded || stopped || broken) closeInput();
  }
  const tracked = {
    async acquireRead() {
      const r = await custody.acquireRead();
      if (r.ok) {
        readToken = r.token;
        liveObservation = r.observation;
      }
      return r;
    },
    async revalidateRead(token: object) {
      const r = await custody.revalidateRead(token);
      if (r.ok) {
        readToken = r.token;
        liveObservation = r.observation;
      }
      return r;
    },
    assertRead(token: object) {
      custody.assertRead(token);
      if (
        expectedInstallationRevision !== undefined &&
        liveObservation?.installationRevision !== expectedInstallationRevision
      )
        fail();
    },
    async releaseRead(token: object) {
      const r = await custody.releaseRead(token);
      if (r.ok && r.status === 'RETIRED' && readToken === token) {
        readToken = null;
        liveObservation = null;
      }
      return r;
    },
  };
  const bridge = createHostBridge({
    sessionId,
    newAttemptId: randomUUID,
    assertRuntime: currentRuntime,
    transport: {
      subscribe(c, e) {
        if (receive || ended) fail();
        receive = c;
        ended = e;
      },
      write(bytes) {
        return new Promise<void>((accept, reject) => {
          try {
            if (broken || inputEnded || writes >= 2 || bytes.length > 65536) fail();
            initializeChild();
            if (!child || broken || inputEnded) fail();
            writes++;
            child.stdin.write(Buffer.from(bytes), (error?: Error | null) => {
              writes--;
              if (error) {
                channelFailure();
                reject(Error('HOST_FACTORY_REJECTED'));
              } else {
                requestWriteCompleted = true;
                accept();
              }
            });
          } catch {
            channelFailure();
            reject(Error('HOST_FACTORY_REJECTED'));
          }
        });
      },
      requestCleanup: closeInput,
    },
  });
  const provider = Object.freeze({
    ...bridge.provider,
    reserveAttempt(kind: 'VERSION' | 'FOREGROUND') {
      if (kind !== 'VERSION') fail();
      if (
        !child &&
        hostNames(launchRoot).some((n) => n === '.host-session' || n.startsWith('host-session'))
      )
        fail();
      return bridge.provider.reserveAttempt(kind);
    },
  });
  const adapter = createHostAdapter({
    runtimeCustody: tracked,
    nativeProvider: provider,
    assertOwnedSync: fence,
    now: clock,
    diagnosticId: diagnostic,
  });
  let closing: Promise<'RETIRED' | 'UNRETIRED'> | null = null;
  return Object.freeze({
    grant: adapter.grant,
    execute: adapter.execute,
    close(): Promise<'RETIRED' | 'UNRETIRED'> {
      if (closing) return closing;
      stopped = true;
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const work = (async (): Promise<'RETIRED' | 'UNRETIRED'> => {
          const a = await adapter.close();
          bridge.close();
          if (child) await childDone;
          if (
            a !== 'RETIRED' ||
            writes !== 0 ||
            (child &&
              (childResult?.code !== 0 || childResult.signal !== null || diagnosticLine !== '')) ||
            broken
          )
            return 'UNRETIRED';
          if (root) {
            fence();
            cleanupHostRoot(root, bootstrap, owned);
          }
          clean = true;
          return 'RETIRED';
        })().catch(() => 'UNRETIRED' as const);
        try {
          return await Promise.race([
            work,
            new Promise<'UNRETIRED'>((r) => {
              timer = setTimeout(() => r('UNRETIRED'), 120000);
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get retired() {
      return clean;
    },
    get evidence() {
      return Object.freeze({
        helperState: broken
          ? 'UNCERTAIN'
          : childResult
            ? 'EXITED'
            : child
              ? 'RUNNING'
              : 'NOT_STARTED',
        phase: helperPhase,
        compileFailure,
        progress: Object.freeze([...progress]),
        requestWriteCompleted,
        exit: childResult ? (childResult.code === 0 ? 'ZERO' : 'NONZERO') : 'NONE',
        directoryCleanup: clean,
      });
    },
  });
}
