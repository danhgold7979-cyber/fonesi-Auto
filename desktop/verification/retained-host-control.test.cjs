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
  const root = path.join(container, 'r');
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
// Materialization tests inject historical evidence only. Actual current-source reuse
// is separately required to refuse in main-runtime-version-evidence.test.cjs.
function syntheticHistoricalEvidence() {
  const original = require('./main-runtime-version-evidence.cjs');
  return {
    ...original,
    historical() {
      return { version: 1, reportSha256: original.REPORT_SHA, sourceHashes: original.HASHES };
    },
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
    for (const name of ['host-session-' + crypto.randomUUID(), '.host-session']) {
      const leftover = path.join(f.root, name);
      fs.mkdirSync(leftover);
      assert.throws(() => api.hostReceipt(s));
      assert.ok(fs.existsSync(leftover));
      fs.rmdirSync(leftover);
    }
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

test('actual prepare materializes bound scripts/main derivation with explicitly synthetic archive and historical admission', async () => {
  for (const mainMode of [false, true]) {
    const f = fixture();
    try {
      const bytes = Buffer.alloc(8044989, 19),
        local = localApi(
          hash(bytes),
          mainMode ? { './main-runtime-version-evidence.cjs': syntheticHistoricalEvidence() } : {},
        );
      const input = path.join(f.root, 'synthetic-input.zip');
      fs.writeFileSync(input, bytes, { flag: 'wx' });
      await local.prepare(f.root, input, mainMode);
      await local.verifyCopy(f.root, mainMode);
      const proof = JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json')));
      assert.equal(proof.version, mainMode ? 2 : 1);
      if (mainMode) {
        assert.equal(proof.mode, 'MAIN_VERSION');
        assert.equal(
          JSON.parse(fs.readFileSync(path.join(f.root, 'historical-managed.json'))).reportSha256,
          require('./main-runtime-version-evidence.cjs').REPORT_SHA,
        );
        await assert.rejects(local.verifyCopy(f.root, false));
      }
      const main = fs.readFileSync(path.join(desktop, 'build/main.cjs'), 'utf8');
      const { deriveMain } = require(
        mainMode ? './main-runtime-version-contract.cjs' : './retained-host-contract.cjs',
      );
      assert.equal(proof.originalMainSha256, hash(main));
      assert.equal(
        proof.derivedMainSha256,
        hash(
          deriveMain(
            main,
            path.join(
              __dirname,
              mainMode ? 'main-runtime-version-probe.cjs' : 'retained-host-main-probe.cjs',
            ),
          ),
        ),
      );
      for (const source of api.SOURCES)
        assert.equal(proof.sources[source], hash(fs.readFileSync(path.join(desktop, source))));
      for (const [file, key] of [
        ['Invoke-Desktop.instrumented.ps1', 'wrapperSha'],
        ['launch-core.ps1', 'derivedSha'],
      ])
        assert.equal(proof[key], hash(fs.readFileSync(path.join(f.root, file))));
      await assert.rejects(local.prepare(f.root, input, mainMode));
      fs.appendFileSync(path.join(f.root, 'launch-core.ps1'), '# changed');
      await assert.rejects(local.verifyCopy(f.root, mainMode));
    } finally {
      f.close();
    }
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

test('paired startup cleanup admits only exact owned scripts/witnesses and empty private profiles', () => {
  const f = fixture();
  try {
    const owner = fs.readFileSync(path.join(f.root, '.owner'), 'utf8');
    const { ENTRY, CASES, BOOTSTRAP, materializeScript } = require('./retained-pipe-startup.cjs');
    for (const c of CASES) {
      const dir = path.join(f.root, c.directory);
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, '.owner'), owner);
      fs.writeFileSync(path.join(dir, 'fixture.ps1'), materializeScript(c.parameters));
      fs.writeFileSync(path.join(dir, 'entry.txt'), ENTRY);
      if (c.mode === 'plainShort') fs.writeFileSync(path.join(dir, 'bootstrap.json'), BOOTSTRAP);
      if (!c.deep) fs.mkdirSync(path.join(dir, 'profile'));
      else {
        let parent = f.root;
        for (const name of [
          c.deep,
          'Fonesi-Auto-' + owner,
          'launch-' + owner,
          'host-session-' + owner,
        ]) {
          parent = path.join(parent, name);
          fs.mkdirSync(parent);
          fs.writeFileSync(path.join(parent, '.owner'), owner);
        }
        fs.mkdirSync(path.join(parent, 'profile'));
      }
    }
    assert.equal(api.pipeStartupPlans(f.root, owner).length, 12);
    const unknown = path.join(f.root, 'retained-pipe-plain001', 'unknown');
    fs.writeFileSync(unknown, 'preserve');
    assert.throws(() => api.pipeStartupPlans(f.root, owner));
    assert.equal(fs.readFileSync(unknown, 'utf8'), 'preserve');
    fs.unlinkSync(unknown);
    fs.writeFileSync(path.join(f.root, 'retained-pipe-plain001', '.owner'), crypto.randomUUID());
    assert.throws(() => api.pipeStartupPlans(f.root, owner));
    assert.ok(fs.existsSync(path.join(f.root, 'retained-pipe-param001', 'fixture.ps1')));
  } finally {
    f.close();
  }
});
test('bound successful MAIN exposes only complete unique paired diagnostic slots without a false failure', () => {
  const { DIAGNOSTICS } = require('./retained-host-contract.cjs');
  const lines = Object.entries(DIAGNOSTICS)
    .filter(([slot]) => slot.startsWith('PIPE_'))
    .map(([slot, values]) => 'RETAINED_HOST_DIAGNOSTIC_' + slot + '_' + values[0]);
  assert.ok(lines.length > 0);
  assert.deepEqual(api.observerMarkers(lines.join('\n') + '\n'), lines);
  assert.deepEqual(api.observerMarkers(lines.slice(1).join('\n')), []);
  assert.deepEqual(api.observerMarkers([...lines, lines[0]].join('\n')), []);
  assert.deepEqual(api.observerMarkers([...lines, 'RETAINED_HOST_FAILED'].join('\n')), []);
});
function timeoutCapture(root, change = {}) {
  const value = capture('private output is never forwarded');
  value.process = { ...value.process, status: 'TIMEOUT', exitCode: null, ...change };
  fs.writeFileSync(path.join(root, 'launcher-capture.json'), JSON.stringify(value));
}
function timeoutCase(root, c) {
  const { ENTRY, BOOTSTRAP, materializeScript } = require('./retained-pipe-startup.cjs');
  const owner = fs.readFileSync(path.join(root, '.owner'), 'utf8'),
    dir = path.join(root, c.directory);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '.owner'), owner);
  fs.writeFileSync(path.join(dir, 'fixture.ps1'), materializeScript(c.parameters));
  fs.writeFileSync(path.join(dir, 'entry.txt'), ENTRY);
  if (c.mode === 'plainShort') fs.writeFileSync(path.join(dir, 'bootstrap.json'), BOOTSTRAP);
  let cursor = dir;
  if (c.deep) {
    cursor = root;
    for (const name of [
      c.deep,
      'Fonesi-Auto-' + owner,
      'launch-' + owner,
      'host-session-' + owner,
    ]) {
      cursor = path.join(cursor, name);
      fs.mkdirSync(cursor);
      fs.writeFileSync(path.join(cursor, '.owner'), owner);
    }
  }
  fs.mkdirSync(path.join(cursor, 'profile'));
  return { dir, profile: path.join(cursor, 'profile') };
}
test('timeout witness reads four owned fixed partitions without modifying any evidence', () => {
  const f = fixture();
  try {
    timeoutCapture(f.root);
    const { CASES } = require('./retained-pipe-startup.cjs');
    const absent = api.timeoutSnapshot(f.root);
    assert.equal(Object.keys(absent).length, 20);
    for (const c of CASES) {
      assert.equal(absent[c.mode.toUpperCase() + '_DIRECTORY'], 'ABSENT');
      timeoutCase(f.root, c);
    }
    const inventory = () => {
      const out = [];
      function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else {
            const s = fs.statSync(p);
            out.push([p, hash(fs.readFileSync(p)), s.mtimeMs, s.size]);
          }
        }
      }
      walk(f.root);
      return out;
    };
    const before = inventory(),
      v = api.timeoutSnapshot(f.root);
    assert.deepEqual(inventory(), before);
    for (const c of CASES) {
      const p = c.mode.toUpperCase() + '_';
      assert.equal(v[p + 'DIRECTORY'], 'VALID');
      assert.equal(v[p + 'SCRIPT'], 'MATCH');
      assert.equal(v[p + 'ENTRY'], 'MATCH');
      assert.equal(v[p + 'PROFILE'], 'EMPTY');
      assert.equal(v[p + 'CHAIN'], c.deep ? 'COMPLETE' : 'NOT_APPLICABLE');
    }
    assert.equal(JSON.stringify(v).includes('private'), false);
  } finally {
    f.close();
  }
});
test('timeout witness rejects wrong outer contexts and malformed duplicate capture before any fixture observation', () => {
  const f = fixture();
  try {
    for (const change of [
      { status: 'SUCCESS', exitCode: 0 },
      { exitCode: 1 },
      { cleanupComplete: false },
      { stdoutTruncated: true },
      { stderrTruncated: true },
    ]) {
      timeoutCapture(f.root, change);
      assert.throws(() => api.timeoutSnapshot(f.root));
    }
    timeoutCapture(f.root);
    const file = path.join(f.root, 'launcher-capture.json'),
      raw = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, raw.replace('"status":', '"status":"TIMEOUT","status":'));
    assert.throws(() => api.timeoutSnapshot(f.root));
  } finally {
    f.close();
  }
});
test('timeout witness classifies foreign owners unknown entries links and oversized profiles INVALID without cleanup', () => {
  const f = fixture();
  try {
    timeoutCapture(f.root);
    const c = require('./retained-pipe-startup.cjs').CASES[0],
      { dir, profile } = timeoutCase(f.root, c),
      prefix = c.mode.toUpperCase() + '_';
    const owner = fs.readFileSync(path.join(dir, '.owner'), 'utf8');
    fs.writeFileSync(path.join(dir, '.owner'), crypto.randomUUID());
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'DIRECTORY'], 'INVALID');
    fs.writeFileSync(path.join(dir, '.owner'), owner);
    const highBitOwner = Buffer.from(owner);
    highBitOwner[0] |= 128;
    fs.writeFileSync(path.join(dir, '.owner'), highBitOwner);
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'DIRECTORY'], 'INVALID');
    fs.writeFileSync(path.join(dir, '.owner'), owner);
    const unknown = path.join(dir, 'unknown');
    fs.writeFileSync(unknown, 'preserve');
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'DIRECTORY'], 'INVALID');
    assert.equal(fs.readFileSync(unknown, 'utf8'), 'preserve');
    fs.unlinkSync(unknown);
    const script = path.join(dir, 'fixture.ps1'),
      copy = fs.readFileSync(script),
      alias = path.join(f.root, 'held-script');
    fs.linkSync(script, alias);
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'DIRECTORY'], 'INVALID');
    fs.unlinkSync(alias);
    assert.deepEqual(fs.readFileSync(script), copy);
    const file = path.join(profile, 'private');
    fs.writeFileSync(file, 'not published');
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'PROFILE'], 'NONEMPTY');
    fs.truncateSync(file, 8388609);
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'PROFILE'], 'INVALID');
    assert.equal(fs.statSync(file).size, 8388609);
    fs.unlinkSync(file);
    const target = path.join(f.root, 'target');
    fs.writeFileSync(target, 'owned');
    const link = path.join(profile, 'alias');
    try {
      fs.symlinkSync(target, link);
      assert.equal(api.timeoutSnapshot(f.root)[prefix + 'PROFILE'], 'INVALID');
    } finally {
      if (fs.existsSync(link)) fs.unlinkSync(link);
    }
  } finally {
    f.close();
  }
});
test('timeout deep-chain absence partial completeness and foreign marker are distinct bounded facts', () => {
  const f = fixture();
  try {
    timeoutCapture(f.root);
    const c = require('./retained-pipe-startup.cjs').CASES[1],
      prefix = c.mode.toUpperCase() + '_',
      owner = fs.readFileSync(path.join(f.root, '.owner'), 'utf8');
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'CHAIN'], 'ABSENT');
    let cursor = f.root;
    const names = [c.deep, 'Fonesi-Auto-' + owner, 'launch-' + owner, 'host-session-' + owner];
    for (let n = 0; n < names.length; n++) {
      cursor = path.join(cursor, names[n]);
      fs.mkdirSync(cursor);
      fs.writeFileSync(path.join(cursor, '.owner'), owner);
      assert.equal(api.timeoutSnapshot(f.root)[prefix + 'CHAIN'], n === 3 ? 'COMPLETE' : 'PARTIAL');
    }
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'PROFILE'], 'ABSENT');
    fs.writeFileSync(path.join(cursor, '.owner'), crypto.randomUUID());
    assert.equal(api.timeoutSnapshot(f.root)[prefix + 'CHAIN'], 'INVALID');
  } finally {
    f.close();
  }
});
test('timeout CLI route verifies actual copy binding and exact twenty-slot PS forwarding while ordinary retirement stays unchanged', async () => {
  const f = fixture();
  try {
    api.materialize(f.root, await api.binding(f.root));
    timeoutCapture(f.root);
    const lines = await api.diagnoseTimeout(f.root);
    assert.equal(lines.length, 20);
    for (const [slot, values] of Object.entries(api.TIMEOUT_VECTOR))
      assert.equal(
        lines.filter((line) =>
          values.some((value) => line === 'RETAINED_HOST_TIMEOUT_' + slot + '_' + value),
        ).length,
        1,
      );
    const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
    const table =
      '$slots=[ordered]@{' +
      Object.entries(api.TIMEOUT_VECTOR)
        .map(([k, v]) => k + '=@(' + v.map((x) => "'" + x + "'").join(',') + ')')
        .join(';') +
      '}';
    assert.ok(ps.includes(table));
    assert.match(
      ps,
      /\$native.Status -ceq 'TIMEOUT' -and \$null -eq \$native.ExitCode -and \$native.CleanupComplete -and -not \$native.StdoutTruncated -and -not \$native.StderrTruncated/,
    );
    const retired = ps.slice(ps.indexOf('function Retired'), ps.indexOf('function Evidence'));
    assert.doesNotMatch(retired, /TIMEOUT/);
    assert.equal(
      api.diagnostics('diagnose-timeout', Error('private'))[0],
      'RETAINED_HOST_CONTROL_PHASE_DIAGNOSE',
    );
    fs.appendFileSync(path.join(f.root, 'launch-core.ps1'), '# drift');
    await assert.rejects(api.diagnoseTimeout(f.root));
  } finally {
    f.close();
  }
});

