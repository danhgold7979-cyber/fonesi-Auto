'use strict';
const fs = require('node:fs');
const path = require('node:path');
const CANARIES = Object.freeze([
  'P106_SYNTHETIC_VAULT_INITIAL_CANARY',
  'P106_SYNTHETIC_VAULT_REPLACED_CANARY',
]);
const needles = CANARIES.flatMap((value) => [
  Buffer.from(value),
  Buffer.from(value, 'utf16le'),
  Buffer.from(Buffer.from(value).toString('base64')),
]);
function scanTree(root) {
  if (!path.isAbsolute(root) || fs.realpathSync(root).toLowerCase() !== root.toLowerCase())
    throw new Error('ROOT');
  const pending = [{ path: root, depth: 0 }];
  let entries = 0,
    bytes = 0,
    fileCount = 0,
    dumpCount = 0,
    canaryAbsent = true;
  while (pending.length) {
    const current = pending.pop(),
      stat = fs.lstatSync(current.path);
    if (stat.isSymbolicLink() || current.depth > 16) throw new Error('ENTRY');
    if (stat.isDirectory()) {
      const dir = fs.opendirSync(current.path);
      try {
        for (;;) {
          const entry = dir.readSync();
          if (!entry) break;
          if (++entries > 256) throw new Error('COUNT');
          pending.push({ path: path.join(current.path, entry.name), depth: current.depth + 1 });
        }
      } finally {
        dir.closeSync();
      }
    } else {
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('FILE');
      bytes += stat.size;
      if (bytes > 8 * 1024 * 1024) throw new Error('BYTES');
      const fd = fs.openSync(current.path, 'r');
      try {
        const actual = fs.fstatSync(fd);
        if (!actual.isFile() || actual.size !== stat.size) throw new Error('CHANGED');
        const buffer = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const n = fs.readSync(fd, buffer, offset, buffer.length - offset, null);
          if (!n) break;
          offset += n;
        }
        if (offset !== stat.size) throw new Error('CHANGED');
        if (needles.some((needle) => buffer.subarray(0, offset).includes(needle)))
          canaryAbsent = false;
      } finally {
        fs.closeSync(fd);
      }
      fileCount++;
      if (path.extname(current.path).toLowerCase() === '.dmp') dumpCount++;
    }
  }
  return { canaryAbsent, fileCount, dumpCount };
}
module.exports = { CANARIES, scanTree };
