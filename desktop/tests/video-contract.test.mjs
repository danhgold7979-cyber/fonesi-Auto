import test from 'node:test';
import assert from 'node:assert/strict';
import { preparingVideo, snapshotVideo, snapshotVideoStart } from '../src/main/video-contract.ts';
const id = '00000000-0000-4000-8000-000000000001';
const receiving = {
  ...preparingVideo(id),
  snapshotRevision: 3,
  state: 'RECEIVING',
  streamObserved: true,
  sessionPackets: 1,
  mediaPackets: 1,
  encodedBytes: 9,
  lastWidth: 1080,
  lastHeight: 1920,
  directory: 'CREATED',
  upload: 'VERIFIED',
  launch: 'STARTED',
  cleanup: 'PENDING',
};
test('exact bounded video facts distinguish packets from local/remote retirement', () => {
  assert.ok(snapshotVideo(receiving));
  assert.equal(snapshotVideo({ ...receiving, localRetired: true }), null);
  assert.equal(snapshotVideo({ ...receiving, mediaPackets: 0 }), null);
  assert.equal(snapshotVideo({ ...receiving, lastWidth: 16385 }), null);
  assert.equal(snapshotVideo({ ...receiving, snapshotRevision: -0 }), null);
  assert.equal(snapshotVideo({ ...receiving, raw: 'private' }), null);
  assert.equal(
    snapshotVideo({ ...receiving, state: 'CLOSED', code: 'CLOSED', localRetired: true }),
    null,
  );
  assert.ok(
    snapshotVideo({
      ...receiving,
      state: 'CLOSED',
      code: 'CLOSED',
      localRetired: true,
      launch: 'EXITED',
      cleanup: 'CLEANED',
    }),
  );
  let calls = 0;
  const forged = { ...receiving };
  Object.defineProperty(forged, 'code', {
    enumerable: true,
    get() {
      calls++;
      return 'OK';
    },
  });
  assert.equal(snapshotVideo(forged), null);
  assert.equal(calls, 0);
});
test('video start is exact no caller command or path and safe epoch/deadline/scid', () => {
  const request = {
    videoId: id,
    transportId: '1',
    hostEpoch: 1,
    deadlineUtc: 30000,
    artifactId: 'a'.repeat(64),
    scid: 2147483647,
    nonceHex: 'b'.repeat(64),
  };
  assert.ok(snapshotVideoStart(request));
  for (const change of [
    { path: '/private' },
    { transportId: '1\n' },
    { hostEpoch: 0 },
    { scid: 2147483648 },
    { nonceHex: 'b'.repeat(64) + '\n' },
    { deadlineUtc: Number.MAX_SAFE_INTEGER },
  ])
    assert.equal(snapshotVideoStart({ ...request, ...change }), null);
});

test('video stage grammar refuses impossible directory and launch combinations', () => {
  for (const change of [
    { upload: 'PARTIAL' },
    { upload: 'VERIFIED' },
    { launch: 'UNKNOWN' },
    { cleanup: 'PENDING' },
    { directory: 'CREATED', upload: 'NONE', launch: 'STARTED' },
    { directory: 'CREATED', upload: 'PARTIAL', launch: 'EXITED' },
  ])
    assert.equal(snapshotVideo({ ...preparingVideo(id), ...change }), null);
});
