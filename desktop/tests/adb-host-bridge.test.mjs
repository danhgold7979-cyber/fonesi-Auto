import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostBridge, parseHostFrame, HOST_FRAME_LIMIT } from '../src/main/adb-host-bridge.ts';
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const invocation = Object.freeze({
  version: 2,
  kind: 'INVOCATION',
  dispatched: true,
  processRetired: true,
  exitCode: 0,
  observation: 'VERSION',
});
const live = Object.freeze({
  version: 2,
  kind: 'SESSION',
  dispatched: true,
  jobState: 'LIVE',
  endpointState: 'OWNED',
  exitCode: null,
  observation: 'STARTED',
});
const retired = Object.freeze({
  ...live,
  jobState: 'RETIRED',
  endpointState: 'ABSENT',
  exitCode: 1,
  observation: 'STOPPED',
});
const frame = (v) => new TextEncoder().encode(JSON.stringify(v) + '\n');
const response = (request, result = invocation) => ({ ...request, result });
const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function fixture(extra = {}) {
  let receive,
    end,
    cleanups = 0,
    n = 2;
  const writes = [];
  const bridge = createHostBridge({
    sessionId: id(1),
    newAttemptId: () => id(n++),
    assertRuntime: () => {},
    transport: {
      subscribe(c, e) {
        receive = c;
        end = e;
      },
      write: async (bytes) => {
        writes.push(JSON.parse(new TextDecoder().decode(bytes)));
      },
      requestCleanup() {
        cleanups++;
      },
    },
    ...extra,
  });
  return {
    bridge,
    writes,
    receive: (bytes) => receive(bytes),
    end: () => end(),
    get cleanups() {
      return cleanups;
    },
  };
}
test('strict bounded duplicate-aware UTF8 frames preserve exact fixed facts', () => {
  const r = response({
    version: 1,
    sessionId: id(1),
    requestId: 1,
    attemptId: id(2),
    operation: 'VERSION',
  });
  assert.deepEqual(parseHostFrame(frame(r)), r);
  for (const bytes of [
    frame({ ...r, raw: 'private' }),
    frame({ ...r, result: { code: 'private' } }),
    frame({ ...r, requestId: 0 }),
    new Uint8Array(HOST_FRAME_LIMIT + 1),
    new Uint8Array([0xff, 10]),
    new Uint8Array([239, 187, 191, ...frame(r)]),
    new TextEncoder().encode(JSON.stringify(r)),
    new TextEncoder().encode(JSON.stringify(r) + '\n\n'),
    new TextEncoder().encode(
      JSON.stringify(r).replace('"version":1', '"version":1,"version":1') + '\n',
    ),
    new TextEncoder().encode(
      JSON.stringify(r).replace('"version":2', '"version":2,"\\u0076ersion":2') + '\n',
    ),
  ])
    assert.equal(parseHostFrame(bytes), null);
});
test('fragmented exact response resolves only after actual write settles', async () => {
  let finish;
  const writes = [];
  let receive;
  const f = fixture({
    transport: {
      subscribe(c) {
        receive = c;
      },
      write(bytes) {
        writes.push(JSON.parse(new TextDecoder().decode(bytes)));
        return new Promise((r) => (finish = r));
      },
      requestCleanup() {},
    },
  });
  const token = f.bridge.provider.reserveAttempt('VERSION');
  const p = f.bridge.provider.version(token, {});
  let done = false;
  p.then(() => (done = true));
  await tick();
  const bytes = frame(response(writes[0]));
  receive(bytes.subarray(0, 11));
  receive(bytes.subarray(11));
  await tick();
  assert.equal(done, false);
  finish();
  assert.deepEqual(await p, invocation);
});
test('concurrent exact retire stays available after close and late LIVE blocks reuse', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.bridge.close();
  const stop = p.retire(t);
  await tick();
  assert.equal(f.writes.length, 2);
  f.receive(frame(response(f.writes[1], retired)));
  assert.deepEqual(await stop, retired);
  assert.throws(() => p.reserveAttempt('VERSION'));
  f.receive(frame(response(f.writes[0], live)));
  assert.deepEqual(await start, live);
  assert.equal(f.cleanups, 1);
  await assert.rejects(p.health(t), /HOST_BRIDGE_UNCONFIRMED/);
});
test('foreign, duplicate, unsolicited and EOF frames request cleanup without retirement', async () => {
  for (const variant of ['foreign', 'unsolicited', 'duplicate', 'eof', 'oversize']) {
    const f = fixture(),
      p = f.bridge.provider,
      t = p.reserveAttempt('VERSION');
    const call = p.version(t, {});
    const rejected = assert.rejects(call, /HOST_BRIDGE_UNCONFIRMED/);
    await tick();
    if (variant === 'eof') f.end();
    else if (variant === 'oversize') f.receive(new Uint8Array(HOST_FRAME_LIMIT + 1));
    else {
      const r = response(f.writes[0]);
      if (variant === 'foreign') r.sessionId = id(9);
      if (variant === 'unsolicited') r.requestId = 99;
      if (variant === 'duplicate') {
        r.result = { code: 'UNRETIRED' };
        f.receive(frame(r));
      }
      f.receive(frame(r));
    }
    await rejected;
    assert.equal(f.bridge.closed, true);
    assert.equal(f.cleanups, 1);
    await assert.rejects(p.retire(t));
  }
});
test('never handed attempt retires without transport; runtime admission/close forbids effect', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const r = await p.retire(t);
  assert.equal(r.dispatched, false);
  assert.equal(r.jobState, 'RETIRED');
  assert.equal(f.writes.length, 0);
  let bridge;
  const g = fixture({
    assertRuntime() {
      bridge.close();
    },
  });
  bridge = g.bridge;
  const u = bridge.provider.reserveAttempt('VERSION');
  await assert.rejects(bridge.provider.version(u, {}));
  assert.equal(g.writes.length, 0);
  assert.equal((await bridge.provider.retire(u)).dispatched, false);
});
test('two ordinary requests refuse; fixed helper error remains uncertainty and foreign token cannot retire', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  await assert.rejects(p.health(t));
  await assert.rejects(p.retire({}));
  f.receive(frame(response(f.writes[0], { code: 'PROFILE_REJECTED' })));
  await assert.rejects(start);
  assert.throws(() => p.reserveAttempt('VERSION'));
  const stop = p.retire(t);
  await tick();
  f.receive(
    frame(
      response(f.writes[1], { ...retired, dispatched: false, exitCode: null, observation: null }),
    ),
  );
  await stop;
  assert.ok(p.reserveAttempt('VERSION'));
});
test('last runtime callback retirement fences first effect; VERSION never accepts HEALTH', async () => {
  let token, bridge;
  const f = fixture({
    assertRuntime() {
      void bridge.provider.retire(token);
    },
  });
  bridge = f.bridge;
  token = bridge.provider.reserveAttempt('VERSION');
  await assert.rejects(bridge.provider.version(token, {}));
  assert.equal(f.writes.length, 0);
  await assert.rejects(bridge.provider.health(token));
});
test('actual host adapter retains supplied read custody through live bridge then exact retirement', async () => {
  const { createHostAdapter } = await import('../src/main/adb-host-adapter.ts');
  const f = fixture(),
    read = Object.freeze({});
  let held = false,
    releases = 0;
  const runtime = Object.freeze({
    release: '37.0.1',
    archiveSha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    installationRevision: 1,
    adbPath: '/synthetic/adb.exe',
  });
  const admitted = () => ({
    ok: true,
    status: 'READ_VERIFIED_ONLY',
    token: read,
    observation: runtime,
  });
  const adapter = createHostAdapter({
    runtimeCustody: {
      async acquireRead() {
        assert.equal(held, false);
        held = true;
        return admitted();
      },
      async revalidateRead(t) {
        assert.equal(t, read);
        return admitted();
      },
      assertRead(t) {
        assert.equal(t, read);
        assert.equal(held, true);
      },
      async releaseRead(t) {
        assert.equal(t, read);
        held = false;
        releases++;
        return { ok: true, status: 'RETIRED' };
      },
    },
    nativeProvider: f.bridge.provider,
    assertOwnedSync() {},
    now: () => 1000,
    diagnosticId: () => id(8),
  });
  const capability = adapter.grant(id(5), () => {});
  const run = adapter.execute(capability, {
    version: 1,
    commandId: id(6),
    correlationId: id(7),
    ownerId: id(5),
    operation: 'SERVER_START',
    deadlineUtc: 2000,
  });
  for (let n = 0; n < 10 && !f.writes.length; n++) await tick();
  f.receive(frame(response(f.writes[0], live)));
  assert.equal((await run).outcome, 'OBSERVED');
  assert.equal(held, true);
  const closing = adapter.close();
  for (let n = 0; n < 10 && f.writes.length < 2; n++) await tick();
  f.receive(frame(response(f.writes[1], retired)));
  assert.equal(await closing, 'RETIRED');
  assert.equal(held, false);
  assert.equal(releases, 1);
});
test('retired flag without dispatched exit proof never permits replacement of exact attempt', async () => {
  for (const [kind, facts] of [
    ['VERSION', { ...invocation, exitCode: null }],
    ['FOREGROUND', { ...retired, exitCode: null }],
  ]) {
    const f = fixture(),
      p = f.bridge.provider,
      t = p.reserveAttempt(kind);
    const run = kind === 'VERSION' ? p.version(t, {}) : p.startForeground(t, {});
    await tick();
    f.receive(frame(response(f.writes[0], facts)));
    await run;
    assert.throws(() => p.reserveAttempt('VERSION'));
    const stopping = p.retire(t);
    await tick();
    f.receive(frame(response(f.writes[1], kind === 'VERSION' ? invocation : retired)));
    await stopping;
    assert.ok(p.reserveAttempt('VERSION'));
  }
});
