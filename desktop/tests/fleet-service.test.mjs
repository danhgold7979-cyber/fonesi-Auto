import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleetService } from '../src/main/fleet-service.ts';
import { emptyRegistry, reconcileRegistry } from '../src/main/transport-registry.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = { version: 1, requestId: 'f1', method: 'fleet.get' };
const selection = (ids = [], active = null, groups = []) => ({
  selectedDeviceIds: ids,
  activeDeviceId: active,
  groups,
});
const replace = (revision, value) => ({
  version: 1,
  requestId: 'f2',
  method: 'fleet.selection.replace',
  expectedRevision: revision,
  selection: value,
});
const parse = async (promise) => JSON.parse(await promise);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
// Supplied ADB_DISCOVERY-tagged facts test engine admission only, not actual ADB acquisition.
function registry(source = 'ADB_DISCOVERY', previous = emptyRegistry(), sequence = 1) {
  let n = sequence * 10;
  const r = reconcileRegistry(
    previous,
    {
      sequence,
      observedAtUtc: 1000 + sequence,
      source,
      rows: [
        {
          serial: sequence === 1 ? 'private-device-192.0.2.1' : 'private-device-new',
          transportId: '1',
          state: 'OFFLINE',
        },
      ],
      proofs: [],
    },
    {
      nextId: () => id(n++),
      budget: { maxDevices: 256, maxBindings: 4096, maxEvidence: 4096, maxClaims: 256 },
    },
  );
  assert.equal(r.ok, true);
  return r.snapshot;
}
function fixture(overrides = {}) {
  let snapshot = emptyRegistry(),
    available = 'BINARY_UNAVAILABLE',
    events = [];
  const service = createFleetService({
    registry: () => snapshot,
    assertOwnedSync: () => {},
    newDiagnostic: () => id(900),
    audit: async (e) => {
      events.push(e);
      return 'AVAILABLE';
    },
    availability: () => available,
    ...overrides,
  });
  const cap = service.grant(() => {});
  return {
    service,
    cap,
    events,
    set: (r) => {
      snapshot = r;
      available = 'OBSERVED';
    },
    read: () => parse(service.execute(cap, read)),
    replace: (revision, s) => parse(service.execute(cap, replace(revision, s))),
  };
}
test('production empty projection truthful, capability private, labels redact supplied serial', async () => {
  const f = fixture();
  const empty = await f.read();
  assert.equal(empty.outcome, 'OBSERVED');
  assert.equal(empty.fleet.reason, 'BINARY_UNAVAILABLE');
  assert.deepEqual(empty.fleet.devices, []);
  assert.equal(
    (await parse(f.service.execute({ fleetCaller: true }, read))).code,
    'UNTRUSTED_SENDER',
  );
  f.set(registry());
  const row = (await f.read()).fleet.devices[0];
  assert.equal(row.label, 'Device 0001');
  assert.equal(row.state, 'OFFLINE');
  assert.ok(!JSON.stringify(row).includes('private-device'));
  assert.ok(Object.isFrozen(f.service));
});
test('recognized synthetic and mixed history cannot be relabeled as production', async () => {
  const f = fixture(),
    synthetic = registry('SYNTHETIC_TEST');
  f.set(synthetic);
  assert.equal((await f.read()).code, 'FLEET_UNAVAILABLE');
  const mixed = registry('ADB_DISCOVERY', synthetic, 2);
  assert.equal(mixed.source, 'ADB_DISCOVERY');
  assert.ok(mixed.bindings.some((b) => b.source === 'SYNTHETIC_TEST'));
  f.set(mixed);
  assert.equal((await f.read()).code, 'FLEET_UNAVAILABLE');
  f.set({ ...registry() });
  assert.equal((await f.read()).code, 'FLEET_UNAVAILABLE');
});
test('offline membership selection is CAS process-local, repeated equal request UNCHANGED', async () => {
  const f = fixture(),
    r = registry();
  f.set(r);
  const wanted = selection([r.devices[0].deviceId], r.devices[0].deviceId, [
    { groupId: id(50), deviceIds: [r.devices[0].deviceId] },
  ]);
  assert.equal((await f.replace(0, wanted)).outcome, 'APPLIED');
  assert.equal((await f.replace(1, wanted)).outcome, 'UNCHANGED');
  assert.equal((await f.replace(0, selection())).code, 'CONFLICT');
  assert.equal((await f.replace(1, selection([id(777)]))).code, 'MEMBER_UNAVAILABLE');
  assert.equal((await f.read()).fleet.selection.revision, 1);
  assert.deepEqual(
    f.events.filter((e) => e.phase === 'INTENT').map((e) => e.operation),
    ['SELECT', 'SELECT'],
  );
});
test('failed intent never replaces and result audit failure preserves APPLIED', async () => {
  let fail = 'INTENT';
  const f = fixture({ audit: async (e) => (e.phase === fail ? 'DEGRADED' : 'AVAILABLE') }),
    r = registry();
  f.set(r);
  assert.equal((await f.replace(0, selection([r.devices[0].deviceId]))).code, 'INTERNAL_FAILURE');
  assert.equal((await f.read()).fleet.selection.revision, 0);
  fail = 'RESULT';
  const applied = await f.replace(0, selection([r.devices[0].deviceId]));
  assert.equal(applied.outcome, 'APPLIED');
  assert.equal(applied.auditHealth, 'DEGRADED');
  assert.equal((await f.read()).fleet.selection.revision, 1);
});
test('bounded lane, immutable caller snapshot, membership recaptured after intent', async () => {
  const hold = deferred();
  let delay = true;
  const f = fixture({
      audit: async (e) => (e.phase === 'INTENT' && delay ? hold.promise : 'AVAILABLE'),
    }),
    r = registry();
  f.set(r);
  const wanted = selection([r.devices[0].deviceId]);
  const pending = f.replace(0, wanted);
  wanted.selectedDeviceIds[0] = id(800);
  assert.equal((await f.read()).code, 'BUSY');
  delay = false;
  hold.resolve('AVAILABLE');
  assert.equal((await pending).outcome, 'APPLIED');
  assert.deepEqual((await f.read()).fleet.selection.selectedDeviceIds, [r.devices[0].deviceId]);
  const gate = deferred();
  const g = fixture({ audit: async (e) => (e.phase === 'INTENT' ? gate.promise : 'AVAILABLE') });
  g.set(r);
  const other = g.replace(0, selection([r.devices[0].deviceId]));
  g.set(emptyRegistry());
  gate.resolve('AVAILABLE');
  assert.equal((await other).code, 'MEMBER_UNAVAILABLE');
});
test('synchronous final dependency callback revocation fences CAS', async () => {
  let revoke = false,
    service,
    cap;
  const f = fixture({
    availability: () => {
      if (revoke) service.revoke(cap);
      return 'OBSERVED';
    },
  });
  service = f.service;
  cap = f.cap;
  f.set(registry());
  revoke = true;
  assert.equal((await f.replace(0, selection([id(10)]))).code, 'SESSION_REVOKED');
  const fresh = service.grant(() => {});
  revoke = false;
  assert.equal((await parse(service.execute(fresh, read))).fleet.selection.revision, 0);
});
test('reply revocation after applied result does not undo CAS; close awaits actual operation', async () => {
  const gate = deferred();
  let results = 0;
  const f = fixture({
    audit: async (e) => (e.phase === 'RESULT' && ++results === 1 ? gate.promise : 'AVAILABLE'),
  });
  f.set(registry());
  const pending = f.replace(0, selection([id(10)]));
  await Promise.resolve();
  await Promise.resolve();
  f.service.revoke(f.cap);
  gate.resolve('AVAILABLE');
  assert.equal((await pending).code, 'SESSION_REVOKED');
  const cap = f.service.grant(() => {});
  assert.equal((await parse(f.service.execute(cap, read))).fleet.selection.revision, 1);
  const hold = deferred(),
    g = fixture({ audit: async () => hold.promise });
  const readPending = g.read();
  let closed = false;
  const closing = g.service.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  hold.resolve('AVAILABLE');
  assert.equal((await readPending).code, 'SESSION_REVOKED');
  await closing;
  assert.equal(closed, true);
});
test('allocator, descriptors and thrown callbacks reject without echo or mutation', async () => {
  for (const newDiagnostic of [
    () => null,
    () => {
      throw Error('secret');
    },
    () => id(900) + '\n',
  ]) {
    const f = fixture({ newDiagnostic });
    const v = await f.read();
    assert.equal(v.code, 'INTERNAL_FAILURE');
    assert.equal(v.diagnosticId, null);
  }
  const f = fixture();
  let calls = 0;
  const bad = { ...read };
  Object.defineProperty(bad, 'method', {
    get() {
      calls++;
      return 'fleet.get';
    },
  });
  assert.equal((await parse(f.service.execute(f.cap, bad))).code, 'INVALID_SHAPE');
  assert.equal(calls, 0);
  const denied = fixture({
    assertOwnedSync: () => {
      throw Error('private');
    },
  });
  assert.equal((await denied.read()).code, 'OWNER_REVOKED');
});

