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
async function exerciseNativeIssuer(verified = false) {
  const { readFileSync } = await import('node:fs'),
    { transformSync } = await import('esbuild');
  const moduleUrl = (source, path) =>
    'data:text/javascript;base64,' +
    Buffer.from(
      transformSync(
        source.replace(
          /from '(\.\.?\/[^']+)'/g,
          (_, relative) => `from '${new URL(relative, path).href}'`,
        ),
        { loader: 'ts', format: 'esm', target: 'es2022' },
      ).code,
    ).toString('base64');
  const serverPath = new URL('../src/main/adb-server-service.ts', import.meta.url);
  let serverSource = readFileSync(serverPath, 'utf8');
  assert.equal(serverSource.split('!isRealHostFactory(factory)').length, 2);
  serverSource = serverSource.replace(
    '!isRealHostFactory(factory)',
    'false /* SYNTHETIC_ADMISSION_TEST_ONLY */',
  );
  const serverUrl = moduleUrl(serverSource, serverPath),
    serverModule = await import(serverUrl);
  const ingestPath = new URL('../src/main/adb-discovery-service.ts', import.meta.url);
  const ingestSource = readFileSync(ingestPath, 'utf8')
    .replace("'./adb-server-service.ts'", JSON.stringify(serverUrl))
    .replace(
      'proofs: Object.freeze([]),',
      'proofs: Object.freeze(globalThis.__inputIssuerFixtureProofs ?? []),',
    );
  const ingestModule = await import(moduleUrl(ingestSource, ingestPath));
  const f = await fixture();
  await f.store.startup();
  let state = 'STOPPED',
    closed = false,
    n = 40000;
  const server = serverModule.createAdbServerService({
    ownerId: id(1),
    expectedInstallationRevision: 1,
    assertOwnedSync: () => {},
    assertCurrentSync: () => {},
    clock: () => 1000,
    newId: () => id(n++),
    audit: async () => 'AVAILABLE',
    createFactory() {
      return {
        grant: () => Object.freeze({}),
        snapshot: () => Object.freeze({ state, busy: false, closed }),
        execute: async (_cap, request) => {
          state = request.operation === 'SERVER_STOP' ? 'STOPPED' : 'READY';
          return Object.freeze({ outcome: 'OBSERVED', code: 'OK', diagnosticId: null });
        },
        assertCurrentSession() {
          assert.equal(state, 'READY');
          assert.equal(closed, false);
        },
        assertDiscoveryEpochCurrent() {
          assert.equal(state, 'READY');
          assert.equal(closed, false);
        },
        discoveryEpochWitness() {
          return Object.freeze({
            installationRevision: 1,
            get valid() {
              return state === 'READY' && !closed;
            },
          });
        },
        assertRetiredSession() {
          assert.equal(state, 'STOPPED');
        },
        get retired() {
          return closed;
        },
        close: async () => {
          closed = true;
          state = 'STOPPED';
          return 'RETIRED';
        },
        acquireInput: (_cap, request) => {
          assert.deepEqual([request.transportId, request.action], ['1', 'HOME']);
          return Object.freeze({
            handoff: 'QUERY',
            result: Promise.resolve(
              Object.freeze({
                version: 1,
                kind: 'INPUT_QUERY',
                status: 'COMPLETE',
                code: 'OK',
                dispatched: true,
                operationRetired: true,
                remoteExitCode: 0,
                stdoutEmpty: true,
                stderrEmpty: true,
                observedAtUtc: 1000,
              }),
            ),
            retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
          });
        },
        acquireMetadata: () =>
          Object.freeze({
            handoff: 'QUERY',
            result: Promise.resolve(
              Object.freeze({
                version: 1,
                kind: 'METADATA_QUERY',
                status: 'COMPLETE',
                code: 'OK',
                dispatched: true,
                operationRetired: true,
                stdoutBase64: Buffer.from('Synthetic Model\n').toString('base64'),
                stderrBase64: '',
                remoteExitCode: 0,
                observedAtUtc: 1000,
              }),
            ),
            retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
          }),
        acquireDiscovery: () =>
          Object.freeze({
            result: Promise.resolve(
              Object.freeze({
                version: 1,
                kind: 'ACQUISITION',
                status: 'COMPLETE',
                code: 'OK',
                dispatched: true,
                operationRetired: true,
                payloadBase64: Buffer.from(
                  'synthetic-private-device device transport_id:1\n',
                ).toString('base64'),
                observedAtUtc: 1000,
              }),
            ),
            retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
          }),
      };
    },
  });
  let ingestion, fleet;
  try {
    await server.start();
    ingestion = ingestModule.createAdbDiscoveryService({
      provider: server.discoveryProvider(),
      registry: f.store,
      readDurableRevision: () => f.db.readDurable().meta.revision,
      assertOwnedSync: () => {},
      clock: () => 1000,
      newId: () => id(n++),
    });
    const result = await ingestion.refresh(1);
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.source, 'ADB_DISCOVERY');
    assert.equal(result.projectionCurrent, true);
    assert.equal(ingestion.snapshot().devices[0].verification, 'PROVISIONAL');
    const deviceId = ingestion.snapshot().devices[0].deviceId;
    assert.equal(ingestion.inputTarget(deviceId), null); // PROVISIONAL never input-authorized.
    if (verified) {
      globalThis.__inputIssuerFixtureProofs = [
        { deviceId, evidenceId: id(999), serial: 'synthetic-private-device', transportId: '1' },
      ];
      try {
        assert.equal(
          (await ingestion.refresh(f.db.readDurable().meta.revision)).outcome,
          'COMMITTED',
        );
      } finally {
        delete globalThis.__inputIssuerFixtureProofs;
      }
      assert.equal(ingestion.snapshot().devices[0].verification, 'VERIFIED');
    }

    const ticket = ingestion.metadataTarget(deviceId);
    assert.ok(ticket);
    assert.equal(ingestion.metadataTarget(deviceId), ticket);
    assert.equal(ingestModule.inspectOwnedMetadataTarget({ ...ticket }), null);
    const target = ingestModule.inspectOwnedMetadataTarget(ticket);
    assert.equal(target.target.hostEpoch, f.db.readDurable().meta.host_epoch);
    assert.equal(target.finalCurrent(), true);
    const inputTicket = ingestion.inputTarget(deviceId);
    assert.equal(ingestModule.inspectOwnedInputTarget(ticket), null);
    if (verified) {
      assert(inputTicket);
      assert.equal(ingestion.inputTarget(deviceId), inputTicket);
      assert.equal(ingestModule.inspectOwnedInputTarget({ ...inputTicket }), null);
      assert.equal(ingestModule.inspectOwnedMetadataTarget(inputTicket), null);
      const inputRecord = ingestModule.inspectOwnedInputTarget(inputTicket);
      assert.equal(inputRecord.ownerAnchor, target.ownerAnchor);
      assert.deepEqual(inputRecord.target, target.target);
      assert.throws(() => inputRecord.begin('TAP', 1100));
      const h = inputRecord.begin('HOME', 1100);
      assert.equal(h.handoff, 'QUERY');
      assert.equal((await h.result).kind, 'INPUT_QUERY');
      assert.equal((await h.retirement).status, 'RETIRED');
    } else assert.equal(inputTicket, null);

    const metadata = target.begin('MODEL', 1100);
    assert.equal(metadata.handoff, 'QUERY');
    assert.equal((await metadata.result).remoteExitCode, 0);
    assert.equal((await metadata.retirement).status, 'RETIRED');
    assert.equal((await ingestion.refresh(f.db.readDurable().meta.revision)).outcome, 'COMMITTED');
    assert.equal(target.finalCurrent(), false);
    if (inputTicket) {
      assert.equal(ingestModule.inspectOwnedInputTarget(inputTicket).finalCurrent(), false);
      assert.throws(() => ingestModule.inspectOwnedInputTarget(inputTicket).begin('HOME', 1100));
    }
    const replacement = ingestion.metadataTarget(deviceId);
    assert.ok(replacement);
    assert.notEqual(replacement, ticket);
    assert.notEqual(
      ingestModule.inspectOwnedMetadataTarget(replacement).ownerAnchor,
      target.ownerAnchor,
    );

    fleet = createFleetService({
      registry: () => ingestion.snapshot(),
      availability: () => ingestion.availability(),
      assertOwnedSync: () => {},
      newDiagnostic: () => id(n++),
      audit: async () => 'AVAILABLE',
    });
    const cap = fleet.grant(() => {});
    const response = JSON.parse(
      await fleet.execute(cap, { version: 1, requestId: 'f1', method: 'fleet.get' }),
    );
    assert.equal(response.ok, true);
    assert.equal(response.fleet.availability, 'OBSERVED');
    assert.equal(JSON.stringify(response).includes('synthetic-private-device'), false);
    await server.close();
    assert.equal(ingestion.snapshot(), null);
    assert.equal(ingestion.availability(), 'LIVE_DISCOVERY_UNAVAILABLE');
    assert.equal(
      JSON.parse(await fleet.execute(cap, { version: 1, requestId: 'f2', method: 'fleet.get' }))
        .code,
      'FLEET_UNAVAILABLE',
    );
  } finally {
    await fleet?.close();
    await ingestion?.close();
    await server.close();
    await f.close();
  }
}
test('explicit test-transformed native admission composes actual SQLite and fleet; no actual native provenance is claimed', () =>
  exerciseNativeIssuer());