test('unreadable top-level fixture is INVALID rather than falsely ABSENT and creates no witnesses', () => {
  const f = fixture();
  try {
    timeoutCapture(f.root);
    const c = require('./retained-pipe-startup.cjs').CASES[0],
      target = path.join(f.root, c.directory);
    const before = fs.readdirSync(f.root).sort();
    let failures = 0;
    const local = localApi('a'.repeat(64), {
      'node:fs': {
        ...fs,
        lstatSync(file, ...args) {
          if (file === target) {
            failures++;
            throw Object.assign(Error('private denied'), { code: 'EACCES' });
          }
          return fs.lstatSync(file, ...args);
        },
      },
    });
    const v = local.timeoutSnapshot(f.root),
      prefix = c.mode.toUpperCase() + '_';
    assert.equal(failures, 1);
    for (const field of ['DIRECTORY', 'SCRIPT', 'ENTRY', 'PROFILE'])
      assert.equal(v[prefix + field], 'INVALID');
    assert.equal(v[prefix + 'CHAIN'], 'NOT_APPLICABLE');
    assert.deepEqual(fs.readdirSync(f.root).sort(), before);
  } finally {
    f.close();
  }
});
test('current verification root is exclusively fixed r with canonical owner and no legacy run fallback', () => {
  const f = fixture();
  try {
    assert.throws(() => fs.mkdirSync(f.root), { code: 'EEXIST' });
    timeoutCapture(f.root);
    api.timeoutSnapshot(f.root);
    const legacy = path.join(path.dirname(f.root), 'run-' + crypto.randomUUID());
    fs.renameSync(f.root, legacy);
    try {
      assert.throws(() => api.timeoutSnapshot(legacy));
    } finally {
      fs.renameSync(legacy, f.root);
    }
    const file = path.join(f.root, '.owner'),
      owner = fs.readFileSync(file);
    fs.appendFileSync(file, '\n');
    try {
      assert.throws(() => api.timeoutSnapshot(f.root));
    } finally {
      fs.writeFileSync(file, owner);
    }
    assert.throws(() => api.timeoutSnapshot(f.root + path.sep + '..' + path.sep + 'r'));
    const source = fs.readFileSync(path.join(__dirname, 'retained-host-control.cjs'), 'utf8'),
      cleanup = source.slice(
        source.indexOf('async function cleanup(root, main = false)'),
        source.indexOf('const PHASES ='),
      );
    assert.doesNotMatch(
      cleanup,
      /pipeStartupPlans|pipeStartupRoots|retained-pipe-|pipe-deep|pipe-test/,
    );
    assert.match(cleanup, /rootEntries\.length !== expected\.length/);
    assert.match(cleanup, /!expected\.includes\(e.name\)/);
  } finally {
    f.close();
  }
});

