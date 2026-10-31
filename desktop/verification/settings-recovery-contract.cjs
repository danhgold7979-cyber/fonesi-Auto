'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, exact, uuid } = require('./settings-contract.cjs');
const STAGES = Object.freeze([
  'recovery-setup',
  'current-cancel',
  'current-confirm',
  'previous-cancel',
  'previous-confirm',
]);
const CASES = Object.freeze({
  'recovery-setup': Object.freeze([
    'ownedRoot',
    'originalKeyAuthenticated',
    'schema3BackupAuthenticated',
    'bothSettingsRows',
    'orderlyQuit',
  ]),
  cancel: Object.freeze([
    'ownedRoot',
    'corruptRowConfirmed',
    'activeDatabaseNeverOpened',
    'noNormalWindow',
    'nativeCancelled',
    'oldFilesUnchanged',
    'noRestoreCreated',
    'orderlyQuit',
  ]),
  confirm: Object.freeze([
    'ownedRoot',
    'corruptRowConfirmed',
    'activeDatabaseNeverOpened',
    'noNormalWindow',
    'nativeConfirmed',
    'oldFilesUnchanged',
    'restoredNewRoot',
    'restoredQuarantined',
    'restoredSettingsValid',
    'orderlyQuit',
  ]),
});
function caseNames(stage) {
  return CASES[
    stage === 'recovery-setup' ? stage : stage.endsWith('-cancel') ? 'cancel' : 'confirm'
  ];
}
function control(raw) {
  const v = exact(raw, [
    'version',
    'mode',
    'stage',
    'runParentToken',
    'dataRoot',
    'parentToken',
    'ownerToken',
    'storeId',
    'checkpoint',
    'backupId',
    'backupFile',
    'destinationParent',
  ]);
  if (
    v.version !== 1 ||
    !['source', 'package'].includes(v.mode) ||
    !STAGES.includes(v.stage) ||
    ![v.runParentToken, v.parentToken, v.ownerToken, v.storeId].every(uuid) ||
    typeof v.dataRoot !== 'string' ||
    v.dataRoot !== path.resolve(v.dataRoot) ||
    typeof v.checkpoint !== 'string' ||
    !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(v.checkpoint) ||
    !uuid(v.checkpoint.slice(15, -5))
  )
    throw Error('RECOVERY_CONTROL');
  if (v.stage === 'recovery-setup') {
    if (v.backupId !== null || v.backupFile !== null || v.destinationParent !== null)
      throw Error('RECOVERY_CONTROL');
  } else if (
    !uuid(v.backupId) ||
    typeof v.backupFile !== 'string' ||
    v.backupFile !== path.resolve(v.backupFile) ||
    path.basename(v.backupFile) !== `backup-${v.backupId}.fonaub` ||
    typeof v.destinationParent !== 'string' ||
    v.destinationParent !== path.resolve(v.destinationParent)
  )
    throw Error('RECOVERY_CONTROL');
  return Object.freeze(v);
}
function witness(data) {
  plain(data);
  const output = { database: {}, vault: null };
  for (const name of ['active.sqlite', 'active.sqlite-wal', 'active.sqlite-shm']) {
    const file = path.join(data, name);
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (e) {
      if (e.code === 'ENOENT' && name !== 'active.sqlite') {
        output.database[name] = null;
        continue;
      }
      throw e;
    }
    output.database[name] = hashFile(file, stat, 67108864);
  }
  const vault = path.join(data, 'vault');
  try {
    plain(vault);
  } catch (e) {
    if (e.code === 'ENOENT') return output;
    throw e;
  }
  const rows = [],
    entries = fs.opendirSync(vault);
  try {
    for (;;) {
      const entry = entries.readSync();
      if (!entry) break;
      if (rows.length >= 256) throw Error('RECOVERY_VAULT');
      const file = path.join(vault, entry.name);
      rows.push([entry.name, hashFile(file, fs.lstatSync(file), 65536)]);
    }
  } finally {
    entries.closeSync();
  }
  output.vault = rows.sort((a, b) => a[0].localeCompare(b[0]));
  return output;
}
function hashFile(file, stat, cap) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) throw Error('RECOVERY_FILE');
  const fd = fs.openSync(file, 'r'),
    sha = createHash('sha256'),
    buffer = Buffer.alloc(65536);
  let total = 0;
  try {
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      total += n;
      if (total > cap) throw Error('RECOVERY_LIMIT');
      sha.update(buffer.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return { bytes: total, sha256: sha.digest('hex') };
}
function backupWitness(file) {
  return {
    container: hashFile(file, fs.lstatSync(file), 67174444),
    receipt: hashFile(
      file.replace(/\.fonaub$/, '.json'),
      fs.lstatSync(file.replace(/\.fonaub$/, '.json')),
      65536,
    ),
  };
}
function restored(parent, storeId) {
  plain(parent);
  const stream = fs.opendirSync(parent);
  let outer;
  try {
    const first = stream.readSync();
    if (
      !first ||
      stream.readSync() !== null ||
      !first.isDirectory() ||
      first.isSymbolicLink() ||
      !/^fonesi-restore-[0-9a-f-]{36}$/.test(first.name) ||
      !uuid(first.name.slice(15))
    )
      throw Error('RECOVERY_DESTINATION');
    outer = path.join(parent, first.name);
  } finally {
    stream.closeSync();
  }
  plain(outer);
  const parentToken = read(path.join(outer, '.owner'));
  if (!uuid(parentToken)) throw Error('RECOVERY_DESTINATION');
  const root = path.join(outer, `data-${storeId}`);
  plain(root);
  const marker = exact(read(path.join(root, '.persistence-owner.json')), [
    'version',
    'storeId',
    'kind',
    'restoreReceiptId',
  ]);
  if (
    marker.version !== 1 ||
    marker.storeId !== storeId ||
    marker.kind !== 'RESTORED' ||
    !uuid(marker.restoreReceiptId)
  )
    throw Error('RECOVERY_DESTINATION');
  return { root, parentToken };
}
function guardActiveDatabase(sqlite, active, onAttempt) {
  const Original = sqlite.DatabaseSync;
  const normalize = (value) =>
    process.platform === 'win32'
      ? path.win32.toNamespacedPath(value).toLowerCase()
      : path.resolve(value);
  const proxy = new Proxy(Original, {
    construct(target, args, newTarget) {
      if (typeof args[0] === 'string' && normalize(args[0]) === normalize(active)) {
        onAttempt();
        throw Error('RECOVERY_ACTIVE_OPEN_FORBIDDEN');
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
  sqlite.DatabaseSync = proxy;
  return () => {
    if (sqlite.DatabaseSync === proxy) sqlite.DatabaseSync = Original;
  };
}
module.exports = {
  STAGES,
  CASES,
  caseNames,
  control,
  witness,
  backupWitness,
  restored,
  guardActiveDatabase,
  plain,
  read,
  write,
  exact,
  uuid,
};
