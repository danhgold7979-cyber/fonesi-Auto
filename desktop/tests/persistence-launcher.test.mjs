import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../launch/launch-core.ps1', import.meta.url), 'utf8');
test('developer launcher fixes helper/runtime admission before owned initialization', () => {
  assert.match(source, /7005eaa51de202d1138828254b766a48af2bb9305823a50076165efd4fe422fe/);
  assert.match(source, /d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5/);
  assert.ok(source.indexOf('PRELOADED_HELPER_REJECTED') < source.indexOf('Add-Type -Path $helper'));
  assert.ok(source.indexOf("'verify-runtime'") < source.indexOf('$Root=New-Reserved'));
  assert.match(source, /Assert-FullPath \$node/);
  assert.match(source, /Assert-FullPath \$electron/);
  assert.ok(
    source.indexOf("'runtime-attestation.json'") < source.indexOf("Control 'setup' 'SETUP'"),
  );
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
    /\$context.AllClean=\$false[\s\S]*?\$result=Invoke-Selected[\s\S]*?\$context.AllClean=Retired \$result/,
  );
  assert.match(
    source,
    /if\(-not \$context.AllClean -or \$native\.Status -ne 'SUCCESS' -or \$native\.ExitCode -ne 0\)\{throw 'INITIALIZATION_FAILED'\}/,
  );
  assert.match(
    source,
    /if\(-not \$context.AllClean -or \$application\.Status -ne 'SUCCESS' -or \$application\.ExitCode -ne 0\)\{throw 'APPLICATION_FAILED'\}/,
  );
  assert.equal((source.match(/Control 'release'/g) || []).length, 1);
  assert.match(source, /if\(-not \$context.AllClean\)\{throw 'RETIREMENT_UNCONFIRMED'\}/);
  assert.doesNotMatch(source, /Write-Output[^\n]*(?:\.Stdout|\.Stderr|\.Message|\$Root|\$launch)/);
  assert.match(
    source,
    /finally \{[\s\S]*?GetEnvironmentVariables\('Process'\)[\s\S]*?\$original\[\$key\]/,
  );
});
test('native stage profile is reserved at exact control path before preparation', () => {
  const lines = source.split('\n');
  const prepare = lines.findIndex((line) => line.includes("Control ('prepare-'+$stage)"));
  assert.equal(
    lines[prepare].trim(),
    "$null=Control ('prepare-'+$stage) ('PREPARE_'+$stage.ToUpperInvariant())",
  );
  assert.match(
    lines[prepare - 1],
    /New-Reserved \$launch .*GetFileName\(\$launch\)\.Substring\(7\).*\$stage/,
  );
});

test('source and package wrappers select fixed modes without fallback or arbitrary script entry', () => {
  for (const [name, mode] of [
    ['Invoke-Desktop.ps1', 'SOURCE'],
    ['Invoke-Package.ps1', 'PACKAGE'],
  ]) {
    const wrapper = readFileSync(new URL(`../launch/${name}`, import.meta.url), 'utf8');
    assert.match(wrapper, /Join-Path \$PSScriptRoot 'launch-core.ps1'/);
    assert.ok(wrapper.includes(`-EntryMode '${mode}'`));
    assert.doesNotMatch(
      wrapper,
      /Get-Command|Start-Process|Invoke-Expression|\[string\]\$EntryMode/,
    );
    assert.match(wrapper, /ParameterSetName='Store'/);
    assert.match(wrapper, /RecoverRetainedLaunch/);
  }
  assert.match(source, /runtime\/node\/node.exe/);
  assert.match(source, /runtime\/electron\/electron.exe/);
  assert.match(source, /'PACKAGE_VERIFIED'/);
  assert.ok(source.indexOf("'PACKAGE_VERIFIED'") < source.indexOf('$Root=New-Reserved'));
});
test('parent-wide persistent guard spans every journaled ownership operation and is never deleted', () => {
  assert.match(source, /Join-Path \$Root '\.launcher-guard'/);
  assert.match(source, /FileMode\]::Open,\[IO.FileAccess\]::ReadWrite,\[IO.FileShare\]::None/);
  assert.match(source, /FileMode\]::CreateNew,\[IO.FileAccess\]::ReadWrite,\[IO.FileShare\]::None/);
  assert.ok(source.indexOf('$guard=[IO.File]::Open') < source.indexOf("@('plan',$Root"));
  assert.ok(source.indexOf("Control 'release' 'RELEASE'") < source.indexOf('$guard.Dispose()'));
  assert.doesNotMatch(source, /Delete\(\$guardPath|Remove-Item/);
  const journaled = source.slice(
    source.indexOf('function Invoke-Journaled'),
    source.indexOf('function Control'),
  );
  assert.ok(journaled.indexOf("@('intent'") < journaled.indexOf('$result=Invoke-Selected'));
  assert.ok(journaled.indexOf('Save-Capture') < journaled.indexOf("@('settle'"));
  assert.ok(journaled.indexOf('RETIREMENT_UNCONFIRMED') < journaled.indexOf("@('settle'"));
  assert.match(journaled, /Sequence -gt 16/);
  assert.match(source, /capture-'\+\$Sequence.ToString\('00'\)/);
  assert.match(
    source,
    /if\(\$Selection -ceq 'Store' -and -not \$Maintenance -and -not \$RecoverRetainedLaunch\)/,
  );
});

test('all five native maintenance literals map to the closed bare journal vocabulary', () => {
  const literals = [...source.matchAll(/'--maintenance=([a-z-]+)'/g)].map((match) => match[1]);
  assert.deepEqual(literals, [
    'backup-now',
    'list-backups',
    'restore-to-new',
    'accept-upgrade',
    'select-backup-folder',
  ]);
  assert.ok(
    source.includes(
      "$method='NORMAL';if($Maintenance){$method=$Maintenance.Substring('--maintenance='.Length)}",
    ),
  );
  for (const literal of literals)
    assert.equal(`--maintenance=${literal}`.slice('--maintenance='.length), literal);
  assert.ok(source.includes('$arguments+=,$Maintenance'));
  assert.doesNotMatch(source, /\{12\}\$'/);
  assert.match(source, /\{12\}\\z'/);
});
