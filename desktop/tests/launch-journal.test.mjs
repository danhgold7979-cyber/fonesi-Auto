import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  j = require('../launch/launch-journal.cjs');
const write = (file, value) =>
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value), { flag: 'wx' });
function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-journal-'));
  t.after(() => fs.rmSync(parent, { recursive: true }));
  write(path.join(parent, '.owner'), randomUUID());
  const launch = path.join(parent, 'launch-' + randomUUID());
  fs.mkdirSync(launch);
  write(path.join(launch, '.owner'), randomUUID());
  const root = path.join(parent, 'data-main');
  const header = j.plan(parent, launch, root, 'SOURCE', 'NORMAL', 'a'.repeat(64));
  return { parent, launch, root, header };
}
function process(exit = 0) {
  return {
    status: exit === 0 ? 'SUCCESS' : 'NONZERO_EXIT',
    exitCode: exit,
    cleanupComplete: true,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}
function capture(f, n, exit = 0, patch = {}) {
  write(path.join(f.launch, `capture-${String(n).padStart(2, '0')}.json`), {
    process: { ...process(exit), ...patch },
    stdout: 'FIXED\n',
    stderr: '',
  });
}
function setup(f) {
  j.appendIntent(f.parent, f.launch, 1, 'SETUP');
  fs.mkdirSync(f.root);
  write(path.join(f.root, '.persistence-owner.json'), {
    version: 1,
    storeId: f.header.storeId,
    kind: 'FRESH',
    restoreReceiptId: null,
  });
  fs.mkdirSync(path.join(f.root, '.writer-lock'));
  write(path.join(f.root, '.writer-lock/owner.json'), {
    version: 1,
    storeId: f.header.storeId,
    ownerToken: f.header.ownerToken,
  });
  j.recordAcquired(f.parent, f.launch);
  capture(f, 1);
  j.settle(f.parent, f.launch, 1);
}
function failedControl(f) {
  setup(f);
  j.appendIntent(f.parent, f.launch, 2, 'PREPARE_AUTH');
  capture(f, 2, 1);
  j.settle(f.parent, f.launch, 2);
}
function snapshot(root) {
  const values = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name),
        s = fs.lstatSync(file);
      if (s.isDirectory()) walk(file);
      else values[path.relative(root, file)] = fs.readFileSync(file).toString('hex');
    }
  }
  walk(root);
  return values;
}
test('plan precedes acquisition and exact schemas reject duplicates, aliases and near metadata', (t) => {
  const f = fixture(t);
  assert.equal(fs.existsSync(f.root), false);
  assert.equal(j.inspect(f.parent, f.launch).nextSequence, 1);
  const raw = fs.readFileSync(path.join(f.launch, 'launch-journal.json'), 'utf8');
  assert.deepEqual(j.parse('header', raw), f.header);
  for (const bad of [
    raw + '\n',
    raw.replace('"version":1', '"version":1,"version":1'),
    raw.replace('SOURCE', 'DEMO'),
    raw.replace('NORMAL', 'arbitrary'),
  ])
    assert.throws(() => j.parse('header', bad));
  assert.throws(() => j.recordAcquired(f.parent, f.launch));
});
test('all sequence hashes bind exact raw intent, capture and settlement and pending cannot be bypassed', (t) => {
  const f = fixture(t);
  setup(f);
  j.appendIntent(f.parent, f.launch, 2, 'PREPARE_AUTH');
  assert.throws(() => j.appendIntent(f.parent, f.launch, 3, 'RELEASE'));
  assert.throws(() => j.recoveryIntent(f.parent, f.launch, 3));
  capture(f, 2);
  j.settle(f.parent, f.launch, 2);
  const state = j.inspect(f.parent, f.launch);
  assert.equal(state.latest.stage, 'PREPARE_AUTH');
  assert.equal(state.pending, null);
  assert.equal(
    state.intents[1].previousSettlementSha256,
    j.sha(fs.readFileSync(path.join(f.launch, 'settled-01.json'))),
  );
  fs.appendFileSync(path.join(f.launch, 'capture-02.json'), ' ');
  assert.throws(() => j.inspect(f.parent, f.launch));
});
test('nonretired or truncated native outcomes leave pending intent and forbid recovery', (t) => {
  for (const patch of [
    { cleanupComplete: false },
    { stdoutTruncated: true },
    { stderrTruncated: true },
    { status: 'TIMEOUT', exitCode: null },
    { status: 'CAPTURE_FAILED', exitCode: 1 },
    { status: 'SUCCESS', exitCode: 1 },
  ]) {
    const f = fixture(t);
    setup(f);
    j.appendIntent(f.parent, f.launch, 2, 'PREPARE_AUTH');
    capture(f, 2, 0, patch);
    assert.throws(() => j.settle(f.parent, f.launch, 2));
    assert.throws(() => j.recoveryIntent(f.parent, f.launch, 3));
    assert.ok(fs.existsSync(path.join(f.root, '.writer-lock/owner.json')));
  }
});
test('known retired failure permits receipt-backed removal and completed recovery pointer handoff only', (t) => {
  const f = fixture(t);
  failedControl(f);
  j.recoveryIntent(f.parent, f.launch, 3);
  j.recover(f.parent, f.launch);
  assert.equal(fs.existsSync(path.join(f.root, '.writer-lock')), false);
  assert.throws(() => j.completed(f.parent, f.launch));
  capture(f, 3);
  j.settle(f.parent, f.launch, 3);
  assert.equal(j.completed(f.parent, f.launch).latest.stage, 'RECOVERY');
  const next = path.join(f.parent, 'launch-' + randomUUID());
  fs.mkdirSync(next);
  write(path.join(next, '.owner'), randomUUID());
  const h = j.plan(f.parent, next, f.root, 'SOURCE', 'NORMAL', 'a'.repeat(64));
  assert.notEqual(h.ownerToken, f.header.ownerToken);
  assert.ok(fs.existsSync(path.join(f.launch, 'lease-recovery.json')));
});
test('parent pointer cannot be replaced by new launch or alternate store while old ownership is pending', (t) => {
  const f = fixture(t);
  failedControl(f);
  const next = path.join(f.parent, 'launch-' + randomUUID());
  fs.mkdirSync(next);
  write(path.join(next, '.owner'), randomUUID());
  const before = snapshot(f.parent);
  assert.throws(() => j.plan(f.parent, next, f.root, 'SOURCE', 'NORMAL', 'a'.repeat(64)));
  assert.deepEqual(snapshot(f.parent), before);
});
test('empty interrupted lock requires prior acquisition, exact recovery receipt and completed recovery-control settlement', (t) => {
  const f = fixture(t);
  failedControl(f);
  j.recoveryIntent(f.parent, f.launch, 3);
  const original = fs.rmdirSync;
  fs.rmdirSync = function (file, ...args) {
    if (file === path.join(f.root, '.writer-lock')) throw Error('INJECTED');
    return original.call(this, file, ...args);
  };
  try {
    assert.throws(() => j.recover(f.parent, f.launch));
  } finally {
    fs.rmdirSync = original;
  }
  assert.equal(fs.readdirSync(path.join(f.root, '.writer-lock')).length, 0);
  assert.throws(() => j.recoveryIntent(f.parent, f.launch, 4));
  capture(f, 3, 1);
  j.settle(f.parent, f.launch, 3);
  j.recoveryIntent(f.parent, f.launch, 4);
  j.recover(f.parent, f.launch);
  capture(f, 4);
  j.settle(f.parent, f.launch, 4);
  assert.equal(j.completed(f.parent, f.launch).latest.sequence, 4);
});
test('unknown lock entries, changed owner and legacy missing journals reject unchanged', (t) => {
  for (const mutation of ['extra', 'owner', 'receipt']) {
    const f = fixture(t);
    failedControl(f);
    if (mutation === 'extra') write(path.join(f.root, '.writer-lock/foreign'), 'x');
    if (mutation === 'owner') fs.writeFileSync(path.join(f.root, '.writer-lock/owner.json'), '{}');
    if (mutation === 'receipt') {
      fs.unlinkSync(path.join(f.launch, 'lease-acquired.json'));
      fs.unlinkSync(path.join(f.root, '.writer-lock/owner.json'));
    }
    const before = snapshot(f.parent);
    assert.throws(() => j.recoveryIntent(f.parent, f.launch, 3));
    assert.deepEqual(snapshot(f.parent), before);
  }
  const f = fixture(t);
  fs.unlinkSync(path.join(f.launch, 'launch-journal.json'));
  assert.throws(() => j.inspect(f.parent, f.launch));
});
test('missing acquisition may only be attributed to completed SETUP with unchanged exact owner', (t) => {
  const f = fixture(t);
  setup(f);
  fs.unlinkSync(path.join(f.launch, 'lease-acquired.json'));
  j.recoveryIntent(f.parent, f.launch, 2);
  assert.ok(fs.existsSync(path.join(f.launch, 'lease-acquired.json')));
  j.recover(f.parent, f.launch);
  assert.equal(fs.existsSync(path.join(f.root, '.writer-lock')), false);
});
test('sixteen-sequence ceiling and unexpected higher/malformed names are fail closed', (t) => {
  const f = fixture(t);
  setup(f);
  for (let n = 2; n <= 16; n++) {
    const stage = { 2: 'PREPARE_AUTH', 3: 'AUTH', 4: 'OBSERVE_AUTH' }[n] ?? 'PREPARE_READY';
    j.appendIntent(f.parent, f.launch, n, stage);
    capture(f, n);
    j.settle(f.parent, f.launch, n);
  }
  assert.throws(() => j.appendIntent(f.parent, f.launch, 17, 'MAIN'));
  write(path.join(f.launch, 'intent-17.json'), '{}');
  assert.throws(() => j.inspect(f.parent, f.launch));
});

