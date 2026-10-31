'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, VERSIONS, parse } = require('./persistence-maintenance-contract.cjs');
const fixture = () => ({
  version: 1,
  scope: 'NATIVE_ADAPTER_MAINTENANCE',
  mode: 'source',
  versions: { ...VERSIONS },
  cases: Object.fromEntries(CASES.map((x) => [x, true])),
  ordinaryCount: 7,
  protectedCount: 1,
  releasedSafetyCount: 1,
});
test('maintenance fixed result requires all facts and exact retained counts', () => {
  const good = fixture();
  assert.equal(parse(JSON.stringify(good)).passed, true);
  for (const name of CASES) {
    const value = fixture();
    value.cases[name] = false;
    assert.equal(parse(JSON.stringify(value)).passed, false);
  }
  for (const count of [0, 6]) {
    const value = fixture();
    value.ordinaryCount = count;
    assert.equal(parse(JSON.stringify(value)).passed, false);
  }
});
test('maintenance rejects duplicate masking, private fields, nonfinite values and type coercion', () => {
  const raw = JSON.stringify(fixture());
  assert.throws(() => parse(raw.replace('"version":1', '"version":0,"version":1')));
  assert.throws(() =>
    parse(raw.replace('"retained_lease":true', '"retained_lease":false,"retained_lease":true')),
  );
  for (const value of [null, true, '7', 8]) {
    const v = fixture();
    v.ordinaryCount = value;
    assert.throws(() => parse(JSON.stringify(v)));
  }
  const v = fixture();
  v.path = 'private';
  assert.throws(() => parse(JSON.stringify(v)));
  assert.throws(() => parse(raw.replace('"ordinaryCount":7', '"ordinaryCount":NaN')));
  assert.throws(() => parse(' '.repeat(65537)));
});
test('maintenance diagnostics emit only exact fixed stages and codes without exception echo', () => {
  const { STAGES, CODES, diagnostic } = require('./persistence-maintenance-contract.cjs');
  for (const stage of STAGES) {
    for (const code of CODES) {
      assert.equal(
        diagnostic(stage, new Error(code)),
        `PERSISTENCE_MAINTENANCE_STAGE_${stage}_CODE_${code}`,
      );
    }
  }
  for (const error of [
    new Error('private/path secret'),
    new Error('backup'),
    { message: 'BACKUP' },
    'BACKUP',
    null,
  ]) {
    assert.equal(diagnostic('KEYS', error), 'PERSISTENCE_MAINTENANCE_STAGE_KEYS_CODE_UNCLASSIFIED');
  }
  assert.equal(
    diagnostic('private stage', new Error('BACKUP')),
    'PERSISTENCE_MAINTENANCE_STAGE_UNCLASSIFIED_CODE_BACKUP',
  );
  const hostile = new Error();
  Object.defineProperty(hostile, 'message', {
    get() {
      throw new Error('private');
    },
  });
  assert.equal(diagnostic('OPEN', hostile), 'PERSISTENCE_MAINTENANCE_STAGE_OPEN_CODE_UNCLASSIFIED');
});
test('restore diagnostic codes are exact and delegate unchanged arguments, receiver, result and errors', async () => {
  const { diagnostic, traceRestore } = require('./persistence-maintenance-contract.cjs');
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'ENAMETOOLONG']) {
    assert.equal(
      diagnostic('RESTORE_COPY', Object.assign(new Error('private'), { code })),
      `PERSISTENCE_MAINTENANCE_STAGE_RESTORE_COPY_CODE_${code}`,
    );
  }
  for (const [errcode, code] of [
    [8, 'SQLITE_READONLY'],
    [14, 'SQLITE_CANTOPEN'],
    [13, 'SQLITE_FULL'],
    [5, 'SQLITE_BUSY'],
    ['8', 'ERR_SQLITE_ERROR'],
    [99, 'ERR_SQLITE_ERROR'],
  ]) {
    assert.equal(
      diagnostic(
        'RESTORE_COPY',
        Object.assign(new Error('private'), { code: 'ERR_SQLITE_ERROR', errcode }),
      ),
      `PERSISTENCE_MAINTENANCE_STAGE_RESTORE_COPY_CODE_${code}`,
    );
  }
  assert.equal(
    diagnostic('RESTORE_COPY', Object.assign(new Error('private'), { code: 'private' })),
    'PERSISTENCE_MAINTENANCE_STAGE_RESTORE_COPY_CODE_UNCLASSIFIED',
  );
  const argument = {},
    result = {},
    failure = new Error('private');
  let fail = false;
  const stages = [];
  const service = {
    backups: {
      async restoreToNew(value) {
        assert.equal(this, service.backups);
        assert.equal(value, argument);
        if (fail) throw failure;
        return result;
      },
    },
    async restore(value) {
      assert.equal(this, service);
      return this.backups.restoreToNew(value);
    },
  };
  const original = service.restore,
    copy = service.backups.restoreToNew;
  assert.equal(
    await traceRestore(
      service,
      (x) => stages.push(x),
      () => service.restore(argument),
    ),
    result,
  );
  assert.deepEqual(stages, ['RESTORE_SERVICE', 'RESTORE_COPY', 'RESTORE_METADATA']);
  assert.equal(service.restore, original);
  assert.equal(service.backups.restoreToNew, copy);
  fail = true;
  stages.length = 0;
  await assert.rejects(
    traceRestore(
      service,
      (x) => stages.push(x),
      () => service.restore(argument),
    ),
    (e) => e === failure,
  );
  assert.deepEqual(stages, ['RESTORE_SERVICE', 'RESTORE_COPY']);
  assert.equal(service.restore, original);
  assert.equal(service.backups.restoreToNew, copy);
});
