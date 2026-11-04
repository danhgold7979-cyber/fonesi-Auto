import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, readdir, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createPlatformToolsProvisioner } from '../src/main/platform-tools-provisioner.ts';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import {
  PLATFORM_TOOLS_CANDIDATE,
  PLATFORM_TOOLS_PRIOR_36_CANDIDATE,
} from '../src/main/platform-tools-candidate.ts';
import {
  PLATFORM_TOOLS_INSTALL_TARGET,
  PLATFORM_TOOLS_KNOWN_CANDIDATES,
  assertPlatformToolsCandidate,
  resolvePlatformToolsCandidate,
} from '../src/main/platform-tools-catalog.ts';
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const data = (v) => 'data:text/javascript;base64,' + Buffer.from(v).toString('base64');
async function catalog(entries, target) {
  let source = readFileSync(
    new URL('../src/main/platform-tools-catalog.ts', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('const KNOWN:'),
    end = source.indexOf('const MAX =');
  assert.ok(start > 0 && end > start);
  source =
    source.slice(0, start) +
    `const KNOWN = ${JSON.stringify(entries)};\nconst INSTALL_TARGET_SHA256 = ${JSON.stringify(target)};\n` +
    source.slice(end);
  source = source.replace(
    "'./platform-tools-candidate.ts'",
    JSON.stringify(new URL('../src/main/platform-tools-candidate.ts', import.meta.url).href),
  );
  return import(
    data(transformSync(source, { loader: 'ts', format: 'esm', target: 'es2022' }).code)
  );
}
function synthetic(release, digit, flags = {}) {
  return {
    candidate: {
      ...PLATFORM_TOOLS_CANDIDATE,
      release,
      archive: {
        ...PLATFORM_TOOLS_CANDIDATE.archive,
        url: `https://dl.google.com/android/repository/platform-tools_r${release}-win.zip`,
        sha256: digit.repeat(64),
      },
    },
    activationAllowed: true,
    launchAllowed: true,
    ...flags,
  };
}
test('production catalog retains exact current-target canonical bytes and denies manufactured handles', () => {
  assert.equal(PLATFORM_TOOLS_KNOWN_CANDIDATES.length, 2);
  assert.equal(
    JSON.stringify(PLATFORM_TOOLS_INSTALL_TARGET.candidate),
    JSON.stringify(PLATFORM_TOOLS_CANDIDATE),
  );
  assert.equal(PLATFORM_TOOLS_INSTALL_TARGET.manifestSha256, hash(PLATFORM_TOOLS_CANDIDATE));
  assert.equal(
    hash(PLATFORM_TOOLS_CANDIDATE),
    'c25bfa88262b14a61a41c3ed4434a6b84bb66575f070e4bb3204fa1cbd67f54b',
  );
  assert.equal(
    resolvePlatformToolsCandidate(PLATFORM_TOOLS_CANDIDATE.archive.sha256),
    PLATFORM_TOOLS_INSTALL_TARGET,
  );
  assert.equal(resolvePlatformToolsCandidate('0'.repeat(64)), null);
  assertPlatformToolsCandidate(PLATFORM_TOOLS_INSTALL_TARGET);
  assert.throws(
    () => assertPlatformToolsCandidate({ ...PLATFORM_TOOLS_INSTALL_TARGET }),
    /RECOVERY_REQUIRED/,
  );
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_INSTALL_TARGET.candidate.files[0]));
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_INSTALL_TARGET.versionObservation));
});
test('synthetic known history remains resolvable independently of activation and launch policy', async () => {
  const a = synthetic('35.0.0', 'b', { activationAllowed: false, launchAllowed: false }),
    b = synthetic('36.0.0', 'a');
  const c = await catalog([a, b], b.candidate.archive.sha256);
  assert.equal(c.PLATFORM_TOOLS_INSTALL_TARGET.candidate.release, '36.0.0');
  const prior = c.resolvePlatformToolsCandidate(a.candidate.archive.sha256);
  assert.equal(prior.activationAllowed, false);
  assert.equal(prior.launchAllowed, false);
  c.assertPlatformToolsCandidate(prior);
  assert.deepEqual(
    c.PLATFORM_TOOLS_KNOWN_CANDIDATES.map((e) => e.candidate.archive.sha256),
    ['a'.repeat(64), 'b'.repeat(64)],
  );
  assert.equal(prior.versionObservation.release, '35.0.0');
});
test('catalog rejects unsupported target, duplicate history, malformed release and inventory before admission', async () => {
  const a = synthetic('35.0.0', 'a');
  for (const [entries, target] of [
    [[], 'a'.repeat(64)],
    [[a], 'f'.repeat(64)],
    [[a, a], a.candidate.archive.sha256],
    [[{ ...a, activationAllowed: false }], a.candidate.archive.sha256],
    [[synthetic('35.0.0\n', 'a')], a.candidate.archive.sha256],
    [
      [{ ...a, candidate: { ...a.candidate, files: a.candidate.files.slice(1) } }],
      a.candidate.archive.sha256,
    ],
  ])
    await assert.rejects(catalog(entries, target), /RECOVERY_REQUIRED/);
});