test('fixed control/native order rejects skipped admission and permits completed normal release', (t) => {
  const f = fixture(t);
  setup(f);
  for (const stage of ['MAIN', 'AUTH', 'RELEASE', 'SETUP'])
    assert.throws(() => j.appendIntent(f.parent, f.launch, 2, stage));
  const stages = [
    'PREPARE_AUTH',
    'AUTH',
    'OBSERVE_AUTH',
    'PREPARE_READY',
    'PREPARE_READY',
    'MAIN',
    'RELEASE',
  ];
  for (let index = 0; index < stages.length; index++) {
    const n = index + 2,
      stage = stages[index];
    j.appendIntent(f.parent, f.launch, n, stage);
    if (stage === 'RELEASE') {
      write(path.join(f.root, `.released-${f.header.ownerToken}.json`), {
        version: 1,
        storeId: f.header.storeId,
        ownerToken: f.header.ownerToken,
      });
      fs.unlinkSync(path.join(f.root, '.writer-lock/owner.json'));
      fs.rmdirSync(path.join(f.root, '.writer-lock'));
    }
    capture(f, n);
    j.settle(f.parent, f.launch, n);
  }
  assert.equal(j.completed(f.parent, f.launch).latest.stage, 'RELEASE');
  assert.throws(() => j.appendIntent(f.parent, f.launch, 9, 'RECOVERY'));
});

