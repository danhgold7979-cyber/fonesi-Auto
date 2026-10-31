import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  RUNTIME_CERTIFICATION,
  parsePersistenceProof,
  serializePersistenceProof,
  proofMatchesWitness,
  certifiedPersistenceRuntime,
  admitPersistenceProof,
} from '../src/persistence-proof.ts';
const original = () => ({
  storeId: randomUUID(),
  backupId: randomUUID(),
  locationId: randomUUID(),
  encryptedSha256: 'abcdef01'.repeat(8),
});
const proof = (version, w = original()) =>
  version === 1
    ? { version: 1, ...w, state: 'ORDERLY_AND_ABRUPT_RECOVERED' }
    : {
        version: 2,
        ...w,
        state: 'ORDERLY_REOPEN_AUTHENTICATED',
        runtimeCertification: RUNTIME_CERTIFICATION,
      };
const runtime = () => ({
  platform: 'win32',
  arch: 'x64',
  electron: '45.1.0',
  node: '24.22.1',
  chrome: '156.0.8078.49',
  provenance: { officialDistributionVerified: true, reviewedKeyProfileImplementation: true },
});
test('exact v1 and v2 canonical proofs preserve distinct meaning without promotion', () => {
  for (const version of [1, 2]) {
    const p = proof(version),
      raw = JSON.stringify(p);
    assert.equal(serializePersistenceProof(p), raw);
    assert.deepEqual(parsePersistenceProof(raw), p);
    assert.equal(Object.isFrozen(parsePersistenceProof(raw)), true);
    assert.equal(parsePersistenceProof(raw).version, version);
  }
});
test('canonical parsing rejects duplicate escaped duplicate unknown extra whitespace/order keys', () => {
  for (const version of [1, 2]) {
    const p = proof(version),
      raw = JSON.stringify(p);
    for (const bad of [
      raw.replace(`"version":${version}`, `"version":${version},"version":${version}`),
      raw.replace(`"version":${version}`, `"version":${version},"\\u0076ersion":${version}`),
      JSON.stringify({ ...p, extra: true }),
      ` ${raw}`,
      `${raw}\n`,
      JSON.stringify({ state: p.state, ...p }),
    ])
      assert.equal(parsePersistenceProof(bad), null);
  }
});
test('UUID/hash/version/state/certificate grammar rejects coercion and nearby values', () => {
  for (const version of [1, 2]) {
    const p = proof(version);
    for (const key of ['storeId', 'backupId', 'locationId'])
      for (const bad of [null, 1, `${p[key]}\n`, 'A'.repeat(36)])
        assert.equal(serializePersistenceProof({ ...p, [key]: bad }), null);
    for (const bad of ['', p.encryptedSha256.toUpperCase(), `${p.encryptedSha256}\n`, 123])
      assert.equal(serializePersistenceProof({ ...p, encryptedSha256: bad }), null);
    for (const bad of [true, '1', 0, 3, -1, NaN])
      assert.equal(serializePersistenceProof({ ...p, version: bad }), null);
    assert.equal(serializePersistenceProof({ ...p, state: 'READY' }), null);
  }
  const p = proof(2);
  assert.equal(
    serializePersistenceProof({ ...p, runtimeCertification: 'ELECTRON_45_1_1_WIN_X64_DPAPI_V1' }),
    null,
  );
  assert.equal(
    serializePersistenceProof({ ...proof(1), runtimeCertification: RUNTIME_CERTIFICATION }),
    null,
  );
});
test('runtime gate requires exact platform architecture bundled versions and both provenance facts', () => {
  const r = runtime();
  assert.equal(certifiedPersistenceRuntime(r), true);
  for (const [key, values] of Object.entries({
    platform: ['linux', 'darwin', 'Win32'],
    arch: ['arm64', 'ia32', 'X64'],
    electron: ['45.1.1', '45.0.0', '45.1.0 '],
    node: ['24.22.0', '24.22.2', '25.0.0'],
    chrome: ['156.0.8078.48', '156.0.8078.50', '156.0.8078.49 '],
  }))
    for (const value of values)
      assert.equal(certifiedPersistenceRuntime({ ...r, [key]: value }), false);
  for (const key of Object.keys(r.provenance))
    for (const value of [false, 1, 'true', null])
      assert.equal(
        certifiedPersistenceRuntime({ ...r, provenance: { ...r.provenance, [key]: value } }),
        false,
      );
  assert.equal(certifiedPersistenceRuntime(RUNTIME_CERTIFICATION), false);
  assert.equal(certifiedPersistenceRuntime({ ...r, certification: RUNTIME_CERTIFICATION }), false);
  assert.equal(
    certifiedPersistenceRuntime({ ...r, provenance: { ...r.provenance, extra: true } }),
    false,
  );
});
test('every original witness component must match for both proof forms and current runtime is mandatory', () => {
  for (const version of [1, 2]) {
    const w = original(),
      p = proof(version, w),
      raw = JSON.stringify(p);
    assert.equal(proofMatchesWitness(p, w), true);
    assert.deepEqual(admitPersistenceProof(raw, w, runtime()), p);
    for (const key of Object.keys(w)) {
      const bad = { ...w, [key]: key === 'encryptedSha256' ? 'b'.repeat(64) : randomUUID() };
      assert.equal(proofMatchesWitness(p, bad), false);
      assert.equal(admitPersistenceProof(raw, bad, runtime()), null);
    }
    assert.equal(admitPersistenceProof(raw, w, { ...runtime(), platform: 'linux' }), null);
    assert.equal(admitPersistenceProof(raw, { ...w, extra: true }, runtime()), null);
  }
});
test('descriptor-only admission does not run ordinary getters or accept exotic prototypes', () => {
  let calls = 0;
  const p = proof(2);
  Object.defineProperty(p, 'storeId', {
    get() {
      calls++;
      return randomUUID();
    },
    enumerable: true,
  });
  assert.equal(serializePersistenceProof(p), null);
  const r = runtime();
  Object.defineProperty(r.provenance, 'officialDistributionVerified', {
    get() {
      calls++;
      return true;
    },
    enumerable: true,
  });
  assert.equal(certifiedPersistenceRuntime(r), false);
  assert.equal(calls, 0);
  const inherited = Object.create(proof(1));
  assert.equal(serializePersistenceProof(inherited), null);
  const symbol = proof(1);
  symbol[Symbol('extra')] = true;
  assert.equal(serializePersistenceProof(symbol), null);
});
test('bounds malformed JSON and alternate spelling reject without throwing', () => {
  for (const raw of [
    null,
    123,
    '',
    'x'.repeat(65537),
    '['.repeat(2000),
    `\ufeff${JSON.stringify(proof(1))}`,
    JSON.stringify(proof(1)).replace('"version":1', '"version":1.0'),
  ])
    assert.equal(parsePersistenceProof(raw), null);
});
