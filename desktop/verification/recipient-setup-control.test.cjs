'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  vm = require('node:vm'),
  { createRequire } = require('node:module');
const api = require('./recipient-setup-control.cjs');
const desktop = path.resolve(__dirname, '..'),
  sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fixture() {
  const base = fs.realpathSync.native(path.join(desktop, '.test-output')),
    parent = fs.mkdtempSync(path.join(base, 'recipient-control-')),
    container = path.join(parent, '.recipient-setup-runtime');
  fs.mkdirSync(container);
  const root = path.join(container, 'run-' + crypto.randomUUID());
  fs.mkdirSync(root);
  const token = crypto.randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  return {
    root,
    close() {
      assert.equal(fs.realpathSync.native(parent), parent);
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
      fs.rmSync(parent, { recursive: true, force: false });
    },
  };
}
test('exact four substitutions materialize original raw launcher and proof without shell quoting corruption', () => {
  const f = fixture();
  try {
    const wrapper = fs.readFileSync(path.join(desktop, 'launch/Invoke-Desktop.ps1'), 'utf8'),
      original = fs.readFileSync(path.join(desktop, 'launch/launch-core.ps1'), 'utf8'),
      derived = api.transform(original, desktop),
      proof = {
        version: 1,
        wrapperSha: sha(wrapper),
        originalSha: sha(original),
        derivedSha: sha(derived),
        substitutions: 4,
        sources: {},
      };
    api.materialize(f.root, { wrapper, derived, proof });
    assert.equal(
      fs.readFileSync(path.join(f.root, 'Invoke-Desktop.instrumented.ps1'), 'utf8'),
      wrapper,
    );
    assert.equal(fs.readFileSync(path.join(f.root, 'launch-core.ps1'), 'utf8'), derived);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json'))), proof);
    assert.ok(derived.includes('verification/recipient-setup-main-probe.cjs'));
    assert.ok(derived.includes('verification/persistence-launch-init-probe.cjs'));
    assert.throws(() => api.transform(original + '# drift', desktop));
    assert.throws(() => api.materialize(f.root, { wrapper, derived, proof }));
  } finally {
    f.close();
  }
});
test('actual exact-size archive custody creates one-byte wrong-hash copy without modifying original (synthetic pin only)', () => {
  const f = fixture();
  try {
    const filename = path.join(__dirname, 'recipient-setup-control.cjs'),
      source = fs.readFileSync(filename, 'utf8'),
      bytes = Buffer.alloc(8044989, 37),
      syntheticSha = sha(bytes),
      realSha = '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';
    assert.equal(source.split(realSha).length, 2);
    const module = { exports: {} };
    vm.runInNewContext(
      source.replace(realSha, syntheticSha),
      {
        module,
        exports: module.exports,
        require: createRequire(filename),
        __dirname,
        Buffer,
        TextDecoder,
        console,
        process,
      },
      { filename },
    );
    const local = module.exports,
      input = path.join(f.root, 'synthetic-input.zip');
    fs.writeFileSync(input, bytes, { flag: 'wx' });
    local.archiveInputs(f.root, input);
    assert.equal(local.verifyArchives(f.root), true);
    assert.deepEqual(fs.readFileSync(input), bytes);
    const wrong = fs.readFileSync(path.join(f.root, 'wrong-hash.zip'));
    assert.equal(wrong.length, bytes.length);
    assert.equal(wrong[0], bytes[0] ^ 1);
    assert.deepEqual(wrong.subarray(1), bytes.subarray(1));
    const fd = fs.openSync(path.join(f.root, 'wrong-hash.zip'), 'r+');
    try {
      fs.writeSync(fd, Buffer.from([1]), 0, 1, 1);
    } finally {
      fs.closeSync(fd);
    }
    assert.throws(() => local.verifyArchives(f.root));
    assert.deepEqual(fs.readFileSync(input), bytes);
  } finally {
    f.close();
  }
});
test('launch witness binds real profile files and metadata, refuses aliases and limits', () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID(),
      launch = path.join(f.root, 'launch-' + id);
    fs.mkdirSync(launch);
    fs.writeFileSync(path.join(launch, 'meta.json'), '{}');
    const profile = path.join(launch, `fonesi-auto-foundation-${id}-main`);
    fs.mkdirSync(profile);
    fs.writeFileSync(path.join(profile, '.owner'), 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n');
    fs.writeFileSync(path.join(profile, 'state'), 'synthetic');
    const before = api.launchWitness(launch);
    assert.equal(before.length, 4);
    const empty = path.join(profile, 'empty');
    fs.mkdirSync(empty);
    assert.notDeepEqual(api.launchWitness(launch), before);
    fs.rmdirSync(empty);
    assert.deepEqual(api.launchWitness(launch), before);
    fs.writeFileSync(path.join(profile, 'state'), 'changed');
    assert.notDeepEqual(api.launchWitness(launch), before);
    fs.mkdirSync(path.join(launch, 'unknown'));
    assert.throws(() => api.launchWitness(launch));
  } finally {
    f.close();
  }
});
test('data cleanup budget is disjoint from provisioning and preserves files on refusal', () => {
  const f = fixture();
  try {
    const data = path.join(f.root, 'data');
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, 'active.sqlite'), 'synthetic');
    const provisioning = path.join(data, 'platform-tools-runtime');
    fs.mkdirSync(provisioning);
    fs.writeFileSync(path.join(provisioning, 'opaque'), 'not part of this partition');
    const plan = api.otherDataPlan(data);
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.entries[0].name, 'active.sqlite');
    const target = path.join(data, 'alias');
    fs.symlinkSync(path.join(data, 'active.sqlite'), target);
    assert.throws(() => api.otherDataPlan(data));
    assert.equal(fs.readFileSync(path.join(data, 'active.sqlite'), 'utf8'), 'synthetic');
  } finally {
    f.close();
  }
});
test('fixed diagnostics cannot expose supplied paths or exception text', () => {
  for (const error of [
    Error('PRIVATE_CANARY/path'),
    {
      get message() {
        throw Error('getter');
      },
    },
  ]) {
    const lines = api.diagnostics('unknown', error);
    assert.equal(
      lines.some((x) => x.includes('PRIVATE_CANARY')),
      false,
    );
    assert.deepEqual(lines, [
      'RECIPIENT_SETUP_CONTROL_PHASE_ARGUMENT',
      'RECIPIENT_SETUP_CONTROL_REASON_UNCLASSIFIED',
    ]);
  }
});
test('real SQLite first/reopen startup tuples cannot be interchanged (synthetic prerequisite receipts)', async () => {
  const f = fixture();
  let db;
  try {
    const actual = await import('../src/main/foundation-database.ts'),
      data = path.join(f.root, 'data');
    fs.mkdirSync(data);
    const storeId = crypto.randomUUID(),
      ids = [];
    db = new actual.FoundationDatabase(path.join(data, 'active.sqlite'), storeId);
    await db.migrate(async (version) => {
      const file = path.join(f.root, `snapshot-${version}.sqlite`);
      await db.snapshot(file);
      const copy = new actual.FoundationDatabase(file, storeId, true);
      try {
        const backupId = crypto.randomUUID();
        ids.push(backupId);
        return { backupId, schemaVersion: version, fingerprint: copy.fingerprint() };
      } finally {
        copy.close();
      }
    }, 1000);
    const source = fs.readFileSync(path.join(__dirname, 'recipient-setup-control.cjs'), 'utf8'),
      module = { exports: {} },
      normal = createRequire(path.join(__dirname, 'recipient-setup-control.cjs')),
      schema = normal('./fleet-ui-schema4.cjs');
    const req = (name) =>
      name === '../build/foundation-database.cjs'
        ? actual
        : name === './fleet-ui-schema4.cjs'
          ? { ...schema, receipts: () => ids.map((backupId) => ({ header: { backupId } })) }
          : normal(name);
    vm.runInNewContext(
      source,
      {
        module,
        exports: module.exports,
        require: req,
        __dirname,
        Buffer,
        TextDecoder,
        console,
        process,
      },
      { filename: 'recipient-setup-control.synthetic-dependencies.cjs' },
    );
    const commit = (kind, epoch) => {
      const before = db.readDurable();
      const result = db.commitDurable(
        before.meta.revision,
        {
          operationId: crypto.randomUUID(),
          kind,
          utc: 1001,
          hostEpoch: epoch,
          devices: { insert: [], update: [] },
          bindings: { insert: [], refresh: [], retireIds: [] },
          identityEvidence: { insert: [] },
          captures: { insert: [], transition: [] },
          holds: { insert: [], releaseIds: [] },
        },
        () => {},
      );
      assert.equal(result.ok, true);
    };
    commit('STARTUP', 1);
    commit('CAPTURE', 1);
    db.close();
    db = undefined;
    module.exports.inspectDatabase(data, storeId, false);
    assert.throws(
      () => module.exports.inspectDatabase(data, storeId, true),
      /RECIPIENT_SETUP_SCHEMA/,
    );
    db = new actual.FoundationDatabase(path.join(data, 'active.sqlite'), storeId);
    commit('STARTUP', 2);
    commit('CAPTURE', 2);
    db.close();
    db = undefined;
    module.exports.inspectDatabase(data, storeId, true);
    assert.throws(
      () => module.exports.inspectDatabase(data, storeId, false),
      /RECIPIENT_SETUP_SCHEMA/,
    );
  } finally {
    db?.close();
    f.close();
  }
});

test('authenticated schema4 observation is exact and cannot infer omitted or extra proof', () => {
  const value = {
    version: 2,
    migration3BackupAuthenticated: true,
    migration4ReceiptBound: true,
    durableStartupCommitted: true,
    captureStoreEmpty: true,
  };
  assert.equal(api.assertSchema4Observed(value), true);
  for (const key of Object.keys(value)) {
    const missing = { ...value };
    delete missing[key];
    assert.throws(() => api.assertSchema4Observed(missing));
  }
  assert.throws(() => api.assertSchema4Observed({ ...value, private: 'raw' }));
  assert.throws(() =>
    api.assertSchema4Observed({ ...value, migration3BackupAuthenticated: false }),
  );
});
