'use strict';
// Actual materialization and owned files; package/build semantic admission is explicitly synthetic here.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  { createRequire } = require('node:module'),
  { randomUUID, createHash } = require('node:crypto');
const file = path.join(__dirname, 'retained-rollback-control.cjs'),
  api = require(file),
  c = require('./retained-rollback-contract.cjs'),
  base = require('./retained-host-control.cjs');
const hash = (b) => createHash('sha256').update(b).digest('hex');
function fixture() {
  const parent = fs.mkdtempSync(
      path.join(
        fs.realpathSync.native(path.join(__dirname, '../.test-output')),
        'rollback-control-',
      ),
    ),
    desktop = path.join(parent, 'd'),
    root = path.join(desktop, '.retained-host-runtime/r'),
    token = randomUUID();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  return {
    parent,
    desktop,
    root,
    token,
    close() {
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
      assert.equal(fs.realpathSync.native(parent), parent);
      fs.rmSync(parent, { recursive: true, force: false });
    },
  };
}
function load(f) {
  const realRequire = createRequire(file),
    packageRoot = path.join(f.root, 'relocated-package'),
    appRoot = path.join(packageRoot, 'app');
  for (const root of [f.desktop, appRoot]) {
    for (const dir of ['launch', 'build']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const name of ['launch-core.ps1', 'Invoke-Desktop.ps1', 'Invoke-Package.ps1'])
      fs.copyFileSync(path.join(__dirname, '../launch', name), path.join(root, 'launch', name));
    fs.copyFileSync(path.join(__dirname, '../build/main.cjs'), path.join(root, 'build/main.cjs'));
    fs.writeFileSync(
      path.join(root, 'build/.verified-build.json'),
      JSON.stringify({
        schema: 1,
        inputs: {
          'launch/launch-core.ps1': hash(
            fs.readFileSync(path.join(root, 'launch/launch-core.ps1')),
          ),
        },
        outputs: { 'main.cjs': hash(fs.readFileSync(path.join(root, 'build/main.cjs'))) },
      }),
    );
  }
  fs.mkdirSync(path.join(f.desktop, 'verification'), { recursive: true });
  const descriptor = {
    packageRoot,
    appRoot,
    buildRoot: path.join(appRoot, 'build'),
    sourceHead: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    zipSha256: 'c'.repeat(64),
    zipBytes: 20,
    manifestSha256: 'd'.repeat(64),
  };
  const packageHelper = {
    pathBudget: () => true,
    admitPackage: () => descriptor,
    prepareBinding(root) {
      assert.equal(root, f.root);
      fs.writeFileSync(
        path.join(root, 'package-binding.json'),
        JSON.stringify({ synthetic: true }),
        { flag: 'wx' },
      );
      return descriptor;
    },
  };
  const localContract = {
    ...c,
    deriveMain(raw, observer, stage) {
      assert.equal(observer, path.join(f.desktop, 'verification/retained-rollback-main-probe.cjs'));
      return c
        .deriveMain(raw, path.join(__dirname, 'retained-rollback-main-probe.cjs'), stage)
        .replaceAll(
          JSON.stringify(path.join(__dirname, 'retained-rollback-main-probe.cjs')),
          JSON.stringify(observer),
        );
    },
  };
  const module = { exports: {} },
    a = Buffer.from('SYNTHETIC ARCHIVE 36'),
    b = Buffer.from('SYNTHETIC ARCHIVE 37');
  let source = fs
    .readFileSync(file, 'utf8')
    .replace('bytes: 7138784', 'bytes: ' + a.length)
    .replace('bytes: 8044989', 'bytes: ' + b.length)
    .replace(api.ARCHIVES[0].sha256, hash(a))
    .replace(api.ARCHIVES[1].sha256, hash(b));
  const gate = "await import('../scripts/build-manifest.mjs')";
  assert.equal(source.split(gate).length, 2);
  source = source.replace(gate, "require('synthetic-build-admission')");
  vm.runInNewContext(
    source,
    {
      module,
      exports: module.exports,
      __dirname: path.join(f.desktop, 'verification'),
      Buffer,
      TextDecoder,
      console,
      process,
      require(name) {
        if (name === 'synthetic-build-admission') return { verifyBuild: () => true };
        if (name === './retained-rollback-contract.cjs') return localContract;
        if (name === './retained-host-control.cjs') return { ...base, SOURCES: [] };
        if (name === './main-runtime-version-package.cjs') return packageHelper;
        return realRequire(name);
      },
    },
    { filename: file, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
  );
  const control = module.exports;
  for (const name of control.SOURCES) {
    const target = path.join(f.desktop, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, 'SYNTHETIC SOURCE ' + name);
  }
  fs.writeFileSync(
    path.join(f.root, 'managed-evidence.json'),
    JSON.stringify({ version: 2, groupsPassed: 10, passed: true }),
    { flag: 'wx' },
  );
  const archives = [path.join(f.parent, 'prior.zip'), path.join(f.parent, 'current.zip')];
  fs.writeFileSync(archives[0], a);
  fs.writeFileSync(archives[1], b);
  return { control, archives, descriptor, localContract };
}
test('actual prepare materializes both raw wrapper/core pairs and binds disk hashes, originals, archives and seed target', async () => {
  const f = fixture();
  try {
    const { control, archives } = load(f);
    await control.prepare(f.root, ...archives, 'a'.repeat(40), 'b'.repeat(40));
    assert.equal(control.verify(f.root).scope, c.SCOPE);
    for (const mode of ['SEED', 'PACKAGE']) {
      const proof = JSON.parse(fs.readFileSync(path.join(f.root, 'copy-' + mode + '.json'))),
        dir = path.join(f.root, 'scripts-' + mode),
        wrapper = fs.readFileSync(
          path.join(dir, `Invoke-${mode === 'SEED' ? 'Desktop' : 'Package'}.instrumented.ps1`),
        ),
        core = fs.readFileSync(path.join(dir, 'launch-core.ps1'));
      assert.equal(hash(wrapper), proof.wrapperSha256);
      assert.equal(hash(core), proof.derivedCoreSha256);
      assert.ok(core.toString().startsWith('#'));
      assert.notEqual(core[0], 34);
      assert.equal(proof.substitutions, 4);
      assert.equal(proof.seedTargetSubstitutions, mode === 'SEED' ? 1 : 0);
    }
    assert.throws(() => control.prepareStage(f.root, 'UPGRADE'));
    const plan = control.prepareStage(f.root, 'SEED');
    assert.equal(plan.wrapper, 'scripts-SEED/Invoke-Desktop.instrumented.ps1');
    assert.deepEqual(Object.keys(plan), [
      'version',
      'stage',
      'managedRoot',
      'wrapper',
      'previousLaunchIds',
      'originalMainSha256',
      'derivedMainSha256',
      'expectedTargetVersion',
      'expectedActiveVersion',
      'installationRevision',
      'archiveFile',
    ]);
    assert.ok(fs.statSync(path.join(f.root, 'first-use')).isDirectory());
    assert.throws(() => control.prepareStage(f.root, 'SEED'));
    fs.appendFileSync(archives[0], 'changed');
    assert.throws(() => control.verify(f.root));
  } finally {
    f.close();
  }
});
test('actual prepare refuses existing campaign, changed source, byte-pin mismatch and wrong root without replacement', async () => {
  for (const negative of ['collision', 'source', 'archive', 'root']) {
    const f = fixture();
    try {
      const { control, archives } = load(f);
      if (negative === 'archive') {
        fs.appendFileSync(archives[1], 'tamper');
        await assert.rejects(control.prepare(f.root, ...archives, 'a'.repeat(40), 'b'.repeat(40)));
      } else if (negative === 'root') {
        await assert.rejects(
          control.prepare(path.dirname(f.root), ...archives, 'a'.repeat(40), 'b'.repeat(40)),
        );
      } else {
        await control.prepare(f.root, ...archives, 'a'.repeat(40), 'b'.repeat(40));
        const before = fs.readFileSync(path.join(f.root, 'campaign.json'));
        if (negative === 'collision')
          await assert.rejects(
            control.prepare(f.root, ...archives, 'a'.repeat(40), 'b'.repeat(40)),
          );
        else {
          fs.appendFileSync(path.join(f.desktop, control.SOURCES[0]), 'changed');
          assert.throws(() => control.verify(f.root));
        }
        assert.deepEqual(fs.readFileSync(path.join(f.root, 'campaign.json')), before);
      }
    } finally {
      f.close();
    }
  }
});
test('closed source closure and outer stages use identical finite schema and preserve old campaign', () => {
  const outer = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedRollbackCheck.ps1'), 'utf8');
  for (const phase of c.PHASES) assert.ok(outer.includes("'" + phase + "'"));
  for (const reason of c.REASONS) assert.ok(outer.includes("'" + reason + "'"));
  for (const source of api.SOURCES)
    assert.ok(fs.existsSync(path.join(__dirname, '..', source)), source);
  assert.match(outer, /240000,10000,32768/);
  assert.match(outer, /'PATH',\[Environment\]::SystemDirectory/);
  assert.match(outer, /'managed-gate'/);
  assert.match(outer, /scripts-SEED\/Invoke-Desktop.instrumented.ps1/);
  assert.match(outer, /scripts-PACKAGE\/Invoke-Package.instrumented.ps1/);
});
test('actual SQLite stage inspection distinguishes durable epochs 1..4 and revisions 2,4,6,8', async () => {
  const f = fixture(),
    data = path.join(f.parent, 'data'),
    storeId = randomUUID();
  fs.mkdirSync(data);
  const filename = path.join(data, 'active.sqlite'),
    dbModule = require('../build/foundation-database.cjs'),
    db = new dbModule.FoundationDatabase(filename, storeId),
    receipts = [];
  try {
    await db.migrate(async (version) => {
      const snapshot = path.join(f.parent, `snapshot-${version}.sqlite`);
      await db.snapshot(snapshot);
      const opened = new dbModule.FoundationDatabase(snapshot, storeId, true);
      try {
        const backupId = randomUUID();
        receipts[version] = { header: { backupId } };
        return { backupId, fingerprint: opened.fingerprint(), schemaVersion: version };
      } finally {
        opened.close();
      }
    }, 1000);
    const module = { exports: {} },
      real = createRequire(file),
      schema = { receipts: () => receipts },
      packageHelper = {
        admitPackage: () => Object.freeze({ syntheticPackageAdmission: true }),
        loadBuild: (_p, name) => {
          assert.equal(name, 'foundation-database.cjs');
          return dbModule;
        },
      };
    vm.runInNewContext(
      fs.readFileSync(file, 'utf8'),
      {
        module,
        exports: module.exports,
        __dirname,
        Buffer,
        TextDecoder,
        console,
        process,
        require(name) {
          if (name === './fleet-ui-schema4.cjs') return schema;
          if (name === './main-runtime-version-package.cjs') return packageHelper;
          return real(name);
        },
      },
      { filename: file },
    );
    const local = module.exports,
      s = {
        managed: path.join(f.root, 'first-use/Fonesi-Auto-' + randomUUID()),
        header: { dataRoot: data, storeId },
      };
    let revision = 0;
    for (const stage of c.STAGES) {
      const epoch = c.EXPECTED[stage].epoch;
      for (const kind of ['STARTUP', 'CAPTURE']) {
        const d = {
          operationId: randomUUID(),
          kind,
          utc: 1000 + revision + 1,
          hostEpoch: epoch,
          devices: { insert: [], update: [] },
          bindings: { insert: [], refresh: [], retireIds: [] },
          identityEvidence: { insert: [] },
          captures: { insert: [], transition: [] },
          holds: { insert: [], releaseIds: [] },
        };
        assert.equal(db.commitDurable(revision, d, () => {}).ok, true);
        revision++;
      }
      assert.doesNotThrow(() => local.inspectDatabase(s, stage));
      for (const wrong of c.STAGES.filter((name) => name !== stage))
        assert.throws(() => local.inspectDatabase(s, wrong));
    }
  } finally {
    db.close();
    f.close();
  }
});
test('literal local dependency closure is bound by campaign sources or verified production build inputs/outputs', () => {
  const desktop = path.resolve(__dirname, '..'),
    marker = JSON.parse(fs.readFileSync(path.join(desktop, 'build/.verified-build.json'))),
    bound = new Set([
      ...api.SOURCES,
      ...Object.keys(marker.inputs),
      ...Object.keys(marker.outputs).map((n) => 'build/' + n),
    ]),
    seen = new Set();
  function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:require\(|import\()\s*['"](\.[^'"]+)['"]/g)) {
      const next = path.resolve(path.dirname(file), match[1]),
        relative = path.relative(desktop, next).split(path.sep).join('/');
      assert.ok(bound.has(relative), relative);
      if (relative.startsWith('verification/') && next.endsWith('.cjs')) visit(next);
    }
  }
  visit(path.join(__dirname, 'retained-rollback-control.cjs'));
  visit(path.join(__dirname, 'retained-rollback-main-probe.cjs'));
});
