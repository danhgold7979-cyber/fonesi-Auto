import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticsExportClient } from '../src/diagnostics-export-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { diagnosticsExportSuccess } from '../src/diagnostics-report-contract.ts';
const snapshot = {
  revision: 0,
  state: 'IDLE',
  operationId: null,
  records: 0,
  dropped: 0,
  bytes: 0,
  sha256: null,
  code: null,
};
const tick = () => new Promise((r) => setImmediate(r));
function timers() {
  const work = new Set();
  return {
    set(fn) {
      work.add(fn);
      return fn;
    },
    clear(fn) {
      work.delete(fn);
    },
    expire() {
      for (const fn of [...work]) fn();
    },
  };
}
test('client exposes explicit methods only, validates scalars before serialization and correlates responses', async () => {
  const calls = [],
    client = createDiagnosticsExportClient(async (raw) => {
      const q = JSON.parse(raw);
      calls.push(q);
      return diagnosticsExportSuccess(q.requestId, snapshot);
    });
  assert.equal(JSON.parse(await client.get()).ok, true);
  assert.equal(
    JSON.parse(
      await client.export({
        get revision() {
          throw Error();
        },
      }),
    ).code,
    'INVALID_REQUEST',
  );
  assert.equal(JSON.parse(await client.export(1n)).code, 'INVALID_REQUEST');
  assert.equal(calls.length, 1);
  const wrong = createDiagnosticsExportClient(async () =>
    diagnosticsExportSuccess('p999', snapshot),
  );
  assert.equal(JSON.parse(await wrong.get()).code, 'INTERNAL_FAILURE');
  client.dispose();
});
test('timeout keeps native lease until settlement and never replays export', async () => {
  const timer = timers(),
    budget = createInvocationBudget();
  let finish,
    calls = 0;
  const client = createDiagnosticsExportClient(
    (raw) => {
      calls++;
      return new Promise((r) => {
        finish = () => r(diagnosticsExportSuccess(JSON.parse(raw).requestId, snapshot));
      });
    },
    budget,
    timer,
  );
  const work = client.export(0);
  assert.equal(budget.outstanding(), 1);
  timer.expire();
  assert.equal(JSON.parse(await work).code, 'TIMEOUT');
  assert.equal(budget.outstanding(), 1);
  assert.equal(calls, 1);
  finish();
  await tick();
  assert.equal(budget.outstanding(), 0);
  assert.equal(calls, 1);
});
test('cancel uses reserved slot and disposal suppresses late native result', async () => {
  const budget = createInvocationBudget(),
    held = Array.from({ length: 7 }, () => budget.acquire()),
    timer = timers();
  let finish;
  const client = createDiagnosticsExportClient(
    () =>
      new Promise((r) => {
        finish = r;
      }),
    budget,
    timer,
  );
  assert.equal(JSON.parse(await client.get()).code, 'BUSY');
  const work = client.cancel('00000000-0000-4000-8000-000000000001');
  assert.equal(budget.outstanding(), 8);
  client.dispose();
  assert.equal(JSON.parse(await work).code, 'SESSION_UNAVAILABLE');
  assert.equal(budget.outstanding(), 8);
  finish('late');
  await tick();
  assert.equal(budget.outstanding(), 7);
  held.forEach((x) => {
    x.release();
  });
});

test('dispose during budget or timer admission prevents invoke and releases only unused lease', async () => {
  for (const stage of ['budget', 'timer']) {
    const underlying = createInvocationBudget();
    let client,
      calls = 0,
      clears = 0;
    const budget = {
      ...underlying,
      acquire() {
        const lease = underlying.acquire();
        if (stage === 'budget') client.dispose();
        return lease;
      },
    };
    client = createDiagnosticsExportClient(
      async () => {
        calls++;
        return 'unexpected';
      },
      budget,
      {
        set() {
          if (stage === 'timer') client.dispose();
          return 1;
        },
        clear() {
          clears++;
        },
      },
    );
    assert.equal(JSON.parse(await client.export(0)).code, 'SESSION_UNAVAILABLE');
    assert.equal(calls, 0);
    assert.equal(underlying.outstanding(), 0);
    assert.equal(clears, stage === 'timer' ? 1 : 0);
  }
});

test('timer setup failure or immediate expiry does not dispatch or leak a lease', async () => {
  for (const stage of ['throw', 'expire']) {
    const budget = createInvocationBudget();
    let calls = 0;
    const client = createDiagnosticsExportClient(
      async () => {
        calls++;
        return 'unexpected';
      },
      budget,
      {
        set(fn) {
          if (stage === 'throw') throw Error('timer unavailable');
          fn();
          return 1;
        },
        clear() {
          throw Error('clear unavailable');
        },
      },
    );
    assert.equal(
      JSON.parse(await client.export(0)).code,
      stage === 'throw' ? 'INTERNAL_FAILURE' : 'TIMEOUT',
    );
    assert.equal(calls, 0);
    assert.equal(budget.outstanding(), 0);
    client.dispose();
  }
});

test('throwing timer cleanup cannot leak the settled native lease', async () => {
  const budget = createInvocationBudget();
  let settle;
  const client = createDiagnosticsExportClient(
    (raw) =>
      new Promise((resolve) => {
        settle = () => resolve(diagnosticsExportSuccess(JSON.parse(raw).requestId, snapshot));
      }),
    budget,
    {
      set() {
        return 1;
      },
      clear() {
        throw Error('clear');
      },
    },
  );
  const result = client.export(0);
  client.dispose();
  assert.equal(JSON.parse(await result).code, 'SESSION_UNAVAILABLE');
  assert.equal(budget.outstanding(), 1);
  settle();
  await tick();
  assert.equal(budget.outstanding(), 0);
});
