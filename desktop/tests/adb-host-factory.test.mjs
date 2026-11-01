import { inspectRuntimeVersionContext } from '../src/main/runtime-version-native.ts';
// Actual owned files and production factory/bridge/adapter; OS/native/custody facts injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  readdirSync,
  renameSync,
  linkSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { transformSync } from 'esbuild';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
import { createHostFactory, isRealHostFactory } from '../src/main/adb-host-factory.ts';
import {
  HOST_ASSETS,
  hostHash,
  readHostContext,
  createHostRoot,
  assertHostPathBudget,
  cleanupHostRoot,
} from '../src/main/adb-host-context.ts';
const journal = createRequire(import.meta.url)('../launch/launch-journal.cjs');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const put = (p, v) => writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v));
function fixture(extra = {}) {
  const base = realpathSync.native(
      mkdtempSync(join(realpathSync.native(tmpdir()), 'host-factory-')),
    ),
    desktop = join(base, 'app'),
    data = join(base, 'data-main'),
    launch = join(base, `launch-${id(1)}`),
    system = join(base, 'Windows');
  for (const p of [
    desktop,
    data,
    launch,
    join(data, '.writer-lock'),
    join(desktop, 'build'),
    join(desktop, 'launch'),
    join(desktop, 'native'),
    join(system, 'System32', 'WindowsPowerShell', 'v1.0'),
  ])
    mkdirSync(p, { recursive: true });
  const exe = join(base, 'electron.exe');
  put(exe, 'synthetic parent image');
  put(
    join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    'synthetic fixed OS executable',
  );
  const systemExe = join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (extra.systemHardlink) linkSync(systemExe, join(base, 'os-servicing-link'));
  const entry = {
    root: data,
    parentToken: id(2),
    ownerToken: id(3),
    storeId: id(4),
    keyProfile: join(data, 'key-profile'),
    checkpoint: join(data, 'checkpoint'),
    runtimeExeSha256: hostHash(readFileSync(exe)),
  };
  put(join(base, '.owner'), entry.parentToken);
  put(join(launch, '.owner'), id(5));
  put(join(data, '.persistence-owner.json'), {
    version: 1,
    storeId: entry.storeId,
    kind: 'FRESH',
    restoreReceiptId: null,
  });
  put(join(data, '.writer-lock', 'owner.json'), {
    version: 1,
    storeId: entry.storeId,
    ownerToken: entry.ownerToken,
  });
  put(join(data, '.ready-launch.json'), { version: 2, state: 'READY', synthetic: true });
  const receipt = {
    version: 1,
    launchId: id(1),
    storeId: entry.storeId,
    ownerToken: entry.ownerToken,
    readySha256: hostHash(readFileSync(join(data, '.ready-launch.json'))),
    jobName: `Local\\Fonesi-Auto-host-${id(6)}`,
    parentPid: 100,
    parentCreationFileTime: '01abcdef01234567',
    parentImagePath: exe,
    parentImageSha256: entry.runtimeExeSha256,
  };
  put(join(launch, 'host-parent.json'), receipt);
  journal.initialize(base, launch, {
    version: 1,
    launchId: id(1),
    parentToken: entry.parentToken,
    storeId: entry.storeId,
    ownerToken: entry.ownerToken,
    dataRoot: data,
    entryMode: 'SOURCE',
    maintenance: 'NORMAL',
    executableSha256: entry.runtimeExeSha256,
  });
  const inputs = {};
  for (const name of HOST_ASSETS) {
    copyFileSync(new URL('../' + name, import.meta.url), join(desktop, name));
    inputs[name] = hostHash(readFileSync(join(desktop, name)));
  }
  put(join(desktop, 'build/adb-host-factory.cjs'), 'synthetic manifest-bound compiled fixture');
  put(join(desktop, 'build/.verified-build.json'), {
    schema: 1,
    inputs,
    outputs: {
      'adb-host-factory.cjs': hostHash(readFileSync(join(desktop, 'build/adb-host-factory.cjs'))),
    },
  });
  let held = false,
    owned = true,
    releases = 0,
    spawns = 0,
    n = 20,
    child;
  const token = Object.freeze({});
  const selectedCandidate = extra.candidate ?? PLATFORM_TOOLS_CANDIDATE;
  let runtime = Object.freeze({
    release: selectedCandidate.release,
    archiveSha256: selectedCandidate.archive.sha256,
    manifestSha256: hostHash(JSON.stringify(selectedCandidate)),
    installationRevision: 1,
    adbPath: join(
      data,
      'platform-tools-runtime',
      'runtimes',
      'runtime-' + selectedCandidate.archive.sha256,
      'adb.exe',
    ),
  });
  const custody = {
    assertReadInternal(t) {
      assert.equal(t, token);
      assert.equal(held, true);
    },
    assertRead(t) {
      assert.equal(t, token);
      assert.equal(held, true);
    },
    async acquireRead() {
      assert.equal(held, false);
      held = true;
      return { ok: true, status: 'READ_VERIFIED_ONLY', token, observation: runtime };
    },
    async revalidateRead(t) {
      this.assertRead(t);
      return {
        ok: true,
        status: 'READ_VERIFIED_ONLY',
        token,
        observation: Object.freeze({ ...runtime }),
      };
    },
    async releaseRead(t) {
      this.assertRead(t);
      held = false;
      releases++;
      return { ok: true, status: 'RETIRED' };
    },
  };
  const bindings = {
    platform: 'win32',
    parentPid: 100,
    systemRoot: system,
    spawn(executable, args, options) {
      spawns++;
      assert.equal(
        executable,
        join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      );
      assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File']);
      assert.equal(args.length, 7);
      assert.equal(args[6], hostHash(readFileSync(args[5])));
      assert.equal(options.shell, false);
      assert.equal(options.detached, false);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
      assert.deepEqual(Object.keys(options.env), ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']);
      const b = JSON.parse(readFileSync(args[5]));
      assert.equal(b.operationSet, extra.operationSet ?? 'VERSION_ONLY');
      assert.match(b.sessionId, /^[0-9a-f-]{36}$/);
      assert.equal(options.cwd, join(launch, '.host-session'));
      assert.equal(b.parentReceiptSha256, hostHash(readFileSync(join(launch, 'host-parent.json'))));
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(bytes, _enc, done) {
          const q = JSON.parse(bytes.toString());
          assert.equal(q.sessionId, b.sessionId);
          extra.request?.(q, child);
          if (!extra.hold) {
            setImmediate(() =>
              child.stdout.write(
                JSON.stringify({
                  ...q,
                  result: extra.facts
                    ? extra.facts(q)
                    : {
                        version: 2,
                        kind: 'INVOCATION',
                        dispatched: true,
                        processRetired: true,
                        exitCode: 0,
                        observation: q.operation === 'VERSION' ? 'VERSION' : null,
                      },
                }) + '\n',
              ),
            );
          }
          done();
        },
      });
      child.stdin.on('finish', () => {
        if (extra.stderr) child.stderr.write(extra.stderr);
        child.stdout.end();
        child.stderr.end();
        setImmediate(() => child.emit('close', extra.exitCode ?? 0, null));
      });
      extra.onSpawn?.(child);
      return child;
    },
  };
  const buildFactory = (override = {}) =>
    (extra.createFactory ?? createHostFactory)(
      {
        entry,
        launchRoot: launch,
        desktopRoot: desktop,
        runtimeCustody: custody,
        expectedInstallationRevision: extra.expectedInstallationRevision,
        operationSet: extra.operationSet,
        assertOwnedSync() {
          if (!owned) throw Error('private ownership');
          extra.ownerCallback?.({ base, launch, systemExe });
        },
        now: () => 1000,
        diagnosticId: () => id(n++),
      },
      { ...bindings, ...override },
    );
  const factory = buildFactory();
  const cap = factory.grant(id(7), () => {
    if (!owned) throw Error('revoked');
  });
  return {
    base,
    desktop,
    data,
    launch,
    receipt,
    entry,
    systemExe,
    system,
    factory,
    buildFactory,
    cap,
    changeRuntimeRevision() {
      runtime = Object.freeze({ ...runtime, installationRevision: 2 });
    },
    request: (operation = 'HOST_VERSION') => ({
      version: 1,
      commandId: id(n++),
      correlationId: id(n++),
      ownerId: id(7),
      operation,
      deadlineUtc: 2000,
    }),
    get spawns() {
      return spawns;
    },
    invalidateRead() {
      held = false;
    },
    restoreRead() {
      held = true;
    },
    get held() {
      return held;
    },
    get releases() {
      return releases;
    },
    revoke() {
      owned = false;
    },
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}
test('actual factory/bridge/adapter uses fixed VERSION private transport and separate clean helper retirement', async () => {
  const f = fixture();
  try {
    assert.equal(f.spawns, 0);
    const r = await f.factory.execute(f.cap, f.request());
    assert.equal(r.outcome, 'OBSERVED');
    assert.equal(f.spawns, 1);
    assert.equal(f.releases, 1);
    assert.equal(f.factory.retired, false);
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(f.spawns, 1);
    assert.equal(f.releases, 2);
    assert.equal(await f.factory.close(), 'RETIRED');
    assert.equal(f.factory.retired, true);
    assert.equal(
      readdirSync(f.launch).some((n) => n === '.host-session'),
      false,
    );
  } finally {
    f.cleanup();
  }
});
test('factory refuses server handoff and changed immutable runtime revision', async () => {
  const f = fixture();
  try {
    assert.notEqual(
      (await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome,
      'OBSERVED',
    );
    assert.equal(f.spawns, 0);
    await f.factory.close();
  } finally {
    f.cleanup();
  }
  const g = fixture();
  try {
    assert.equal((await g.factory.execute(g.cap, g.request())).outcome, 'OBSERVED');
    g.changeRuntimeRevision();
    assert.notEqual((await g.factory.execute(g.cap, g.request())).outcome, 'OBSERVED');
    assert.equal(g.spawns, 1);
    await g.factory.close();
  } finally {
    g.cleanup();
  }
});
test('abnormal helper exit preserves owned evidence even after a retired VERSION', async () => {
  const f = fixture({ exitCode: 1 });
  try {
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(await f.factory.close(), 'UNRETIRED');
    assert.equal(f.factory.retired, false);
    assert.equal(readdirSync(f.launch).filter((n) => n === '.host-session').length, 1);
  } finally {
    f.cleanup();
  }
});
test('exact context rejects changed receipt/READY/assets before any spawn', async () => {
  const f = fixture();
  try {
    put(join(f.launch, 'host-parent.json'), { ...f.receipt, parentCreationFileTime: 'invalid' });
    assert.throws(() => readHostContext(f.entry, f.launch, f.desktop, 100));
    assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(f.spawns, 0);
    await f.factory.close();
  } finally {
    f.cleanup();
  }
});

test('helper cleanup validates exact top-level types and preserves owner marker across later failure', () => {
  for (const mode of ['fault', 'profile-file', 'log-directory']) {
    const base = realpathSync.native(
      mkdtempSync(join(realpathSync.native(tmpdir()), 'host-cleanup-')),
    );
    try {
      const owned = createHostRoot(base, id(80), id(81), () => {}),
        raw = '{"version":1}';
      put(join(owned.root, 'bootstrap.json'), raw);
      put(join(owned.root, 'profile', 'a'), 'payload');
      if (mode === 'profile-file') {
        rmSync(join(owned.root, 'profile'), { recursive: true });
        put(join(owned.root, 'profile'), 'wrong type');
      }
      if (mode === 'log-directory') mkdirSync(join(owned.root, 'adb.log'));
      let steps = 0;
      assert.throws(() =>
        cleanupHostRoot(owned, raw, () => {
          if (mode === 'fault' && ++steps === 2) throw Error('fixed injected removal failure');
        }),
      );
      assert.equal(readFileSync(join(owned.root, '.owner'), 'utf8'), id(81));
      assert.equal(readFileSync(join(owned.root, 'bootstrap.json'), 'utf8'), raw);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
});
test('reentrant shutdown during child handoff sends eventual EOF without claiming retirement', async () => {
  const extra = {},
    f = fixture(extra);
  let closing,
    ended = false;
  extra.onSpawn = (child) => {
    child.stdin.on('finish', () => {
      ended = true;
    });
    closing = f.factory.close();
  };
  try {
    assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(await closing, 'UNRETIRED');
    assert.equal(ended, true);
    assert.equal(f.factory.retired, false);
    assert.equal(f.spawns, 1);
  } finally {
    f.cleanup();
  }
});
test('private failure evidence exposes only a fixed bootstrap phase, never raw stderr', async () => {
  const f = fixture({
    exitCode: 1,
    stderr: 'private-path-canary\nHOST_BOOTSTRAP_PHASE_PARENT\nHOST_BOOTSTRAP_FAILED\n',
  });
  try {
    await f.factory.execute(f.cap, f.request());
    assert.equal(await f.factory.close(), 'UNRETIRED');
    assert.equal(f.factory.evidence.phase, 'PARENT');
    assert.equal(JSON.stringify(f.factory.evidence).includes('canary'), false);
  } finally {
    f.cleanup();
  }
});

test('second factory and malformed predecessor refuse without adopting an idle helper', async () => {
  const f = fixture();
  try {
    const second = f.buildFactory(),
      cap = second.grant(id(7), () => {});
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.throws(() => f.buildFactory());
    assert.notEqual((await second.execute(cap, f.request())).outcome, 'OBSERVED');
    assert.equal(f.spawns, 1);
    assert.equal(await second.close(), 'RETIRED');
    assert.equal(await f.factory.close(), 'RETIRED');
    for (const name of ['host-session-invalid', '.host-session']) {
      put(join(f.launch, name), 'unknown retained state');
      assert.throws(() => f.buildFactory());
      assert.equal(readFileSync(join(f.launch, name), 'utf8'), 'unknown retained state');
      rmSync(join(f.launch, name));
    }
  } finally {
    f.cleanup();
  }
});

test('factory fences exact launch marker and directory identity before helper creation', async () => {
  for (const mutation of ['missing', 'changed', 'replacement']) {
    const f = fixture();
    try {
      if (mutation === 'missing') rmSync(join(f.launch, '.owner'));
      else if (mutation === 'changed') put(join(f.launch, '.owner'), id(999));
      else {
        const old = f.launch + '-old';
        renameSync(f.launch, old);
        mkdirSync(f.launch);
        for (const name of readdirSync(old)) copyFileSync(join(old, name), join(f.launch, name));
      }
      assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
      assert.equal(f.spawns, 0);
      assert.equal(
        readdirSync(f.launch).some((n) => n.startsWith('host-session')),
        false,
      );
    } finally {
      f.cleanup();
    }
  }
});

test('fixed system executable allows servicing hardlinks while owned payload hardlinks remain rejected', async () => {
  const f = fixture({ systemHardlink: true });
  try {
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(f.spawns, 1);
    assert.equal(await f.factory.close(), 'RETIRED');
    linkSync(join(f.launch, 'host-parent.json'), join(f.base, 'owned-extra-link'));
    assert.throws(
      () => readHostContext(f.entry, f.launch, f.desktop, 100),
      /HOST_CONTEXT_REJECTED/,
    );
  } finally {
    f.cleanup();
  }
});
test('last ownership callback cannot replace the fixed OS executable before spawn', async () => {
  let changed = false,
    afterBootstrap = 0;
  const f = fixture({
    ownerCallback({ base, launch, systemExe }) {
      const session = readdirSync(launch).find((n) => n === '.host-session');
      if (
        !changed &&
        session &&
        existsSync(join(launch, session, 'bootstrap.json')) &&
        ++afterBootstrap === 4
      ) {
        changed = true;
        renameSync(systemExe, join(base, 'old-system-exe'));
        put(systemExe, 'replacement OS executable');
      }
    },
  });
  try {
    assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(changed, true);
    assert.equal(afterBootstrap, 4);
    assert.equal(f.spawns, 0);
    await f.factory.close();
  } finally {
    f.cleanup();
  }
});

test('fixed OS path still rejects noncanonical spelling, directory executable and junction alias', async () => {
  const f = fixture();
  try {
    assert.throws(() => f.buildFactory({ systemRoot: f.system + '/.' }), /HOST_FACTORY_REJECTED/);
    const alias = join(f.base, 'system-alias');
    symlinkSync(f.system, alias, 'junction');
    assert.throws(() => f.buildFactory({ systemRoot: alias }), /HOST_FACTORY_REJECTED/);
    renameSync(f.systemExe, join(f.base, 'retained-system-file'));
    mkdirSync(f.systemExe);
    assert.throws(() => f.buildFactory(), /HOST_FACTORY_REJECTED/);
    assert.equal(f.spawns, 0);
    await f.factory.close();
  } finally {
    f.cleanup();
  }
});

const bootstrapProgress = [
  'ENVIRONMENT',
  'CONTEXT',
  'ASSETS',
  'COMPILE_BEGIN',
  'COMPILE_END',
  'PARENT_BEGIN',
  'PARENT_END',
  'READER',
  'CLOSE',
];
const readerProgress = ['REQUEST_ACCEPTED', 'PROVIDER_ENTERED', 'RESPONSE_WRITE', 'RESPONSE_FLUSH'];
const nativeProgress = ['ADMISSION', 'LAUNCH', 'LAUNCH_END', 'EXIT', 'RETIRE_BEGIN', 'RETIRE_END'];
const progressLines = [
  ...bootstrapProgress.slice(0, -1).map((x) => `HOST_BOOTSTRAP_PROGRESS_${x}`),
  ...readerProgress.map((x) => `HOST_READER_PROGRESS_${x}`),
  ...nativeProgress.map((x) => `HOST_NATIVE_PROGRESS_${x}`),
  'HOST_BOOTSTRAP_PROGRESS_CLOSE',
];
test('exact bounded progress is diagnostic only and permits actual terminal cleanup', async () => {
  const f = fixture({ stderr: progressLines.join('\r\n') + '\r\n' });
  try {
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(f.factory.evidence.requestWriteCompleted, true);
    assert.equal(await f.factory.close(), 'RETIRED');
    assert.equal(f.factory.evidence.progress.length, 19);
    assert.ok(Object.isFrozen(f.factory.evidence.progress));
  } finally {
    f.cleanup();
  }
});
test('unknown duplicate malformed overflow and incomplete stderr never authorize helper cleanup', async () => {
  for (const stderr of [
    'HOST_UNKNOWN_PROGRESS_PRIVATE\n',
    'HOST_BOOTSTRAP_PROGRESS_CONTEXT\n',
    'HOST_READER_PROGRESS_REQUEST_ACCEPTED\nHOST_READER_PROGRESS_REQUEST_ACCEPTED\n',
    'HOST_NATIVE_PROGRESS_LAUNCH_END private\n',
    'HOST_BOOTSTRAP_PROGRESS_ENVIRONMENT',
    'x'.repeat(1025) + '\n',
    'x'.repeat(65537),
    'HOST_BOOTSTRAP_FAILED\n',
    'HOST_BOOTSTRAP_PROGRESS_ENVIRONMENT\n\n',
  ]) {
    const f = fixture({ stderr });
    try {
      assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
      assert.equal(await f.factory.close(), 'UNRETIRED');
      assert.equal(f.factory.evidence.directoryCleanup, false);
    } finally {
      f.cleanup();
    }
  }
});
test('native progress first-occurrence slots do not impose a false concurrent retirement ordering', async () => {
  const f = fixture({
    stderr: ['RETIRE_BEGIN', 'ADMISSION', 'LAUNCH', 'LAUNCH_END', 'RETIRE_END', 'EXIT']
      .map((x) => `HOST_NATIVE_PROGRESS_${x}\n`)
      .join(''),
  });
  try {
    assert.equal((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
    assert.equal(await f.factory.close(), 'RETIRED');
    assert.equal(f.factory.evidence.progress.length, 6);
  } finally {
    f.cleanup();
  }
});

test('private compatibility budget accepts exact owned helper boundary and rejects one over before any write or callback', () => {
  const base = realpathSync.native(
    mkdtempSync(join(realpathSync.native(tmpdir()), 'host-budget-')),
  );
  try {
    for (const length of [184, 185]) {
      const prefix = join(base, 'x'.repeat(length - base.length - 15));
      mkdirSync(prefix);
      let fences = 0;
      assert.equal(join(prefix, '.host-session').length, length);
      const before = readdirSync(prefix);
      if (length === 184) {
        const owned = createHostRoot(prefix, id(80), id(81), () => {
          fences++;
        });
        assert.equal(owned.root.length, 184);
        assert.equal(join(owned.root, 'profile').length, 192);
        assert.equal(join(owned.root, 'bootstrap.json').length, 199);
        assert.equal(readFileSync(join(owned.root, '.owner'), 'utf8'), id(81));
        assert.ok(fences > 0);
      } else {
        assert.throws(
          () =>
            createHostRoot(prefix, id(80), id(81), () => {
              fences++;
            }),
          /HOST_CONTEXT_REJECTED/,
        );
        assert.equal(fences, 0);
        assert.deepEqual(readdirSync(prefix), before);
      }
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
test('actual adb basename and native asset paths obey conservative directory/file bounds without creating files', () => {
  const base = realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()), 'host-path-')));
  try {
    const before = readdirSync(base);
    const pathOf = (parentLength, name) =>
      join(base, 'x'.repeat(parentLength - base.length - 1), name);
    const supported = pathOf(247, 'adb.exe');
    assert.equal(supported.length, 255);
    assert.equal(assertHostPathBudget(base, id(80), supported), join(base, '.host-session'));
    for (const value of [
      pathOf(248, 'adb.exe'),
      pathOf(252, 'adb.exe'),
      pathOf(247, 'x'.repeat(12)),
    ])
      assert.throws(() => assertHostPathBudget(base, id(80), value), /HOST_CONTEXT_REJECTED/);
    assert.doesNotThrow(() =>
      assertHostPathBudget(base, id(80), supported, [pathOf(247, 'x'.repeat(11))]),
    );
    assert.throws(
      () => assertHostPathBudget(base, id(80), supported, [pathOf(247, 'x'.repeat(12))]),
      /HOST_CONTEXT_REJECTED/,
    );
    assert.deepEqual(readdirSync(base), before);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('atomic compile diagnostic binds all fixed fields before pending request rejection, including split chunks', async () => {
  const frame =
    'HOST_BOOTSTRAP_COMPILE_ERROR|SOURCE_CODE_ERROR|CMDLET|INVALID_OPERATION|CS0246|UNAVAILABLE|UNAVAILABLE|UNAVAILABLE\n';
  for (const chunks of [[frame], [frame.slice(0, 17), frame.slice(17, 62), frame.slice(62)]]) {
    const f = fixture({
      hold: true,
      exitCode: 1,
      request(_q, child) {
        queueMicrotask(() => {
          for (const chunk of chunks) child.stderr.write(chunk);
        });
      },
    });
    try {
      assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
      assert.equal(f.factory.evidence.phase, 'COMPILE');
      assert.deepEqual(f.factory.evidence.compileFailure, {
        id: 'SOURCE_CODE_ERROR',
        type: 'CMDLET',
        inner: 'INVALID_OPERATION',
        cs: 'CS0246',
        tempReason: 'UNAVAILABLE',
        tempRelation: 'UNAVAILABLE',
        tempLength: 'UNAVAILABLE',
      });
      assert.ok(Object.isFrozen(f.factory.evidence.compileFailure));
      assert.equal(await f.factory.close(), 'UNRETIRED');
    } finally {
      f.cleanup();
    }
  }
});
test('compile diagnostic rejects unknown raw fields and duplicate frames without cleanup authority', async () => {
  const frame =
    'HOST_BOOTSTRAP_COMPILE_ERROR|OTHER|OTHER|NONE|NONE|UNAVAILABLE|UNAVAILABLE|UNAVAILABLE\n';
  for (const stderr of [
    frame + frame,
    frame.replace('|OTHER|', '|private-path-canary|'),
    frame.replace('|NONE|NONE|', '|NONE|CS99999|'),
    frame.replace('\n', '|extra\n'),
  ]) {
    const f = fixture({ stderr, exitCode: 1 });
    try {
      await f.factory.execute(f.cap, f.request());
      assert.equal(await f.factory.close(), 'UNRETIRED');
      assert.equal(f.factory.evidence.compileFailure, null);
      assert.equal(JSON.stringify(f.factory.evidence).includes('canary'), false);
    } finally {
      f.cleanup();
    }
  }
});
test('bootstrap compile classification is bounded exact runtime types and precedes legacy rejection', () => {
  const source = readFileSync(
    new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url),
    'utf8',
  );
  assert.ok(
    source.indexOf("if($phase -ceq 'COMPILE'){try{Compile-Frame $_}catch{}}") <
      source.indexOf("[Console]::Error.WriteLine('HOST_BOOTSTRAP_PHASE_'+$phase)"),
  );
  const classifier = source.slice(
    source.indexOf('function Compile-Type'),
    source.indexOf('function Reject'),
  );
  assert.match(classifier, /\$Record.GetType\(\) -ne \[System.Management.Automation.ErrorRecord\]/);
  assert.match(classifier, /\$fq.Length -le 256/);
  assert.match(classifier, /\$number.Length -eq 6/);
  assert.match(classifier, /Microsoft.PowerShell.Commands.AddTypeCompilerError/);
  assert.match(classifier, /System.CodeDom.Compiler.CompilerError/);
  assert.equal((classifier.match(/InnerException/g) || []).length, 1);
  assert.doesNotMatch(
    classifier,
    /\$exception\.Message|\$target\.Message|\.StackTrace|\.ToString\(/,
  );
  assert.equal((classifier.match(/Console\]::Error.WriteLine/g) || []).length, 1);
});

test('any exact six-character compiler identifier remains diagnostic failure only', async () => {
  const f = fixture({
    stderr:
      'HOST_BOOTSTRAP_COMPILE_ERROR|COMPILER_ERRORS|OTHER|NONE|CS9999|UNAVAILABLE|UNAVAILABLE|UNAVAILABLE\n',
    exitCode: 1,
  });
  try {
    await f.factory.execute(f.cap, f.request());
    assert.equal(await f.factory.close(), 'UNRETIRED');
    assert.equal(f.factory.evidence.compileFailure.cs, 'CS9999');
  } finally {
    f.cleanup();
  }
});

test('bootstrap compiler identifier grammar rejects final LF and CRLF before atomic framing', () => {
  const ps = readFileSync(join(import.meta.dirname, '../launch/Invoke-RetainedHost.ps1'), 'utf8');
  assert.ok(ps.includes("$number.Length -eq 6 -and $number -cmatch '\\ACS[0-9]{4}\\z'"));
  const exact = (value) => value.length === 6 && /^CS[0-9]{4}$/.test(value);
  assert.equal(exact('CS1234'), true);
  assert.equal(exact('CS1234\n'), false);
  assert.equal(exact('CS1234\r\n'), false);
});

test('CS1619 fixed temporary-file tuple is diagnostic only and rejects incoherent or raw fields', async () => {
  const prefix = 'HOST_BOOTSTRAP_COMPILE_ERROR|SOURCE_CODE_ERROR|OTHER|NONE|';
  for (const [suffix, valid] of [
    ['CS1619|ACCESS|PROFILE|LE247', true],
    ['CS1619|WIN32_0001|PROFILE|LE247', true],
    ['CS1619|WIN32_0499|EMPTY|EMPTY', true],
    ['CS1619|WIN32_0000|EMPTY|EMPTY', false],
    ['CS1619|WIN32_0500|EMPTY|EMPTY', false],
    ['CS1619|BUFFER_TOO_SMALL|EMPTY|EMPTY', true],
    ['CS1619|INVALID_NAME|OTHER|GE260', true],
    ['CS1619|OTHER|RUN|FROM248_TO259', true],
    ['CS1619|UNAVAILABLE|UNAVAILABLE|UNAVAILABLE', true],
    ['CS0246|ACCESS|PROFILE|LE247', false],
    ['CS1619|ACCESS|EMPTY|LE247', false],
    ['CS1619|UNAVAILABLE|PROFILE|LE247', false],
    ['CS1619|private-canary|PROFILE|LE247', false],
  ]) {
    const f = fixture({
      hold: true,
      exitCode: 1,
      request(_q, child) {
        queueMicrotask(() => child.stderr.write(prefix + suffix + '\n'));
      },
    });
    try {
      assert.notEqual((await f.factory.execute(f.cap, f.request())).outcome, 'OBSERVED');
      assert.equal(await f.factory.close(), 'UNRETIRED');
      assert.equal(f.factory.evidence.compileFailure !== null, valid);
      assert.equal(JSON.stringify(f.factory.evidence).includes('canary'), false);
    } finally {
      f.cleanup();
    }
  }
});

test('temporary compiler text classifier has bounded exact framing and never emits raw input', () => {
  const ps = readFileSync(new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url), 'utf8');
  const section = ps.slice(ps.indexOf('function Compile-Frame'), ps.indexOf('function Reject'));
  assert.ok(section.includes('4096'));
  assert.ok(section.includes('OrdinalIgnoreCase'));
  assert.equal((section.match(/Console\]::Error.WriteLine/g) || []).length, 1);
  assert.doesNotMatch(section, /Write-Output|Write-Host/);
});

test('compiler reason normalization models only edge ASCII spaces and one period; lookup is uniquely bounded', () => {
  const normalize = (value) =>
    value
      .replace(/^ +| +$/g, '')
      .replace(/\.$/, '')
      .replace(/ +$/, '');
  const lookup = (reason, messages) => {
    const found = [];
    let complete = true;
    for (const message of messages) {
      try {
        const [code, text] = message;
        if (
          code >= 1 &&
          code <= 499 &&
          text.length <= 1024 &&
          normalize(text) === normalize(reason)
        )
          found.push([code, text]);
      } catch {
        complete = false;
      }
    }
    return complete && found.length === 1
      ? 'WIN32_' + String(found[0][0]).padStart(4, '0')
      : 'OTHER';
  };
  for (const value of ['Access is denied', 'Access is denied.', '  Access is denied.  '])
    assert.equal(normalize(value), 'Access is denied');
  assert.equal(normalize('Access is denied..'), 'Access is denied.');
  assert.equal(lookup('Unknown bounded text.', [[123, 'Unknown bounded text']]), 'WIN32_0123');
  assert.equal(
    lookup('Unknown bounded text', [
      [123, 'Unknown bounded text'],
      [124, 'Unknown bounded text.'],
    ]),
    'OTHER',
  );
  assert.equal(lookup('private-path', [[123, 'Unknown bounded text']]), 'OTHER');
  const failed = [124];
  Object.defineProperty(failed, 1, {
    get() {
      throw Error('synthetic lookup failure');
    },
  });
  assert.equal(lookup('Unknown bounded text', [[123, 'Unknown bounded text'], failed]), 'OTHER');
  const ps = readFileSync(new URL('../launch/Invoke-RetainedHost.ps1', import.meta.url), 'utf8');
  assert.ok(ps.includes('for($code=1;$code -le 499;$code++)'));
  assert.ok(ps.includes('$nativeText.Length -le 1024'));
  assert.ok(
    ps.includes('New-Object -TypeName System.ComponentModel.Win32Exception -ArgumentList $code'),
  );
  assert.ok(ps.includes('if($lookupComplete -and $matchCount -eq 1)'));
  assert.ok(ps.includes('catch {$lookupComplete=$false}'));
  assert.ok(ps.includes("'The file name is too long' {$tempReason='PATH_TOO_LONG'}"));
});

test('main VERSION resolver binds actual current journal and distinguishes disabled opt-in from damaged ownership', async () => {
  const f = fixture();
  try {
    assert.deepEqual(inspectRuntimeVersionContext(f.entry, f.desktop, 100), {
      ok: true,
      launchRoot: f.launch,
    });
    const receipt = join(f.launch, 'host-parent.json'),
      held = join(f.base, 'held-receipt');
    renameSync(receipt, held);
    assert.deepEqual(inspectRuntimeVersionContext(f.entry, f.desktop, 100), {
      ok: false,
      code: 'RETAINED_HOST_DISABLED',
    });
    put(receipt, '{}');
    assert.deepEqual(inspectRuntimeVersionContext(f.entry, f.desktop, 100), {
      ok: false,
      code: 'RECOVERY_REQUIRED',
    });
    rmSync(receipt);
    renameSync(held, receipt);
    const marker = join(f.launch, '.owner');
    const owner = readFileSync(marker);
    put(marker, 'invalid');
    assert.deepEqual(inspectRuntimeVersionContext(f.entry, f.desktop, 100), {
      ok: false,
      code: 'RECOVERY_REQUIRED',
    });
    writeFileSync(marker, owner);
    assert.equal(f.spawns, 0);
  } finally {
    await f.factory.close();
    f.cleanup();
  }
});

test('main captured installation revision refuses a replacement before any actual provider spawn', async () => {
  const f = fixture({ expectedInstallationRevision: 1 });
  try {
    f.changeRuntimeRevision();
    const result = await f.factory.execute(f.cap, f.request());
    assert.notEqual(result.outcome, 'OBSERVED');
    assert.equal(f.spawns, 0);
    assert.equal(existsSync(join(f.launch, '.host-session')), false);
    assert.equal(f.releases, 1);
    assert.equal(await f.factory.close(), 'RETIRED');
  } finally {
    f.cleanup();
  }
});

test('actual transformed catalog/factory binds selected prior release in bootstrap and refuses launch revocation', async () => {
  const prior = {
    ...PLATFORM_TOOLS_CANDIDATE,
    release: '36.0.0',
    archive: {
      ...PLATFORM_TOOLS_CANDIDATE.archive,
      url: 'https://dl.google.com/android/repository/platform-tools_r36.0.0-win.zip',
      sha256: 'a'.repeat(64),
    },
  };
  const encode = (source) =>
    'data:text/javascript;base64,' +
    Buffer.from(
      transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' }).code,
    ).toString('base64');
  for (const launchAllowed of [true, false]) {
    let catalog = readFileSync(
      new URL('../src/main/platform-tools-catalog.ts', import.meta.url),
      'utf8',
    );
    const start = catalog.indexOf('const KNOWN:'),
      end = catalog.indexOf('const MAX =');
    assert.ok(start > 0 && end > start);
    catalog =
      catalog.slice(0, start) +
      `const KNOWN = [{candidate: PLATFORM_TOOLS_CANDIDATE, activationAllowed:true,launchAllowed:true},{candidate:${JSON.stringify(prior)},activationAllowed:true,launchAllowed:${launchAllowed}}];\nconst INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_CANDIDATE.archive.sha256;\n` +
      catalog.slice(end);
    catalog = catalog.replace(
      "'./platform-tools-candidate.ts'",
      JSON.stringify(new URL('../src/main/platform-tools-candidate.ts', import.meta.url).href),
    );
    const catalogUrl = encode(catalog);
    let factorySource = readFileSync(
      new URL('../src/main/adb-host-factory.ts', import.meta.url),
      'utf8',
    );
    factorySource = factorySource.replace(
      /from '(\.\/[^']+)'/g,
      (_all, specifier) =>
        'from ' +
        JSON.stringify(
          specifier === './platform-tools-catalog.ts'
            ? catalogUrl
            : new URL('../src/main/' + specifier.slice(2), import.meta.url).href,
        ),
    );
    const transformed = (await import(encode(factorySource))).createHostFactory;
    const f = fixture({ candidate: prior, createFactory: transformed });
    try {
      const result = await f.factory.execute(f.cap, f.request());
      if (launchAllowed) {
        assert.equal(result.outcome, 'OBSERVED');
        const bootstrap = JSON.parse(
          readFileSync(join(f.launch, '.host-session', 'bootstrap.json'), 'utf8'),
        );
        assert.equal(bootstrap.version, 2);
        assert.equal(bootstrap.expectedRelease, '36.0.0');
        assert.equal(bootstrap.expectedBuildGrammar, 'DECIMAL_1_20');
        assert.equal(bootstrap.candidateArchiveSha256, prior.archive.sha256);
        assert.equal(bootstrap.candidateManifestSha256, hostHash(JSON.stringify(prior)));
        assert.equal(f.spawns, 1);
      } else {
        assert.notEqual(result.outcome, 'OBSERVED');
        assert.equal(f.spawns, 0);
        assert.equal(existsSync(join(f.launch, '.host-session')), false);
      }
      assert.equal(await f.factory.close(), 'RETIRED');
      assert.equal(f.releases, 1);
    } finally {
      f.cleanup();
    }
  }
});

test('SERVER_ONLY actual factory/adapter/bridge retains one live attempt across health and stop with engine snapshots', async () => {
  let capturedOptions;
  const requests = [],
    f = fixture({
      operationSet: 'SERVER_ONLY',
      createFactory(options, bindings) {
        capturedOptions = options;
        return createHostFactory(options, bindings);
      },
      request(q) {
        requests.push(q);
      },
      facts(q) {
        return {
          version: 2,
          kind: 'SESSION',
          dispatched: true,
          jobState: q.operation === 'RETIRE' ? 'RETIRED' : 'LIVE',
          exitCode: q.operation === 'RETIRE' ? 7 : null,
          endpointState: q.operation === 'RETIRE' ? 'ABSENT' : 'OWNED',
          observation:
            q.operation === 'START' ? 'STARTED' : q.operation === 'HEALTH' ? 'HEALTHY' : 'STOPPED',
        };
      },
    });
  try {
    capturedOptions.operationSet = 'VERSION_ONLY'; // Factory captured SERVER_ONLY once.
    assert.deepEqual(f.factory.snapshot(), { state: 'STOPPED', busy: false, closed: false });
    assert.ok(Object.isFrozen(f.factory.snapshot()));
    assert.equal((await f.factory.execute(f.cap, f.request('HOST_VERSION'))).code, 'NOT_READY');
    assert.equal(f.spawns, 0);
    assert.equal(f.held, false);
    assert.equal(f.releases, 0);
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
    assert.equal(f.factory.snapshot().state, 'READY');
    assert.equal(f.held, true);
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_HEALTH'))).outcome, 'OBSERVED');
    assert.equal(f.releases, 0);
    assert.notEqual(
      (await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome,
      'OBSERVED',
    );
    assert.equal(requests.length, 2);
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_STOP'))).outcome, 'OBSERVED');
    assert.equal(f.factory.snapshot().state, 'STOPPED');
    assert.equal(new Set(requests.map((q) => q.attemptId)).size, 1);
    assert.deepEqual(
      requests.map((q) => q.operation),
      ['START', 'HEALTH', 'RETIRE'],
    );
    assert.equal(f.spawns, 1);
    assert.equal(f.held, false);
    assert.equal(f.releases, 1);
    assert.equal(await f.factory.close(), 'RETIRED');
    assert.equal(f.factory.snapshot().closed, true);
  } finally {
    f.cleanup();
  }
});
test('default scope rejects server ordinary operations before runtime custody and snapshots do not mutate engine', async () => {
  const f = fixture();
  try {
    for (const operation of ['SERVER_START', 'SERVER_HEALTH']) {
      assert.equal((await f.factory.execute(f.cap, f.request(operation))).code, 'NOT_READY');
      assert.equal(f.spawns, 0);
      assert.equal(f.held, false);
      assert.equal(f.releases, 0);
    }
    const snapshot = f.factory.snapshot();
    assert.throws(() => {
      snapshot.state = 'READY';
    });
    assert.equal(f.factory.snapshot().state, 'STOPPED');
    assert.equal(await f.factory.close(), 'RETIRED');
  } finally {
    f.cleanup();
  }
});

test('invalid explicit scopes fail before any admission callback or factory binding', () => {
  for (const operationSet of [null, 'SERVER_ONLY\n', 'server_only', 'BOTH', {}, false]) {
    let calls = 0;
    assert.throws(
      () =>
        createHostFactory(
          {
            operationSet,
            assertOwnedSync() {
              calls++;
            },
          },
          {},
        ),
      /HOST_FACTORY_REJECTED/,
    );
    assert.equal(calls, 0);
  }
});

test('server publication assertions reject stale custody after the last owner callback without reacquiring', async () => {
  let armed = false,
    ownerCalls = 0;
  const f = fixture({
    operationSet: 'SERVER_ONLY',
    ownerCallback() {
      if (armed && ++ownerCalls === 3) f.invalidateRead();
    },
    facts(q) {
      return {
        version: 2,
        kind: 'SESSION',
        dispatched: true,
        jobState: q.operation === 'RETIRE' ? 'RETIRED' : 'LIVE',
        exitCode: q.operation === 'RETIRE' ? 1 : null,
        endpointState: q.operation === 'RETIRE' ? 'ABSENT' : 'OWNED',
        observation: q.operation === 'RETIRE' ? 'STOPPED' : 'STARTED',
      };
    },
  });
  try {
    assert.throws(() => f.factory.assertCurrentSession());
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
    assert.doesNotThrow(() => f.factory.assertCurrentSession());
    assert.throws(() => f.factory.assertRetiredSession());
    armed = true;
    assert.throws(() => f.factory.assertCurrentSession());
    assert.equal(ownerCalls, 3);
    assert.equal(f.held, false);
    assert.equal(f.spawns, 1);
    assert.equal(f.releases, 0);
    armed = false;
    f.restoreRead(); // Restore only the injected test holder, not an application operation.
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_STOP'))).outcome, 'OBSERVED');
    assert.doesNotThrow(() => f.factory.assertRetiredSession());
    assert.equal(f.factory.retired, false); // Helper remains alive; ordinary STOP proved only attempt/custody retirement.
    assert.throws(() => f.factory.assertCurrentSession());
    assert.equal(await f.factory.close(), 'RETIRED');
    assert.throws(() => f.factory.assertRetiredSession());
  } finally {
    f.cleanup();
  }
});

test('injected and structurally copied factories cannot mint real discovery acquisition authority', async () => {
  const f = fixture({ operationSet: 'SERVER_ONLY' });
  try {
    assert.equal(isRealHostFactory(f.factory), false);
    assert.equal(isRealHostFactory({ ...f.factory }), false);
    for (const value of [null, {}, Object.freeze({ acquireDiscovery() {} })])
      assert.equal(isRealHostFactory(value), false);
    assert.throws(() => f.factory.acquireDiscovery(f.cap, { deadlineUtc: 2000 }));
    assert.throws(() =>
      f.factory.acquireInput(f.cap, { transportId: '1', action: 'HOME', deadlineUtc: 2000 }),
    );
    assert.equal(f.spawns, 0);
    assert.equal(f.held, false);
    await f.factory.close();
  } finally {
    f.cleanup();
  }
});

test('discovery epoch observation tolerates pending HEALTH but final holder witness is callback-free and exact', async () => {
  let calls = 0,
    heldHealth;
  const session = (q) => ({
    version: 2,
    kind: 'SESSION',
    dispatched: true,
    jobState: q.operation === 'RETIRE' ? 'RETIRED' : 'LIVE',
    exitCode: q.operation === 'RETIRE' ? 1 : null,
    endpointState: q.operation === 'RETIRE' ? 'ABSENT' : 'OWNED',
    observation:
      q.operation === 'RETIRE' ? 'STOPPED' : q.operation === 'HEALTH' ? 'HEALTHY' : 'STARTED',
  });
  const options = {
    operationSet: 'SERVER_ONLY',
    ownerCallback() {
      calls++;
    },
    facts: session,
    request(q, child) {
      if (q.operation === 'HEALTH')
        heldHealth = () => child.stdout.write(JSON.stringify({ ...q, result: session(q) }) + '\n');
    },
  };
  const f = fixture(options);
  try {
    const absent = f.factory.discoveryEpochWitness();
    assert.equal(absent.valid, false);
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
    const witness = f.factory.discoveryEpochWitness();
    assert.equal(witness.valid, true);
    assert.equal(absent.valid, false);
    options.hold = true;
    const health = f.factory.execute(f.cap, f.request('SERVER_HEALTH'));
    while (!heldHealth) await new Promise((r) => setImmediate(r));
    assert.equal(f.factory.snapshot().busy, true);
    assert.throws(() => f.factory.assertCurrentSession());
    assert.doesNotThrow(() => f.factory.assertDiscoveryEpochCurrent());
    const before = calls;
    assert.equal(witness.valid, true);
    f.invalidateRead();
    assert.equal(witness.valid, false);
    assert.equal(calls, before);
    f.restoreRead();
    heldHealth();
    assert.equal((await health).outcome, 'OBSERVED');
    assert.equal(witness.valid, true); // Actual custody returns a fresh equivalent observation.
    options.hold = false;
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_STOP'))).outcome, 'OBSERVED');
    assert.equal(witness.valid, false);
    assert.equal((await f.factory.execute(f.cap, f.request('SERVER_START'))).outcome, 'OBSERVED');
    assert.equal(witness.valid, false); // New attempt cannot revive a witness even if an injected token is reused.
    assert.equal(f.factory.discoveryEpochWitness().valid, true);
    assert.equal(await f.factory.close(), 'RETIRED');
  } finally {
    f.cleanup();
  }
});
