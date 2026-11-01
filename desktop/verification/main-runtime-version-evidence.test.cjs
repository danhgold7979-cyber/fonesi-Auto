'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const evidence = require('./main-runtime-version-evidence.cjs'),
  control = require('./retained-host-control.cjs');
const desktop = path.resolve(__dirname, '..');
async function fixture(extra = false) {
  const base = fs.realpathSync.native(path.join(desktop, '.test-output')),
    root = fs.mkdtempSync(path.join(base, 'main-version-audit-')),
    owner = randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), owner, { flag: 'wx' });
  const directory = path.join(root, 'logs-main'),
    { LogStore } = await import('../src/main/log-store.ts'),
    store = await LogStore.open(
      { root: directory, parentToken: owner },
      '2026-11-01T14:00:00.000Z',
      () => {},
      owner,
    );
  const b = {
      version: 1,
      operationId: randomUUID(),
      installationRevision: 2,
      expectedRevision: 0,
      pendingRevision: 1,
      verifiedRevision: 2,
      reads: 2,
      requestId: 'p2',
    },
    runId = randomUUID(),
    diagnosticId = randomUUID();
  let seq = 0;
  const make = (operation, phase, outcome, resultingRevision) => ({
    schemaVersion: 7,
    runId,
    sequence: ++seq,
    utc: '2026-11-01T14:00:00.000Z',
    severity: 'INFO',
    component: 'MAIN',
    task: 'P2-01',
    event: 'RUNTIME_VERSION',
    diagnosticId: operation === 'READ' ? randomUUID() : diagnosticId,
    code: 'OK',
    operation,
    phase,
    operationId: operation === 'READ' ? null : b.operationId,
    expectedRevision: operation === 'READ' ? null : b.expectedRevision,
    resultingRevision,
    installationRevision: b.installationRevision,
    outcome,
  });
  const rows = [
    make('READ', 'RESULT', 'OBSERVED', 0),
    make('REQUEST', 'INTENT', 'INTENT', null),
    make('REQUEST', 'RESULT', 'PENDING', 1),
    make('VERIFY', 'INTENT', 'INTENT', null),
    make('VERIFY', 'RESULT', 'VERIFIED', 2),
    make('READ', 'RESULT', 'OBSERVED', 2),
  ];
  if (extra) rows.push(make('REQUEST', 'INTENT', 'INTENT', null));
  for (const row of rows) {
    assert.equal(store.enqueue(row), 'QUEUED');
    assert.equal(await store.flush(), 'FLUSHED');
  }
  assert.equal(await store.close(), 'FLUSHED');
  return {
    root,
    directory,
    owner,
    b,
    close() {
      assert.equal(fs.realpathSync.native(root), root);
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), owner);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
test('actual owned LogStore canonical schema7 inventory binds four effects and explicit reads to private tuple', async () => {
  const f = await fixture();
  try {
    assert.equal(fs.readdirSync(f.directory).filter((n) => n.endsWith('.jsonl')).length, 6);
    assert.deepEqual(await evidence.audit(f.directory, f.b, control.binary, f.owner), {
      schema7Intents: true,
      schema7Result: true,
    });
    for (const patch of [
      { installationRevision: 3 },
      { operationId: randomUUID() },
      { reads: 3 },
      { expectedRevision: 1 },
      { verifiedRevision: 3 },
    ])
      await assert.rejects(
        evidence.audit(f.directory, { ...f.b, ...patch }, control.binary, f.owner),
      );
  } finally {
    f.close();
  }
});
test('duplicate effect, unknown private file and altered owner cannot masquerade as completed audit', async () => {
  const duplicate = await fixture(true);
  try {
    await assert.rejects(
      evidence.audit(duplicate.directory, duplicate.b, control.binary, duplicate.owner),
    );
  } finally {
    duplicate.close();
  }
  const f = await fixture();
  try {
    await assert.rejects(evidence.audit(f.directory, f.b, control.binary, randomUUID()));
    const file = path.join(f.directory, 'private-extra');
    fs.writeFileSync(file, 'preserve');
    await assert.rejects(evidence.audit(f.directory, f.b, control.binary, f.owner));
    assert.equal(fs.readFileSync(file, 'utf8'), 'preserve');
  } finally {
    f.close();
  }
});
test('ten exact historical hashes reuse old proof without executing compiler or helper', () => {
  const h = evidence.historical(desktop, control.binary);
  assert.equal(Object.keys(h.sourceHashes).length, 10);
  assert.equal(h.reportSha256, evidence.REPORT_SHA);
  assert.equal(evidence.LABEL, 'REUSED_C955D1CA_NOT_RERUN');
  assert.throws(() => evidence.historical(desktop, () => Buffer.from('changed')));
});
test('main mode is explicit and old transform still selects only original historical observer', () => {
  const original = fs.readFileSync(path.join(desktop, 'launch/launch-core.ps1'), 'utf8');
  assert.ok(
    control.transform(original, desktop).includes('verification/retained-host-main-probe.cjs'),
  );
  const derived = control.transform(original, desktop, true);
  assert.ok(derived.includes('verification/main-runtime-version-probe.cjs'));
  assert.ok(!derived.includes('verification/retained-host-main-probe.cjs'));
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  assert.match(ps, /param\(\[switch\]\$MainVersion,\[switch\]\$PackageVersion\)/);
  assert.match(ps, /\$action\+'-main'/);
  assert.match(ps, /240000,10000,32768/);
});
test('new main workflow is explicit JSON-only and never reruns unchanged managed or other native campaigns', () => {
  const source = fs
    .readFileSync(path.resolve(desktop, '../.github/workflows/phase-02-software.yml'), 'utf8')
    .replaceAll('\r\n', '\n');
  for (const workflow of [source, source.replaceAll('\n', '\r\n')]) {
    const job = workflow
      .replaceAll('\r\n', '\n')
      .slice(workflow.replaceAll('\r\n', '\n').indexOf('  owned-main-version-development:'))
      .split(/\n {2}[a-z][a-z0-9-]*:\n/)[0];
    assert.match(job, /needs: windows-software-only/);
    assert.match(job, /inputs.run_main_version/);
    assert.match(job, /\[main-version\]/);
    assert.match(job, /Invoke-RetainedHostCheck.ps1 -MainVersion/);
    assert.match(job, /validate_main_runtime_version.py publish/);
    assert.match(job, /outputs.written == 'true'/);
    assert.doesNotMatch(
      job,
      /Invoke-RetainedManagedFixture|validate_retained_host.py managed|Invoke-Foundation|Invoke-Persistence|screenshots|\.png/,
    );
    assert.equal((job.match(/uses: actions\/upload-artifact/g) || []).length, 1);
  }
});

