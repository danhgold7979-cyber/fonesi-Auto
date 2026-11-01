import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { PLATFORM_TOOLS_CANDIDATE } from '../src/main/platform-tools-candidate.ts';
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
test('production catalog retains exact sole pin canonical bytes and denies manufactured handles', () => {
  assert.equal(PLATFORM_TOOLS_KNOWN_CANDIDATES.length, 1);
  assert.equal(
    JSON.stringify(PLATFORM_TOOLS_INSTALL_TARGET.candidate),
    JSON.stringify(PLATFORM_TOOLS_CANDIDATE),
  );
  assert.equal(PLATFORM_TOOLS_INSTALL_TARGET.manifestSha256, hash(PLATFORM_TOOLS_CANDIDATE));
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
