import { preparingVideo } from '../src/main/video-contract.ts';
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

const metadataFacts = () => ({
  version: 1,
  kind: 'METADATA_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  stdoutBase64: 'bW9kZWw=',
  stderrBase64: '',
  remoteExitCode: 0,
  observedAtUtc: 1000,
});
const metadataResponse = (r, result = metadataFacts()) => ({
  version: 3,
  sessionId: r.sessionId,
  requestId: r.requestId,
  attemptId: r.attemptId,
  operation: 'METADATA',
  result,
});
test('metadata v3 binds exact field/transport and shares the discovery request counter and 128 cap', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  for (let i = 0; i < 128; i++) {
    const meta = i % 2 === 0,
      q = meta ? p.metadata(t, '18446744073709551615', 'MODEL', 2000) : p.discover(t, 2000);
    await tick();
    const r = f.writes.at(-1);
    assert.equal(r.requestId, i + 2);
    if (meta) {
      assert.deepEqual(Object.keys(r), [
        'version',
        'sessionId',
        'requestId',
        'attemptId',
        'operation',
        'field',
        'transportId',
        'deadlineUtc',
      ]);
      assert.equal(r.transportId, '18446744073709551615');
      f.receive(frame(metadataResponse(r)));
    } else f.receive(frame(queryResponse(r)));
    await q;
  }
  await assert.rejects(p.metadata(t, '1', 'MODEL', 2000));
  assert.equal(f.writes.length, 129);
  assert.throws(() => p.reserveAttempt('FOREGROUND'));
});
test('metadata v3 rejects cross-version facts and noncanonical selector before write', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  for (const [tid, field, deadline] of [
    ['1\n', 'MODEL', 2000],
    ['1', 'MODEL;id', 2000],
    ['1', 'MODEL', 8640000000000001],
  ])
    await assert.rejects(p.metadata(t, tid, field, deadline));
  assert.equal(f.writes.length, 1);
  const q = p.metadata(t, '1', 'MODEL', 2000);
  await tick();
  const r = metadataResponse(f.writes.at(-1));
  assert.equal(parseHostFrame(frame({ ...r, version: 2 })), null);
  f.receive(frame({ ...r, version: 2 }));
  await assert.rejects(q);
  assert.equal(f.bridge.closed, true);
});
test('metadata response is withheld until actual request write completion', async () => {
  let receive, done;
  const writes = [];
  const f = fixture({
    transport: {
      subscribe(c) {
        receive = c;
      },
      write(bytes) {
        const r = JSON.parse(Buffer.from(bytes));
        writes.push(r);
        return r.operation === 'METADATA'
          ? new Promise((resolve) => {
              done = resolve;
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
  let settled = false;
  const q = p.metadata(t, '1', 'MODEL', 2000).then((v) => {
    settled = true;
    return v;
  });
  await tick();
  receive(frame(metadataResponse(writes[1])));
  await tick();
  assert.equal(settled, false);
  done();
  assert.equal((await q).remoteExitCode, 0);
});

const inputFacts = () => ({
  version: 1,
  kind: 'INPUT_QUERY',
  status: 'COMPLETE',
  code: 'OK',
  dispatched: true,
  operationRetired: true,
  stdoutEmpty: true,
  stderrEmpty: true,
  remoteExitCode: 0,
  observedAtUtc: 1000,
});
const inputResponse = (r, result = inputFacts()) => ({
  version: 4,
  sessionId: r.sessionId,
  requestId: r.requestId,
  attemptId: r.attemptId,
  operation: 'INPUT',
  result,
});
test('input v4 binds exact field/transport and shares the discovery request counter and 128 cap', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  for (let i = 0; i < 128; i++) {
    const meta = i % 3 === 0,
      other = i % 3 === 1,
      q = meta
        ? p.input(t, '18446744073709551615', 'HOME', 2000)
        : other
          ? p.metadata(t, '1', 'MODEL', 2000)
          : p.discover(t, 2000);
    await tick();
    const r = f.writes.at(-1);
    assert.equal(r.requestId, i + 2);
    if (meta) {
      assert.deepEqual(Object.keys(r), [
        'version',
        'sessionId',
        'requestId',
        'attemptId',
        'operation',
        'action',
        'transportId',
        'deadlineUtc',
      ]);
      assert.equal(r.transportId, '18446744073709551615');
      f.receive(frame(inputResponse(r)));
    } else f.receive(frame(other ? metadataResponse(r) : queryResponse(r)));
    await q;
  }
  await assert.rejects(p.input(t, '1', 'HOME', 2000));
  assert.equal(f.writes.length, 129);
  assert.throws(() => p.reserveAttempt('FOREGROUND'));
});
test('input v4 rejects cross-version facts and noncanonical selector before write', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const start = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await start;
  for (const [tid, field, deadline] of [
    ['1\n', 'HOME', 2000],
    ['1', 'HOME;id', 2000],
    ['1', 'HOME', 8640000000000001],
  ])
    await assert.rejects(p.input(t, tid, field, deadline));
  assert.equal(f.writes.length, 1);
  const q = p.input(t, '1', 'HOME', 2000);
  await tick();
  const r = inputResponse(f.writes.at(-1));
  assert.equal(parseHostFrame(frame({ ...r, version: 2 })), null);
  f.receive(frame({ ...r, version: 2 }));
  await assert.rejects(q);
  assert.equal(f.bridge.closed, true);
});
test('input response is withheld until actual request write completion', async () => {
  let receive, done;
  const writes = [];
  const f = fixture({
    transport: {
      subscribe(c) {
        receive = c;
      },
      write(bytes) {
        const r = JSON.parse(Buffer.from(bytes));
        writes.push(r);
        return r.operation === 'INPUT'
          ? new Promise((resolve) => {
              done = resolve;
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
  let settled = false;
  const q = p.input(t, '1', 'HOME', 2000).then((v) => {
    settled = true;
    return v;
  });
  await tick();
  receive(frame(inputResponse(writes[1])));
  await tick();
  assert.equal(settled, false);
  done();
  assert.equal((await q).remoteExitCode, 0);
});

const videoResponse = (r, result) => ({
  version: 5,
  requestId: r.requestId,
  sessionId: r.sessionId,
  attemptId: r.attemptId,
  kind: r.kind,
  result,
});
test('v5 exact separate video control framing retains foreground and supports pending START Stop', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const liveStart = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes[0], live)));
  await liveStart;
  const req = {
    videoId: id(9),
    transportId: '7',
    hostEpoch: 3,
    deadlineUtc: 2000,
    artifactId: 'a'.repeat(64),
    scid: 17,
    nonceHex: 'b'.repeat(64),
  };
  const start = p.videoStart(t, req);
  await tick();
  assert.deepEqual(Object.keys(f.writes[1]), [
    'version',
    'requestId',
    'sessionId',
    'attemptId',
    'kind',
    'videoId',
    'transportId',
    'hostEpoch',
    'deadlineUtc',
    'artifactId',
    'scid',
    'nonceHex',
  ]);
  const stop = p.videoStop(t, id(9));
  await tick();
  assert.equal(f.writes.length, 3);
  const stopping = {
    ...preparingVideo(id(9)),
    snapshotRevision: 1,
    state: 'STOPPING',
    code: 'CLOSED',
  };
  f.receive(frame(videoResponse(f.writes[2], stopping)));
  assert.equal((await stop).localRetired, false);
  f.receive(frame(videoResponse(f.writes[1], preparingVideo(id(9)))));
  await start;
  assert.throws(() => p.reserveAttempt('FOREGROUND'));
  await assert.rejects(p.videoStatus(t, id(9)));
  const retire = p.retire(t);
  await tick();
  f.receive(frame(response(f.writes[3], retired)));
  await retire;
});
test('v5 snapshot mismatch, duplicate keys and v1 video confusion refuse without media leak', () => {
  const r = {
    version: 5,
    requestId: 1,
    sessionId: id(1),
    attemptId: id(2),
    kind: 'VIDEO_STATUS',
    result: preparingVideo(id(9)),
  };
  assert.ok(parseHostFrame(frame(r)));
  for (const change of [
    { upload: 'PARTIAL' },
    { cleanup: 'PENDING' },
    { directory: 'CREATED', launch: 'EXITED', upload: 'NONE' },
  ])
    assert.equal(parseHostFrame(frame({ ...r, result: { ...r.result, ...change } })), null);
  assert.equal(parseHostFrame(frame({ ...r, kind: 'INPUT' })), null);
  assert.equal(parseHostFrame(frame({ ...r, version: 1 })), null);
  assert.equal(
    parseHostFrame(
      new TextEncoder().encode(
        JSON.stringify(r).replace('"version":5', '"version":5,"version":5') + '\n',
      ),
    ),
    null,
  );
  assert.equal(
    parseHostFrame(frame({ ...r, result: { ...r.result, encodedPayload: 'private' } })),
    null,
  );
});
test('v5 controls have their own128 cap and retain Stop after exhaustion without a new videoId', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const a = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes.at(-1), live)));
  await a;
  const request = {
    videoId: id(9),
    transportId: '7',
    hostEpoch: 3,
    deadlineUtc: 2000,
    artifactId: 'a'.repeat(64),
    scid: 17,
    nonceHex: 'b'.repeat(64),
  };
  const start = p.videoStart(t, request);
  await tick();
  f.receive(frame(videoResponse(f.writes.at(-1), preparingVideo(id(9)))));
  await start;
  for (let i = 1; i < 128; i++) {
    const status = p.videoStatus(t, id(9));
    await tick();
    f.receive(frame(videoResponse(f.writes.at(-1), preparingVideo(id(9)))));
    await status;
  }
  const before = f.writes.length;
  await assert.rejects(p.videoStatus(t, id(9)));
  assert.equal(f.writes.length, before);
  const stop = p.videoStop(t, id(9));
  await tick();
  f.receive(
    frame(
      videoResponse(f.writes.at(-1), {
        ...preparingVideo(id(9)),
        snapshotRevision: 1,
        state: 'CLOSED',
        code: 'CLOSED',
        localRetired: true,
      }),
    ),
  );
  await stop;
  await assert.rejects(p.videoStart(t, { ...request, videoId: id(10) }));
});
test('v5 response is not delivered before actual transport write settlement', async () => {
  let receive, done;
  const writes = [];
  const f = fixture({
    transport: {
      subscribe(c) {
        receive = c;
      },
      requestCleanup() {},
      write(bytes) {
        const r = JSON.parse(new TextDecoder().decode(bytes));
        writes.push(r);
        return r.version === 5
          ? new Promise((resolve) => {
              done = resolve;
            })
          : Promise.resolve();
      },
    },
  });
  const p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND'),
    a = p.startForeground(t, {});
  await tick();
  receive(frame(response(writes[0], live)));
  await a;
  let settled = false;
  const q = p
    .videoStart(t, {
      videoId: id(9),
      transportId: '7',
      hostEpoch: 3,
      deadlineUtc: 2000,
      artifactId: 'a'.repeat(64),
      scid: 17,
      nonceHex: 'b'.repeat(64),
    })
    .then((v) => {
      settled = true;
      return v;
    });
  await tick();
  receive(frame(videoResponse(writes[1], preparingVideo(id(9)))));
  await tick();
  assert.equal(settled, false);
  done();
  await q;
});

test('late unretired v5 response invalidates prior foreground terminal evidence', async () => {
  const f = fixture(),
    p = f.bridge.provider,
    t = p.reserveAttempt('FOREGROUND');
  const starting = p.startForeground(t, {});
  await tick();
  f.receive(frame(response(f.writes.at(-1), live)));
  await starting;
  const video = p.videoStart(t, {
    videoId: id(9),
    transportId: '7',
    hostEpoch: 3,
    deadlineUtc: 2000,
    artifactId: 'a'.repeat(64),
    scid: 17,
    nonceHex: 'b'.repeat(64),
  });
  await tick();
  const videoRequest = f.writes.at(-1);
  const retiring = p.retire(t);
  await tick();
  f.receive(frame(response(f.writes.at(-1), retired)));
  await retiring;
  f.receive(
    frame(
      videoResponse(videoRequest, {
        ...preparingVideo(id(9)),
        state: 'UNCERTAIN',
        code: 'OUTCOME_UNKNOWN',
      }),
    ),
  );
  await video;
  assert.throws(() => p.reserveAttempt('FOREGROUND'));
  const confirmation = p.retire(t);
  await tick();
  f.receive(frame(response(f.writes.at(-1), retired)));
  await confirmation;
});

function mediaFrame(h, bytes = new Uint8Array()) {
  const header = new TextEncoder().encode(JSON.stringify(h));
  const out = new Uint8Array(16 + header.length + bytes.length);
  out.set([0, 65, 86, 77, 69, 68, 48, 49]);
  const d = new DataView(out.buffer);
  d.setUint32(8, header.length);
  d.setUint32(12, bytes.length);
  out.set(header, 16);
  out.set(bytes, 16 + header.length);
  return out;
}
const mediaHeader = (creditId, extra = {}) => ({
  version: 1,
  sessionId: id(1),
  attemptId: id(2),
  videoId: id(9),
  creditId,
  geometryId: 1,
  configId: 0,
  packetId: 0,
  kind: 'SESSION',
  ptsUs: null,
  totalBytes: 0,
  offset: 0,
  width: 100,
  height: 200,
  ...extra,
});
const mediaStart = {
  videoId: id(9),
  transportId: '1',
  hostEpoch: 1,
  deadlineUtc: 31000,
  artifactId: 'a'.repeat(64),
  scid: 1,
  nonceHex: 'b'.repeat(64),
};
function v6Response(request, facts) {
  return {
    version: 6,
    requestId: request.requestId,
    sessionId: request.sessionId,
    attemptId: request.attemptId,
    kind: request.kind,
    result: facts,
  };
}
test('v6 initial credit follows actual START write, precedes response; sink and credit drains survive STOP', async () => {
  let receive,
    releaseStart,
    releaseSink,
    closed = 0;
  const writes = [];
  const startWrite = new Promise((r) => (releaseStart = r)),
    sinkWork = new Promise((r) => (releaseSink = r));
  const b = createHostBridge({
    sessionId: id(1),
    newAttemptId: () => id(2),
    assertRuntime() {},
    transport: {
      subscribe(c) {
        receive = c;
      },
      requestCleanup() {},
      write(bytes) {
        const r = JSON.parse(new TextDecoder().decode(bytes));
        writes.push(r);
        return r.kind === 'VIDEO_START' ? startWrite : Promise.resolve();
      },
    },
  });
  const p = b.provider,
    t = p.reserveAttempt('FOREGROUND');
  const foreground = p.startForeground(t, {});
  await tick();
  receive(frame(response(writes[0], live)));
  await foreground;
  const start = p.videoStart(t, mediaStart, {
    accept: () => sinkWork,
    close() {
      closed++;
    },
  });
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].version, 6);
  releaseStart();
  await tick();
  assert.equal(writes[2].kind, 'VIDEO_CREDIT');
  assert.equal(writes[2].creditId, 1);
  assert.equal('requestId' in writes[2], false);
  const raw = mediaFrame(mediaHeader(1));
  for (let i = 0; i < raw.length; i++) receive(raw.slice(i, i + 1));
  await tick();
  assert.equal(writes.length, 3);
  const stop = p.videoStop(t, id(9));
  assert.equal(closed, 1);
  await tick();
  receive(
    frame(
      v6Response(writes[3], {
        ...preparingVideo(id(9)),
        state: 'CLOSED',
        code: 'CLOSED',
        localRetired: true,
      }),
    ),
  );
  receive(frame(v6Response(writes[1], preparingVideo(id(9)))));
  await start;
  let done = false;
  void stop.then(() => (done = true));
  await tick();
  assert.equal(done, false);
  releaseSink();
  await stop;
  assert.equal(writes.length, 4);
});
test('v6 correlation/config/offset and duplicate-credit refusals close the actual channel', async () => {
  for (const bad of [
    mediaHeader(2),
    mediaHeader(1, { videoId: id(8) }),
    mediaHeader(1, { geometryId: 2 }),
    mediaHeader(1, { kind: 'DELTA', configId: 1, packetId: 1, totalBytes: 1, ptsUs: 0 }),
  ]) {
    const f = fixture(),
      p = f.bridge.provider,
      t = p.reserveAttempt('FOREGROUND');
    const fg = p.startForeground(t, {});
    await tick();
    f.receive(frame(response(f.writes[0], live)));
    await fg;
    const start = p.videoStart(t, mediaStart, { accept: async () => {}, close() {} });
    const rejected = assert.rejects(start);
    await tick();
    f.receive(mediaFrame(bad, bad.totalBytes ? new Uint8Array([1]) : undefined));
    await rejected;
    assert.equal(f.cleanups, 1);
  }
});

