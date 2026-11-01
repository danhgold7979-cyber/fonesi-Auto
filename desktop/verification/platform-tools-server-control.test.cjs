'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  SOURCES,
  CASES,
  FACTS,
  complete,
  verifyCandidate,
  admission,
  cleanupEvidence,
  cleanupOwned,
  controlDiagnostics,
} = require('./platform-tools-server-control.cjs');
const token = '12345678-1234-1234-1234-123456789abc';
const pin = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'platform-tools-candidate.json'), 'utf8'),
);
function evidence() {
  const process = {
    status: 'NONZERO_EXIT',
    exitCode: 1,
    cleanupComplete: true,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
  const scenarios = {};
  for (const name of ['occupied', 'healthy', 'death', 'timeout']) {
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
    scenarios[name] = {
      process: name === 'occupied' ? null : { ...process },
      ...Object.fromEntries(FACTS.map((key) => [key, expected.includes(key)])),
    };
  }
  return {
    version: 1,
    scope: 'HOSTED_ADB_SERVER_DEVELOPMENT_ONLY',
    candidateSha256: pin.archive.sha256,
    revision: '37.0.1',
    binaryArchitecture: 'IA32',
    hostArchitecture: 'X64',
    cases: Object.fromEntries(CASES.map((key) => [key, true])),
    scenarios,
    directoryCleanup: false,
    failure: null,
    passed: false,
  };
}
const capture = () => ({
  process: {
    status: 'SUCCESS',
    exitCode: 0,
    cleanupComplete: true,
    stdoutTruncated: false,
    stderrTruncated: false,
  },
  stdout: 'P202_SERVER_OBSERVED\n',
  stderr: '',
});
test('server cleanup admission rejects every missing native custody fact and unsafe retirement', () => {
  assert.equal(cleanupEvidence(evidence(), capture(), pin), true);
  for (const key of CASES) {
    const value = evidence();
    value.cases[key] = false;
    assert.throws(() => cleanupEvidence(value, capture(), pin), /P202_RETIREMENT/);
  }
  for (const name of Object.keys(evidence().scenarios))
    for (const key of FACTS) {
      const value = evidence();
      value.scenarios[name][key] = !value.scenarios[name][key];
      assert.throws(() => cleanupEvidence(value, capture(), pin), /P202_RETIREMENT/);
    }
  for (const [key, value] of [
    ['status', 'TIMED_OUT'],
    ['exitCode', 1],
    ['cleanupComplete', false],
    ['stdoutTruncated', true],
    ['stderrTruncated', true],
  ]) {
    const raw = capture();
    raw.process[key] = value;
    assert.throws(() => cleanupEvidence(evidence(), raw, pin), /P202_RETIREMENT/);
  }
  for (const changes of [
    { passed: true },
    { directoryCleanup: true },
    { failure: 'CLEANUP_FAILED' },
    { privatePath: 'private' },
  ])
    assert.throws(
      () => cleanupEvidence({ ...evidence(), ...changes }, capture(), pin),
      /P202_RETIREMENT/,
    );
  assert.throws(
    () => cleanupEvidence(evidence(), { ...capture(), stdout: 'P202_SERVER_OBSERVED\nextra' }, pin),
    /P202_RETIREMENT/,
  );
});
test('server candidate checks actual synthetic PE file bytes and exact extraction custody without running binaries', async () => {
  const { verifyPlatformToolsFiles } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/main/platform-tools-files.ts')).href
  );
  const root = fs.realpathSync.native(
    fs.mkdtempSync(
      path.join(fs.realpathSync.native(path.join(__dirname, '../.test-output')), 'p202-control-'),
    ),
  );
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  fs.mkdirSync(path.join(root, 'candidate'));
  fs.mkdirSync(path.join(root, 'candidate/platform-tools'));
  fs.writeFileSync(path.join(root, 'candidate/.owner'), token, { flag: 'wx' });
  fs.writeFileSync(
    path.join(root, 'candidate/.platform-tools-complete.json'),
    JSON.stringify(complete(pin)),
    { flag: 'wx' },
  );
  const files = [];
  let removed = false;
  try {
    for (const row of pin.files) {
      const bytes = Buffer.alloc(row.peMachine === null ? 16 : 128);
      if (row.peMachine !== null) {
        bytes.writeUInt16LE(0x5a4d);
        bytes.writeUInt32LE(64, 60);
        bytes.writeUInt32LE(0x4550, 64);
        bytes.writeUInt16LE(332, 68);
        bytes.writeUInt16LE(267, 88);
      }
      fs.writeFileSync(path.join(root, 'candidate/platform-tools', row.path), bytes, {
        flag: 'wx',
      });
      files.push({
        ...row,
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const synthetic = { ...pin, files };
    assert.equal(await verifyCandidate(root, synthetic, verifyPlatformToolsFiles), token);
    fs.writeFileSync(path.join(root, 'candidate/.owner'), '22345678-1234-1234-1234-123456789abc');
    await assert.rejects(
      verifyCandidate(root, synthetic, verifyPlatformToolsFiles),
      /P202_CANDIDATE/,
    );
    fs.writeFileSync(path.join(root, 'candidate/.owner'), token);
    fs.appendFileSync(path.join(root, 'candidate/platform-tools/adb.exe'), 'x');
    await assert.rejects(
      verifyCandidate(root, synthetic, verifyPlatformToolsFiles),
      /PLATFORM_TOOLS_FILES_REJECTED/,
    );
    fs.truncateSync(
      path.join(root, 'candidate/platform-tools/adb.exe'),
      files.find((row) => row.path === 'adb.exe').bytes,
    );
    fs.mkdirSync(path.join(root, 'profile'));
    for (const name of ['admission.json', 'preflight.json', 'server-native.json', 'server.json'])
      fs.writeFileSync(path.join(root, name), '{}', { flag: 'wx' });
    fs.writeFileSync(path.join(root, 'runner-capture.json'), JSON.stringify(capture()), {
      flag: 'wx',
    });
    fs.writeFileSync(path.join(root, 'server-public.json'), JSON.stringify(evidence()), {
      flag: 'wx',
    });
    fs.writeFileSync(path.join(root, 'unexpected.bin'), 'retained', { flag: 'wx' });
    const before = fs.readdirSync(root).sort();
    await assert.rejects(
      cleanupOwned(root, synthetic, verifyPlatformToolsFiles),
      /P202_(INVENTORY|LIMIT)/,
    );
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.equal(fs.readFileSync(path.join(root, 'unexpected.bin'), 'utf8'), 'retained');
    assert.equal(await verifyCandidate(root, synthetic, verifyPlatformToolsFiles), token);
    fs.unlinkSync(path.join(root, 'unexpected.bin'));
    await cleanupOwned(root, synthetic, verifyPlatformToolsFiles);
    assert.deepEqual(fs.readdirSync(root), ['.owner']);
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    // Model the existing outer verified-owned-run marker-last finalizer.
    fs.unlinkSync(path.join(root, '.owner'));
    fs.rmdirSync(root);
    removed = true;
    assert.throws(() => fs.lstatSync(root), { code: 'ENOENT' });
  } finally {
    if (!removed && !fs.existsSync(path.join(root, 'server-public.json'))) {
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
      assert.deepEqual(
        fs.readdirSync(path.join(root, 'candidate/platform-tools')).sort(),
        pin.files.map((row) => row.path).sort(),
      );
      for (const row of pin.files)
        fs.unlinkSync(path.join(root, 'candidate/platform-tools', row.path));
      fs.rmdirSync(path.join(root, 'candidate/platform-tools'));
      for (const file of ['.owner', '.platform-tools-complete.json'])
        fs.unlinkSync(path.join(root, 'candidate', file));
      fs.rmdirSync(path.join(root, 'candidate'));
      fs.unlinkSync(path.join(root, '.owner'));
      fs.rmdirSync(root);
    }
  }
});
test('server admission binds exact operation, owner, current source closure and candidate hash', () => {
  const sources = Object.fromEntries(SOURCES.map((name) => [name, 'a'.repeat(64)])),
    sha = 'b'.repeat(64);
  const value = {
    version: 1,
    runToken: token,
    sources,
    candidateManifestSha256: sha,
    operation: 'ISOLATED_SERVER_DEVELOPMENT',
  };
  assert.equal(admission(value, token, sources, sha), value);
  for (const change of [
    { operation: 'VERSION' },
    { runToken: 'other' },
    { sources: {} },
    { candidateManifestSha256: 'c'.repeat(64) },
    { extra: true },
  ])
    assert.throws(() => admission({ ...value, ...change }, token, sources, sha), /P202_CHANGED/);
  assert.equal(SOURCES.length, 13);
  assert.equal(new Set(SOURCES).size, 13);
  assert.ok(SOURCES.includes('native/IsolatedAdbServer.cs'));
  assert.ok(SOURCES.includes('verification/Test-PlatformToolsServer.ps1'));
  assert.ok(SOURCES.includes('verification/validate_platform_tools.py'));
});
test('server diagnostics do not disclose arbitrary paths or invoke error getters', () => {
  assert.deepEqual(controlDiagnostics('PREPARE', Error('C:\\private-key')), [
    'P202_CONTROL_PHASE_PREPARE',
    'P202_CONTROL_REASON_UNCLASSIFIED',
  ]);
  const value = Object.defineProperty({}, 'message', {
    get() {
      throw Error('must not run');
    },
  });
  assert.deepEqual(controlDiagnostics('bad', value), [
    'P202_CONTROL_PHASE_ARGUMENT',
    'P202_CONTROL_REASON_UNCLASSIFIED',
  ]);
});
test('server validator and control bind the same closed source and native case inventories', () => {
  const source = fs.readFileSync(path.join(__dirname, 'validate_platform_tools_server.py'), 'utf8');
  for (const [name, expected] of [
    ['SOURCES', SOURCES],
    ['CASES', CASES],
    ['FACTS', FACTS],
  ]) {
    const match = source.match(new RegExp('^' + name + ' = \\(([^)]*)\\)', 'm'));
    assert.ok(match);
    assert.deepEqual(
      [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]),
      expected,
    );
  }
});