test('recovery preserves application bytes and rejects wrong parent pointer and oversized evidence', (t) => {
  const f = fixture(t);
  failedControl(f);
  for (const name of [
    'active.sqlite',
    'active.sqlite-wal',
    'active.sqlite-shm',
    'private-vault.bin',
  ])
    write(path.join(f.root, name), `OWNED_SYNTHETIC_${name}`);
  const expected = [
    'active.sqlite',
    'active.sqlite-wal',
    'active.sqlite-shm',
    'private-vault.bin',
  ].map((name) => [name, fs.readFileSync(path.join(f.root, name), 'utf8')]);
  const pointer = path.join(f.parent, '.launcher-current.json'),
    original = fs.readFileSync(pointer, 'utf8');
  const changed = JSON.parse(original);
  changed.ownerToken = randomUUID();
  fs.writeFileSync(pointer, JSON.stringify(changed));
  const before = snapshot(f.parent);
  assert.throws(() => j.recoveryIntent(f.parent, f.launch, 3));
  assert.deepEqual(snapshot(f.parent), before);
  fs.writeFileSync(pointer, original);
  j.recoveryIntent(f.parent, f.launch, 3);
  j.recover(f.parent, f.launch);
  for (const [name, raw] of expected)
    assert.equal(fs.readFileSync(path.join(f.root, name), 'utf8'), raw);
  write(path.join(f.launch, 'capture-03.json'), 'x'.repeat(65537));
  assert.throws(() => j.settle(f.parent, f.launch, 3));
});

