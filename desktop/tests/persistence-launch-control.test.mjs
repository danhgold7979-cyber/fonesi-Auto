import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const journal = createRequire(import.meta.url)('../launch/launch-journal.cjs');
const desktop = fileURLToPath(new URL('..', import.meta.url));
const helper = join(desktop, 'launch/persistence-launch-control.cjs');
const environment = { ...process.env };
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
const put = (p, v) => writeFileSync(p, JSON.stringify(v));
function fixture(run, options = {}) {
  const base = join(desktop, '.test-output');
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const root = mkdtempSync(join(base, 'launch-control-')),
    parentToken = randomUUID(),
    launch = join(root, 'launch-' + randomUUID());
  writeFileSync(join(root, '.owner'), parentToken);
  mkdirSync(launch);
  writeFileSync(join(launch, '.owner'), randomUUID());
  // Synthetic trusted-launcher attestation/capture inputs only. No native keys,
  // distribution verification or Electron execution is claimed by these tests.
  put(join(launch, 'runtime-attestation.json'), {
    version: 1,
    electron: '45.1.0',
    exeSha256: 'a'.repeat(64),
  });
  const storeId = randomUUID();
  const data = join(root, options.restored ? `data-${storeId}` : 'data-main');
  let originalWitness = null;
  if (options.restored) {
    mkdirSync(data);
    const restoreReceiptId = randomUUID();
    put(join(data, '.persistence-owner.json'), {
      version: 1,
      storeId,
      kind: 'RESTORED',
      restoreReceiptId,
    });
    put(join(data, '.restore-receipt.json'), {
      version: 1,
      storeId,
      restoreReceiptId,
      quarantined: true,
    });
    originalWitness = {
      storeId,
      backupId: randomUUID(),
      locationId: randomUUID(),
      encryptedSha256: 'b'.repeat(64),
    };
    put(join(data, 'migration-backups.json'), [
      {
        header: {
          storeId,
          backupId: originalWitness.backupId,
          locationId: originalWitness.locationId,
        },
        encryptedSha256: originalWitness.encryptedSha256,
      },
    ]);
    if (!options.missingKey) {
      mkdirSync(join(data, 'key-profile'));
      put(join(data, 'key-profile/.key-profile-owner.json'), { version: 1, storeId });
      put(join(data, 'key-profile/Local State'), {
        os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
      });
    }
  }
  journal.plan(
    root,
    launch,
    data,
    'SOURCE',
    options.restored ? 'restore-to-new' : 'NORMAL',
    'a'.repeat(64),
  );
  const command = (action, ok = true) => {
    const sequence = journal.inspect(root, launch).nextSequence;
    const stage = action === 'recover' ? 'RECOVERY' : action.replaceAll('-', '_').toUpperCase();
    if (!ok) {
      try {
        journal.appendIntent(root, launch, sequence, stage);
      } catch {
        return null;
      } // denied before a child is admitted, not a simulated child PASS
    } else if (action === 'recover') journal.recoveryIntent(root, launch, sequence);
    else journal.appendIntent(root, launch, sequence, stage);
    const r = spawnSync(process.execPath, [helper, action, root, launch], {
      encoding: 'utf8',
      env: environment,
      timeout: 5000,
      maxBuffer: 4096,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.status, ok ? 0 : 1, r.stdout + r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(
      r.stdout.endsWith(
        ok ? 'PERSISTENCE_LAUNCH_CONTROL_PASS\n' : 'PERSISTENCE_LAUNCH_CONTROL_FAILED\n',
      ),
      true,
    );
    put(join(launch, `capture-${String(sequence).padStart(2, '0')}.json`), {
      process: {
        status: r.status === 0 ? 'SUCCESS' : 'NONZERO_EXIT',
        exitCode: r.status,
        cleanupComplete: true,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      stdout: r.stdout,
      stderr: r.stderr,
    });
    // spawnSync returned with bounded complete capture: this is the actual Node
    // control only, not evidence that Electron/native keys were run.
    journal.settle(root, launch, sequence);
    return r;
  };
  const profile = (stage) => {
    const p = join(
      launch,
      'fonesi-auto-foundation-' + launch.slice(launch.lastIndexOf('launch-') + 7) + '-' + stage,
    );
    mkdirSync(p);
    writeFileSync(join(p, '.owner'), 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n');
  };
  const capture = (stage, stdout, changes = {}) => {
    const sequence = journal.inspect(root, launch).nextSequence;
    journal.appendIntent(root, launch, sequence, stage.toUpperCase());
    const value = {
      process: {
        status: 'SUCCESS',
        exitCode: 0,
        cleanupComplete: true,
        stdoutTruncated: false,
        stderrTruncated: false,
        ...changes,
      },
      stdout,
      stderr: '',
    };
    put(join(launch, stage + '-capture.json'), value);
    put(join(launch, `capture-${String(sequence).padStart(2, '0')}.json`), value);
    journal.settle(root, launch, sequence);
  };
  try {
    run({ root, launch, data, originalWitness, command, profile, capture });
  } finally {
    assert.equal(realpathSync(root), resolve(root));
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    rmSync(root, { recursive: true, force: false });
  }
}
test('actual owned control first creates then replaces READY after distinct orderly proof facts', () =>
  fixture(({ root, launch, command, profile, capture }) => {
    command('setup');
    const state = JSON.parse(readFileSync(join(launch, 'state.json'), 'utf8')),
      data = join(root, 'data-main');
    assert.equal(state.needsProvision, true);
    profile('provision');
    command('prepare-provision');
    const witness = {
      storeId: state.storeId,
      backupId: randomUUID(),
      locationId: randomUUID(),
      encryptedSha256: 'b'.repeat(64),
    };
    put(join(launch, 'provision-result.json'), {
      version: 1,
      stage: 'provision',
      status: 'PROVISIONED',
      witness,
    });
    capture('provision', 'PERSISTENCE_INITIALIZE_ORDERLY\n');
    command('observe-provision');
    // Simulates only the already-tested native provider's settled owned files.
    mkdirSync(join(data, 'staging'));
    put(join(data, 'key-profile/Local State'), {
      os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
    });
    put(join(data, 'migration-backups.json'), [
      {
        header: {
          storeId: state.storeId,
          backupId: witness.backupId,
          locationId: witness.locationId,
        },
        encryptedSha256: witness.encryptedSha256,
      },
    ]);
    profile('auth');
    command('prepare-auth');
    put(join(launch, 'auth-result.json'), {
      version: 1,
      stage: 'auth',
      status: 'AUTHENTICATED',
      witness,
    });
    capture('auth', 'PERSISTENCE_INITIALIZE_ORDERLY\n');
    command('observe-auth');
    const proof = JSON.parse(readFileSync(join(data, 'key-durability-proof.json'), 'utf8'));
    assert.equal(proof.version, 2);
    assert.equal(proof.state, 'ORDERLY_REOPEN_AUTHENTICATED');
    assert.equal('abruptExitObserved' in proof, false);
    assert.equal(existsSync(join(data, '.ready-launch.json')), false);
    command('prepare-ready');
    const before = JSON.parse(readFileSync(join(data, '.ready-launch.json'), 'utf8'));
    command('prepare-ready');
    const after = JSON.parse(readFileSync(join(data, '.ready-launch.json'), 'utf8'));
    assert.equal(after.version, 2);
    assert.equal(after.ownerToken, state.ownerToken);
    assert.equal(after.runtimeExeSha256, 'a'.repeat(64));
    assert.notEqual(after.checkpoint, before.checkpoint);
    capture('main', 'BOOTSTRAP_READY\nBOOTSTRAP_CLOSED\n');
    command('release');
    assert.equal(existsSync(join(data, '.writer-lock')), false);
    assert.equal(existsSync(join(data, '.released-' + state.ownerToken + '.json')), true);
  }));
test('unretired or mismatched native evidence cannot publish proof or release the retained owner', () =>
  fixture(({ root, launch, command, profile, capture }) => {
    command('setup');
    const state = JSON.parse(readFileSync(join(launch, 'state.json'), 'utf8')),
      data = join(root, 'data-main');
    profile('provision');
    command('prepare-provision');
    put(join(launch, 'provision-result.json'), {
      version: 1,
      stage: 'provision',
      status: 'CANCELLED',
      witness: null,
    });
    assert.throws(() =>
      capture('provision', 'PERSISTENCE_INITIALIZE_ORDERLY\n', { cleanupComplete: false }),
    );
    command('observe-provision', false);
    assert.throws(() => capture('main', 'BOOTSTRAP_CLOSED\n'));
    command('release', false);
    assert.equal(existsSync(join(data, 'key-durability-proof.json')), false);
    assert.equal(existsSync(join(data, '.writer-lock/owner.json')), true);
    assert.equal(existsSync(join(data, '.released-' + state.ownerToken + '.json')), false);
  }));
test('observed cancellation releases only after orderly retirement and never creates READY/proof', () =>
  fixture(({ root, launch, command, profile, capture }) => {
    command('setup');
    profile('provision');
    command('prepare-provision');
    put(join(launch, 'provision-result.json'), {
      version: 1,
      stage: 'provision',
      status: 'CANCELLED',
      witness: null,
    });
    capture('provision', 'PERSISTENCE_INITIALIZE_ORDERLY\n');
    assert.equal(
      command('observe-provision').stdout,
      'PERSISTENCE_LAUNCH_CANCELLED\nPERSISTENCE_LAUNCH_CONTROL_PASS\n',
    );
    command('release');
    assert.equal(existsSync(join(root, 'data-main/.writer-lock')), false);
    assert.equal(existsSync(join(root, 'data-main/.ready-launch.json')), false);
  }));

test('actual RESTORED setup and auth preparation retain selected root and never provision or open active SQLite', () => {
  fixture(
    ({ root, launch, data, command, profile }) => {
      writeFileSync(join(data, 'active.sqlite'), 'CORRUPT_OWNED_TEST_DATABASE');
      command('setup');
      const state = JSON.parse(readFileSync(join(launch, 'state.json'), 'utf8'));
      assert.equal(state.version, 2);
      assert.equal(state.dataRoot, data);
      assert.equal(state.provenance.kind, 'RESTORED');
      assert.equal(state.needsProvision, false);
      profile('auth');
      command('prepare-auth');
      const control = JSON.parse(readFileSync(join(launch, 'auth-control.json'), 'utf8'));
      assert.equal(control.dataRoot, data);
      assert.equal(control.provenance.kind, 'RESTORED');
      assert.equal(control.stage, 'auth');
      assert.equal(
        readFileSync(join(data, 'active.sqlite'), 'utf8'),
        'CORRUPT_OWNED_TEST_DATABASE',
      );
      assert.equal(existsSync(join(root, 'data-main')), false);
    },
    { restored: true },
  );
});

test('missing retained RESTORED key material rejects auth preparation without fresh replacement', () => {
  fixture(
    ({ launch, data, command, profile }) => {
      command('setup');
      profile('auth');
      command('prepare-auth', false);
      assert.equal(existsSync(join(data, 'key-profile')), false);
      assert.equal(existsSync(join(launch, 'auth-control.json')), false);
      assert.equal(existsSync(join(data, '.writer-lock/owner.json')), true);
    },
    { restored: true, missingKey: true },
  );
});

test('actual recovery control retires only journalled synthetic failed-main owner and preserves corrupt data bytes', () => {
  fixture(
    ({ root, launch, data, originalWitness, command, profile, capture }) => {
      command('setup');
      profile('auth');
      command('prepare-auth');
      put(join(launch, 'auth-result.json'), {
        version: 1,
        stage: 'auth',
        status: 'AUTHENTICATED',
        witness: originalWitness,
      });
      capture('auth', 'PERSISTENCE_INITIALIZE_ORDERLY\n');
      command('observe-auth');
      command('prepare-ready');
      for (const name of ['active.sqlite', 'active.sqlite-wal', 'active.sqlite-shm'])
        writeFileSync(join(data, name), `CORRUPT_SYNTHETIC_${name}`);
      capture('main', 'BOOTSTRAP_FAILED\n', { status: 'NONZERO_EXIT', exitCode: 1 });
      command('recover');
      assert.equal(existsSync(join(data, '.writer-lock')), false);
      assert.equal(journal.completed(root, launch).latest.stage, 'RECOVERY');
      for (const name of ['active.sqlite', 'active.sqlite-wal', 'active.sqlite-shm'])
        assert.equal(readFileSync(join(data, name), 'utf8'), `CORRUPT_SYNTHETIC_${name}`);
      assert.equal(
        JSON.parse(readFileSync(join(data, '.restore-receipt.json'), 'utf8')).quarantined,
        true,
      );
    },
    { restored: true },
  );
});

test('actual recovery accepts only main-attributed synthetic log owner, never an unrelated token', () => {
  for (const bound of [true, false])
    fixture(
      ({ root, launch, data, originalWitness, command, profile, capture }) => {
        command('setup');
        profile('auth');
        command('prepare-auth');
        put(join(launch, 'auth-result.json'), {
          version: 1,
          stage: 'auth',
          status: 'AUTHENTICATED',
          witness: originalWitness,
        });
        capture('auth', 'PERSISTENCE_INITIALIZE_ORDERLY\n');
        command('observe-auth');
        command('prepare-ready');
        const state = JSON.parse(readFileSync(join(launch, 'state.json'), 'utf8'));
        const logRoot = join(root, 'logs-main'),
          lock = join(logRoot, '.writer-lock'),
          storeId = randomUUID();
        const ownerToken = bound ? state.ownerToken : randomUUID();
        mkdirSync(logRoot);
        mkdirSync(lock);
        const document = (name, value) =>
          writeFileSync(join(logRoot, name), JSON.stringify(value) + '\n');
        // Synthetic settled logger files; the real recovery module, not native main,
        // must validate this exact owner under the already-recorded absent-lock proof.
        document('owner.json', { schemaVersion: 1, storeId });
        document('.writer-lock/owner.json', { schemaVersion: 1, storeId, ownerToken, pid: 123 });
        document('holds.json', { schemaVersion: 1, storeId, segmentIds: [] });
        document('state.json', { schemaVersion: 1, storeId, lastRetentionUtc: null });
        document('unfinished.json', { schemaVersion: 1, storeId, ownerToken });
        const before = readFileSync(join(lock, 'owner.json'), 'utf8');
        capture('main', 'BOOTSTRAP_FAILED\n', { status: 'NONZERO_EXIT', exitCode: 1 });
        command('recover', bound);
        if (bound) {
          assert.equal(existsSync(lock), false);
          assert.equal(existsSync(join(data, '.writer-lock')), false);
          assert.ok(existsSync(join(launch, 'log-recovery-owner.json')));
        } else {
          assert.equal(readFileSync(join(lock, 'owner.json'), 'utf8'), before);
          assert.equal(existsSync(join(data, '.writer-lock/owner.json')), true);
          assert.equal(existsSync(join(launch, 'log-recovery-owner.json')), false);
        }
      },
      { restored: true },
    );
});
