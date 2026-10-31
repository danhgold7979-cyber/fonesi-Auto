import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  createPersistenceRoot,
  acquirePersistenceLease,
  writePersistenceFile,
} from '../src/main/persistence-files.ts';
import { prepareBackupKeyProfile } from '../src/main/backup-key-profile.ts';
import {
  assertPreparedPersistenceLease,
  preparedPersistenceEntry,
  configurePersistenceSession,
} from '../src/main/persistence-entry.ts';
const parent = fileURLToPath(new URL('../.test-output', import.meta.url));
async function fixture(run) {
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(lstatSync(parent).isSymbolicLink(), false);
  assert.equal(realpathSync(parent), resolve(parent));
  const root = mkdtempSync(join(parent, 'entry-')),
    parentToken = randomUUID(),
    storeId = randomUUID(),
    ownerToken = randomUUID();
  writeFileSync(join(root, '.owner'), parentToken);
  const location = { root: join(root, `data-${storeId}`), parentToken };
  await createPersistenceRoot(location, {
    version: 1,
    storeId,
    kind: 'FRESH',
    restoreReceiptId: null,
  });
  const lease = await acquirePersistenceLease(location, ownerToken);
  try {
    const profile = await prepareBackupKeyProfile(location.root, storeId, true, lease.assertOwned);
    writeFileSync(
      join(profile.directory, 'Local State'),
      JSON.stringify({
        os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
      }),
    );
    const prepared = await prepareBackupKeyProfile(
        location.root,
        storeId,
        false,
        lease.assertOwned,
      ),
      file = join(location.root, '.ready-launch.json'),
      control = {
        version: 2,
        state: 'READY',
        root: location.root,
        parentToken,
        ownerToken,
        storeId,
        checkpoint: basename(prepared.checkpoint),
        runtimeExeSha256: 'a'.repeat(64),
      };
    await writePersistenceFile(file, JSON.stringify(control));
    await run({ file, control, location, profile: prepared });
  } finally {
    await lease.release();
    assert.equal(lstatSync(root).isSymbolicLink(), false);
    assert.equal(realpathSync(root), resolve(root));
    rmSync(root, { recursive: true });
  }
}
test('production entry is synchronous, exact and configures sessionData only before ready', async () =>
  fixture(async ({ file, profile }) => {
    const entry = preparedPersistenceEntry(file);
    assert.equal(entry.keyProfile, profile.directory);
    const calls = [];
    configurePersistenceSession(
      { isReady: () => false, setPath: (...args) => calls.push(args) },
      entry,
    );
    assert.deepEqual(calls, [['sessionData', profile.directory]]);
    assert.throws(
      () =>
        configurePersistenceSession({ isReady: () => true, setPath: () => assert.fail() }, entry),
      /PERSISTENCE_PROFILE_TOO_LATE/,
    );
    assert.equal(preparedPersistenceEntry(undefined), undefined);
  }));
test('identical malformed checkpoint/profile and FRESH restore receipt are refused before native use', async () =>
  fixture(async ({ file, profile, location }) => {
    writeFileSync(join(profile.directory, 'Local State'), '{}');
    writeFileSync(profile.checkpoint, '{}');
    assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    const valid = JSON.stringify({
      os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic').toString('base64') },
    });
    writeFileSync(join(profile.directory, 'Local State'), valid);
    writeFileSync(profile.checkpoint, valid);
    writeFileSync(join(location.root, '.restore-receipt.json'), '{}');
    assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    // Restore the deliberately invalid fixture so the unchanged owned lease can retire.
    const { unlinkSync } = await import('node:fs');
    unlinkSync(join(location.root, '.restore-receipt.json'));
  }));
test('verification stage flags, duplicate keys and unknown owner cannot become production READY', async () =>
  fixture(async ({ file, control }) => {
    for (const raw of [
      JSON.stringify({ ...control, state: 'provision' }),
      JSON.stringify(control).replace('"version":2', '"version":0,"version":2'),
      JSON.stringify({ ...control, ownerToken: randomUUID() }),
    ]) {
      writeFileSync(file, raw);
      assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    }
  }));

test('synchronous final lease assertion rejects owner changes and unknown lock entries', async () =>
  fixture(async ({ file, location }) => {
    const entry = preparedPersistenceEntry(file);
    assert.doesNotThrow(() => assertPreparedPersistenceLease(entry));
    const owner = join(location.root, '.writer-lock', 'owner.json'),
      original = readFileSync(owner, 'utf8');
    try {
      writeFileSync(
        owner,
        JSON.stringify({ version: 1, storeId: entry.storeId, ownerToken: randomUUID() }),
      );
      assert.throws(() => assertPreparedPersistenceLease(entry), /PERSISTENCE_ENTRY_REJECTED/);
    } finally {
      writeFileSync(owner, original);
    }
    const extra = join(location.root, '.writer-lock', 'unknown');
    try {
      writeFileSync(extra, 'fixed', { flag: 'wx' });
      assert.throws(() => assertPreparedPersistenceLease(entry), /PERSISTENCE_ENTRY_REJECTED/);
    } finally {
      unlinkSync(extra);
    }
    const marker = join(location.root, '.persistence-owner.json'),
      saved = readFileSync(marker, 'utf8');
    try {
      writeFileSync(
        marker,
        JSON.stringify({
          version: 1,
          storeId: randomUUID(),
          kind: 'FRESH',
          restoreReceiptId: null,
        }),
      );
      assert.throws(() => assertPreparedPersistenceLease(entry), /PERSISTENCE_ENTRY_REJECTED/);
    } finally {
      writeFileSync(marker, saved);
    }
    assert.doesNotThrow(() => assertPreparedPersistenceLease(entry));
  }));

test('package data guard rejects own tree and ancestors while source entry remains unchanged', async () =>
  fixture(async ({ location }) => {
    const { persistenceDataGuard } = await import('../src/main/persistence-entry.ts');
    const base = resolve(location.root, '..'),
      pack = join(base, 'package'),
      inside = join(pack, 'inside'),
      outside = join(base, 'outside');
    mkdirSync(pack);
    mkdirSync(inside);
    mkdirSync(outside);
    const guard = persistenceDataGuard(pack);
    for (const selected of [base, pack, inside, join(pack, '..', 'package')])
      assert.throws(() => guard(selected), /PACKAGE_DATA_LOCATION_REJECTED/);
    assert.doesNotThrow(() => guard(outside));
    assert.doesNotThrow(() => persistenceDataGuard()(pack));
  }));

test('private PACKAGE READYv3 binds exact package entry and rejects mode/path substitution', async () =>
  fixture(async ({ file, control, location }) => {
    const pack = join(resolve(location.root, '..'), 'package'),
      other = join(resolve(location.root, '..'), 'other');
    mkdirSync(pack);
    mkdirSync(join(pack, 'app'));
    mkdirSync(join(pack, 'app/build'));
    mkdirSync(other);
    const old = process.argv[1];
    try {
      // Parser/custody test only: actual executable certification is a separate native gate.
      process.argv[1] = join(pack, 'app/build/main.cjs');
      writeFileSync(file, JSON.stringify({ ...control, version: 3, packageRoot: pack }));
      assert.equal(preparedPersistenceEntry(file).packageRoot, pack);
      writeFileSync(file, JSON.stringify({ ...control, version: 3, packageRoot: other }));
      assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
      writeFileSync(file, JSON.stringify({ ...control, version: 2, packageRoot: pack }));
      assert.throws(() => preparedPersistenceEntry(file), /PERSISTENCE_ENTRY_REJECTED/);
    } finally {
      process.argv[1] = old;
    }
  }));
