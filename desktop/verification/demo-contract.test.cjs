'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VERSIONS, MODES, caseNames, imageSpecs, validateResult } = require('./demo-contract.cjs');
function fixture(mode) {
  return {
    version: 1,
    mode,
    versions: VERSIONS,
    cases: Object.fromEntries(caseNames(mode).map((name) => [name, true])),
    images: imageSpecs(mode).map((spec) => ({ ...spec, bytes: 100, sha256: 'a'.repeat(64) })),
  };
}
test('demo evidence declares exact five fixed screenshots and closed modes', () => {
  assert.equal(MODES.flatMap(imageSpecs).length, 5);
  assert.equal(new Set(MODES.flatMap(imageSpecs).map((row) => row.name)).size, 5);
  for (const mode of MODES) assert.equal(validateResult(JSON.stringify(fixture(mode))).mode, mode);
  assert.throws(() => imageSpecs('foreign'));
});
test('fixed demo report rejects caller fields, wrong geometry and truthy nonbooleans', () => {
  for (const mode of MODES) {
    assert.throws(() =>
      validateResult(JSON.stringify({ ...fixture(mode), private: 'never public' })),
    );
    const wrong = fixture(mode);
    wrong.images[0].width = 1024;
    assert.throws(() => validateResult(JSON.stringify(wrong)));
    const bad = fixture(mode);
    bad.cases[caseNames(mode)[0]] = 1;
    assert.throws(() => validateResult(JSON.stringify(bad)));
    const falseCase = fixture(mode);
    falseCase.cases[caseNames(mode)[0]] = false;
    assert.equal(validateResult(JSON.stringify(falseCase)).cases[caseNames(mode)[0]], false);
  }
});

test('derived observer transformation preserves every original byte and rejects ambiguous anchors', () => {
  const { instrument, INJECTION } = require('./demo-control.cjs');
  const original = Buffer.from(
    '// demo-owned:demo/main.ts\nvar import_electron = require("electron");\nconst unchanged=1;\n',
  );
  const derived = instrument(original);
  assert.equal(derived.toString().replace(INJECTION, ''), original.toString());
  assert.equal(derived.toString().split(INJECTION).length, 2);
  for (const bad of [
    'const changed=1;',
    '// demo-owned:demo/main.ts\nvar import_electron = require("electron");\n// demo-owned:demo/main.ts\nvar import_electron = require("electron");\n',
    '\ufeff// demo-owned:demo/main.ts\nvar import_electron = require("electron");\n',
  ])
    assert.throws(() => instrument(Buffer.from(bad)));
  assert.throws(() => instrument(derived));
});
test('developer launcher keeps interactive lifetime separate and ownership before bounded deletion', () => {
  const fs = require('node:fs'),
    path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../launch/Invoke-Demo.ps1'), 'utf8');
  assert.match(source, /param\(\)/);
  assert.match(source, /RunInteractive\(\$Exe,\$Arguments\)/);
  assert.match(source, /demo-build\/main\.cjs'\),'--demo'/);
  assert.match(source, /\$names.Count -ge 3/);
  assert.doesNotMatch(source, /@\(\[IO.Directory\]::EnumerateFileSystemEntries\(\$owned\)\)/);
  assert.ok(
    source.indexOf('if(-not $allClean)') < source.indexOf('[IO.File]::Delete($entry.FullName)'),
  );
  assert.match(source, /8L\*1024\*1024/);
  assert.doesNotMatch(source, /Remove-Item|Recurse|RunCmd/);
});

test('actual reviewed demo output prepares both derived copies without executing application code', async () => {
  const fs = require('node:fs'),
    path = require('node:path');
  const { randomUUID, createHash } = require('node:crypto');
  const { prepare, INJECTION } = require('./demo-control.cjs');
  const parent = path.resolve(__dirname, '../.test-output');
  assert.equal(fs.lstatSync(parent).isDirectory(), true);
  assert.equal(fs.lstatSync(parent).isSymbolicLink(), false);
  assert.equal(fs.realpathSync.native(parent), parent);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(parent, 'demo-prepare-')));
  const token = randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  const original = fs.readFileSync(path.resolve(__dirname, '../demo-build/main.cjs'));
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  try {
    for (const mode of ['source', 'package']) {
      const outer = await prepare(root, mode);
      const derived = fs.readFileSync(path.join(outer, 'demo-build/main.cjs'));
      assert.equal(derived.toString().split(INJECTION).length, 2);
      assert.deepEqual(Buffer.from(derived.toString().replace(INJECTION, '')), original);
      const proof = JSON.parse(
        fs.readFileSync(path.join(outer, '.verification-provenance.json'), 'utf8'),
      );
      const manifest = JSON.parse(
        fs.readFileSync(path.join(outer, 'demo-build/.verified-demo-build.json'), 'utf8'),
      );
      assert.equal(proof.originalMainSha256, hash(original));
      assert.equal(proof.derivedMainSha256, hash(derived));
      assert.equal(manifest.outputs['main.cjs'], hash(derived));
      assert.deepEqual(fs.readdirSync(path.join(outer, 'session')).sort(), [
        '.demo-owner.json',
        'profile',
      ]);
      assert.deepEqual(fs.readdirSync(path.join(outer, 'session/profile')), []);
      await assert.rejects(prepare(root, mode));
    }
  } finally {
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
    assert.equal(fs.realpathSync.native(root), root);
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    fs.rmSync(root, { recursive: true, force: false });
  }
});

test('copied demo runtime preserves official executable identity and packaged-app refusal', () => {
  const fs = require('node:fs'),
    path = require('node:path');
  const supervisor = fs.readFileSync(path.join(__dirname, 'Invoke-Demo.ps1'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '../demo/main.ts'), 'utf8');
  assert.match(supervisor, /\$packageExe=Join-Path \$package 'electron\.exe'/);
  assert.doesNotMatch(supervisor, /AutoDemo\.exe|\[IO\.File\]::Move/);
  assert.match(supervisor, /Copy-VerifiedTree \$dist \$package/);
  assert.match(supervisor, /Get-FileHash \$exe -Algorithm SHA256/);
  assert.match(main, /app\.isReady\(\) \|\| app\.isPackaged/);
});
