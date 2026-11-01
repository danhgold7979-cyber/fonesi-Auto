'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const c = require('./retained-rollback-contract.cjs'),
  a = require('./retained-rollback-audit.cjs'),
  base = require('./retained-host-control.cjs');
function fixtureBinding(stage) {
  return {
    version: 1,
    stage,
    setup:
      stage === 'REOPEN'
        ? null
        : {
            operationId: randomUUID(),
            expectedRevision: 0,
            pendingRevision: 1,
            verifiedRevision: 2,
            reads: 3,
            requestId: 'p1',
            action: c.EXPECTED[stage].action,
          },
    runtime: {
      operationId: randomUUID(),
      installationRevision: c.EXPECTED[stage].installationRevision,
      expectedRevision: 0,
      pendingRevision: 1,
      verifiedRevision: 2,
      reads: 2,
      requestId: 'p2',
    },
  };
}
function rows(b, runId = randomUUID()) {
  let sequence = 0;
  const out = [];
  function group(isSetup) {
    const op = isSetup ? b.setup : b.runtime,
      diagnosticId = randomUUID();
    function row(operation, phase, outcome, resultingRevision) {
      const value = {
        schemaVersion: isSetup ? 8 : 7,
        runId,
        sequence: ++sequence,
        utc: '2026-11-01T14:00:00.000Z',
        severity: 'INFO',
        component: 'MAIN',
        task: 'P2-01',
        event: isSetup ? 'PLATFORM_TOOLS_SETUP' : 'RUNTIME_VERSION',
        operation,
        phase,
        diagnosticId: operation === 'READ' ? randomUUID() : diagnosticId,
        operationId: operation === 'READ' ? null : op.operationId,
        expectedRevision: operation === 'READ' ? null : op.expectedRevision,
        resultingRevision,
        ...(isSetup
          ? { action: operation === 'PROVISION' ? op.action : null }
          : { installationRevision: op.installationRevision }),
        outcome,
        code: 'OK',
      };
      out.push(value);
    }
    row('READ', 'RESULT', 'OBSERVED', 0);
    if (isSetup) row('READ', 'RESULT', 'OBSERVED', 0);
    if (op) {
      row('REQUEST', 'INTENT', 'INTENT', null);
      row('REQUEST', 'RESULT', 'PENDING', 1);
      row(isSetup ? 'PROVISION' : 'VERIFY', 'INTENT', 'INTENT', null);
      row(isSetup ? 'PROVISION' : 'VERIFY', 'RESULT', isSetup ? 'VERIFIED_LOCAL' : 'VERIFIED', 2);
      row('READ', 'RESULT', 'OBSERVED', 2);
    }
  }
  group(true);
  group(false);
  return out;
}
test('schema8 setup actions and schema7 VERSION tuples reject causal wrong action/order/count/installation', () => {
  for (const stage of c.STAGES) {
    const b = fixtureBinding(stage),
      r = rows(b);
    assert.doesNotThrow(() => a.correlate(r, b));
    for (const change of [
      (list) => list.push({ ...list.at(-1), sequence: 100 }),
      (list) => {
        list.find((x) => x.schemaVersion === 7 && x.operation === 'VERIFY').installationRevision =
          99;
      },
      (list) => {
        list.find((x) => x.operation === 'REQUEST').operationId = randomUUID();
      },
    ]) {
      const copy = structuredClone(r);
      change(copy);
      assert.throws(() => a.correlate(copy, b));
    }
    if (b.setup) {
      const copy = structuredClone(r);
      copy.find((x) => x.operation === 'PROVISION').action = 'OTHER';
      assert.throws(() => a.correlate(copy, b));
    }
  }
});
test('actual LogStore four releases preserve prior per-flush segments and reset sequence by new run only', async () => {
  const root = fs.mkdtempSync(
      path.join(fs.realpathSync.native(path.join(__dirname, '../.test-output')), 'rollback-audit-'),
    ),
    parentToken = randomUUID(),
    directory = path.join(root, 'logs-main');
  fs.writeFileSync(path.join(root, '.owner'), parentToken, { flag: 'wx' });
  try {
    const { LogStore } = await import('../src/main/log-store.ts');
    let previous = null;
    for (const stage of c.STAGES) {
      const owner = randomUUID(),
        store = await LogStore.open(
          { root: directory, parentToken },
          '2026-11-01T14:00:00.000Z',
          () => {},
          owner,
        ),
        b = fixtureBinding(stage);
      for (const row of rows(b)) {
        assert.equal(store.enqueue(row), 'QUEUED');
        assert.equal(await store.flush(), 'FLUSHED');
      }
      assert.equal(await store.close(), 'FLUSHED');
      const result = await a.audit(directory, b, base.binary, owner, previous);
      assert.equal(result.runIds.length, c.EXPECTED[stage].epoch);
      for (const [name, value] of Object.entries(previous?.history ?? {}))
        assert.deepEqual(result.history[name], value);
      await assert.rejects(a.audit(directory, b, base.binary, randomUUID(), previous));
      const wrong = structuredClone(previous);
      if (wrong) {
        wrong.runIds[0] = randomUUID();
        await assert.rejects(a.audit(directory, b, base.binary, owner, wrong));
      }
      previous = result;
    }
    assert.ok(fs.readdirSync(directory).filter((n) => n.endsWith('.jsonl')).length > 4);
  } finally {
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), parentToken);
    fs.rmSync(root, { recursive: true, force: false });
  }
});
test('actual finalized audit rejects unknown files, rewritten prior segment witness and missing historical records without mutation', async () => {
  const root = fs.mkdtempSync(
      path.join(
        fs.realpathSync.native(path.join(__dirname, '../.test-output')),
        'rollback-audit-negative-',
      ),
    ),
    token = randomUUID(),
    directory = path.join(root, 'logs-main');
  fs.writeFileSync(path.join(root, '.owner'), token, { flag: 'wx' });
  try {
    const { LogStore } = await import('../src/main/log-store.ts');
    let prior;
    for (const stage of ['SEED', 'UPGRADE']) {
      const owner = randomUUID(),
        store = await LogStore.open(
          { root: directory, parentToken: token },
          '2026-11-01T14:00:00.000Z',
          () => {},
          owner,
        ),
        b = fixtureBinding(stage);
      for (const row of rows(b)) {
        assert.equal(store.enqueue(row), 'QUEUED');
        await store.flush();
      }
      await store.close();
      if (stage === 'SEED') {
        prior = await a.audit(directory, b, base.binary, owner);
        const original = Object.keys(prior.history).find((n) => n.endsWith('.jsonl')),
          originalMeta = original.slice(0, -6) + '.meta.json';
        const { segmentFilename, metadataFilename } = await import('../src/log-store-schema.ts');
        const otherId = randomUUID();
        for (const [renamed, renamedMeta] of [
          ['unknown.jsonl', 'unknown.meta.json'],
          [segmentFilename(otherId), metadataFilename(otherId)],
        ]) {
          fs.renameSync(path.join(directory, original), path.join(directory, renamed));
          fs.renameSync(path.join(directory, originalMeta), path.join(directory, renamedMeta));
          try {
            await assert.rejects(a.audit(directory, b, base.binary, owner));
            assert.equal(fs.existsSync(path.join(directory, renamed)), true);
            assert.equal(fs.existsSync(path.join(directory, renamedMeta)), true);
          } finally {
            fs.renameSync(path.join(directory, renamed), path.join(directory, original));
            fs.renameSync(path.join(directory, renamedMeta), path.join(directory, originalMeta));
          }
        }
        assert.deepEqual(await a.audit(directory, b, base.binary, owner), prior);
        continue;
      }
      const before = Object.fromEntries(
        fs
          .readdirSync(directory)
          .map((name) => [name, fs.readFileSync(path.join(directory, name))]),
      );
      const wrong = structuredClone(prior),
        name = Object.keys(wrong.history)[0];
      wrong.history[name].sha256 = 'f'.repeat(64);
      await assert.rejects(a.audit(directory, b, base.binary, owner, wrong));
      fs.writeFileSync(path.join(directory, 'unknown.json'), '{}', { flag: 'wx' });
      await assert.rejects(a.audit(directory, b, base.binary, owner, prior));
      fs.unlinkSync(path.join(directory, 'unknown.json'));
      const selected = Object.keys(prior.history).find((n) => n.endsWith('.jsonl')),
        saved = fs.readFileSync(path.join(directory, selected));
      fs.unlinkSync(path.join(directory, selected));
      await assert.rejects(a.audit(directory, b, base.binary, owner, prior));
      fs.writeFileSync(path.join(directory, selected), saved, { flag: 'wx' });
      assert.deepEqual(
        Object.fromEntries(
          fs.readdirSync(directory).map((n) => [n, fs.readFileSync(path.join(directory, n))]),
        ),
        before,
      );
    }
  } finally {
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), token);
    fs.rmSync(root, { recursive: true, force: false });
  }
});
