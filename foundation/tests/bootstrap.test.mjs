// P1-01-S metadata tests, not the P1-03-S compiler/import harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMetadata, validateInstalled } from '../scripts/verify-bootstrap.mjs';
const review = JSON.parse(
  readFileSync(new URL('../dependency-review.json', import.meta.url), 'utf8'),
);
const check = (manifest = review.manifest, lock = review.lock, node = 'v24.22.1', npm = '11.9.0') =>
  validateMetadata(manifest, lock, review, node, npm);
test('exact reviewed metadata accepted', () => assert.equal(check(), 'METADATA_VERIFIED'));
test('wrong Node rejected', () =>
  assert.equal(check(undefined, undefined, 'v0.0.0'), 'RUNTIME_MISMATCH'));
test('wrong npm rejected', () =>
  assert.equal(check(undefined, undefined, undefined, '0.0.0'), 'RUNTIME_MISMATCH'));
test('added dependency rejected', () => {
  const value = structuredClone(review.manifest);
  value.devDependencies.unreviewed = '1.0.0';
  assert.equal(check(value), 'MANIFEST_MISMATCH');
});
test('lock version, integrity, origin and missing entry rejected', () => {
  for (const field of ['version', 'integrity', 'resolved']) {
    const value = structuredClone(review.lock);
    value.packages['node_modules/typescript'][field] = 'invalid';
    assert.equal(check(undefined, value), 'LOCK_MISMATCH');
  }
  const value = structuredClone(review.lock);
  delete value.packages['node_modules/typescript'];
  assert.equal(check(undefined, value), 'LOCK_MISMATCH');
});
test('installed version mismatch rejected', () =>
  assert.equal(
    validateInstalled({ version: '0' }, { version: '1' }),
    'INSTALLED_VERSION_MISMATCH',
  ));
test('install lifecycle hooks rejected', () => {
  for (const hook of [
    'preinstall',
    'install',
    'postinstall',
    'preprepare',
    'prepare',
    'postprepare',
    'prepublish',
    'prepublishOnly',
  ]) {
    assert.equal(
      validateInstalled({ version: '1', scripts: { [hook]: 'never run' } }, { version: '1' }),
      'INSTALL_HOOK_REJECTED',
    );
  }
});
test('installed hook-free metadata accepted', () =>
  assert.equal(
    validateInstalled({ version: '1' }, { version: '1' }),
    'INSTALLED_METADATA_VERIFIED',
  ));

test('observed Windows npm is accepted but adjacent unreviewed versions are rejected', () => {
  assert.equal(check(undefined, undefined, undefined, '11.19.1'), 'METADATA_VERIFIED');
  for (const npm of ['11.19.0', '11.19.2', '12.0.0', '11.19.1-extra']) {
    assert.equal(check(undefined, undefined, undefined, npm), 'RUNTIME_MISMATCH');
  }
});
