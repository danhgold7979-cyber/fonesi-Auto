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

const acquisition = (payload = '') => ({
  version: 1,
  kind: 'ACQUISITION',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  payloadBase64: Buffer.from(payload).toString('base64'),
  observedAtUtc: 1000,
});
const queryResponse = (q, facts = acquisition()) => ({
  version: 2,
  sessionId: q.sessionId,
  requestId: q.requestId,
  attemptId: q.attemptId,
  operation: 'DISCOVER',
  result: facts,
});
test('v2 acquisition exact bounded canonical base64 is disjoint from legacy SESSION frames', () => {
  const q = { version: 2, sessionId: id(1), requestId: 2, attemptId: id(2), operation: 'DISCOVER' };
  for (const raw of ['', 'serial device transport_id:1\n', 'x'.repeat(32768)])
    assert.ok(parseHostFrame(frame({ ...q, result: acquisition(raw) })));
  for (const patch of [
    { payloadBase64: 'YQ' },
    { payloadBase64: 'YR==' },
    { payloadBase64: 'YQ==\n' },
    { payloadBase64: Buffer.alloc(32769, 65).toString('base64') },
    { payloadBase64: 'AA==' },
    { payloadBase64: '/w==' },
    { payloadBase64: '77u/' },
    { operationRetired: false },
    { observedAtUtc: -1 },
    { code: 'BUSY' },
    { raw: 'secret' },
  ])
    assert.equal(parseHostFrame(frame({ ...q, result: { ...acquisition(), ...patch } })), null);
  assert.equal(parseHostFrame(frame({ ...q, version: 1, result: acquisition() })), null);
  assert.equal(parseHostFrame(frame({ ...q, result: live })), null);
  assert.equal(parseHostFrame(frame({ ...q, deadlineUtc: 2000, result: acquisition() })), null);
  const bytes = frame({ ...q, result: acquisition() });
  assert.equal(
    parseHostFrame(
      Buffer.from(
        Buffer.from(bytes)
          .toString()
          .replace('"payloadBase64":""', '"payloadBase64":"","payloadBase64":""'),
      ),
    ),
    null,
  );
});
test('discovery shares counter and foreground attempt without releasing session, while RETIRE preempts query', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    token = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(token, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  const query = p.discover(token, 2000);
  await tick();
  assert.deepEqual(Object.keys(f.writes[1]), [
    'version',
    'sessionId',
    'requestId',
    'attemptId',
    'operation',
    'deadlineUtc',
  ]);
  assert.equal(f.writes[1].version, 2);
  assert.equal(f.writes[1].requestId, 2);
  const stop = p.retire(token);
  await tick();
  assert.equal(f.writes[2].requestId, 3);
  f.receive(frame(response(f.writes[2], retired)));
  await stop;
  f.receive(frame(queryResponse(f.writes[1])));
  assert.equal((await query).operationRetired, true);
  // Late query success must not overwrite actual SESSION retirement.
  assert.doesNotThrow(() => p.reserveAttempt('FOREGROUND'));
});
test('128 admitted queries use one attempt and query success alone never authorizes another reserve', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  for (let i = 0; i < 128; i++) {
    const query = p.discover(t, 2000);
    await tick();
    f.receive(frame(queryResponse(f.writes.at(-1))));
    await query;
  }
  assert.equal(f.writes.length, 129);
  assert.throws(() => p.reserveAttempt('FOREGROUND'));
  await assert.rejects(p.discover(t, 2000));
  assert.equal(f.writes.length, 129);
  const stop = p.retire(t);
  await tick();
  f.receive(frame(response(f.writes.at(-1), retired)));
  await stop;
});

test('acquisition response waits its write callback and refuses cross-version or late duplicate responses', async () => {
  let receive, writeDone;
  const writes = [];
  const f = fixture({
    transport: {
      subscribe(c) {
        receive = c;
      },
      write(bytes) {
        const q = JSON.parse(Buffer.from(bytes));
        writes.push(q);
        return q.operation === 'DISCOVER'
          ? new Promise((r) => {
              writeDone = r;
            })
          : Promise.resolve();
      },
      requestCleanup() {},
    },
  });
  const p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND'),
    start = p.startForeground(t, {});
  await tick();
  receive(frame(response(writes[0], live)));
  await start;
  const query = p.discover(t, 2000);
  let complete = false;
  void query.then(() => {
    complete = true;
  });
  await tick();
  const bytes = frame(queryResponse(writes[1]));
  receive(bytes.subarray(0, 21));
  receive(bytes.subarray(21));
  await tick();
  assert.equal(complete, false);
  writeDone();
  assert.equal((await query).status, 'COMPLETE');
  receive(bytes);
  assert.equal(f.bridge.closed, true);
  await assert.rejects(p.discover(t, 2000));
});