test('unknown journal files and gaps cannot be ignored even when an older settlement passed', (t) => {
  for (const name of ['unrecognized.json', 'capture-03.json', 'intent-1.json']) {
    const f = fixture(t);
    setup(f);
    write(path.join(f.launch, name), '{}');
    const before = snapshot(f.parent);
    assert.throws(() => j.inspect(f.parent, f.launch));
    assert.deepEqual(snapshot(f.parent), before);
  }
});

test('malformed preexisting recovery receipt is rejected before another intent or acquisition write', (t) => {
  for (const missingAcquisition of [false, true]) {
    const f = fixture(t);
    setup(f);
    if (missingAcquisition) fs.unlinkSync(path.join(f.launch, 'lease-acquired.json'));
    write(path.join(f.launch, 'lease-recovery.json'), '{}');
    const before = snapshot(f.parent);
    assert.throws(() => j.recoveryIntent(f.parent, f.launch, 2));
    assert.deepEqual(snapshot(f.parent), before);
  }
});

test('only exact current launch profiles with owned markers fit the bounded journal inventory', (t) => {
  const f = fixture(t);
  const profile = path.join(f.launch, `fonesi-auto-foundation-${f.header.launchId}-main`);
  fs.mkdirSync(profile);
  write(path.join(profile, '.owner'), 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n');
  assert.equal(j.inspect(f.parent, f.launch).nextSequence, 1);
  fs.writeFileSync(path.join(profile, '.owner'), 'FOREIGN');
  assert.throws(() => j.inspect(f.parent, f.launch));
  fs.writeFileSync(path.join(profile, '.owner'), 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n');
  const unknown = path.join(f.launch, 'unregistered-profile');
  fs.mkdirSync(unknown);
  assert.throws(() => j.inspect(f.parent, f.launch));
  fs.rmdirSync(unknown);
  fs.writeFileSync(path.join(profile, 'oversized'), Buffer.alloc(8 * 1024 * 1024));
  assert.throws(() => j.inspect(f.parent, f.launch));
});

test('plan binds FRESH data-main and RESTORED exact store child before any journal mutation', (t) => {
  for (const kind of ['FRESH', 'RESTORED']) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-journal-kind-'));
    t.after(() => fs.rmSync(parent, { recursive: true }));
    write(path.join(parent, '.owner'), randomUUID());
    const launch = path.join(parent, `launch-${randomUUID()}`);
    fs.mkdirSync(launch);
    write(path.join(launch, '.owner'), randomUUID());
    const storeId = randomUUID(),
      restoreReceiptId = kind === 'RESTORED' ? randomUUID() : null;
    const data = path.join(parent, kind === 'RESTORED' ? 'data-main' : `data-${storeId}`);
    fs.mkdirSync(data);
    write(path.join(data, '.persistence-owner.json'), {
      version: 1,
      storeId,
      kind,
      restoreReceiptId,
    });
    if (kind === 'RESTORED')
      write(path.join(data, '.restore-receipt.json'), {
        version: 1,
        storeId,
        restoreReceiptId,
        quarantined: true,
      });
    const before = snapshot(parent);
    assert.throws(() => j.plan(parent, launch, data, 'SOURCE', 'restore-to-new', 'a'.repeat(64)));
    assert.deepEqual(snapshot(parent), before);
  }
});

test('recovery rechecks exact root provenance including forbidden FRESH restore receipt before mutation', (t) => {
  const f = fixture(t);
  failedControl(f);
  write(path.join(f.root, '.restore-receipt.json'), {
    version: 1,
    storeId: f.header.storeId,
    restoreReceiptId: randomUUID(),
    quarantined: true,
  });
  const before = snapshot(f.parent);
  assert.throws(() => j.recoveryIntent(f.parent, f.launch, 3));
  assert.deepEqual(snapshot(f.parent), before);
});

test('RESTORED receipt deletion or tampering after acquisition prevents recovery unchanged', (t) => {
  for (const missing of [true, false]) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-journal-restored-'));
    t.after(() => fs.rmSync(parent, { recursive: true }));
    write(path.join(parent, '.owner'), randomUUID());
    const launch = path.join(parent, `launch-${randomUUID()}`);
    fs.mkdirSync(launch);
    write(path.join(launch, '.owner'), randomUUID());
    const storeId = randomUUID(),
      restoreReceiptId = randomUUID(),
      root = path.join(parent, `data-${storeId}`);
    fs.mkdirSync(root);
    write(path.join(root, '.persistence-owner.json'), {
      version: 1,
      storeId,
      kind: 'RESTORED',
      restoreReceiptId,
    });
    const receipt = path.join(root, '.restore-receipt.json');
    write(receipt, { version: 1, storeId, restoreReceiptId, quarantined: true });
    const header = j.plan(parent, launch, root, 'SOURCE', 'restore-to-new', 'a'.repeat(64));
    j.appendIntent(parent, launch, 1, 'SETUP');
    fs.mkdirSync(path.join(root, '.writer-lock'));
    write(path.join(root, '.writer-lock/owner.json'), {
      version: 1,
      storeId,
      ownerToken: header.ownerToken,
    });
    j.recordAcquired(parent, launch);
    capture({ launch }, 1);
    j.settle(parent, launch, 1);
    if (missing) fs.unlinkSync(receipt);
    else fs.writeFileSync(receipt, '{}');
    const before = snapshot(parent);
    assert.throws(() => j.recoveryIntent(parent, launch, 2));
    assert.deepEqual(snapshot(parent), before);
  }
});

