// Private owned-file preparation. No download, executable invocation or license grant.
import { lstat, realpath, opendir, open, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
import {
  decodePlatformToolsArchive,
  snapshotPlatformToolsArchive,
} from './platform-tools-archive.ts';
import { verifyPlatformToolsFiles } from './platform-tools-files.ts';
const MAX = 128 * 1024 * 1024;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function fail(): never {
  throw Error('RECOVERY_REQUIRED');
}
function same(a: string, b: string) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
async function plain(file: string) {
  if (file !== resolve(file)) fail();
  let part = file;
  for (;;) {
    const s = await lstat(part);
    if (!s.isDirectory() || s.isSymbolicLink() || !same(await realpath(part), part)) fail();
    const parent = dirname(part);
    if (parent === part) return;
    part = parent;
  }
}
async function entries(root: string, max: number) {
  await plain(root);
  const dir = await opendir(root),
    out: string[] = [];
  try {
    for (;;) {
      const e = await dir.read();
      if (!e) break;
      if (out.length >= max || e.isSymbolicLink()) fail();
      out.push(e.name);
    }
  } finally {
    await dir.close();
  }
  return out;
}
async function ordinary(file: string, max: number) {
  const s = await lstat(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    !Number.isSafeInteger(s.size) ||
    s.size < 0 ||
    s.size > max ||
    !same(await realpath(file), file)
  )
    fail();
  return s;
}
export function createPlatformToolsProvisionFiles(
  options: Readonly<{ dataRoot: string; assertOwnedSync: () => void }>,
) {
  const root = join(options.dataRoot, 'platform-tools-runtime'),
    owned = options.assertOwnedSync.bind(options);
  if (options.dataRoot !== resolve(options.dataRoot)) fail();
  const candidate = PLATFORM_TOOLS_CANDIDATE;
  function fence(admit: () => void) {
    owned();
    admit();
  }
  async function write(file: string, raw: Uint8Array, admit: () => void, issued: () => void) {
    fence(admit);
    issued();
    const h = await open(file, 'wx', 0o600);
    try {
      fence(admit);
      await h.writeFile(raw);
      fence(admit);
      await h.sync();
      fence(admit);
      const s = await h.stat();
      if (s.nlink !== 1 || s.size !== raw.length) fail();
    } finally {
      await h.close();
    }
    fence(admit);
    const before = await ordinary(file, raw.length),
      h2 = await open(file, 'r');
    try {
      const s = await h2.stat();
      if (s.dev !== before.dev || s.ino !== before.ino || s.size !== raw.length || s.nlink !== 1)
        fail();
      const copy = Buffer.alloc(raw.length + 1);
      let used = 0;
      while (used < copy.length) {
        const r = await h2.read(copy, used, copy.length - used, used);
        if (!r.bytesRead) break;
        used += r.bytesRead;
        fence(admit);
      }
      if (used !== raw.length || !copy.subarray(0, used).equals(Buffer.from(raw))) fail();
      const after = await h2.stat();
      if (
        after.size !== s.size ||
        after.mtimeMs !== s.mtimeMs ||
        after.ctimeMs !== s.ctimeMs ||
        after.nlink !== 1
      )
        fail();
    } finally {
      await h2.close();
    }
    fence(admit);
  }
  async function scan(operationIds: readonly string[], admit: () => void) {
    if (
      !Array.isArray(operationIds) ||
      operationIds.length > 128 ||
      operationIds.some((x) => !uuid(x)) ||
      new Set(operationIds).size !== operationIds.length
    )
      fail();
    const allowed = new Set(operationIds);
    fence(admit);
    await plain(root);
    let bytes = 0;
    const add = async (file: string, limit: number) => {
      const s = await ordinary(file, limit);
      bytes += s.size;
      if (bytes > MAX) fail();
      fence(admit);
    };
    const top = (await entries(root, 4)).sort();
    if (
      JSON.stringify(top) !==
      JSON.stringify(['.platform-tools-owner.json', 'operations', 'runtimes', 'staging'])
    )
      fail();
    await add(join(root, top[0] ?? ''), 4096);
    const operations = join(root, 'operations');
    for (const name of await entries(operations, 256)) {
      if (
        !/^operation-[0-9a-f-]{36}\.(intent|settled)\.json$/.test(name) ||
        !allowed.has(name.slice(10, 46))
      )
        fail();
      await add(join(operations, name), 4096);
    }
    const runtimeRoot = join(root, 'runtimes');
    for (const name of await entries(runtimeRoot, 4)) {
      if (name !== 'runtime-' + candidate.archive.sha256) fail();
      const directory = join(runtimeRoot, name);
      for (const filename of await entries(directory, 14)) {
        const row = candidate.files.find((r) => r.path === filename);
        if (!row) fail();
        await add(join(directory, filename), row.bytes);
      }
      await verifyPlatformToolsFiles(directory, candidate.files);
      fence(admit);
    }
    const staging = join(root, 'staging');
    for (const name of await entries(staging, 5)) {
      if (!name.startsWith('staging-') || !uuid(name.slice(8)) || !allowed.has(name.slice(8)))
        fail();
      const directory = join(staging, name);
      for (const filename of await entries(directory, 2)) {
        if (filename === 'archive.zip')
          await add(join(directory, filename), candidate.archive.bytes);
        else if (filename === 'extracted') {
          const extracted = join(directory, filename);
          for (const f of await entries(extracted, 14)) {
            const row = candidate.files.find((r) => r.path === f);
            if (!row) fail();
            await add(join(extracted, f), row.bytes);
          }
        } else fail();
      }
    }
    fence(admit);
    return bytes;
  }
  async function verifyRuntime(admit: () => void) {
    fence(admit);
    const directory = join(root, 'runtimes', 'runtime-' + candidate.archive.sha256);
    await verifyPlatformToolsFiles(directory, candidate.files);
    fence(admit);
    return directory;
  }
  return Object.freeze({
    scan,
    verifyRuntime,
    async stageAndPublish(
      operationId: string,
      input: unknown,
      operationIds: readonly string[],
      admit: () => void,
      issued: () => void,
    ) {
      if (!uuid(operationId) || !operationIds.includes(operationId)) fail();
      const archive = snapshotPlatformToolsArchive(input),
        files = decodePlatformToolsArchive(archive);
      const used = await scan(operationIds, admit);
      if (used + archive.length + 2 * 17529398 + 4096 > MAX) throw Error('LIMIT_EXCEEDED');
      if ((await entries(join(root, 'staging'), 5)).length >= 5) throw Error('LIMIT_EXCEEDED');
      const stage = join(root, 'staging', 'staging-' + operationId),
        extracted = join(stage, 'extracted');
      fence(admit);
      issued();
      await mkdir(stage);
      fence(admit);
      await write(join(stage, 'archive.zip'), archive, admit, issued);
      fence(admit);
      issued();
      await mkdir(extracted);
      fence(admit);
      for (const file of files) await write(join(extracted, file.name), file.bytes, admit, issued);
      await verifyPlatformToolsFiles(extracted, candidate.files);
      fence(admit);
      const destination = join(root, 'runtimes', 'runtime-' + candidate.archive.sha256);
      let exists = false;
      try {
        await lstat(destination);
        exists = true;
      } catch (e) {
        if ((e as { code?: string }).code !== 'ENOENT') throw e;
      }
      fence(admit);
      if (!exists) {
        issued();
        await mkdir(destination);
        fence(admit);
        for (const file of files)
          await write(join(destination, file.name), file.bytes, admit, issued);
      }
      await verifyRuntime(admit);
      await scan(operationIds, admit);
      fence(admit);
      return Object.freeze({ archiveSha256: candidate.archive.sha256 });
    },
  });
}