test('compiler identifier forwarding remains exact unique and bounded without raw output', () => {
  const { observerMarkers } = require('./retained-host-control.cjs');
  const base = 'RETAINED_HOST_PHASE_VERSION\nRETAINED_HOST_FAILED\n';
  assert.ok(
    observerMarkers(base + 'RETAINED_HOST_DIAGNOSTIC_COMPILECS_CS9999\n').includes(
      'RETAINED_HOST_DIAGNOSTIC_COMPILECS_CS9999',
    ),
  );
  for (const suffix of ['CS12345', 'CS12x4', 'CS1234/private'])
    assert.equal(
      observerMarkers(base + 'RETAINED_HOST_DIAGNOSTIC_COMPILECS_' + suffix + '\n').length,
      2,
    );
  assert.equal(
    observerMarkers(
      base + 'RETAINED_HOST_DIAGNOSTIC_COMPILECS_CS9999\nRETAINED_HOST_DIAGNOSTIC_COMPILECS_NONE\n',
    ).length,
    2,
  );
  const ps = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'Invoke-RetainedHostCheck.ps1'),
    'utf8',
  );
  assert.ok(
    ps.includes(
      "$slot -ceq 'COMPILECS' -and $line -cmatch '\\ARETAINED_HOST_DIAGNOSTIC_COMPILECS_CS[0-9]{4}\\z'",
    ),
  );
});