test('PowerShell capture escapes settle and reinspect while hashing exact original transport bytes', (t) => {
  const f = fixture(t);
  setup(f);
  j.appendIntent(f.parent, f.launch, 2, 'PREPARE_AUTH');
  const raw = JSON.stringify({
    stderr: "warning: 'quoted'",
    stdout: 'FIXED\n',
    process: Object.fromEntries(Object.entries(process()).reverse()),
  }).replaceAll("'", '\\u0027');
  assert.equal(JSON.parse(raw).stderr, "warning: 'quoted'");
  write(path.join(f.launch, 'capture-02.json'), raw);
  j.settle(f.parent, f.launch, 2);
  const state = j.inspect(f.parent, f.launch);
  assert.equal(state.latest.captureSha256, j.sha(raw));
  assert.notEqual(state.latest.captureSha256, j.sha(JSON.stringify(JSON.parse(raw))));
  assert.equal(state.pending, null);
  fs.writeFileSync(path.join(f.launch, 'capture-02.json'), JSON.stringify(JSON.parse(raw)));
  assert.throws(() => j.inspect(f.parent, f.launch));
});

test('capture transport rejects decoded duplicates, nonretirement and malformed schema without settlement', (t) => {
  const base = JSON.stringify({ process: process(), stdout: 'FIXED\n', stderr: '' });
  for (const raw of [
    base.replace('"stdout":', '"stdout":"hidden","stdout":'),
    base.replace('"cleanupComplete":true', '"cleanupComplete":false,"cleanup\\u0043omplete":true'),
    base.replace('"stdoutTruncated":false', '"stdoutTruncated":true,"stdoutTruncated":false'),
    base.replace('"stderr":""', '"stderr":{}'),
    base.replace('"exitCode":0', '"exitCode":true'),
    base.replace('"exitCode":0', '"exitCode":-0'),
    base.replace('"status":"SUCCESS"', '"status":"TIMEOUT"'),
    base.replace('"stdout":"FIXED\\n"', '"stdout":"' + 'x'.repeat(32769) + '"'),
    base + 'x',
    '\ufeff' + base,
  ]) {
    const f = fixture(t);
    setup(f);
    j.appendIntent(f.parent, f.launch, 2, 'PREPARE_AUTH');
    write(path.join(f.launch, 'capture-02.json'), raw);
    assert.throws(() => j.settle(f.parent, f.launch, 2));
    assert.equal(fs.existsSync(path.join(f.launch, 'settled-02.json')), false);
  }
});

