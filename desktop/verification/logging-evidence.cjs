'use strict';
// Private owned bytes are inspected here; only fixed booleans/counts may escape.
const fs = require('node:fs');
const path = require('node:path');
const { encodeLogRecord } = require('../build/log-contract.cjs');
const CANARY = 'P104_PRIVATE_PASSWORD_OTP_COOKIE_PATH_CANARY';
const needles = [Buffer.from(CANARY, 'utf8'), Buffer.from(CANARY, 'utf16le')];
function inventory(root) {
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) throw new Error('LOG_SCAN_ROOT');
  const pending = [{ name: root, depth: 0 }],
    files = [];
  let bytes = 0,
    entries = 0;
  while (pending.length) {
    const current = pending.pop();
    const stat = fs.lstatSync(current.name);
    if (stat.isSymbolicLink() || current.depth > 16) throw new Error('LOG_SCAN_ENTRY');
    if (stat.isDirectory()) {
      const directory = fs.opendirSync(current.name);
      try {
        for (;;) {
          const entry = directory.readSync();
          if (entry === null) break;
          if (++entries > 256) throw new Error('LOG_SCAN_COUNT');
          pending.push({ name: path.join(current.name, entry.name), depth: current.depth + 1 });
        }
      } finally {
        directory.closeSync();
      }
    } else {
      bytes += stat.size;
      if (!stat.isFile() || bytes > 8 * 1024 * 1024) throw new Error('LOG_SCAN_BYTES');
      files.push({ name: current.name, bytes: stat.size });
    }
  }
  return files;
}
function read(file) {
  const descriptor = fs.openSync(file.name, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== file.bytes) throw new Error('LOG_SCAN_CHANGED');
    const bytes = Buffer.alloc(file.bytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (!count) break;
      offset += count;
    }
    if (offset !== file.bytes) throw new Error('LOG_SCAN_CHANGED');
    return bytes.subarray(0, offset);
  } finally {
    fs.closeSync(descriptor);
  }
}
function scanArtifacts(root) {
  const files = inventory(root);
  return {
    count: files.length,
    canaryAbsent: files.every((file) => !needles.some((needle) => read(file).includes(needle))),
  };
}
function fingerprint(root) {
  const hash = require('node:crypto').createHash('sha256');
  for (const file of inventory(root).sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(path.relative(root, file.name));
    hash.update(read(file));
  }
  return hash.digest('hex');
}
function scan(logRoot, crashRoot, references = []) {
  const result = {
    canonical: true,
    canaryAbsent: true,
    correlated: true,
    lifecycle: false,
    recordCount: 0,
    crashArtifactCount: 0,
  };
  const found = new Map();
  let started = false,
    closed = false;
  for (const file of inventory(logRoot)) {
    const bytes = read(file);
    if (needles.some((needle) => bytes.includes(needle))) result.canaryAbsent = false;
    if (!/^segment-[0-9a-f-]{36}\.jsonl$/.test(path.basename(file.name))) continue;
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!raw.endsWith('\n')) throw new Error('LOG_SCAN_RECORD');
    for (const line of raw.slice(0, -1).split('\n')) {
      const record = JSON.parse(line);
      if (encodeLogRecord(record) !== `${line}\n`) throw new Error('LOG_SCAN_RECORD');
      if (++result.recordCount > 32768) throw new Error('LOG_SCAN_RECORD_COUNT');
      if (record.event === 'BRIDGE_RESULT' && record.diagnosticId !== null)
        found.set(record.diagnosticId, record.code);
      if (record.event === 'STARTUP_READY') started = true;
      if (record.event === 'SHUTDOWN' && record.code === 'OK') closed = true;
    }
  }
  for (const file of inventory(crashRoot)) {
    result.crashArtifactCount++;
    if (needles.some((needle) => read(file).includes(needle))) result.canaryAbsent = false;
  }
  result.correlated =
    references.length > 0 &&
    new Set(references.map((reference) => reference.diagnosticId)).size === references.length &&
    references.every(
      (reference) =>
        typeof reference.diagnosticId === 'string' &&
        found.get(reference.diagnosticId) === reference.code,
    );
  result.lifecycle = started && closed;
  return result;
}
module.exports = { scan, scanArtifacts, fingerprint, CANARY };
if (require.main === module) {
  try {
    if (
      process.argv.length !== 2 ||
      !process.env.FONESI_BOOTSTRAP_ROOT ||
      !process.env.FONESI_LOG_ROOT
    )
      throw new Error('ARGUMENTS');
    const result = scan(
      process.env.FONESI_LOG_ROOT,
      path.join(process.env.FONESI_BOOTSTRAP_ROOT, 'crashes'),
    );
    console.log(
      'FOUNDATION_LOG_SCAN ' +
        JSON.stringify({
          canonical: result.canonical,
          canaryAbsent: result.canaryAbsent,
          recordCount: result.recordCount,
          crashArtifactCount: result.crashArtifactCount,
        }),
    );
  } catch {
    console.log('FOUNDATION_LOG_SCAN_FAILED');
    process.exitCode = 1;
  }
}
