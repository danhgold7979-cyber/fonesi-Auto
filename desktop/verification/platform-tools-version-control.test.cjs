'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { exerciseNegatives, SOURCES } = require('./platform-tools-version-control.cjs');
test('actual serial negative preflight restores owned synthetic candidate and never invokes a binary', async () => {
  const { verifyPlatformToolsFiles } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/main/platform-tools-files.ts')).href
  );
  const rows = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'platform-tools-candidate.json'), 'utf8'),
  ).files;
  const root = fs.realpathSync.native(
      fs.mkdtempSync(
        path.join(
          fs.realpathSync.native(path.join(__dirname, '../.test-output')),
          'p201-negative-',
        ),
      ),
    ),
    token = '12345678-1234-1234-1234-123456789abc';
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  fs.mkdirSync(path.join(root, 'candidate'));
  fs.mkdirSync(path.join(root, 'candidate/platform-tools'));
  const inventory = [];
  try {
    for (const row of rows) {
      const b = Buffer.alloc(row.peMachine === null ? 16 : 128);
      if (row.peMachine !== null) {
        b.writeUInt16LE(0x5a4d);
        b.writeUInt32LE(64, 60);
        b.writeUInt32LE(0x4550, 64);
        b.writeUInt16LE(332, 68);
        b.writeUInt16LE(267, 88);
      }
      fs.writeFileSync(path.join(root, 'candidate/platform-tools', row.path), b, { flag: 'wx' });
      inventory.push({
        ...row,
        bytes: b.length,
        sha256: crypto.createHash('sha256').update(b).digest('hex'),
      });
    }
    const before = inventory.map((row) =>
      fs.readFileSync(path.join(root, 'candidate/platform-tools', row.path)),
    );
    assert.deepEqual(
      await exerciseNegatives(root, { files: inventory }, verifyPlatformToolsFiles),
      {
        missingRejected: true,
        tamperRejected: true,
        architectureRejected: true,
        pathShadowIgnored: true,
      },
    );
    assert.deepEqual(
      await verifyPlatformToolsFiles(path.join(root, 'negative'), inventory),
      inventory,
    );
    inventory.forEach((row, i) => {
      assert.deepEqual(
        fs.readFileSync(path.join(root, 'candidate/platform-tools', row.path)),
        before[i],
      );
    });
    assert.throws(() => fs.accessSync(path.join(root, 'negative/held-adb')));
    assert.throws(() => fs.accessSync(path.join(root, 'held-adb-original.bin')));
  } finally {
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    for (const directory of ['candidate/platform-tools', 'negative']) {
      const full = path.join(root, directory);
      if (fs.existsSync(full)) {
        assert.deepEqual(fs.readdirSync(full).sort(), rows.map((r) => r.path).sort());
        for (const row of rows) fs.unlinkSync(path.join(full, row.path));
        fs.rmdirSync(full);
      }
    }
    fs.rmdirSync(path.join(root, 'candidate'));
    if (fs.existsSync(path.join(root, 'shadow'))) {
      assert.equal(
        fs.readFileSync(path.join(root, 'shadow/adb.exe'), 'utf8'),
        'P201_NONEXECUTABLE_PATH_SHADOW\n',
      );
      fs.unlinkSync(path.join(root, 'shadow/adb.exe'));
      fs.rmdirSync(path.join(root, 'shadow'));
    }
    fs.unlinkSync(path.join(root, '.owner'));
    fs.rmdirSync(root);
  }
});
test('version supervisor has one fixed adb command and binds original dependency closure', () => {
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-PlatformToolsVersion.ps1'), 'utf8');
  assert.equal((ps.match(/Invoke-OwnedChild \$exe /g) || []).length, 1);
  assert.ok(ps.includes("Invoke-OwnedChild $exe ([string[]]@('version')) 30000 @{}"));
  assert.ok(!ps.includes("'--root'"));
  assert.ok(ps.includes("'stage',$root"));
  assert.ok(ps.includes("'PATH',(Join-Path $env:SystemRoot 'System32')"));
  for (const name of [
    'verification/WindowsBoundary.psm1',
    'verification/OwnedFiles.psm1',
    'verification/persistence-restore-contract.cjs',
    '../tools/phase-00/HostProbeNative.cs',
  ])
    assert.ok(SOURCES.includes(name));
  assert.equal(SOURCES.length, 10);
  assert.ok(
    ps.indexOf("Node-Control 'verify'", ps.indexOf("$phase='POSTCHECK'")) >
      ps.indexOf("Write-Private (Join-Path $root 'capture.json')"),
  );
});
test('fixed control diagnostics never echo arbitrary error details and PS map remains exact', () => {
  const {
    CONTROL_PHASES,
    CONTROL_REASONS,
    controlDiagnostics,
  } = require('./platform-tools-version-control.cjs');
  assert.deepEqual(controlDiagnostics('PREPARE', Error('C:\\private')), [
    'P201_CONTROL_PHASE_PREPARE',
    'P201_CONTROL_REASON_UNCLASSIFIED',
  ]);
  assert.deepEqual(
    controlDiagnostics('VERIFY', Object.assign(Error('private'), { code: 'ENOENT' })),
    ['P201_CONTROL_PHASE_VERIFY', 'P201_CONTROL_REASON_ENOENT'],
  );
  assert.equal(
    controlDiagnostics(
      'CLEANUP',
      Object.defineProperty({}, 'message', {
        get() {
          throw Error('private');
        },
      }),
    )[1],
    'P201_CONTROL_REASON_UNCLASSIFIED',
  );
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-PlatformToolsVersion.ps1'), 'utf8');
  for (const [key, values] of [
    ['PHASE', CONTROL_PHASES],
    ['REASON', CONTROL_REASONS],
  ]) {
    const row = ps.match(new RegExp(' ' + key + '=@\\(([^)]*)\\)'));
    assert.ok(row);
    assert.deepEqual(
      [...row[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
      values,
    );
  }
  assert.ok(ps.includes('$shown -lt 2'));
  assert.ok(ps.includes('Show-NativeDiagnostic $native'));
});