test('sealed input ticket requires VERIFIED and shares exact opaque projection anchor, not metadata authority', () =>
  exerciseNativeIssuer(true));
test('full transformed ingestion respects pending actual HEALTH lane and callback-free final custody revocation', async () => {
  const { readFileSync } = await import('node:fs'),
    { transformSync } = await import('esbuild');
  const { createHostAdapter } = await import('../src/main/adb-host-adapter.ts');
  const moduleUrl = (source, path) =>
    'data:text/javascript;base64,' +
    Buffer.from(
      transformSync(
        source.replace(
          /from '(\.\.?\/[^']+)'/g,
          (_, relative) => `from '${new URL(relative, path).href}'`,
        ),
        { loader: 'ts', format: 'esm', target: 'es2022' },
      ).code,
    ).toString('base64');
  const serverPath = new URL('../src/main/adb-server-service.ts', import.meta.url);
  const serverSource = readFileSync(serverPath, 'utf8').replace(
    '!isRealHostFactory(factory)',
    'false /* SYNTHETIC_ADMISSION_TEST_ONLY */',
  );
  const serverUrl = moduleUrl(serverSource, serverPath),
    serverModule = await import(serverUrl);
  const ingestPath = new URL('../src/main/adb-discovery-service.ts', import.meta.url);
  const ingestUrl = moduleUrl(
    readFileSync(ingestPath, 'utf8').replace(
      "'./adb-server-service.ts'",
      JSON.stringify(serverUrl),
    ),
    ingestPath,
  );
  const ingestModule = await import(ingestUrl);
  const ownerPath = new URL('../src/main/owned-transport-metadata.ts', import.meta.url);
  // Explicit fixed-clock transform; issuer lookup is the actual shared sealed WeakMap.
  const ownerModule = await import(
    moduleUrl(
      readFileSync(ownerPath, 'utf8')
        .replace("'./adb-discovery-service.ts'", JSON.stringify(ingestUrl))
        .replace('const systemClock = Date.now,', 'const systemClock = () => 1000,'),
      ownerPath,
    )
  );
  const { createDeviceQueueBudget } = await import('../src/main/device-actor.ts');
  for (const mode of ['HEALTH', 'CUSTODY', 'METADATA_BUSY']) {
    let inspection = false,
      blockInspection = false;
    const inspectionGate = deferred();
    let within = false,
      arm = false,
      valid = true,
      held = false,
      discovered = 0,
      closes = 0,
      n = 50000;
    const f = await fixture({
      wrapDb(db) {
        return {
          readDurable: () => db.readDurable(),
          commitDurable(revision, delta, admit) {
            return db.commitDurable(revision, delta, () => {
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
        if (mode === 'CUSTODY' && within && arm) valid = false;
      },
    });
    await f.store.startup();
    const read = Object.freeze({}),
      attempt = Object.freeze({}),
      health = deferred();
    const runtime = Object.freeze({
      release: '37.0.1',
      archiveSha256: 'a'.repeat(64),
      manifestSha256: 'b'.repeat(64),
      installationRevision: 1,
      adbPath: '/synthetic/adb.exe',
    });
    const facts = (observation) =>
      Object.freeze({
        version: 2,
        kind: 'SESSION',
        dispatched: true,
        jobState: observation === 'STOPPED' ? 'RETIRED' : 'LIVE',
        exitCode: observation === 'STOPPED' ? 0 : null,
        endpointState: observation === 'STOPPED' ? 'ABSENT' : 'OWNED',
        observation,
      });
    const custody = {
      acquireRead: async () => {
        held = true;
        return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
      },
      assertRead(t) {
        assert.equal(t, read);
        assert.equal(held, true);
        assert.equal(valid, true);
        assert.equal(inspection, false);
      },
      revalidateRead: async (t) => {
        custody.assertRead(t);
        inspection = true;
        if (blockInspection) await inspectionGate.promise;
        inspection = false;
        return { ok: true, status: 'READ_VERIFIED_ONLY', token: read, observation: runtime };
      },
      releaseRead: async () => {
        held = false;
        return { ok: true, status: 'RETIRED' };
      },
    };
    const adapter = createHostAdapter({
      runtimeCustody: custody,
      nativeProvider: {
        reserveAttempt: () => attempt,
        version: async () => {
          throw Error();
        },
        startForeground: async () => facts('STARTED'),
        health: () => health.promise,
        retire: async () => facts('STOPPED'),
      },
      assertOwnedSync: () => {},
      now: () => 1000,
      diagnosticId: () => id(n++),
    });
    const server = serverModule.createAdbServerService({
      ownerId: id(1),
      expectedInstallationRevision: 1,
      assertOwnedSync: () => {},
      assertCurrentSync: () => {},
      clock: () => 1000,
      newId: () => id(n++),
      audit: async () => 'AVAILABLE',
      createFactory: () => ({
        grant: adapter.grant,
        execute: adapter.execute,
        snapshot: adapter.snapshot,
        assertCurrentSession() {
          assert.equal(adapter.snapshot().state, 'READY');
          assert.equal(adapter.snapshot().busy, false);
          custody.assertRead(read);
        },
        assertDiscoveryEpochCurrent() {
          assert.equal(adapter.snapshot().state, 'READY');
          custody.assertRead(read);
          if (within) arm = true;
        },
        discoveryEpochWitness() {
          return Object.freeze({
            installationRevision: 1,
            get valid() {
              return (
                !inspection &&
                valid &&
                held &&
                adapter.snapshot().state === 'READY' &&
                !adapter.snapshot().closed
              );
            },
          });
        },
        assertRetiredSession() {
          assert.equal(held, false);
        },
        get retired() {
          return adapter.retired;
        },
        close() {
          closes++;
          return adapter.close();
        },
        acquireMetadata() {
          return Object.freeze({
            handoff: 'QUERY',
            result: Promise.resolve(
              Object.freeze({
                version: 1,
                kind: 'METADATA_QUERY',
                status: 'COMPLETE',
                code: 'OK',
                dispatched: true,
                operationRetired: true,
                stdoutBase64: Buffer.from('Model\n').toString('base64'),
                stderrBase64: '',
                remoteExitCode: 0,
                observedAtUtc: 1000,
              }),
            ),
            retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
          });
        },
        acquireDiscovery() {
          discovered++;
          return Object.freeze({
            result: Promise.resolve(
              Object.freeze({
                version: 1,
                kind: 'ACQUISITION',
                status: 'COMPLETE',
                code: 'OK',
                dispatched: true,
                operationRetired: true,
                payloadBase64:
                  mode === 'METADATA_BUSY'
                    ? Buffer.from('synthetic device transport_id:1\n').toString('base64')
                    : '',
                observedAtUtc: 1000,
              }),
            ),
            retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
          });
        },
      }),
    });
    let ingestion, metadataOwner;
    try {
      await server.start();
      const provider = server.discoveryProvider();
      ingestion = ingestModule.createAdbDiscoveryService({
        provider,
        registry: f.store,
        readDurableRevision: () => f.db.readDurable().meta.revision,
        assertOwnedSync: () => {},
        clock: () => 1000,
        newId: () => id(n++),
      });
      if (mode === 'METADATA_BUSY') {
        assert.equal((await ingestion.refresh(1)).outcome, 'COMMITTED');
        const ticket = ingestion.metadataTarget(ingestion.snapshot().devices[0].deviceId);
        const target = ingestModule.inspectOwnedMetadataTarget(ticket);
        metadataOwner = ownerModule.createOwnedTransportMetadataOwner({
          target: ticket,
          budget: createDeviceQueueBudget(),
        });
        assert.ok(target);
        blockInspection = true;
        const pending = server.health();
        await new Promise((r) => setImmediate(r));
        assert.equal(inspection, true);
        assert.equal(target.localBusy(), true);
        assert.equal(target.finalCurrent(), false);
        const busy = await metadataOwner.read('MODEL', 1100);
        assert.equal(busy.actor.outcome, 'NOT_DISPATCHED');
        assert.equal(busy.actor.code, 'BUSY');
        assert.equal(busy.observation, null);
        assert.equal(metadataOwner.snapshot().state, 'ACTIVE');
        assert.equal(closes, 0);
        assert.equal(serverModule.inspectOwnedDiscoveryProvider(provider).revoked, false);
        inspectionGate.resolve();
        health.resolve(facts('HEALTHY'));
        await pending;
        assert.equal(target.localBusy(), false);
        assert.equal(target.finalCurrent(), true);
        const query = await metadataOwner.read('MODEL', 1100);
        assert.equal(query.actor.outcome, 'OBSERVED');
        assert.equal(query.observation.metadata.stale, false);
        valid = false;
        assert.equal(target.finalCurrent(), false);
        const revoked = await metadataOwner.read('MODEL', 1100);
        assert.equal(revoked.observation, null);
        assert.equal(metadataOwner.snapshot().observations.MODEL.metadata.stale, true);
      } else if (mode === 'HEALTH') {
        blockInspection = true;
        const pending = server.health();
        await new Promise((r) => setImmediate(r));
        assert.equal(inspection, true);
        assert.equal(adapter.snapshot().state, 'READY');
        const refused = await ingestion.refresh(1);
        assert.equal(refused.code, 'PROVIDER_FAILED');
        assert.equal(discovered, 0);
        assert.equal(closes, 0);
        assert.equal(serverModule.inspectOwnedDiscoveryProvider(provider).revoked, false);
        inspectionGate.resolve();
        health.resolve(facts('HEALTHY'));
        assert.equal((await pending).result.code, 'OK');
        assert.equal((await ingestion.refresh(1)).outcome, 'COMMITTED');
      } else {
        const before = f.db.fingerprint();
        const result = await ingestion.refresh(1);
        assert.equal(arm, true);
        assert.equal(valid, false);
        assert.equal(result.outcome, 'NOT_COMMITTED');
        assert.equal(result.code, 'OWNER_REVOKED');
        assert.equal(f.db.fingerprint(), before);
        assert.equal(ingestion.snapshot(), null);
      }
    } finally {
      inspectionGate.resolve();
      health.resolve(facts('HEALTHY'));
      await metadataOwner?.close();
      await ingestion?.close();
      await server.close();
      await f.close();
    }
  }
});

test('synthetic committed SQLite projection cannot issue native metadata targets', async () => {
  const f = await setup();
  try {
    assert.equal((await f.service.refresh(1)).outcome, 'COMMITTED');
    const projection = f.service.snapshot();
    assert.equal(projection.source, 'SYNTHETIC_TEST');
    for (const device of projection.devices) {
      assert.equal(f.service.metadataTarget(device.deviceId), null);
      assert.equal(f.service.inputTarget(device.deviceId), null);
    }
    const { inspectOwnedMetadataTarget } = await import('../src/main/adb-discovery-service.ts');
    assert.equal(inspectOwnedMetadataTarget(Object.freeze({ ownedMetadataTarget: true })), null);
  } finally {
    await f.cleanup();
  }
});

// Real SQLite/store/ingestion/server WeakMaps; only OS factory recognition and the
// unavailable operator-intent seam are source-transformed. No proof-array injection.
async function associationFixture(options = {}) {
  const { readFileSync } = await import('node:fs');
  const { transformSync } = await import('esbuild');
  const moduleUrl = (s, path) =>
    'data:text/javascript;base64,' +
    Buffer.from(
      transformSync(
        s.replace(/from '(\.\.?\/[^']+)'/g, (_, rel) => `from '${new URL(rel, path).href}'`),
        { loader: 'ts', format: 'esm', target: 'es2022' },
      ).code,
    ).toString('base64');
  const serverPath = new URL('../src/main/adb-server-service.ts', import.meta.url);
  const serverUrl = moduleUrl(
    readFileSync(serverPath, 'utf8').replace(
      '!isRealHostFactory(factory)',
      'false /* SYNTHETIC_NATIVE_ADMISSION */',
    ),
    serverPath,
  );
  const serverModule = await import(serverUrl);
  const ingestPath = new URL('../src/main/adb-discovery-service.ts', import.meta.url);
  let src = readFileSync(ingestPath, 'utf8').replace(
    "'./adb-server-service.ts'",
    JSON.stringify(serverUrl),
  );
  if (options.operator !== false) {
    assert.equal(
      src.split("import { inspectAssociationConfirmation } from './association-confirmation.ts';")
        .length,
      2,
    );
    src = src.replace(
      "import { inspectAssociationConfirmation } from './association-confirmation.ts';",
      'const inspectAssociationConfirmation = (_intent) => globalThis.__associationOperatorFixtures?.get(_intent) ?? null; /* SYNTHETIC_OPERATOR_ONLY */',
    );
  }
  const ingest = await import(moduleUrl(src, ingestPath));
  let time = 1000,
    n = 60000,
    state = 'STOPPED',
    closed = false,
    calls = 0,
    held = null;
  const rows = (tid = '1') => `phone device transport_id:${tid}\nother device transport_id:9\n`;
  let raw = rows();
  let intentCurrent = true,
    owned = true;
  const f = await fixture({
    ...options.dbOptions,
    assertOwnedSync() {
      if (!owned) throw Error('OWNER_REVOKED');
      options.owned?.();
    },
  });
  await f.store.startup();
  const server = serverModule.createAdbServerService({
    ownerId: id(1),
    expectedInstallationRevision: 7,
    assertOwnedSync() {
      if (!owned) throw Error();
    },
    assertCurrentSync() {
      if (!owned) throw Error();
    },
    clock: () => time,
    newId: () => id(n++),
    audit: async () => 'AVAILABLE',
    createFactory: () => ({
      grant: () => Object.freeze({}),
      snapshot: () => Object.freeze({ state, busy: false, closed }),
      execute: async (_c, r) => {
        state = r.operation === 'SERVER_STOP' ? 'STOPPED' : 'READY';
        return Object.freeze({ outcome: 'OBSERVED', code: 'OK', diagnosticId: null });
      },
      assertCurrentSession() {
        if (closed || state !== 'READY') throw Error();
      },
      assertDiscoveryEpochCurrent() {
        if (closed || state !== 'READY') throw Error();
      },
      assertRetiredSession() {
        if (state !== 'STOPPED') throw Error();
      },
      discoveryEpochWitness() {
        return Object.freeze({
          installationRevision: 7,
          get valid() {
            return !closed && owned && state === 'READY';
          },
        });
      },
      get retired() {
        return closed;
      },
      close: async () => {
        closed = true;
        state = 'STOPPED';
        return 'RETIRED';
      },
      acquireDiscovery() {
        calls++;
        if (held) return held;
        return Object.freeze({
          result: Promise.resolve(
            Object.freeze({
              version: 1,
              kind: 'ACQUISITION',
              status: 'COMPLETE',
              code: 'OK',
              dispatched: true,
              operationRetired: true,
              payloadBase64: Buffer.from(raw).toString('base64'),
              observedAtUtc: time,
            }),
          ),
          retirement: retired(),
        });
      },
    }),
  });
  await server.start();
  const service = ingest.createAdbDiscoveryService({
    provider: server.discoveryProvider(),
    registry: f.store,
    readDurableRevision: () => f.db.readDurable().meta.revision,
    assertOwnedSync() {
      if (!owned) throw Error();
    },
    clock: () => time,
    newId: () => id(n++),
  });
  await service.refresh(f.db.readDurable().meta.revision);
  globalThis.__associationOperatorFixtures ??= new WeakMap();
  const operatorMap = globalThis.__associationOperatorFixtures;
  const intent = (handle, mode = 'CURRENT', overrides = {}) => {
    const token = Object.freeze({ associationConfirmation: true }),
      snap = service.associationSnapshot();
    operatorMap.set(
      token,
      Object.freeze({
        handle,
        mode,
        deviceId: snap.deviceId,
        projection: service.snapshot(),
        expectedDurableRevision: f.db.readDurable().meta.revision,
        operatorSession: Object.freeze({}),
        requestId: id(n++),
        attestation: Object.freeze({
          heldHandset: true,
          cableCycle: true,
          sameHistoricalHandset: mode === 'HISTORICAL',
        }),
        finalCurrent: () => intentCurrent,
        ...overrides,
      }),
    );
    return token;
  };
  return {
    f,
    server,
    service,
    rows,
    intent,
    raw(v) {
      raw = v;
    },
    time(v) {
      time = v;
    },
    calls: () => calls,
    setHeld(v) {
      held = v;
    },
    revokeIntent() {
      intentCurrent = false;
    },
    revokeOwner() {
      owned = false;
    },
    async begin(mode = 'CURRENT', deviceId) {
      const chosen = service.associationCandidates()[0];
      assert(chosen);
      return service.beginAssociation({
        mode,
        candidate: chosen.candidate,
        expectedDurableRevision: f.db.readDurable().meta.revision,
        ...(mode === 'HISTORICAL' ? { deviceId } : {}),
      });
    },
    async throughReturn(mode = 'CURRENT', deviceId) {
      const b = await this.begin(mode, deviceId);
      assert.equal(b.receipt.outcome, 'COMMITTED');
      assert(b.handle);
      raw = 'other device transport_id:9\n';
      assert.equal((await service.observeAssociation(b.handle, 'REMOVAL')).outcome, 'COMMITTED');
      raw = rows('2');
      assert.equal((await service.observeAssociation(b.handle, 'RETURN')).outcome, 'COMMITTED');
      return b.handle;
    },
    async close() {
      await service.close();
      await server.close();
      await f.close();
    },
  };
}
test('association CURRENT four stages commit one real SQLite receipt; production operator issuer stays unavailable', async () => {
  for (const operator of [false, true]) {
    const f = await associationFixture({ operator });
    try {
      const handle = await f.throughReturn();
      const before = f.calls(),
        rev = f.f.db.readDurable().meta.revision;
      assert.equal(f.service.associationSnapshot().state, 'AWAIT_CONFIRMATION');
      const denied = await f.service.confirmAssociation(handle, {
        heldHandset: true,
        cableCycle: true,
        sameHistoricalHandset: false,
      });
      assert.equal(denied.code, 'ATTESTATION_REQUIRED');
      assert.equal(f.calls(), before);
      const result = await f.service.confirmAssociation(handle, f.intent(handle));
      if (!operator) {
        assert.equal(result.code, 'ATTESTATION_REQUIRED');
        assert.equal(f.calls(), before);
        assert.equal(f.f.db.readDurable().meta.revision, rev);
        continue;
      }
      assert.equal(result.outcome, 'COMMITTED');
      assert.equal(result.auditHealth, 'AVAILABLE');
      assert.equal(result.projectionCurrent, true);
      assert.equal(f.calls(), before + 1);
      const db = f.f.db.readDurable();
      assert.equal(db.associationReceipts.length, 1);
      assert.equal(db.identityEvidence.length, 1);
      assert.equal(db.identityEvidence[0].identity_sha256, null);
      const receipt = JSON.parse(db.associationReceipts[0].receipt_json);
      assert.equal(receipt.installationRevision, 7);
      assert.equal(receipt.beforeRow.transportId, '1');
      assert.equal(receipt.returnRow.transportId, '2');
      assert.equal(receipt.stages.confirmation.durableRevision, db.meta.revision);
      assert.equal(
        f.service.snapshot().devices.find((d) => d.deviceId === receipt.deviceId).verification,
        'VERIFIED',
      );
      assert.equal(
        (await f.service.confirmAssociation(handle, f.intent(handle))).code,
        'INVALID_SEQUENCE',
      );
      assert.equal(db.associationReceipts.length, 1);
    } finally {
      await f.close();
    }
  }
});
test('association HISTORICAL explicitly relinks disconnected history and never derives identity from reused serial', async () => {
  const f = await associationFixture();
  try {
    const deviceId = f.service
      .snapshot()
      .devices.find(
        (d) =>
          d.currentBindingId &&
          f.service.snapshot().bindings.find((b) => b.bindingId === d.currentBindingId)?.serial ===
            'phone',
      ).deviceId;
    f.raw('other device transport_id:9\n');
    await f.service.refresh(f.f.db.readDurable().meta.revision);
    f.raw(f.rows('3'));
    await f.service.refresh(f.f.db.readDurable().meta.revision);
    assert.equal(f.service.associationCandidates()[0].eligibility, 'HISTORICAL');
    const b = await f.begin('HISTORICAL', deviceId);
    assert.equal(b.receipt.outcome, 'COMMITTED');
    f.raw('other device transport_id:9\n');
    await f.service.observeAssociation(b.handle, 'REMOVAL');
    f.raw(f.rows('4'));
    await f.service.observeAssociation(b.handle, 'RETURN');
    assert.equal(
      (await f.service.confirmAssociation(b.handle, f.intent(b.handle, 'CURRENT'))).code,
      'ATTESTATION_REQUIRED',
    );
    const r = await f.service.confirmAssociation(b.handle, f.intent(b.handle, 'HISTORICAL'));
    assert.equal(r.outcome, 'COMMITTED');
    const receipt = JSON.parse(f.f.db.readDurable().associationReceipts[0].receipt_json);
    assert.equal(receipt.mode, 'HISTORICAL');
    assert.equal(receipt.priorBindingId, null);
    assert.equal(receipt.deviceId, deviceId);
  } finally {
    await f.close();
  }
});
test('association refuses changed other row, reused tid, changed serial and missing return before reconciliation', async () => {
  for (const [phase, raw, code] of [
    ['REMOVAL', 'other offline transport_id:9\n', 'OTHER_ROWS_CHANGED'],
    ['REMOVAL', 'phone device transport_id:1\nother device transport_id:9\n', 'TARGET_NOT_REMOVED'],
    ['RETURN', 'phone device transport_id:1\nother device transport_id:9\n', 'RETURN_NOT_UNIQUE'],
    [
      'RETURN',
      'different device transport_id:2\nother device transport_id:9\n',
      'RETURN_NOT_UNIQUE',
    ],
    ['RETURN', 'other device transport_id:9\n', 'RETURN_NOT_UNIQUE'],
  ]) {
    const f = await associationFixture();
    try {
      const b = await f.begin();
      if (phase === 'RETURN') {
        f.raw('other device transport_id:9\n');
        await f.service.observeAssociation(b.handle, 'REMOVAL');
      }
      const before = f.f.db.readDurable().meta.revision;
      f.raw(raw);
      const r = await f.service.observeAssociation(b.handle, phase);
      assert.equal(r.code, code);
      assert.equal(r.outcome, 'NOT_COMMITTED');
      assert.equal(f.f.db.readDurable().meta.revision, before);
      assert.equal(f.service.snapshot(), null);
      assert.equal(f.f.db.readDurable().associationReceipts.length, 0);
    } finally {
      await f.close();
    }
  }
});
test('association final fresh observation and sealed intent CAS refuse stale confirmation without proof COMMIT', async () => {
  for (const change of ['rows', 'intent', 'owner']) {
    const f = await associationFixture();
    try {
      const handle = await f.throughReturn();
      const token = f.intent(handle);
      const before = f.f.db.readDurable().meta.revision;
      if (change === 'rows') f.raw('phone device transport_id:2\nother offline transport_id:9\n');
      if (change === 'intent') f.revokeIntent();
      if (change === 'owner') f.revokeOwner();
      const r = await f.service.confirmAssociation(handle, token);
      assert.equal(r.outcome, 'NOT_COMMITTED');
      assert.equal(f.f.db.readDurable().meta.revision, before);
      assert.equal(f.f.db.readDurable().associationReceipts.length, 0);
    } finally {
      await f.close();
    }
  }
});
test('association idle expiry/cancel is known no-effect; no server cleanup or invented query uncertainty', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await associationFixture();
  try {
    const b = await f.begin();
    const calls = f.calls();
    t.mock.timers.tick(120000);
    assert.equal(f.service.associationSnapshot().code, 'DEADLINE');
    assert.equal(f.calls(), calls);
    assert.equal(f.server.snapshot().state, 'READY');
    assert.equal(f.service.retired, false);
    assert.equal(
      (await f.service.observeAssociation(b.handle, 'REMOVAL')).outcome,
      'NOT_COMMITTED',
    );
  } finally {
    await f.close();
    t.mock.timers.reset();
  }
});
test('association cancellation retains pending actual native work and blocks a new ceremony', async () => {
  const f = await associationFixture();
  const gate = deferred(),
    retirement = deferred();
  try {
    const b = await f.begin();
    f.setHeld(Object.freeze({ result: gate.promise, retirement: retirement.promise }));
    const pending = f.service.observeAssociation(b.handle, 'REMOVAL');
    await new Promise((r) => setImmediate(r));
    f.service.cancelAssociation(b.handle);
    assert.equal(f.service.associationSnapshot().state, 'CANCELLED');
    assert.equal((await f.service.beginAssociation({})).receipt.code, 'BUSY');
    const close = f.service.close();
    assert.equal(f.service.retired, false);
    gate.resolve(
      Object.freeze({
        version: 1,
        kind: 'ACQUISITION',
        status: 'COMPLETE',
        code: 'OK',
        dispatched: true,
        operationRetired: true,
        payloadBase64: Buffer.from('other device transport_id:9\n').toString('base64'),
        observedAtUtc: 1000,
      }),
    );
    retirement.resolve(Object.freeze({ status: 'RETIRED' }));
    assert.equal((await pending).outcome, 'NOT_COMMITTED');
    assert.equal((await close).status, 'RETIRED');
    assert.equal(f.f.db.readDurable().associationReceipts.length, 0);
  } finally {
    await f.close();
  }
});
test('association known final COMMIT survives held RESULT expiry without fresh authority or fabricated rollback', async () => {
  const audit = deferred();
  let hold = false,
    entered = false;
  const f = await associationFixture({
    dbOptions: {
      audit: async (e) => {
        if (hold && e.phase === 'RESULT') {
          entered = true;
          return audit.promise;
        }
        return 'AVAILABLE';
      },
    },
  });
  try {
    const handle = await f.throughReturn();
    const token = f.intent(handle);
    hold = true;
    const pending = f.service.confirmAssociation(handle, token);
    while (!entered) await new Promise((r) => setImmediate(r));
    assert.equal(f.f.db.readDurable().associationReceipts.length, 1);
    const closing = f.service.close();
    assert.equal(f.service.retired, false);
    audit.resolve('DEGRADED');
    const result = await pending;
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.projectionCurrent, false);
    assert.equal(result.auditHealth, 'DEGRADED');
    assert.equal(f.f.db.readDurable().associationReceipts.length, 1);
    assert.equal((await closing).status, 'RETIRED');
    assert.equal(f.service.associationSnapshot().state, 'CLOSED');
  } finally {
    audit.resolve('DEGRADED');
    await f.close();
  }
});
test('association failed final INTENT is NOT_COMMITTED and does not insert identity or receipt', async () => {
  let fail = false;
  const f = await associationFixture({
    dbOptions: { audit: async (e) => (fail && e.phase === 'INTENT' ? 'DEGRADED' : 'AVAILABLE') },
  });
  try {
    const handle = await f.throughReturn();
    const before = f.f.db.readDurable().meta.revision;
    fail = true;
    const result = await f.service.confirmAssociation(handle, f.intent(handle));
    assert.equal(result.outcome, 'NOT_COMMITTED');
    assert.equal(result.code, 'AUDIT_UNAVAILABLE');
    assert.equal(result.auditHealth, 'DEGRADED');
    assert.equal(f.f.db.readDurable().meta.revision, before);
    assert.equal(f.f.db.readDurable().identityEvidence.length, 0);
    assert.equal(f.f.db.readDurable().associationReceipts.length, 0);
  } finally {
    await f.close();
  }
});
test('association candidates and handles cannot be forged or minted by synthetic discovery', async () => {
  const f = await associationFixture();
  try {
    const candidate = f.service.associationCandidates()[0];
    const before = f.calls();
    assert.equal(
      (
        await f.service.beginAssociation({
          mode: 'CURRENT',
          candidate: { ...candidate.candidate },
          expectedDurableRevision: f.f.db.readDurable().meta.revision,
        })
      ).receipt.code,
      'STALE_CANDIDATE',
    );
    assert.equal(f.calls(), before);
    const b = await f.begin();
    assert.equal(
      (await f.service.observeAssociation({ ...b.handle }, 'REMOVAL')).code,
      'INVALID_REQUEST',
    );
    assert.equal(f.calls(), before + 1);
    f.service.cancelAssociation(b.handle);
    assert.equal(f.server.snapshot().state, 'READY');
  } finally {
    await f.close();
  }
  const synthetic = await setup();
  try {
    await synthetic.service.refresh(1);
    assert.deepEqual(synthetic.service.associationCandidates(), []);
    assert.equal((await synthetic.service.beginAssociation({})).receipt.code, 'POLICY_DENIED');
  } finally {
    await synthetic.cleanup();
  }
});

