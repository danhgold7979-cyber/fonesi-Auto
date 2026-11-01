import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createOwnedTransportMetadataOwner as production } from '../src/main/owned-transport-metadata.ts';
import { createDeviceQueueBudget } from '../src/main/device-actor.ts';
// Explicit test-transformed private lookup only. This models issuer facts, never native proof.
const records = new WeakMap();
globalThis.__syntheticMetadataRecords = records;
const sourceUrl = new URL('../src/main/owned-transport-metadata.ts', import.meta.url);
let source = stripTypeScriptTypes(readFileSync(sourceUrl, 'utf8'));
const matches = source.match(
  /import\s*\{\s*inspectOwnedMetadataTarget\s*,?\s*\}\s*from '\.\/adb-discovery-service\.ts';/g,
);
assert.equal(matches?.length, 1);
source = source.replace(
  matches[0],
  'const inspectOwnedMetadataTarget=(v)=>globalThis.__syntheticMetadataRecords.get(v)??null;',
);
source = source.replace(/from '(\.\/[^']+)'/g, (_m, p) => `from '${new URL(p, sourceUrl).href}'`);
const { createOwnedTransportMetadataOwner: create } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const texts = {
  MODEL: 'Synthetic Phone\n',
  MANUFACTURER: 'Fixture\n',
  OS: '14\n',
  SDK: '34\n',
  LOCALE: 'vi-VN\n',
  RESOLUTION: 'Physical size: 1080x2400\n',
  DENSITY: 'Physical density: 420\n',
  BATTERY: 'Current Battery Service state:\n  present: true\n  level: 25\n  scale: 50\n',
  STORAGE:
    'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fixture 1000 200 700 20% /data\n',
};
const facts = (field, extra = {}) =>
  Object.freeze({
    version: 1,
    kind: 'METADATA_QUERY',
    status: 'COMPLETE',
    code: 'OK',
    dispatched: true,
    operationRetired: true,
    stdoutBase64: Buffer.from(texts[field]).toString('base64'),
    stderrBase64: '',
    remoteExitCode: 0,
    observedAtUtc: Date.now(),
    ...extra,
  });
