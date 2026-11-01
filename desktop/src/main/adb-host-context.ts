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
  const root = join(launchRoot, `host-session-${sessionId}`);
  if (
    root.length > 220 ||
    join(root, 'profile').length > 228 ||
    join(root, 'bootstrap.json').length > 235
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
  if (hostNames(launchRoot).some((n) => n.startsWith('host-session'))) reject();
  mkdirSync(root);
  const identity = hostPlain(root, true);
  hostWrite(join(root, '.owner'), ownerToken, 36, fence);
  fence();
  mkdirSync(join(root, 'profile'));
  return Object.freeze({ root, dev: identity.dev, ino: identity.ino, ownerToken });
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
    JSON.stringify(top.filter((n) => n !== 'adb.log')) !==
    JSON.stringify(['.owner', 'bootstrap.json', 'profile'])
  )
    reject();
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
  for (const f of files) sameFile(f);
  for (const d of dirs) {
    const now = hostPlain(d.path, true);
    if (now.dev !== d.dev || now.ino !== d.ino) reject();
  }
  function removeFile(f: (typeof files)[number]) {
    fence();
    sameFile(f);
    unlinkSync(f.path);
  }
  for (const f of files.filter(
    (f) => ![join(root, '.owner'), join(root, 'bootstrap.json')].includes(f.path),
  ))
    removeFile(f);
  for (const d of dirs) {
    fence();
    const now = hostPlain(d.path, true);
    if (now.dev !== d.dev || now.ino !== d.ino) reject();
    rmdirSync(d.path);
  }
  for (const name of ['bootstrap.json', '.owner']) {
    const f = files.find((f) => f.path === join(root, name));
    if (!f) reject();
    removeFile(f);
  }
  fence();
  rmdirSync(root);
}
