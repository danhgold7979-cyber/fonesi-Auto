import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { createDurableCoordinator } from '../src/main/durable-coordinator.ts';
import { createRegistryStore } from '../src/main/registry-store.ts';
import { isCurrentBinding } from '../src/main/transport-registry.ts';
import { createDeviceQueueBudget } from '../src/main/device-actor.ts';
import { createSyntheticTransportMetadataOwner } from '../src/main/transport-metadata.ts';

// Owned SQLite/registry and real actor/parser; all dispatch evidence is synthetic,
// with no spawned process, socket, device, native issuer or metadata persistence.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (extra = {}) => ({
  serial: 'synthetic-private-device',
  transportId: '1',
  state: 'DEVICE',
  ...extra,
});
const texts = Object.freeze({
  MODEL: 'Synthetic Phone\n',
  MANUFACTURER: 'Fixture\n',
  OS: '14\n',
  SDK: '34\n',
  LOCALE: 'vi-VN\n',
  RESOLUTION: 'Physical size: 1080x2400\nOverride size: 720x1600\n',
  DENSITY: 'Physical density: 420\n',
  BATTERY: 'Current Battery Service state:\n  present: true\n  level: 25\n  scale: 50\n',
  STORAGE:
    'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fixture 1000 200 700 20% /data\n',
});
const success = (stdout = 'Synthetic Phone\n', extra = {}) => ({
  status: 'SUCCESS',
  exitCode: 0,
  retired: true,
  truncated: false,
  stdout,
  ...extra,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const turn = () => new Promise((r) => setImmediate(r));
const input = (n, field = 'MODEL', extra = {}) => ({
  version: 1,
  commandId: id(10000 + n),
  correlationId: id(20000 + n),
  field,
  deadlineUtc: 11000,
  ...extra,
});
async function fixture(source = 'SYNTHETIC_TEST', rows = [row()]) {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = realpathSync(mkdtempSync(join(base, 'transport-metadata-'))),
    storeId = randomUUID();
  const db = new FoundationDatabase(join(root, 'active.sqlite'), storeId),
    owners = [];
  let n = 100,
    sequence = 0;
  const nextId = () => id(n++);
  let coordinator, store;
  try {
    await db.migrate(async (version) => {
      const path = join(root, `snapshot-${version}.sqlite`);
      await db.snapshot(path);
      const snapshot = new FoundationDatabase(path, storeId, true);
      try {
        return {
          backupId: randomUUID(),
          schemaVersion: version,
          fingerprint: snapshot.fingerprint(),
        };
      } finally {
        snapshot.close();
      }
    }, 1000);
    coordinator = createDurableCoordinator({
      db,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: nextId,
      audit: async () => 'AVAILABLE',
    });
    store = createRegistryStore({
      coordinator,
      nextId,
      quarantined: () => false,
      assertOwnedSync: () => {},
    });
    assert.equal((await store.startup()).ok, true);
    const f = {
      db,
      store,
      owners,
      async observe(nextRows = rows, proofs = []) {
        const result = await store.reconcile(db.readDurable().meta.revision, {
          sequence: ++sequence,
          observedAtUtc: 1000,
          source,
          rows: nextRows,
          proofs,
        });
        assert.equal(result.ok, true);
        return store.snapshot();
      },
      options(overrides = {}) {
        return {
          registry: store.snapshot(),
          hostEpoch: db.readDurable().meta.host_epoch,
          deviceId: store.snapshot().devices[0].deviceId,
          ownerId: id(9000),
          budget: createDeviceQueueBudget(),
          now: () => 1000,
          assertOwned: () => true,
          dispatchSynthetic: async (r) => success(texts[r.operation]),
          ...overrides,
        };
      },
      owner(overrides = {}) {
        const value = createSyntheticTransportMetadataOwner(this.options(overrides));
        owners.push(value);
        return value;
      },
      async close() {
        for (const owner of owners) await owner.close();
        store.close();
        await coordinator.close();
        db.close();
        assert.equal(realpathSync(root), root);
        rmSync(root, { recursive: true, force: false });
      },
    };
    await f.observe();
    return f;
  } catch (e) {
    store?.close();
    await coordinator?.close();
    db.close();
    rmSync(root, { recursive: true, force: false });
    throw e;
  }
}

test('actual SQLite registry → synthetic actor/parser publishes nine immutable fields without identity or DB mutation', async () => {
  const f = await fixture();
  try {
    const before = f.db.readDurable(),
      registry = f.store.snapshot(),
      device = registry.devices[0],
      seen = [];
    const owner = f.owner({
      dispatchSynthetic: async (r) => {
        seen.push(r);
        return success(texts[r.operation]);
      },
    });
    assert.equal(device.verification, 'PROVISIONAL');
    const target = owner.snapshot().target;
    assert.equal(isCurrentBinding(registry, target), false);
    assert.deepEqual(Object.keys(owner.snapshot().observations).sort(), Object.keys(texts).sort());
    let i = 0;
    for (const field of Object.keys(texts)) {
      const result = await owner.read(input(++i, field));
      assert.equal(result.source, 'SYNTHETIC_TEST');
      assert.equal(result.evidence, 'SYNTHETIC_PROCESS');
      assert.equal(result.actor.outcome, 'OBSERVED');
      assert.equal(result.observation.metadata.field, field);
      assert.equal(result.observation.metadata.available, true);
      assert.equal(result.observation.metadata.observedUtc, 1000);
      assert.equal(result.observation.metadata.source, 'ADB_TEXT');
      assert.ok(
        Object.isFrozen(result) &&
          Object.isFrozen(result.observation) &&
          Object.isFrozen(result.observation.metadata),
      );
      assert.deepEqual(result.observation.target, {
        deviceId: device.deviceId,
        bindingId: device.currentBindingId,
        generation: device.generation,
        serial: row().serial,
        transportId: '1',
        hostEpoch: before.meta.host_epoch,
        registryRevision: registry.revision,
        observationSequence: registry.sequence,
      });
    }
    assert.equal(seen.length, 9);
    assert.ok(seen.every(Object.isFrozen));
    assert.equal(seen[0].ownerId, id(9000));
    assert.equal(seen[0].serial, row().serial);
    assert.equal(isCurrentBinding(f.store.snapshot(), target), false);
    assert.deepEqual(f.db.readDurable(), before);
    assert.equal(await owner.close(), true);
    assert.equal(owner.retired, true);
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, true);
  } finally {
    await f.close();
  }
});

test('constructor accepts recognized synthetic authority only and never invokes accessor options', async () => {
  const f = await fixture(),
    live = await fixture('ADB_DISCOVERY');
  try {
    for (const patch of [
      { registry: { ...f.store.snapshot() } },
      { registry: live.store.snapshot() },
      { hostEpoch: 0 },
      { hostEpoch: -0 },
      { ownerId: 'private-secret' },
      { ownerId: `${id(9000)}\n` },
      { budget: {} },
      { unknown: true },
    ])
      assert.throws(
        () => createSyntheticTransportMetadataOwner(f.options(patch)),
        /^Error: TRANSPORT_METADATA_OPTIONS$/,
      );
    let touched = 0;
    const options = f.options();
    Object.defineProperty(options, 'dispatchSynthetic', {
      enumerable: true,
      get() {
        touched++;
        throw Error('PRIVATE');
      },
    });
    assert.throws(
      () => createSyntheticTransportMetadataOwner(options),
      /^Error: TRANSPORT_METADATA_OPTIONS$/,
    );
    assert.equal(touched, 0);
  } finally {
    await f.close();
    await live.close();
  }
});

test('exact input, cross-ID duplication and 128 accepted history cap refuse without new dispatch or replacing observation', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const owner = f.owner({
      dispatchSynthetic: async () => {
        calls++;
        return success();
      },
    });
    const first = await owner.read(input(1));
    assert.equal(first.actor.outcome, 'OBSERVED');
    for (const value of [
      input(1),
      input(2, 'MODEL', { correlationId: id(10001) }),
      input(3, 'TAP'),
      input(30, 'MODEL', { commandId: `${id(33333)}\n` }),
      input(31, 'MODEL', { correlationId: `${id(33334)}\n` }),
      input(4, 'MODEL', { extra: 'private' }),
      { ...input(5), version: 2 },
    ]) {
      const r = await owner.read(value);
      assert.equal(r.actor.code, 'INVALID_REQUEST');
      assert.equal(r.observation, null);
    }
    let touched = 0;
    const bad = input(6);
    Object.defineProperty(bad, 'field', {
      enumerable: true,
      get() {
        touched++;
        return 'MODEL';
      },
    });
    assert.equal((await owner.read(bad)).actor.code, 'INVALID_REQUEST');
    assert.equal(touched, 0);
    assert.equal(calls, 1);
    for (let n = 2; n <= 128; n++)
      assert.equal((await owner.read(input(100 + n))).actor.outcome, 'OBSERVED');
    assert.equal((await owner.read(input(999))).actor.code, 'BUSY');
    assert.equal(calls, 128);
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
  } finally {
    await f.close();
  }
});

