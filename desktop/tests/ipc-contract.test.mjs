import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, publicResponse, errorResponse } from '../src/ipc-contract.ts';
import { ViewSession } from '../src/view-session.ts';
const good = { version: 1, requestId: 'r_1', method: 'health.get' };
const wire = (value = good) => JSON.stringify(value);
const reject = (raw, code) => assert.deepEqual(parseRequest(raw), { ok: false, code });
test('two exact public reads and fixed errors', () => {
  for (const method of ['health.get', 'settings.get']) {
    const parsed = parseRequest(wire({ ...good, method }));
    assert.equal(parsed.ok, true);
    const result = JSON.parse(publicResponse(parsed.request));
    assert.equal(result.ok, true);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1024);
    if (method === 'settings.get')
      assert.deepEqual(result.result, {
        kind: 'settings',
        revision: 0,
        persistence: 'NOT_PERSISTED',
        theme: 'LIGHT',
      });
  }
  assert.deepEqual(JSON.parse(errorResponse('INVALID_SHAPE')), {
    version: 1,
    ok: false,
    code: 'INVALID_SHAPE',
  });
});
test('wire size and JSON rejection', () => {
  for (const value of [null, {}, [], 1, false]) reject(value, 'INVALID_TRANSPORT');
  for (const value of ['', '{', '{"x":NaN}', '\ufeff' + wire()]) reject(value, 'INVALID_JSON');
  reject(' '.repeat(513), 'PAYLOAD_TOO_LARGE');
  reject('é'.repeat(257), 'PAYLOAD_TOO_LARGE');
  const padded = wire() + ' '.repeat(512 - wire().length);
  assert.equal(parseRequest(padded).ok, true);
  reject(padded + ' ', 'PAYLOAD_TOO_LARGE');
});
test('exact flat shape and decoded duplicate keys', () => {
  for (const value of [
    null,
    [],
    {},
    { ...good, path: '/private' },
    { ...good, version: 1.1 },
    { ...good, requestId: {} },
    { ...good, version: null },
  ])
    reject(wire(value), 'INVALID_SHAPE');
  for (const raw of [
    '{"version":2,"version":1,"requestId":"r","method":"health.get"}',
    '{"version":1,"requestId":"r","method":"bad","method":"health.get"}',
    '{"version":1,"requestId":"r","\\u0072equestId":"x","method":"health.get"}',
    '{"version":{},"version":1,"requestId":"r","method":"health.get"}',
  ])
    reject(raw, 'INVALID_SHAPE');
});
test('field/version/method denials', () => {
  for (const requestId of ['', 'x'.repeat(33), 'é', 'line\n', '../'])
    reject(wire({ ...good, requestId }), 'INVALID_SHAPE');
  for (const version of [0, -1, 2]) reject(wire({ ...good, version }), 'UNSUPPORTED_VERSION');
  for (const method of ['shell.exec', 'health.get ', '', null, ['health.get']])
    assert.equal(parseRequest(wire({ ...good, method })).ok, false);
});
function fixture() {
  const owner = {};
  const caller = {
    sender: owner,
    isMainFrame: true,
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  };
  return { caller, session: new ViewSession(owner, caller.origin, caller.url) };
}
test('one main-owned bootstrap and no rearm', () => {
  const { session, caller } = fixture();
  assert.equal(session.admit(caller).code, 'SESSION_UNAVAILABLE');
  session.beginMainLoad(caller.url);
  assert.equal(session.finishInitial(caller), true);
  session.beginMainLoad(caller.url);
  assert.equal(session.status, 'REVOKED');
  assert.equal(session.finishInitial(caller), false);
  assert.equal(session.admit(caller).code, 'SESSION_REVOKED');
});
test('unexpected/repeated initialization and completion before load reject', () => {
  for (const mode of ['repeat', 'wrong', 'early']) {
    const { session, caller } = fixture();
    if (mode === 'repeat') {
      session.beginMainLoad(caller.url);
      session.beginMainLoad(caller.url);
    }
    if (mode === 'wrong') session.beginMainLoad('about:blank');
    assert.equal(session.finishInitial(caller), false);
    assert.equal(session.status, 'REVOKED');
  }
});
test('sender, frame, origin, URL each independently enforced', () => {
  const { session, caller } = fixture();
  session.beginMainLoad(caller.url);
  session.finishInitial(caller);
  for (const change of [
    { sender: {} },
    { isMainFrame: false },
    { origin: 'null' },
    { url: 'about:blank' },
  ])
    assert.equal(session.admit({ ...caller, ...change }).code, 'UNTRUSTED_SENDER');
});
test('held admissions cannot commit after revoke; eight-slot cap and idempotent release', () => {
  const { session, caller } = fixture();
  session.beginMainLoad(caller.url);
  session.finishInitial(caller);
  const held = Array.from({ length: 8 }, () => session.admit(caller));
  assert.ok(held.every((x) => x.ok && x.current()));
  assert.equal(session.admit(caller).code, 'BUSY');
  session.revoke();
  for (const admission of held) {
    assert.equal(admission.current(), false);
    admission.release();
    admission.release();
  }
  assert.equal(session.outstanding, 0);
  session.close();
  assert.equal(session.status, 'CLOSED');
});

