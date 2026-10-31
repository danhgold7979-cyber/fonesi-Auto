'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function fail() {
  throw new Error('VAULT_NEGATIVE_REJECTED');
}
function plain(directory) {
  if (!path.isAbsolute(directory) || fs.realpathSync(directory) !== directory) fail();
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
}
function readBounded(filename, cap) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) fail();
  const fd = fs.openSync(filename, 'r');
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size !== stat.size) fail();
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!count) break;
      offset += count;
    }
    if (offset !== stat.size) fail();
    return bytes.subarray(0, offset);
  } finally {
    fs.closeSync(fd);
  }
}
function snapshot(directory) {
  plain(directory);
  const pending = [{ name: '', depth: 0 }],
    result = Object.create(null);
  let count = 0,
    total = 0;
  while (pending.length) {
    const current = pending.pop();
    const dir = fs.opendirSync(path.join(directory, current.name));
    try {
      for (;;) {
        const entry = dir.readSync();
        if (!entry) break;
        if (++count > 256 || current.depth >= 16) fail();
        const name = path.join(current.name, entry.name),
          absolute = path.join(directory, name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) fail();
        if (stat.isDirectory()) {
          result[name] = 'DIRECTORY';
          pending.push({ name, depth: current.depth + 1 });
        } else {
          if (!stat.isFile() || stat.size > 8 * 1024 * 1024) fail();
          total += stat.size;
          if (total > 8 * 1024 * 1024) fail();
          const bytes = readBounded(absolute, 8 * 1024 * 1024);
          if (bytes.length !== stat.size) fail();
          result[name] = digest(bytes);
        }
      }
    } finally {
      dir.closeSync();
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function equal(left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail();
}
function writeNew(filename, bytes) {
  const fd = fs.openSync(filename, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
async function runRecordNegative({
  kind,
  directory,
  filename,
  backupPath,
  readOriginal,
  verifyRejected,
}) {
  if (
    !['missing', 'corrupt'].includes(kind) ||
    typeof filename !== 'string' ||
    filename !== path.basename(filename) ||
    filename === '.' ||
    filename === '..' ||
    typeof readOriginal !== 'function' ||
    typeof verifyRejected !== 'function'
  )
    fail();
  plain(directory);
  plain(path.dirname(backupPath));
  if (
    !path.isAbsolute(backupPath) ||
    path.resolve(backupPath).startsWith(`${directory}${path.sep}`)
  )
    fail();
  const target = path.join(directory, filename),
    before = snapshot(directory);
  if (!Object.hasOwn(before, filename) || before[filename] === 'DIRECTORY') fail();
  const original = readBounded(target, 32768);
  // At least one prefix byte remains untouched; only the last ciphertext/tag byte changes.
  if (original.length < 2 || original.length > 32768 || digest(original) !== before[filename])
    fail();
  if ((await readOriginal()) !== true) fail();
  equal(snapshot(directory), before);
  writeNew(backupPath, original);
  if (digest(readBounded(backupPath, 32768)) !== before[filename]) fail();
  const altered = { ...before };
  let changed = false,
    failed = false,
    primary;
  try {
    fs.unlinkSync(target);
    changed = true;
    if (kind === 'corrupt') {
      const corrupt = Buffer.from(original);
      corrupt[corrupt.length - 1] ^= 1;
      writeNew(target, corrupt);
      altered[filename] = digest(corrupt);
    } else delete altered[filename];
    equal(snapshot(directory), altered);
    if ((await verifyRejected(kind === 'missing' ? 'STORE_INVALID' : 'DECRYPTION_FAILED')) !== true)
      fail();
  } catch (error) {
    failed = true;
    primary = error;
  }
  if (changed) {
    try {
      equal(snapshot(directory), altered);
      if (kind === 'corrupt') fs.unlinkSync(target);
      writeNew(target, original);
      equal(snapshot(directory), before);
      if ((await readOriginal()) !== true) fail();
      equal(snapshot(directory), before);
    } catch (error) {
      if (!failed) {
        failed = true;
        primary = error;
      }
    }
  }
  // The private ciphertext copy is intentionally retained, including on success.
  // Caller owns bounded cleanup only after native retirement; never overwrite uncertainty.
  original.fill(0);
  if (failed) throw primary;
  return { kind, restored: true };
}
module.exports = { runRecordNegative };