test('ordinary Win32 code forwarding is exact 1 through 499 and rejects duplicates', () => {
  const { observerMarkers } = require('./retained-host-control.cjs');
  const base = 'RETAINED_HOST_PHASE_VERSION\nRETAINED_HOST_FAILED\n';
  const prefix = 'RETAINED_HOST_DIAGNOSTIC_COMPILETEMPREASON_';
  for (const value of ['WIN32_0001', 'WIN32_0499'])
    assert.ok(observerMarkers(base + prefix + value + '\n').includes(prefix + value));
  for (const value of ['WIN32_0000', 'WIN32_0500', 'WIN32_9999', 'WIN32_0123/private', 'WIN32_123'])
    assert.equal(observerMarkers(base + prefix + value + '\n').length, 2);
  assert.equal(observerMarkers(base + prefix + 'WIN32_0123\n' + prefix + 'OTHER\n').length, 2);
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  assert.ok(ps.includes('COMPILETEMPREASON_WIN32_0[0-4][0-9]{2}\\z'));
  assert.ok(ps.includes("$line -cne 'RETAINED_HOST_DIAGNOSTIC_COMPILETEMPREASON_WIN32_0000'"));
});

test('PACKAGE prepare materializes exact raw packaged wrapper with explicit mode and no source fallback (synthetic package and historical admission only)', async () => {
  const f = fixture();
  try {
    const bytes = Buffer.alloc(8044989, 21),
      input = path.join(f.root, 'synthetic-input.zip');
    fs.writeFileSync(input, bytes, { flag: 'wx' });
    const descriptor = {
      packageRoot: path.join(f.root, 'relocated-package'),
      appRoot: desktop,
      buildRoot: path.join(desktop, 'build'),
      sourceHead: 'a'.repeat(40),
      sourceTree: 'b'.repeat(40),
      zipSha256: 'c'.repeat(64),
      zipBytes: 123,
      manifestSha256: 'd'.repeat(64),
    };
    const helper = {
      prepareBinding(root, head, tree) {
        assert.equal(root, f.root);
        assert.equal(head, descriptor.sourceHead);
        assert.equal(tree, descriptor.sourceTree);
        fs.writeFileSync(
          path.join(root, 'package-binding.json'),
          JSON.stringify({ version: 1, synthetic: true }),
          { flag: 'wx' },
        );
      },
      admitPackage(root) {
        assert.equal(root, f.root);
        assert.equal(
          fs.readFileSync(path.join(root, 'package-binding.json'), 'utf8'),
          JSON.stringify({ version: 1, synthetic: true }),
        );
        return descriptor;
      },
    };
    const local = localApi(hash(bytes), {
      './main-runtime-version-package.cjs': helper,
      './main-runtime-version-evidence.cjs': syntheticHistoricalEvidence(),
    });
    await local.prepare(
      f.root,
      input,
      'PACKAGE_VERSION',
      descriptor.sourceHead,
      descriptor.sourceTree,
    );
    await local.verifyCopy(f.root, 'PACKAGE_VERSION');
    const proof = JSON.parse(fs.readFileSync(path.join(f.root, 'copy.json')));
    assert.equal(proof.mode, 'PACKAGE_VERSION');
    assert.equal(
      proof.packageBindingSha256,
      hash(fs.readFileSync(path.join(f.root, 'package-binding.json'))),
    );
    assert.equal(
      fs.readFileSync(path.join(f.root, 'Invoke-Package.instrumented.ps1'), 'utf8'),
      fs.readFileSync(path.join(desktop, 'launch/Invoke-Package.ps1'), 'utf8'),
    );
    assert.equal(fs.existsSync(path.join(f.root, 'Invoke-Desktop.instrumented.ps1')), false);
    const core = fs.readFileSync(path.join(f.root, 'launch-core.ps1'), 'utf8');
    assert.equal(hash(core), proof.derivedSha);
    assert.ok(core.includes(path.join(desktop, 'verification/main-runtime-version-probe.cjs')));
    await assert.rejects(local.verifyCopy(f.root, true));
    await assert.rejects(local.verifyCopy(f.root, false));
    fs.appendFileSync(path.join(f.root, 'package-binding.json'), ' ');
    await assert.rejects(local.verifyCopy(f.root, 'PACKAGE_VERSION'));
  } finally {
    f.close();
  }
});