test('reviewed prior36 metadata exactly matches canonical measured inventory without changing current target', () => {
  const raw = readFileSync(
    new URL('../verification/platform-tools-prior-36-candidate.json', import.meta.url),
  );
  assert.equal(raw.length, 2276);
  assert.equal(
    createHash('sha256').update(raw).digest('hex'),
    'dce9a38e3cb81111112690118ec842bce9f634e666517dc2fd4a02042fda098c',
  );
  assert.equal(raw.toString('utf8'), JSON.stringify(PLATFORM_TOOLS_PRIOR_36_CANDIDATE));
  const prior = resolvePlatformToolsCandidate(
    '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c',
  );
  assert.equal(prior.candidate.release, '36.0.0');
  assert.equal(prior.candidate.archive.bytes, 7138784);
  assert.equal(
    prior.manifestSha256,
    'dce9a38e3cb81111112690118ec842bce9f634e666517dc2fd4a02042fda098c',
  );
  assert.equal(
    prior.candidate.files.reduce((sum, row) => sum + row.bytes, 0),
    15373885,
  );
  assert.equal(
    prior.candidate.files.filter((row) => row.peMachine === 332 && row.peMagic === 267).length,
    11,
  );
  assert.equal(prior.activationAllowed, true);
  assert.equal(prior.launchAllowed, true);
  assertPlatformToolsCandidate(prior);
  assert.throws(
    () => assertPlatformToolsCandidate({ ...prior, candidate: { ...prior.candidate } }),
    /RECOVERY_REQUIRED/,
  );
  assert.equal(
    resolvePlatformToolsCandidate(
      '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107d',
    ),
    null,
  );
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_PRIOR_36_CANDIDATE));
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_PRIOR_36_CANDIDATE.archive));
  assert.ok(Object.isFrozen(PLATFORM_TOOLS_PRIOR_36_CANDIDATE.files));
  assert.ok(PLATFORM_TOOLS_PRIOR_36_CANDIDATE.files.every(Object.isFrozen));
  assert.notEqual(prior, PLATFORM_TOOLS_INSTALL_TARGET);
  assert.equal(PLATFORM_TOOLS_INSTALL_TARGET.candidate.release, '37.0.1');
});

test('known prior metadata alone creates neither installed runtime nor rollback authority', async () => {
  const base = await realpath(new URL('../.test-output', import.meta.url));
  const root = await mkdtemp(join(base, 'catalog-empty-')),
    storeId = randomUUID();
  const core = createPlatformToolsProvisioner({
    dataRoot: root,
    storeId,
    assertOwnedSync() {},
    assertIdleSync() {},
    assertDataLocation(p) {
      assert.equal(p, root);
    },
    clock: () => 1000,
    newId: randomUUID,
    recipient: { read: () => null, isCurrent: () => false },
  });
  try {
    const status = await core.status();
    assert.equal(status.status, 'NOT_PROVISIONED');
    assert.equal(status.activeVersion, null);
    assert.equal(status.previousVersion, null);
    assert.equal(status.rollbackAvailable, false);
    assert.equal((await core.run({}, 0, 'ROLLBACK')).code, 'TERMS_REQUIRED');
    assert.deepEqual(await readdir(root), []);
  } finally {
    assert.equal(await core.close(), 'RETIRED');
    await rmdir(root);
  }
});
