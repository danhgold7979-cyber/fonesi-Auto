import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { preparingVideo } from '../src/main/video-contract.ts';
// Only the sealed issuer lookup and clock are transformed: synthetic facts, no native execution.
const records = new WeakMap();
globalThis.__videoTestRecords = records;
const url = new URL('../src/main/owned-video-consumer.ts', import.meta.url);
let source = stripTypeScriptTypes(readFileSync(url, 'utf8'));
assert.equal(
  (
    source.match(/import \{ inspectOwnedVideoTarget \} from '\.\/adb-discovery-service\.ts';/g) ||
    []
  ).length,
  1,
);
source = source
  .replace(
    "import { inspectOwnedVideoTarget } from './adb-discovery-service.ts';",
    'const inspectOwnedVideoTarget=v=>globalThis.__videoTestRecords.get(v)??null;',
  )
  .replace(
    "import { inspectOwnedVideoRecoveryTarget } from './adb-discovery-service.ts';",
    'const inspectOwnedVideoRecoveryTarget=v=>globalThis.__videoTestRecords.get(v)??null;',
  )
  .replace('const clock = Date.now.bind(Date);', 'const clock = ()=>1000;')
  .replace(/from '(\.\.?\/[^']+)'/g, (_m, p) => `from '${new URL(p, url).href}'`);
