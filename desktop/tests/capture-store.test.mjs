import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { deflateSync } from 'node:zlib';
import { CaptureStore } from '../src/main/capture-store.ts';
import { createDurableCoordinator } from '../src/main/durable-coordinator.ts';
import { snapshotDurable, applyDurableDelta } from '../src/main/durable-contract.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const display = () => ({
  version: 1,
  evidenceId: id(3),
  deviceId: id(1),
  bindingId: id(2),
  generation: 1,
  serial: 'synthetic',
  displayId: 0,
  width: 1,
  height: 1,
  rotation: 0,
  orientationEpoch: 1,
  observedUtc: 100,
  validUntilUtc: 1000,
  source: 'SYNTHETIC_TEST',
});
function crc(data) {
  let n = 0xffffffff;
  for (const b of data) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  type.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc(Buffer.concat([type, data])), data.length + 8);
  return out;
}
function png() {
  const h = Buffer.alloc(13);
  h.writeUInt32BE(1);
  h.writeUInt32BE(1, 4);
  h[8] = 8;
  h[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', h),
    chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const xml = () =>
  Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><hierarchy rotation="0"><node index="0" class="synthetic.View" bounds="[0,0][1,1]"/></hierarchy>',
  );
async function fixture() {
  const parent = realpathSync.native(new URL('../.test-output', import.meta.url));
  const root = await fs.mkdtemp(path.join(parent, 'capture-owned-'));
  const owner = randomUUID();
  await fs.writeFile(path.join(root, '.fixture-owner'), owner, { flag: 'wx' });
  let snapshot = snapshotDurable({
    meta: {
      singleton: 1,
      revision: 0,
      host_epoch: 0,
      last_change_utc: null,
      last_operation_id: null,
      last_change_kind: null,
    },
    devices: [
      {
        device_id: id(1),
        generation: 1,
        display_profile_revision: 1,
        created_utc: 100,
        updated_utc: 100,
        last_seen_utc: 100,
      },
    ],
    bindings: [
      {
        binding_id: id(2),
        device_id: id(1),
        generation: 1,
        serial: 'synthetic',
        transport_id: null,
        source: 'SYNTHETIC_TEST',
        last_state: 'DEVICE',
        observed_utc: 100,
        retired: 0,
      },
    ],
    identityEvidence: [],
    captures: [],
    holds: [],
  });
  assert.ok(snapshot);
  const state = {
    now: 150,
    current: display(),
    connected: true,
    owned: true,
    auditMode: 'AVAILABLE',
    commitCode: null,
    hook: null,
    onCurrent: null,
    onClock: null,
  };
  const audit = [];
  let next = 10;
  const coordinatorOptions = {
    db: {
      readDurable: () => snapshot,
      commitDurable: (revision, delta, admit) => {
        admit();
        if (state.commitCode) return { ok: false, code: state.commitCode };
        if (revision !== snapshot.meta.revision) return { ok: false, code: 'CONFLICT' };
        const value = applyDurableDelta(snapshot, delta);
        assert.ok(value);
        snapshot = value;
        return { ok: true, value };
      },
    },
    assertOwnedSync: () => {
      if (!state.owned) throw Error('revoked');
    },
    clock: () => {
      if (state.onClock) state.onClock();
      return state.now;
    },
    newId: () => id(next++),
    audit: async (fields) => {
      audit.push(fields);
      if (state.hook) await state.hook(fields);
      return state.auditMode;
    },
  };
  let coordinator = createDurableCoordinator(coordinatorOptions);
  const options = {
    coordinator,
    dataRoot: root,
    storeId: id(9),
    assertOwnedSync: () => {
      if (!state.owned) throw Error('revoked');
    },
    clock: () => {
      if (state.onClock) state.onClock();
      return state.now;
    },
    newId: () => id(next++),
    currentDisplay: () => {
      if (state.onCurrent) state.onCurrent();
      return { display: state.current, connected: state.connected };
    },
  };
  const store = new CaptureStore(options);
  return {
    root,
    state,
    audit,
    store,
    coordinator,
    options,
    async reopen() {
      await coordinator.close();
      coordinator = createDurableCoordinator(coordinatorOptions);
      this.coordinator = coordinator;
      this.store = new CaptureStore({ ...options, coordinator });
    },
    snapshot: () => snapshot,
    rev: () => snapshot.meta.revision,
    async close() {
      await coordinator.close();
      assert.equal(await fs.readFile(path.join(root, '.fixture-owner'), 'utf8'), owner);
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const e of entries) {
        const file = path.join(root, e.name);
        if (e.isDirectory()) {
          assert.equal(e.name, 'captures-v1');
          for (const name of await fs.readdir(file)) {
            assert.ok(
              name === '.owner' ||
                /^capture-[0-9a-f-]+\.(png|xml)(\.part)?$/.test(name) ||
                name === 'unknown',
            );
            await fs.unlink(path.join(file, name));
          }
          await fs.rmdir(file);
        } else {
          assert.ok(['.fixture-owner', 'outside'].includes(e.name));
          await fs.unlink(file);
        }
      }
      await fs.rmdir(root);
    },
  };
}
async function reserve(f, kind = 'PNG') {
  const r = await f.store.reserve(f.rev(), { kind, display: display() });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.value !== display().evidenceId);
  return r.value;
}
test('owned PNG and XML reserve/promote/read bind distinct receipt and display identities', async () => {
  const f = await fixture();
  try {
    for (const kind of ['PNG', 'HIERARCHY_XML']) {
      const evidenceId = await reserve(f, kind);
      const raw = kind === 'PNG' ? png() : xml();
      const done = await f.store.complete(f.rev(), evidenceId, raw);
      assert.equal(done.ok, true, JSON.stringify(done));
      assert.equal(done.value.evidenceId, evidenceId);
      const row = f.snapshot().captures.find((r) => r.evidence_id === evidenceId);
      assert.equal(row.display_evidence_id, display().evidenceId);
      assert.equal(row.display_observed_utc, 100);
      assert.equal(row.captured_utc, 150);
      const observed = await f.store.read(evidenceId);
      assert.equal(observed.ok, true, JSON.stringify(observed));
      assert.deepEqual(Buffer.from(observed.data), raw);
      observed.data.fill(0);
      assert.deepEqual(Buffer.from((await f.store.read(evidenceId)).data), raw);
      const names = await fs.readdir(path.join(f.root, 'captures-v1'));
      assert.ok(!names.some((n) => n.endsWith('.part')));
      assert.equal((await fs.lstat(path.join(f.root, 'captures-v1', row.relative_name))).nlink, 1);
    }
  } finally {
    await f.close();
  }
});
test('INTENT failure makes no capture directory or reservation', async () => {
  const f = await fixture();
  try {
    f.state.auditMode = 'DEGRADED';
    const r = await f.store.reserve(0, { kind: 'PNG', display: display() });
    assert.equal(r.result.code, 'AUDIT_UNAVAILABLE');
    assert.equal(f.snapshot().captures.length, 0);
    assert.deepEqual((await fs.readdir(f.root)).sort(), ['.fixture-owner']);
  } finally {
    await f.close();
  }
});
test('malformed bytes do not mutate reservation, stale and rotated reads never grant currentness', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    let r = await f.store.complete(f.rev(), eid, new Uint8Array([1, 2]));
    assert.equal(r.result.code, 'INVALID_CAPTURE');
    assert.equal(f.snapshot().captures[0].state, 'RESERVED');
    r = await f.store.complete(f.rev(), eid, png());
    assert.equal(r.ok, true);
    f.state.current = { ...display(), rotation: 90, orientationEpoch: 2 };
    assert.equal((await f.store.read(eid)).code, 'STALE_CAPTURE');
    const stale = await f.store.read(eid, true);
    assert.equal(stale.artifact.freshness, 'STALE');
  } finally {
    await f.close();
  }
});
test('rotation during awaited commit INTENT produces STALE not current receipt', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    f.state.hook = async (a) => {
      if (a.operation === 'CAPTURE_COMMIT' && a.phase === 'INTENT')
        f.state.current = { ...display(), orientationEpoch: 2, rotation: 90 };
    };
    const r = await f.store.complete(f.rev(), eid, png());
    assert.equal(r.ok, true);
    assert.equal(f.snapshot().captures[0].state, 'STALE');
    assert.equal((await f.store.read(eid)).code, 'STALE_CAPTURE');
  } finally {
    await f.close();
  }
});
test('confirmed DB rollback after file promotion remains filesystem-uncertain until fresh reopen', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    f.state.commitCode = 'WRITE_FAILED';
    const r = await f.store.complete(f.rev(), eid, png());
    assert.equal(r.ok, false);
    assert.equal(r.result.code, 'OUTCOME_UNKNOWN');
    assert.equal(r.value, undefined);
    assert.equal(f.snapshot().captures[0].state, 'RESERVED');
    f.state.commitCode = null;
    await f.reopen();
    const recovered = await f.store.recover(f.rev());
    assert.equal(recovered.ok, true);
    assert.equal(f.snapshot().captures[0].state, 'UNCERTAIN');
    assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
  } finally {
    await f.close();
  }
});
test('holds block seven-day pruning; explicit release then exact two-step deletion retains tombstone', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    const hold = await f.store.addHold(f.rev(), eid, 'OUTCOME_UNKNOWN');
    assert.equal(hold.ok, true);
    f.state.now = 150 + 604800000;
    const denied = await f.store.prune(f.rev(), eid);
    assert.equal(denied.ok, false);
    assert.equal((await fs.readdir(path.join(f.root, 'captures-v1'))).length, 2);
    const release = await f.store.releaseHold(f.rev(), hold.value, 'RECONCILED');
    assert.equal(release.ok, true);
    const deleted = await f.store.prune(f.rev(), eid);
    assert.equal(deleted.ok, true, JSON.stringify(deleted));
    assert.equal(f.snapshot().captures[0].state, 'DELETED');
    assert.equal((await f.store.read(eid, true)).code, 'NOT_FOUND');
    assert.deepEqual(await fs.readdir(path.join(f.root, 'captures-v1')), ['.owner']);
  } finally {
    await f.close();
  }
});
test('unknown file and hardlink ambiguity preserve all bytes and deny routine mutations', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    const root = path.join(f.root, 'captures-v1'),
      row = f.snapshot().captures[0];
    await fs.writeFile(path.join(root, 'unknown'), 'private', { flag: 'wx' });
    assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
    await fs.unlink(path.join(root, 'unknown'));
    await fs.link(path.join(root, row.relative_name), path.join(f.root, 'outside'));
    assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
    assert.equal((await fs.readFile(path.join(f.root, 'outside'))).length, png().length);
  } finally {
    await f.close();
  }
});
test('database-only restore cannot expose missing payload and recovery marks it uncertain', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    const root = path.join(f.root, 'captures-v1');
    for (const name of await fs.readdir(root)) await fs.unlink(path.join(root, name));
    await fs.rmdir(root);
    assert.equal((await f.store.read(eid, true)).ok, false);
    const r = await f.store.recover(f.rev());
    assert.equal(r.ok, true);
    assert.equal(f.snapshot().captures[0].state, 'UNCERTAIN');
  } finally {
    await f.close();
  }
});
test('postcommit RESULT degradation preserves committed receipt; revocation suppresses payload', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    f.state.hook = async (a) => {
      if (a.operation === 'CAPTURE_COMMIT' && a.phase === 'RESULT') {
        f.state.auditMode = 'DEGRADED';
        f.state.owned = false;
      }
    };
    const r = await f.store.complete(f.rev(), eid, png());
    assert.equal(r.ok, true);
    assert.equal(r.result.outcome, 'COMMITTED');
    assert.equal(r.result.auditHealth, 'DEGRADED');
    assert.equal(r.value, undefined);
    assert.equal(f.snapshot().captures[0].state, 'VALIDATED');
  } finally {
    await f.close();
  }
});
test('partial and interrupted two-link promotion recover only UNCERTAIN and never delete evidence', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f),
      row = f.snapshot().captures[0],
      root = path.join(f.root, 'captures-v1'),
      part = path.join(root, row.relative_name + '.part');
    await fs.writeFile(part, png(), { flag: 'wx' });
    await fs.link(part, path.join(root, row.relative_name));
    const r = await f.store.recover(f.rev());
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(f.snapshot().captures[0].state, 'UNCERTAIN');
    assert.equal((await fs.lstat(part)).nlink, 2);
    assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
  } finally {
    await f.close();
  }
});
test('clock rollback defers pruning and uncertain COMMIT latches all artifact access', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    f.state.now = 200;
    await f.store.prune(f.rev(), eid);
    f.state.now = 199;
    assert.equal((await f.store.prune(f.rev(), eid)).code, 'STALE_CAPTURE');
    f.state.now = 201;
    f.state.commitCode = 'OUTCOME_UNKNOWN';
    const held = await f.store.addHold(f.rev(), eid, 'RECONCILIATION');
    assert.equal(held.result.outcome, 'OUTCOME_UNKNOWN');
    assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
    assert.equal((await fs.readdir(path.join(f.root, 'captures-v1'))).length, 2);
  } finally {
    await f.close();
  }
});
test('root mismatch and symlink payload refuse without touching unrelated bytes', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f),
      row = f.snapshot().captures[0],
      root = path.join(f.root, 'captures-v1');
    await fs.writeFile(path.join(f.root, 'outside'), 'unrelated', { flag: 'wx' });
    await fs.symlink(path.join(f.root, 'outside'), path.join(root, row.relative_name));
    assert.equal((await f.store.complete(f.rev(), eid, png())).result.code, 'RECOVERY_REQUIRED');
    assert.equal(await fs.readFile(path.join(f.root, 'outside'), 'utf8'), 'unrelated');
    await fs.unlink(path.join(root, row.relative_name));
    await fs.writeFile(
      path.join(root, '.owner'),
      JSON.stringify({ version: 1, storeId: id(500), kind: 'CAPTURE_STORE' }),
    );
    assert.equal((await f.store.complete(f.rev(), eid, png())).result.code, 'RECOVERY_REQUIRED');
    assert.equal(await fs.readFile(path.join(f.root, 'outside'), 'utf8'), 'unrelated');
  } finally {
    await f.close();
  }
});
test('request getters are rejected and caller byte mutations during audit cannot alter stored bytes', async () => {
  const f = await fixture();
  try {
    let getter = 0;
    const request = {
      kind: 'PNG',
      get display() {
        getter++;
        return display();
      },
    };
    assert.equal((await f.store.reserve(0, request)).result.code, 'INVALID_REQUEST');
    assert.equal(getter, 0);
    const eid = await reserve(f),
      original = png(),
      input = new Uint8Array(original);
    f.state.hook = async (a) => {
      if (a.operation === 'CAPTURE_COMMIT' && a.phase === 'INTENT') input.fill(0);
    };
    assert.equal((await f.store.complete(f.rev(), eid, input)).ok, true);
    assert.deepEqual(Buffer.from((await f.store.read(eid)).data), original);
  } finally {
    await f.close();
  }
});