test('known invalid times preserve prior metadata; empty and invalid text are truthful unavailable observations', async () => {
  const f = await fixture();
  try {
    let text = 'Synthetic';
    const owner = f.owner({ dispatchSynthetic: async () => success(text) });
    await owner.read(input(1));
    let n = 20;
    for (const deadlineUtc of [1000, 999, 121001])
      assert.equal(
        (await owner.read(input(n++, 'MODEL', { deadlineUtc }))).actor.code,
        'DEADLINE_EXCEEDED',
      );
    for (const deadlineUtc of [-0, NaN, Infinity])
      assert.equal(
        (await owner.read(input(n++, 'MODEL', { deadlineUtc }))).actor.code,
        'INVALID_REQUEST',
      );
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
    text = '';
    const empty = await owner.read(input(3));
    assert.equal(empty.observation.metadata.available, false);
    assert.equal(empty.observation.metadata.reason, 'UNAVAILABLE');
    assert.equal('value' in empty.observation.metadata, false);
    text = 'bad\nsecondline';
    const malformed = await owner.read(input(4));
    assert.equal(malformed.observation.metadata.reason, 'INVALID_METADATA');
  } finally {
    await f.close();
  }
});

test('same target monotonic SQLite observations retain authority but epoch, transport and duplicate claims invalidate it', async () => {
  for (const variant of [
    'epoch',
    'transport',
    'duplicate-serial',
    'duplicate-transport',
    'disconnect',
  ]) {
    const f = await fixture();
    try {
      const owner = f.owner();
      await owner.read(input(1));
      const old = owner.snapshot().observations.MODEL;
      const same = await f.observe();
      owner.updateRegistry(same, f.db.readDurable().meta.host_epoch);
      assert.equal((await owner.read(input(2))).actor.outcome, 'OBSERVED');
      assert.equal(owner.snapshot().observations.MODEL.target.observationSequence, same.sequence);
      assert.equal(old.target.observationSequence, 1);
      const nextRows =
        variant === 'transport'
          ? [row({ transportId: '2' })]
          : variant === 'duplicate-serial'
            ? [row(), row({ transportId: '2' })]
            : variant === 'duplicate-transport'
              ? [row(), row({ serial: 'synthetic-other' })]
              : variant === 'disconnect'
                ? []
                : [row()];
      const next = await f.observe(nextRows);
      assert.throws(
        () =>
          owner.updateRegistry(
            next,
            f.db.readDurable().meta.host_epoch + (variant === 'epoch' ? 1 : 0),
          ),
        /^Error: TRANSPORT_METADATA_STATE$/,
      );
      const result = await owner.read(input(3));
      assert.equal(result.observation, null, variant);
      assert.equal(result.actor.code, 'STALE_BINDING', variant);
      assert.equal(owner.snapshot().observations.MODEL.metadata.stale, true, variant);
    } finally {
      await f.close();
    }
  }
});

