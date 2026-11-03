'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scanTree, CANARIES } = require('./vault-artifacts.cjs');
const { observeIndexRename } = require('./vault-denial.cjs');
function fixture() {
  const parent = path.resolve(__dirname, '../.test-output');
  try {
    fs.mkdirSync(parent);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(fs.lstatSync(parent).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(parent), parent);
  return fs.mkdtempSync(path.join(parent, 'vault-artifact-'));
}
test('bounded artifact scan detects utf8/utf16/base64 canaries and records only dump counts', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'owned.txt'), 'fixed');
    assert.deepEqual(scanTree(root), { canaryAbsent: true, fileCount: 1, dumpCount: 0 });
    for (const bytes of [
      Buffer.from(CANARIES[0]),
      Buffer.from(CANARIES[1], 'utf16le'),
      Buffer.from(Buffer.from(CANARIES[0]).toString('base64')),
    ]) {
      fs.writeFileSync(path.join(root, 'synthetic.dmp'), bytes);
      assert.deepEqual(scanTree(root), { canaryAbsent: false, fileCount: 2, dumpCount: 1 });
    }
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test('artifact scan refuses oversized and excessive-entry trees without raising caps', () => {
  const root = fixture();
  try {
    const fd = fs.openSync(path.join(root, 'large'), 'wx');
    fs.ftruncateSync(fd, 8 * 1024 * 1024 + 1);
    fs.closeSync(fd);
    assert.throws(() => scanTree(root));
    fs.unlinkSync(path.join(root, 'large'));
    for (let i = 0; i < 257; i++) fs.writeFileSync(path.join(root, String(i)), '');
    assert.throws(() => scanTree(root));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test('rename observer never manufactures denial and restores exact delegated function', async () => {
  const error = Object.assign(new Error('private'), { code: 'EACCES' });
  let fail = false;
  const args = [];
  const filesystem = {
    async rename(...values) {
      assert.equal(this, filesystem);
      args.push(values);
      if (fail) throw error;
      return 7;
    },
  };
  const original = filesystem.rename;
  const first = await observeIndexRename(filesystem, 'index', () =>
    filesystem.rename('candidate', 'index'),
  );
  assert.deepEqual(first, { result: 7, denialCode: null });
  assert.equal(filesystem.rename, original);
  fail = true;
  const second = await observeIndexRename(filesystem, 'index', async () => {
    try {
      await filesystem.rename('candidate', 'index');
    } catch (e) {
      assert.equal(e, error);
      return 'actual-failure';
    }
  });
  assert.deepEqual(second, { result: 'actual-failure', denialCode: 'EACCES' });
  assert.deepEqual(args, [
    ['candidate', 'index'],
    ['candidate', 'index'],
  ]);
  assert.equal(filesystem.rename, original);
  await assert.rejects(
    observeIndexRename(filesystem, 'index', () => filesystem.rename('candidate', 'other')),
    (e) => e === error,
  );
  assert.equal(filesystem.rename, original);
});