test('actual partial-file ENOSPC, sync, close and exclusive-link failures retain reservation without receipt', async () => {
  for (const fault of ['write', 'sync', 'close', 'link']) {
    const f = await fixture();
    const originalOpen = fs.open,
      originalLink = fs.link;
    try {
      const eid = await reserve(f),
        row = f.snapshot().captures[0],
        part = path.join(f.root, 'captures-v1', row.relative_name + '.part');
      if (fault === 'link')
        fs.link = async (from, to) => {
          if (from === part) throw Object.assign(Error('private OS detail'), { code: 'EPERM' });
          return originalLink(from, to);
        };
      else
        fs.open = async (...args) => {
          const h = await originalOpen(...args);
          if (args[0] !== part || args[1] !== 'wx') return h;
          return {
            writeFile: async (value) => {
              if (fault === 'write') {
                await h.writeFile(value.subarray(0, 12));
                throw Object.assign(Error('private OS detail'), { code: 'ENOSPC' });
              }
              await h.writeFile(value);
            },
            sync: async () => {
              if (fault === 'sync') throw Error('private sync detail');
              await h.sync();
            },
            close: async () => {
              await h.close();
              if (fault === 'close') throw Error('private close detail');
            },
          };
        };
      syncBuiltinESMExports();
      const result = await f.store.complete(f.rev(), eid, png());
      assert.equal(result.ok, false);
      assert.equal(result.result.code, 'OUTCOME_UNKNOWN');
      assert.equal(result.value, undefined);
      assert.equal(f.snapshot().captures[0].state, 'RESERVED');
      const witness = await originalOpen(part, 'r');
      await witness.close();
      fs.open = originalOpen;
      fs.link = originalLink;
      syncBuiltinESMExports();
      assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
      await f.reopen();
      const recovered = await f.store.recover(f.rev());
      assert.equal(recovered.ok, true);
      assert.equal(f.snapshot().captures[0].state, 'UNCERTAIN');
    } finally {
      fs.open = originalOpen;
      fs.link = originalLink;
      syncBuiltinESMExports();
      await f.close();
    }
  }
});

