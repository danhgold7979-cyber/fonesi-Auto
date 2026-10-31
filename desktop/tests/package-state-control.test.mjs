import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FoundationDatabase, statement } from '../src/main/foundation-database.ts';
const require = createRequire(import.meta.url);
const {
  names,
  provenance,
  databaseFacts,
  capture,
  validateState,
} = require('../verification/package-state-control.cjs');
const { write } = require('../verification/package-contract.cjs');
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  if (!fs.existsSync(base)) fs.mkdirSync(base);
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  assert.equal(fs.realpathSync.native(base), base);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(base, 'package-state-')));
  return {
    root,
    close() {
      assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
      assert.equal(fs.realpathSync.native(root), root);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
function marker(root, kind = 'FRESH') {
  const id = randomUUID(),
    receipt = kind === 'RESTORED' ? randomUUID() : null,
    data = path.join(root, kind === 'FRESH' ? 'data-main' : `data-${id}`);
  fs.mkdirSync(data);
  write(path.join(data, '.persistence-owner.json'), {
    version: 1,
    storeId: id,
    kind,
    restoreReceiptId: receipt,
  });
  if (receipt)
    write(path.join(data, '.restore-receipt.json'), {
      version: 1,
      storeId: id,
      restoreReceiptId: receipt,
      quarantined: true,
    });
  return { data, id };
}
test('package state provenance binds exact fresh/restored basename and restore receipt', () => {
  const f = fixture();
  try {
    const a = marker(f.root);
    assert.equal(provenance(a.data).kind, 'FRESH');
    write(path.join(a.data, '.restore-receipt.json'), {});
    assert.throws(() => provenance(a.data));
    const b = marker(f.root, 'RESTORED');
    assert.equal(provenance(b.data).storeId, b.id);
    fs.unlinkSync(path.join(b.data, '.restore-receipt.json'));
    assert.throws(() => provenance(b.data));
  } finally {
    f.close();
  }
});
test('package controller inventory is bounded and refuses symlink aliases', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'a'), '');
    assert.deepEqual(names(f.root), ['a']);
    fs.symlinkSync(path.join(f.root, 'a'), path.join(f.root, 'link'));
    assert.throws(() => names(f.root));
    fs.unlinkSync(path.join(f.root, 'link'));
    for (let i = 0; i < 256; i++) fs.writeFileSync(path.join(f.root, `entry-${i}`), '');
    assert.throws(() => names(f.root));
  } finally {
    f.close();
  }
});
test('package capture requires exact fixed outcome and actual retirement', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'package-capture-first-launch.json');
    const c = {
      process: {
        status: 'SUCCESS',
        exitCode: 0,
        cleanupComplete: true,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      stdout: 'PERSISTENCE_DESKTOP_CLOSED\r\n',
      stderr: '',
    };
    write(file, c);
    assert.equal(capture(f.root, 'first-launch').process.exitCode, 0);
    for (const changed of [
      { ...c, process: { ...c.process, cleanupComplete: false } },
      { ...c, stdout: c.stdout + 'PRIVATE\n' },
      { ...c, process: { ...c.process, status: 'NONZERO_EXIT' } },
    ]) {
      fs.writeFileSync(file, JSON.stringify(changed));
      assert.throws(() => capture(f.root, 'first-launch'));
    }
  } finally {
    f.close();
  }
});
test('private package state rejects redirected root and unknown fields before use', () => {
  const f = fixture();
  try {
    const state = {
      version: 1,
      packageHash: 'a'.repeat(64),
      managedRoot: null,
      storeId: null,
      backup: null,
      original: null,
      settings: null,
      source: null,
      rootA: null,
      rootAWitness: null,
      retainedLaunchId: null,
    };
    assert.equal(validateState(f.root, state), state);
    assert.throws(() => validateState(f.root, { ...state, managedRoot: f.root }));
    assert.throws(() => validateState(f.root, { ...state, extra: true }));
    assert.throws(() =>
      validateState(f.root, {
        ...state,
        backup: { file: '/tmp/backup-' + randomUUID() + '.fonaub' },
      }),
    );
  } finally {
    f.close();
  }
});
test('actual SQLite settings facts exclude native geometry and reject corrupt CURRENT', async () => {
  const f = fixture();
  try {
    const { data, id } = marker(f.root),
      file = path.join(data, 'active.sqlite');
    let db = new FoundationDatabase(file, id);
    await db.migrate(async (version) => {
      const snap = path.join(f.root, `snap-${version}.sqlite`);
      await db.snapshot(snap);
      const copy = new FoundationDatabase(snap, id, true);
      try {
        return { backupId: randomUUID(), schemaVersion: version, fingerprint: copy.fingerprint() };
      } finally {
        copy.close();
      }
    }, 1000);
    db.close();
    const facts = databaseFacts(data, FoundationDatabase, statement);
    assert.equal(facts.version, 3);
    assert.deepEqual(Object.keys(facts.settings), ['theme', 'dockWidth', 'tileWidth']);
    db = new FoundationDatabase(file, id);
    db.connection.exec('PRAGMA ignore_check_constraints=ON');
    statement(
      db.connection,
      "UPDATE app_settings_revision SET tile_width=1 WHERE slot='CURRENT'",
      (s) => s.run(),
    );
    db.close();
    assert.throws(() => databaseFacts(data, FoundationDatabase, statement));
  } finally {
    f.close();
  }
});
