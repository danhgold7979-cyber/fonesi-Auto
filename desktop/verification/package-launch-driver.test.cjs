'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { transform, OBSERVERS } = require('./package-launch-driver.cjs');
const { seed, witness } = require('./package-launch-observer.cjs');
test('package instrumentation changes exactly four audited core locations and rejects changed source', () => {
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
