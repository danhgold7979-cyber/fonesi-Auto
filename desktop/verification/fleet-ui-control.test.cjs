'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const api = require('./fleet-ui-control.cjs');
const desktop = path.resolve(__dirname, '..');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fixture() {
  const base = path.join(desktop, '.test-output');
  assert.equal(fs.realpathSync.native(base), base);
  const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(base, 'fleet-ui-'))),
    container = path.join(parent, '.fleet-ui-runtime');
  fs.mkdirSync(container);
  const root = path.join(container, 'run-' + crypto.randomUUID());
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, '.owner'), crypto.randomUUID(), { flag: 'wx' });
  return {
    root,
    close() {
      for (const item of fs.readdirSync(root, { withFileTypes: true })) {
        const file = path.join(root, item.name);
        assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
        if (item.isDirectory()) {
          assert.deepEqual(fs.readdirSync(file), []);
          fs.rmdirSync(file);
        } else fs.unlinkSync(file);
      }
      fs.rmdirSync(root);
      fs.rmdirSync(container);
      fs.rmdirSync(parent);
    },
  };
}
test('actual prepare materializes exact raw wrapper/core bytes and complete source proof', async () => {
  const f = fixture();
  try {
    await api.prepare(f.root);
    await api.verifyCopy(f.root);
    const wrapper = fs.readFileSync(path.join(f.root, 'Invoke-Desktop.instrumented.ps1'), 'utf8'),
      core = fs.readFileSync(path.join(f.root, 'launch-core.ps1'), 'utf8'),
      proof = JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json')));
    assert.equal(wrapper, fs.readFileSync(path.join(desktop, 'launch/Invoke-Desktop.ps1'), 'utf8'));
    assert.equal(
      core,
      api.transform(fs.readFileSync(path.join(desktop, 'launch/launch-core.ps1'), 'utf8'), desktop),
    );
    assert.equal(proof.wrapperSha, hash(wrapper));
    assert.equal(proof.derivedSha, hash(core));
    assert.equal(proof.substitutions, 4);
    for (const source of api.SOURCES)
      assert.equal(proof.sources[source], hash(fs.readFileSync(path.join(desktop, source))));
    assert.ok(core.includes('verification/fleet-ui-main-probe.cjs'));
    assert.ok(core.includes('verification/persistence-launch-init-probe.cjs'));
    assert.ok(!core.startsWith('"'));
    assert.ok(!wrapper.startsWith('"'));
    await assert.rejects(api.prepare(f.root));
    fs.appendFileSync(path.join(f.root, 'launch-core.ps1'), '# changed');
    await assert.rejects(api.verifyCopy(f.root), /FLEET_UI_COPY/);
  } finally {
    f.close();
  }
});
test('PS capture is semantic duplicate-aware JSON, not JS canonical framing', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'capture.json'),
      v = {
        process: {
          status: 'SUCCESS',
          exitCode: 0,
          cleanupComplete: true,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
        stdout: 'PERSISTENCE_DESKTOP_CLOSED\r\n',
        stderr: 'private <text>',
      };
    fs.writeFileSync(
      file,
      JSON.stringify(v, null, 2).replace('<', '\\u003c').replace('>', '\\u003e'),
      { flag: 'wx' },
    );
    assert.equal(api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED']).stderr, v.stderr);
    fs.writeFileSync(
      file,
      JSON.stringify(v).replace(
        '"status":"SUCCESS"',
        '"status":"SUCCESS","st\\u0061tus":"SUCCESS"',
      ),
    );
    assert.throws(() => api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED']));
    v.process.cleanupComplete = false;
    fs.writeFileSync(file, JSON.stringify(v));
    assert.throws(() => api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED']));
  } finally {
    f.close();
  }
});
test('changed original transform and incomplete cleanup fail preserving owned files', async () => {
  assert.throws(
    () =>
      api.transform(
        fs.readFileSync(path.join(desktop, 'launch/launch-core.ps1'), 'utf8') + '\n',
        desktop,
      ),
    /SOURCE_CHANGED/,
  );
  const f = fixture();
  try {
    await api.prepare(f.root);
    const before = fs
      .readdirSync(f.root)
      .sort()
      .map((name) => [
        name,
        fs.lstatSync(path.join(f.root, name)).isFile()
          ? fs.readFileSync(path.join(f.root, name)).toString('hex')
          : null,
      ]);
    await assert.rejects(api.cleanup(f.root));
    assert.deepEqual(
      fs
        .readdirSync(f.root)
        .sort()
        .map((name) => [
          name,
          fs.lstatSync(path.join(f.root, name)).isFile()
            ? fs.readFileSync(path.join(f.root, name)).toString('hex')
            : null,
        ]),
      before,
    );
  } finally {
    f.close();
  }
});
test('runner uses only fixed installer/attestation/current launcher with bounded diagnostics', () => {
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-FleetUi.ps1'), 'utf8');
  for (const s of [...api.PHASES, ...api.REASONS]) assert.ok(ps.includes("'" + s + "'"), s);
  assert.match(ps, /install-electron\.mjs/);
  assert.match(ps, /'attest-runtime'/);
  assert.match(ps, /120000,10000,32768/);
  assert.match(ps, /ReserveDirectory\(\$root\)/);
  assert.doesNotMatch(
    ps,
    /Invoke-Foundation|Invoke-Persistence\.ps1|Test-VaultContext|adb\.exe|ExecutionPolicy/,
  );
  assert.match(ps, /Node-Control 'cleanup';Remove-VerifiedOwnedRun/);
  assert.deepEqual(
    api.diagnostics(
      'inspect',
      Object.defineProperty({}, 'message', {
        get() {
          throw Error('private');
        },
      }),
    ),
    ['FLEET_UI_CONTROL_PHASE_INSPECT', 'FLEET_UI_CONTROL_REASON_UNCLASSIFIED'],
  );
});

test('nested observer diagnostics retain only one exact phase and failure after journal binding', () => {
  assert.deepEqual(api.observerMarkers('private path\nFLEET_UI_PHASE_READ\nFLEET_UI_FAILED\n'), [
    'FLEET_UI_PHASE_READ',
    'FLEET_UI_FAILED',
  ]);
  for (const raw of [
    'FLEET_UI_PHASE_PRIVATE\nFLEET_UI_FAILED\n',
    'FLEET_UI_PHASE_READ\nFLEET_UI_PHASE_READ\nFLEET_UI_FAILED\n',
    'FLEET_UI_PHASE_READ\n',
  ])
    assert.deepEqual(api.observerMarkers(raw), []);
  const source = fs.readFileSync(path.join(__dirname, 'fleet-ui-control.cjs'), 'utf8');
  assert.ok(source.includes('hash(raw) !== latest.captureSha256'));
  assert.ok(source.includes("latest?.stage !== 'MAIN'"));
  assert.ok(source.includes('s.chain.pending'));
});

test('capture diagnostics classify exact finite framing without changing admission or echoing data', () => {
  const raw = (stdout, stderr = '') =>
    JSON.stringify({
      process: {
        status: 'SUCCESS',
        exitCode: 0,
        cleanupComplete: true,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      stdout,
      stderr,
    });
  const lines = ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'];
  const good = api.captureVector(raw(lines.join('\n') + '\n'), lines, 'MAIN');
  assert.equal(good.SCHEMA, 'VALID');
  assert.equal(good.EXPECTED, 'EXACT');
  assert.equal(good.ORDER, 'MATCH');
  assert.equal(good.LEADING, 'ZERO');
  assert.equal(good.TRAILING, 'ONE');
  for (const [text, key, value] of [
    ['\n' + lines.join('\n') + '\n', 'LEADING', 'ONE'],
    [lines.join('\n') + '\n\n', 'TRAILING', 'MULTIPLE'],
    [lines.join('\n\n') + '\n', 'INTERIOR', 'TRUE'],
    [lines.slice().reverse().join('\n') + '\n', 'ORDER', 'MISMATCH'],
    ['PRIVATE_CANARY_PATH\n', 'UNKNOWN', 'TRUE'],
    ['BOOTSTRAP_FAILED\n', 'FAILURE', 'ONE'],
  ]) {
    const v = api.captureVector(raw(text), lines, 'MAIN');
    assert.equal(v[key], value);
    assert.equal(JSON.stringify(v).includes('PRIVATE_CANARY'), false);
  }
  assert.equal(
    api.captureVector(raw('', 'BOOTSTRAP_FAILED\n'), lines, 'MAIN').STDERR_FAILURE,
    'TRUE',
  );
  assert.equal(api.captureVector('{bad', lines, 'MAIN').SCHEMA, 'INVALID');
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-FleetUi.ps1'), 'utf8');
  for (const [key, values] of Object.entries(api.CAPTURE_VECTOR)) {
    assert.ok(ps.includes(key + '=@('));
    for (const value of values) assert.ok(ps.includes("'" + value + "'"));
  }
});

test('actual failed capture attaches only fixed target and framing diagnostics', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'capture.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        process: {
          status: 'SUCCESS',
          exitCode: 0,
          cleanupComplete: true,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
        stdout: '\n\nPERSISTENCE_DESKTOP_CLOSED\n',
        stderr: 'PRIVATE_CANARY',
      }),
      { flag: 'wx' },
    );
    let caught;
    try {
      api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER');
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    const lines = api.diagnostics('inspect', caught);
    assert.ok(lines.includes('FLEET_UI_CAPTURE_TARGET_OUTER'));
    assert.ok(lines.includes('FLEET_UI_CAPTURE_LEADING_MULTIPLE'));
    assert.equal(lines.length, 16);
    assert.equal(lines.join('').includes('PRIVATE_CANARY'), false);
    for (const kind of [
      'PREPARE',
      'SETUP',
      'INITIALIZATION',
      'APPLICATION',
      'RELEASE',
      'RECOVERY',
    ]) {
      const raw = JSON.stringify({
        process: {
          status: 'NONZERO_EXIT',
          exitCode: 1,
          cleanupComplete: true,
          stdoutTruncated: false,
          stderrTruncated: false,
        },
        stdout: 'PERSISTENCE_DESKTOP_' + kind + '_FAILED\n',
        stderr: '',
      });
      assert.equal(api.captureVector(raw, ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER').FAILURE, 'ONE');
    }
  } finally {
    f.close();
  }
});

test('native captures admit exactly one optional leading empty line, never broad trimming', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'capture.json');
    const lines = ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED'];
    const write = (stdout) =>
      fs.writeFileSync(
        file,
        JSON.stringify({
          process: {
            status: 'SUCCESS',
            exitCode: 0,
            cleanupComplete: true,
            stdoutTruncated: false,
            stderrTruncated: false,
          },
          stdout,
          stderr: '',
        }),
      );
    for (const prefix of ['', '\n'])
      for (const newline of ['\n', '\r\n']) {
        write((prefix + lines.join('\n') + '\n').replaceAll('\n', newline));
        assert.equal(api.capture(file, lines, 'MAIN').process.status, 'SUCCESS');
      }
    for (const raw of [
      '\n\n' + lines.join('\n') + '\n',
      lines.join('\n\n') + '\n',
      lines.join('\n') + '\n\n',
      ' ' + lines.join('\n') + '\n',
      lines.slice().reverse().join('\n') + '\n',
      lines.join('\n'),
    ]) {
      write(raw);
      assert.throws(() => api.capture(file, lines, 'MAIN'), /FLEET_UI_CAPTURE/);
    }
  } finally {
    f.close();
  }
});
