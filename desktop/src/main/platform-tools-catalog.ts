// Build-owned byte metadata and eligibility, never recipient consent or execution authority.
import { createHash } from 'node:crypto';
import {
  PLATFORM_TOOLS_CANDIDATE,
  PLATFORM_TOOLS_PRIOR_36_CANDIDATE,
} from './platform-tools-candidate.ts';

export type PlatformToolsCandidate = Readonly<{
  schema: 1;
  release: string;
  archive: Readonly<{ url: string; bytes: number; sha256: string }>;
  files: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
    peMachine: number | null;
    peMagic: number | null;
  }>[];
}>;
export type PlatformToolsCatalogEntry = Readonly<{
  candidate: PlatformToolsCandidate;
  manifestSha256: string;
  activationAllowed: boolean;
  launchAllowed: boolean;
  versionObservation: Readonly<{
    protocol: '1.0.41';
    release: string;
    buildGrammar: 'DECIMAL_1_20';
  }>;
}>;

// Only reviewed, source-owned entries belong here. Tests transform this module;
// there is no runtime candidate/catalog injection or disk policy loader.
const KNOWN: readonly Readonly<{
  candidate: PlatformToolsCandidate;
  activationAllowed: boolean;
  launchAllowed: boolean;
}>[] = [
  { candidate: PLATFORM_TOOLS_CANDIDATE, activationAllowed: true, launchAllowed: true },
  { candidate: PLATFORM_TOOLS_PRIOR_36_CANDIDATE, activationAllowed: true, launchAllowed: true },
];
const INSTALL_TARGET_SHA256 = PLATFORM_TOOLS_CANDIDATE.archive.sha256;
const MAX = 128 * 1024 * 1024;
const NAMES = [
  'AdbWinApi.dll',
  'AdbWinUsbApi.dll',
  'NOTICE.txt',
  'adb.exe',
  'etc1tool.exe',
  'fastboot.exe',
  'hprof-conv.exe',
  'libwinpthread-1.dll',
  'make_f2fs.exe',
  'make_f2fs_casefold.exe',
  'mke2fs.conf',
  'mke2fs.exe',
  'source.properties',
  'sqlite3.exe',
];
const hash = (v: unknown): v is string =>
  typeof v === 'string' && v.length === 64 && /^[0-9a-f]{64}$/.test(v);
const size = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= MAX;
function fail(): never {
  throw Error('RECOVERY_REQUIRED');
}
const identities = new Set<PlatformToolsCatalogEntry>();
const byDigest = new Map<string, PlatformToolsCatalogEntry>();
const releases = new Set<string>(),
  manifests = new Set<string>();
if (KNOWN.length < 1 || KNOWN.length > 4) fail();
const entries = KNOWN.map(({ candidate: source, activationAllowed, launchAllowed }) => {
  if (
    source.schema !== 1 ||
    typeof source.release !== 'string' ||
    source.release.length > 32 ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(source.release) ||
    /[^0-9.]/.test(source.release) ||
    source.archive.url !==
      `https://dl.google.com/android/repository/platform-tools_r${source.release}-win.zip` ||
    !size(source.archive.bytes) ||
    !hash(source.archive.sha256) ||
    source.files.length !== NAMES.length ||
    typeof activationAllowed !== 'boolean' ||
    typeof launchAllowed !== 'boolean'
  )
    fail();
  let expanded = 0;
  const files = source.files.map((row, i) => {
    if (row.path !== NAMES[i] || !size(row.bytes) || !hash(row.sha256)) fail();
    const pe = row.path.endsWith('.exe') || row.path.endsWith('.dll');
    if (
      pe
        ? row.peMachine !== 332 || row.peMagic !== 267
        : row.peMachine !== null || row.peMagic !== null
    )
      fail();
    expanded += row.bytes;
    if (!Number.isSafeInteger(expanded) || expanded > MAX) fail();
    return Object.freeze({
      path: row.path,
      bytes: row.bytes,
      sha256: row.sha256,
      peMachine: row.peMachine,
      peMagic: row.peMagic,
    });
  });
  const candidate: PlatformToolsCandidate = Object.freeze({
    schema: 1,
    release: source.release,
    archive: Object.freeze({
      url: source.archive.url,
      bytes: source.archive.bytes,
      sha256: source.archive.sha256,
    }),
    files: Object.freeze(files),
  });
  if (JSON.stringify(source) !== JSON.stringify(candidate)) fail();
  const manifestSha256 = createHash('sha256').update(JSON.stringify(candidate)).digest('hex');
  if (
    byDigest.has(candidate.archive.sha256) ||
    releases.has(candidate.release) ||
    manifests.has(manifestSha256)
  )
    fail();
  const entry: PlatformToolsCatalogEntry = Object.freeze({
    candidate,
    manifestSha256,
    activationAllowed,
    launchAllowed,
    versionObservation: Object.freeze({
      protocol: '1.0.41',
      release: candidate.release,
      buildGrammar: 'DECIMAL_1_20',
    }),
  });
  identities.add(entry);
  byDigest.set(candidate.archive.sha256, entry);
  releases.add(candidate.release);
  manifests.add(manifestSha256);
  return entry;
}).sort((a, b) => a.candidate.archive.sha256.localeCompare(b.candidate.archive.sha256));
export const PLATFORM_TOOLS_KNOWN_CANDIDATES = Object.freeze(entries);
const target = byDigest.get(INSTALL_TARGET_SHA256);
if (!target?.activationAllowed || !target.launchAllowed) fail();
export const PLATFORM_TOOLS_INSTALL_TARGET: PlatformToolsCatalogEntry = target;
export function resolvePlatformToolsCandidate(
  archiveSha256: string,
): PlatformToolsCatalogEntry | null {
  return byDigest.get(archiveSha256) ?? null;
}
export function assertPlatformToolsCandidate(entry: PlatformToolsCatalogEntry): void {
  if (!identities.has(entry)) fail();
}
