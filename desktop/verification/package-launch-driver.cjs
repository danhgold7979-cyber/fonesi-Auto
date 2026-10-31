'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, STAGES } = require('./package-contract.cjs');
const { seed } = require('./package-launch-observer.cjs');
const { ORIGINAL_SHA } = require('./persistence-launch-e2e-control.cjs');
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const OBSERVERS = [
  'package-launch-observer.cjs',
  'package-launch-init-probe.cjs',
  'package-launch-main-probe.cjs',
  'package-contract.cjs',
  'persistence-restore-contract.cjs',
];
const CORE_DIAGNOSTICS = Object.freeze({
  FAILURE: Object.freeze([
    'PREPARE_FAILED',
    'SETUP_FAILED',
    'INITIALIZATION_FAILED',
    'APPLICATION_FAILED',
    'RELEASE_FAILED',
    'RECOVERY_FAILED',
  ]),
  REASON: Object.freeze([
    'APPLICATION_FAILED',
    'CANONICAL_PATH_REQUIRED',
    'DIRECTORY_REJECTED',
    'ENVIRONMENT_KEY_REJECTED',
    'ENVIRONMENT_OVERRIDE',
    'EXECUTABLE_REJECTED',
    'FULL_PATH_REQUIRED',
    'GUARD_REJECTED',
    'HELPER_CHANGED',
    'INITIALIZATION_FAILED',
    'JOURNAL_LIMIT',
    'LAUNCH_COUNT',
    'MAINTENANCE_REJECTED',
    'NODE_CHANGED',
    'NODE_MISSING',
    'PRELOADED_HELPER_REJECTED',
    'PRIVATE_FILE_LIMIT',
    'PRIVATE_FILE_REJECTED',
    'RECOVERY_ARGUMENT_REJECTED',
    'RECOVERY_SELECTION',
    'RESTORED_MAINTENANCE_REQUIRED',
    'RETIREMENT_UNCONFIRMED',
    'ROOT_OWNER_CHANGED',
    'ROOT_OWNER_REJECTED',
    'RUNTIME_CHANGED',
    'RUNTIME_MANIFEST_CHANGED',
    'RUNTIME_MANIFEST_REJECTED',
    'STAGE_FAILED',
    'STATE_REJECTED',
    'STORE_NAME',
    'WINDOWS_REQUIRED',
    'UNCLASSIFIED',
  ]),
  TYPE: Object.freeze(['RUNTIME', 'METHOD', 'PARAMETER', 'COMMAND', 'OTHER']),
  SEQUENCE: Object.freeze([
    'NONE',
    ...Array.from({ length: 16 }, (_, n) => String(n + 1).padStart(2, '0')),
  ]),
  OPERATION: Object.freeze([
    'FULL_PATH',
    'DIRECTORY',
    'READ',
    'WRITE',
    'RESERVE',
    'CHILD',
    'SUCCESS',
    'JOURNAL',
    'CAPTURE',
    'JOURNALED',
    'CONTROL',
    'OUTSIDE',
    'LAUNCHER',
    'UNKNOWN',
  ]),
  ERROR_ID: Object.freeze([
    'RuntimeException',
    'MethodInvocationException',
    'ParameterBindingException',
    'CommandNotFoundException',
    'UNKNOWN',
  ]),
});
function transform(core, desktop, observer) {
  if (hash(core) !== ORIGINAL_SHA) throw Error('PACKAGE_CORE_CHANGED');
  const quote = (value) => value.replaceAll("'", "''");
  const substitutions = [
    [
      "$desktop=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))",
      `$desktop='${quote(desktop)}'`,
    ],
    ['$launchTools=$PSScriptRoot', "$launchTools=Join-Path $desktop 'launch'"],
    [
      "Join-Path $launchTools 'persistence-initialize.cjs'",
      `'${quote(path.join(observer, 'package-launch-init-probe.cjs'))}'`,
    ],
    [
      "Join-Path $desktop 'build/main.cjs'",
      `'${quote(path.join(observer, 'package-launch-main-probe.cjs'))}'`,
    ],
  ];
  const originalCatch = '}catch{\n    Write-Output $failure\n    exit 1\n}finally{';
  const psArray = (values) => values.map((v) => `'${v}'`).join(',');
  const diagnosticCatch = `}catch{
    # Verification-only fixed diagnostics; original failure/control flow below unchanged.
    try {
        $diagnosticError=$_
        $diagnosticFailures=@(${psArray(CORE_DIAGNOSTICS.FAILURE.map((v) => 'PERSISTENCE_DESKTOP_' + v))})
        if($failure -cin $diagnosticFailures){[Console]::Error.WriteLine('PACKAGE_CORE_FAILURE_'+$failure.Substring('PERSISTENCE_DESKTOP_'.Length))}
        $diagnosticReasons=@(${psArray(CORE_DIAGNOSTICS.REASON)})
        $diagnosticReason='UNCLASSIFIED'
        if($diagnosticError.Exception.Message -cin $diagnosticReasons){$diagnosticReason=$diagnosticError.Exception.Message}
        [Console]::Error.WriteLine('PACKAGE_CORE_REASON_'+$diagnosticReason)
        $diagnosticType='OTHER'
        switch -CaseSensitive ($diagnosticError.Exception.GetType().FullName) {
            'System.Management.Automation.RuntimeException' {$diagnosticType='RUNTIME'}
            'System.Management.Automation.MethodInvocationException' {$diagnosticType='METHOD'}
            'System.Management.Automation.ParameterBindingException' {$diagnosticType='PARAMETER'}
            'System.Management.Automation.CommandNotFoundException' {$diagnosticType='COMMAND'}
        }
        [Console]::Error.WriteLine('PACKAGE_CORE_TYPE_'+$diagnosticType)
        $diagnosticSequence='NONE'
        if($context.Sequence -is [int] -and $context.Sequence -ge 1 -and $context.Sequence -le 16){$diagnosticSequence=$context.Sequence.ToString('00')}
        [Console]::Error.WriteLine('PACKAGE_CORE_SEQUENCE_'+$diagnosticSequence)
        $diagnosticOperation='UNKNOWN'
        $diagnosticCommands=@{'Assert-FullPath'='FULL_PATH';'Assert-Directory'='DIRECTORY';'Read-Private'='READ';'Write-Private'='WRITE';'New-Reserved'='RESERVE';'Invoke-Selected'='CHILD';'Success'='SUCCESS';'Journal'='JOURNAL';'Save-Capture'='CAPTURE';'Invoke-Journaled'='JOURNALED';'Control'='CONTROL';'Outside-Package'='OUTSIDE';'Invoke-PersistenceLauncher'='LAUNCHER'}
        foreach($diagnosticName in $diagnosticCommands.Keys){if($null -ne $diagnosticError.InvocationInfo -and $null -ne $diagnosticError.InvocationInfo.MyCommand -and $diagnosticError.InvocationInfo.MyCommand.Name -ceq $diagnosticName){$diagnosticOperation=$diagnosticCommands[$diagnosticName];break}}
        [Console]::Error.WriteLine('PACKAGE_CORE_OPERATION_'+$diagnosticOperation)
        $diagnosticId='UNKNOWN'
        if($diagnosticError.FullyQualifiedErrorId -cin @(${psArray(CORE_DIAGNOSTICS.ERROR_ID)})){$diagnosticId=$diagnosticError.FullyQualifiedErrorId}
        [Console]::Error.WriteLine('PACKAGE_CORE_ERROR_ID_'+$diagnosticId)
    }catch{}
    Write-Output $failure
    exit 1
}finally{`;
  substitutions.push([originalCatch, diagnosticCatch]);
  let changed = core;
  for (const [from, to] of substitutions) {
    if (changed.split(from).length !== 2) throw Error('PACKAGE_TRANSFORM');
    changed = changed.replace(from, to);
  }
  return changed;
}
function writeScript(file, raw) {
  if (
    typeof raw !== 'string' ||
    !raw.isWellFormed() ||
    Buffer.byteLength(raw, 'utf8') < 1 ||
    Buffer.byteLength(raw, 'utf8') > 65536
  )
    throw Error('PACKAGE_SCRIPT_LIMIT');
  plain(path.dirname(file));
  const bytes = Buffer.from(raw, 'utf8'),
    fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (read(file) !== raw) throw Error('PACKAGE_SCRIPT_READBACK');
}
async function prepare(root, stage) {
  plain(root);
  if (!STAGES.includes(stage)) throw Error('PACKAGE_STAGE');
  const c = seed(read(path.join(root, 'package-stage-' + stage + '.json')));
  if (c.runRoot !== root || read(path.join(root, '.owner')) !== c.runToken || c.stage !== stage)
    throw Error('PACKAGE_OWNER');
  const { verifyPackage } = require('../launch/package-admission.cjs');
  verifyPackage(c.packageRoot);
  const sourceRoot = path.resolve(__dirname, '..');
  const { LAUNCH } = await import('../scripts/build-package.mjs');
  const top = read(path.join(c.packageRoot, 'Launch.ps1')),
    wrapper = read(path.join(c.packageRoot, 'app/launch/Invoke-Package.ps1')),
    core = read(path.join(c.packageRoot, 'app/launch/launch-core.ps1'));
  if (
    top !== LAUNCH ||
    wrapper !== read(path.join(sourceRoot, 'launch/Invoke-Package.ps1')) ||
    !wrapper.includes(". (Join-Path $PSScriptRoot 'launch-core.ps1')") ||
    !wrapper.includes("-EntryMode 'PACKAGE'")
  )
    throw Error('PACKAGE_WRAPPER');
  const outer = path.join(root, 'package-probe-' + stage),
    observers = path.join(outer, 'observers');
  fs.mkdirSync(outer);
  fs.mkdirSync(path.join(outer, 'app'));
  fs.mkdirSync(path.join(outer, 'app/launch'));
  fs.mkdirSync(observers);
  const derived = transform(core, path.join(c.packageRoot, 'app'), observers);
  writeScript(path.join(outer, 'Launch.ps1'), top);
  writeScript(path.join(outer, 'app/launch/Invoke-Package.ps1'), wrapper);
  writeScript(path.join(outer, 'app/launch/launch-core.ps1'), derived);
  write(path.join(outer, 'control.json'), c);
  const observerFiles = {};
  for (const name of OBSERVERS) {
    const raw = read(path.join(__dirname, name));
    writeScript(path.join(observers, name), raw);
    observerFiles[name] = hash(raw);
  }
  write(path.join(outer, 'copy-proof.json'), {
    version: 1,
    stage,
    originalFiles: {
      'Launch.ps1': hash(top),
      'app/launch/Invoke-Package.ps1': hash(wrapper),
      'app/launch/launch-core.ps1': hash(core),
    },
    derivedCoreSha256: hash(derived),
    observerFiles,
  });
  return outer;
}
function candidate() {
  const desktop = path.resolve(__dirname, '..'),
    c = JSON.parse(read(path.join(desktop, '.package-build/candidate.json')));
  if (
    JSON.stringify(Object.keys(c)) !== JSON.stringify(['directory', 'zip', 'sha256', 'bytes']) ||
    !c.directory.startsWith(path.join(desktop, '.package-build') + path.sep) ||
    path.basename(c.directory) !== 'package' ||
    c.zip !== path.join(path.dirname(c.directory), 'Fonesi-Auto.zip')
  )
    throw Error('PACKAGE_CANDIDATE');
  const a = require('../launch/package-admission.cjs'),
    m = a.verifyPackage(c.directory),
    d = a.digest(c.zip);
  if (d.sha256 !== c.sha256 || d.bytes !== c.bytes) throw Error('PACKAGE_CANDIDATE');
  return { c, m };
}
function relocate(root) {
  plain(root);
  const { uuid } = require('./package-contract.cjs');
  if (!uuid(read(path.join(root, '.owner')))) throw Error('PACKAGE_OWNER');
  const { c, m } = candidate(),
    { copyPackage } = require('./package-owned-files.cjs');
  const extracted = require('../launch/package-admission.cjs').verifyPackage(
    path.join(root, 'relocated-package'),
  );
  if (JSON.stringify(extracted) !== JSON.stringify(m)) throw Error('PACKAGE_EXTRACTED_CHANGED');
  copyPackage(c.directory, path.join(root, 'package-negative'));
  write(path.join(root, 'package-info.json'), {
    sourceHead: m.sourceHead,
    sourceTree: m.sourceTree,
    package: {
      sha256: c.sha256,
      bytes: c.bytes,
      fileCount: m.files.length,
      node: m.runtime.node,
      electron: m.runtime.electron,
    },
  });
}
async function main() {
  try {
    if (process.versions.node !== '24.22.1') throw Error('PACKAGE_ARGUMENT');
    const [action, root, stage] = process.argv.slice(2);
    if (action === 'prepare' && process.argv.length === 5) {
      await prepare(root, stage);
      console.log('PACKAGE_LAUNCH_COPY_PREPARED');
    } else if (action === 'relocate' && process.argv.length === 4) {
      relocate(root);
      console.log('PACKAGE_RELOCATED');
    } else if (action === 'verify-original' && process.argv.length === 4) {
      const { m } = candidate();
      const actual = require('../launch/package-admission.cjs').verifyPackage(
        path.join(root, 'relocated-package'),
      );
      if (JSON.stringify(actual) !== JSON.stringify(m)) throw Error('PACKAGE_CHANGED');
      console.log('PACKAGE_ORIGINAL_VERIFIED');
    } else if (action === 'cleanup' && process.argv.length === 4) {
      require('./package-owned-files.cjs').cleanup(root);
      console.log('PACKAGE_OWNED_CLEANED');
    } else throw Error('PACKAGE_ARGUMENT');
  } catch {
    console.log('PACKAGE_LAUNCH_COPY_FAILED');
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
module.exports = {
  transform,
  prepare,
  writeScript,
  OBSERVERS,
  CORE_DIAGNOSTICS,
  candidate,
  relocate,
};
