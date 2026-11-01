'use strict';
// Source/owned-files tests only; no Electron, PowerShell, ADB or helper execution.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  vm = require('node:vm'),
  { createRequire } = require('node:module');
const api = require('./retained-host-control.cjs');
const desktop = path.resolve(__dirname, '..'),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fixture() {
  const base = fs.realpathSync.native(path.join(desktop, '.test-output'));
  const parent = fs.mkdtempSync(path.join(base, 'retained-control-')),
    container = path.join(parent, '.retained-host-runtime');
  fs.mkdirSync(container);
  const root = path.join(container, 'run-' + crypto.randomUUID());
  fs.mkdirSync(root);
  const token = crypto.randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  return {
    root,
    close() {
      assert.equal(fs.realpathSync.native(parent), parent);
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
      function remove(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, e.name),
            s = fs.lstatSync(file);
          assert.equal(s.isSymbolicLink(), false);
          if (s.isDirectory()) {
            remove(file);
            fs.rmdirSync(file);
          } else {
            assert.ok(s.isFile());
            assert.equal(s.nlink, 1);
            fs.unlinkSync(file);
          }
        }
      }
      remove(root);
      fs.rmdirSync(root);
      fs.rmdirSync(container);
      fs.rmdirSync(parent);
    },
  };
}
function capture(stdout = 'PERSISTENCE_DESKTOP_CLOSED\n') {
  return {
    process: {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    stdout,
    stderr: '',
  };
}
function localApi(pin, overrides = {}) {
  const filename = path.join(__dirname, 'retained-host-control.cjs'),
    module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8');
  const real = '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99';
  assert.equal(source.split(real).length, 2);
  vm.runInNewContext(
    source.replace(real, pin),
    {
      module,
      exports: module.exports,
      require: (name) => overrides[name] ?? createRequire(filename)(name),
      __dirname,
      Buffer,
      TextDecoder,
      console,
      process,
    },
    {
      filename,
      importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    },
  );
  return module.exports;
}
test('four exact audited replacements materialize raw scripts with actual on-disk proof bindings', () => {
  const f = fixture();
  try {
    const wrapper = fs.readFileSync(path.join(desktop, 'launch/Invoke-Desktop.ps1'), 'utf8'),
      original = fs.readFileSync(path.join(desktop, 'launch/launch-core.ps1'), 'utf8'),
      derived = api.transform(original, desktop),
      proof = {
        version: 1,
        wrapperSha: hash(wrapper),
        originalSha: hash(original),
        derivedSha: hash(derived),
        substitutions: 4,
        sources: {},
      };
    api.materialize(f.root, { wrapper, derived, proof });
    assert.equal(
      fs.readFileSync(path.join(f.root, 'Invoke-Desktop.instrumented.ps1'), 'utf8'),
      wrapper,
    );
    assert.equal(fs.readFileSync(path.join(f.root, 'launch-core.ps1'), 'utf8'), derived);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json'))), proof);
    assert.ok(derived.includes('verification/retained-host-main-probe.cjs'));
    assert.ok(derived.includes('verification/persistence-launch-init-probe.cjs'));
    assert.throws(() => api.transform(original + '# drift', desktop));
    assert.throws(() => api.materialize(f.root, { wrapper, derived, proof }));
  } finally {
    f.close();
  }
});
test('single archive custody verifies exact size/hash/readback and never creates wrong-hash fixture (synthetic pin only)', () => {
  const f = fixture();
  try {
    const bytes = Buffer.alloc(8044989, 37),
      local = localApi(hash(bytes)),
      file = path.join(f.root, 'synthetic-input.zip');
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    local.archiveInputs(f.root, file);
    assert.equal(local.verifyArchives(f.root), true);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.equal(fs.existsSync(path.join(f.root, 'wrong-hash.zip')), false);
    const fd = fs.openSync(path.join(f.root, 'official.zip'), 'r+');
    try {
      fs.writeSync(fd, Buffer.from([0]), 0, 1, 0);
    } finally {
      fs.closeSync(fd);
    }
    assert.throws(() => local.verifyArchives(f.root));
    assert.deepEqual(fs.readFileSync(file), bytes);
  } finally {
    f.close();
  }
});
test('capture transport accepts PS escaping but rejects decoded duplicates and unretired facts', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'capture.json'),
      value = capture();
    value.stderr = 'private <text>';
    fs.writeFileSync(file, JSON.stringify(value).replace('<', '\\u003c'));
    assert.equal(
      api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER').process.status,
      'SUCCESS',
    );
    for (const raw of [
      JSON.stringify(value).replace('"status":', '"st\\u0061tus":"SUCCESS","status":'),
      JSON.stringify({ ...value, process: { ...value.process, cleanupComplete: false } }),
      JSON.stringify({ ...value, stdout: 'arbitrary\n' }),
    ]) {
      fs.writeFileSync(file, raw);
      assert.throws(() => api.capture(file, ['PERSISTENCE_DESKTOP_CLOSED'], 'OUTER'));
    }
  } finally {
    f.close();
  }
});
test('named native capture must equal the actual immutable settlement digest', () => {
  const f = fixture();
  try {
    const raw = JSON.stringify(capture('BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\n')),
      file = path.join(f.root, 'main-capture.json');
    fs.writeFileSync(file, raw);
    const s = {
      launch: f.root,
      chain: { settlements: [{ stage: 'MAIN', captureSha256: hash(raw) }] },
    };
    assert.equal(
      api.stageCapture(s, 'MAIN', ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED']).process.status,
      'SUCCESS',
    );
    fs.writeFileSync(file, raw + ' ');
    assert.throws(() => api.stageCapture(s, 'MAIN', ['BOOTSTRAP_READY', 'BOOTSTRAP_CLOSED']));
  } finally {
    f.close();
  }
});
test('required parent receipt and helper-directory absence remain cleanup prerequisites', () => {
  const f = fixture();
  try {
    const header = {
        launchId: crypto.randomUUID(),
        storeId: crypto.randomUUID(),
        ownerToken: crypto.randomUUID(),
        executableSha256: 'a'.repeat(64),
      },
      s = { launch: f.root, header };
    assert.throws(() => api.hostReceipt(s));
    fs.writeFileSync(
      path.join(f.root, 'host-parent.json'),
      JSON.stringify({ ...header, parentImageSha256: header.executableSha256 }),
    );
    api.hostReceipt(s);
    const leftover = path.join(f.root, 'host-session-' + crypto.randomUUID());
    fs.mkdirSync(leftover);
    assert.throws(() => api.hostReceipt(s));
    assert.ok(fs.existsSync(leftover));
  } finally {
    f.close();
  }
});
test('diagnostics use fixed phase/reason and capture enums without raw values or getter access', () => {
  for (const error of [
    Error('/private/path'),
    {
      get message() {
        throw Error('getter');
      },
    },
  ])
    assert.deepEqual(api.diagnostics('unknown', error), [
      'RETAINED_HOST_CONTROL_PHASE_ARGUMENT',
      'RETAINED_HOST_CONTROL_REASON_UNCLASSIFIED',
    ]);
  const v = api.captureVector(
    JSON.stringify(capture('unknown private\n')),
    ['PERSISTENCE_DESKTOP_CLOSED'],
    'OUTER',
  );
  assert.equal(v.UNKNOWN, 'TRUE');
  assert.equal(JSON.stringify(v).includes('private'), false);
});
test('cleanup partitions separate official runtime budget from other data and do not delete on planning failure', () => {
  const f = fixture();
  try {
    const data = path.join(f.root, 'data');
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, 'active.sqlite'), 'private');
    const runtime = path.join(data, 'platform-tools-runtime');
    fs.mkdirSync(runtime);
    fs.writeFileSync(path.join(runtime, 'not-inspected-here'), 'opaque');
    assert.deepEqual(
      api.otherDataPlan(data).entries.map((x) => x.name),
      ['active.sqlite'],
    );
    const alias = path.join(data, 'alias');
    fs.linkSync(path.join(data, 'active.sqlite'), alias);
    assert.throws(() => api.otherDataPlan(data));
    fs.unlinkSync(alias);
    assert.equal(fs.readFileSync(path.join(data, 'active.sqlite'), 'utf8'), 'private');
  } finally {
    f.close();
  }
});
test('outer source has one retained launch and unchanged pinned containment, no old campaign/reopen/screenshots', () => {
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  assert.equal((ps.match(/'-EnableRetainedHost'/g) || []).length, 1);
  assert.match(ps, /240000,10000,32768/);
  assert.match(ps, /Remove-VerifiedOwnedRun \$owner \$allClean/);
  assert.match(ps, /'attest-runtime'/);
  assert.doesNotMatch(
    ps,
    /Invoke-Foundation|Invoke-Persistence\.ps1|REOPEN|wrong-hash|\.png|start-server|kill-server/,
  );
  for (const x of api.PHASES) assert.ok(ps.includes("'" + x + "'"));
  for (const x of api.REASONS) assert.ok(ps.includes("'" + x + "'"));
});