test('actual SQLite disconnect/reconnect generation and invalid update cannot reactivate an old owner', async () => {
  const f = await fixture();
  try {
    const initial = f.store.snapshot(),
      owner = f.owner();
    await owner.read(input(1));
    const offline = await f.observe([]);
    assert.throws(() => owner.updateRegistry(offline, 1), /^Error: TRANSPORT_METADATA_STATE$/);
    const reconnected = await f.observe(
      [row()],
      [
        {
          serial: row().serial,
          transportId: '1',
          deviceId: initial.devices[0].deviceId,
          evidenceId: id(8888),
        },
      ],
    );
    assert.throws(() => owner.updateRegistry(reconnected, 1), /^Error: TRANSPORT_METADATA_STATE$/);
    assert.equal((await owner.read(input(2))).actor.code, 'STALE_BINDING');
    assert.ok(f.db.readDurable().bindings.some((b) => b.retired));
    assert.ok(reconnected.devices[0].generation > initial.devices[0].generation);
    assert.throws(() => owner.updateRegistry(initial, 1), /^Error: TRANSPORT_METADATA_STATE$/);
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, true);
    const fresh = f.owner({ deviceId: reconnected.claims[0].deviceId, ownerId: id(9001) });
    assert.equal((await fresh.read(input(3))).actor.outcome, 'OBSERVED');
  } finally {
    await f.close();
  }
});