test('v6 repeated CONFIG and split chunks use one session-wide sequence; successor awaits actual credit write', async () => {
  let receive, releaseCredit;
  const writes = [],
    accepted = [];
  const creditHeld = new Promise((r) => (releaseCredit = r));
  const b = createHostBridge({
    sessionId: id(1),
    newAttemptId: () => id(2),
    assertRuntime() {},
    transport: {
      subscribe(c) {
        receive = c;
      },
      requestCleanup() {},
      write(bytes) {
        const r = JSON.parse(new TextDecoder().decode(bytes));
        writes.push(r);
        if (r.kind === 'VIDEO_CREDIT' && r.creditId === 1) {
          receive(mediaFrame(mediaHeader(1))); // Native output before callback settlement.
          return creditHeld;
        }
        return Promise.resolve();
      },
    },
  });
  const p = b.provider,
    t = p.reserveAttempt('FOREGROUND');
  const fg = p.startForeground(t, {});
  await tick();
  receive(frame(response(writes[0], live)));
  await fg;
  const start = p.videoStart(t, mediaStart, {
    accept: async (h) => {
      accepted.push(h);
    },
    close() {},
  });
  await tick();
  await tick();
  assert.equal(accepted.length, 1);
  assert.equal(writes.length, 3);
  releaseCredit();
  await tick();
  await tick();
  assert.equal(writes.at(-1).creditId, 2);
  receive(
    mediaFrame(
      mediaHeader(2, { kind: 'CONFIG', configId: 1, packetId: 1, totalBytes: 2 }),
      new Uint8Array([1, 2]),
    ),
  );
  await tick();
  await tick();
  assert.equal(writes.at(-1).creditId, 3);
  receive(
    mediaFrame(
      mediaHeader(3, { kind: 'CONFIG', configId: 2, packetId: 2, totalBytes: 2 }),
      new Uint8Array([1, 2]),
    ),
  );
  await tick();
  await tick();
  receive(
    mediaFrame(
      mediaHeader(4, { kind: 'KEY', configId: 2, packetId: 3, totalBytes: 32769, ptsUs: 1 }),
      new Uint8Array(32768),
    ),
  );
  await tick();
  await tick();
  receive(
    mediaFrame(
      mediaHeader(5, {
        kind: 'KEY',
        configId: 2,
        packetId: 3,
        totalBytes: 32769,
        offset: 32768,
        ptsUs: 1,
      }),
      new Uint8Array(1),
    ),
  );
  await tick();
  await tick();
  assert.equal(accepted.length, 5);
  assert.equal(writes.at(-1).creditId, 6);
  receive(frame(v6Response(writes[1], preparingVideo(id(9)))));
  await start;
  const stop = p.videoStop(t, id(9));
  await tick();
  // A record already in the native pipe is parsed/discarded after Stop, never sent to the sink.
  receive(mediaFrame(mediaHeader(6, { geometryId: 2 })));
  receive(
    frame(
      v6Response(writes.at(-1), {
        ...preparingVideo(id(9)),
        state: 'CLOSED',
        code: 'CLOSED',
        localRetired: true,
      }),
    ),
  );
  await stop;
  assert.equal(accepted.length, 5);
});

