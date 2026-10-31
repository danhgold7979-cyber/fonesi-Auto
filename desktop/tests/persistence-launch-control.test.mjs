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
const desktop = fileURLToPath(new URL('..', import.meta.url));
const helper = join(desktop, 'launch/persistence-launch-control.cjs');
const environment = { ...process.env };
delete environment.NODE_OPTIONS;
delete environment.NODE_PATH;
const put = (p, v) => writeFileSync(p, JSON.stringify(v));
function fixture(run) {
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
  const command = (action, ok = true) => {
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
  const capture = (stage, stdout, changes = {}) =>
    put(join(launch, stage + '-capture.json'), {
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
    });
  try {
    run({ root, launch, command, profile, capture });
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
  fixture(({ root, launch, command, capture }) => {
    command('setup');
    const state = JSON.parse(readFileSync(join(launch, 'state.json'), 'utf8')),
      data = join(root, 'data-main');
    put(join(launch, 'provision-result.json'), {
      version: 1,
      stage: 'provision',
      status: 'CANCELLED',
      witness: null,
    });
    capture('provision', 'PERSISTENCE_INITIALIZE_ORDERLY\n', { cleanupComplete: false });
    command('observe-provision', false);
    capture('main', 'BOOTSTRAP_CLOSED\n');
    command('release', false);
    assert.equal(existsSync(join(data, 'key-durability-proof.json')), false);
    assert.equal(existsSync(join(data, '.writer-lock/owner.json')), true);
    assert.equal(existsSync(join(data, '.released-' + state.ownerToken + '.json')), false);
  }));
test('observed cancellation releases only after orderly retirement and never creates READY/proof', () =>
  fixture(({ root, launch, command, capture }) => {
    command('setup');
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
