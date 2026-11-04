'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const CASES = Object.freeze([
  'restored_lease',
  'profile_before_ready',
  'copied_key_material',
  'original_bootstrap_authenticated',
  'proof_bound',
  'schema_two',
  'root_quarantined',
  'sql_quarantined',
  'automatic_backup_disabled',
  'source_unchanged',
  'service_closed',
]);
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const uuid = (x) =>
  typeof x === 'string' &&
  x.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
function plain(p) {
  const s = fs.lstatSync(p),
    same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (
    p !== path.resolve(p) ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    !same(fs.realpathSync(p), p)
  )
    throw new Error('RESTORE_OWNER');
}
function oneOwner(directory) {
  plain(directory);
  const entries = fs.opendirSync(directory);
  try {
    const first = entries.readSync();
    return first?.name === 'owner.json' && entries.readSync() === null;
  } finally {
    entries.closeSync();
  }
}
function read(p) {
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('RESTORE_FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const b = Buffer.alloc(65537);
    let n = 0;
    while (n < b.length) {
      const got = fs.readSync(fd, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n > 65536) throw new Error('RESTORE_LIMIT');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(p, value) {
  plain(path.dirname(p));
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw) > 65536) throw new Error('RESTORE_LIMIT');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (read(p) !== raw) throw new Error('RESTORE_READBACK');
}
function exact(raw, keys) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 65536) throw new Error('RESTORE_SCHEMA');
  const v = JSON.parse(raw);
  if (
    !v ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v)) !== JSON.stringify(keys) ||
    JSON.stringify(v) !== raw
  )
    throw new Error('RESTORE_SCHEMA');
  return v;
}
function descendant(root, mode, restoreRoot, storeId) {
  plain(root);
  const selected = path.join(root, `maintenance-restore-parent-${mode}`),
    parent = path.dirname(restoreRoot);
  plain(selected);
  plain(parent);
  plain(restoreRoot);
  if (
    path.dirname(parent) !== selected ||
    !/^fonesi-restore-[0-9a-f-]{36}$/.test(path.basename(parent)) ||
    !uuid(path.basename(parent).slice(15)) ||
    path.basename(restoreRoot) !== `data-${storeId}`
  )
    throw new Error('RESTORE_DESCENDANT');
}
function sourceWitness(data) {
  plain(data);
  const sha = createHash('sha256');
  for (const name of [
    'active.sqlite',
    'active.sqlite-wal',
    'active.sqlite-shm',
    'key-profile/Local State',
  ]) {
    const p = path.join(data, name);
    plain(path.dirname(p));
    let s;
    try {
      s = fs.lstatSync(p);
    } catch (e) {
      if (e.code === 'ENOENT' && (name === 'active.sqlite-wal' || name === 'active.sqlite-shm')) {
        sha.update(`${name}:MISSING\n`);
        continue;
      }
      throw e;
    }
    if (!s.isFile() || s.isSymbolicLink() || s.size > 67108864) throw new Error('RESTORE_SOURCE');
    sha.update(`${name}:${s.size}:`);
    const fd = fs.openSync(p, 'r');
    try {
      const b = Buffer.alloc(65536);
      let n = 0;
      for (;;) {
        const got = fs.readSync(fd, b, 0, b.length, null);
        if (!got) break;
        n += got;
        if (n > 67108864) throw new Error('RESTORE_SOURCE');
        sha.update(b.subarray(0, got));
      }
      if (n !== s.size) throw new Error('RESTORE_SOURCE');
    } finally {
      fs.closeSync(fd);
    }
  }
  return sha.digest('hex');
}
function control(raw) {
  const v = exact(raw, [
    'version',
    'mode',
    'runParentToken',
    'storeId',
    'restoreRoot',
    'restoreParentToken',
    'ownerToken',
    'sourceOwnerToken',
    'sourceBackupId',
    'checkpoint',
    'sourceWitness',
  ]);
  if (
    v.version !== 1 ||
    !['source', 'package'].includes(v.mode) ||
    ![
      v.runParentToken,
      v.storeId,
      v.restoreParentToken,
      v.ownerToken,
      v.sourceOwnerToken,
      v.sourceBackupId,
    ].every(uuid) ||
    typeof v.restoreRoot !== 'string' ||
    v.restoreRoot !== path.resolve(v.restoreRoot) ||
    typeof v.checkpoint !== 'string' ||
    !/^key-checkpoint-[0-9a-f-]{36}\.json$/.test(v.checkpoint) ||
    !uuid(v.checkpoint.slice(15, -5)) ||
    typeof v.sourceWitness !== 'string' ||
    !/^[0-9a-f]{64}$/.test(v.sourceWitness)
  )
    throw new Error('RESTORE_CONTROL');
  return Object.freeze(v);
}
function result(raw) {
  const v = exact(raw, ['version', 'scope', 'mode', 'versions', 'cases']);
  if (
    v.version !== 1 ||
    v.scope !== 'COPIED_PROFILE_RESTORE_REOPEN' ||
    !['source', 'package'].includes(v.mode) ||
    JSON.stringify(v.versions) !== JSON.stringify(VERSIONS) ||
    JSON.stringify(Object.keys(v.cases)) !== JSON.stringify(CASES) ||
    CASES.some((k) => typeof v.cases[k] !== 'boolean')
  )
    throw new Error('RESTORE_RESULT');
  return v;
}
module.exports = {
  CASES,
  VERSIONS,
  uuid,
  plain,
  oneOwner,
  read,
  write,
  exact,
  descendant,
  sourceWitness,
  control,
  result,
};