test('callback close or owner loss before dispatch cannot hand off; publication callback revocation cannot publish', async () => {
  for (const phase of ['clock-before', 'owner-before', 'settlement-owner']) {
    const f = await fixture();
    try {
      let owner,
        armed = false,
        entered = 0,
        alive = true;
      const pending = deferred();
      owner = f.owner({
        now: () => {
          if (armed && phase === 'clock-before') void owner.close();
          return 1000;
        },
        assertOwned: () => {
          if (armed && phase === 'owner-before') alive = false;
          return alive;
        },
        dispatchSynthetic: () => {
          entered++;
          return pending.promise;
        },
      });
      armed = true;
      const read = owner.read(input(1));
      if (phase === 'settlement-owner') {
        assert.equal(entered, 1);
        alive = false;
        pending.resolve(success());
      } else pending.resolve(success());
      const result = await read;
      assert.equal(result.observation, null);
      if (phase !== 'settlement-owner') assert.equal(entered, 0);
      assert.equal(owner.snapshot().observations.MODEL, null);
    } finally {
      await f.close();
    }
  }
});

test('own-settlement snapshots process descriptors before external clock mutation and preserves captured timestamp', async () => {
  const f = await fixture();
  try {
    const pending = deferred(),
      raw = success('Before');
    let settled = false,
      time = 1000;
    const owner = f.owner({
      now: () => {
        if (settled) raw.stdout = 'After';
        return time;
      },
      dispatchSynthetic: () => pending.promise,
    });
    const request = input(1);
    const read = owner.read(request);
    request.field = 'SDK';
    settled = true;
    time = 1001;
    pending.resolve(raw);
    const result = await read;
    assert.equal(result.actor.outcome, 'OBSERVED');
    assert.equal(result.observation.metadata.value, 'Before');
    assert.equal(result.observation.metadata.observedUtc, 1001);
    assert.equal(result.observation.metadata.field, 'MODEL');
  } finally {
    await f.close();
  }
});

test('untrusted process getters, oversized output and hostile promise handles never publish or prove retirement', async () => {
  for (const kind of ['getter', 'oversized', 'unretired', 'thenable', 'overridden-then']) {
    const f = await fixture();
    try {
      let touched = 0;
      const owner = f.owner({
        dispatchSynthetic: () => {
          if (kind === 'thenable')
            return Object.defineProperty({}, 'then', {
              value: () => {
                touched++;
              },
            });
          if (kind === 'overridden-then') {
            const p = Promise.resolve(success());
            Object.defineProperty(p, 'then', {
              get() {
                touched++;
                throw Error('PRIVATE');
              },
            });
            return p;
          }
          const raw =
            kind === 'oversized'
              ? success('x'.repeat(65537))
              : success('Synthetic', { retired: kind !== 'unretired' });
          if (kind === 'getter')
            Object.defineProperty(raw, 'stdout', {
              enumerable: true,
              get() {
                touched++;
                throw Error('PRIVATE');
              },
            });
          return Promise.resolve(raw);
        },
      });
      const result = await owner.read(input(1, 'MODEL', { deadlineUtc: 1030 }));
      assert.equal(result.observation, null, kind);
      assert.equal(owner.snapshot().state, 'UNCERTAIN', kind);
      assert.equal(touched, 0, kind);
      assert.equal(await owner.close(), false, kind);
      assert.equal(owner.retired, false, kind);
    } finally {
      await f.close();
    }
  }
});

