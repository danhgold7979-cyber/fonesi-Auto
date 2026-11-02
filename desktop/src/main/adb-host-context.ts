/** Private launch/asset evidence. Files are provenance, not native parent/Job proof. */
import {
  openSync,
  closeSync,
  readSync,
  fstatSync,
  lstatSync,
  realpathSync,
  opendirSync,
  mkdirSync,
  writeSync,
  fsyncSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { assertPreparedPersistenceLease, type PersistenceEntry } from './persistence-entry.ts';
export const HOST_ASSETS = Object.freeze([
  'launch/Invoke-RetainedHost.ps1',
  'native/IsolatedAdbServer.cs',
  'native/RetainedAdbSession.cs',
  'native/RetainedAdbProtocol.cs',
  'native/RetainedHostAdmission.cs',
  'native/RetainedVideoSession.cs',
] as const);
export const hostHash = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
export const hostUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
function reject(): never {
  throw Error('HOST_CONTEXT_REJECTED');
}
export function hostPlain(path: string, directory = false) {
  if (resolve(path) !== path) reject();
  const s = lstatSync(path);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1) ||
    realpathSync.native(path) !== path
  )
    reject();
  return s;
}
export function hostRead(path: string, max: number): Buffer {
  hostPlain(dirname(path), true);
  const initial = hostPlain(path);
  if (initial.size < 1 || initial.size > max) reject();
  const fd = openSync(path, 'r');
  try {
    const before = fstatSync(fd);
    if (before.dev !== initial.dev || before.ino !== initial.ino || before.size !== initial.size)
      reject();
    const b = Buffer.alloc(before.size + 1);
    let n = 0;
    while (n < b.length) {
      const got = readSync(fd, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    const after = fstatSync(fd);
    const atPath = hostPlain(path);
    if (
      n !== before.size ||
      after.nlink !== 1 ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      atPath.dev !== before.dev ||
      atPath.ino !== before.ino
    )
      reject();
    return b.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}
function imageDigest(path: string): string {
  const initial = hostPlain(path);
  if (initial.size < 1 || initial.size > 512 * 1024 * 1024) reject();
  const fd = openSync(path, 'r'),
    digest = createHash('sha256'),
    block = Buffer.alloc(65536);
  let n = 0;
  try {
    const before = fstatSync(fd);
    if (before.dev !== initial.dev || before.ino !== initial.ino || before.size !== initial.size)
      reject();
    while (n <= before.size) {
      const got = readSync(fd, block, 0, Math.min(block.length, before.size - n + 1), null);
      if (!got) break;
      n += got;
      if (n > before.size) reject();
      digest.update(block.subarray(0, got));
    }
    const after = fstatSync(fd),
      atPath = hostPlain(path);
    if (
      n !== before.size ||
      after.size !== before.size ||
      after.nlink !== 1 ||
      after.mtimeMs !== before.mtimeMs ||
      atPath.dev !== before.dev ||
      atPath.ino !== before.ino
    )
      reject();
    return digest.digest('hex');
  } finally {
    closeSync(fd);
  }
}
export function hostRecord(raw: Buffer, keys: readonly string[]): Record<string, unknown> {
  const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(raw);
  const v: unknown = JSON.parse(text);
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(v) !== text ||
    JSON.stringify(Object.keys(v)) !== JSON.stringify(keys)
  )
    reject();
  return v as Record<string, unknown>;
}
export function hostNames(path: string, cap = 256): string[] {
  hostPlain(path, true);
  const d = opendirSync(path),
    out: string[] = [];
  try {
    for (;;) {
      const e = d.readSync();
      if (!e) break;
      if (out.length >= cap) reject();
      out.push(e.name);
    }
  } finally {
    d.closeSync();
  }
  return out.sort();
}
export function hostWrite(path: string, raw: string, max: number, fence: () => void) {
  if (Buffer.byteLength(raw) > max) reject();
  hostPlain(dirname(path), true);
  fence();
  const fd = openSync(path, 'wx', 0o600);
  try {
    const bytes = Buffer.from(raw);
    let n = 0;
    while (n < bytes.length) {
      const got = writeSync(fd, bytes, n, bytes.length - n);
      if (got < 1) reject();
      n += got;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!hostRead(path, max).equals(Buffer.from(raw))) reject();
}
const receiptKeys = [
  'version',
  'launchId',
  'storeId',
  'ownerToken',
  'readySha256',
  'jobName',
  'parentPid',
  'parentCreationFileTime',
  'parentImagePath',
  'parentImageSha256',
] as const;
export type HostParentReceipt = Readonly<{
  version: 1;
  launchId: string;
  storeId: string;
  ownerToken: string;
  readySha256: string;
  jobName: string;
  parentPid: number;
  parentCreationFileTime: string;
  parentImagePath: string;
  parentImageSha256: string;
}>;
export function readHostContext(
  entry: PersistenceEntry,
  launchRoot: string,
  desktopRoot: string,
  parentPid: number,
) {
  assertPreparedPersistenceLease(entry);
  hostPlain(desktopRoot, true);
  const launchIdentity = hostPlain(launchRoot, true);
  const launchOwner = hostRead(join(launchRoot, '.owner'), 36).toString('utf8');
  if (!hostUuid(launchOwner)) reject();
  if (dirname(launchRoot) !== dirname(entry.root)) reject();
  const raw = hostRead(join(launchRoot, 'host-parent.json'), 4096),
    r = hostRecord(raw, receiptKeys);
  if (
    r.version !== 1 ||
    !hostUuid(r.launchId) ||
    r.storeId !== entry.storeId ||
    r.ownerToken !== entry.ownerToken ||
    !hash(r.readySha256) ||
    typeof r.jobName !== 'string' ||
    !/^Local\\Fonesi-Auto-host-[0-9a-f-]{36}$/.test(r.jobName) ||
    !hostUuid(r.jobName.slice('Local\\Fonesi-Auto-host-'.length)) ||
    r.parentPid !== parentPid ||
    !Number.isSafeInteger(parentPid) ||
    parentPid < 1 ||
    parentPid > 0xffffffff ||
    typeof r.parentCreationFileTime !== 'string' ||
    !/^[0-9a-f]{16}$/.test(r.parentCreationFileTime) ||
    typeof r.parentImagePath !== 'string' ||
    resolve(r.parentImagePath) !== r.parentImagePath ||
    r.parentImageSha256 !== entry.runtimeExeSha256
  )
    reject();
  if (
    basename(launchRoot) !== `launch-${r.launchId}` ||
    hostHash(hostRead(join(entry.root, '.ready-launch.json'), 65536)) !== r.readySha256 ||
    imageDigest(r.parentImagePath) !== r.parentImageSha256
  )
    reject();
  const header = hostRecord(hostRead(join(launchRoot, 'launch-journal.json'), 65536), [
    'version',
    'launchId',
    'parentToken',
    'storeId',
    'ownerToken',
    'dataRoot',
    'entryMode',
    'maintenance',
    'executableSha256',
  ]);
  if (
    header.version !== 1 ||
    header.launchId !== r.launchId ||
    header.parentToken !== entry.parentToken ||
    header.storeId !== entry.storeId ||
    header.ownerToken !== entry.ownerToken ||
    header.dataRoot !== entry.root ||
    header.maintenance !== 'NORMAL' ||
    !['SOURCE', 'PACKAGE'].includes(String(header.entryMode)) ||
    header.executableSha256 !== r.parentImageSha256
  )
    reject();
  const pointer = hostRecord(hostRead(join(dirname(entry.root), '.launcher-current.json'), 65536), [
    'version',
    'launchId',
    'ownerToken',
    'storeId',
    'dataRoot',
  ]);
  if (
    JSON.stringify(pointer) !==
    JSON.stringify({
      version: 1,
      launchId: r.launchId,
      ownerToken: entry.ownerToken,
      storeId: entry.storeId,
      dataRoot: entry.root,
    })
  )
    reject();
  if (entry.packageRoot !== undefined && join(entry.packageRoot, 'app') !== desktopRoot) reject();
  const manifest = hostRecord(hostRead(join(desktopRoot, 'build/.verified-build.json'), 65536), [
    'schema',
    'inputs',
    'outputs',
  ]);
  if (
    manifest.schema !== 1 ||
    !manifest.inputs ||
    typeof manifest.inputs !== 'object' ||
    Array.isArray(manifest.inputs) ||
    !manifest.outputs ||
    typeof manifest.outputs !== 'object' ||
    Array.isArray(manifest.outputs)
  )
    reject();
  const inputs = manifest.inputs as Record<string, unknown>,
    outputs = manifest.outputs as Record<string, unknown>;
  if (
    !hash(outputs['adb-host-factory.cjs']) ||
    hostHash(hostRead(join(desktopRoot, 'build/adb-host-factory.cjs'), 8 * 1024 * 1024)) !==
      outputs['adb-host-factory.cjs']
  )
    reject();
  const assets: Record<string, string> = Object.create(null);
  let total = 0;
  for (const name of HOST_ASSETS) {
    const b = hostRead(join(desktopRoot, name), 1024 * 1024);
    total += b.length;
    if (total > 4 * 1024 * 1024 || !hash(inputs[name]) || hostHash(b) !== inputs[name]) reject();
    assets[name] = inputs[name];
  }
  return Object.freeze({
    receipt: Object.freeze(r) as HostParentReceipt,
    receiptSha256: hostHash(raw),
    launchOwner,
    launchDev: launchIdentity.dev,
    launchIno: launchIdentity.ino,
    assets: Object.freeze(assets),
  });
}
/** Conservative private compatibility subset, not a guarantee for all Windows/compiler paths. */
export function assertHostPathBudget(
  launchRoot: string,
  sessionId: string,
  adbPath?: string,
  nativePaths: readonly string[] = [],
): string {
  if (typeof launchRoot !== 'string' || resolve(launchRoot) !== launchRoot || !hostUuid(sessionId))
    reject();
  const root = join(launchRoot, '.host-session');
  if (
    root.length > 184 ||
    join(root, 'profile').length > 192 ||
    join(root, 'bootstrap.json').length > 199
  )
    reject();
  for (const file of adbPath === undefined ? nativePaths : [adbPath, ...nativePaths]) {
    if (
      typeof file !== 'string' ||
      resolve(file) !== file ||
      file.length > 259 ||
      dirname(file).length > 247
    )
      reject();
  }
  return root;
}
export function createHostRoot(
  launchRoot: string,
  sessionId: string,
  ownerToken: string,
  fence: () => void,
) {
  if (!hostUuid(sessionId) || !hostUuid(ownerToken)) reject();
  const root = assertHostPathBudget(launchRoot, sessionId);
  hostPlain(launchRoot, true);
  fence();
  if (hostNames(launchRoot).some((n) => n === '.host-session' || n.startsWith('host-session')))
    reject();
  mkdirSync(root);
  const identity = hostPlain(root, true);
  hostWrite(join(root, '.owner'), ownerToken, 36, fence);
  fence();
  mkdirSync(join(root, 'profile'));
  return Object.freeze({ root, dev: identity.dev, ino: identity.ino, ownerToken });
}
export const HOST_VIDEO_PROTOCOL = 'AUTO_SCRCPY_5_0_1_VIDEO_NONCE_V1';
export type HostVideoArtifact = Readonly<{
  artifactId: string;
  relativePath: 'video/server.jar';
  bytes: number;
  sha256: string;
  protocolId: typeof HOST_VIDEO_PROTOCOL;
  pairManifestSha256: string;
}>;
/** Closed metadata only; this does not issue artifact or execution authority. */
export function snapshotHostVideoArtifact(value: unknown): HostVideoArtifact | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = [
      'artifactId',
      'relativePath',
      'bytes',
      'sha256',
      'protocolId',
      'pairManifestSha256',
    ];
    const ds = Object.getOwnPropertyDescriptors(value);
    if (JSON.stringify(Object.keys(ds)) !== JSON.stringify(keys)) return null;
    const v: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = ds[key];
      if (!descriptor || !('value' in descriptor)) return null;
      v[key] = descriptor.value;
    }
    if (
      !hash(v.artifactId) ||
      v.artifactId.length !== 64 ||
      v.artifactId !== v.sha256 ||
      v.relativePath !== 'video/server.jar' ||
      !Number.isSafeInteger(v.bytes) ||
      typeof v.bytes !== 'number' ||
      v.bytes < 1 ||
      v.bytes > 8 * 1024 * 1024 ||
      v.protocolId !== HOST_VIDEO_PROTOCOL ||
      !hash(v.pairManifestSha256) ||
      v.pairManifestSha256.length !== 64
    )
      return null;
    return Object.freeze(v) as HostVideoArtifact;
  } catch {
    return null;
  }
}
/** Reviewed output pin is intentionally absent until an actual Windows/server pair exists. */
const REVIEWED_VIDEO_PAIR: Readonly<{ manifestSha256: string }> | null = null;
export const HOST_VIDEO_NATIVE_SOURCES = Object.freeze([
  'native/IsolatedAdbServer.cs',
  'native/RetainedAdbSession.cs',
  'native/RetainedAdbProtocol.cs',
  'native/RetainedHostAdmission.cs',
  'native/RetainedVideoSession.cs',
] as const);
export type OwnedHostVideoArtifact = Readonly<{ videoArtifact: true }>;
type VideoCustody = {
  fd: number;
  path: string;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  record: HostVideoArtifact;
  retained: boolean;
};
const videoArtifacts = new WeakMap<object, VideoCustody>();
function videoPin(): Readonly<{ manifestSha256: string }> | null {
  return REVIEWED_VIDEO_PAIR;
}
function sameVideo(c: VideoCustody): boolean {
  if (!c.retained) return false;
  try {
    const s = hostPlain(c.path),
      f = fstatSync(c.fd);
    if (
      s.dev !== c.dev ||
      s.ino !== c.ino ||
      s.size !== c.size ||
      s.mtimeMs !== c.mtimeMs ||
      f.dev !== c.dev ||
      f.ino !== c.ino ||
      f.size !== c.size ||
      f.mtimeMs !== c.mtimeMs ||
      f.nlink !== 1
    )
      return false;
    const digest = createHash('sha256'),
      block = Buffer.alloc(65536);
    let offset = 0;
    while (offset < c.size) {
      const n = readSync(c.fd, block, 0, Math.min(block.length, c.size - offset), offset);
      if (!n) return false;
      digest.update(block.subarray(0, n));
      offset += n;
    }
    const after = fstatSync(c.fd),
      atPath = hostPlain(c.path);
    return (
      digest.digest('hex') === c.record.sha256 &&
      after.dev === c.dev &&
      after.ino === c.ino &&
      after.size === c.size &&
      after.mtimeMs === c.mtimeMs &&
      after.nlink === 1 &&
      atPath.dev === c.dev &&
      atPath.ino === c.ino &&
      atPath.size === c.size &&
      atPath.mtimeMs === c.mtimeMs
    );
  } catch {
    return false;
  }
}
/** No caller pin/manifest/callback; absence is unavailable, never a self-issued pair. */
export function openHostVideoArtifact(desktopRoot: string): OwnedHostVideoArtifact | null {
  const pin = videoPin();
  if (!pin) return null;
  hostPlain(desktopRoot, true);
  const raw = hostRead(join(desktopRoot, 'video/pair.json'), 8192);
  if (hostHash(raw) !== pin.manifestSha256) reject();
  const p = hostRecord(raw, [
    'version',
    'serverVersion',
    'serverBytes',
    'serverSha256',
    'protocolId',
    'consumerBytes',
    'consumerWindowsArtifactSha256',
    'consumerBuildManifestSha256',
    'serverBuildManifestSha256',
    'architecture',
  ]);
  const record = snapshotHostVideoArtifact({
    artifactId: p.serverSha256,
    relativePath: 'video/server.jar',
    bytes: p.serverBytes,
    sha256: p.serverSha256,
    protocolId: p.protocolId,
    pairManifestSha256: pin.manifestSha256,
  });
  if (
    p.version !== 1 ||
    p.serverVersion !== '5.0.1' ||
    p.architecture !== 'AMD64' ||
    !record ||
    !Number.isSafeInteger(p.consumerBytes) ||
    typeof p.consumerBytes !== 'number' ||
    p.consumerBytes < 1 ||
    p.consumerBytes > 8388608 ||
    !hash(p.consumerWindowsArtifactSha256) ||
    p.consumerWindowsArtifactSha256.length !== 64 ||
    !hash(p.consumerBuildManifestSha256) ||
    p.consumerBuildManifestSha256.length !== 64
  )
    reject();
  if (!hash(p.serverBuildManifestSha256) || p.serverBuildManifestSha256.length !== 64) reject();
  const serverBuildRaw = hostRead(join(desktopRoot, 'video/server-build.json'), 8192);
  if (hostHash(serverBuildRaw) !== p.serverBuildManifestSha256) reject();
  const serverBuild = hostRecord(serverBuildRaw, [
    'version',
    'upstreamCommit',
    'sourcePatchSha256',
    'toolchainManifestSha256',
    'dependenciesManifestSha256',
    'buildCommandSha256',
    'serverBytes',
    'serverSha256',
    'protocolId',
  ]);
  if (
    serverBuild.version !== 1 ||
    serverBuild.upstreamCommit !== 'a60891aea193d92e7e5c3942700eca63f9d19a5f' ||
    serverBuild.serverBytes !== record.bytes ||
    serverBuild.serverSha256 !== record.sha256 ||
    serverBuild.protocolId !== record.protocolId
  )
    reject();
  for (const key of [
    'sourcePatchSha256',
    'toolchainManifestSha256',
    'dependenciesManifestSha256',
    'buildCommandSha256',
  ])
    if (!hash(serverBuild[key]) || (serverBuild[key] as string).length !== 64) reject();
  const buildRaw = hostRead(join(desktopRoot, 'video/consumer-build.json'), 8192);
  if (hostHash(buildRaw) !== p.consumerBuildManifestSha256) reject();
  const build = hostRecord(buildRaw, [
    'version',
    'sourceCommit',
    'compilerSha256',
    'compilerVersion',
    'arguments',
    'frameworkReferences',
    'sources',
    'consumerSha256',
  ]);
  if (
    build.version !== 1 ||
    typeof build.sourceCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(build.sourceCommit) ||
    build.sourceCommit.length !== 40 ||
    !hash(build.compilerSha256) ||
    build.compilerSha256.length !== 64 ||
    typeof build.compilerVersion !== 'string' ||
    build.compilerVersion.length > 64 ||
    !/^[0-9]+(?:\.[0-9]+){1,3}$/.test(build.compilerVersion) ||
    /[^0-9.]/.test(build.compilerVersion) ||
    JSON.stringify(build.arguments) !==
      JSON.stringify(['/nologo', '/target:library', '/platform:x64', '/optimize+']) ||
    build.consumerSha256 !== p.consumerWindowsArtifactSha256
  )
    reject();
  const refs = build.frameworkReferences as Record<string, unknown>,
    sources = build.sources as Record<string, unknown>;
  if (
    !refs ||
    JSON.stringify(Object.keys(refs)) !== JSON.stringify(['System.dll', 'System.Core.dll']) ||
    Object.values(refs).some((v) => !hash(v) || v.length !== 64) ||
    !sources ||
    JSON.stringify(Object.keys(sources)) !== JSON.stringify(HOST_VIDEO_NATIVE_SOURCES)
  )
    reject();
  let sourceBytes = 0;
  for (const name of HOST_VIDEO_NATIVE_SOURCES) {
    const source = hostRead(join(desktopRoot, name), 1048576);
    sourceBytes += source.length;
    if (sourceBytes > 4194304 || hostHash(source) !== sources[name]) reject();
  }
  const dll = hostRead(join(desktopRoot, 'native/RetainedVideoConsumer.dll'), 8388608);
  if (
    dll.length !== p.consumerBytes ||
    hostHash(dll) !== p.consumerWindowsArtifactSha256 ||
    dll.length < 64 ||
    dll.readUInt16LE(0) !== 0x5a4d
  )
    reject();
  const pe = dll.readUInt32LE(60);
  if (
    pe > dll.length - 26 ||
    dll.readUInt32LE(pe) !== 0x4550 ||
    dll.readUInt16LE(pe + 4) !== 0x8664 ||
    dll.readUInt16LE(pe + 24) !== 0x20b
  )
    reject();
  const file = join(desktopRoot, 'video/server.jar'),
    bytes = hostRead(file, 8388608);
  if (bytes.length !== record.bytes || hostHash(bytes) !== record.sha256) reject();
  const s = hostPlain(file),
    fd = openSync(file, 'r');
  const c: VideoCustody = {
    fd,
    path: file,
    dev: s.dev,
    ino: s.ino,
    size: s.size,
    mtimeMs: s.mtimeMs,
    record,
    retained: true,
  };
  if (!sameVideo(c)) {
    closeSync(fd);
    reject();
  }
  const token = Object.freeze({ videoArtifact: true as const });
  videoArtifacts.set(token, c);
  return token;
}
export function inspectHostVideoArtifact(
  value: unknown,
): Readonly<{ record: HostVideoArtifact; finalCurrent: () => boolean }> | null {
  if (!value || typeof value !== 'object') return null;
  const c = videoArtifacts.get(value);
  if (!c?.retained) return null;
  return Object.freeze({ record: c.record, finalCurrent: () => sameVideo(c) });
}
export function releaseHostVideoArtifact(value: OwnedHostVideoArtifact): void {
  const c = videoArtifacts.get(value);
  if (!c?.retained) return;
  c.retained = false;
  closeSync(c.fd);
}