test('main workflow gate is exact under LF/CRLF and refuses missing, wrong or always-on conditions', () => {
  const source = fs
    .readFileSync(path.resolve(desktop, '../.github/workflows/phase-02-software.yml'), 'utf8')
    .replaceAll('\r\n', '\n');
  const expected =
    "    if: (github.event_name == 'workflow_dispatch' && inputs.run_main_version) || (github.event_name == 'push' && github.ref == 'refs/heads/phase-02' && contains(github.event.head_commit.message, '[main-version]'))";
  function accepted(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n'),
      start = lines.indexOf('  owned-main-version-development:');
    if (start < 0) return false;
    const tail = lines.slice(start + 1),
      end = tail.findIndex((v) => /^ {2}[a-z].*:$/.test(v));
    const block = end < 0 ? tail : tail.slice(0, end);
    return (
      block.filter((v) => v.startsWith('    if:')).length === 1 &&
      block.includes(expected) &&
      block.includes('    needs: windows-software-only')
    );
  }
  assert.equal(accepted(source), true);
  assert.equal(accepted(source.replace(/\n/g, '\r\n')), true);
  for (const replacement of [
    '',
    '    if: always()',
    expected.replace('[main-version]', '[retained-version]'),
    expected.replace('refs/heads/phase-02', 'refs/heads/main'),
    expected.replace('inputs.run_main_version', 'true'),
  ]) {
    const changed = source.replace(expected, replacement);
    assert.notEqual(changed, source);
    assert.equal(accepted(changed), false);
    assert.equal(accepted(changed.replaceAll('\n', '\r\n')), false);
  }
});

test('new main diagnostics match finite PS tables and never echo arbitrary or duplicate values', () => {
  const { PHASES, REASONS } = require('./main-runtime-version-contract.cjs');
  const ps = fs.readFileSync(path.join(__dirname, 'Invoke-RetainedHostCheck.ps1'), 'utf8');
  const body = ps.split('function Show-MainVersion($p){')[1].split('function Show-Native')[0];
  for (const [slot, values] of [
    ['PHASE', PHASES],
    ['REASON', REASONS],
  ]) {
    const match = body.match(new RegExp(slot + '=@\\(([^)]*)\\)'));
    assert.deepEqual(
      [...match[1].matchAll(/'([^']+)'/g)].map((v) => v[1]),
      values,
    );
  }
  const lines = [
    'MAIN_RUNTIME_VERSION_PHASE_VERIFY',
    'MAIN_RUNTIME_VERSION_REASON_TIMEOUT',
    'MAIN_RUNTIME_VERSION_FAILED',
  ];
  assert.deepEqual(control.observerMarkers(lines.join('\r\n') + '\r\nprivate data', true), lines);
  assert.deepEqual(control.observerMarkers([...lines, lines[0]].join('\n'), true), []);
  assert.deepEqual(control.observerMarkers(lines.slice(1).join('\n'), true), []);
});

test('actual audit bytes require selected packaged encoder and never fall back when it rejects', async () => {
  const f = await fixture(),
    token = Object.freeze({ packageTest: true });
  let calls = 0,
    refuse = false;
  const m = { exports: {} };
  require('node:vm').runInNewContext(
    fs.readFileSync(path.join(__dirname, 'main-runtime-version-evidence.cjs'), 'utf8'),
    {
      module: m,
      exports: m.exports,
      __dirname,
      Buffer,
      TextDecoder,
      require(name) {
        if (name === './main-runtime-version-package.cjs')
          return {
            loadBuild(t, output) {
              assert.equal(t, token);
              assert.equal(output, 'log-contract.cjs');
              return {
                encodeLogRecord(row) {
                  calls++;
                  if (refuse) throw Error('PACKAGE_ENCODER_REJECTED');
                  return require('../build/log-contract.cjs').encodeLogRecord(
                    JSON.parse(JSON.stringify(row)),
                  ); /* VM realm bridge only. */
                },
              };
            },
          };
        if (name === '../build/log-contract.cjs') throw Error('SOURCE_FALLBACK');
        return require(name);
      },
    },
    {
      filename: path.join(__dirname, 'main-runtime-version-evidence.cjs'),
      importModuleDynamically: require('node:vm').constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    },
  );
  try {
    assert.equal(
      (await m.exports.audit(f.directory, f.b, control.binary, f.owner, token)).schema7Result,
      true,
    );
    assert.equal(calls, 6);
    refuse = true;
    await assert.rejects(
      m.exports.audit(f.directory, f.b, control.binary, f.owner, token),
      /PACKAGE_ENCODER_REJECTED/,
    );
  } finally {
    f.close();
  }
});
