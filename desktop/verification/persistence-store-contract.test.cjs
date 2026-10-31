'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const {
  parseControl,
  caseNames,
  validateResult,
  installCommitCrash,
} = require('./persistence-store-contract.cjs');
const control = () => ({
  version: 1,
  mode: 'source',
  stage: 'crash',
  boundary: 'BEFORE_COMMIT',
  parentToken: randomUUID(),
  ownerToken: randomUUID(),
  storeId: randomUUID(),
  fixtureId: randomUUID(),
  checkpoint: `key-checkpoint-${randomUUID()}.json`,
});
test('private control is exact canonical bounded and rejects duplicate/unknown/path input', () => {
  const c = control(),
    raw = JSON.stringify(c);
  assert.deepEqual(parseControl(raw), c);
  for (const s of [
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...c, path: '/private' }),
    JSON.stringify({ ...c, checkpoint: '../key.json' }),
    JSON.stringify({ ...c, boundary: 'AFTER' }),
    JSON.stringify({ ...c, ownerToken: 123 }),
    ` ${raw}`,
    'x'.repeat(65537),
  ])
    assert.equal(parseControl(s), null);
});
test('fixed public result excludes private fields and preserves false predicates', () => {
  for (const stage of ['crash', 'reopen']) {
    const r = {
      version: 1,
      mode: 'source',
      stage,
      boundary: 'BEFORE_COMMIT',
      cases: Object.fromEntries(caseNames(stage).map((k) => [k, true])),
    };
    assert.deepEqual(validateResult(JSON.stringify(r)), r);
    r.cases.leaseVerified = false;
    assert.equal(validateResult(JSON.stringify(r)).cases.leaseVerified, false);
    assert.equal(validateResult(JSON.stringify({ ...r, fixtureId: randomUUID() })), null);
    assert.equal(
      validateResult(
        JSON.stringify(r).replace(
          '"leaseVerified":false',
          '"leaseVerified":false,"leaseVerified":true',
        ),
      ),
      null,
    );
  }
});
test('before COMMIT injection never executes native commit; other SQL remains real', () => {
  const calls = [],
    c = {
      exec(sql) {
        calls.push(sql);
      },
    };
  const restore = installCommitCrash(c, 'BEFORE_COMMIT', () => {
    calls.push('CRASH');
    throw new Error('STOP');
  });
  c.exec('BEGIN IMMEDIATE');
  assert.throws(() => c.exec('COMMIT'), { message: 'STOP' });
  assert.deepEqual(calls, ['BEGIN IMMEDIATE', 'CRASH']);
  restore();
  c.exec('COMMIT');
  assert.equal(calls.at(-1), 'COMMIT');
});
test('after COMMIT injection occurs only after native commit returned, and only first exact COMMIT', () => {
  const calls = [],
    c = {
      exec(sql) {
        calls.push(sql);
      },
    };
  installCommitCrash(c, 'AFTER_COMMIT', () => {
    calls.push('CRASH');
    throw new Error('STOP');
  });
  c.exec('COMMIT;');
  assert.throws(() => c.exec('COMMIT'), { message: 'STOP' });
  c.exec('COMMIT');
  assert.deepEqual(calls, ['COMMIT;', 'COMMIT', 'CRASH', 'COMMIT']);
});
test('native COMMIT failure never claims after-commit boundary; returning crash callback fails closed', () => {
  let fired = false;
  const c = {
    exec() {
      throw new Error('NATIVE_FAILED');
    },
  };
  installCommitCrash(c, 'AFTER_COMMIT', () => {
    fired = true;
  });
  assert.throws(() => c.exec('COMMIT'), { message: 'NATIVE_FAILED' });
  assert.equal(fired, false);
  const d = { exec() {} };
  installCommitCrash(d, 'BEFORE_COMMIT', () => {});
  assert.throws(() => d.exec('COMMIT'), { message: 'STORE_CRASH_RETURNED' });
});
test('durability proof requires every exact canonical witness field, no duplicate or unknown keys', () => {
  const { parseDurabilityProof } = require('./persistence-store-contract.cjs');
  const p = {
      version: 1,
      storeId: randomUUID(),
      backupId: randomUUID(),
      locationId: randomUUID(),
      encryptedSha256: 'a'.repeat(64),
      state: 'ORDERLY_AND_ABRUPT_RECOVERED',
    },
    raw = JSON.stringify(p);
  assert.deepEqual(parseDurabilityProof(raw), p);
  for (const value of [
    raw.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...p, extra: true }),
    JSON.stringify({ ...p, backupId: null }),
    JSON.stringify({ ...p, encryptedSha256: 'x' }),
    JSON.stringify({ ...p, state: 'AVAILABLE' }),
    `${raw} `,
  ])
    assert.equal(parseDurabilityProof(value), null);
});