function hostMain(f) {
  setup(f);
  for (const [index, stage] of [
    'PREPARE_AUTH',
    'AUTH',
    'OBSERVE_AUTH',
    'PREPARE_READY',
  ].entries()) {
    j.appendIntent(f.parent, f.launch, index + 2, stage);
    capture(f, index + 2);
    j.settle(f.parent, f.launch, index + 2);
  }
  j.appendIntent(f.parent, f.launch, 6, 'MAIN');
  const ready = {
    version: 2,
    state: 'READY',
    root: f.root,
    parentToken: f.header.parentToken,
    ownerToken: f.header.ownerToken,
    storeId: f.header.storeId,
    checkpoint: `key-checkpoint-${randomUUID()}.json`,
    runtimeExeSha256: f.header.executableSha256,
  };
  write(path.join(f.root, '.ready-launch.json'), ready);
  const receipt = {
    version: 1,
    launchId: f.header.launchId,
    storeId: f.header.storeId,
    ownerToken: f.header.ownerToken,
    readySha256: j.sha(JSON.stringify(ready)),
    jobName: `Local\\Fonesi-Auto-host-${randomUUID()}`,
    parentPid: 123,
    parentCreationFileTime: '0000000000000001',
    parentImagePath: path.join(f.parent, 'electron.exe'),
    parentImageSha256: f.header.executableSha256,
  };
  write(path.join(f.launch, 'host-parent.json'), receipt);
  const sessionId = randomUUID(),
    root = path.join(f.launch, '.host-session');
  fs.mkdirSync(root);
  write(path.join(root, '.owner'), f.header.ownerToken);
  fs.mkdirSync(path.join(root, 'profile'));
  const assets = Object.fromEntries(
    [
      'launch/Invoke-RetainedHost.ps1',
      'native/IsolatedAdbServer.cs',
      'native/RetainedAdbSession.cs',
      'native/RetainedAdbProtocol.cs',
      'native/RetainedHostAdmission.cs',
    ].map((k) => [k, 'b'.repeat(64)]),
  );
  const bootstrap = {
    version: 2,
    operationSet: 'VERSION_ONLY',
    sessionId,
    launchId: f.header.launchId,
    storeId: f.header.storeId,
    ownerToken: f.header.ownerToken,
    parentReceiptSha256: j.sha(JSON.stringify(receipt)),
    readySha256: receipt.readySha256,
    runRoot: root,
    adbPath: path.join(
      f.root,
      'platform-tools-runtime',
      'runtimes',
      `runtime-${'b'.repeat(64)}`,
      'adb.exe',
    ),
    adbExeSha256: 'b'.repeat(64),
    candidateArchiveSha256: 'b'.repeat(64),
    candidateManifestSha256: 'b'.repeat(64),
    installationRevision: 1,
    expectedRelease: '37.0.1',
    expectedBuildGrammar: 'DECIMAL_1_20',
    assets,
  };
  write(path.join(root, 'bootstrap.json'), bootstrap);
  return { root, receipt, bootstrap };
}
test('bound retained helper partitions inspect but never authorize RELEASE or RECOVERY from MAIN exit alone', (t) => {
  const f = fixture(t),
    h = hostMain(f);
  assert.deepEqual(j.inspect(f.parent, f.launch).hostSessions, [path.basename(h.root)]);
  capture(f, 6);
  j.settle(f.parent, f.launch, 6);
  const before = snapshot(f.parent);
  assert.throws(() => j.appendIntent(f.parent, f.launch, 7, 'RELEASE'));
  assert.throws(() => j.eligibleRecovery(f.parent, f.launch));
  assert.deepEqual(snapshot(f.parent), before);
  // Synthetic fixture disposal only; real factory requires native/helper/stdio retirement.
  fs.rmSync(h.root, { recursive: true });
  assert.deepEqual(j.inspect(f.parent, f.launch).hostSessions, []);
  j.appendIntent(f.parent, f.launch, 7, 'RELEASE');
});
test('unknown, partial, changed-owner and aliased helper partitions reject unchanged', (t) => {
  for (const kind of ['extra', 'partial', 'owner', 'alias', 'legacy-version', 'release-newline']) {
    const f = fixture(t),
      h = hostMain(f);
    if (kind === 'legacy-version')
      fs.writeFileSync(
        path.join(h.root, 'bootstrap.json'),
        JSON.stringify({ ...h.bootstrap, version: 1 }),
      );
    if (kind === 'release-newline')
      fs.writeFileSync(
        path.join(h.root, 'bootstrap.json'),
        JSON.stringify({ ...h.bootstrap, expectedRelease: '37.0.1\n' }),
      );
    if (kind === 'extra') write(path.join(h.root, 'unknown'), 'private');
    if (kind === 'partial') fs.unlinkSync(path.join(h.root, 'bootstrap.json'));
    if (kind === 'owner') fs.writeFileSync(path.join(h.root, '.owner'), randomUUID());
    if (kind === 'alias')
      fs.linkSync(path.join(h.root, 'bootstrap.json'), path.join(h.root, 'profile', 'alias'));
    const before = snapshot(f.parent);
    assert.throws(() => j.inspect(f.parent, f.launch));
    assert.deepEqual(snapshot(f.parent), before);
  }
});
test('retained receipt cannot be introduced before MAIN or bind another READY/owner', (t) => {
  const f = fixture(t),
    h = hostMain(f);
  for (const [key, value] of [
    ['readySha256', 'f'.repeat(64)],
    ['ownerToken', randomUUID()],
    ['parentCreationFileTime', '1'],
    ['parentImageSha256', 'f'.repeat(64)],
  ]) {
    fs.writeFileSync(
      path.join(f.launch, 'host-parent.json'),
      JSON.stringify({ ...h.receipt, [key]: value }),
    );
    assert.throws(() => j.inspect(f.parent, f.launch));
  }
  fs.writeFileSync(path.join(f.launch, 'host-parent.json'), JSON.stringify(h.receipt));
  fs.unlinkSync(path.join(f.launch, 'intent-06.json'));
  assert.throws(() => j.inspect(f.parent, f.launch));
});

