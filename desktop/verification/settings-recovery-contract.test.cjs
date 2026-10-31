'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const {
  STAGES,
  CASES,
  caseNames,
  control,
  witness,
  backupWitness,
  guardActiveDatabase,
} = require('./settings-recovery-contract.cjs');
function fixture() {
  const base = path.resolve(__dirname, '../.test-output');
  try {
    fs.mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(base), base);
  const root = fs.mkdtempSync(path.join(base, 'recovery-contract-'));
  return {
    root,
    close() {
      assert.equal(fs.realpathSync(root), root);
      assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
function value(stage = 'recovery-setup') {
  const id = randomUUID();
  return {
    version: 1,
    mode: 'source',
    stage,
    runParentToken: randomUUID(),
    dataRoot: path.resolve('owned-data'),
    parentToken: randomUUID(),
    ownerToken: randomUUID(),
    storeId: randomUUID(),
    checkpoint: `key-checkpoint-${randomUUID()}.json`,
    backupId: stage === 'recovery-setup' ? null : id,
    backupFile: stage === 'recovery-setup' ? null : path.resolve(`backup-${id}.fonaub`),
    destinationParent: stage === 'recovery-setup' ? null : path.resolve('owned-destination'),
  };
}
test('exact five stage private controls canonical fields with setup/maintenance distinction', () => {
  for (const stage of STAGES) {
    const v = value(stage);
    assert.deepEqual(control(JSON.stringify(v)), v);
    for (const patch of [
      { extra: true },
      { version: 2 },
      { stage: 'ordinary-ui' },
      { checkpoint: '../key' },
      { backupId: 'private' },
    ])
      assert.throws(() => control(JSON.stringify({ ...v, ...patch })));
    assert.throws(() =>
      control(JSON.stringify(v).replace('"version":1', '"version":0,"version":1')),
    );
  }
  assert.deepEqual(Object.keys(CASES), ['recovery-setup', 'cancel', 'confirm']);
  assert.equal(caseNames('current-confirm').length, 10);
  assert.equal(caseNames('previous-cancel').length, 8);
});
test('bounded original database sidecar vault and selectedbackup witness detects changes and preserves absence', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'active.sqlite'), 'fixture');
    const initial = witness(f.root);
    assert.equal(initial.vault, null);
    assert.equal(initial.database['active.sqlite-wal'], null);
    fs.mkdirSync(path.join(f.root, 'vault'));
    fs.writeFileSync(path.join(f.root, 'vault', 'index.json'), '{}');
    const before = witness(f.root);
    assert.notDeepEqual(before, initial);
    fs.writeFileSync(path.join(f.root, 'vault', 'index.json'), '[]');
    assert.notDeepEqual(witness(f.root), before);
    const file = path.join(f.root, 'backup.fonaub');
    fs.writeFileSync(file, 'cipher');
    fs.writeFileSync(path.join(f.root, 'backup.json'), 'receipt');
    const saved = backupWitness(file);
    fs.writeFileSync(file, 'changed');
    assert.notDeepEqual(backupWitness(file), saved);
    fs.mkdirSync(path.join(f.root, 'vault', 'unknown'));
    assert.throws(() => witness(f.root));
  } finally {
    f.close();
  }
});
test('active DatabaseSync guard never constructs forbidden path and transparently forwards other paths/args', () => {
  const calls = [],
    token = {};
  class Native {
    constructor(...args) {
      calls.push(args);
      this.args = args;
    }
  }
  const sqlite = { DatabaseSync: Native };
  let attempts = 0;
  const active = path.resolve('active.sqlite');
  const restore = guardActiveDatabase(sqlite, active, () => {
    attempts++;
  });
  assert.throws(() => new sqlite.DatabaseSync(active), /RECOVERY_ACTIVE_OPEN_FORBIDDEN/);
  assert.equal(attempts, 1);
  assert.equal(calls.length, 0);
  const allowed = new sqlite.DatabaseSync(path.resolve('staging.sqlite'), token);
  assert.ok(allowed instanceof Native);
  assert.equal(allowed.args[1], token);
  assert.equal(calls.length, 1);
  restore();
  assert.equal(sqlite.DatabaseSync, Native);
});
test('control verifies reviewed build before compiled imports and probe uses exact production maintenance route', () => {
  const source = fs.readFileSync(path.join(__dirname, 'settings-recovery-control.cjs'), 'utf8');
  assert.ok(
    source.indexOf('verifyBuild(') < source.indexOf("require('../build/persistence-files.cjs')"),
  );
  const probe = fs.readFileSync(path.join(__dirname, 'settings-recovery-probe.cjs'), 'utf8');
  assert.ok(probe.includes("require('../build/main.cjs')"));
  assert.ok(probe.includes('--maintenance=restore-to-new'));
  assert.ok(probe.includes('guardActiveDatabase('));
  assert.ok(!probe.includes('initializeVault'));
  assert.ok(!probe.includes('--no-sandbox'));
});