test('actual prepare verifies current build and materializes complete bound scripts/main derivation (synthetic archive pin only)', async () => {
  const f = fixture();
  try {
    const bytes = Buffer.alloc(8044989, 19),
      local = localApi(hash(bytes));
    const input = path.join(f.root, 'synthetic-input.zip');
    fs.writeFileSync(input, bytes, { flag: 'wx' });
    await local.prepare(f.root, input);
    await local.verifyCopy(f.root);
    const proof = JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json')));
    const main = fs.readFileSync(path.join(desktop, 'build/main.cjs'), 'utf8');
    const { deriveMain } = require('./retained-host-contract.cjs');
    assert.equal(proof.originalMainSha256, hash(main));
    assert.equal(
      proof.derivedMainSha256,
      hash(deriveMain(main, path.join(__dirname, 'retained-host-main-probe.cjs'))),
    );
    for (const source of api.SOURCES)
      assert.equal(proof.sources[source], hash(fs.readFileSync(path.join(desktop, source))));
    for (const [file, key] of [
      ['Invoke-Desktop.instrumented.ps1', 'wrapperSha'],
      ['launch-core.ps1', 'derivedSha'],
    ])
      assert.equal(proof[key], hash(fs.readFileSync(path.join(f.root, file))));
    await assert.rejects(local.prepare(f.root, input));
    fs.appendFileSync(path.join(f.root, 'launch-core.ps1'), '# changed');
    await assert.rejects(local.verifyCopy(f.root));
  } finally {
    f.close();
  }
});
test('bound MAIN marker extraction and exact PS tables forward only fixed finite diagnostic slots', () => {
  const { PHASES, DIAGNOSTICS } = require('./retained-host-contract.cjs');
  const raw = [
    'RETAINED_HOST_PHASE_VERSION',
    'RETAINED_HOST_FAILED',
    ...Object.entries(DIAGNOSTICS).map(
      ([slot, values]) => 'RETAINED_HOST_DIAGNOSTIC_' + slot + '_' + values[0],
    ),
  ];
  assert.deepEqual(api.observerMarkers(raw.join('\r\n') + '\r\n/private/raw\n'), raw);
  assert.equal(api.observerMarkers(raw.join('\n') + '\n' + raw[0]).length, 0);
  assert.equal(api.observerMarkers(raw.slice(1).join('\n')).length, 0);
  const doubled = api.observerMarkers([...raw, raw[2]].join('\n'));
  assert.equal(doubled.includes(raw[2]), false);
  assert.equal(doubled.length, Object.keys(DIAGNOSTICS).length + 1);
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  const table =
    '$slots=[ordered]@{' +
    Object.entries(DIAGNOSTICS)
      .map(([k, v]) => k + '=@(' + v.map((x) => "'" + x + "'").join(',') + ')')
      .join(';') +
    '}';
  assert.ok(ps.includes(table));
  assert.ok(ps.includes(PHASES.join('|')));
});