test('association reserves actual drain before last owned callback can reenter close', async () => {
  let arm = false,
    close,
    inside,
    f;
  f = await associationFixture({
    owned() {
      if (arm) {
        arm = false;
        close = f.service.close();
        inside = f.service.retired;
      }
    },
  });
  try {
    const b = await f.begin();
    f.raw('other device transport_id:9\n');
    const calls = f.calls(),
      before = f.f.db.readDurable().meta.revision;
    arm = true;
    const pending = f.service.observeAssociation(b.handle, 'REMOVAL');
    assert.equal(inside, false);
    assert.equal((await pending).outcome, 'NOT_COMMITTED');
    assert.equal((await close).status, 'RETIRED');
    assert.equal(f.calls(), calls);
    assert.equal(f.f.db.readDurable().meta.revision, before);
  } finally {
    await f.close();
  }
});
test('association original deadline during actual final RESULT drain preserves confirmed commit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = deferred();
  let hold = false,
    entered = false;
  const f = await associationFixture({
    dbOptions: {
      audit: async (e) => {
        if (hold && e.phase === 'RESULT') {
          entered = true;
          return gate.promise;
        }
        return 'AVAILABLE';
      },
    },
  });
  try {
    const handle = await f.throughReturn();
    hold = true;
    const pending = f.service.confirmAssociation(handle, f.intent(handle));
    while (!entered) await new Promise((r) => setImmediate(r));
    assert.equal(f.f.db.readDurable().associationReceipts.length, 1);
    t.mock.timers.tick(120000);
    assert.equal(f.service.associationSnapshot().code, 'DEADLINE');
    assert.equal((await f.service.beginAssociation({})).receipt.code, 'BUSY');
    gate.resolve('AVAILABLE');
    const result = await pending;
    assert.equal(result.outcome, 'COMMITTED');
    assert.equal(result.projectionCurrent, false);
    assert.equal(result.auditHealth, 'AVAILABLE');
    assert.equal(f.f.db.readDurable().associationReceipts.length, 1);
  } finally {
    gate.resolve('AVAILABLE');
    await f.close();
    t.mock.timers.reset();
  }
});
