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
  const original = Buffer.from('"use strict";\nconst unchanged=1;\n');
  const derived = instrument(original);
  assert.equal(derived.toString().replace(INJECTION, ''), original.toString());
  assert.equal(derived.toString().split(INJECTION).length, 2);
  for (const bad of ['const changed=1;', '"use strict";\n"use strict";', '\ufeff"use strict";'])
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
