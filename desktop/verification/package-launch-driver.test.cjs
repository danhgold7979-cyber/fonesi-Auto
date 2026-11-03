'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { transform, OBSERVERS } = require('./package-launch-driver.cjs');
const { seed, witness } = require('./package-launch-observer.cjs');
test('package instrumentation changes four entry locations plus the sole fixed-diagnostic catch and rejects changed source', () => {
  const core = fs.readFileSync(path.join(__dirname, '../launch/launch-core.ps1'), 'utf8');
  const copied = transform(core, 'C:\\Owned\\Package\\app', 'C:\\Owned\\Probe\\observers');
  assert.ok(copied.includes("$desktop='C:\\Owned\\Package\\app'"));
  assert.ok(copied.includes("$launchTools=Join-Path $desktop 'launch'"));
  assert.ok(copied.includes('package-launch-init-probe.cjs'));
  assert.ok(copied.includes('package-launch-main-probe.cjs'));
  assert.throws(() => transform(core + '\n', 'C:\\Owned', 'C:\\Probe'));
  assert.throws(() => transform(core.replace('120000', '120001'), 'C:\\Owned', 'C:\\Probe'));
  assert.equal(OBSERVERS.length, 5);
});
test('private stage control rejects extra keys, alias paths and out-of-root targets', () => {
  const root = path.resolve(__dirname, '../.test-output/owned');
  const value = {
    version: 1,
    stage: 'first-cancel',
    runRoot: root,
    runToken: '12345678-1234-1234-1234-123456789abc',
    packageRoot: path.join(root, 'relocated-package'),
    createParent: path.join(root, 'products'),
    managedRoot: null,
    selectedStore: null,
    backupParent: path.join(root, 'backups'),
    backupFile: null,
    restoreParent: path.join(root, 'restore-first'),
    retainedLaunchId: null,
  };
  assert.equal(seed(JSON.stringify(value)).stage, 'first-cancel');
  for (const bad of [
    { ...value, extra: true },
    { ...value, version: true },
    { ...value, backupParent: path.dirname(root) },
    { ...value, stage: 'unknown' },
    { ...value, runToken: value.runToken + '\n' },
  ])
    assert.throws(() => seed(JSON.stringify(bad)));
  assert.throws(() =>
    seed(JSON.stringify(value).replace('"version":1', '"version":0,"version":1')),
  );
});
test('observer default fields remain unobserved and only actual callbacks set evidence', () => {
  assert.deepEqual(witness({ stage: 'first-launch' }, 'auth', { closed: true }), {
    version: 1,
    stage: 'first-launch',
    kind: 'auth',
    ready: false,
    closed: true,
    quitRequested: false,
    opens: 0,
    confirms: 0,
    cancelled: false,
    sixTabsEmpty: false,
    settingsObserved: false,
  });
  for (const name of ['package-launch-init-probe.cjs', 'package-launch-main-probe.cjs']) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.doesNotMatch(
      source,
      /process\.argv\s*=|ELECTRON_RUN_AS_NODE|createSecretProvider|mockProvider/,
    );
    assert.match(source, /c\.packageRoot/);
    assert.match(source, /app\.on\('will-quit'/);
  }
});
test('package cleanup refuses unknown entries before touching any owned evidence', () => {
  const { cleanup } = require('./package-owned-files.cjs');
  const base = fs.realpathSync(path.join(__dirname, '../.test-output'));
  const root = fs.mkdtempSync(path.join(base, 'package-cleanup-'));
  const token = '12345678-1234-1234-1234-123456789abc';
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'unexpected.json'), 'private', { flag: 'wx' });
  try {
    assert.throws(() => cleanup(root));
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    assert.equal(fs.readFileSync(path.join(root, 'unexpected.json'), 'utf8'), 'private');
  } finally {
    fs.unlinkSync(path.join(root, 'unexpected.json'));
    fs.unlinkSync(path.join(root, '.owner'));
    fs.rmdirSync(root);
  }
});
test('bounded owned cleanup removes only the validated fixed metadata partition', () => {
  const { cleanup } = require('./package-owned-files.cjs');
  const base = fs.realpathSync(path.join(__dirname, '../.test-output'));
  const root = fs.mkdtempSync(path.join(base, 'package-cleanup-'));
  fs.writeFileSync(path.join(root, '.owner'), '12345678-1234-1234-1234-123456789abc', {
    flag: 'wx',
  });
  fs.writeFileSync(path.join(root, 'package-info.json'), '{}', { flag: 'wx' });
  cleanup(root);
  assert.equal(fs.existsSync(root), false);
});
test('fixed launch wrappers reset successful exit and native supervisor contains PATH and guard authority', () => {
  for (const name of ['Invoke-Desktop.ps1', 'Invoke-Package.ps1'])
    assert.match(fs.readFileSync(path.join(__dirname, '../launch', name), 'utf8'), /\nexit 0\n$/);
  const source = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  assert.ok(
    source.includes("SetEnvironmentVariable('PATH',[Environment]::SystemDirectory,'Process')"),
  );
  assert.ok(source.includes("$stage -ceq 'guard-denied'"));
  assert.ok(source.includes('[IO.FileShare]::None'));
  assert.ok(source.includes('120000,10000,32768'));
});
test('missing or malformed restored receipt prevents all cleanup including earlier validated files', () => {
  const { cleanup } = require('./package-owned-files.cjs');
  const base = fs.realpathSync(path.join(__dirname, '../.test-output'));
  const root = fs.mkdtempSync(path.join(base, 'package-cleanup-')),
    id = '12345678-1234-1234-1234-123456789abc';
  const parent = path.join(root, 'restore-first'),
    store = path.join(parent, 'fonesi-restore-' + id),
    data = path.join(store, 'data-' + id);
  for (const d of [parent, store, data]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(root, '.owner'), id, { flag: 'wx' });
  fs.writeFileSync(path.join(store, '.owner'), id, { flag: 'wx' });
  fs.writeFileSync(
    path.join(data, '.persistence-owner.json'),
    JSON.stringify({ version: 1, storeId: id, kind: 'RESTORED', restoreReceiptId: id }),
    { flag: 'wx' },
  );
  try {
    assert.throws(() => cleanup(root));
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), id);
    fs.writeFileSync(path.join(data, '.restore-receipt.json'), '{}', { flag: 'wx' });
    assert.throws(() => cleanup(root));
    assert.equal(fs.readFileSync(path.join(data, '.restore-receipt.json'), 'utf8'), '{}');
  } finally {
    fs.unlinkSync(path.join(data, '.restore-receipt.json'));
    fs.unlinkSync(path.join(data, '.persistence-owner.json'));
    fs.rmdirSync(data);
    fs.unlinkSync(path.join(store, '.owner'));
    fs.rmdirSync(store);
    fs.rmdirSync(parent);
    fs.unlinkSync(path.join(root, '.owner'));
    fs.rmdirSync(root);
  }
});
test('package control diagnostics forward only complete finite markers before unchanged admission', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  const diagnostic = source.slice(
    source.indexOf('function Show-ControlDiagnostic('),
    source.indexOf('function Node-Control('),
  );
  const values = (name) => {
    const raw = diagnostic.match(new RegExp(`\\$${name}=@\\(([^)]*)\\)`))[1];
    return [...raw.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  };
  const { OBSERVE_PHASES, OBSERVE_ERRORS } = require('./package-state-control.cjs');
  assert.deepEqual(values('phases'), [...OBSERVE_PHASES]);
  assert.deepEqual(values('codes'), [...OBSERVE_ERRORS, 'ENOENT', 'UNCLASSIFIED']);
  assert.ok(diagnostic.includes('$_ -ceq $literal'));
  assert.ok(diagnostic.includes('.Count -eq 1'));
  assert.ok(diagnostic.includes('if($shown -ge 2){break}'));
  assert.ok(diagnostic.includes('if(Retired $p)'));
  assert.ok(!diagnostic.includes('Write-Output $p.'));
  const call = source.slice(
    source.indexOf('function Node-Control('),
    source.indexOf('function Validate('),
  );
  assert.ok(call.indexOf('Show-ControlDiagnostic $p $marker') < call.indexOf('Require $p $marker'));
  assert.ok(call.includes('120000 @{}'));
});
test('complete capture predicate vector forwarding stays exactly aligned and bounded', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  const block = source.match(/\$captureVector=\[ordered\]@\{([\s\S]*?)\n {4}\}/)[1];
  const actual = Object.fromEntries(
    [...block.matchAll(/([A-Z_]+)=@\(([^)]*)\)/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([A-Z_]+)'/g)].map((v) => v[1]),
    ]),
  );
  const { CAPTURE_VECTOR } = require('./package-state-control.cjs');
  assert.deepEqual(actual, CAPTURE_VECTOR);
  assert.equal(Object.keys(actual).length, 23);
  assert.ok(source.includes('if($matched -eq 1 -and $captureShown -lt 23)'));
  assert.ok(source.includes("$literal='PACKAGE_CAPTURE_'+$key+'_'+$value"));
  assert.ok(source.includes('Where-Object {$_ -ceq $literal}'));
  assert.ok(!source.includes('Write-Output $p.Stderr'));
});
test('actual prepare materializes all eight raw scripts and binds their on-disk bytes', async () => {
  const { prepare, writeScript } = require('./package-launch-driver.cjs');
  const admission = require('../launch/package-admission.cjs');
  const originalVerify = admission.verifyPackage;
  const { LAUNCH } = await import('../scripts/build-package.mjs');
  const root = fs.realpathSync.native(
    fs.mkdtempSync(
      path.join(
        fs.realpathSync.native(path.join(__dirname, '../.test-output')),
        'package-materialized-',
      ),
    ),
  );
  const id = '12345678-1234-1234-1234-123456789abc',
    pkg = path.join(root, 'relocated-package'),
    outer = path.join(root, 'package-probe-first-cancel');
  const control = {
    version: 1,
    stage: 'first-cancel',
    runRoot: root,
    runToken: id,
    packageRoot: pkg,
    createParent: path.join(root, 'products'),
    managedRoot: null,
    selectedStore: null,
    backupParent: path.join(root, 'backups'),
    backupFile: null,
    restoreParent: path.join(root, 'restore-first'),
    retainedLaunchId: null,
  };
  const sourceWrapper = fs.readFileSync(
    path.join(__dirname, '../launch/Invoke-Package.ps1'),
    'utf8',
  );
  const sourceCore = fs.readFileSync(path.join(__dirname, '../launch/launch-core.ps1'), 'utf8');
  const created = [];
  const put = (file, raw) => {
    fs.writeFileSync(file, raw, { flag: 'wx' });
    created.push(file);
  };
  for (const dir of [pkg, path.join(pkg, 'app'), path.join(pkg, 'app/launch')]) fs.mkdirSync(dir);
  const archivePath = path.join(pkg, 'runtime/electron/resources/default_app.asar');
  for (const dir of ['runtime', 'runtime/electron', 'runtime/electron/resources'])
    fs.mkdirSync(path.join(pkg, dir));
  put(archivePath, 'synthetic archive bytes');
  const archiveRow = {
    path: 'runtime/electron/resources/default_app.asar',
    bytes: fs.statSync(archivePath).size,
    sha256: require('node:crypto')
      .createHash('sha256')
      .update(fs.readFileSync(archivePath))
      .digest('hex'),
  };
  put(path.join(root, '.owner'), id);
  put(path.join(root, 'package-stage-first-cancel.json'), JSON.stringify(control));
  put(path.join(pkg, 'Launch.ps1'), LAUNCH);
  put(path.join(pkg, 'app/launch/Invoke-Package.ps1'), sourceWrapper);
  put(path.join(pkg, 'app/launch/launch-core.ps1'), sourceCore);
  put(
    path.join(pkg, 'app/launch/package-admission.cjs'),
    'module.exports={verifyPackage(p){if(p!==' +
      JSON.stringify(pkg) +
      ')throw Error("SYNTHETIC_PACKAGE");return {files:[' +
      JSON.stringify(archiveRow) +
      ']};},digest(p){const b=require("node:fs").readFileSync(p);return {bytes:b.length,sha256:require("node:crypto").createHash("sha256").update(b).digest("hex")};},assertDataOutsidePackage(p,d){if(p!==' +
      JSON.stringify(pkg) +
      '||!d.startsWith(' +
      JSON.stringify(root + path.sep) +
      '))throw Error("SYNTHETIC_OUTSIDE");}};',
  );
  let admitted = 0;
  // Synthetic package admission only: exercise the real prepare/materialization path,
  // not native runtime provenance or package admission itself.
  admission.verifyPackage = (actual) => {
    assert.equal(actual, pkg);
    admitted++;
    return Object.freeze({ synthetic: true });
  };
  try {
    assert.equal(await prepare(root, 'first-cancel'), outer);
    assert.equal(admitted, 1);
    const intended = {
      'Launch.ps1': LAUNCH,
      'app/launch/Invoke-Package.ps1': sourceWrapper,
      'app/launch/launch-core.ps1': transform(
        sourceCore,
        path.join(pkg, 'app'),
        path.join(outer, 'observers'),
      ),
    };
    for (const name of OBSERVERS)
      intended['observers/' + name] = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.equal(Object.keys(intended).length, 8);
    const digest = (bytes) =>
      require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    const proof = JSON.parse(fs.readFileSync(path.join(outer, 'copy-proof.json'), 'utf8'));
    for (const [name, raw] of Object.entries(intended)) {
      const actual = fs.readFileSync(path.join(outer, name));
      assert.deepEqual(actual, Buffer.from(raw, 'utf8'));
      assert.notEqual(actual.toString('utf8'), JSON.stringify(raw));
      const expected = name.startsWith('observers/')
        ? proof.observerFiles[name.slice(10)]
        : name === 'app/launch/launch-core.ps1'
          ? proof.derivedCoreSha256
          : proof.originalFiles[name];
      assert.equal(digest(actual), expected);
    }
    assert.equal(proof.originalFiles['app/launch/launch-core.ps1'], digest(sourceCore));
    // Actual copied observer, actual copied dependency/read/require/layout/proof path.
    // Native environment/versions, ASAR virtual-directory facade and package admission are synthetic.
    // Physical archive bytes/stat/hash and all copied observer code are real owned files.
    const copiedObserver = require(path.join(outer, 'observers/package-launch-observer.cjs'));
    const oldEnv = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH };
    const versionKeys = ['electron', 'node', 'chrome'];
    const descriptors = Object.fromEntries(
      versionKeys.map((k) => [k, Object.getOwnPropertyDescriptor(process.versions, k)]),
    );
    const versions = require('./package-contract.cjs').VERSIONS;
    const archiveModule = require('node:module');
    const archiveLoad = archiveModule._load;
    const virtualFs = Object.create(fs);
    virtualFs.lstatSync = (file) =>
      file === archivePath
        ? { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }
        : fs.lstatSync(file);
    archiveModule._load = function (request, parent, isMain) {
      if (request === 'original-fs') return fs;
      if (request === 'node:fs') return virtualFs;
      return archiveLoad.call(this, request, parent, isMain);
    };
    try {
      process.env.SystemRoot = root;
      process.env.PATH = path.join(root, 'System32');
      for (const k of versionKeys)
        Object.defineProperty(process.versions, k, { value: versions[k], configurable: true });
      const actualAdmission = copiedObserver.admission(path.join(outer, 'observers'));
      assert.deepEqual(actualAdmission, { c: control, outer });
      const physicalAdapter = require(path.join(pkg, 'app/launch/package-admission.cjs'));
      assert.throws(
        () => copiedObserver.archiveWitness(pkg, { files: [] }, physicalAdapter),
        /PACKAGE_ASAR_WITNESS/,
      );
      for (const row of [
        { ...archiveRow, bytes: archiveRow.bytes + 1 },
        { ...archiveRow, sha256: '0'.repeat(64) },
      ])
        assert.throws(
          () => copiedObserver.archiveWitness(pkg, { files: [row] }, physicalAdapter),
          /PACKAGE_ASAR_WITNESS/,
        );
      const syntheticVirtualStat = virtualFs.lstatSync;
      virtualFs.lstatSync = fs.lstatSync;
      assert.throws(
        () => copiedObserver.archiveWitness(pkg, { files: [archiveRow] }, physicalAdapter),
        /PACKAGE_ASAR_WITNESS/,
      );
      virtualFs.lstatSync = syntheticVirtualStat;

      const Module = require('node:module');
      const originalLoad = Module._load;
      const nativeEntry = path.join(pkg, 'app/launch/persistence-initialize.cjs');
      const initControl = path.join(root, 'provision-control.json');
      put(initControl, JSON.stringify({ stage: 'provision', packageRoot: pkg }));
      put(nativeEntry, 'module.exports = {};');
      const previousControl = process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL;
      process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL = initControl;
      let nativeRequired = 0;
      const hooks = [];
      const electron = {
        app: {
          on(event, callback) {
            assert.equal(event, 'will-quit');
            hooks.push(callback);
          },
          exit() {
            throw Error('SYNTHETIC_UNEXPECTED_EXIT');
          },
        },
        dialog: {},
      };
      Module._load = function (request, parent, isMain) {
        if (request === 'electron') return electron;
        if (request === nativeEntry) nativeRequired++;
        return originalLoad.call(this, request, parent, isMain);
      };
      try {
        require(path.join(outer, 'observers/package-launch-init-probe.cjs'));
        assert.equal(nativeRequired, 1);
        assert.equal(hooks.length, 1);
        assert.deepEqual(
          await electron.dialog.showOpenDialog({
            title: 'Choose encrypted backup storage',
            properties: ['openDirectory'],
          }),
          { canceled: true, filePaths: [] },
        );
        hooks[0]();
        const witness = JSON.parse(
          fs.readFileSync(path.join(outer, 'observer-provision.json'), 'utf8'),
        );
        assert.equal(witness.opens, 1);
        assert.equal(witness.cancelled, true);
        assert.equal(witness.closed, true);
        fs.unlinkSync(path.join(outer, 'observer-provision.json'));
      } finally {
        Module._load = originalLoad;
        delete require.cache[nativeEntry];
        if (previousControl === undefined) delete process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL;
        else process.env.FONESI_PERSISTENCE_LAUNCH_CONTROL = previousControl;
      }
      process.env.PATH = 'not-the-admitted-path';
      assert.throws(
        () => copiedObserver.admission(path.join(outer, 'observers')),
        /PACKAGE_ENVIRONMENT/,
      );
      assert.deepEqual(copiedObserver.diagnostics(Error('private-path-secret')), [
        'PACKAGE_OBSERVER_PHASE_ENVIRONMENT',
        'PACKAGE_OBSERVER_REASON_UNCLASSIFIED',
      ]);
    } finally {
      archiveModule._load = archiveLoad;
      for (const k of Object.keys(oldEnv)) {
        if (oldEnv[k] === undefined) delete process.env[k];
        else process.env[k] = oldEnv[k];
      }
      for (const k of versionKeys) {
        if (descriptors[k]) Object.defineProperty(process.versions, k, descriptors[k]);
        else delete process.versions[k];
      }
      for (const name of OBSERVERS) delete require.cache[path.join(outer, 'observers', name)];
      delete require.cache[path.join(pkg, 'app/launch/package-admission.cjs')];
    }

    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(outer, 'control.json'), 'utf8')),
      control,
    );
    assert.throws(() => writeScript(path.join(outer, 'Launch.ps1'), 'overwrite'));
    assert.equal(fs.readFileSync(path.join(outer, 'Launch.ps1'), 'utf8'), LAUNCH);
    for (const raw of ['', 'x'.repeat(65537), '\ud800', {}])
      assert.throws(() => writeScript(path.join(outer, 'invalid.cjs'), raw));
    assert.equal(fs.existsSync(path.join(outer, 'invalid.cjs')), false);
  } finally {
    admission.verifyPackage = originalVerify;
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), id);
    for (const name of [
      ...OBSERVERS.map((n) => 'observers/' + n),
      'Launch.ps1',
      'app/launch/Invoke-Package.ps1',
      'app/launch/launch-core.ps1',
      'control.json',
      'copy-proof.json',
    ]) {
      const file = path.join(outer, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    for (const dir of ['observers', 'app/launch', 'app', '']) {
      const file = path.join(outer, dir);
      if (fs.existsSync(file)) fs.rmdirSync(file);
    }
    for (const file of created.reverse()) fs.unlinkSync(file);
    for (const dir of [
      path.join(pkg, 'runtime/electron/resources'),
      path.join(pkg, 'runtime/electron'),
      path.join(pkg, 'runtime'),
      path.join(pkg, 'app/launch'),
      path.join(pkg, 'app'),
      pkg,
      root,
    ])
      fs.rmdirSync(dir);
  }
});
test('verification-only catch diagnostics preserve original failure flow and exact finite forwarding', () => {
  const { CORE_DIAGNOSTICS } = require('./package-launch-driver.cjs');
  const original = fs.readFileSync(path.join(__dirname, '../launch/launch-core.ps1'), 'utf8');
  const derived = transform(original, 'C:\\Owned\\Package\\app', 'C:\\Owned\\Probe');
  assert.equal(original.includes('PACKAGE_CORE_'), false);
  assert.equal(derived.split('# Verification-only fixed diagnostics;').length, 2);
  assert.ok(derived.includes('    }catch{}\n    Write-Output $failure\n    exit 1\n}finally{'));
  assert.ok(derived.includes("$diagnosticReason='UNCLASSIFIED'"));
  assert.ok(!derived.includes('WriteLine($diagnosticError'));
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  const block = ps.match(/\$coreVector=\[ordered\]@\{([\s\S]*?)\n {4}\}/)[1];
  const actual = Object.fromEntries(
    [...block.matchAll(/([A-Z_]+)=@\(([^)]*)\)/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([A-Za-z0-9_]+)'/g)].map((v) => v[1]),
    ]),
  );
  assert.deepEqual(actual, CORE_DIAGNOSTICS);
  assert.equal(Object.keys(actual).length, 6);
  assert.ok(ps.includes('if($matches -eq 1 -and $shown -lt 6)'));
  assert.ok(ps.includes('Show-CoreDiagnostic $capture'));
});
test('journal diagnostics and direct native catch forwarding are bounded at the actual capture callsite', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  const block = source.match(/\$journalVector=\[ordered\]@\{([\s\S]*?)\n {4}\}/)[1];
  const actual = Object.fromEntries(
    [...block.matchAll(/([A-Z_]+)=@\(([^)]*)\)/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/'([A-Z_]+)'/g)].map((v) => v[1]),
    ]),
  );
  const { JOURNAL_VECTOR } = require('./package-state-control.cjs');
  assert.deepEqual(actual, JOURNAL_VECTOR);
  assert.equal(Object.keys(actual).length, 13);
  assert.ok(source.includes('if($matched -eq 1 -and $journalShown -lt 13)'));
  const invocation = source.indexOf('$capture=Launcher $arguments.ToArray()');
  const forwarding = source.indexOf('Show-CoreDiagnostic $capture', invocation);
  const observe = source.indexOf("$phase='OBSERVE'", invocation);
  assert.ok(invocation > 0 && forwarding > invocation && observe > forwarding);
  const fn = source.slice(
    source.indexOf('function Show-CoreDiagnostic('),
    source.indexOf('function Launcher('),
  );
  assert.ok(fn.includes("$p.Stderr -split '\\r?\\n'"));
  assert.ok(fn.includes('$_ -ceq $literal'));
  assert.ok(fn.includes('$matches -eq 1'));
  assert.ok(!fn.includes('Write-Output $p.'));
});

