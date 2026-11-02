import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoStreamClient } from '../src/video-stream-client.ts';
import { createInvocationBudget } from '../src/invocation-budget.ts';
import { videoStreamResponse } from '../src/video-stream-contract.ts';
const requestId = '00000000-0000-4000-8000-000000000001',
  deviceId = '00000000-0000-4000-8000-000000000002',
  videoId = '00000000-0000-4000-8000-000000000003';
const wire = JSON.stringify({
  version: 1,
  requestId,
  kind: 'START',
  deviceId,
  expectedRegistryRevision: 0,
});
const meta = () => ({
  version: 1,
  videoId,
  requestId,
  deviceId,
  generation: 1,
  deadlineUtc: Date.now() + 20000,
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
test('preload client reserves before invoke and accepts one exact early port before PENDING reply', async () => {
  let settle,
    forwarded = 0,
    closed = 0;
  const c = createVideoStreamClient(() => new Promise((resolve) => (settle = resolve)));
  const call = c.invoke(wire);
  assert.equal(
    c.acceptPort(
      meta(),
      [
        {
          close() {
            closed++;
          },
        },
      ],
      () => forwarded++,
    ),
    true,
  );
  assert.equal(forwarded, 1);
  assert.equal(
    c.acceptPort(
      meta(),
      [
        {
          close() {
            closed++;
          },
        },
      ],
      () => assert.fail(),
    ),
    false,
  );
  assert.equal(closed, 1);
  await tick();
  settle(videoStreamResponse(requestId, 'PENDING', videoId));
  assert.equal(JSON.parse(await call).code, 'PENDING');
  c.dispose();
});
test('malformed request never coerces and wrong port metadata closes without forwarding', async () => {
  let invokes = 0,
    closed = 0;
  const c = createVideoStreamClient(async () => {
    invokes++;
    return videoStreamResponse(requestId, 'UNAVAILABLE');
  });
  assert.equal(
    JSON.parse(
      await c.invoke({
        toString() {
          throw Error('private');
        },
      }),
    ).code,
    'INVALID',
  );
  assert.equal(invokes, 0);
  const call = c.invoke(wire);
  assert.equal(
    c.acceptPort(
      { ...meta(), generation: -0 },
      [
        {
          close() {
            closed++;
          },
        },
      ],
      () => assert.fail(),
    ),
    false,
  );
  assert.equal(closed, 1);
  await call;
  c.dispose();
});
test('shared budget and actual invocation lifetime stay held after logical dispose', async () => {
  const budget = createInvocationBudget();
  let settle;
  const c = createVideoStreamClient(() => new Promise((resolve) => (settle = resolve)), budget);
  const call = c.invoke(wire);
  await tick();
  c.dispose();
  assert.equal(JSON.parse(await call).code, 'CLOSED');
  const holders = Array.from({ length: 6 }, () => budget.acquire());
  assert.ok(holders.every(Boolean));
  assert.equal(budget.acquire(), null);
  settle(videoStreamResponse(requestId, 'PENDING', videoId));
  await tick();
  const released = budget.acquire();
  assert.ok(released);
  released.release();
  holders.forEach((h) => {
    h.release();
  });
});
test('STOP uses exact known video and uncertainty cannot permit another START', async () => {
  let n = 0;
  const c = createVideoStreamClient(async (raw) => {
    n++;
    const r = JSON.parse(raw);
    return videoStreamResponse(r.requestId, r.kind === 'START' ? 'PENDING' : 'UNCERTAIN', videoId);
  });
  await c.invoke(wire);
  const stop = JSON.stringify({ version: 1, requestId: deviceId, kind: 'STOP', videoId });
  assert.equal(JSON.parse(await c.invoke(stop)).code, 'UNCERTAIN');
  assert.equal(JSON.parse(await c.invoke(wire)).code, 'BUSY');
  assert.equal(n, 2);
  c.dispose();
});
test('video STOP retains shared eighth cleanup reservation when all seven ordinary slots are held', async () => {
  const budget = createInvocationBudget();
  const c = createVideoStreamClient(async (raw) => {
    const r = JSON.parse(raw);
    return videoStreamResponse(r.requestId, r.kind === 'START' ? 'PENDING' : 'STOPPED', videoId);
  }, budget);
  await c.invoke(wire);
  await tick();
  const holders = Array.from({ length: 7 }, () => budget.acquire());
  assert.ok(holders.every(Boolean));
  assert.equal(
    JSON.parse(
      await c.invoke(JSON.stringify({ version: 1, requestId: deviceId, kind: 'STOP', videoId })),
    ).code,
    'STOPPED',
  );
  holders.forEach((h) => {
    h.release();
  });
  c.dispose();
});

test('last ordinary START cannot exhaust exact session STOP cleanup admission', async () => {
  let starts = 0,
    stops = 0;
  const c = createVideoStreamClient(async (raw) => {
    const r = JSON.parse(raw);
    if (r.kind === 'START') {
      starts++;
      return videoStreamResponse(
        r.requestId,
        starts === 65536 ? 'PENDING' : 'UNAVAILABLE',
        starts === 65536 ? videoId : null,
      );
    }
    stops++;
    return videoStreamResponse(r.requestId, 'STOPPED', videoId);
  });
  for (let i = 0; i < 65535; i++)
    assert.equal(JSON.parse(await c.invoke(wire)).code, 'UNAVAILABLE');
  assert.equal(JSON.parse(await c.invoke(wire)).code, 'PENDING');
  assert.equal(
    JSON.parse(
      await c.invoke(
        JSON.stringify({ version: 1, requestId: deviceId, kind: 'STOP', videoId: requestId }),
      ),
    ).code,
    'STALE',
  );
  assert.equal(
    JSON.parse(
      await c.invoke(JSON.stringify({ version: 1, requestId: deviceId, kind: 'STOP', videoId })),
    ).code,
    'STOPPED',
  );
  assert.equal(JSON.parse(await c.invoke(wire)).code, 'CLOSED');
  assert.equal(starts, 65536);
  assert.equal(stops, 1);
  c.dispose();
});
