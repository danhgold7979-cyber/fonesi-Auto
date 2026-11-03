'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { runRecordNegative } = require('./vault-record-negative.cjs');
function fixture() {
  const parent = path.resolve(__dirname, '../.test-output');
  try {
    fs.mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  assert.equal(fs.lstatSync(parent).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(parent), parent);
  const root = fs.mkdtempSync(path.join(parent, 'vault-negative-'));
  const owner = randomUUID();
  fs.writeFileSync(path.join(root, '.owner'), owner, { flag: 'wx' });
  const directory = path.join(root, 'vault');
  fs.mkdirSync(directory);
  const target = path.join(directory, 'cipher.bin'),
    original = Buffer.from('v10-synthetic-ciphertext-only');
  fs.writeFileSync(target, original);
  fs.writeFileSync(path.join(directory, 'index.json'), '{}');
  fs.writeFileSync(path.join(directory, 'initialized.json'), '{}');
  return {
    root,
    cleanup() {
      assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
      assert.equal(fs.realpathSync(root), root);
      assert.equal(fs.readFileSync(path.join(root, '.owner'), 'utf8'), owner);
      fs.rmSync(root, { recursive: true, force: false });
    },
    directory,
    target,
    original,
    filename: 'cipher.bin',
    backupPath: path.join(root, 'original.bin'),
  };
}
for (const kind of ['missing', 'corrupt'])
  test(`${kind} exact alteration and restoration preserve all other bytes`, async () => {
    const f = fixture();
    let positives = 0;
    try {
      const result = await runRecordNegative({
        ...f,
        kind,
        readOriginal: async () => {
          assert.deepEqual(fs.readFileSync(f.target), f.original);
          positives++;
          return true;
        },
        verifyRejected: async (code) => {
          assert.equal(code, kind === 'missing' ? 'STORE_INVALID' : 'DECRYPTION_FAILED');
          if (kind === 'missing') assert.equal(fs.existsSync(f.target), false);
          else {
            const bytes = fs.readFileSync(f.target);
            assert.deepEqual(bytes.subarray(0, -1), f.original.subarray(0, -1));
            assert.notEqual(bytes.at(-1), f.original.at(-1));
          }
          return true;
        },
      });
      assert.deepEqual(result, { kind, restored: true });
      assert.equal(positives, 2);
      assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
    } finally {
      f.cleanup();
    }
  });
test('unexpected altered state is preserved without overwrite and retains original private copy', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'missing',
        readOriginal: async () => true,
        verifyRejected: async () => {
          fs.writeFileSync(f.target, 'unexpected');
          return true;
        },
      }),
      /VAULT_NEGATIVE_REJECTED/,
    );
    assert.equal(fs.readFileSync(f.target, 'utf8'), 'unexpected');
    assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
  } finally {
    f.cleanup();
  }
});
test('callback failure is not masked by successful restoration and backup remains', async () => {
  const f = fixture(),
    primary = new Error('fixed test failure');
  try {
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'corrupt',
        readOriginal: async () => true,
        verifyRejected: async () => {
          throw primary;
        },
      }),
      (error) => error === primary,
    );
    assert.deepEqual(fs.readFileSync(f.target), f.original);
    assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
  } finally {
    f.cleanup();
  }
});
test('unrelated file mutation and preexisting backup fail closed', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'corrupt',
        readOriginal: async () => true,
        verifyRejected: async () => {
          fs.writeFileSync(path.join(f.directory, 'index.json'), 'changed');
          return true;
        },
      }),
    );
    assert.notDeepEqual(fs.readFileSync(f.target), f.original);
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'missing',
        readOriginal: async () => true,
        verifyRejected: async () => true,
      }),
    );
    assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
  } finally {
    f.cleanup();
  }
});
test('bounded inventory rejects excess entries and tracks prototype-like filenames', async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.directory, '__proto__'), 'original');
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'missing',
        readOriginal: async () => true,
        verifyRejected: async () => {
          fs.writeFileSync(path.join(f.directory, '__proto__'), 'changed');
          return true;
        },
      }),
    );
    assert.equal(fs.existsSync(f.target), false);
    assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
    for (let n = 0; n < 256; n++) fs.writeFileSync(path.join(f.directory, `extra-${n}`), '');
    await assert.rejects(
      runRecordNegative({
        ...f,
        kind: 'missing',
        readOriginal: async () => true,
        verifyRejected: async () => true,
      }),
    );
  } finally {
    f.cleanup();
  }
});

test('thrown falsy callback values remain failures after verified restoration', async () => {
  for (const thrown of [undefined, null, false, 0, '']) {
    const f = fixture();
    let rejected = false;
    try {
      try {
        await runRecordNegative({
          ...f,
          kind: 'missing',
          readOriginal: async () => true,
          verifyRejected: async () => {
            throw thrown;
          },
        });
      } catch (error) {
        rejected = true;
        assert.equal(error, thrown);
      }
      assert.equal(rejected, true);
      assert.deepEqual(fs.readFileSync(f.target), f.original);
      assert.deepEqual(fs.readFileSync(f.backupPath), f.original);
    } finally {
      f.cleanup();
    }
  }
});