test('availability and final admission registry changes cannot select foreign old membership', async () => {
  for (const which of ['availability', 'admission']) {
    let current = registry(),
      enabled = false,
      service,
      cap;
    const serviceOptions = {
      registry: () => current,
      assertOwnedSync: () => {},
      newDiagnostic: () => id(900),
      audit: async () => 'AVAILABLE',
      availability: () => {
        if (enabled && which === 'availability') current = emptyRegistry();
        return 'OBSERVED';
      },
    };
    service = createFleetService(serviceOptions);
    cap = service.grant(() => {
      if (enabled && which === 'admission') current = emptyRegistry();
    });
    enabled = true;
    const r = await parse(service.execute(cap, replace(0, selection([id(10)]))));
    assert.equal(r.ok, false);
    enabled = false;
    current = registry();
    const observed = await parse(service.execute(cap, read));
    assert.equal(observed.fleet.selection.revision, 0);
  }
});
test('actual FleetService to ApplicationLogger and owned LogStore faults preserve intent/result truth', async () => {
  const { ApplicationLogger } = await import('../src/main/logging.ts');
  const { LogStore } = await import('../src/main/log-store.ts');
  const fs = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { randomUUID } = await import('node:crypto');
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  try {
    fs.mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(base), resolve(base));
  for (const phase of ['INTENT', 'RESULT'])
    for (const point of ['append', 'sync']) {
      const root = fs.mkdtempSync(join(base, 'fleet-compose-')),
        token = randomUUID();
      fs.writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
      let store,
        service,
        armed = false;
      try {
        store = await LogStore.open(
          { root: join(root, 'logs-main'), parentToken: token },
          '2026-11-01T03:00:00.000Z',
          (p) => {
            if (armed && p === point) throw Error('PRIVATE_CANARY');
          },
        );
        const logger = new ApplicationLogger(
          store,
          () => '2026-11-01T03:00:00.000Z',
          () => {},
          () => id(900),
        );
        const r = registry();
        service = createFleetService({
          registry: () => r,
          assertOwnedSync: () => {},
          newDiagnostic: () => id(900),
          availability: () => 'OBSERVED',
          audit: async (fields) => {
            if (fields.phase === phase) armed = true;
            return logger.fleetAudit(fields);
          },
        });
        const cap = service.grant(() => {});
        const changed = await parse(
          service.execute(cap, replace(0, selection([r.devices[0].deviceId]))),
        );
        assert.equal(changed.auditHealth, 'DEGRADED');
        assert.equal(changed.ok, phase === 'RESULT');
        if (phase === 'RESULT') assert.equal(changed.outcome, 'APPLIED');
        else assert.equal(changed.code, 'INTERNAL_FAILURE');
        const after = await parse(service.execute(cap, read));
        assert.equal(after.fleet.selection.revision, phase === 'RESULT' ? 1 : 0);
        for (const name of fs
          .readdirSync(join(root, 'logs-main'))
          .filter((n) => n.endsWith('.jsonl')))
          assert.ok(
            !fs.readFileSync(join(root, 'logs-main', name), 'utf8').includes('PRIVATE_CANARY'),
          );
      } finally {
        await service?.close();
        await store?.close();
        assert.equal(fs.realpathSync(root), root);
        assert.equal(fs.readFileSync(join(root, '.owner'), 'utf8'), token);
        fs.rmSync(root, { recursive: true, force: false });
      }
    }
});

test('last registry callback external owner loss is fenced before CAS', async () => {
  let owner = true,
    calls = 0;
  const r = emptyRegistry();
  const service = createFleetService({
    registry: () => {
      if (++calls === 3) owner = false;
      return r;
    },
    assertOwnedSync: () => {
      if (!owner) throw Error('OWNED_LEASE_LOST');
    },
    newDiagnostic: () => id(900),
    audit: async () => 'AVAILABLE',
    availability: () => 'BINARY_UNAVAILABLE',
  });
  const cap = service.grant(() => {});
  const result = await parse(
    service.execute(cap, replace(0, selection([], null, [{ groupId: id(50), deviceIds: [] }]))),
  );
  assert.equal(result.code, 'OWNER_REVOKED');
  owner = true;
  const observed = await parse(service.execute(cap, read));
  assert.equal(observed.fleet.selection.revision, 0);
});
