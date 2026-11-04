import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const desktop = fileURLToPath(new URL('..', import.meta.url));
const source = fs.readFileSync(path.join(desktop, 'launch/persistence-initialize.cjs'), 'utf8');
function fixture(change = () => {}) {
  const base = path.join(desktop, '.test-output');
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(base, 'initializer-')));
  const storeId = randomUUID(),
    parentToken = randomUUID(),
    ownerToken = randomUUID();
  const launch = path.join(root, 'launch-' + randomUUID());
  const data = path.join(root, 'data-' + storeId),
    profile = path.join(launch, 'profile');
  const provenance = { version: 1, storeId, kind: 'RESTORED', restoreReceiptId: randomUUID() };
  const put = (p, v) => fs.writeFileSync(p, JSON.stringify(v), { flag: 'wx' });
  fs.writeFileSync(path.join(root, '.owner'), parentToken, { flag: 'wx' });
  fs.mkdirSync(launch);
  fs.writeFileSync(path.join(launch, '.owner'), randomUUID(), { flag: 'wx' });
  fs.mkdirSync(data);
  fs.mkdirSync(profile);
  fs.mkdirSync(path.join(data, '.writer-lock'));
  fs.mkdirSync(path.join(data, 'key-profile'));
  put(path.join(data, '.persistence-owner.json'), provenance);
  put(path.join(data, '.restore-receipt.json'), {
    version: 1,
    storeId,
    restoreReceiptId: provenance.restoreReceiptId,
    quarantined: true,
  });
  put(path.join(data, '.writer-lock/owner.json'), { version: 1, storeId, ownerToken });
  put(path.join(data, 'key-profile/.key-profile-owner.json'), { version: 1, storeId });
  const material = JSON.stringify({
    os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
  });
  const checkpoint = 'key-checkpoint-' + randomUUID() + '.json';
  fs.writeFileSync(path.join(data, 'key-profile/Local State'), material);
  fs.writeFileSync(path.join(data, checkpoint), material);
  const control = {
    version: 2,
    stage: 'auth',
    root,
    parentToken,
    ownerToken,
    storeId,
    checkpoint,
    fresh: false,
    profile,
    runtimeExeSha256: 'a'.repeat(64),
    dataRoot: data,
    provenance,
  };
  const events = { ready: false, exits: [], provider: 0, paths: [] };
  try {
    change({ root, launch, data, control, put });
    put(path.join(launch, 'auth-control.json'), control);
    const app = {
      isPackaged: false,
      isReady: () => false,
      setPath: (...args) => events.paths.push(args),
      on: () => {},
      exit: (code) => events.exits.push(code),
      whenReady: () => {
        events.ready = true;
        return new Promise(() => {});
      },
    };
    const allowed = {
      electron: { app, safeStorage: {}, dialog: {} },
      'node:fs': { ...fs, writeSync: () => {} },
      'node:path': path,
      '../build/profile-owner.cjs': { prepareOwnedProfile: () => ({ userData: profile }) },
      '../build/backup-key-profile.cjs': {
        validBackupLocalState: (value) => value === material,
        backupKeys: () => {
          events.provider++;
          throw Error('NATIVE_NOT_RUN');
        },
      },
      '../build/foundation-persistence.cjs': { FoundationPersistence: {} },
      '../build/persistence-native.cjs': { runNativePersistenceProvision: () => assert.fail() },
      '../build/persistence-entry.cjs': { assertCertifiedPersistenceEntry: () => {} },
      '../build/persistence-files.cjs': { assertBorrowedPersistenceLease: () => assert.fail() },
    };
    vm.runInNewContext(source, {
      require: (name) => {
        assert.ok(Object.hasOwn(allowed, name), name);
        return allowed[name];
      },
      process: {
        argv: ['electron.exe', 'initializer.cjs'],
        env: { FONESI_PERSISTENCE_LAUNCH_CONTROL: path.join(launch, 'auth-control.json') },
      },
      Buffer,
      TextDecoder,
      console,
    });
    return events;
  } finally {
    assert.equal(fs.realpathSync.native(root), root);
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), parentToken);
    fs.rmSync(root, { recursive: true, force: false });
  }
}
test('actual initializer admits exact restored auth before readiness without provisioning', () => {
  const result = fixture();
  assert.equal(result.ready, true);
  assert.deepEqual(result.exits, []);
  assert.equal(result.provider, 0);
});
test('restored initializer rejects altered receipt, provisioning and foreign data root before native readiness', () => {
  for (const mutate of [
    ({ data }) => fs.writeFileSync(path.join(data, '.restore-receipt.json'), '{}'),
    ({ control }) => {
      control.fresh = true;
    },
    ({ control, launch }) => {
      control.dataRoot = launch;
    },
    ({ control }) => {
      control.provenance.restoreReceiptId = randomUUID();
    },
  ]) {
    const result = fixture(mutate);
    assert.equal(result.ready, false);
    assert.deepEqual(result.exits, [1]);
    assert.equal(result.provider, 0);
  }
});
