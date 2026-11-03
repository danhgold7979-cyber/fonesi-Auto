// Pure main-only evidence comparison, NOT a loader, executable capability or license grant.
export type PlatformToolsFile = Readonly<{
  path: string;
  sha256: string;
  bytes: number;
  kind: 'EXECUTABLE' | 'LIBRARY' | 'NOTICE';
  licenseId: string;
}>;
export type PlatformToolsLicense = Readonly<{ id: string; noticePath: string; source: string }>;
export type PlatformToolsManifest = Readonly<{
  version: 1;
  release: '37.0.1';
  platform: 'win32';
  binaryArchitecture: 'ia32';
  hostArchitecture: 'x64';
  origin: string;
  archiveSha256: string;
  archiveBytes: number;
  files: readonly PlatformToolsFile[];
  licenses: readonly PlatformToolsLicense[];
}>;
export const PRODUCTION_PLATFORM_TOOLS: PlatformToolsManifest | null = null;
export function productionPlatformToolsStatus(): 'BINARY_UNAVAILABLE' {
  return 'BINARY_UNAVAILABLE';
}
function object(v: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const proto = Object.getPrototypeOf(v);
    if ((proto !== Object.prototype && proto !== null) || Reflect.ownKeys(v).length !== keys.length)
      return null;
    const copy: Record<string, unknown> = Object.create(null);
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!d || !('value' in d) || !d.enumerable) return null;
      copy[k] = d.value;
    }
    return copy;
  } catch {
    return null;
  }
}
function array(v: unknown, max: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) return null;
    const d = Object.getOwnPropertyDescriptor(v, 'length');
    if (
      !d ||
      !Number.isSafeInteger(d.value) ||
      d.value < 1 ||
      d.value > max ||
      Reflect.ownKeys(v).length !== d.value + 1
    )
      return null;
    const out: unknown[] = [];
    for (let i = 0; i < d.value; i++) {
      const e = Object.getOwnPropertyDescriptor(v, String(i));
      if (!e || !('value' in e) || !e.enumerable) return null;
      out.push(e.value);
    }
    return out;
  } catch {
    return null;
  }
}
const hash = (v: unknown): v is string =>
  typeof v === 'string' && v.length === 64 && /^[a-f0-9]+$/.test(v);
const positive = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max;
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(v);
function filePath(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v) &&
    !v.endsWith('.') &&
    !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(v)
  );
}
function source(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return (
      u.protocol === 'https:' && !u.username && !u.password && !u.hash && !u.search && u.href === v
    );
  } catch {
    return false;
  }
}
export function snapshotPlatformToolsManifest(input: unknown): PlatformToolsManifest | null {
  const v = object(input, [
    'version',
    'release',
    'platform',
    'binaryArchitecture',
    'hostArchitecture',
    'origin',
    'archiveSha256',
    'archiveBytes',
    'files',
    'licenses',
  ]);
  if (
    v?.version !== 1 ||
    v.release !== '37.0.1' ||
    v.platform !== 'win32' ||
    v.binaryArchitecture !== 'ia32' ||
    v.hostArchitecture !== 'x64' ||
    !source(v.origin) ||
    !/^https:\/\/dl\.google\.com\/android\/repository\/platform-tools_r37\.0\.1-win\.zip$/.test(
      v.origin,
    ) ||
    !hash(v.archiveSha256) ||
    !positive(v.archiveBytes, 512 * 1024 * 1024)
  )
    return null;
  // The versioned origin is a required candidate form, NOT a claim it was fetched or exists.
  const rawFiles = array(v.files, 256),
    rawLicenses = array(v.licenses, 64);
  if (!rawFiles || !rawLicenses) return null;
  const licenses: PlatformToolsLicense[] = [];
  let previous = '';
  for (const raw of rawLicenses) {
    const l = object(raw, ['id', 'noticePath', 'source']);
    if (!l || !id(l.id) || l.id <= previous || !filePath(l.noticePath) || !source(l.source))
      return null;
    previous = l.id;
    licenses.push(Object.freeze({ id: l.id, noticePath: l.noticePath, source: l.source }));
  }
  const files: PlatformToolsFile[] = [];
  previous = '';
  let total = 0;
  const aliases = new Set<string>();
  for (const raw of rawFiles) {
    const f = object(raw, ['path', 'sha256', 'bytes', 'kind', 'licenseId']);
    if (
      !f ||
      !filePath(f.path) ||
      f.path <= previous ||
      aliases.has(f.path.toLowerCase()) ||
      !hash(f.sha256) ||
      !positive(f.bytes, 512 * 1024 * 1024) ||
      !['EXECUTABLE', 'LIBRARY', 'NOTICE'].includes(f.kind as string) ||
      !id(f.licenseId) ||
      !licenses.some((l) => l.id === f.licenseId)
    )
      return null;
    previous = f.path;
    aliases.add(f.path.toLowerCase());
    total += f.bytes;
    if (total > 1024 * 1024 * 1024) return null;
    files.push(
      Object.freeze({
        path: f.path,
        sha256: f.sha256,
        bytes: f.bytes,
        kind: f.kind as PlatformToolsFile['kind'],
        licenseId: f.licenseId,
      }),
    );
  }
  if (
    files.filter((f) => f.kind === 'EXECUTABLE').length !== 1 ||
    !files.some((f) => f.path === 'adb.exe' && f.kind === 'EXECUTABLE') ||
    files.some((f) => f.kind === 'LIBRARY' && !f.path.endsWith('.dll')) ||
    licenses.some((l) => !files.some((f) => f.path === l.noticePath && f.kind === 'NOTICE'))
  )
    return null;
  return Object.freeze({
    version: 1,
    release: '37.0.1',
    platform: 'win32',
    binaryArchitecture: 'ia32',
    hostArchitecture: 'x64',
    origin: v.origin,
    archiveSha256: v.archiveSha256,
    archiveBytes: v.archiveBytes,
    files: Object.freeze(files),
    licenses: Object.freeze(licenses),
  });
}
export function checkPlatformToolsEvidence(
  manifest: unknown,
  evidence: unknown,
): Readonly<{ ok: true; code: 'EVIDENCE_MATCH' } | { ok: false; code: 'BINARY_UNAVAILABLE' }> {
  const no = () => Object.freeze({ ok: false as const, code: 'BINARY_UNAVAILABLE' as const });
  const m = snapshotPlatformToolsManifest(manifest);
  const e = object(evidence, [
    'manifest',
    'archiveVerified',
    'physicalFilesVerified',
    'peArchitectureVerified',
    'hostCompatibilityVerified',
    'componentLicensesReviewed',
    'originReviewed',
  ]);
  if (
    !m ||
    !e ||
    e.archiveVerified !== true ||
    e.physicalFilesVerified !== true ||
    e.peArchitectureVerified !== true ||
    e.hostCompatibilityVerified !== true ||
    e.componentLicensesReviewed !== true ||
    e.originReviewed !== true
  )
    return no();
  const observed = snapshotPlatformToolsManifest(e.manifest);
  if (!observed || JSON.stringify(m) !== JSON.stringify(observed)) return no();
  // Supplied facts are checked only; no external signature/license/native claim follows.
  return Object.freeze({ ok: true, code: 'EVIDENCE_MATCH' });
}
