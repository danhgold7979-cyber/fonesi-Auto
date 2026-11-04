'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scan, scanArtifacts, CANARY } = require('./logging-evidence.cjs');
const { encodeLogRecord } = require('../build/log-contract.cjs');
function fixture() {
  const base = path.resolve(__dirname, '../.test-output');
  const stat = fs.lstatSync(base);
  assert.equal(stat.isDirectory(), true);
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(fs.realpathSync(base), base);
  const root = fs.mkdtempSync(path.join(base, 'log-scan-'));
  const logs = path.join(root, 'logs'),
    crashes = path.join(root, 'crashes');
  fs.mkdirSync(logs);
  fs.mkdirSync(crashes);
  return {
    root,
    logs,
    crashes,
    close() {
      assert.equal(fs.realpathSync(root), root);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
function row(event, code, diagnosticId = null) {
  return {
    schemaVersion: 1,
    runId: '12345678-1234-1234-1234-123456789abc',
    sequence: 1,
    utc: '2026-10-31T00:00:00.000Z',
    severity: event === 'BRIDGE_RESULT' ? 'WARN' : 'INFO',
    component: event === 'BRIDGE_RESULT' ? 'PRELOAD_BOUNDARY' : 'MAIN',
    task: 'P1-04',
    event,
    diagnosticId,
    code,
  };
}
function write(f, rows) {
  const file = path.join(f.logs, `segment-${crypto.randomUUID()}.jsonl`);
  fs.writeFileSync(file, rows.map(encodeLogRecord).join(''), { flag: 'wx' });
  return file;
}
test('post-flush scan matches exact private outcome and lifecycle without exposing IDs', () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID();
    write(f, [
      row('STARTUP_READY', 'OK'),
      row('BRIDGE_RESULT', 'INVALID_SHAPE', id),
      row('SHUTDOWN', 'OK'),
    ]);
    const result = scan(f.logs, f.crashes, [{ diagnosticId: id, code: 'INVALID_SHAPE' }]);
    assert.equal(result.correlated, true);
    assert.equal(result.lifecycle, true);
    assert.equal(result.recordCount, 3);
    assert.equal(JSON.stringify(result).includes(id), false);
  } finally {
    f.close();
  }
});
test('wrong outcome, reused correlation and absent reference do not count as correlation', () => {
  const f = fixture();
  try {
    const id = crypto.randomUUID();
    write(f, [row('BRIDGE_RESULT', 'INVALID_SHAPE', id)]);
    for (const expected of [
      [{ diagnosticId: id, code: 'OK' }],
      [
        { diagnosticId: id, code: 'INVALID_SHAPE' },
        { diagnosticId: id, code: 'INVALID_SHAPE' },
      ],
      [],
    ])
      assert.equal(scan(f.logs, f.crashes, expected).correlated, false);
  } finally {
    f.close();
  }
});
test('canonical application records reject duplicate keys before a positive scan', () => {
  const f = fixture();
  try {
    const file = write(f, [row('STARTUP_READY', 'OK')]);
    const raw = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, raw.replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1'));
    assert.throws(() => scan(f.logs, f.crashes), /LOG_SCAN_RECORD/);
  } finally {
    f.close();
  }
});
test('UTF8 and UTF16 synthetic dump canaries are detected and artifact count is exact', () => {
  const f = fixture();
  try {
    for (const encoding of ['utf8', 'utf16le'])
      fs.writeFileSync(path.join(f.crashes, encoding + '.dmp'), Buffer.from(CANARY, encoding));
    assert.deepEqual(scanArtifacts(f.crashes), { count: 2, canaryAbsent: false });
  } finally {
    f.close();
  }
});
test('bounded scan rejects oversized owned artifact instead of claiming clean', () => {
  const f = fixture();
  try {
    const descriptor = fs.openSync(path.join(f.crashes, 'large.dmp'), 'wx');
    fs.ftruncateSync(descriptor, 8 * 1024 * 1024 + 1);
    fs.closeSync(descriptor);
    assert.throws(() => scanArtifacts(f.crashes), /LOG_SCAN_BYTES/);
  } finally {
    f.close();
  }
});
