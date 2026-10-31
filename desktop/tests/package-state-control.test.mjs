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

test('first-cancel observe composes real owned journal with explicitly synthetic package/native admission', () => {
  const f = fixture();
  try {
    const module = { exports: {} };
    const pkg = path.join(f.root, 'relocated-package');
    const journal = require('../launch/launch-journal.cjs');
    const source = fs.readFileSync(
      new URL('../verification/package-state-control.cjs', import.meta.url),
      'utf8',
    );
    const actualRequire = createRequire(
      new URL('../verification/package-state-control.cjs', import.meta.url),
    );
    const fixtureRequire = (name) => {
      if (name === '../launch/package-admission.cjs')
        return {
          verifyPackage: () => ({ fixtureOnly: true }),
          assertDataOutsidePackage: (pkg, target) =>
            assert.ok(!target.startsWith(`${pkg}${path.sep}`)),
        };
      if (name === path.join(pkg, 'app/build/foundation-database.cjs'))
        return {
          FoundationDatabase: class {
            constructor() {
              assert.fail('cancel must not inspect SQLite');
            }
          },
          statement() {
            assert.fail('cancel must not query SQLite');
          },
        };
      if (name === path.join(pkg, 'app/build/backup-service.cjs'))
        return {
          parseBackupReceipt() {
            assert.fail('cancel has no backup');
          },
        };
      if (name === path.join(pkg, 'app/launch/launch-journal.cjs')) return journal;
      return actualRequire(name);
    };
    // Only this test loader substitutes package/native admission; no production hook exists.
    new Function('require', 'module', source)(fixtureRequire, module);
    const controller = module.exports;
    fs.mkdirSync(pkg);
    fs.writeFileSync(path.join(f.root, '.owner'), randomUUID());
    controller.prepare(f.root, pkg, 'first-cancel');
    const parent = path.join(f.root, 'products', `Fonesi-Auto-${randomUUID()}`);
    fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, '.owner'), randomUUID());
    const launch = path.join(parent, `launch-${randomUUID()}`);
    fs.mkdirSync(launch);
    fs.writeFileSync(path.join(launch, '.owner'), randomUUID());
    const data = path.join(parent, 'data-main');
    const h = journal.plan(parent, launch, data, 'PACKAGE', 'NORMAL', 'a'.repeat(64));
    const process = {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    };
    const stages = ['SETUP', 'PREPARE_PROVISION', 'PROVISION', 'OBSERVE_PROVISION', 'RELEASE'];
    for (const [index, stage] of stages.entries()) {
      const n = index + 1;
      journal.appendIntent(parent, launch, n, stage);
      if (stage === 'SETUP') {
        fs.mkdirSync(data);
        write(path.join(data, '.persistence-owner.json'), {
          version: 1,
          storeId: h.storeId,
          kind: 'FRESH',
          restoreReceiptId: null,
        });
        fs.mkdirSync(path.join(data, '.writer-lock'));
        write(path.join(data, '.writer-lock/owner.json'), {
          version: 1,
          storeId: h.storeId,
          ownerToken: h.ownerToken,
        });
        journal.recordAcquired(parent, launch);
      }
      if (stage === 'RELEASE') {
        write(path.join(data, `.released-${h.ownerToken}.json`), {
          version: 1,
          storeId: h.storeId,
          ownerToken: h.ownerToken,
        });
        fs.unlinkSync(path.join(data, '.writer-lock/owner.json'));
        fs.rmdirSync(path.join(data, '.writer-lock'));
      }
      write(path.join(launch, `capture-${String(n).padStart(2, '0')}.json`), {
        process,
        stdout: stage === 'OBSERVE_PROVISION' ? 'PERSISTENCE_LAUNCH_CANCELLED\n' : 'FIXTURE_ONLY\n',
        stderr: '',
      });
      journal.settle(parent, launch, n);
    }
    const outer = path.join(f.root, 'package-probe-first-cancel');
    fs.mkdirSync(outer);
    const { witness } = require('../verification/package-launch-observer.cjs');
    write(
      path.join(outer, 'observer-provision.json'),
      witness({ stage: 'first-cancel' }, 'provision', {
        closed: true,
        opens: 1,
        confirms: 0,
        cancelled: true,
      }),
    );
    write(path.join(f.root, 'package-capture-first-cancel.json'), {
      process,
      stdout: 'PERSISTENCE_DESKTOP_CANCELLED\r\n',
      stderr: '',
    });
    const result = controller.observe(f.root, pkg, 'first-cancel');
    assert.equal(Object.values(result.cases).every(Boolean), true);
    assert.equal(fs.existsSync(path.join(f.root, 'package-state-first-cancel.json')), true);
  } finally {
    f.close();
  }
});

test('observe failure emits only the fixed boundary diagnostic, never the supplied path', () => {
  const { spawnSync } = require('node:child_process');
  const secret = fileURLToPath(
    new URL('../.test-output/PRIVATE_MISSING_OBSERVE_CANARY', import.meta.url),
  );
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../verification/package-state-control.cjs', import.meta.url)),
      'observe',
      secret,
      path.join(secret, 'relocated-package'),
      'first-cancel',
    ],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 4096 },
  );
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'PACKAGE_STATE_FAILED\n');
  assert.equal(r.stderr, 'PACKAGE_OBSERVE_ADMISSION\nPACKAGE_OBSERVE_ERROR_ENOENT\n');
  assert.equal((r.stdout + r.stderr).includes(secret), false);
});

test('private callback exceptions select fixed diagnostic codes without echo or getter access', () => {
  const { fixedObservationError } = require('../verification/package-state-control.cjs');
  function invoke(callback) {
    try {
      callback();
    } catch (error) {
      return fixedObservationError(error);
    }
  }
  assert.equal(
    invoke(() => {
      throw Error('PRIVATE_PATH_TOKEN_CANARY');
    }),
    'UNCLASSIFIED',
  );
  assert.equal(
    invoke(() => {
      throw Error('RESTORE_SCHEMA');
    }),
    'RESTORE_SCHEMA',
  );
  assert.equal(
    fixedObservationError({
      get message() {
        return assert.fail('getter executed');
      },
    }),
    'UNCLASSIFIED',
  );
  assert.equal(fixedObservationError(Error('restore_schema')), 'UNCLASSIFIED');
});
