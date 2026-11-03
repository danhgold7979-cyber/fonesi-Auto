import { lstat, realpath, opendir, open } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

// Development inspection only. No license admission, production activation or
// executable capability. Caller provides the reviewed candidate rows and an owned
// quiescent root; this is not a hostile concurrent filesystem editor guarantee.
export type PlatformToolsMeasuredFile = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  peMachine: 332 | null;
  peMagic: 267 | null;
}>;
const NAMES = Object.freeze([
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
]);
const LIMIT = 32 * 1024 * 1024;
function fail(): never {
  throw new Error('PLATFORM_TOOLS_FILES_REJECTED');
}
function snapshot(input: unknown): readonly PlatformToolsMeasuredFile[] {
  try {
    if (
      !Array.isArray(input) ||
      Object.getPrototypeOf(input) !== Array.prototype ||
      input.length !== NAMES.length ||
      Reflect.ownKeys(input).length !== NAMES.length + 1
    )
      fail();
    const out: PlatformToolsMeasuredFile[] = [];
    let total = 0;
    for (let i = 0; i < NAMES.length; i++) {
      const item = Object.getOwnPropertyDescriptor(input, String(i));
      if (!item || !('value' in item) || !item.enumerable) fail();
      const raw: unknown = item.value;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
      const proto = Object.getPrototypeOf(raw);
      if (proto !== Object.prototype && proto !== null) fail();
      const keys = ['path', 'bytes', 'sha256', 'peMachine', 'peMagic'];
      if (Reflect.ownKeys(raw).length !== keys.length) fail();
      const v: Record<string, unknown> = Object.create(null);
      for (const key of keys) {
        const d = Object.getOwnPropertyDescriptor(raw, key);
        if (!d || !('value' in d) || !d.enumerable) fail();
        v[key] = d.value;
      }
      if (
        v.path !== NAMES[i] ||
        typeof v.bytes !== 'number' ||
        !Number.isSafeInteger(v.bytes) ||
        v.bytes < 1 ||
        v.bytes > LIMIT ||
        typeof v.sha256 !== 'string' ||
        v.sha256.length !== 64 ||
        !/^[a-f0-9]+$/.test(v.sha256)
      )
        fail();
      const pe = /\.(exe|dll)$/.test(NAMES[i] ?? '');
      if (v.peMachine !== (pe ? 332 : null) || v.peMagic !== (pe ? 267 : null)) fail();
      total += v.bytes;
      if (total > LIMIT) fail();
      out.push(
        Object.freeze({
          path: v.path as string,
          bytes: v.bytes,
          sha256: v.sha256,
          peMachine: pe ? 332 : null,
          peMagic: pe ? 267 : null,
        }),
      );
    }
    return Object.freeze(out);
  } catch {
    fail();
  }
}
const samePath = (a: string, b: string) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
async function directory(path: string): Promise<void> {
  if (path !== resolve(path)) fail();
  let part = path;
  for (;;) {
    const s = await lstat(part);
    if (!s.isDirectory() || s.isSymbolicLink() || !samePath(await realpath(part), part)) fail();
    const next = dirname(part);
    if (next === part) break;
    part = next;
  }
}
export async function verifyPlatformToolsFiles(
  root: unknown,
  inventory: unknown,
): Promise<readonly PlatformToolsMeasuredFile[]> {
  // Snapshot all supplied metadata before the first filesystem await.
  const expected = snapshot(inventory);
  if (typeof root !== 'string' || root !== resolve(root)) fail();
  try {
    await directory(root);
    const dir = await opendir(root);
    const names: string[] = [];
    try {
      for (;;) {
        const e = await dir.read();
        if (!e) break;
        if (names.length >= NAMES.length || !e.isFile() || e.isSymbolicLink()) fail();
        names.push(e.name);
      }
    } finally {
      await dir.close();
    }
    names.sort();
    if (names.some((n, i) => n !== NAMES[i]) || names.length !== NAMES.length) fail();
    const measured: PlatformToolsMeasuredFile[] = [];
    for (const row of expected) {
      const file = join(root, row.path);
      const before = await lstat(file);
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.nlink !== 1 ||
        before.size !== row.bytes ||
        !samePath(await realpath(file), file)
      )
        fail();
      const handle = await open(file, 'r');
      try {
        const actual = await handle.stat();
        if (
          !actual.isFile() ||
          actual.nlink !== 1 ||
          actual.size !== before.size ||
          actual.dev !== before.dev ||
          actual.ino !== before.ino
        )
          fail();
        const hash = createHash('sha256'),
          buffer = Buffer.alloc(65536);
        let count = 0;
        for (;;) {
          const r = await handle.read(
            buffer,
            0,
            Math.min(buffer.length, row.bytes - count + 1),
            count,
          );
          if (!r.bytesRead) break;
          count += r.bytesRead;
          if (count > row.bytes) fail();
          hash.update(buffer.subarray(0, r.bytesRead));
        }
        if (count !== row.bytes || hash.digest('hex') !== row.sha256) fail();
        if (row.peMachine !== null) {
          const dos = Buffer.alloc(64);
          if ((await handle.read(dos, 0, 64, 0)).bytesRead !== 64 || dos.readUInt16LE(0) !== 0x5a4d)
            fail();
          const offset = dos.readUInt32LE(60);
          if (offset < 64 || offset > 1048576 || offset + 26 > row.bytes) fail();
          const pe = Buffer.alloc(26);
          if (
            (await handle.read(pe, 0, 26, offset)).bytesRead !== 26 ||
            pe.readUInt32LE(0) !== 0x4550 ||
            pe.readUInt16LE(4) !== 332 ||
            pe.readUInt16LE(24) !== 267
          )
            fail();
        }
        const after = await handle.stat();
        if (
          after.size !== actual.size ||
          after.mtimeMs !== actual.mtimeMs ||
          after.ctimeMs !== actual.ctimeMs ||
          after.nlink !== 1
        )
          fail();
        const current = await lstat(file);
        if (
          current.isSymbolicLink() ||
          current.dev !== actual.dev ||
          current.ino !== actual.ino ||
          current.size !== actual.size
        )
          fail();
        measured.push(row);
      } finally {
        await handle.close();
      }
    }
    await directory(root);
    return Object.freeze(measured);
  } catch {
    fail();
  }
}
