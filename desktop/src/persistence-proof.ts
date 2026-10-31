export const RUNTIME_CERTIFICATION = 'ELECTRON_45_1_0_WIN_X64_DPAPI_V1' as const;
export type OriginalBackupWitness = Readonly<{
  storeId: string;
  backupId: string;
  locationId: string;
  encryptedSha256: string;
}>;
export type PersistenceProof = OriginalBackupWitness &
  (
    | Readonly<{ version: 1; state: 'ORDERLY_AND_ABRUPT_RECOVERED' }>
    | Readonly<{
        version: 2;
        state: 'ORDERLY_REOPEN_AUTHENTICATED';
        runtimeCertification: typeof RUNTIME_CERTIFICATION;
      }>
  );
export type PersistenceRuntimeFacts = Readonly<{
  platform: string;
  arch: string;
  electron: string;
  node: string;
  chrome: string;
  provenance: Readonly<{
    officialDistributionVerified: boolean;
    reviewedKeyProfileImplementation: boolean;
  }>;
}>;
const witnessKeys = ['storeId', 'backupId', 'locationId', 'encryptedSha256'] as const;
function record(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (
      Object.getOwnPropertySymbols(input).length ||
      Object.getOwnPropertyNames(input).length !== keys.length
    )
      return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d || !('value' in d) || !d.enumerable) return null;
      result[key] = d.value;
    }
    return result;
  } catch {
    return null;
  }
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function witness(input: unknown): OriginalBackupWitness | null {
  const v = record(input, witnessKeys);
  if (
    !v ||
    ![v.storeId, v.backupId, v.locationId].every(uuid) ||
    typeof v.encryptedSha256 !== 'string' ||
    v.encryptedSha256.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(v.encryptedSha256)
  )
    return null;
  return Object.freeze({
    storeId: v.storeId as string,
    backupId: v.backupId as string,
    locationId: v.locationId as string,
    encryptedSha256: v.encryptedSha256,
  });
}
function normalized(input: unknown): PersistenceProof | null {
  let v = record(input, ['version', ...witnessKeys, 'state']);
  if (v?.version === 1 && v.state === 'ORDERLY_AND_ABRUPT_RECOVERED') {
    const w = witness(Object.fromEntries(witnessKeys.map((k) => [k, v?.[k]])));
    return w ? Object.freeze({ version: 1, ...w, state: 'ORDERLY_AND_ABRUPT_RECOVERED' }) : null;
  }
  v = record(input, ['version', ...witnessKeys, 'state', 'runtimeCertification']);
  if (
    v?.version === 2 &&
    v.state === 'ORDERLY_REOPEN_AUTHENTICATED' &&
    v.runtimeCertification === RUNTIME_CERTIFICATION
  ) {
    const w = witness(Object.fromEntries(witnessKeys.map((k) => [k, v?.[k]])));
    return w
      ? Object.freeze({
          version: 2,
          ...w,
          state: 'ORDERLY_REOPEN_AUTHENTICATED',
          runtimeCertification: RUNTIME_CERTIFICATION,
        })
      : null;
  }
  return null;
}
export function serializePersistenceProof(input: unknown): string | null {
  const p = normalized(input);
  return p ? JSON.stringify(p) : null;
}
export function parsePersistenceProof(raw: unknown): PersistenceProof | null {
  try {
    if (
      typeof raw !== 'string' ||
      raw.length > 65536 ||
      new TextEncoder().encode(raw).length > 65536
    )
      return null;
    const value = normalized(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function proofMatchesWitness(input: unknown, original: unknown): boolean {
  const proof = normalized(input),
    expected = witness(original);
  return !!proof && !!expected && witnessKeys.every((key) => proof[key] === expected[key]);
}
// These are facts supplied by trusted native admission after actual runtime/build
// inspection. This pure predicate cannot itself inspect binaries, provider code,
// a process, or a store. A certification identifier alone is never accepted.
export function certifiedPersistenceRuntime(input: unknown): boolean {
  const v = record(input, ['platform', 'arch', 'electron', 'node', 'chrome', 'provenance']);
  if (
    v?.platform !== 'win32' ||
    v.arch !== 'x64' ||
    v.electron !== '45.1.0' ||
    v.node !== '24.22.1' ||
    v.chrome !== '156.0.8078.49'
  )
    return false;
  const p = record(v.provenance, [
    'officialDistributionVerified',
    'reviewedKeyProfileImplementation',
  ]);
  return p?.officialDistributionVerified === true && p.reviewedKeyProfileImplementation === true;
}
// Both historical v1 and new v2 require current runtime certification AND fresh
// original-backup authentication supplied by the caller; neither proof is promoted.
export function admitPersistenceProof(
  raw: unknown,
  original: unknown,
  runtime: unknown,
): PersistenceProof | null {
  if (!certifiedPersistenceRuntime(runtime)) return null;
  const p = parsePersistenceProof(raw);
  return p && proofMatchesWitness(p, original) ? p : null;
}
