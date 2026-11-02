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
  .replace('const clock = Date.now.bind(Date);', 'const clock = ()=>1000;')
  .replace(/from '(\.\.?\/[^']+)'/g, (_m, p) => `from '${new URL(p, url).href}'`);
const { createOwnedVideoConsumer: create, createOwnedVideoMediaConsumer: createMedia } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