const {
  createOwnedVideoConsumer: create,
  createOwnedVideoMediaConsumer: createMedia,
  createOwnedVideoRecoveryMediaConsumer: createRecovery,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function fixture() {
  const target = Object.freeze({});
  const start = deferred(),
    stop = deferred();
  let request,
    begin = 0,
    stops = 0,
    current = true,
    status;
  records.set(target, {
    current() {
      if (!current) throw Error('private');
    },
    finalCurrent: () => current,
    begin(r) {
      begin++;
      request = r;
      return {
        started: start.promise,
        status: async () => status,
        stop() {
          stops++;
          return stop.promise;
        },
      };
    },
  });
  const facts = (revision = 1) => ({
    ...preparingVideo(request.videoId),
    snapshotRevision: revision,
    state: 'RECEIVING',
    streamObserved: true,
    sessionPackets: 1,
    mediaPackets: 1,
    encodedBytes: 8,
    lastWidth: 100,
    lastHeight: 200,
    directory: 'CREATED',
    upload: 'VERIFIED',
    launch: 'STARTED',
    cleanup: 'PENDING',
  });
  return {
    target,
    start,
    stop,
    facts,
    get request() {
      return request;
    },
    get begin() {
      return begin;
    },
    get stops() {
      return stops;
    },
    setStatus(v) {
      status = v;
    },
    revoke() {
      current = false;
    },
  };
}
test('one sealed claim, original deadline, headless facts and idempotent Stop', async () => {
  const f = fixture(),
    c = create(f.target);
  assert.throws(() => create(f.target), /VIDEO_REJECTED/);
  await tick();
  assert.equal(f.request.deadlineUtc, 31000);
  assert.equal(f.begin, 1);
  f.start.resolve(f.facts());
  const first = await c.started;
  assert.equal(first.state, 'RECEIVING');
  const a = c.stop(),
    b = c.stop();
  assert.equal(a, b);
  assert.equal(c.snapshot().state, 'STOPPING');
  await tick();
  assert.equal(f.stops, 1);
  f.stop.resolve({
    ...f.facts(2),
    state: 'CLOSED',
    code: 'CLOSED',
    launch: 'EXITED',
    localRetired: true,
    cleanup: 'CLEANED',
  });
  assert.equal((await a).state, 'CLOSED');
  assert.equal(first.state, 'RECEIVING');
});
test('late START cannot revive Stop; old revisions ignored, same-revision mutation is sticky unknown', async () => {
  const f = fixture(),
    c = create(f.target);
  await tick();
  const stopping = c.stop();
  await tick();
  f.stop.resolve({
    ...preparingVideo(f.request.videoId),
    snapshotRevision: 4,
    state: 'CLOSED',
    code: 'CLOSED',
    localRetired: true,
  });
  await stopping;
  f.start.resolve(f.facts(2));
  await c.started;
  assert.equal(c.snapshot().state, 'CLOSED');
  const g = fixture(),
    d = create(g.target);
  await tick();
  g.start.resolve(g.facts());
  await d.started;
  g.setStatus({ ...g.facts(), encodedBytes: 99 });
  assert.equal((await d.status()).state, 'UNCERTAIN');
  await tick();
  g.stop.resolve({
    ...g.facts(2),
    state: 'CLOSED',
    code: 'CLOSED',
    launch: 'EXITED',
    localRetired: true,
    cleanup: 'CLEANED',
  });
  await d.stop();
  assert.equal(d.snapshot().state, 'UNCERTAIN');
});
test('Stop before callbacks has no handoff; forged issuer rejected', async () => {
  assert.throws(() => create({}), /VIDEO_REJECTED/);
  const f = fixture(),
    c = create(f.target);
  await c.stop();
  assert.equal(f.begin, 0);
  assert.equal((await c.started).state, 'STOPPING');
  assert.equal(c.snapshot().state, 'CLOSED');
});
test('captured history cannot erase known cleanup or remote launch facts', async () => {
  const f = fixture(),
    c = create(f.target);
  await tick();
  f.start.resolve(f.facts());
  await c.started;
  f.setStatus({
    ...f.facts(2),
    directory: 'NONE',
    upload: 'NONE',
    launch: 'NONE',
    state: 'FAILED',
    code: 'DEPLOYMENT_FAILED',
    streamObserved: false,
    sessionPackets: 0,
    mediaPackets: 0,
    encodedBytes: 0,
    lastWidth: null,
    lastHeight: null,
    cleanup: 'NOT_REQUIRED',
  });
  assert.equal((await c.status()).state, 'UNCERTAIN');
  await tick();
  assert.equal(f.stops, 1);
  f.stop.resolve({
    ...f.facts(3),
    state: 'CLOSED',
    code: 'CLOSED',
    launch: 'EXITED',
    localRetired: true,
    cleanup: 'CLEANED',
  });
  await c.stop();
  assert.equal(c.snapshot().state, 'UNCERTAIN');
  assert.equal(c.retired, true);
});
test('genuine target revocation before first authority callback has no remote handoff', async () => {
  const f = fixture(),
    c = create(f.target);
  f.revoke();
  const receipt = await c.started;
  assert.equal(receipt.state, 'FAILED');
  assert.equal(receipt.code, 'ADMISSION_REJECTED');
  assert.equal(f.begin, 0);
  await c.stop();
  assert.equal(c.retired, true);
});

test('media consumer preserves captured original context and synchronous sink revocation', async () => {
  const f = fixture();
  let closed = 0,
    captured;
  const record = records.get(f.target),
    begin = record.begin;
  record.begin = (r, media) => {
    captured = media;
    return begin(r);
  };
  const c = createMedia(
    f.target,
    { admittedUtc: 500, deadlineUtc: 30500, videoId: '00000000-0000-0000-0000-000000000099' },
    {
      accept: async () => {},
      close() {
        closed++;
      },
    },
  );
  await tick();
  assert.equal(f.request.deadlineUtc, 30500);
  assert.equal(f.request.videoId, '00000000-0000-0000-0000-000000000099');
  assert.ok(captured);
  f.start.resolve(f.facts());
  await c.started;
  const stopped = c.stop();
  try {
    assert.equal(closed, 1);
    assert.equal(f.stops, 1);
    assert.equal(c.retired, false);
  } finally {
    f.stop.resolve({
      ...f.facts(2),
      state: 'CLOSED',
      code: 'CLOSED',
      launch: 'EXITED',
      localRetired: true,
      cleanup: 'CLEANED',
    });
    await stopped;
  }
  assert.equal(c.retired, true);
  assert.equal(closed, 1);
});
test('media context does not extend admission, mint target authority, or invoke getters', () => {
  const sink = { accept: async () => {}, close() {} };
  let gets = 0;
  assert.throws(() =>
    createMedia(
      fixture().target,
      {
        get admittedUtc() {
          gets++;
          return 1000;
        },
        deadlineUtc: 31000,
        videoId: '00000000-0000-0000-0000-000000000099',
      },
      sink,
    ),
  );
  assert.equal(gets, 0);
  for (const c of [
    { admittedUtc: 1000, deadlineUtc: 31001, videoId: '00000000-0000-0000-0000-000000000099' },
    { admittedUtc: -0, deadlineUtc: 30000, videoId: '00000000-0000-0000-0000-000000000099' },
  ])
    assert.throws(() => createMedia(fixture().target, c, sink));
  assert.throws(() =>
    createMedia(
      {},
      { admittedUtc: 1000, deadlineUtc: 31000, videoId: '00000000-0000-0000-0000-000000000099' },
      sink,
    ),
  );
});

function recoveryFixture(options = {}) {
  const target = Object.freeze({}),
    start = deferred(),
    stop = deferred();
  let request,
    media,
    retired = false,
    starts = 0,
    stops = 0,
    current = true;
  records.set(target, {
    current() {
      if (!current) throw Error('STALE');
    },
    finalCurrent: () => current,
    begin(r, m) {
      request = r;
      media = m;
      starts++;
      return {
        started: start.promise,
        stop() {
          stops++;
          return stop.promise;
        },
        status: options.status ?? (async () => result(false)),
        get retired() {
          return retired;
        },
      };
    },
  });
  function result(clean) {
    return {
      handoff: 'OWNED',
      videoId: request.videoId,
      videoOrdinal: 1,
      refusal: null,
      fresh: true,
      snapshot: {
        ...preparingVideo(request.videoId),
        snapshotRevision: clean ? 2 : 1,
        state: clean ? 'CLOSED' : 'PREPARING',
        code: clean ? 'CLOSED' : 'OK',
        localRetired: clean,
      },
    };
  }
  return {
    target,
    start,
    stop,
    result,
    get media() {
      return media;
    },
    get starts() {
      return starts;
    },
    get stops() {
      return stops;
    },
    retire(value = result(true)) {
      retired = true;
      stop.resolve(value);
    },
    stale() {
      current = false;
    },
  };
}
const recoveryContext = (n) => ({
  admittedUtc: 1000,
  deadlineUtc: 31000,
  videoId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
});
test('recovery consumer retains exact lower retirement and rejects stale media after Stop', async () => {
  const f = recoveryFixture();
  let paints = 0,
    closes = 0;
  const c = createRecovery(f.target, recoveryContext(9001), {
    accept: async () => {
      paints++;
    },
    close() {
      closes++;
    },
  });
  await tick();
  f.start.resolve(f.result(false));
  await c.started;
  await f.media.accept({}, new Uint8Array());
  assert.equal(paints, 1);
  const stopping = c.stop();
  assert.equal(c.stop(), stopping);
  assert.equal(c.retired, false);
  await assert.rejects(f.media.accept({}, new Uint8Array()));
  assert.equal(f.stops, 1);
  f.retire();
  await stopping;
  assert.equal(c.retired, true);
  assert.equal(closes, 1);
  assert.throws(() =>
    createRecovery(f.target, recoveryContext(9002), { accept: async () => {}, close() {} }),
  );
});
test('recovery consumer cancellation before handoff is locally retired without forged wire facts', async () => {
  const f = recoveryFixture();
  const c = createRecovery(f.target, recoveryContext(9003), { accept: async () => {}, close() {} });
  assert.equal(await c.stop(), null);
  assert.equal(await c.started, null);
  assert.equal(c.retired, true);
  assert.equal(f.starts, 0);
});
test('recovery consumer clean-looking snapshot cannot replace actual lower retirement', async () => {
  const f = recoveryFixture();
  const c = createRecovery(f.target, recoveryContext(9004), { accept: async () => {}, close() {} });
  await tick();
  f.start.resolve(f.result(false));
  await c.started;
  const stopping = c.stop();
  f.stop.resolve(f.result(true));
  await assert.rejects(stopping);
  assert.equal(c.retired, false);
});

test('recovery synchronous status throw retains cleanup and never certifies uncertainty as retirement', async () => {
  const f = recoveryFixture({
    status() {
      throw Error('synthetic');
    },
  });
  const c = createRecovery(f.target, recoveryContext(9005), { accept: async () => {}, close() {} });
  await tick();
  f.start.resolve(f.result(false));
  await c.started;
  await assert.rejects(c.status());
  const stopped = c.stop();
  f.retire();
  await assert.rejects(stopped);
  assert.equal(f.stops, 1);
  assert.equal(c.retired, false);
});
test('recovery old START after Stop cannot replace a newer retirement snapshot', async () => {
  const f = recoveryFixture();
  const c = createRecovery(f.target, recoveryContext(9006), { accept: async () => {}, close() {} });
  await tick();
  const stopped = c.stop();
  f.retire();
  await tick();
  assert.equal(c.retired, false);
  f.start.resolve(f.result(false));
  await stopped;
  assert.equal(c.snapshot().snapshot.state, 'CLOSED');
  assert.equal(c.retired, true);
});

test('recovery refused candidate cannot turn into OWNED on Stop', async () => {
  const f = recoveryFixture();
  const c = createRecovery(f.target, recoveryContext(9007), { accept: async () => {}, close() {} });
  await tick();
  const refusal = {
    handoff: 'NOT_STARTED',
    videoId: recoveryContext(9007).videoId,
    videoOrdinal: 1,
    refusal: 'BUSY',
    snapshot: null,
    fresh: false,
  };
  f.start.resolve(refusal);
  await c.started;
  // Even a no-handoff response retains the actual lower record until its Stop settles.
  assert.equal(c.retired, false);
  f.retire();
  // This synthetic lower changes handoff on Stop, which must fail closed.
  await assert.rejects(c.stop());
  assert.equal(c.retired, false);
});

test('recovery native BUSY refusal settles cleanly without invented native snapshot', async () => {
  const f = recoveryFixture();
  const c = createRecovery(f.target, recoveryContext(9008), { accept: async () => {}, close() {} });
  await tick();
  const refusal = {
    handoff: 'NOT_STARTED',
    videoId: recoveryContext(9008).videoId,
    videoOrdinal: 1,
    refusal: 'BUSY',
    snapshot: null,
    fresh: false,
  };
  f.start.resolve(refusal);
  await c.started;
  assert.equal(c.retired, false);
  f.retire(refusal);
  assert.deepEqual(await c.stop(), refusal);
  assert.equal(c.retired, true);
});
