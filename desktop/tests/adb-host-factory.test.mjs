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
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
import { createHostFactory } from '../src/main/adb-host-factory.ts';
import {
  HOST_ASSETS,
  hostHash,
  readHostContext,
  createHostRoot,
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
  let runtime = Object.freeze({
    release: '37.0.1',
    archiveSha256: PLATFORM_TOOLS_CANDIDATE.archive.sha256,
    manifestSha256: hostHash(JSON.stringify(PLATFORM_TOOLS_CANDIDATE)),
    installationRevision: 1,
    adbPath: join(
      data,
      'platform-tools-runtime',
      'runtimes',
      'runtime-' + PLATFORM_TOOLS_CANDIDATE.archive.sha256,
      'adb.exe',
    ),
  });
  const custody = {
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
      return { ok: true, status: 'READ_VERIFIED_ONLY', token, observation: runtime };
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
      assert.equal(b.operationSet, 'VERSION_ONLY');
      assert.equal(b.parentReceiptSha256, hostHash(readFileSync(join(launch, 'host-parent.json'))));
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(bytes, _enc, done) {
          const q = JSON.parse(bytes.toString());
          extra.request?.(q, child);
          if (!extra.hold) {
            setImmediate(() =>
              child.stdout.write(
                JSON.stringify({
                  ...q,
                  result: {
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
  const buildFactory = () =>
    createHostFactory(
      {
        entry,
        launchRoot: launch,
        desktopRoot: desktop,
        runtimeCustody: custody,
        assertOwnedSync() {
          if (!owned) throw Error('private ownership');
        },
        now: () => 1000,
        diagnosticId: () => id(n++),
      },
      bindings,
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
      readdirSync(f.launch).some((n) => n.startsWith('host-session-')),
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
    assert.equal(readdirSync(f.launch).filter((n) => n.startsWith('host-session-')).length, 1);
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
    put(join(f.launch, 'host-session-invalid'), 'unknown retained state');
    assert.throws(() => f.buildFactory());
    assert.equal(
      readFileSync(join(f.launch, 'host-session-invalid'), 'utf8'),
      'unknown retained state',
    );
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