const VIDEO_BASE_KEYS = [
  'version',
  'launchId',
  'storeId',
  'ownerToken',
  'hostSessionId',
  'attemptId',
  'videoId',
  'transportId',
  'hostEpoch',
  'installationRevision',
  'artifactSha256',
  'protocolId',
];
const VIDEO_INTENT_KEYS = [
  ...VIDEO_BASE_KEYS,
  'remoteDirectory',
  'scid',
  'nonceSha256',
  'admittedUtc',
  'deadlineUtc',
];
const VIDEO_SETTLEMENT_KEYS = [
  ...VIDEO_BASE_KEYS,
  'directory',
  'upload',
  'launch',
  'localRetired',
  'cleanup',
  'streamObserved',
  'code',
];
/** Inspect retained metadata; only requireClean permits a deletion plan. */
export function validateHostVideoJournal(
  root: string,
  bootstrapRaw: string,
  requireClean: boolean,
): void {
  const b = JSON.parse(bootstrapRaw) as Record<string, unknown>;
  const names = hostNames(root),
    hasIntent = names.includes('video-intent.json'),
    hasSettlement = names.includes('video-settlement.json');
  if (!hasIntent && !hasSettlement) return;
  const artifact = b.version === 3 ? snapshotHostVideoArtifact(b.videoArtifact) : null;
  if (!artifact || b.operationSet !== 'SERVER_ONLY' || !hasIntent) reject();
  const i = hostRecord(hostRead(join(root, 'video-intent.json'), 8192), VIDEO_INTENT_KEYS);
  const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
  for (const key of ['launchId', 'storeId', 'ownerToken']) if (i[key] !== b[key]) reject();
  if (
    i.version !== 1 ||
    i.hostSessionId !== b.sessionId ||
    !hostUuid(i.attemptId) ||
    i.attemptId.length !== 36 ||
    !hostUuid(i.videoId) ||
    i.videoId.length !== 36
  )
    reject();
  if (
    typeof i.transportId !== 'string' ||
    i.transportId.length > 20 ||
    !/^[1-9][0-9]*$/.test(i.transportId) ||
    /[^0-9]/.test(i.transportId) ||
    !integer(i.hostEpoch, 1) ||
    i.installationRevision !== b.installationRevision ||
    i.artifactSha256 !== artifact.sha256 ||
    i.protocolId !== artifact.protocolId ||
    i.remoteDirectory !== `/data/local/tmp/fonesi-video-${i.videoId}` ||
    !integer(i.scid, 0, 2147483647) ||
    !hash(i.nonceSha256) ||
    i.nonceSha256.length !== 64 ||
    !integer(i.admittedUtc, 0, 8640000000000000) ||
    !integer(i.deadlineUtc, 0, 8640000000000000) ||
    (i.deadlineUtc as number) <= (i.admittedUtc as number) ||
    (i.deadlineUtc as number) - (i.admittedUtc as number) > 30000
  )
    reject();
  if (!hasSettlement) {
    if (requireClean) reject();
    return;
  }
  const s = hostRecord(hostRead(join(root, 'video-settlement.json'), 8192), VIDEO_SETTLEMENT_KEYS);
  for (const key of VIDEO_BASE_KEYS) if (s[key] !== i[key]) reject();
  if (
    !['NONE', 'CREATED', 'UNKNOWN'].includes(s.directory as string) ||
    !['NONE', 'PARTIAL', 'VERIFIED', 'UNKNOWN'].includes(s.upload as string) ||
    !['NONE', 'STARTED', 'EXITED', 'UNKNOWN'].includes(s.launch as string) ||
    !['NOT_REQUIRED', 'PENDING', 'CLEANED', 'UNKNOWN'].includes(s.cleanup as string) ||
    typeof s.localRetired !== 'boolean' ||
    typeof s.streamObserved !== 'boolean' ||
    ![
      'OK',
      'NOT_READY',
      'BUSY',
      'STALE_TARGET',
      'ADMISSION_REJECTED',
      'DEPLOYMENT_FAILED',
      'PROTOCOL_FAILED',
      'REMOTE_FAILED',
      'DEADLINE_EXCEEDED',
      'OUTCOME_UNKNOWN',
      'CLOSED',
    ].includes(s.code as string)
  )
    reject();
  const none =
    s.directory === 'NONE' &&
    s.upload === 'NONE' &&
    s.launch === 'NONE' &&
    s.cleanup === 'NOT_REQUIRED' &&
    s.streamObserved === false;
  const cleaned =
    s.directory === 'CREATED' &&
    s.cleanup === 'CLEANED' &&
    ['NONE', 'EXITED'].includes(s.launch as string) &&
    ['NONE', 'PARTIAL', 'VERIFIED'].includes(s.upload as string) &&
    (s.launch !== 'EXITED' || s.upload === 'VERIFIED') &&
    (!s.streamObserved || s.launch === 'EXITED');
  if (
    (s.directory === 'NONE' && !none) ||
    (s.cleanup === 'CLEANED' && !cleaned) ||
    (s.streamObserved && s.launch === 'NONE')
  )
    reject();
  if (requireClean && (!s.localRetired || s.code === 'OUTCOME_UNKNOWN' || !(none || cleaned)))
    reject();
}

