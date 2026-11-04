'use strict';
// Development-only custody preflight. No process spawn, socket, ADB command or profile/key access.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const SOURCES = Object.freeze([
  'src/main/platform-tools-files.ts',
  'verification/platform-tools-candidate.json',
  'verification/platform-tools-server-control.cjs',
  'verification/Invoke-PlatformToolsServer.ps1',
  'verification/Test-PlatformToolsServer.ps1',
  'verification/platform_tools_archive.py',
  'verification/validate_platform_tools_server.py',
  'native/IsolatedAdbServer.cs',
  '../tools/phase-00/HostProbeNative.cs',
  'verification/WindowsBoundary.psm1',
  'verification/OwnedFiles.psm1',
  'verification/persistence-restore-contract.cjs',
  'verification/validate_platform_tools.py',
]);
const OPERATION = 'ISOLATED_SERVER_DEVELOPMENT';
const SUPPRESSION = Object.freeze({ ADB_USB: '0', ADB_EMU: '0', ADB_MDNS: '0' });
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function owner(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) throw Error('P202_OWNER');
  return token;
}
function sourceHashes() {
  const desktop = path.resolve(__dirname, '..');
  return Object.fromEntries(SOURCES.map((name) => [name, hash(read(path.join(desktop, name)))]));
}
function candidate() {
  return JSON.parse(read(path.join(__dirname, 'platform-tools-candidate.json')));
}
async function api() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/main/platform-tools-files.ts')).href);
}
function entries(directory, limit = 32) {
  plain(directory);
  const handle = fs.opendirSync(directory),
    names = [];
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) break;
      if (names.length >= limit) throw Error('P202_LIMIT');
      names.push(entry.name);
    }
  } finally {
    handle.closeSync();
  }
  return names.sort();
}
function sameNames(directory, expected) {
  if (JSON.stringify(entries(directory, expected.length)) !== JSON.stringify([...expected].sort()))
    throw Error('P202_INVENTORY');
}
function complete(pin) {
  return {
    archiveSha256: pin.archive.sha256,
    binaryExecuted: false,
    expandedBytes: 17529398,
    fileCount: 14,
    redistributionApproved: false,
    scope: 'PINNED_DEVELOPMENT_ARCHIVE',
    version: 1,
  };
}
async function verifyCandidate(root, pin, verifyPlatformToolsFiles) {
  const token = owner(root),
    extracted = path.join(root, 'candidate');
  sameNames(extracted, ['.owner', '.platform-tools-complete.json', 'platform-tools']);
  if (
    read(path.join(extracted, '.owner')) !== token ||
    read(path.join(extracted, '.platform-tools-complete.json')) !== JSON.stringify(complete(pin))
  )
    throw Error('P202_CANDIDATE');
  await verifyPlatformToolsFiles(path.join(extracted, 'platform-tools'), pin.files);
  if (owner(root) !== token) throw Error('P202_CHANGED');
  return token;
}
function admission(value, token, sources, manifestHash) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !==
      JSON.stringify(['version', 'runToken', 'sources', 'candidateManifestSha256', 'operation']) ||
    value.version !== 1 ||
    value.runToken !== token ||
    value.operation !== OPERATION ||
    JSON.stringify(value.sources) !== JSON.stringify(sources) ||
    value.candidateManifestSha256 !== manifestHash
  )
    throw Error('P202_CHANGED');
  return value;
}
async function prepare(root) {
  const token = owner(root),
    sources = sourceHashes(),
    pin = candidate(),
    { verifyPlatformToolsFiles } = await api();
  await verifyCandidate(root, pin, verifyPlatformToolsFiles);
  if (owner(root) !== token || JSON.stringify(sourceHashes()) !== JSON.stringify(sources))
    throw Error('P202_CHANGED');
  write(path.join(root, 'admission.json'), {
    version: 1,
    runToken: token,
    sources,
    candidateManifestSha256: hash(read(path.join(__dirname, 'platform-tools-candidate.json'))),
    operation: OPERATION,
  });
  write(path.join(root, 'preflight.json'), {
    inventoryVerified: true,
    architectureVerified: true,
    archiveVerified: true,
    sourceBound: true,
  });
}
async function verify(root) {
  const token = owner(root),
    raw = read(path.join(root, 'admission.json')),
    value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) throw Error('P202_CHANGED');
  admission(
    value,
    token,
    sourceHashes(),
    hash(read(path.join(__dirname, 'platform-tools-candidate.json'))),
  );
  const { verifyPlatformToolsFiles } = await api();
  await verifyCandidate(root, candidate(), verifyPlatformToolsFiles);
}
const CASES = Object.freeze([
  'archiveVerified',
  'inventoryVerified',
  'sourceBound',
  'suppressionConfigured',
  'nativeProfileOwned',
  'existingProfileRefused',
  'profileCleaned',
  'candidateUnchanged',
  'commandForegroundOnly',
]);
const FACTS = Object.freeze([
  'listenerOwned',
  'hostVersionObserved',
  'endpointReleased',
  'foreignOwnerUnchanged',
  'launchRefused',
  'forcedStop',
  'deadlineObserved',
  'prematureDeathObserved',
]);
function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}
function retired(process, success) {
  return (
    exactKeys(process, [
      'status',
      'exitCode',
      'cleanupComplete',
      'stdoutTruncated',
      'stderrTruncated',
    ]) &&
    process.status === (success ? 'SUCCESS' : 'NONZERO_EXIT') &&
    Number.isInteger(process.exitCode) &&
    process.exitCode >= -2147483648 &&
    process.exitCode <= 2147483647 &&
    (success ? process.exitCode === 0 : process.exitCode !== 0) &&
    process.cleanupComplete === true &&
    process.stdoutTruncated === false &&
    process.stderrTruncated === false
  );
}
function cleanupEvidence(value, capture, pin) {
  if (
    !exactKeys(value, [
      'version',
      'scope',
      'candidateSha256',
      'revision',
      'binaryArchitecture',
      'hostArchitecture',
      'cases',
      'scenarios',
      'directoryCleanup',
      'failure',
      'passed',
    ]) ||
    value.version !== 1 ||
    value.scope !== 'HOSTED_ADB_SERVER_DEVELOPMENT_ONLY' ||
    value.candidateSha256 !== pin.archive.sha256 ||
    value.revision !== '37.0.1' ||
    value.binaryArchitecture !== 'IA32' ||
    value.hostArchitecture !== 'X64' ||
    value.directoryCleanup !== false ||
    value.failure !== null ||
    value.passed !== false ||
    !exactKeys(value.cases, CASES) ||
    !CASES.every((key) => value.cases[key] === true) ||
    !exactKeys(value.scenarios, ['occupied', 'healthy', 'death', 'timeout'])
  )
    throw Error('P202_RETIREMENT');
  for (const name of ['occupied', 'healthy', 'death', 'timeout']) {
    const item = value.scenarios[name];
    const expected =
      name === 'occupied'
        ? ['endpointReleased', 'foreignOwnerUnchanged', 'launchRefused']
        : [
            'listenerOwned',
            'hostVersionObserved',
            'endpointReleased',
            'forcedStop',
            ...(name === 'death' ? ['prematureDeathObserved'] : []),
            ...(name === 'timeout' ? ['deadlineObserved'] : []),
          ];
    if (
      !exactKeys(item, ['process', ...FACTS]) ||
      !FACTS.every((key) => item[key] === expected.includes(key)) ||
      (name === 'occupied' ? item.process !== null : !retired(item.process, false))
    )
      throw Error('P202_RETIREMENT');
  }
  if (
    !exactKeys(capture, ['process', 'stdout', 'stderr']) ||
    !retired(capture.process, true) ||
    capture.stderr !== '' ||
    typeof capture.stdout !== 'string' ||
    !['P202_SERVER_OBSERVED\n', 'P202_SERVER_OBSERVED\r\n'].includes(capture.stdout)
  )
    throw Error('P202_RETIREMENT');
  return true;
}
async function cleanup(root) {
  await verify(root);
  const { verifyPlatformToolsFiles } = await api();
  await cleanupOwned(root, candidate(), verifyPlatformToolsFiles);
}
async function cleanupOwned(root, pin, verifyPlatformToolsFiles) {
  const token = await verifyCandidate(root, pin, verifyPlatformToolsFiles);
  cleanupEvidence(
    JSON.parse(read(path.join(root, 'server-public.json'))),
    JSON.parse(read(path.join(root, 'runner-capture.json'))),
    pin,
  );
  const records = [
    'admission.json',
    'preflight.json',
    'server-native.json',
    'server.json',
    'runner-capture.json',
    'server-public.json',
  ];
  const actual = entries(root, 11),
    hasLog = actual.includes('adb.log');
  sameNames(root, ['.owner', 'candidate', 'profile', ...records, ...(hasLog ? ['adb.log'] : [])]);
  sameNames(path.join(root, 'profile'), []);
  for (const name of [...records, ...(hasLog ? ['adb.log'] : [])]) {
    const filename = path.join(root, name),
      stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536)
      throw Error('P202_INVENTORY');
    read(filename);
  }
  if (owner(root) !== token) throw Error('P202_CHANGED');
  // All fixed inventories and retirement facts checked before deleting any byte.
  for (const row of pin.files) fs.unlinkSync(path.join(root, 'candidate/platform-tools', row.path));
  fs.rmdirSync(path.join(root, 'candidate/platform-tools'));
  fs.unlinkSync(path.join(root, 'candidate/.platform-tools-complete.json'));
  fs.unlinkSync(path.join(root, 'candidate/.owner'));
  fs.rmdirSync(path.join(root, 'candidate'));
  fs.rmdirSync(path.join(root, 'profile'));
  for (const name of [...records, ...(hasLog ? ['adb.log'] : [])])
    fs.unlinkSync(path.join(root, name));
  if (owner(root) !== token) throw Error('P202_CHANGED');
  sameNames(root, ['.owner']);
  // The outer verified-owned-run finalizer removes the marker and root last.
}
const CONTROL_PHASES = Object.freeze(['PREPARE', 'VERIFY', 'CLEANUP', 'ARGUMENT']);
const CONTROL_REASONS = Object.freeze([
  'P202_ARGUMENT',
  'P202_OWNER',
  'P202_CHANGED',
  'P202_LIMIT',
  'P202_INVENTORY',
  'P202_CANDIDATE',
  'P202_RETIREMENT',
  'PLATFORM_TOOLS_FILES_REJECTED',
  'RESTORE_OWNER',
  'RESTORE_FILE',
  'RESTORE_LIMIT',
  'RESTORE_READBACK',
  'ENOENT',
  'EACCES',
  'EPERM',
  'EEXIST',
  'ENOTEMPTY',
  'UNCLASSIFIED',
]);
function controlDiagnostics(phase, error) {
  let reason = 'UNCLASSIFIED';
  try {
    for (const key of ['message', 'code']) {
      const descriptor = Object.getOwnPropertyDescriptor(error, key);
      if (
        descriptor &&
        Object.hasOwn(descriptor, 'value') &&
        CONTROL_REASONS.includes(descriptor.value)
      ) {
        reason = descriptor.value;
        break;
      }
    }
  } catch {}
  return [
    'P202_CONTROL_PHASE_' + (CONTROL_PHASES.includes(phase) ? phase : 'ARGUMENT'),
    'P202_CONTROL_REASON_' + reason,
  ];
}
module.exports = {
  SOURCES,
  OPERATION,
  SUPPRESSION,
  sourceHashes,
  verifyCandidate,
  admission,
  complete,
  prepare,
  verify,
  cleanup,
  CASES,
  FACTS,
  cleanupEvidence,
  cleanupOwned,
  CONTROL_PHASES,
  CONTROL_REASONS,
  controlDiagnostics,
};
if (require.main === module) {
  (async () => {
    let phase = 'ARGUMENT';
    try {
      const [action, root] = process.argv.slice(2);
      if (process.argv.length !== 4) throw Error('P202_ARGUMENT');
      if (CONTROL_PHASES.includes(action?.toUpperCase())) phase = action.toUpperCase();
      if (action === 'prepare') await prepare(root);
      else if (action === 'verify') await verify(root);
      else if (action === 'cleanup') await cleanup(root);
      else throw Error('P202_ARGUMENT');
      console.log('P202_CONTROL_PASS');
    } catch (error) {
      for (const marker of controlDiagnostics(phase, error)) console.error(marker);
      console.log('P202_CONTROL_FAILED');
      process.exitCode = 1;
    }
  })();
}