function fixture(begin) {
  const ticket = Object.freeze({ ownedMetadataTarget: true });
  let valid = true;
  const target = Object.freeze({
    deviceId: id(1),
    bindingId: id(2),
    generation: 0,
    serial: 'synthetic-private',
    transportId: '7',
    hostEpoch: 1,
    registryRevision: 3,
    observationSequence: 1,
  });
  records.set(
    ticket,
    Object.freeze({
      target,
      current() {
        if (!valid) throw Error();
      },
      finalCurrent: () => valid,
      localBusy: () => false,
      begin:
        begin ??
        ((field) =>
          Object.freeze({
            handoff: 'QUERY',
            result: Promise.resolve(facts(field)),
            retirement: Promise.resolve({ status: 'RETIRED' }),
          })),
    }),
  );
  return {
    ticket,
    owner: create({ target: ticket, budget: createDeviceQueueBudget() }),
    revoke() {
      valid = false;
    },
  };
}
test('production rejects unbranded tickets and callback-bearing constructor options', () => {
  assert.throws(
    () =>
      production({
        target: Object.freeze({ ownedMetadataTarget: true }),
        budget: createDeviceQueueBudget(),
      }),
    /OWNED_METADATA_OPTIONS/,
  );
  assert.throws(
    () => create({ target: {}, budget: createDeviceQueueBudget(), now: () => 0 }),
    /OWNED_METADATA_OPTIONS/,
  );
});
test('transformed issuer composition reads nine immutable target-tagged fields without identity promotion', async () => {
  const f = fixture();
  try {
    for (const field of Object.keys(texts)) {
      const r = await f.owner.read(field, Date.now() + 1000);
      assert.equal(r.actor.outcome, 'OBSERVED', field);
      assert.equal(r.observation.metadata.available, true, field);
      assert.equal(r.observation.target.transportId, '7');
      assert.ok(Object.isFrozen(r.observation));
    }
    assert.deepEqual(Object.keys(f.owner.snapshot().observations), Object.keys(texts));
    assert.throws(
      () => create({ target: f.ticket, budget: createDeviceQueueBudget() }),
      /OWNED_METADATA_OPTIONS/,
    );
  } finally {
    assert.equal(await f.owner.close(), true);
  }
});
test('known dispatched failure stales earlier field, local refusal preserves it and target loss stales all', async () => {
  let mode = 'ok';
  const f = fixture((field) => ({
    handoff: mode === 'local' ? 'LOCAL_REFUSAL' : 'QUERY',
    result: Promise.resolve(
      mode === 'local'
        ? {
            version: 1,
            kind: 'METADATA_QUERY',
            status: 'FAILED',
            code: 'BUSY',
            dispatched: false,
            operationRetired: true,
            stdoutBase64: null,
            stderrBase64: null,
            remoteExitCode: null,
            observedAtUtc: null,
          }
        : facts(field, mode === 'bad' ? { remoteExitCode: 1 } : {}),
    ),
    retirement: Promise.resolve({ status: 'RETIRED' }),
  }));
  try {
    await f.owner.read('MODEL', Date.now() + 1000);
    mode = 'local';
    assert.equal((await f.owner.read('MODEL', Date.now() + 1000)).actor.outcome, 'NOT_DISPATCHED');
    assert.equal(f.owner.snapshot().observations.MODEL.metadata.stale, false);
    mode = 'bad';
    await f.owner.read('MODEL', Date.now() + 1000);
    assert.equal(f.owner.snapshot().observations.MODEL.metadata.stale, true);
    mode = 'ok';
    await f.owner.read('SDK', Date.now() + 1000);
    f.revoke();
    assert.equal(f.owner.snapshot().state, 'INVALIDATED');
    assert.equal(f.owner.snapshot().observations.SDK.metadata.stale, true);
  } finally {
    await f.owner.close();
  }
});
test('opaque ticket is claimed before reentrant authority callbacks and failed construction remains consumed', async () => {
  const ticket = Object.freeze({ ownedMetadataTarget: true });
  let reentrant = 0;
  records.set(
    ticket,
    Object.freeze({
      target: Object.freeze({
        deviceId: id(21),
        bindingId: id(22),
        generation: 0,
        serial: 'synthetic-reentrant',
        transportId: '9',
        hostEpoch: 1,
        registryRevision: 3,
        observationSequence: 1,
      }),
      current() {
        assert.throws(
          () => create({ target: ticket, budget: createDeviceQueueBudget() }),
          /OWNED_METADATA_OPTIONS/,
        );
        reentrant++;
      },
      finalCurrent: () => true,
      localBusy: () => false,
      begin() {
        throw Error();
      },
    }),
  );
  const owner = create({ target: ticket, budget: createDeviceQueueBudget() });
  assert.ok(reentrant > 0);
  await owner.close();
  assert.throws(
    () => create({ target: ticket, budget: createDeviceQueueBudget() }),
    /OWNED_METADATA_OPTIONS/,
  );
});
test('close keeps real pending query until both promises settle, without late publication', async () => {
  let resultResolve, retireResolve;
  const f = fixture(() => ({
    handoff: 'QUERY',
    result: new Promise((r) => {
      resultResolve = r;
    }),
    retirement: new Promise((r) => {
      retireResolve = r;
    }),
  }));
  const read = f.owner.read('MODEL', Date.now() + 1000);
  let closed = false;
  const closing = f.owner.close().then((v) => {
    closed = true;
    return v;
  });
  await new Promise((r) => setImmediate(r));
  assert.equal(closed, false);
  resultResolve(facts('MODEL'));
  await new Promise((r) => setImmediate(r));
  assert.equal(closed, false);
  retireResolve({ status: 'RETIRED' });
  assert.notEqual((await read).actor.outcome, 'OBSERVED');
  assert.equal(await closing, true);
  assert.equal(f.owner.retired, true);
});
test('sealed localBusy preserves captured field and reaches later query without inspecting transient custody', async () => {
  const ticket = Object.freeze({ ownedMetadataTarget: true });
  let busy = false,
    calls = 0,
    currentCalls = 0;
  records.set(
    ticket,
    Object.freeze({
      target: Object.freeze({
        deviceId: id(31),
        bindingId: id(32),
        generation: 0,
        serial: 'synthetic-busy',
        transportId: '9',
        hostEpoch: 1,
        registryRevision: 3,
        observationSequence: 1,
      }),
      current() {
        currentCalls++;
        if (busy) throw Error('inspection');
      },
      finalCurrent: () => !busy,
      localBusy: () => busy,
      begin(field) {
        calls++;
        return {
          handoff: 'QUERY',
          result: Promise.resolve(facts(field)),
          retirement: Promise.resolve({ status: 'RETIRED' }),
        };
      },
    }),
  );
  const owner = create({ target: ticket, budget: createDeviceQueueBudget() });
  try {
    await owner.read('MODEL', Date.now() + 1000);
    const before = currentCalls;
    busy = true;
    assert.equal((await owner.read('MODEL', Date.now() + 1000)).actor.code, 'BUSY');
    assert.equal(currentCalls, before);
    assert.equal(calls, 1);
    assert.equal(owner.snapshot().state, 'ACTIVE');
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
    busy = false;
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
    assert.equal((await owner.read('MODEL', Date.now() + 1000)).actor.outcome, 'OBSERVED');
  } finally {
    await owner.close();
  }
});

test('actor-level local BUSY after owner initial check preserves captured projection', async () => {
  const ticket = Object.freeze({ ownedMetadataTarget: true });
  let busy = false,
    arm = false;
  records.set(
    ticket,
    Object.freeze({
      target: Object.freeze({
        deviceId: id(41),
        bindingId: id(42),
        generation: 0,
        serial: 'synthetic-race',
        transportId: '9',
        hostEpoch: 1,
        registryRevision: 3,
        observationSequence: 1,
      }),
      current() {
        if (busy) throw Error('inspection');
      },
      finalCurrent() {
        if (arm) {
          arm = false;
          busy = true;
          return true;
        }
        return !busy;
      },
      localBusy: () => busy,
      begin(field) {
        return {
          handoff: 'QUERY',
          result: Promise.resolve(facts(field)),
          retirement: Promise.resolve({ status: 'RETIRED' }),
        };
      },
    }),
  );
  const owner = create({ target: ticket, budget: createDeviceQueueBudget() });
  try {
    await owner.read('MODEL', Date.now() + 1000);
    arm = true;
    assert.equal((await owner.read('MODEL', Date.now() + 1000)).actor.code, 'BUSY');
    assert.equal(owner.snapshot().state, 'ACTIVE');
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
    busy = false;
    assert.equal((await owner.read('MODEL', Date.now() + 1000)).actor.outcome, 'OBSERVED');
  } finally {
    await owner.close();
  }
});