export function cleanupHostRoot(
  owned: ReturnType<typeof createHostRoot>,
  bootstrap: string,
  fence: () => void,
) {
  const root = owned.root,
    s = hostPlain(root, true);
  if (
    s.dev !== owned.dev ||
    s.ino !== owned.ino ||
    hostRead(join(root, '.owner'), 36).toString() !== owned.ownerToken ||
    hostRead(join(root, 'bootstrap.json'), 8192).toString() !== bootstrap
  )
    reject();
  const top = hostNames(root);
  if (
    JSON.stringify(
      top.filter((n) => !['adb.log', 'video-intent.json', 'video-settlement.json'].includes(n)),
    ) !== JSON.stringify(['.owner', 'bootstrap.json', 'profile'])
  )
    reject();
  validateHostVideoJournal(root, bootstrap, true);
  hostPlain(join(root, 'profile'), true);
  if (top.includes('adb.log')) hostPlain(join(root, 'adb.log'));
  const files: { path: string; dev: number; ino: number; size: number; mtimeMs: number }[] = [],
    dirs: { path: string; dev: number; ino: number }[] = [];
  let count = 0,
    bytes = 0;
  function scan(dir: string, depth: number) {
    if (depth > 8) reject();
    for (const n of hostNames(dir)) {
      if (++count > 256) reject();
      const p = join(dir, n),
        stat = lstatSync(p);
      if (stat.isDirectory()) {
        const directory = hostPlain(p, true);
        scan(p, depth + 1);
        dirs.push({ path: p, dev: directory.dev, ino: directory.ino });
      } else {
        const f = hostPlain(p);
        bytes += f.size;
        if (bytes > 64 * 1024 * 1024) reject();
        files.push({ path: p, dev: f.dev, ino: f.ino, size: f.size, mtimeMs: f.mtimeMs });
      }
    }
  }
  scan(root, 0);
  function sameFile(f: (typeof files)[number]) {
    const now = hostPlain(f.path);
    if (now.dev !== f.dev || now.ino !== f.ino || now.size !== f.size || now.mtimeMs !== f.mtimeMs)
      reject();
  }
  fence();
  validateHostVideoJournal(root, bootstrap, true);
  for (const f of files) sameFile(f);
  for (const d of dirs) {
    const now = hostPlain(d.path, true);
    if (now.dev !== d.dev || now.ino !== d.ino) reject();
  }
  let videoRecordsRemoved = false,
    bootstrapRemoved = false;
  function retainedOwner() {
    const now = hostPlain(root, true);
    if (
      now.dev !== owned.dev ||
      now.ino !== owned.ino ||
      hostRead(join(root, '.owner'), 36).toString() !== owned.ownerToken ||
      (!bootstrapRemoved && hostRead(join(root, 'bootstrap.json'), 8192).toString() !== bootstrap)
    )
      reject();
  }
  function removeFile(f: (typeof files)[number]) {
    fence();
    retainedOwner();
    if (!videoRecordsRemoved) validateHostVideoJournal(root, bootstrap, true);
    sameFile(f);
    if (['video-intent.json', 'video-settlement.json'].includes(basename(f.path)))
      videoRecordsRemoved = true;
    unlinkSync(f.path);
    if (basename(f.path) === 'bootstrap.json') bootstrapRemoved = true;
  }
  for (const f of files.filter(
    (f) =>
      !['.owner', 'bootstrap.json', 'video-intent.json', 'video-settlement.json']
        .map((name) => join(root, name))
        .includes(f.path),
  ))
    removeFile(f);
  for (const d of dirs) {
    fence();
    retainedOwner();
    const now = hostPlain(d.path, true);
    if (now.dev !== d.dev || now.ino !== d.ino) reject();
    rmdirSync(d.path);
  }
  const metadata = [
    'video-intent.json',
    'video-settlement.json',
    'bootstrap.json',
    '.owner',
  ].filter((name) => files.some((f) => f.path === join(root, name)));
  fence();
  retainedOwner();
  if (JSON.stringify(hostNames(root)) !== JSON.stringify([...metadata].sort())) reject();
  validateHostVideoJournal(root, bootstrap, true);
  for (const name of metadata) {
    const f = files.find((f) => f.path === join(root, name));
    if (!f) reject();
    removeFile(f);
  }
  fence();
  rmdirSync(root);
}
