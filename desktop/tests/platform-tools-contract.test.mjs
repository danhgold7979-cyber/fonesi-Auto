import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotPlatformToolsManifest as snapshot,
  checkPlatformToolsEvidence as check,
  PRODUCTION_PLATFORM_TOOLS,
  productionPlatformToolsStatus,
} from '../src/main/platform-tools-contract.ts';
const fixture = () => ({
  version: 1,
  release: '37.0.1',
  platform: 'win32',
  binaryArchitecture: 'ia32',
  hostArchitecture: 'x64',
  origin: 'https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip',
  archiveSha256: 'a'.repeat(64),
  archiveBytes: 100,
  files: [
    {
      path: 'NOTICE.txt',
      sha256: 'b'.repeat(64),
      bytes: 10,
      kind: 'NOTICE',
      licenseId: 'SYNTHETIC',
    },
    {
      path: 'adb.exe',
      sha256: 'c'.repeat(64),
      bytes: 20,
      kind: 'EXECUTABLE',
      licenseId: 'SYNTHETIC',
    },
  ],
  licenses: [
    {
      id: 'SYNTHETIC',
      noticePath: 'NOTICE.txt',
      source: 'https://example.invalid/synthetic-license',
    },
  ],
});
const evidence = (m) => ({
  manifest: m,
  archiveVerified: true,
  physicalFilesVerified: true,
  peArchitectureVerified: true,
  hostCompatibilityVerified: true,
  componentLicensesReviewed: true,
  originReviewed: true,
});
test('synthetic manifest evidence compares complete immutable closure; production remains unavailable', () => {
  const m = fixture(),
    s = snapshot(m);
  assert.ok(s);
  m.files[1].bytes = 99;
  assert.equal(s.files[1].bytes, 20);
  assert.ok(Object.isFrozen(s.files[1]));
  assert.deepEqual(check(s, evidence(s)), { ok: true, code: 'EVIDENCE_MATCH' });
  assert.equal(PRODUCTION_PLATFORM_TOOLS, null);
  assert.equal(productionPlatformToolsStatus(), 'BINARY_UNAVAILABLE');
  for (const k of Object.keys(evidence(s)).filter((k) => k !== 'manifest'))
    assert.equal(check(s, { ...evidence(s), [k]: false }).ok, false);
  const different = fixture();
  different.files[1].sha256 = 'd'.repeat(64);
  assert.equal(check(s, evidence(different)).ok, false);
});
test('wrong version origin architecture hashes closure aliases and absent notice reject', () => {
  for (const patch of [
    { version: 2 },
    { release: '34.0.5' },
    { binaryArchitecture: 'x64' },
    { hostArchitecture: 'arm64' },
    { platform: 'linux' },
    { origin: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' },
    { origin: 'https://dl.google.com/android/repository/platform-tools_r37.0.1-windows.zip' },
    { archiveSha256: 'x'.repeat(64) },
    { archiveBytes: 0 },
    { extra: true },
  ])
    assert.equal(snapshot({ ...fixture(), ...patch }), null);
  for (const mutate of [
    (m) => m.files.reverse(),
    (m) => (m.files[1].path = '../adb.exe'),
    (m) => (m.files[1].path = 'NUL.exe'),
    (m) => (m.files[1].bytes = Infinity),
    (m) => (m.files[1].licenseId = 'UNKNOWN'),
    (m) => (m.licenses[0].noticePath = 'missing.txt'),
    (m) => m.files.push({ ...m.files[1], path: 'adb.EXE' }),
    (m) => (m.files[1].path = 'fastboot.exe'),
  ]) {
    const m = fixture();
    mutate(m);
    assert.equal(snapshot(m), null);
  }
});
test('descriptor admission does not execute getters or coerce inputs', () => {
  let n = 0;
  const m = fixture();
  Object.defineProperty(m, 'origin', {
    enumerable: true,
    get() {
      n++;
      return 'x';
    },
  });
  assert.equal(snapshot(m), null);
  assert.equal(n, 0);
  const a = fixture();
  Object.defineProperty(a.files, '1', {
    get() {
      n++;
      return {};
    },
    enumerable: true,
  });
  assert.equal(snapshot(a), null);
  assert.equal(n, 0);
  assert.equal(
    snapshot(
      new Proxy(
        {},
        {
          ownKeys() {
            throw Error('private');
          },
        },
      ),
    ),
    null,
  );
  assert.equal(check(null, evidence(fixture())).ok, false);
});