test('fixed helper leaf retains bootstrap UUID and refuses every legacy predecessor unchanged', (t) => {
  for (const legacy of ['host-session', 'host-session-unknown', `host-session-${randomUUID()}`]) {
    const f = fixture(t),
      h = hostMain(f);
    assert.equal(path.basename(h.root), '.host-session');
    assert.match(h.bootstrap.sessionId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
    fs.mkdirSync(path.join(f.launch, legacy));
    const before = snapshot(f.parent);
    assert.throws(() => j.inspect(f.parent, f.launch));
    assert.deepEqual(snapshot(f.parent), before);
  }
  const f = fixture(t),
    h = hostMain(f);
  fs.writeFileSync(
    path.join(h.root, 'bootstrap.json'),
    JSON.stringify({ ...h.bootstrap, sessionId: '.host-session' }),
  );
  const before = snapshot(f.parent);
  assert.throws(() => j.inspect(f.parent, f.launch));
  assert.deepEqual(snapshot(f.parent), before);
});

test('retained bootstrap scope is exactly VERSION_ONLY or SERVER_ONLY with unchanged ownership and cleanup gates', (t) => {
  const f = fixture(t),
    h = hostMain(f),
    file = path.join(h.root, 'bootstrap.json');
  for (const operationSet of ['VERSION_ONLY', 'SERVER_ONLY']) {
    fs.writeFileSync(file, JSON.stringify({ ...h.bootstrap, operationSet }));
    assert.deepEqual(j.inspect(f.parent, f.launch).hostSessions, ['.host-session']);
    assert.throws(() => j.appendIntent(f.parent, f.launch, 7, 'RELEASE'));
  }
  for (const operationSet of [
    null,
    'SERVER_ONLY\n',
    'server_only',
    'VERSION_AND_SERVER',
    {},
    false,
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...h.bootstrap, operationSet }));
    const before = snapshot(f.parent);
    assert.throws(() => j.inspect(f.parent, f.launch));
    assert.deepEqual(snapshot(f.parent), before);
  }
});

