/** Fixed VERSION-only private native transport. Not installed in production main. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHostAdapter } from './adb-host-adapter.ts';
import { createHostBridge } from './adb-host-bridge.ts';
import type {
  PlatformToolsRuntimeCustody,
  RuntimeReadObservation,
} from './platform-tools-runtime-custody.ts';
import type { PersistenceEntry } from './persistence-entry.ts';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
import {
  HOST_ASSETS,
  hostHash,
  hostUuid,
  hostPlain,
  hostNames,
  hostWrite,
  readHostContext,
  createHostRoot,
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
const observationKey = (o: RuntimeReadObservation) =>
  JSON.stringify([o.release, o.archiveSha256, o.manifestSha256, o.installationRevision, o.adbPath]);
export function createHostFactory(
  options: Readonly<{
    entry: PersistenceEntry;
    launchRoot: string;
    desktopRoot: string;
    runtimeCustody: PlatformToolsRuntimeCustody;
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
  const custody = options.runtimeCustody,
    start = bindings.spawn.bind(bindings),
    parentPid = bindings.parentPid,
    systemRoot = bindings.systemRoot;
  if (bindings.platform !== 'win32' || resolve(systemRoot) !== systemRoot) fail();
  const powershell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  hostPlain(powershell);
  owned();
  const context = readHostContext(entry, launchRoot, desktopRoot, parentPid),
    sessionId = randomUUID();
  if (hostNames(launchRoot).some((n) => n.startsWith('host-session'))) fail();
  const exePin = PLATFORM_TOOLS_CANDIDATE.files.find((f) => f.path === 'adb.exe')?.sha256;
  if (!exePin || !hostUuid(sessionId)) fail();
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
    if (
      o.release !== '37.0.1' ||
      o.archiveSha256 !== PLATFORM_TOOLS_CANDIDATE.archive.sha256 ||
      o.manifestSha256 !== hostHash(JSON.stringify(PLATFORM_TOOLS_CANDIDATE)) ||
      !Number.isSafeInteger(o.installationRevision) ||
      o.installationRevision < 1 ||
      o.adbPath !==
        join(
          entry.root,
          'platform-tools-runtime',
          'runtimes',
          'runtime-' + PLATFORM_TOOLS_CANDIDATE.archive.sha256,
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
    pinned = observationKey(o);
    root = createHostRoot(launchRoot, sessionId, entry.ownerToken, () => currentRuntime(o));
    bootstrap = JSON.stringify({
      version: 1,
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
    hostPlain(powershell);
    owned();
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
      if (stderrBytes > 65536) channelFailure();
      for (const byte of bytes) {
        if (byte === 10) {
          const match =
            /^HOST_BOOTSTRAP_PHASE_(ENVIRONMENT|CONTEXT|ASSETS|COMPILE|PARENT|READER|CLOSE)\r?$/.exec(
              diagnosticLine,
            );
          if (match) {
            phaseCount++;
            helperPhase = phaseCount === 1 ? (match[1] ?? null) : null;
          }
          diagnosticLine = '';
        } else if (diagnosticLine.length < 1024)
          diagnosticLine += byte < 128 ? String.fromCharCode(byte) : '?';
      }
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
              } else accept();
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
      if (!child && hostNames(launchRoot).some((n) => n.startsWith('host-session'))) fail();
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
              (childResult?.code !== 0 || childResult.signal !== null || stderrBytes !== 0)) ||
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
        exit: childResult ? (childResult.code === 0 ? 'ZERO' : 'NONZERO') : 'NONE',
        directoryCleanup: clean,
      });
    },
  });
}
