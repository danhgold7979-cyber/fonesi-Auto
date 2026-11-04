'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const helper = path.join(__dirname, 'persistence-control.cjs');
function fixture() {
  const base = path.resolve(__dirname, '../.test-output');
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  assert.equal(fs.realpathSync(base), base);
  const root = fs.mkdtempSync(path.join(base, 'persistence-envelope-'));
  return {
    root,
    close() {
      assert.equal(fs.realpathSync(root), root);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
function call(...args) {
  return spawnSync(process.execPath, [helper, ...args], {
    shell: false,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8192,
  });
}
function fakeDist(root) {
  fs.mkdirSync(path.join(root, '.runtime'));
  fs.mkdirSync(path.join(root, 'node_modules/electron/dist'), { recursive: true });
  for (const [name, bytes] of Object.entries({
    'electron.exe': 'synthetic-not-executable',
    version: '45.1.0',
    LICENSE: 'synthetic fixture',
    'LICENSES.chromium.html': 'synthetic fixture',
  }))
    fs.writeFileSync(path.join(root, 'node_modules/electron/dist', name), bytes, { flag: 'wx' });
}
test('runtime handoff is exact same-head inventory and rejects stale or changed bytes', () => {
  const f = fixture();
  try {
    fakeDist(f.root);
    const head = 'a'.repeat(40);
    assert.equal(call('attest-runtime', f.root, head).status, 0);
    assert.equal(call('verify-runtime', f.root, head).status, 0);
    assert.equal(call('attest-runtime', f.root, head).status, 1);
    assert.equal(call('verify-runtime', f.root, 'b'.repeat(40)).status, 1);
    fs.appendFileSync(path.join(f.root, 'node_modules/electron/dist/electron.exe'), 'changed');
    assert.equal(call('verify-runtime', f.root, head).status, 1);
  } finally {
    f.close();
  }
});
test('runtime handoff rejects extra files and duplicate/noncanonical manifest bytes', () => {
  const f = fixture();
  try {
    fakeDist(f.root);
    const head = 'a'.repeat(40);
    assert.equal(call('attest-runtime', f.root, head).status, 0);
    const manifest = path.join(f.root, '.runtime/persistence-runtime-manifest.json'),
      raw = fs.readFileSync(manifest, 'utf8');
    fs.writeFileSync(manifest, raw.replace('"version":1', '"version":0,"version":1'));
    assert.equal(call('verify-runtime', f.root, head).status, 1);
    fs.writeFileSync(manifest, raw);
    fs.writeFileSync(path.join(f.root, 'node_modules/electron/dist/unexpected.bin'), 'extra');
    assert.equal(call('verify-runtime', f.root, head).status, 1);
  } finally {
    f.close();
  }
});
test('Node profile preflight retains exclusive supervisor lease and immutable controls', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, '.owner'), crypto.randomUUID(), { flag: 'wx' });
    assert.equal(call('setup', f.root, 'source').status, 0);
    assert.equal(call('prepare', f.root, 'source', 'provision').status, 0);
    const lock = path.join(f.root, 'data-source/.writer-lock/owner.json');
    assert.equal(fs.lstatSync(lock).isFile(), true);
    assert.equal(
      fs.existsSync(path.join(f.root, 'data-source/key-profile/.key-profile-owner.json')),
      true,
    );
    const control = path.join(f.root, 'persistence-control-source-provision.json'),
      before = fs.readFileSync(control);
    assert.equal(call('prepare', f.root, 'source', 'provision').status, 1);
    assert.deepEqual(fs.readFileSync(control), before);
    assert.equal(call('prepare', f.root, 'source', 'orderly-auth').status, 1);
    assert.equal(
      fs.existsSync(path.join(f.root, 'persistence-control-source-orderly-auth.json')),
      false,
    );
  } finally {
    f.close();
  }
});
test('missing current build rejects before any compiled module is loaded', () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, 'verification'));
    fs.mkdirSync(path.join(f.root, 'scripts'));
    const copy = path.join(f.root, 'verification/persistence-control.cjs');
    fs.copyFileSync(helper, copy);
    fs.copyFileSync(
      path.resolve(__dirname, '../scripts/build-manifest.mjs'),
      path.join(f.root, 'scripts/build-manifest.mjs'),
    );
    const result = spawnSync(process.execPath, [copy, 'setup', f.root, 'source'], {
      shell: false,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 8192,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, 'PERSISTENCE_CONTROL_FAILED\n');
    assert.equal(result.stderr, '');
    assert.equal(fs.existsSync(path.join(f.root, 'data-source')), false);
  } finally {
    f.close();
  }
});
test('READY preflight requires exact existing proof and never fabricates missing durability', () => {
  const f = fixture();
  try {
    const token = crypto.randomUUID();
    fs.writeFileSync(path.join(f.root, '.owner'), token, { flag: 'wx' });
    assert.equal(call('setup', f.root, 'source').status, 0);
    assert.equal(call('prepare', f.root, 'source', 'provision').status, 0);
    const state = JSON.parse(
      fs.readFileSync(path.join(f.root, 'persistence-state-source.json'), 'utf8'),
    );
    const original = {
      storeId: state.storeId,
      backupId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
      encryptedSha256: 'a'.repeat(64),
    };
    fs.writeFileSync(
      path.join(f.root, 'persistence-witness-source.json'),
      JSON.stringify(original),
      { flag: 'wx' },
    );
    const data = path.join(f.root, 'data-source');
    assert.equal(call('prepare-ready', f.root, 'source').status, 1);
    assert.equal(fs.existsSync(path.join(data, 'key-durability-proof.json')), false);
    assert.equal(fs.existsSync(path.join(data, '.ready-launch.json')), false);
    // Synthetic parser fixture only. No provider or actual durability claim.
    fs.writeFileSync(
      path.join(data, 'key-durability-proof.json'),
      JSON.stringify({ version: 1, ...original, state: 'ORDERLY_AND_ABRUPT_RECOVERED' }),
      { flag: 'wx' },
    );
    fs.writeFileSync(
      path.join(data, 'key-profile/Local State'),
      JSON.stringify({
        os_crypt: { encrypted_key: Buffer.from('DPAPIsynthetic-only').toString('base64') },
      }),
      { flag: 'wx' },
    );
    fs.writeFileSync(
      path.join(f.root, 'persistence-runtime-attestation.json'),
      JSON.stringify({ exeSha256: 'a'.repeat(64) }),
      { flag: 'wx' },
    );
    assert.equal(call('prepare-ready', f.root, 'source').status, 0);
    const ready = JSON.parse(fs.readFileSync(path.join(data, '.ready-launch.json'), 'utf8'));
    assert.equal(ready.state, 'READY');
    assert.equal(ready.ownerToken, state.ownerToken);
    assert.equal(ready.root, data);
    assert.equal(call('prepare-ready', f.root, 'source').status, 1);
  } finally {
    f.close();
  }
});