const { createPublicClient } = await import('../src/preload-client.ts');
function clock() {
  const callbacks = new Set();
  return {
    timer: {
      set: (fn, ms) => {
        assert.equal(ms, 2000);
        callbacks.add(fn);
        return fn;
      },
      clear: (fn) => callbacks.delete(fn),
    },
    tick: () => {
      for (const fn of [...callbacks]) fn();
    },
  };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
test('preload exact public response and no arbitrary native data', async () => {
  const c = clock();
  const client = createPublicClient(
    async (raw) => publicResponse(parseRequest(raw).request),
    c.timer,
  );
  assert.equal(JSON.parse(await client.health()).result.status, 'READY');
  await flush();
  assert.equal(client.outstanding(), 0);
  for (const raw of [
    'private-error',
    '{}',
    JSON.stringify({ version: 1, ok: false, code: 'private' }),
    'x'.repeat(1025),
  ]) {
    const bad = createPublicClient(async () => raw, c.timer);
    assert.equal(JSON.parse(await bad.health()).code, 'INTERNAL_FAILURE');
  }
});
test('timeout retains native slots; late delivery discarded; no retry', async () => {
  const c = clock(),
    resolves = [];
  let count = 0;
  const client = createPublicClient((raw) => {
    count++;
    return new Promise((resolve) =>
      resolves.push(() => resolve(publicResponse(parseRequest(raw).request))),
    );
  }, c.timer);
  const requests = Array.from({ length: 8 }, () => client.health());
  c.tick();
  assert.ok((await Promise.all(requests)).every((raw) => JSON.parse(raw).code === 'TIMEOUT'));
  assert.equal(client.outstanding(), 8);
  assert.equal(JSON.parse(await client.settings()).code, 'BUSY');
  assert.equal(count, 8);
  resolves[0]();
  await flush();
  assert.equal(client.outstanding(), 7);
  assert.equal(count, 8);
  client.dispose();
  for (const resolve of resolves.slice(1)) resolve();
  await flush();
  assert.equal(client.outstanding(), 0);
});
test('disposal returns unavailable and never revives client', async () => {
  const c = clock();
  let finish;
  const client = createPublicClient(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    c.timer,
  );
  const pending = client.settings();
  client.dispose();
  assert.equal(JSON.parse(await pending).code, 'SESSION_UNAVAILABLE');
  assert.equal(JSON.parse(await client.health()).code, 'SESSION_UNAVAILABLE');
  finish('private');
  await flush();
  assert.equal(client.outstanding(), 0);
});

test('preload accepts only exact main serialization; duplicate response keys reject', async () => {
  const raws = [
    '{"version":1,"ok":false,"ok":true,"requestId":"r1","result":{"kind":"health","status":"READY","services":"UNAVAILABLE"}}',
    '{"version":1,"ok":true,"requestId":"r1","result":{"kind":"health","status":"FAILED","status":"READY","services":"UNAVAILABLE"}}',
    '{"version":1,"ok":false,"code":"private","code":"BUSY"}',
    ' {"version":1,"ok":false,"code":"BUSY"}',
  ];
  for (const raw of raws) {
    const client = createPublicClient(async () => raw, clock().timer);
    assert.equal(JSON.parse(await client.health()).code, 'INTERNAL_FAILURE');
  }
});