test('missing DELETE_PENDING file after interrupted tombstone commit finishes only in audited recovery', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    f.state.now = 150 + 604800000;
    f.state.hook = async (a) => {
      if (a.operation === 'PRUNE_COMPLETE' && a.phase === 'INTENT')
        f.state.commitCode = 'WRITE_FAILED';
    };
    const failed = await f.store.prune(f.rev(), eid);
    assert.equal(failed.ok, false);
    assert.equal(f.snapshot().captures[0].state, 'DELETE_PENDING');
    assert.deepEqual(await fs.readdir(path.join(f.root, 'captures-v1')), ['.owner']);
    f.state.hook = null;
    f.state.commitCode = null;
    await f.reopen();
    const recovered = await f.store.recover(f.rev());
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(f.snapshot().captures[0].state, 'DELETED');
    assert.ok(
      f.audit.filter((a) => a.phase === 'INTENT').some((a) => a.operation === 'RECOVER_CLASSIFY'),
    );
  } finally {
    await f.close();
  }
});

test('hold allocator collision is rejected before audit or effect and captured callbacks cannot be replaced', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    const colliding = new CaptureStore({ ...f.options, newId: () => display().evidenceId });
    const before = f.audit.length;
    const denied = await colliding.addHold(f.rev(), eid, 'RECONCILIATION');
    assert.equal(denied.result.code, 'LIMIT_EXCEEDED');
    assert.equal(f.snapshot().holds.length, 0);
    assert.equal(
      f.audit.slice(before).some((a) => a.phase === 'INTENT'),
      false,
    );
    f.options.assertOwnedSync = () => {
      throw Error('replaced');
    };
    f.options.currentDisplay = () => ({ display: null, connected: false });
    assert.equal((await f.store.complete(f.rev(), eid, png())).ok, true);
  } finally {
    await f.close();
  }
});

