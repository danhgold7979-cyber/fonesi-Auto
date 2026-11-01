import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase } from '../src/main/foundation-database.ts';
import { createDurableCoordinator } from '../src/main/durable-coordinator.ts';
import { createRegistryStore } from '../src/main/registry-store.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
import {
  createAdbDiscoveryService,
  createSyntheticDiscoveryProvider,
} from '../src/main/adb-discovery-service.ts';
import { createFleetService } from '../src/main/fleet-service.ts';
async function fixture(options = {}) {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'registry-store-')),
    storeId = randomUUID(),
    db = new FoundationDatabase(join(root, 'active.sqlite'), storeId);
  try {
    // Actual SQLite protected snapshot witnesses with synthetic provider authority only.
    await db.migrate(async (version) => {
      const path = join(root, `snapshot-${version}.sqlite`);
      await db.snapshot(path);
      const snap = new FoundationDatabase(path, storeId, true);
      try {
        return { backupId: randomUUID(), schemaVersion: version, fingerprint: snap.fingerprint() };
      } finally {
        snap.close();
      }
    }, 1000);
    let n = 100;
    const nextId = () => id(n++),
      events = [];
    const coordinator = createDurableCoordinator({
      db: options.wrapDb ? options.wrapDb(db) : db,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: nextId,
      audit: async (e) => {
        events.push(e);
        return 'AVAILABLE';
      },
      ...options,
    });
    const store = createRegistryStore({
      coordinator,
      nextId,
      quarantined: () => false,
      assertOwnedSync: options.assertOwnedSync ?? (() => {}),
    });
    return {
      db,
      root,
      storeId,
      coordinator,
      store,
      events,
      nextId,
      async close() {
        store.close();
        await coordinator.close();
        db.close();
        assert.equal(realpathSync(root), root);
        rmSync(root, { recursive: true, force: false });
      },
    };
  } catch (error) {
    db.close();
    assert.equal(realpathSync(root), root);
    rmSync(root, { recursive: true, force: false });
    throw error;
  }
}
const retired = () => Promise.resolve(Object.freeze({ status: 'RETIRED' }));
const complete = (
  raw = 'List of devices attached\nfirst device transport_id:1\nsecond offline transport_id:2\n',
  time = 1000,
) => ({
  outcome: 'COMPLETE',
  raw,
  observedAtUtc: time,
  stdoutTruncated: false,
  stderrTruncated: false,
});
async function setup(options = {}) {
  const f = await fixture(options.coordinator);
  await f.store.startup();
  let n = 8000;
  const calls = [];
  const issuer = createSyntheticDiscoveryProvider({
    begin(r) {
      calls.push(r);
      return (
        options.begin?.(r) ??
        Object.freeze({ result: Promise.resolve(complete()), retirement: retired() })
      );
    },
    assertCurrentSync: options.current ?? (() => {}),
  });
  const service = createAdbDiscoveryService({
    provider: issuer.provider,
    registry: f.store,
    readDurableRevision: () => f.db.readDurable().meta.revision,
    assertOwnedSync: () => {},
    clock: () => 1000,
    newId: () => id(n++),
    ...options.service,
  });
  return {
    ...f,
    service,
    issuer,
    calls,
    async cleanup() {
      await service.close();
      await f.close();
    },
  };
}
test('actual SQLite parser/reconcile preserves ordered identities; synthetic fleet projection is refused', async () => {
  let raw = complete().raw;
  const f = await setup({
    begin: () => Object.freeze({ result: Promise.resolve(complete(raw)), retirement: retired() }),
  });
  try {
    const first = await f.service.refresh(1);
    assert.equal(first.outcome, 'COMMITTED');
    assert.equal(first.revision, 2);
    assert.equal(first.source, 'SYNTHETIC_TEST');
    assert.equal(first.projectionCurrent, true);
    const ids = f.service
      .snapshot()
      .devices.map((d) => d.deviceId)
      .sort();
    raw = 'List of devices attached\nsecond offline transport_id:2\nfirst device transport_id:1\n';
    assert.equal((await f.service.refresh(2)).outcome, 'COMMITTED');
    assert.deepEqual(
      f.service
        .snapshot()
        .devices.map((d) => d.deviceId)
        .sort(),
      ids,
    );
    assert.ok(f.service.snapshot().devices.every((d) => d.verification === 'PROVISIONAL'));
    assert.ok(f.db.readDurable().bindings.every((b) => b.source === 'SYNTHETIC_TEST'));
    const fleet = createFleetService({
      registry: () => f.service.snapshot(),
      availability: () => f.service.availability(),
      assertOwnedSync: () => {},
      newDiagnostic: () => id(9000),
      audit: async () => 'AVAILABLE',
    });
    const cap = fleet.grant(() => {});
    const result = JSON.parse(
      await fleet.execute(cap, { version: 1, requestId: 'f1', method: 'fleet.get' }),
    );
    assert.equal(result.code, 'FLEET_UNAVAILABLE');
    assert.equal(JSON.stringify(result).includes('first'), false);
    await fleet.close();
  } finally {
    await f.cleanup();
  }
});
test('duplicate claims quarantine and malformed text does not overwrite committed ledger', async () => {
  let raw = complete().raw;
  const f = await setup({
    begin: () => Object.freeze({ result: Promise.resolve(complete(raw)), retirement: retired() }),
  });
  try {
    await f.service.refresh(1);
    raw = 'List of devices attached\nfirst device transport_id:1\nfirst device transport_id:3\n';
    assert.equal((await f.service.refresh(2)).outcome, 'COMMITTED');
    assert.ok(f.service.snapshot().claims.some((c) => c.state === 'CONFLICT'));
    const before = f.db.fingerprint();
    raw = 'private malformed';
    assert.equal((await f.service.refresh(3)).code, 'INVALID_DISCOVERY');
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.service.snapshot(), null);
  } finally {
    await f.cleanup();
  }
});
test('actual ledger CAS is separate from runtime revision after DISPLAY', async () => {
  const f = await setup();
  try {
    await f.service.refresh(1);
    const snapshot = f.service.snapshot();
    const d = snapshot.devices[0];
    await f.store.display(2, d.deviceId, d.generation, 0);
    assert.equal(f.store.snapshot().revision, 2);
    assert.equal(f.db.readDurable().meta.revision, 3);
    assert.equal((await f.service.refresh(2)).code, 'STALE_REVISION');
    assert.equal(f.calls.length, 1);
    assert.equal((await f.service.refresh(3)).revision, 4);
  } finally {
    await f.cleanup();
  }
});
test('result cannot reconcile before exact retirement; pending work keeps BUSY', async () => {
  const retirement = deferred();
  const f = await setup({
    begin: () =>
      Object.freeze({ result: Promise.resolve(complete()), retirement: retirement.promise }),
  });
  try {
    const pending = f.service.refresh(1);
    await new Promise((r) => setImmediate(r));
    assert.equal(f.db.readDurable().meta.revision, 1);
    assert.equal((await f.service.refresh(1)).code, 'BUSY');
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await pending).outcome, 'COMMITTED');
  } finally {
    await f.cleanup();
  }
});
test('close retains actual pending promises and prohibits late reconciliation', async () => {
  const result = deferred(),
    retirement = deferred();
  const f = await setup({
    begin: () => Object.freeze({ result: result.promise, retirement: retirement.promise }),
  });
  const pending = f.service.refresh(1);
  await new Promise((r) => setImmediate(r));
  const closing = f.service.close();
  assert.equal(f.service.retired, false);
  result.resolve(complete());
  retirement.resolve(Object.freeze({ status: 'RETIRED' }));
  assert.equal((await pending).outcome, 'NOT_COMMITTED');
  assert.deepEqual(await closing, { status: 'RETIRED' });
  assert.equal(f.db.readDurable().meta.revision, 1);
  await f.cleanup();
});
test('retirement rejection or malformed retirement latches without publishing raw errors', async () => {
  for (const retirement of [
    () => Promise.reject(Error('private-secret')),
    () => Promise.resolve(undefined),
  ]) {
    const f = await setup({
      begin: () => Object.freeze({ result: Promise.resolve(complete()), retirement: retirement() }),
    });
    try {
      const result = await f.service.refresh(1);
      assert.equal(result.code, 'UNRETIRED');
      assert.equal(JSON.stringify(result).includes('private'), false);
      assert.equal(f.service.retired, false);
      assert.deepEqual(await f.service.close(), { status: 'UNRETIRED' });
      assert.equal(f.db.readDurable().meta.revision, 1);
    } finally {
      await f.cleanup();
    }
  }
});
test('epoch revoked during INTENT refuses actual COMMIT; RESULT revocation preserves known receipt', async () => {
  for (const phase of ['INTENT', 'RESULT']) {
    let issuer;
    const f = await setup({
      coordinator: {
        audit: async (e) => {
          if (e.operation === 'RECONCILE' && e.phase === phase) issuer.revoke();
          return 'AVAILABLE';
        },
      },
    });
    issuer = f.issuer;
    try {
      const result = await f.service.refresh(1);
      assert.equal(result.outcome, phase === 'INTENT' ? 'NOT_COMMITTED' : 'COMMITTED');
      assert.equal(f.db.readDurable().meta.revision, phase === 'INTENT' ? 1 : 2);
      if (phase === 'RESULT') assert.equal(result.projectionCurrent, false);
      assert.equal(f.service.snapshot(), null);
    } finally {
      await f.cleanup();
    }
  }
});
test('fresh owner cannot reset observed sequence or reuse a branded provider', async () => {
  const f = await setup();
  try {
    await f.service.refresh(1);
    const options = {
      provider: f.issuer.provider,
      registry: f.store,
      readDurableRevision: () => 2,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: () => id(9000),
    };
    assert.throws(() => createAdbDiscoveryService(options));
    const other = createSyntheticDiscoveryProvider({
      begin: () => {
        throw Error();
      },
      assertCurrentSync: () => {},
    });
    assert.throws(() => createAdbDiscoveryService({ ...options, provider: other.provider }));
    assert.throws(() =>
      createAdbDiscoveryService({
        ...options,
        provider: Object.freeze({ syntheticDiscovery: true }),
      }),
    );
  } finally {
    await f.cleanup();
  }
});
test('predated observations, truncation and getter records cannot mutate', async () => {
  for (const value of [
    complete(undefined, 999),
    { ...complete(), stdoutTruncated: true },
    Object.defineProperty({ ...complete() }, 'raw', {
      get() {
        throw Error('private');
      },
      enumerable: true,
    }),
  ]) {
    const f = await setup({
      begin: () => Object.freeze({ result: Promise.resolve(value), retirement: retired() }),
    });
    try {
      assert.equal((await f.service.refresh(1)).code, 'INVALID_DISCOVERY');
      assert.equal(f.db.readDurable().meta.revision, 1);
    } finally {
      await f.cleanup();
    }
  }
});
test('reentrant ID revocation prevents acquisition', async () => {
  let issuer;
  const f = await setup({
    service: {
      newId: () => {
        issuer.revoke();
        return id(9999);
      },
    },
  });
  issuer = f.issuer;
  try {
    assert.equal((await f.service.refresh(1)).code, 'EPOCH_REVOKED');
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
});
test('deadline before reconcile retains provider lane; exact delayed RESULT is not replaced by timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const retirement = deferred();
  const f = await setup({
    begin: () =>
      Object.freeze({ result: Promise.resolve(complete()), retirement: retirement.promise }),
  });
  try {
    const pending = f.service.refresh(1);
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(30000);
    assert.equal((await pending).code, 'DEADLINE');
    assert.equal((await f.service.refresh(1)).code, 'BUSY');
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    await new Promise((r) => setImmediate(r));
    assert.equal(f.db.readDurable().meta.revision, 1);
  } finally {
    await f.cleanup();
  }
  const audit = deferred();
  const g = await setup({
    coordinator: {
      audit: async (e) =>
        e.operation === 'RECONCILE' && e.phase === 'RESULT' ? audit.promise : 'AVAILABLE',
    },
  });
  try {
    let settled = false;
    const pending = g.service.refresh(1).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(g.db.readDurable().meta.revision, 2);
    t.mock.timers.tick(30000);
    await Promise.resolve();
    assert.equal(settled, false);
    audit.resolve('AVAILABLE');
    const receipt = await pending;
    assert.equal(receipt.outcome, 'COMMITTED');
    assert.equal(receipt.projectionCurrent, false);
  } finally {
    await g.cleanup();
  }
});
test('last coordinator-owned callback can revoke epoch before actual SQLite COMMIT', async () => {
  let within = false,
    arm = false,
    issuer;
  const f = await setup({
    coordinator: {
      wrapDb(db) {
        return {
          readDurable: () => db.readDurable(),
          commitDurable(rev, delta, admit) {
            return db.commitDurable(rev, delta, () => {
              within = true;
              try {
                admit();
              } finally {
                within = false;
              }
            });
          },
        };
      },
      assertOwnedSync() {
        if (within && arm) issuer.revoke();
      },
    },
    current() {
      if (within) arm = true;
    },
  });
  issuer = f.issuer;
  try {
    const before = f.db.fingerprint();
    const result = await f.service.refresh(1);
    assert.equal(arm, true);
    assert.equal(result.outcome, 'NOT_COMMITTED');
    assert.equal(result.code, 'OWNER_REVOKED');
    assert.equal(f.db.fingerprint(), before);
    assert.equal(f.db.readDurable().meta.revision, 1);
  } finally {
    await f.cleanup();
  }
});
test('one close budget expires without losing pending retirement; late settlement never reopens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = deferred(),
    retirement = deferred();
  const f = await setup({
    begin: () => Object.freeze({ result: result.promise, retirement: retirement.promise }),
  });
  const pending = f.service.refresh(1);
  await new Promise((r) => setImmediate(r));
  const closing = f.service.close();
  t.mock.timers.tick(120000);
  assert.deepEqual(await closing, { status: 'UNRETIRED' });
  assert.equal(f.service.retired, false);
  result.resolve(complete());
  retirement.resolve(Object.freeze({ status: 'RETIRED' }));
  await pending;
  await new Promise((r) => setImmediate(r));
  assert.equal(f.service.retired, true);
  assert.equal((await f.service.refresh(1)).code, 'CLOSED');
  assert.deepEqual(await f.service.close(), { status: 'UNRETIRED' });
  assert.equal(f.db.readDurable().meta.revision, 1);
  await f.cleanup();
});
test('actual database reopen preserves synthetic history but retires binding and epoch authority', async () => {
  const f = await setup();
  try {
    await f.service.refresh(1);
    const previous = f.store.snapshot();
    await f.service.close();
    f.store.close();
    await f.coordinator.close();
    f.db.close();
    const db = new FoundationDatabase(join(f.root, 'active.sqlite'), f.storeId);
    let n = 20000;
    const coordinator = createDurableCoordinator({
      db,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: () => id(n++),
      audit: async () => 'AVAILABLE',
    });
    const store = createRegistryStore({
      coordinator,
      nextId: () => id(n++),
      quarantined: () => false,
      assertOwnedSync: () => {},
    });
    try {
      assert.equal((await store.startup()).outcome, 'COMMITTED');
      const restored = store.snapshot();
      assert.deepEqual(
        restored.devices.map((d) => d.deviceId),
        previous.devices.map((d) => d.deviceId),
      );
      assert.equal(restored.sequence, null);
      assert.ok(
        restored.devices.every(
          (d) =>
            d.state === 'DISCONNECTED' &&
            d.verification === 'PROVISIONAL' &&
            d.currentBindingId === null,
        ),
      );
      assert.ok(restored.bindings.every((b) => b.retired));
      assert.throws(() =>
        createAdbDiscoveryService({
          provider: f.issuer.provider,
          registry: store,
          readDurableRevision: () => db.readDurable().meta.revision,
          assertOwnedSync: () => {},
          clock: () => 1000,
          newId: () => id(n++),
        }),
      );
    } finally {
      store.close();
      await coordinator.close();
      db.close();
    }
  } finally {
    await f.cleanup();
  }
});
test('provider ownership is consumed before reentrant constructor snapshot and never rolled back', async () => {
  const f = await fixture();
  await f.store.startup();
  const issuer = createSyntheticDiscoveryProvider({
    begin: () => {
      throw Error();
    },
    assertCurrentSync: () => {},
  });
  let attempts = 0;
  const options = {
    provider: issuer.provider,
    registry: null,
    readDurableRevision: () => 1,
    assertOwnedSync: () => {},
    clock: () => 1000,
    newId: () => id(7777),
  };
  options.registry = {
    ...f.store,
    snapshot() {
      attempts++;
      assert.throws(() => createAdbDiscoveryService(options), /INVALID_REQUEST/);
      return f.store.snapshot();
    },
  };
  const service = createAdbDiscoveryService(options);
  try {
    assert.equal(attempts, 1);
    assert.throws(() => createAdbDiscoveryService(options));
  } finally {
    await service.close();
    await f.close();
  }
});
test('hostile thrown prototype trap produces fixed receipt rather than rejecting or hanging', async () => {
  const poison = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw Error('private-poison');
      },
    },
  );
  const f = await setup({
    current() {
      throw poison;
    },
  });
  try {
    const receipt = await f.service.refresh(1);
    assert.equal(receipt.code, 'PROVIDER_FAILED');
    assert.equal(JSON.stringify(receipt).includes('private'), false);
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
});
test('result is copied at its own settlement while retirement is held', async () => {
  const retirement = deferred();
  const value = complete();
  const f = await setup({
    begin: () => Object.freeze({ result: Promise.resolve(value), retirement: retirement.promise }),
  });
  try {
    const pending = f.service.refresh(1);
    await new Promise((r) => setImmediate(r));
    value.raw = 'List of devices attached\nchanged device transport_id:7\n';
    value.observedAtUtc = 999;
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await pending).outcome, 'COMMITTED');
    assert.deepEqual(
      f.db
        .readDurable()
        .bindings.map((b) => b.serial)
        .sort(),
      ['first', 'second'],
    );
  } finally {
    await f.cleanup();
  }
});
test('unfrozen retirement cannot become valid while result is held; result completion time is not retirement time', async () => {
  const result = deferred();
  const value = { status: 'RETIRED' };
  const f = await setup({
    begin: () => Object.freeze({ result: result.promise, retirement: Promise.resolve(value) }),
  });
  try {
    const pending = f.service.refresh(1);
    await new Promise((r) => setImmediate(r));
    Object.freeze(value);
    result.resolve(complete());
    assert.equal((await pending).code, 'UNRETIRED');
    assert.equal(f.db.readDurable().meta.revision, 1);
  } finally {
    await f.cleanup();
  }
  let time = 1000;
  const retirement = deferred();
  const g = await setup({
    service: { clock: () => time },
    begin: () =>
      Object.freeze({
        result: Promise.resolve(complete(undefined, 1001)),
        retirement: retirement.promise,
      }),
  });
  try {
    const pending = g.service.refresh(1);
    await new Promise((r) => setImmediate(r));
    time = 1002;
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await pending).code, 'INVALID_DISCOVERY');
    assert.equal(g.db.readDurable().meta.revision, 1);
  } finally {
    await g.cleanup();
  }
});
test('constructor snapshot revocation consumes issuer without establishing service', async () => {
  const f = await fixture();
  await f.store.startup();
  const issuer = createSyntheticDiscoveryProvider({
    begin: () => {
      throw Error();
    },
    assertCurrentSync: () => {},
  });
  try {
    const options = {
      provider: issuer.provider,
      registry: {
        ...f.store,
        snapshot() {
          issuer.revoke();
          return f.store.snapshot();
        },
      },
      readDurableRevision: () => 1,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: () => id(7777),
    };
    assert.throws(() => createAdbDiscoveryService(options), /INVALID_REQUEST/);
    assert.throws(() => createAdbDiscoveryService({ ...options, registry: f.store }));
  } finally {
    await f.close();
  }
});
test('queued final-admission revocation cannot deliver a current committed receipt', async () => {
  let resultSeen = false,
    issuer;
  const f = await setup({
    coordinator: {
      audit: async (e) => {
        if (e.operation === 'RECONCILE' && e.phase === 'RESULT') resultSeen = true;
        return 'AVAILABLE';
      },
    },
    current() {
      if (resultSeen) queueMicrotask(() => issuer.revoke());
    },
  });
  issuer = f.issuer;
  try {
    const receipt = await f.service.refresh(1);
    assert.equal(receipt.outcome, 'COMMITTED');
    assert.equal(receipt.projectionCurrent, false);
    assert.equal(f.db.readDurable().meta.revision, 2);
    assert.equal(f.service.snapshot(), null);
  } finally {
    await f.cleanup();
  }
});
test('exported DurableFault cannot leak overwritten or accessor diagnostic codes', async () => {
  const { DurableFault } = await import('../src/main/durable-coordinator.ts');
  for (const kind of ['private', 'object', 'accessor', 'unknown']) {
    let reads = 0;
    const fault = new DurableFault('OWNER_REVOKED');
    if (kind === 'accessor')
      Object.defineProperty(fault, 'code', {
        get() {
          reads++;
          return 'private-secret';
        },
      });
    else
      fault.code =
        kind === 'private'
          ? 'private-secret'
          : kind === 'object'
            ? { private: 'secret' }
            : 'OUTCOME_UNKNOWN';
    const f = await setup({
      current() {
        throw fault;
      },
    });
    try {
      const receipt = await f.service.refresh(1);
      assert.equal(receipt.code, 'PROVIDER_FAILED');
      assert.equal(reads, 0);
      assert.equal(JSON.stringify(receipt).includes('private'), false);
      assert.equal(f.calls.length, 0);
    } finally {
      await f.cleanup();
    }
  }
});
test('nonordinary genuine promises cannot release an unretired acquisition', async () => {
  for (const field of ['then', 'constructor']) {
    let reads = 0;
    const result = Promise.resolve(complete()),
      retirement = deferred();
    Object.defineProperty(result, field, {
      get() {
        reads++;
        throw Error('private-promise');
      },
    });
    const f = await setup({
      begin: () => Object.freeze({ result, retirement: retirement.promise }),
    });
    try {
      const receipt = await f.service.refresh(1);
      assert.equal(receipt.code, 'UNRETIRED');
      assert.equal(reads, 0);
      assert.deepEqual(await f.service.close(), { status: 'UNRETIRED' });
      assert.equal(f.service.retired, false);
      assert.equal(f.db.readDurable().meta.revision, 1);
      retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    } finally {
      await f.cleanup();
    }
  }
});
