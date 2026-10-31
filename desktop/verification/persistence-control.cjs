'use strict';
// Trusted supervisor helper, never an application maintenance/renderer route.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const STAGES = ['provision', 'orderly-auth', 'abrupt-auth', 'final-auth'];
const uuid = (x) =>
  typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
function directory(p) {
  const s = fs.lstatSync(p);
  if (
    p !== path.resolve(p) ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    fs.realpathSync(p).toLowerCase() !== p.toLowerCase()
  )
    throw new Error('DIRECTORY');
}
function read(file) {
  directory(path.dirname(file));
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const descriptor = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const got = fs.readSync(descriptor, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n > 65536) throw new Error('FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(descriptor);
  }
}
function write(file, value) {
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  const h = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(h, raw);
    fs.fsyncSync(h);
  } finally {
    fs.closeSync(h);
  }
}
function runtimeInventory(dist) {
  directory(dist);
  const entries = [],
    pending = [{ directory: dist, depth: 0 }];
  let bytes = 0;
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > 16) throw new Error('RUNTIME_DEPTH');
    const stream = fs.opendirSync(current.directory);
    try {
      for (;;) {
        const entry = stream.readSync();
        if (entry === null) break;
        if (entries.length >= 256) throw new Error('RUNTIME_COUNT');
        const file = path.join(current.directory, entry.name),
          stat = fs.lstatSync(file),
          name = path.relative(dist, file).split(path.sep).join('/');
        if (stat.isSymbolicLink()) throw new Error('RUNTIME_REPARSE');
        if (stat.isDirectory()) {
          entries.push({ kind: 'directory', name });
          pending.push({ directory: file, depth: current.depth + 1 });
        } else {
          if (!stat.isFile()) throw new Error('RUNTIME_FILE');
          bytes += stat.size;
          if (bytes > 512 * 1024 * 1024) throw new Error('RUNTIME_BYTES');
          const hash = crypto.createHash('sha256'),
            handle = fs.openSync(file, 'r'),
            buffer = Buffer.alloc(65536);
          let total = 0;
          try {
            for (;;) {
              const count = fs.readSync(handle, buffer, 0, buffer.length, null);
              if (count === 0) break;
              total += count;
              if (total > stat.size) throw new Error('RUNTIME_CHANGED');
              hash.update(buffer.subarray(0, count));
            }
            if (total !== stat.size) throw new Error('RUNTIME_CHANGED');
          } finally {
            fs.closeSync(handle);
          }
          entries.push({ kind: 'file', name, bytes: stat.size, sha256: hash.digest('hex') });
        }
      }
    } finally {
      stream.closeSync();
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
function runtimeManifest(action, desktop, head) {
  if (process.argv.length !== 5 || typeof head !== 'string' || !/^[0-9a-f]{40}$/.test(head))
    throw new Error('RUNTIME_ARGUMENTS');
  directory(desktop);
  const base = path.join(desktop, '.runtime');
  directory(base);
  const dist = path.join(desktop, 'node_modules/electron/dist');
  const entries = runtimeInventory(dist);
  const executable = entries.find(
    (entry) => entry.kind === 'file' && entry.name === 'electron.exe',
  );
  if (
    !executable ||
    read(path.join(dist, 'version')).trim() !== '45.1.0' ||
    !['LICENSE', 'LICENSES.chromium.html'].every((name) =>
      entries.some((entry) => entry.kind === 'file' && entry.name === name),
    )
  )
    throw new Error('RUNTIME_REQUIRED');
  const manifest = { version: 1, head, electron: '45.1.0', exeSha256: executable.sha256, entries };
  const file = path.join(base, 'persistence-runtime-manifest.json');
  if (action === 'attest-runtime') {
    write(file, manifest);
    console.log('PERSISTENCE_RUNTIME_ATTESTED');
  } else {
    if (read(file) !== JSON.stringify(manifest)) throw new Error('RUNTIME_CHANGED');
    console.log('PERSISTENCE_RUNTIME_VERIFIED');
  }
}
async function run() {
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw new Error('BUILD_UNVERIFIED');
  const [action, root, mode, stage] = process.argv.slice(2);
  if (action === 'attest-runtime' || action === 'verify-runtime') {
    runtimeManifest(action, root, mode);
    return;
  }
  if (
    !['setup', 'prepare', 'prepare-ready', 'inspect-ready'].includes(action) ||
    !['source', 'package'].includes(mode) ||
    (action !== 'prepare'
      ? process.argv.length !== 5
      : process.argv.length !== 6 || !STAGES.includes(stage))
  )
    throw new Error('ARGUMENTS');
  const { createPersistenceRoot, acquirePersistenceLease, assertBorrowedPersistenceLease } =
    require('../build/persistence-files.cjs');
  const { prepareBackupKeyProfile } = require('../build/backup-key-profile.cjs');
  directory(root);
  const parentToken = read(path.join(root, '.owner'));
  if (!uuid(parentToken)) throw new Error('OWNER');
  const location = { root: path.join(root, `data-${mode}`), parentToken };
  const stateFile = path.join(root, `persistence-state-${mode}.json`);
  if (action === 'setup') {
    const storeId = crypto.randomUUID(),
      ownerToken = crypto.randomUUID();
    await createPersistenceRoot(location, {
      version: 1,
      storeId,
      kind: 'FRESH',
      restoreReceiptId: null,
    });
    // The outer supervisor retains this lock across native process exits. No release.
    await acquirePersistenceLease(location, ownerToken);
    fs.mkdirSync(path.join(root, `backup-parent-${mode}`));
    write(stateFile, { version: 1, parentToken, ownerToken, storeId });
    console.log('PERSISTENCE_CONTROL_SETUP');
    return;
  }
  const raw = read(stateFile),
    state = JSON.parse(raw);
  if (
    JSON.stringify(state) !== raw ||
    JSON.stringify(Object.keys(state)) !==
      JSON.stringify(['version', 'parentToken', 'ownerToken', 'storeId']) ||
    state.version !== 1 ||
    state.parentToken !== parentToken ||
    ![state.ownerToken, state.storeId].every(uuid)
  )
    throw new Error('STATE');
  const assertLease = () => assertBorrowedPersistenceLease(location, state.ownerToken);
  await assertLease();
  if (action === 'prepare-ready' || action === 'inspect-ready') {
    const witnessRaw = read(path.join(root, `persistence-witness-${mode}.json`));
    const original = JSON.parse(witnessRaw);
    if (
      JSON.stringify(original) !== witnessRaw ||
      JSON.stringify(Object.keys(original)) !==
        JSON.stringify(['storeId', 'backupId', 'locationId', 'encryptedSha256']) ||
      ![original.storeId, original.backupId, original.locationId].every(uuid) ||
      original.storeId !== state.storeId ||
      typeof original.encryptedSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(original.encryptedSha256)
    )
      throw new Error('WITNESS');
    const proof = { version: 1, ...original, state: 'ORDERLY_AND_ABRUPT_RECOVERED' };
    if (read(path.join(location.root, 'key-durability-proof.json')) !== JSON.stringify(proof))
      throw new Error('PROOF');
    if (action === 'prepare-ready') {
      const key = await prepareBackupKeyProfile(location.root, state.storeId, false, assertLease);
      if (key.checkpoint === null) throw new Error('CHECKPOINT');
      await assertLease();
      write(path.join(location.root, '.ready-launch.json'), {
        version: 2,
        state: 'READY',
        root: location.root,
        parentToken,
        ownerToken: state.ownerToken,
        storeId: state.storeId,
        checkpoint: path.basename(key.checkpoint),
        runtimeExeSha256: JSON.parse(read(path.join(root, 'persistence-runtime-attestation.json')))
          .exeSha256,
      });
      console.log('PERSISTENCE_READY_PREPARED');
      return;
    }
    const { FoundationDatabase, statement } = require('../build/foundation-database.cjs');
    const database = new FoundationDatabase(
      path.join(location.root, 'active.sqlite'),
      state.storeId,
      true,
    );
    try {
      database.validate();
      const row = statement(
        database.connection,
        'SELECT restore_quarantine,last_auto_admitted_utc FROM foundation_store WHERE singleton=1',
        (s) => s.get(),
      );
      const counts = statement(
        database.connection,
        "SELECT SUM(CASE WHEN protected=1 AND reason='PRE_MIGRATION' THEN 1 ELSE 0 END) AS protected_count,SUM(CASE WHEN protected=0 AND reason='DAILY' THEN 1 ELSE 0 END) AS ordinary_count,COUNT(*) AS total FROM backup_record WHERE state='VALIDATED'",
        (s) => s.get(),
      );
      const result = {
        version: 1,
        mode,
        schemaVersion: database.version,
        quarantined: row.restore_quarantine === 1,
        automaticAdmissionRecorded:
          Number.isSafeInteger(row.last_auto_admitted_utc) && row.last_auto_admitted_utc >= 0,
        protectedCount: counts.protected_count,
        ordinaryCount: counts.ordinary_count,
        totalCount: counts.total,
      };
      if (
        result.schemaVersion !== 2 ||
        result.quarantined ||
        !result.automaticAdmissionRecorded ||
        result.protectedCount !== 2 ||
        result.ordinaryCount !== 1 ||
        result.totalCount !== 3
      )
        throw new Error('DATABASE_EVIDENCE');
      await assertLease();
      write(path.join(root, `persistence-ready-database-${mode}.json`), result);
    } finally {
      database.close();
    }
    console.log('PERSISTENCE_READY_DATABASE_VERIFIED');
    return;
  }
  const key = await prepareBackupKeyProfile(
    location.root,
    state.storeId,
    stage === 'provision',
    assertLease,
  );
  let expected = null;
  if (stage !== 'provision') {
    const witnessRaw = read(path.join(root, `persistence-witness-${mode}.json`));
    expected = JSON.parse(witnessRaw);
    if (
      JSON.stringify(expected) !== witnessRaw ||
      JSON.stringify(Object.keys(expected)) !==
        JSON.stringify(['storeId', 'backupId', 'locationId', 'encryptedSha256']) ||
      ![expected.storeId, expected.backupId, expected.locationId].every(uuid) ||
      expected.storeId !== state.storeId ||
      typeof expected.encryptedSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(expected.encryptedSha256)
    )
      throw new Error('WITNESS');
  }
  await assertLease();
  write(path.join(root, `persistence-control-${mode}-${stage}.json`), {
    version: 1,
    mode,
    stage,
    parentToken,
    ownerToken: state.ownerToken,
    storeId: state.storeId,
    checkpoint: key.checkpoint === null ? null : path.basename(key.checkpoint),
    expected,
  });
  console.log('PERSISTENCE_CONTROL_PREPARED');
}
run().catch(() => {
  console.log('PERSISTENCE_CONTROL_FAILED');
  process.exitCode = 1;
});