const videoWrite = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

function videoRecords(f, h) {
  const artifact = {
    artifactId: 'c'.repeat(64),
    relativePath: 'video/server.jar',
    bytes: 100,
    sha256: 'c'.repeat(64),
    protocolId: 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1',
    pairManifestSha256: 'd'.repeat(64),
  };
  const bootstrap = {
    ...h.bootstrap,
    version: 3,
    operationSet: 'SERVER_ONLY',
    assets: { ...h.bootstrap.assets, 'native/RetainedVideoSession.cs': 'b'.repeat(64) },
    videoArtifact: artifact,
  };
  videoWrite(path.join(h.root, 'bootstrap.json'), bootstrap);
  const videoId = randomUUID();
  const base = {
    version: 1,
    launchId: f.header.launchId,
    storeId: f.header.storeId,
    ownerToken: f.header.ownerToken,
    hostSessionId: h.bootstrap.sessionId,
    attemptId: randomUUID(),
    videoId,
    transportId: '1',
    hostEpoch: 1,
    installationRevision: h.bootstrap.installationRevision,
    artifactSha256: artifact.sha256,
    protocolId: artifact.protocolId,
  };
  const intent = {
    ...base,
    remoteDirectory: `/data/local/tmp/fonesi-video-${videoId}`,
    scid: 1,
    nonceSha256: 'e'.repeat(64),
    admittedUtc: 1000,
    deadlineUtc: 31000,
  };
  const settlement = {
    ...base,
    directory: 'CREATED',
    upload: 'VERIFIED',
    launch: 'EXITED',
    localRetired: true,
    cleanup: 'CLEANED',
    streamObserved: true,
    code: 'CLOSED',
  };
  videoWrite(path.join(h.root, 'video-intent.json'), intent);
  videoWrite(path.join(h.root, 'video-settlement.json'), settlement);
  return { bootstrap, intent, settlement };
}
test('video bootstrap and exact retained intent/settlement remain inspectable but never grant RELEASE', (t) => {
  const f = fixture(t),
    h = hostMain(f);
  videoRecords(f, h);
  assert.deepEqual(j.inspect(f.parent, f.launch).hostSessions, ['.host-session']);
  fs.unlinkSync(path.join(h.root, 'video-settlement.json'));
  assert.deepEqual(j.inspect(f.parent, f.launch).hostSessions, ['.host-session']);
  assert.throws(() => j.appendIntent(f.parent, f.launch, 7, 'RELEASE'));
});
test('video journal refuses malformed bindings, unknown entries, legacy bootstrap and noncanonical records', (t) => {
  for (const kind of [
    'binding',
    'path',
    'deadline',
    'artifact',
    'duplicate',
    'legacy',
    'unknown',
  ]) {
    const f = fixture(t),
      h = hostMain(f),
      v = videoRecords(f, h);
    if (kind === 'binding')
      videoWrite(path.join(h.root, 'video-settlement.json'), { ...v.settlement, hostEpoch: 2 });
    if (kind === 'path')
      videoWrite(path.join(h.root, 'video-intent.json'), {
        ...v.intent,
        remoteDirectory: '/data/local/tmp/foreign',
      });
    if (kind === 'deadline')
      videoWrite(path.join(h.root, 'video-intent.json'), { ...v.intent, deadlineUtc: 31001 });
    if (kind === 'artifact')
      videoWrite(path.join(h.root, 'bootstrap.json'), {
        ...v.bootstrap,
        videoArtifact: { ...v.bootstrap.videoArtifact, bytes: 8388609 },
      });
    if (kind === 'duplicate')
      fs.writeFileSync(
        path.join(h.root, 'video-intent.json'),
        JSON.stringify(v.intent).replace('"version":1', '"version":1,"version":1'),
      );
    if (kind === 'legacy') videoWrite(path.join(h.root, 'bootstrap.json'), h.bootstrap);
    if (kind === 'unknown') videoWrite(path.join(h.root, 'video-other.json'), {});
    assert.throws(() => j.inspect(f.parent, f.launch), kind);
    assert.equal(fs.existsSync(path.join(h.root, 'video-intent.json')), true);
  }
});