test('reentrant display callback revocation cannot publish bytes or promote a final name', async () => {
  for (const mode of ['read', 'promote']) {
    const f = await fixture();
    try {
      const eid = await reserve(f);
      if (mode === 'read') {
        await f.store.complete(f.rev(), eid, png());
        f.state.onCurrent = () => {
          f.state.owned = false;
        };
        const denied = await f.store.read(eid);
        assert.equal(denied.ok, false);
        assert.equal(denied.data, undefined);
      } else {
        let calls = 0;
        f.state.onCurrent = () => {
          if (++calls === 2) f.state.owned = false;
        };
        const denied = await f.store.complete(f.rev(), eid, png());
        assert.equal(denied.ok, false);
        assert.equal(denied.result.outcome, 'OUTCOME_UNKNOWN');
        f.state.owned = true;
        f.state.onCurrent = null;
        assert.equal((await f.store.read(eid, true)).code, 'RECOVERY_REQUIRED');
        const names = await fs.readdir(path.join(f.root, 'captures-v1'));
        assert.ok(names.some((n) => n.endsWith('.part')));
        assert.ok(!names.some((n) => n.endsWith('.png')));
      }
    } finally {
      await f.close();
    }
  }
});
test('reentrant clock revocation immediately before prune unlink preserves the admitted file', async () => {
  const f = await fixture();
  try {
    const eid = await reserve(f);
    await f.store.complete(f.rev(), eid, png());
    f.state.now = 150 + 604800000;
    f.state.hook = async (a) => {
      if (a.operation === 'PRUNE_COMPLETE' && a.phase === 'INTENT')
        f.state.onClock = () => {
          f.state.owned = false;
        };
    };
    const denied = await f.store.prune(f.rev(), eid);
    assert.equal(denied.ok, false);
    assert.ok((await fs.readdir(path.join(f.root, 'captures-v1'))).some((n) => n.endsWith('.png')));
  } finally {
    await f.close();
  }
});

