import { createFleetService } from '../src/main/fleet-service.ts';
import { emptyRegistry, reconcileRegistry } from '../src/main/transport-registry.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApplicationLogger } from '../src/main/logging.ts';
import { stripTypeScriptTypes } from 'node:module';
import { createOwnedTransportMetadataOwner as production } from '../src/main/owned-transport-metadata.ts';
import { createDeviceQueueBudget } from '../src/main/device-actor.ts';
// Explicit test-transformed private lookup only. This models issuer facts, never native proof.
const records = new WeakMap();
globalThis.__syntheticMetadataRecords = records;
const inputRecords = new WeakMap();
globalThis.__syntheticInputRecords = inputRecords;
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
source = source.replace(
  /import\s*\{\s*inspectOwnedInputTarget\s*,?\s*\}\s*from '\.\/adb-discovery-service\.ts';/,
  'const inspectOwnedInputTarget=(v)=>globalThis.__syntheticInputRecords.get(v)??null;',
);
source = source.replace(
  /from '(\.\.?\/[^']+)'/g,
  (_m, p) => `from '${new URL(p, sourceUrl).href}'`,
);
const { createOwnedTransportMetadataOwner: create, createOwnedDeviceTransportOwner: combined } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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

// Actual owned LogStore + actual actor/core. ONLY issuer lookups/native facts are transformed synthetic seams.
async function combinedFixture(extra = {}) {
  const base = new URL('../.test-output/', import.meta.url);
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(realpathSync(base), 'combined-input-')),
    token = randomUUID();
  writeFileSync(join(root, '.owner'), token, { flag: 'wx' });
  const logger = await ApplicationLogger.open(
    { root: join(root, 'logs-main'), parentToken: token },
    () => {},
  );
  const metadataTicket = Object.freeze({ metadata: true }),
    inputTicket = Object.freeze({ input: true }),
    anchor = Object.freeze({});
  let next = 101;
  const row = { serial: 'synthetic-private', transportId: '7', state: 'DEVICE' };
  const options = {
    nextId: () => id(next++),
    budget: { maxDevices: 256, maxBindings: 4096, maxEvidence: 4096, maxClaims: 256 },
  };
  const first = reconcileRegistry(
    emptyRegistry(),
    { sequence: 1, observedAtUtc: 1000, source: 'ADB_DISCOVERY', rows: [row], proofs: [] },
    options,
  );
  assert.equal(first.ok, true);
  const device = first.snapshot.devices[0];
  const verified = reconcileRegistry(
    first.snapshot,
    {
      sequence: 2,
      observedAtUtc: 1000,
      source: 'ADB_DISCOVERY',
      rows: [row],
      proofs: [
        {
          serial: row.serial,
          transportId: row.transportId,
          deviceId: device.deviceId,
          evidenceId: id(900),
        },
      ],
    },
    options,
  );
  assert.equal(verified.ok, true);
  const projection = verified.snapshot;
  const target = Object.freeze({
    deviceId: device.deviceId,
    bindingId: projection.devices[0].currentBindingId,
    generation: projection.devices[0].generation,
    serial: row.serial,
    transportId: row.transportId,
    hostEpoch: 1,
    registryRevision: projection.revision,
    observationSequence: 2,
  });
  const fleet = createFleetService({
    registry: () => projection,
    assertOwnedSync: () => {},
    newDiagnostic: () => randomUUID(),
    audit: async () => 'AVAILABLE',
    availability: () => 'OBSERVED',
    finalProjection: (p) => p === projection,
  });
  const fleetCap = fleet.grant(() => {});
  let selectionRevision = 0;
  async function select(active = target.deviceId) {
    const result = JSON.parse(
      await fleet.execute(fleetCap, {
        version: 1,
        requestId: 'f1',
        method: 'fleet.selection.replace',
        expectedRevision: selectionRevision,
        selection: { selectedDeviceIds: [target.deviceId], activeDeviceId: active, groups: [] },
      }),
    );
    assert.equal(result.ok, true);
    selectionRevision = result.fleet.selection.revision;
  }
  await select();
  function intent() {
    const r = fleet.captureActiveInputIntent({
      expectedSelectionRevision: selectionRevision,
      expectedRegistryRevision: projection.revision,
      deviceId: target.deviceId,
    });
    assert.equal(r.ok, true);
    return r.intent;
  }
  const calls = [];
  let valid = true;
  const shared = {
    target,
    ownerAnchor: anchor,
    projection,
    current() {
      if (!valid) throw Error('REVOKED');
    },
    finalCurrent: () => valid,
    localBusy: () => false,
  };
  records.set(
    metadataTicket,
    Object.freeze({
      ...shared,
      begin(field) {
        calls.push(`metadata:${field}`);
        return Object.freeze({
          handoff: 'QUERY',
          result: Promise.resolve(facts(field)),
          retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
        });
      },
      ...extra.metadata,
    }),
  );
  inputRecords.set(
    inputTicket,
    Object.freeze({
      ...shared,
      begin(action) {
        calls.push(`input:${action}`);
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
              observedAtUtc: Date.now(),
            }),
          ),
          retirement: Promise.resolve(Object.freeze({ status: 'RETIRED' })),
        });
      },
      ...extra.input,
    }),
  );
  const budget = createDeviceQueueBudget();
  let owner;
  return {
    root,
    fleet,
    intent,
    select,
    logger,
    metadataTicket,
    inputTicket,
    budget,
    calls,
    build() {
      owner = combined({
        metadataTarget: metadataTicket,
        inputTarget: inputTicket,
        budget,
        logger,
      });
      return owner;
    },
    revoke() {
      valid = false;
    },
    async cleanup() {
      if (owner) assert.equal(await owner.close(), true);
      await logger.close();
      await fleet.close();
      assert.equal(readFileSync(join(root, '.owner'), 'utf8'), token);
      assert.equal(realpathSync(root), root);
      rmSync(root, { recursive: true, force: false });
    },
  };
}
test('combined scopes use one actual actor and actual durable input audit without physical success', async () => {
  const f = await combinedFixture();
  try {
    const owner = f.build();
    assert.deepEqual(Object.keys(owner).sort(), [
      'close',
      'input',
      'metadata',
      'pending',
      'retired',
    ]);
    assert.deepEqual(Object.keys(owner.metadata).sort(), ['read', 'snapshot']);
    assert.deepEqual(Object.keys(owner.input), ['press']);
    const [metadata, input] = await Promise.all([
      owner.metadata.read('MODEL', Date.now() + 10000),
      owner.input.press('HOME', Date.now() + 10000, f.intent()),
    ]);
    assert.equal(metadata.actor.outcome, 'OBSERVED');
    assert.equal(input.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(input.actor.code, 'OK');
    assert.equal(input.actor.diagnosticId, null);
    assert.equal(input.loggingHealth, 'AVAILABLE');
    assert.deepEqual(f.calls, ['metadata:MODEL', 'input:HOME']);
    assert.throws(
      () => create({ target: f.metadataTicket, budget: f.budget }),
      /OWNED_METADATA_OPTIONS/,
    );
    const files = readdirSync(join(f.root, 'logs-main'));
    const rows = files
      .filter((n) => n.endsWith('.ndjson') || n.endsWith('.jsonl'))
      .flatMap((n) =>
        readFileSync(join(f.root, 'logs-main', n), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse),
      );
    const audits = rows
      .filter((r) => r.schemaVersion === 11)
      .sort((a, b) => a.sequence - b.sequence);
    assert.equal(audits.length, 2);
    assert.equal(audits[0].input.phase, 'INTENT');
    assert.equal(audits[1].input.phase, 'RESULT');
    assert.equal(audits[0].input.diagnosticId, audits[1].input.diagnosticId);
    assert.notEqual(audits[0].input.diagnosticId, input.actor.commandId);
    assert.equal(audits[1].input.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.ok(!JSON.stringify(audits).includes('synthetic-private'));
  } finally {
    await f.cleanup();
  }
});
test('combined rejects mismatched/cast tickets and consumes both genuine claims before reentrant callbacks', async () => {
  const f = await combinedFixture({ input: { ownerAnchor: Object.freeze({ different: true }) } });
  try {
    assert.throws(() => f.build(), /OWNED_INPUT_OPTIONS/);
    assert.throws(
      () => create({ target: f.metadataTicket, budget: f.budget }),
      /OWNED_METADATA_OPTIONS/,
    );
    assert.throws(
      () =>
        combined({
          metadataTarget: f.inputTicket,
          inputTarget: f.metadataTicket,
          budget: f.budget,
          logger: f.logger,
        }),
      /OWNED_INPUT_OPTIONS/,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
  const g = await combinedFixture();
  let attempts = 0;
  const original = records.get(g.metadataTicket);
  records.set(
    g.metadataTicket,
    Object.freeze({
      ...original,
      current() {
        attempts++;
        assert.throws(
          () =>
            combined({
              metadataTarget: g.metadataTicket,
              inputTarget: g.inputTicket,
              budget: g.budget,
              logger: g.logger,
            }),
          /OWNED_INPUT_OPTIONS/,
        );
        original.current();
      },
    }),
  );
  try {
    g.build();
    assert.ok(attempts > 0);
  } finally {
    await g.cleanup();
  }
});
test('combined rejects unbranded logger before effects and no live upgrade of consumed metadata ticket', async () => {
  const f = await combinedFixture();
  try {
    assert.throws(
      () =>
        combined({
          metadataTarget: f.metadataTicket,
          inputTarget: f.inputTicket,
          budget: f.budget,
          logger: { write: async () => 'AVAILABLE' },
        }),
      /OWNED_INPUT_OPTIONS/,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
  const g = await combinedFixture();
  let metadata;
  try {
    metadata = create({ target: g.metadataTicket, budget: g.budget });
    assert.throws(() => g.build(), /OWNED_INPUT_OPTIONS/);
    assert.equal(g.calls.length, 0);
  } finally {
    if (metadata) assert.equal(await metadata.close(), true);
    await g.cleanup();
  }
});
test('main facade now imports one combined owner instead of attaching a second input actor', () => {
  const facade = readFileSync(
    new URL('../src/main/discovery-session-service.ts', import.meta.url),
    'utf8',
  );
  assert.match(facade, /createOwnedDeviceTransportOwner/);
  assert.doesNotMatch(facade, /import\s*\{\s*createOwnedTransportMetadataOwner\s*\}/);
});
test('combined closed logger after INTENT reports degraded RESULT instead of retaining old AVAILABLE', async () => {
  const f = await combinedFixture();
  const original = inputRecords.get(f.inputTicket);
  inputRecords.set(
    f.inputTicket,
    Object.freeze({
      ...original,
      begin(action, deadline) {
        void f.logger.close();
        return original.begin(action, deadline);
      },
    }),
  );
  try {
    const owner = f.build();
    const r = await owner.input.press('HOME', Date.now() + 10000, f.intent());
    assert.equal(r.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(r.loggingHealth, 'DEGRADED');
    assert.equal(f.calls.length, 1);
  } finally {
    await f.cleanup();
  }
});

const deferredInput = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
test('actual Fleet intent changed during owned INTENT flush prevents query; replay fails and fresh intent reuses owner', async () => {
  const f = await combinedFixture();
  const entered = deferredInput(),
    release = deferredInput();
  const original = f.logger.store.flush.bind(f.logger.store);
  let hold = true;
  f.logger.store.flush = async () => {
    if (hold) {
      hold = false;
      entered.resolve();
      await release.promise;
    }
    return original();
  };
  try {
    const owner = f.build(),
      intent = f.intent();
    const pending = owner.input.press('HOME', Date.now() + 10000, intent);
    await entered.promise;
    assert.equal(owner.pending, true);
    await f.select(null);
    await f.select();
    release.resolve();
    const result = await pending;
    assert.equal(result.actor.outcome, 'NOT_DISPATCHED');
    assert.equal(result.actor.code, 'STALE_BINDING');
    assert.equal(f.calls.length, 0);
    assert.equal(
      (await owner.input.press('HOME', Date.now() + 10000, intent)).actor.code,
      'INVALID_REQUEST',
    );
    const fresh = await owner.input.press('BACK', Date.now() + 10000, f.intent());
    assert.equal(fresh.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.deepEqual(f.calls, ['input:BACK']);
  } finally {
    release.resolve();
    await f.cleanup();
  }
});
test('logical known receipt while owned RESULT flush held leaves combined pending until actual drain', async () => {
  const f = await combinedFixture(),
    entered = deferredInput(),
    release = deferredInput();
  const original = f.logger.store.flush.bind(f.logger.store);
  let count = 0;
  f.logger.store.flush = async () => {
    if (++count === 2) {
      entered.resolve();
      await release.promise;
    }
    return original();
  };
  try {
    const owner = f.build();
    const pending = owner.input.press('HOME', Date.now() + 1000, f.intent());
    await entered.promise;
    assert.equal(owner.pending, true);
    const receipt = await pending;
    assert.equal(receipt.actor.outcome, 'DISPATCHED_UNCONFIRMED');
    assert.equal(owner.pending, true);
    assert.equal(owner.retired, false);
    release.resolve();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.equal(await owner.close(), true);
    assert.equal(owner.pending, false);
  } finally {
    release.resolve();
    await f.cleanup();
  }
});
test('combined input requires genuine per-request Fleet intent and cannot cast or omit it', async () => {
  const f = await combinedFixture();
  try {
    const owner = f.build();
    for (const token of [undefined, {}, f.metadataTicket, f.inputTicket])
      assert.equal(
        (await owner.input.press('HOME', Date.now() + 10000, token)).actor.outcome,
        'NOT_DISPATCHED',
      );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.cleanup();
  }
});