test('v6 synchronous sink close cannot reenter the reserved STOP or RETIRE lane', async () => {
  for (const kind of ['VIDEO_STOP', 'RETIRE']) {
    const f = fixture(),
      p = f.bridge.provider,
      t = p.reserveAttempt('FOREGROUND');
    const fg = p.startForeground(t, {});
    await tick();
    f.receive(frame(response(f.writes[0], live)));
    await fg;
    let reentry,
      closes = 0;
    const start = p.videoStart(t, mediaStart, {
      accept: async () => {},
      close() {
        closes++;
        reentry = assert.rejects(p.retire(t));
      },
    });
    await tick();
    f.receive(frame(v6Response(f.writes[1], preparingVideo(id(9)))));
    await start;
    const stop = kind === 'VIDEO_STOP' ? p.videoStop(t, id(9)) : p.retire(t);
    await tick();
    await reentry;
    assert.equal(closes, 1);
    const request = f.writes.at(-1);
    assert.equal(f.writes.length, 4);
    f.receive(
      frame(
        kind === 'VIDEO_STOP'
          ? v6Response(request, {
              ...preparingVideo(id(9)),
              state: 'CLOSED',
              code: 'CLOSED',
              localRetired: true,
            })
          : response(request, retired),
      ),
    );
    await stop;
  }
});
