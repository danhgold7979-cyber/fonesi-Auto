'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const {
  inspectSchema4,
  assertDurableEmpty,
  assertMigrationBinding,
  assertCaptureAbsent,
} = require('./fleet-ui-schema4.cjs');
const { FoundationDatabase, MIGRATION_HASHES } = require('../build/foundation-database.cjs');
const empty = () => ({
  meta: { revision: 2, host_epoch: 1 },
  devices: [],
  bindings: [],
  identityEvidence: [],
  captures: [],
  holds: [],
});
test('schema4 fixed observation rejects wrong durable revision, epoch and any retained row', () => {
  assert.equal(assertDurableEmpty(empty()), true);
  for (const patch of [{ revision: 1 }, { revision: 3 }, { host_epoch: 0 }, { host_epoch: 2 }])
    assert.throws(
      () => assertDurableEmpty({ ...empty(), meta: { ...empty().meta, ...patch } }),
      /FLEET_UI_SCHEMA4/,
    );
  for (const key of ['devices', 'bindings', 'identityEvidence', 'captures', 'holds'])
    assert.throws(() => assertDurableEmpty({ ...empty(), [key]: [{}] }), /FLEET_UI_SCHEMA4/);
});
test('migration4 binding requires exact version, current script hash and prerequisite backup', () => {
  const id = randomUUID(),
    receipt = { header: { backupId: id } },
    row = { version: 4, script_sha256: MIGRATION_HASHES[3], prerequisite_backup_id: id };
  assert.equal(assertMigrationBinding(row, receipt, MIGRATION_HASHES[3]), true);
  for (const patch of [
    { version: 3 },
    { script_sha256: '0'.repeat(64) },
    { prerequisite_backup_id: randomUUID() },
  ])
    assert.throws(
      () => assertMigrationBinding({ ...row, ...patch }, receipt, MIGRATION_HASHES[3]),
      /FLEET_UI_SCHEMA4/,
    );
});
test('actual read-only schema4 inspection binds synthetic receipt closure and committed empty SQLite startup', async () => {
  const root = fs.realpathSync.native(
      fs.mkdtempSync(
        path.join(
          fs.realpathSync.native(path.resolve(__dirname, '../.test-output')),
          'fleet-schema4-',
        ),
      ),
    ),
    storeId = randomUUID(),
    locationId = randomUUID(),
    receiptFile = path.join(root, 'migration-backups.json');
  let db;
  const receipts = [];
  try {
    db = new FoundationDatabase(path.join(root, 'active.sqlite'), storeId);
    await db.migrate(async (version) => {
      const fingerprint = db.fingerprint(),
        backupId = randomUUID();
      receipts.push({
        version: 1,
        header: {
          formatVersion: 1,
          storeId,
          locationId,
          backupId,
          keyRef: randomUUID(),
          reason: 'PRE_MIGRATION',
          snapshotUtc: 1000,
          schemaVersion: version,
          plaintextBytes: 1,
          plaintextSha256: 'a'.repeat(64),
          nonceBase64: Buffer.alloc(12).toString('base64'),
          wrappedKeyBase64: Buffer.from('synthetic').toString('base64'),
        },
        encryptedSha256: 'b'.repeat(64),
        fingerprint,
        validatedUtc: 1000,
      });
      return { backupId, fingerprint, schemaVersion: version };
    }, 1000);
    fs.writeFileSync(receiptFile, JSON.stringify(receipts), { flag: 'wx' });
    const delta = (kind) => ({
      operationId: randomUUID(),
      kind,
      utc: 1001,
      hostEpoch: 1,
      devices: { insert: [], update: [] },
      bindings: { insert: [], refresh: [], retireIds: [] },
      identityEvidence: { insert: [] },
      captures: { insert: [], transition: [] },
      holds: { insert: [], releaseIds: [] },
    });
    assert.equal(db.commitDurable(0, delta('STARTUP'), () => {}).ok, true);
    assert.equal(db.commitDurable(1, delta('PRUNE'), () => {}).ok, true);
    db.close();
    db = null;
    assert.deepEqual(inspectSchema4(root, storeId), {
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    });
    // Actual SQLite/receipt bytes, with an injected trusted loader to prove package selection.
    const selected = [],
      token = Object.freeze({ packageTest: true }),
      packaged = { exports: {} };
    require('node:vm').runInNewContext(
      fs.readFileSync(path.join(__dirname, 'fleet-ui-schema4.cjs'), 'utf8'),
      {
        module: packaged,
        exports: packaged.exports,
        __dirname,
        Buffer,
        require(name) {
          if (name === './main-runtime-version-package.cjs')
            return {
              loadBuild(t, output) {
                assert.equal(t, token);
                selected.push(output);
                return require(path.join(__dirname, '../build', output));
              },
            };
          if (name.includes('../build')) throw Error('SOURCE_FALLBACK');
          return require(name);
        },
      },
    );
    assert.equal(
      packaged.exports.inspectSchema4(root, storeId, undefined, token).durableStartupCommitted,
      true,
    );
    assert.ok(selected.includes('backup-service.cjs'));
    assert.ok(selected.includes('foundation-database.cjs'));
    assert.throws(() => packaged.exports.inspectSchema4(root, storeId, undefined, {}));
    assert.throws(() => inspectSchema4(root, storeId, randomUUID()), /FLEET_UI_SCHEMA4/);
    const original = fs.readFileSync(receiptFile);
    fs.writeFileSync(receiptFile, JSON.stringify(receipts.slice(0, 3)));
    assert.throws(() => inspectSchema4(root, storeId), /FLEET_UI_SCHEMA4/);
    fs.writeFileSync(receiptFile, original);
    const changed = JSON.parse(original);
    changed[3].header.backupId = randomUUID();
    fs.writeFileSync(receiptFile, JSON.stringify(changed));
    assert.throws(() => inspectSchema4(root, storeId), /FLEET_UI_SCHEMA4/);
    fs.writeFileSync(receiptFile, original);
    fs.mkdirSync(path.join(root, 'captures-v1'));
    assert.throws(() => inspectSchema4(root, storeId), /FLEET_UI_SCHEMA4/);
    fs.rmdirSync(path.join(root, 'captures-v1'));
    assert.equal(assertCaptureAbsent(root), true);
  } finally {
    db?.close();
    for (const name of fs.readdirSync(root)) {
      assert.ok(
        [
          'active.sqlite',
          'active.sqlite-wal',
          'active.sqlite-shm',
          'migration-backups.json',
        ].includes(name),
      );
      const file = path.join(root, name),
        stat = fs.lstatSync(file);
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
      fs.unlinkSync(file);
    }
    fs.rmdirSync(root);
  }
});
test('schema4 observer calls original bootstrap authentication before schema3 container validation', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fleet-ui-schema4.cjs'), 'utf8');
  assert.ok(
    source.indexOf('persistence.authenticateBootstrap()') <
      source.indexOf('service.validate(target, receipt.header.backupId)'),
  );
  assert.ok(source.includes("chain.pending?.stage !== 'MAIN'"));
  assert.ok(source.includes("path.join(managed, 'data-main')"));
  assert.ok(source.includes('verifyBackupLocation(target.directory'));
  assert.ok(!source.includes('.migrate('));
  const observer = fs.readFileSync(path.join(__dirname, 'fleet-ui-main-probe.cjs'), 'utf8');
  assert.ok(observer.includes('await observeSchema4(launch, safeStorage)'));
  assert.ok(
    observer.indexOf('await observeSchema4(launch, safeStorage)') <
      observer.indexOf("phase = 'HYDRATE'"),
  );
});
