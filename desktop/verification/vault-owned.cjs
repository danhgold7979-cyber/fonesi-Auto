'use strict';
const fs = require('node:fs');
const path = require('node:path');
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
function read(p) {
  directory(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r');
  try {
    const bytes = Buffer.alloc(65537);
    let n = 0;
    while (n < bytes.length) {
      const count = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!count) break;
      n += count;
    }
    if (n > 65536) throw new Error('FILE');
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}
function write(p, v) {
  directory(path.dirname(p));
  const raw = JSON.stringify(v);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
module.exports = { directory, read, write };
