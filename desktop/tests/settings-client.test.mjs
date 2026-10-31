import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsClient, createSettingsReadiness } from '../src/settings-client.ts';
import { createPublicClient, createDiagnosticClient } from '../src/preload-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { settingsSuccess, settingsError } from '../src/settings-contract.ts';
const flush = () => new Promise((resolve) => setImmediate(resolve));
function timer() {
  const callbacks = new Set();
  return {
    set(fn, ms) {
      assert.equal(ms, 2000);
      callbacks.add(fn);
      return fn;
    },
    clear(fn) {
      callbacks.delete(fn);
    },
    expire() {
      for (const fn of [...callbacks]) fn();
    },
  };
}
const settings = {
  revision: 0,
  theme: 'LIGHT',
  dockWidth: null,
  tileWidth: 150,
  persistence: 'PERSISTED',
};
const code = (raw) => JSON.parse(raw).code;
test('four wrappers exact bounded wires and request/outcome binding', async () => {
  const wires = [];
  const c = createSettingsClient(async (raw) => {
    const r = JSON.parse(raw);
    wires.push(r);
    return settingsSuccess(
      r.requestId,
      r.method === 'preferences.get' ? 'OBSERVED' : 'COMMITTED',
      settings,
      'AVAILABLE',
    );
  });
  assert.ok(Object.isFrozen(c));
  for (const promise of [
    c.read(),
    c.update(0, { theme: 'DARK' }),
    c.reset(0),
    c.restorePrevious(0),
  ])
    assert.equal(JSON.parse(await promise).ok, true);
  assert.deepEqual(
    wires.map((r) => r.method),
    ['preferences.get', 'preferences.update', 'preferences.reset', 'preferences.restorePrevious'],
  );
  assert.deepEqual(
    wires.map((r) => r.requestId),
    ['p1', 'p2', 'p3', 'p4'],
  );
  assert.deepEqual(wires[1].patch, { theme: 'DARK' });
  await flush();
  assert.equal(c.outstanding(), 0);
});
test('invalid wrappers never invoke; input descriptors copied before native await', async () => {
  let calls = 0,
    resolveNative,
    wire;
  const c = createSettingsClient((raw) => {
    calls++;
    wire = raw;
    return new Promise((r) => {
      resolveNative = r;
    });
  });
  let getter = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'theme', {
    enumerable: true,
    get() {
      getter++;
      return 'DARK';
    },
  });
  for (const p of [
    c.update(-0, { theme: 'DARK' }),
    c.update(0, {}),
    c.update(0, accessor),
    c.reset(-1),
    c.restorePrevious('0'),
  ])
    assert.equal(code(await p), 'INVALID_SHAPE');
  assert.equal(calls, 0);
  assert.equal(getter, 0);
  const patch = { theme: 'DARK' };
  const p = c.update(0, patch);
  patch.theme = 'LIGHT';
  assert.equal(JSON.parse(wire).patch.theme, 'DARK');
  resolveNative(settingsSuccess('p1', 'COMMITTED', settings, 'DEGRADED'));
  assert.equal(JSON.parse(await p).auditHealth, 'DEGRADED');
});
test('shared cap covers public v1 v2 and settings; timeout/disposal never release occupancy', async () => {
  const b = createInvocationBudget(),
    t = timer(),
    resolvers = [];
  const invoke = () => new Promise((r) => resolvers.push(r));
  const a = createPublicClient(invoke, t, b),
    d = createDiagnosticClient(invoke, t, b),
    s = createSettingsClient(invoke, b, t);
  const pending = [a.health(), d.health(), ...Array.from({ length: 6 }, () => s.read())];
  assert.equal(b.outstanding(), 8);
  assert.equal(code(await s.read()), 'BUSY');
  assert.equal(code(await a.settings()), 'BUSY');
  assert.equal(code(await d.settings()), 'BUSY');
  t.expire();
  for (const p of pending) assert.equal(code(await p), 'TIMEOUT');
  assert.equal(b.outstanding(), 8);
  s.dispose();
  a.dispose();
  d.dispose();
  assert.equal(b.outstanding(), 8);
  for (const r of resolvers) r('PRIVATE_INVALID_LATE');
  await flush();
  assert.equal(b.outstanding(), 0);
  assert.equal(code(await s.read()), 'SESSION_UNAVAILABLE');
});
test('late timeout reply discarded without retry and slot released only settlement', async () => {
  let settle,
    calls = 0;
  const b = createInvocationBudget(),
    t = timer();
  const c = createSettingsClient(
    () => {
      calls++;
      return new Promise((r) => {
        settle = r;
      });
    },
    b,
    t,
  );
  const p = c.read();
  t.expire();
  assert.equal(code(await p), 'TIMEOUT');
  assert.equal(b.outstanding(), 1);
  settle(settingsSuccess('p1', 'OBSERVED', settings, 'AVAILABLE'));
  await flush();
  assert.equal(code(await p), 'TIMEOUT');
  assert.equal(calls, 1);
  assert.equal(b.outstanding(), 0);
});
test('wrong ID/outcome malformed duplicate response and native exceptions yield fixed local failure', async () => {
  for (const raw of [
    settingsSuccess('wrong', 'OBSERVED', settings, 'AVAILABLE'),
    settingsSuccess('p1', 'COMMITTED', settings, 'AVAILABLE'),
    'PRIVATE',
    settingsSuccess('p1', 'OBSERVED', settings, 'AVAILABLE').replace(
      '"ok":true',
      '"ok":false,"ok":true',
    ),
  ]) {
    const c = createSettingsClient(async () => raw);
    const value = JSON.parse(await c.read());
    assert.deepEqual(value, {
      version: 1,
      ok: false,
      code: 'INTERNAL_FAILURE',
      diagnosticId: null,
      auditHealth: 'DEGRADED',
    });
  }
  const mutation = createSettingsClient(async () =>
    settingsSuccess('p1', 'OBSERVED', settings, 'AVAILABLE'),
  );
  assert.equal(code(await mutation.reset(0)), 'INTERNAL_FAILURE');
  for (const invoke of [
    () => {
      throw Error('PRIVATE');
    },
    async () => {
      throw Error('PRIVATE');
    },
  ]) {
    const b = createInvocationBudget();
    assert.equal(code(await createSettingsClient(invoke, b).read()), 'INTERNAL_FAILURE');
    await flush();
    assert.equal(b.outstanding(), 0);
  }
});
test('valid main error preserved and disposal denies pending delivery', async () => {
  const raw = settingsError('CONFLICT', 'abcdefab-1234-1234-1234-abcdefabcdef', 'AVAILABLE');
  assert.equal(await createSettingsClient(async () => raw).read(), raw);
  let resolve;
  const b = createInvocationBudget(),
    c = createSettingsClient(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
      b,
    );
  const p = c.reset(0);
  c.dispose();
  assert.equal(code(await p), 'SESSION_UNAVAILABLE');
  assert.equal(b.outstanding(), 1);
  resolve(raw);
  await flush();
  assert.equal(b.outstanding(), 0);
});