test('logical deadline responds before actual drain; late genuine settlement cannot revive uncertain owner', async () => {
  const f = await fixture();
  try {
    const pending = deferred();
    let calls = 0;
    const owner = f.owner({
      dispatchSynthetic: () => {
        calls++;
        return pending.promise;
      },
    });
    const start = performance.now();
    const result = await owner.read(input(1, 'MODEL', { deadlineUtc: 1030 }));
    assert.ok(performance.now() - start < 1000);
    assert.equal(result.actor.outcome, 'OUTCOME_UNKNOWN');
    assert.equal(result.observation, null);
    assert.equal(owner.snapshot().state, 'UNCERTAIN');
    assert.equal(owner.retired, false);
    assert.notEqual((await owner.read(input(2))).actor.outcome, 'OBSERVED');
    assert.equal(calls, 1);
    pending.resolve(success());
    await turn();
    assert.equal(await owner.close(), false);
    assert.equal(owner.retired, false);
    assert.equal(owner.snapshot().observations.MODEL, null);
  } finally {
    await f.close();
  }
});

test('close retains actual pending work, denies queued effects and returns one stable report after real settlement', async () => {
  const f = await fixture();
  try {
    const pending = deferred();
    let calls = 0;
    const owner = f.owner({
      dispatchSynthetic: () => {
        calls++;
        return pending.promise;
      },
    });
    const first = owner.read(input(1)),
      queued = owner.read(input(2));
    const closing = owner.close();
    assert.equal(owner.close(), closing);
    assert.equal(owner.retired, false);
    assert.equal((await queued).observation, null);
    pending.resolve(success());
    assert.equal((await first).observation, null);
    assert.equal(await closing, true);
    assert.equal(owner.retired, true);
    assert.equal(calls, 1);
    assert.equal((await owner.read(input(3))).actor.code, 'CLOSED');
  } finally {
    await f.close();
  }
});

test('shared actor budget and queue limits retain unresolved work while another device queue stays independent', async () => {
  const f = await fixture('SYNTHETIC_TEST', [
    row(),
    row({ serial: 'synthetic-second', transportId: '2' }),
  ]);
  const held = [];
  const pending = deferred();
  let closes = [];
  const budget = createDeviceQueueBudget();
  try {
    let firstCalls = 0,
      secondCalls = 0;
    const first = f.owner({
      budget,
      dispatchSynthetic: () => {
        firstCalls++;
        return pending.promise;
      },
    });
    assert.throws(
      () => createSyntheticTransportMetadataOwner(f.options({ budget })),
      /^Error: TRANSPORT_METADATA_OPTIONS$/,
    );
    const second = f.owner({
      budget,
      deviceId: f.store.snapshot().devices[1].deviceId,
      ownerId: id(9001),
      dispatchSynthetic: async () => {
        secondCalls++;
        return success();
      },
    });
    const reads = [];
    for (let n = 0; n < 65; n++) reads.push(first.read(input(n + 1)));
    assert.equal((await first.read(input(90))).actor.code, 'BUSY');
    assert.equal(firstCalls, 1);
    assert.equal(budget.pending(), 65);
    for (let n = 0; n < 959; n++) held.push(budget.reserve());
    assert.ok(held.every(Boolean));
    assert.equal(budget.pending(), 1024);
    assert.equal((await second.read(input(91))).actor.code, 'BUSY');
    assert.equal(secondCalls, 0);
    budget.release(held.pop());
    assert.equal((await second.read(input(92))).actor.outcome, 'OBSERVED');
    assert.equal(secondCalls, 1);
    assert.equal(firstCalls, 1);
    closes = [first.close(), second.close()];
    pending.resolve(success());
    await Promise.all(reads);
    assert.deepEqual(await Promise.all(closes), [true, true]);
  } finally {
    pending.resolve(success());
    for (const token of held) budget.release(token);
    await Promise.all(closes);
    await f.close();
  }
});

