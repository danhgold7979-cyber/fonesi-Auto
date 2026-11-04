'use strict';
// Test-only historical schema4 setup; never loaded by a campaign or product module.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
async function migrateSchema4(db, prerequisite, utc) {
  const stop = Object.freeze({ historicalSchema4: true });
  try {
    await db.migrate(async (version) => {
      if (version === 4) throw stop;
      assert.ok(version >= 0 && version < 4);
      return prerequisite(version);
    }, utc);
  } catch (error) {
    if (error !== stop) throw error;
  }
  assert.equal(db.version, 4);
  db.validate();
}
function commitEmptySchema4(db, expectedRevision, kind, hostEpoch, utc) {
  assert.equal(db.version, 4);
  assert.ok(['STARTUP', 'CAPTURE', 'PRUNE'].includes(kind));
  const before = db.readDurable();
  assert.equal(before.meta.revision, expectedRevision);
  for (const key of [
    'devices',
    'bindings',
    'identityEvidence',
    'associationReceipts',
    'captures',
    'holds',
  ])
    assert.equal(before[key]?.length ?? (key === 'associationReceipts' ? 0 : -1), 0);
  assert.ok(Number.isSafeInteger(utc) && utc >= (before.meta.last_change_utc ?? 0));
  assert.equal(hostEpoch, before.meta.host_epoch + (kind === 'STARTUP' ? 1 : 0));
  assert.ok(Number.isSafeInteger(expectedRevision + 1));
  const operationId = randomUUID();
  db.connection.exec('BEGIN IMMEDIATE');
  try {
    const statement = db.connection.prepare(
      'UPDATE registry_meta SET revision=?,host_epoch=?,last_change_utc=?,last_operation_id=?,last_change_kind=? WHERE singleton=1 AND revision=?',
    );
    try {
      const changed = statement.run(
        expectedRevision + 1,
        hostEpoch,
        utc,
        operationId,
        kind,
        expectedRevision,
      );
      assert.equal(Number(changed.changes), 1);
    } finally {
      statement.close();
    }
    db.validate();
    db.connection.exec('COMMIT');
  } catch (error) {
    db.connection.exec('ROLLBACK');
    throw error;
  }
  assert.equal(db.readDurable().meta.revision, expectedRevision + 1);
}
module.exports = Object.freeze({ migrateSchema4, commitEmptySchema4 });