test('ambiguous separate final and part files on another row disable routine prune without deletion', async () => {
  const f = await fixture();
  try {
    const a = await reserve(f);
    await f.store.complete(f.rev(), a, png());
    const b = await reserve(f);
    await f.store.complete(f.rev(), b, png());
    const root = path.join(f.root, 'captures-v1'),
      row = f.snapshot().captures.find((r) => r.evidence_id === b);
    await fs.writeFile(path.join(root, row.relative_name + '.part'), png(), { flag: 'wx' });
    const before = (await fs.readdir(root)).sort();
    f.state.now = 150 + 604800000;
    assert.equal((await f.store.prune(f.rev(), a)).ok, false);
    assert.deepEqual((await fs.readdir(root)).sort(), before);
    assert.equal(f.snapshot().captures.find((r) => r.evidence_id === a).state, 'VALIDATED');
  } finally {
    await f.close();
  }
});

test('coordinator close during awaited root setup prevents mkdir and marker creation', async () => {
  const f = await fixture(),
    original = fs.lstat;
  let closing;
  try {
    let calls = 0;
    const target = path.join(f.root, 'captures-v1');
    fs.lstat = async (...args) => {
      if (args[0] === target && ++calls === 3) closing = f.coordinator.close();
      return original(...args);
    };
    syncBuiltinESMExports();
    const denied = await f.store.reserve(f.rev(), { kind: 'PNG', display: display() });
    assert.equal(denied.ok, false);
    assert.equal(denied.result.outcome, 'NOT_COMMITTED');
    assert.equal(denied.result.code, 'OWNER_REVOKED');
    assert.deepEqual(await fs.readdir(f.root), ['.fixture-owner']);
    await closing;
  } finally {
    fs.lstat = original;
    syncBuiltinESMExports();
    await f.close();
  }
});