test('PACKAGE campaign is separately default-off, exact-gated, local-runtime and JSON-only without old matrices', () => {
  const raw = fs
    .readFileSync(path.resolve(desktop, '../.github/workflows/phase-02-software.yml'), 'utf8')
    .replaceAll('\r\n', '\n');
  const gate =
    "    if: false && ((github.event_name == 'workflow_dispatch' && inputs.run_package_version) || (github.event_name == 'push' && github.ref == 'refs/heads/phase-02' && contains(github.event.head_commit.message, '[package-version]')))";
  function check(text) {
    const normalized = text.replaceAll('\r\n', '\n'),
      job = normalized
        .split('  owned-package-version-development:\n')[1]
        ?.split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
    assert.ok(job);
    assert.ok(job.split('\n').includes(gate));
    assert.match(job, /needs: windows-software-only/);
    assert.match(normalized, /run_package_version:\n[\s\S]*?default: false/);
    assert.match(job, /Invoke-RetainedHostCheck.ps1 -PackageVersion/);
    assert.match(job, /validate_package_runtime_version.py publish/);
    assert.equal((job.match(/uses: actions\/upload-artifact/g) || []).length, 1);
    assert.match(job, /outputs.written == 'true'/);
    assert.doesNotMatch(
      job,
      /Invoke-(Foundation|Package|FleetUI|RecipientSetup|RetainedManagedFixture)\.ps1|validate_retained_host.py managed|\.png|PACKAGE_PROMOTION_READY|include-hidden-files/,
    );
  }
  for (const text of [raw, raw.replaceAll('\n', '\r\n')]) {
    check(text);
    for (const changed of [
      '',
      '    if: always()',
      gate.replace('false && (', '').slice(0, -1),
      gate.replace('[package-version]', '[main-version]'),
      gate.replace('inputs.run_package_version', 'true'),
      gate.replace('refs/heads/phase-02', 'refs/heads/main'),
    ]) {
      const normalized = text.replaceAll('\r\n', '\n'),
        mutated = normalized.replace(gate, changed);
      assert.notEqual(mutated, normalized);
      assert.throws(() => check(mutated));
    }
  }
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  assert.match(ps, /if\(\$MainVersion -and \$PackageVersion\)\{throw 'MODE_REJECTED'\}/);
  assert.match(ps, /'package-build-entry.mjs'/);
  assert.match(ps, /'validate_package.py'\),'extract',\$root/);
  assert.match(
    ps,
    /if\(\$PackageVersion\)\{\[Environment\]::SetEnvironmentVariable\('PATH',\[Environment\]::SystemDirectory,'Process'\)\}/,
  );
});
