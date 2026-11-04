import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { FoundationDatabase } from '../../src/main/foundation-database.ts';
import { createDurableCoordinator } from '../../src/main/durable-coordinator.ts';
import { createRegistryStore, captureRegistryVideoBinding } from '../../src/main/registry-store.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const observation = (sequence = 1, source = 'ADB_DISCOVERY', proofs = []) => ({
  sequence,
  observedAtUtc: 1000,
  source,
  rows: [{ serial: 'synthetic-private-device', transportId: '1', state: 'DEVICE' }],
  proofs,
});
async function fixture(options = {}) {
  const base = fileURLToPath(new URL('../../.test-output', import.meta.url));
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

/** Actual owned SQLite, with explicitly synthetic rows and supplied identity proof. */
export async function registryVideoFixture() {
  const f = await fixture();
  try {
    await f.store.startup();
    assert.equal((await f.store.reconcile(1, observation(1))).outcome, 'COMMITTED');
    const deviceId = f.store.snapshot().devices[0].deviceId;
    assert.equal(
      (
        await f.store.reconcile(
          2,
          observation(2, 'ADB_DISCOVERY', [
            { deviceId, evidenceId: id(999), serial: 'synthetic-private-device', transportId: '1' },
          ]),
        )
      ).outcome,
      'COMMITTED',
    );
    const projection = f.store.snapshot();
    const binding = captureRegistryVideoBinding(f.store, projection, deviceId);
    assert.ok(binding);
    return {
      ...f,
      projection,
      deviceId,
      binding,
      replace: () => f.store.reconcile(f.db.readDurable().meta.revision, observation(3)),
    };
  } catch (e) {
    await f.close();
    throw e;
  }
}