test('known retired nonsuccess stales only its field and snapshot performs no callback or clock sampling', async () => {
  const f = await fixture();
  try {
    let bad = false,
      calls = 0;
    const owner = f.owner({
      now: () => {
        calls++;
        return 1000;
      },
      assertOwned: () => {
        calls++;
        return true;
      },
      dispatchSynthetic: async (r) =>
        bad ? success('', { status: 'NONZERO_EXIT', exitCode: 1 }) : success(texts[r.operation]),
    });
    await owner.read(input(1, 'MODEL'));
    await owner.read(input(2, 'SDK'));
    const before = owner.snapshot();
    bad = true;
    const result = await owner.read(input(3, 'MODEL'));
    assert.equal(result.actor.code, 'TRANSPORT_FAILED');
    assert.equal(result.observation, null);
    const count = calls,
      after = owner.snapshot();
    assert.equal(calls, count);
    assert.equal(after.observations.MODEL.metadata.stale, true);
    assert.equal(after.observations.SDK.metadata.stale, false);
    assert.equal(
      after.observations.MODEL.metadata.observedUtc,
      before.observations.MODEL.metadata.observedUtc,
    );
    assert.equal(before.observations.MODEL.metadata.stale, false);
    assert.ok(Object.isFrozen(after.observations));
  } finally {
    await f.close();
  }
});

test('a target changed by the settlement clock suppresses a completed parse and late queued work', async () => {
  const f = await fixture();
  try {
    const pending = deferred();
    let owner,
      settled = false,
      calls = 0;
    owner = f.owner({
      now: () => {
        if (settled) {
          settled = false;
          assert.throws(
            () => owner.updateRegistry(changed, 2),
            /^Error: TRANSPORT_METADATA_STATE$/,
          );
        }
        return 1000;
      },
      dispatchSynthetic: () => {
        calls++;
        return pending.promise;
      },
    });
    const changed = await f.observe();
    const first = owner.read(input(1)),
      queued = owner.read(input(2));
    settled = true;
    pending.resolve(success());
    assert.equal((await first).observation, null);
    assert.equal((await queued).observation, null);
    assert.equal(calls, 1);
    assert.equal(owner.snapshot().observations.MODEL, null);
  } finally {
    await f.close();
  }
});

test('reentrant newer same-field publication cannot be replaced or marked stale by older retired failure', async () => {
  const f = await fixture();
  const oldWork = deferred();
  try {
    let owner,
      newer,
      armed = false;
    owner = f.owner({
      now: () => {
        if (armed) {
          armed = false;
          newer = owner.read(input(2));
        }
        return 1000;
      },
      dispatchSynthetic: (request) =>
        request.commandId === input(2).commandId
          ? Promise.resolve(success('Newer'))
          : oldWork.promise,
    });
    armed = true;
    const older = owner.read(input(1));
    assert.equal((await newer).actor.outcome, 'OBSERVED');
    const published = owner.snapshot().observations.MODEL;
    assert.equal(published.metadata.value, 'Newer');
    oldWork.resolve(success('', { status: 'NONZERO_EXIT', exitCode: 1 }));
    assert.equal((await older).actor.code, 'TRANSPORT_FAILED');
    assert.equal(owner.snapshot().observations.MODEL, published);
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, false);
  } finally {
    oldWork.resolve(success());
    await f.close();
  }
});

test('newer dispatched retired failure remains stale when an older successful read settles later', async () => {
  const f = await fixture();
  const oldWork = deferred();
  try {
    let owner,
      newer,
      armed = false;
    owner = f.owner({
      now: () => {
        if (armed) {
          armed = false;
          newer = owner.read(input(3));
        }
        return 1000;
      },
      dispatchSynthetic: (request) => {
        if (request.commandId === input(1).commandId) return Promise.resolve(success('Baseline'));
        if (request.commandId === input(3).commandId)
          return Promise.resolve(success('', { status: 'NONZERO_EXIT', exitCode: 1 }));
        return oldWork.promise;
      },
    });
    assert.equal((await owner.read(input(1))).actor.outcome, 'OBSERVED');
    const baseline = owner.snapshot().observations.MODEL;
    armed = true;
    const older = owner.read(input(2));
    assert.equal((await newer).actor.code, 'TRANSPORT_FAILED');
    const stale = owner.snapshot().observations.MODEL;
    assert.equal(stale.metadata.stale, true);
    assert.equal(stale.metadata.value, 'Baseline');
    assert.equal(stale.metadata.observedUtc, baseline.metadata.observedUtc);
    oldWork.resolve(success('Older late success'));
    assert.equal((await older).observation, null);
    assert.equal(owner.snapshot().observations.MODEL, stale);
    assert.equal(owner.snapshot().observations.MODEL.metadata.stale, true);
  } finally {
    oldWork.resolve(success());
    await f.close();
  }
});