test('private readiness signals once before or after read; shared cap and no mutation queue', async () => {
  for (const before of [true, false]) {
    const ready = createSettingsReadiness(),
      b = createInvocationBudget(),
      t = timer();
    let calls = 0;
    const c = createSettingsClient(
      async (raw) => {
        calls++;
        const r = JSON.parse(raw);
        return settingsSuccess(
          r.requestId,
          r.method === 'preferences.get' ? 'OBSERVED' : 'COMMITTED',
          settings,
          'AVAILABLE',
        );
      },
      b,
      t,
      ready,
    );
    if (before) ready.signal();
    const p = c.read();
    await flush();
    assert.equal(calls, before ? 1 : 0);
    ready.signal();
    ready.signal();
    assert.equal(JSON.parse(await p).ok, true);
    await flush();
    assert.equal(calls, 1);
    assert.equal(b.outstanding(), 0);
  }
  const ready = createSettingsReadiness(),
    b = createInvocationBudget(),
    t = timer();
  let calls = 0;
  const c = createSettingsClient(
    async () => {
      calls++;
      return settingsError('SESSION_UNAVAILABLE', null, 'DEGRADED');
    },
    b,
    t,
    ready,
  );
  assert.equal(code(await c.reset(0)), 'SESSION_UNAVAILABLE');
  assert.equal(calls, 1);
  await flush();
  const pending = Array.from({ length: 8 }, () => c.read());
  assert.equal(code(await c.read()), 'BUSY');
  assert.equal(b.outstanding(), 8);
  t.expire();
  assert.deepEqual((await Promise.all(pending)).map(code), Array(8).fill('TIMEOUT'));
  await flush();
  assert.equal(b.outstanding(), 0);
  ready.signal();
  await flush();
  assert.equal(calls, 1);
});
test('readiness timeout disposal and already-closed gate never invoke on late signal', async () => {
  for (const mode of ['timeout', 'dispose', 'closed']) {
    const ready = createSettingsReadiness(),
      b = createInvocationBudget(),
      t = timer();
    let calls = 0;
    if (mode === 'closed') ready.dispose();
    const c = createSettingsClient(
        async () => {
          calls++;
          return '';
        },
        b,
        t,
        ready,
      ),
      p = c.read();
    if (mode === 'timeout') t.expire();
    if (mode === 'dispose') {
      ready.dispose();
      c.dispose();
    }
    assert.equal(code(await p), mode === 'timeout' ? 'TIMEOUT' : 'SESSION_UNAVAILABLE');
    ready.signal();
    ready.signal();
    await flush();
    assert.equal(calls, 0);
    assert.equal(b.outstanding(), 0);
  }
});
