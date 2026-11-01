'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const c = require('./retained-rollback-contract.cjs');
function observed(stage = 'SEED') {
  return {
    version: 1,
    scope: c.SCOPE,
    stage,
    cases: Object.fromEntries(c.CASES.map((k) => [k, !c.CONTROL_CASES.includes(k)])),
    readyCount: 1,
    closedCount: 1,
  };
}
function binding(stage = 'SEED') {
  const op = {
    operationId: randomUUID(),
    expectedRevision: 0,
    pendingRevision: 1,
    verifiedRevision: 2,
    reads: 3,
    requestId: 'p1',
    action: c.EXPECTED[stage].action,
  };
  return {
    version: 1,
    stage,
    setup: stage === 'REOPEN' ? null : op,
    runtime: {
      operationId: randomUUID(),
      installationRevision: c.EXPECTED[stage].installationRevision,
      expectedRevision: 0,
      pendingRevision: 1,
      verifiedRevision: 2,
      reads: 2,
      requestId: 'p2',
    },
  };
}
test('four-stage observed and final evidence cannot substitute one another or drop a field', () => {
  for (const stage of c.STAGES) {
    const v = observed(stage);
    assert.equal(c.validateObserved(v).passed, true);
    assert.throws(() => c.validateResult(v));
    const done = { ...v, cases: Object.fromEntries(c.CASES.map((k) => [k, true])) };
    assert.equal(c.validateResult(done).passed, true);
    assert.throws(() => c.validateObserved(done));
    assert.throws(() =>
      c.validateResult({ ...done, scope: 'HOSTED_MAIN_RUNTIME_VERSION_PACKAGE_ONLY' }),
    );
    for (const k of c.CASES)
      assert.throws(() => c.validateResult({ ...done, cases: { ...done.cases, [k]: false } }));
  }
});
test('actual hydration plus two explicit reads bind exact selected setup action and installation revision', () => {
  for (const stage of c.STAGES) {
    const v = binding(stage);
    assert.equal(c.validateBinding(v), v);
    for (const patch of [
      { reads: 3 },
      { installationRevision: 9 },
      { expectedRevision: 2 },
      { requestId: 'p01' },
    ])
      assert.throws(() => c.validateBinding({ ...v, runtime: { ...v.runtime, ...patch } }));
    if (v.setup) {
      assert.throws(() => c.validateBinding({ ...v, setup: { ...v.setup, reads: 2 } }));
      assert.throws(() => c.validateBinding({ ...v, setup: { ...v.setup, action: 'OTHER' } }));
    } else assert.throws(() => c.validateBinding({ ...v, setup: binding().setup }));
  }
});
test('actual compiled main exact seed target derivation is reversible and package target untouched', () => {
  const raw = fs.readFileSync(path.join(__dirname, '../build/main.cjs'), 'utf8'),
    probe = path.join(__dirname, 'retained-rollback-main-probe.cjs'),
    target = 'var INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_CANDIDATE.archive.sha256;',
    prior = 'var INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_PRIOR_36_CANDIDATE.archive.sha256;';
  for (const stage of c.STAGES) {
    const result = c.deriveMain(raw, probe, stage);
    assert.equal(result.split('bindContext(Object.freeze').length, 2);
    assert.equal(result.includes(prior), stage === 'SEED');
    assert.equal(result.includes(target), stage !== 'SEED');
  }
  for (const broken of [raw.replace(target, ''), raw + target, raw.replace(target, prior)])
    assert.throws(() => c.deriveMain(broken, probe, 'SEED'));
  assert.throws(() => c.deriveMain(raw, probe + '.other', 'SEED'));
  assert.throws(() => c.deriveMain(raw, probe, 'OTHER'));
});
test('finite diagnostics never forward raw exception contents', () => {
  assert.equal(c.reason(Error('RETAINED_ROLLBACK_ARCHIVE')), 'ARCHIVE');
  for (const e of [
    Error('/private/path'),
    Error('RETAINED_ROLLBACK_PRIVATE'),
    {
      get message() {
        throw Error('getter');
      },
    },
  ])
    assert.equal(c.reason(e), 'UNCLASSIFIED');
});
module.exports = { binding, observed };
test('owned launch selection binds exactly one stage, full previous UUID list and immutable target tuple', () => {
  const rootParent = fs.mkdtempSync(
      path.join(fs.realpathSync.native(path.join(__dirname, '../.test-output')), 'rollback-stage-'),
    ),
    root = path.join(rootParent, '.retained-host-runtime/r'),
    token = randomUUID(),
    managed = path.join(root, 'first-use', 'Fonesi-Auto-' + randomUUID()),
    id = randomUUID(),
    launch = path.join(managed, 'launch-' + id);
  fs.mkdirSync(launch, { recursive: true });
  for (const dir of [root, managed, launch])
    fs.writeFileSync(path.join(dir, '.owner'), token, { flag: 'wx' });
  const put = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value));
  fs.writeFileSync(path.join(managed, '.launcher-current.json'), JSON.stringify({ launchId: id }));
  put('campaign.json', { version: 1, scope: c.SCOPE });
  const plan = {
    version: 1,
    stage: 'SEED',
    managedRoot: null,
    wrapper: 'scripts-SEED/Invoke-Desktop.instrumented.ps1',
    previousLaunchIds: [],
    originalMainSha256: 'a'.repeat(64),
    derivedMainSha256: 'b'.repeat(64),
    expectedTargetVersion: '36.0.0',
    expectedActiveVersion: '36.0.0',
    installationRevision: 1,
    archiveFile: 'official-36.zip',
  };
  try {
    put('stage-SEED.json', plan);
    assert.equal(c.stageForLaunch(launch).stage, 'SEED');
    for (const change of [
      { stage: 'UPGRADE' },
      { managedRoot: managed },
      { wrapper: 'elsewhere.ps1' },
      { expectedActiveVersion: '37.0.1' },
      { installationRevision: 2 },
      { archiveFile: '../outside' },
      { previousLaunchIds: [randomUUID()] },
    ]) {
      put('stage-SEED.json', { ...plan, ...change });
      assert.throws(() => c.stageForLaunch(launch));
    }
    put('stage-SEED.json', plan);
    const extra = path.join(managed, 'launch-' + randomUUID());
    fs.mkdirSync(extra);
    assert.throws(() => c.stageForLaunch(launch));
    fs.rmdirSync(extra);
    assert.equal(c.stageForLaunch(launch).packageMode, false);
  } finally {
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    fs.rmSync(rootParent, { recursive: true, force: false });
  }
});