test('observer diagnostics use fixed phases and own data descriptors without leaking errors', () => {
  const observer = require('./package-launch-observer.cjs');
  observer.phase('INIT_CONTROL');
  assert.deepEqual(
    observer.diagnostics(
      Object.defineProperty({}, 'message', {
        get() {
          throw Error('private');
        },
      }),
    ),
    ['PACKAGE_OBSERVER_PHASE_INIT_CONTROL', 'PACKAGE_OBSERVER_REASON_UNCLASSIFIED'],
  );
  for (const error of [null, undefined, 'private', Error('C:\\private')])
    assert.equal(observer.diagnostics(error)[1], 'PACKAGE_OBSERVER_REASON_UNCLASSIFIED');
  assert.equal(
    observer.diagnostics(Object.assign(Error('private'), { code: 'MODULE_NOT_FOUND' }))[1],
    'PACKAGE_OBSERVER_REASON_MODULE_NOT_FOUND',
  );
  assert.equal(
    observer.diagnostics(new SyntaxError('private'))[1],
    'PACKAGE_OBSERVER_REASON_SYNTAX_ERROR',
  );
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-Package.ps1'), 'utf8');
  for (const [key, values] of [
    ['PHASE', observer.OBSERVER_PHASES],
    ['REASON', observer.OBSERVER_REASONS],
  ]) {
    const line = ps.match(new RegExp('        ' + key + '=@\\(([^)]*)\\)'));
    assert.ok(line);
    assert.deepEqual(
      [...line[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
      values,
    );
  }
});
test('native empty-domain observation preserves the actual Overview header and rejects actual record rows', () => {
  const { transformSync } = require('esbuild');
  const { runInNewContext } = require('node:vm');
  const { domainEmpty } = require('./package-launch-observer.cjs');
  const jsx = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
  const module = { exports: {} };
  runInNewContext(
    transformSync(fs.readFileSync(path.join(__dirname, '../src/ui/primary-pages.tsx'), 'utf8'), {
      loader: 'tsx',
      format: 'cjs',
      jsx: 'automatic',
    }).code,
    {
      module,
      exports: module.exports,
      require(name) {
        if (name === 'react') return { useState: (v) => [v, () => {}] };
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
        if (name === './ui-model.js') return { UI_EXPORT_ACTION: 'export' };
        if (name === './fleet-health.js') return { readFleetHealth: () => null };
        if (name === './ui-shared.tsx')
          return Object.fromEntries(
            ['UnavailableButton', 'EmptyPanel', 'PageHeader', 'StatCard'].map((k) => [
              k,
              (p) => jsx('section', p),
            ]),
          );
        throw Error('UNEXPECTED_COMPONENT_DEPENDENCY');
      },
    },
  );
  function documentFor(devices) {
    const tree = module.exports.OverviewPage({
      snapshot: {
        status: 'READY',
        provenance: 'SYNTHETIC_TEST',
        devices,
        accounts: [],
        media: [],
        jobs: [],
      },
      selectedDeviceId: '',
      onFocusDevice() {},
      onNavigate() {},
      onUnavailable() {},
    });
    const entries = [];
    function walk(value, parents = []) {
      if (Array.isArray(value)) {
        value.forEach((v) => {
          walk(v, parents);
        });
        return;
      }
      if (!value || typeof value !== 'object') return;
      entries.push({ value, parents });
      walk(value.props?.children, [...parents, value]);
    }
    walk(tree);
    const has = (v, c) =>
      String(v.props?.className ?? '')
        .split(/\s+/)
        .includes(c);
    return {
      querySelector() {
        return { classList: { contains: (name) => name === 'active' } };
      },
      getElementById() {
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '#workspace .device-row.header')
          return entries.filter(({ value }) => has(value, 'device-row') && has(value, 'header'));
        if (
          selector ===
          '#workspace .devlist-scroller .device-row,#workspace .account-row,#workspace .job-block,#workspace tbody .filecol'
        )
          return entries.filter(
            ({ value, parents }) =>
              (has(value, 'device-row') && parents.some((v) => has(v, 'devlist-scroller'))) ||
              has(value, 'account-row') ||
              has(value, 'job-block') ||
              (has(value, 'filecol') && parents.some((v) => v.type === 'tbody')),
          );
        throw Error('UNREVIEWED_SELECTOR');
      },
    };
  }
  const empty = documentFor([]);
  assert.equal(empty.querySelectorAll('#workspace .device-row.header').length, 1);
  assert.equal(domainEmpty(empty, 'overview'), true);
  const populated = documentFor([
    ...Array.from({ length: 3 }, (_, i) => ({
      id: 'synthetic-device-' + i,
      name: 'Synthetic ' + i,
      serial: 'synthetic-' + i,
      status: 'UNAVAILABLE',
      connection: 'UNAVAILABLE',
    })),
  ]);
  assert.equal(populated.querySelectorAll('#workspace .device-row.header').length, 1);
  assert.equal(domainEmpty(populated, 'overview'), false);
  const missingHeader = { ...empty, querySelectorAll: () => [] };
  assert.equal(domainEmpty(missingHeader, 'overview'), false);
  const probe = fs.readFileSync(path.join(__dirname, 'package-launch-main-probe.cjs'), 'utf8');
  assert.ok(probe.includes('domainEmpty.toString()'));
});
