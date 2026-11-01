import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformToolsSetupClient } from '../src/platform-tools-setup-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { createSettingsReadiness } from '../src/settings-client.ts';
import { setupSuccess } from '../src/platform-tools-setup-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const state = {
  revision: 0,
  installationRevision: 0,
  state: 'UNAVAILABLE',
  operationId: null,
  code: null,
  installTargetVersion: '37.0.1',
  activeVersion: null,
  rollbackAvailable: false,
};
const flush = () => new Promise((r) => setImmediate(r));
function timer() {
  const rows = new Set();
  return {
    set(fn, ms) {
      assert.equal(ms, 2000);
      rows.add(fn);
      return fn;
    },
    clear(fn) {
      rows.delete(fn);
    },
    expire() {
      for (const fn of [...rows]) fn();
    },
    expireLast() {
      [...rows].at(-1)?.();
    },
  };
}
const answer = (wire, outcome = 'OBSERVED', snapshot = state) =>
  setupSuccess(JSON.parse(wire).requestId, outcome, snapshot, id, 'AVAILABLE');
test('setup requires fresh observed read, exact path-free request and explicit reconciliation after pending', async () => {
  const wires = [];
  const client = createPlatformToolsSetupClient(async (wire) => {
    wires.push(JSON.parse(wire));
    return answer(
      wire,
      JSON.parse(wire).method === 'platformTools.get' ? 'OBSERVED' : 'PENDING',
      JSON.parse(wire).method === 'platformTools.get'
        ? state
        : { ...state, revision: 1, state: 'AWAITING_RECIPIENT', operationId: id },
    );
  });
  assert.equal(JSON.parse(await client.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
  assert.equal(wires.length, 0);
  assert.equal(JSON.parse(await client.read()).outcome, 'OBSERVED');
  assert.equal(JSON.parse(await client.requestSetup(0)).outcome, 'PENDING');
  assert.deepEqual(Object.keys(wires[1]), ['version', 'requestId', 'method', 'expectedRevision']);
  assert.equal(wires[1].requestId, 'p2');
  assert.equal(JSON.parse(await client.requestSetup(1)).code, 'SESSION_UNAVAILABLE');
  assert.equal(wires.length, 2);
  client.dispose();
});
test('shared8 unresolved cap remains held after timeout; no late success or automatic setup retry', async () => {
  const budget = createInvocationBudget(),
    t = timer();
  let calls = 0,
    resolve;
  const client = createPlatformToolsSetupClient(
    async (wire) => {
      calls++;
      if (calls === 1) return answer(wire);
      return new Promise((r) => (resolve = r));
    },
    budget,
    t,
  );
  await client.read();
  const pending = client.requestSetup(0);
  await flush();
  t.expire();
  const failed = JSON.parse(await pending);
  assert.equal(failed.code, 'TIMEOUT');
  assert.equal(failed.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(client.outstanding(), 1);
  resolve(
    answer(JSON.stringify({ requestId: 'p2' }), 'PENDING', {
      ...state,
      revision: 1,
      state: 'AWAITING_RECIPIENT',
      operationId: id,
    }),
  );
  await flush();
  assert.equal(client.outstanding(), 0);
  assert.equal(calls, 2);
  assert.equal(JSON.parse(await client.requestSetup(1)).code, 'SESSION_UNAVAILABLE');
  const other = createPlatformToolsSetupClient(() => new Promise(() => {}), budget, t);
  const eight = Array.from({ length: 8 }, () => other.read());
  assert.equal(JSON.parse(await other.read()).code, 'BUSY');
  other.dispose();
  await Promise.all(eight);
  client.dispose();
});
test('readiness cancellation never invokes late, and setup disposal after dispatch reports uncertainty', async () => {
  const ready = createSettingsReadiness(),
    t = timer();
  let calls = 0;
  const waiting = createPlatformToolsSetupClient(
    () => {
      calls++;
      return Promise.resolve('');
    },
    undefined,
    t,
    ready,
  );
  const p = waiting.read();
  t.expire();
  assert.equal(JSON.parse(await p).code, 'TIMEOUT');
  ready.signal();
  await flush();
  assert.equal(calls, 0);
  waiting.dispose();
  const active = createPlatformToolsSetupClient(
    async (wire) => (++calls === 1 ? answer(wire) : new Promise(() => {})),
    undefined,
    t,
  );
  await active.read();
  const setup = active.requestSetup(0);
  active.dispose();
  const result = JSON.parse(await setup);
  assert.equal(result.outcome, 'OUTCOME_UNKNOWN');
  assert.equal(result.code, 'SESSION_UNAVAILABLE');
});
test('wrong correlation, wrong outcome and raw native failures cannot enable setup', async () => {
  for (const result of [
    answer(JSON.stringify({ requestId: 'p999' })),
    answer(JSON.stringify({ requestId: 'p1' }), 'PENDING', {
      ...state,
      state: 'AWAITING_RECIPIENT',
      operationId: id,
    }),
    '{"private":"secret"}',
  ]) {
    const client = createPlatformToolsSetupClient(async () => result);
    assert.equal(JSON.parse(await client.read()).code, 'INTERNAL_FAILURE');
    assert.equal(JSON.parse(await client.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
    client.dispose();
  }
});

test('an older read cannot reopen setup after a newer setup timeout; only fresh explicit read reconciles', async () => {
  const t = timer(),
    calls = [];
  let oldRead, setupReply;
  const client = createPlatformToolsSetupClient(
    (wire) => {
      calls.push(wire);
      if (calls.length === 2) return new Promise((r) => (oldRead = () => r(answer(wire))));
      if (calls.length === 3)
        return new Promise(
          (r) =>
            (setupReply = () =>
              r(
                answer(wire, 'PENDING', {
                  ...state,
                  revision: 1,
                  state: 'AWAITING_RECIPIENT',
                  operationId: id,
                }),
              )),
        );
      return Promise.resolve(
        answer(
          wire,
          JSON.parse(wire).method === 'platformTools.get' ? 'OBSERVED' : 'PENDING',
          JSON.parse(wire).method === 'platformTools.get'
            ? state
            : { ...state, revision: 1, state: 'AWAITING_RECIPIENT', operationId: id },
        ),
      );
    },
    undefined,
    t,
  );
  await client.read();
  await flush();
  const stale = client.read();
  const pending = client.requestSetup(0);
  t.expireLast();
  assert.equal(JSON.parse(await pending).code, 'TIMEOUT');
  oldRead();
  assert.equal(JSON.parse(await stale).outcome, 'OBSERVED');
  assert.equal(JSON.parse(await client.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
  assert.equal(calls.length, 3);
  setupReply();
  await flush();
  assert.equal(client.outstanding(), 0);
  assert.equal(JSON.parse(await client.requestSetup(0)).code, 'SESSION_UNAVAILABLE');
  await client.read();
  assert.equal(JSON.parse(await client.requestSetup(0)).outcome, 'PENDING');
  assert.equal(calls.length, 5);
  client.dispose();
});
