import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../launch/Invoke-Desktop.ps1', import.meta.url), 'utf8');
test('developer launcher fixes helper/runtime admission before owned initialization', () => {
  assert.match(source, /482874120c798b61a0e6a4ab759568832bae1189a71fa2fc2950b6a508083df1/);
  assert.match(source, /d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5/);
  assert.ok(source.indexOf('PRELOADED_HELPER_REJECTED') < source.indexOf('Add-Type -Path $helper'));
  assert.ok(source.indexOf("'verify-runtime'") < source.indexOf('$Root=New-Reserved'));
  assert.match(source, /Assert-FullPath \$node/);
  assert.match(source, /Assert-FullPath \$electron/);
  assert.ok(source.indexOf("'runtime-attestation.json'") < source.indexOf("Control 'setup'"));
  assert.match(source, /\(Read-Private \$manifestPath\) -cne \$manifestRaw/);
  assert.match(source, /\[IO\.FileMode\]::CreateNew/);
  assert.match(source, /::ReserveDirectory\(\$path\)/);
});
test('normal UI has no bounded process lifetime and only five exact maintenance literals', () => {
  const expected = [
    'backup-now',
    'list-backups',
    'restore-to-new',
    'accept-upgrade',
    'select-backup-folder',
  ];
  const actual = [...source.matchAll(/'--maintenance=([a-z-]+)'/g)].map((x) => x[1]);
  assert.deepEqual(actual, expected);
  assert.match(
    source,
    /if\(\$Interactive\)\{return \[Fonesi\.Desktop\.Persistence\.PersistenceProcess\]::RunInteractive\(\$Exe,\$Arguments\)\}/,
  );
  assert.match(source, /::RunBounded\(\$Exe,\$Arguments,120000\)/);
  assert.match(source, /\(\$Maintenance -eq ''\)/);
  assert.doesNotMatch(
    source,
    /RunCmd|Invoke-Expression|Start-Process|Remove-Item|\[IO\.Directory\]::Delete/,
  );
});
test('retirement uncertainty preserves ownership while private capture never reaches console', () => {
  assert.match(
    source,
    /\$script:allClean=\$false[\s\S]*?\$result=Invoke-Selected[\s\S]*?\$script:allClean=Retired \$result/,
  );
  assert.match(
    source,
    /if\(-not \$allClean -or \$native\.Status -ne 'SUCCESS' -or \$native\.ExitCode -ne 0\)\{throw 'INITIALIZATION_FAILED'\}/,
  );
  assert.match(
    source,
    /if\(-not \$allClean -or \$application\.Status -ne 'SUCCESS' -or \$application\.ExitCode -ne 0\)\{throw 'APPLICATION_FAILED'\}/,
  );
  assert.equal((source.match(/Control 'release'/g) || []).length, 1);
  assert.match(source, /if\(-not \$allClean\)\{throw 'RETIREMENT_UNCONFIRMED'\}/);
  assert.doesNotMatch(source, /Write-Output[^\n]*(?:\.Stdout|\.Stderr|\.Message|\$Root|\$launch)/);
  assert.match(
    source,
    /finally \{[\s\S]*?GetEnvironmentVariables\('Process'\)[\s\S]*?\$original\[\$key\]/,
  );
});
test('native stage profile is reserved at exact control path before preparation', () => {
  const lines = source.split('\n');
  const prepare = lines.findIndex((line) => line.includes("Control ('prepare-'+$stage)"));
  assert.equal(lines[prepare].trim(), "$null=Control ('prepare-'+$stage)");
  assert.match(
    lines[prepare - 1],
    /New-Reserved \$launch .*GetFileName\(\$launch\)\.Substring\(7\).*\$stage/,
  );
});
