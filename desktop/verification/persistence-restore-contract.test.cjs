'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { randomUUID } = require('node:crypto');
const {
  CASES,
  VERSIONS,
  control,
  result,
  descendant,
  sourceWitness,
} = require('./persistence-restore-contract.cjs');
const { prepare } = require('./persistence-restore-control.cjs');
const controlValue = () => ({
  version: 1,
  mode: 'source',
  runParentToken: randomUUID(),
  storeId: randomUUID(),
  restoreRoot: path.resolve('synthetic'),
  restoreParentToken: randomUUID(),
  ownerToken: randomUUID(),
  sourceOwnerToken: randomUUID(),
  sourceBackupId: randomUUID(),
  checkpoint: `key-checkpoint-${randomUUID()}.json`,
  sourceWitness: 'a'.repeat(64),
});
test('exact private canonical control rejects duplicate unknown IDs paths and boundary aliases', () => {
  const v = controlValue(),
    raw = JSON.stringify(v);
  assert.deepEqual(control(raw), v);
  for (const bad of [
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...v, extra: true }),
    JSON.stringify({ ...v, checkpoint: '../Local State' }),
    JSON.stringify({ ...v, ownerToken: null }),
    JSON.stringify({ ...v, restoreRoot: 'relative' }),
    ` ${raw}`,
  ])
    assert.throws(() => control(bad));
});
test('public result permits only exact fixed versions and boolean case set', () => {
  const v = {
    version: 1,
    scope: 'COPIED_PROFILE_RESTORE_REOPEN',
    mode: 'source',
    versions: VERSIONS,
    cases: Object.fromEntries(CASES.map((k) => [k, true])),
  };
  assert.deepEqual(result(JSON.stringify(v)), v);
  assert.throws(() => result(JSON.stringify({ ...v, privatePath: 'PRIVATE' })));
  assert.throws(() => result(JSON.stringify({ ...v, versions: { ...VERSIONS, node: '24.22.2' } })));
  v.cases.source_unchanged = false;
  assert.equal(result(JSON.stringify(v)).cases.source_unchanged, false);
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'persistence-restore-'));
  const storeId = randomUUID(),
    runParentToken = randomUUID(),
    sourceOwnerToken = randomUUID(),
    restoreParentToken = randomUUID(),
    sourceBackupId = randomUUID(),
    restoreReceiptId = randomUUID();
  const source = path.join(root, 'data-source');
  fs.mkdirSync(source);
  fs.mkdirSync(path.join(source, '.writer-lock'));
  fs.writeFileSync(path.join(root, '.owner'), runParentToken);
  fs.writeFileSync(
    path.join(source, '.persistence-owner.json'),
    JSON.stringify({ version: 1, storeId, kind: 'FRESH', restoreReceiptId: null }),
  );
  fs.writeFileSync(
    path.join(source, '.writer-lock', 'owner.json'),
    JSON.stringify({ version: 1, storeId, ownerToken: sourceOwnerToken }),
  );
  fs.writeFileSync(
    path.join(root, 'persistence-state-source.json'),
    JSON.stringify({
      version: 1,
      parentToken: runParentToken,
      ownerToken: sourceOwnerToken,
      storeId,
    }),
  );
  fs.writeFileSync(path.join(source, 'active.sqlite'), 'SYNTHETIC_DB_BYTES');
  fs.mkdirSync(path.join(source, 'key-profile'));
  const material = JSON.stringify({
    os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic-key-ciphertext').toString('base64') },
  });
  fs.writeFileSync(path.join(source, 'key-profile', 'Local State'), material);
  const selected = path.join(root, 'maintenance-restore-parent-source');
  fs.mkdirSync(selected);
  const parent = path.join(selected, `fonesi-restore-${randomUUID()}`);
  fs.mkdirSync(parent);
  fs.writeFileSync(path.join(parent, '.owner'), restoreParentToken);
  const restored = path.join(parent, `data-${storeId}`);
  fs.mkdirSync(restored);
  fs.writeFileSync(
    path.join(restored, '.persistence-owner.json'),
    JSON.stringify({ version: 1, storeId, kind: 'RESTORED', restoreReceiptId }),
  );
  fs.writeFileSync(
    path.join(restored, '.restore-receipt.json'),
    JSON.stringify({ version: 1, storeId, restoreReceiptId, quarantined: true }),
  );
  fs.writeFileSync(
    path.join(restored, 'restore-source.json'),
    JSON.stringify({ version: 1, storeId, backupId: sourceBackupId }),
  );
  fs.mkdirSync(path.join(restored, 'key-profile'));
  fs.writeFileSync(
    path.join(restored, 'key-profile', '.key-profile-owner.json'),
    JSON.stringify({ version: 1, storeId }),
  );
  fs.writeFileSync(path.join(restored, 'key-profile', 'Local State'), material);
  fs.writeFileSync(
    path.join(root, 'persistence-maintenance-restore-source.json'),
    JSON.stringify({ version: 1, storeId, restoreRoot: restored, sourceBackupId }),
  );
  return { root, source, restored, storeId, cleanup: () => fs.rmSync(root, { recursive: true }) };
}
test('owned control creates fresh retained restored lease/checkpoint without touching original material', async () => {
  const f = fixture();
  let stage = 'WITNESS';
  let failure = null;
  const report = (error) => {
    const allowed = [
      'RESTORE_OWNER',
      'RESTORE_PROVENANCE',
      'RESTORE_SOURCE',
      'RESTORE_CHECKPOINT',
      'BUILD_UNVERIFIED',
      'PERSISTENCE_FILES_REJECTED',
      'KEY_PROFILE_ID_REJECTED',
      'KEY_PROFILE_MATERIAL_REJECTED',
      'KEY_PROFILE_CHECKPOINT_FAILED',
      'ENOENT',
      'EACCES',
      'EPERM',
      'EBUSY',
      'ENAMETOOLONG',
      'ERR_ASSERTION',
    ];
    const code = allowed.includes(error?.code)
      ? error.code
      : allowed.includes(error?.message)
        ? error.message
        : 'UNKNOWN';
    console.log(`TEST_CONTEXT_RESTORE_${stage}`);
    console.log(`TEST_CONTEXT_CODE_${code}`);
  };
  try {
    const before = sourceWitness(f.source);
    stage = 'PREPARE';
    const c = await prepare(f.root, 'source');
    stage = 'ASSERTIONS';
    assert.equal(c.restoreRoot, f.restored);
    assert.equal(sourceWitness(f.source), before);
    assert.equal(
      fs.readFileSync(path.join(f.restored, c.checkpoint), 'utf8'),
      fs.readFileSync(path.join(f.restored, 'key-profile', 'Local State'), 'utf8'),
    );
    assert.equal(fs.existsSync(path.join(f.restored, '.writer-lock', 'owner.json')), true);
    stage = 'REPEAT_DENIAL';
    await assert.rejects(prepare(f.root, 'source'));
  } catch (error) {
    report(error);
    failure = error;
  } finally {
    stage = 'CLEANUP';
    try {
      f.cleanup();
    } catch (error) {
      report(error);
      failure ??= error;
    }
  }
  if (failure) throw failure;
});
test('missing/corrupt copied material fail preflight without original key mutations or native startup', async () => {
  for (const missing of [true, false]) {
    const f = fixture();
    try {
      const before = sourceWitness(f.source),
        file = path.join(f.restored, 'key-profile', 'Local State');
      if (missing) fs.unlinkSync(file);
      else fs.writeFileSync(file, '{}');
      await assert.rejects(prepare(f.root, 'source'));
      assert.equal(sourceWitness(f.source), before);
      assert.equal(
        fs.existsSync(path.join(f.root, 'persistence-restore-control-source.json')),
        false,
      );
    } finally {
      f.cleanup();
    }
  }
});
test('descendant confinement and immutable restore receipt reject foreign roots before lease acquisition', async () => {
  const f = fixture();
  try {
    assert.throws(() => descendant(f.root, 'source', f.source, f.storeId));
    fs.writeFileSync(path.join(f.restored, '.restore-receipt.json'), '{}');
    await assert.rejects(prepare(f.root, 'source'));
    assert.equal(fs.existsSync(path.join(f.restored, '.writer-lock')), false);
  } finally {
    f.cleanup();
  }
});

test('lock inventory reads only the exact owner entry plus sentinel', () => {
  const { oneOwner } = require('./persistence-restore-contract.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-lock-'));
  try {
    assert.equal(oneOwner(root), false);
    fs.writeFileSync(path.join(root, 'owner.json'), '{}');
    assert.equal(oneOwner(root), true);
    fs.writeFileSync(path.join(root, 'unexpected'), 'PRIVATE');
    assert.equal(oneOwner(root), false);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