test('bounded binary reader rejects growth between admitted stat and fd read without unbounded allocation', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'growing.bin');
    fs.writeFileSync(file, Buffer.from([1, 2, 3]));
    let reads = 0,
      max = 0;
    const local = localApi('a'.repeat(64), {
      'node:fs': {
        ...fs,
        readSync(fd, bytes, offset, length, position) {
          max = Math.max(max, bytes.length);
          if (reads++ === 0) fs.appendFileSync(file, Buffer.alloc(100));
          return fs.readSync(fd, bytes, offset, length, position);
        },
      },
    });
    assert.throws(() => local.binary(file, 3), /RETAINED_HOST_ARCHIVE/);
    assert.ok(reads > 0);
    assert.equal(max, 4);
    assert.equal(fs.statSync(file).size, 103);
  } finally {
    f.close();
  }
});

test('transitive literal verification require closure is completely source-bound', () => {
  const bound = new Set(api.SOURCES);
  for (const name of bound) {
    if (!name.endsWith('.cjs')) continue;
    const file = path.join(desktop, name),
      raw = fs.readFileSync(file, 'utf8');
    for (const match of raw.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const dependency = path
        .relative(desktop, path.resolve(path.dirname(file), match[1]))
        .split(path.sep)
        .join('/');
      if (dependency.startsWith('verification/'))
        assert.ok(bound.has(dependency), name + ' requires ' + dependency);
    }
  }
});
