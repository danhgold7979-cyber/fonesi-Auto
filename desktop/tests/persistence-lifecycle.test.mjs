import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistenceLifecycle } from '../src/main/persistence-lifecycle.ts';
test('shutdown waits for in-flight opening then drains the exact store once', async () => {
  let ready,
    closed = 0;
  const gate = new Promise((resolve) => {
    ready = resolve;
  });
  const life = createPersistenceLifecycle();
  const opening = life.open(() => gate);
  const first = life.stop();
  assert.equal(first, life.stop());
  assert.equal(closed, 0);
  await assert.rejects(
    life.open(async () => ({ shutdown: async () => {} })),
    /PERSISTENCE_START_REJECTED/,
  );
  ready({
    shutdown: async () => {
      closed++;
    },
  });
  await opening;
  await first;
  assert.equal(closed, 1);
});
test('deadline does not cancel pending initialization or claim early disposal', async () => {
  let ready,
    closed = 0;
  const life = createPersistenceLifecycle(5),
    opening = life.open(
      () =>
        new Promise((resolve) => {
          ready = resolve;
        }),
    );
  await assert.rejects(life.stop(), /PERSISTENCE_SHUTDOWN_TIMEOUT/);
  assert.equal(closed, 0);
  ready({
    shutdown: async () => {
      closed++;
    },
  });
  await opening;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, 1);
  assert.equal(life.stopping, true);
});
test('opening failure remains failure; stopped lifecycle cannot start later', async () => {
  const life = createPersistenceLifecycle();
  await assert.rejects(
    life.open(async () => {
      throw new Error('INITIALIZATION_FAILED');
    }),
  );
  await assert.rejects(life.stop(), /INITIALIZATION_FAILED/);
  const stopped = createPersistenceLifecycle();
  await stopped.stop();
  await assert.rejects(stopped.open(async () => ({ shutdown: async () => {} })));
});
