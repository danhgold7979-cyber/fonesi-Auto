import {
  lstat,
  realpath,
  mkdir,
  open,
  unlink,
  rmdir,
  readdir,
  type FileHandle,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  isOpenDeviceDiagnosticCollector,
  type DeviceDiagnosticCollector,
} from './device-diagnostic-collector.ts';

export type DeviceDiagnosticExportCode =
  | 'INVALID_REQUEST'
  | 'BUSY'
  | 'CANCELLED'
  | 'OWNER_REVOKED'
  | 'COLLISION'
  | 'IO_FAILED'
  | 'CLEANUP_FAILED';
export type DeviceDiagnosticExportRequest = Readonly<{ version: 1; exportId: string }>;
export type DeviceDiagnosticExportResult =
  | Readonly<{ ok: true; records: number; dropped: number; bytes: number; sha256: string }>
  | Readonly<{ ok: false; code: DeviceDiagnosticExportCode }>;
type Identity = Readonly<{ dev: bigint; ino: bigint }>;
const same = (a: Identity, b: Identity) =>
  a.ino > 0n && b.ino > 0n && a.dev === b.dev && a.ino === b.ino;
const sha = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
class ExportFault extends Error {
  readonly code: DeviceDiagnosticExportCode;
  constructor(code: DeviceDiagnosticExportCode) {
    super(code);
    this.code = code;
  }
}
function request(input: unknown): DeviceDiagnosticExportRequest | null {
  try {
    if (
      !input ||
      typeof input !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    )
      return null;
    const d = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(d).length !== 2 ||
      !d.version ||
      !('value' in d.version) ||
      d.version.value !== 1 ||
      !d.exportId ||
      !('value' in d.exportId)
    )
      return null;
    const id: unknown = d.exportId.value;
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      return null;
    return Object.freeze({ version: 1, exportId: id });
  } catch {
    return null;
  }
}

const exporterCollectors = new WeakSet<object>();

// Trusted main-only API. There is deliberately no renderer path or log-scanning API.
export function createDeviceDiagnosticExporter(collector: DeviceDiagnosticCollector) {
  if (!isOpenDeviceDiagnosticCollector(collector) || exporterCollectors.has(collector))
    throw new Error('DIAGNOSTIC_COLLECTOR_REQUIRED');
  exporterCollectors.add(collector);
  let busy = false;
  return Object.freeze({
    async export(
      input: unknown,
      parent: string,
      signal: AbortSignal,
      current: () => boolean,
    ): Promise<DeviceDiagnosticExportResult> {
      const r = request(input);
      if (
        !r ||
        typeof parent !== 'string' ||
        !isAbsolute(parent) ||
        resolve(parent) !== parent ||
        parent.includes('\0')
      )
        return Object.freeze({ ok: false, code: 'INVALID_REQUEST' });
      if (busy) return Object.freeze({ ok: false, code: 'BUSY' });
      busy = true;
      let parentIdentity: Identity | null = null,
        directoryIdentity: Identity | null = null,
        created = false;
      const directory = join(parent, `fonesi-diagnostics-${r.exportId}`);
      const ownedFiles = new Map<string, Identity>();
      const handles = new Set<FileHandle>();
      const fence = () => {
        if (signal.aborted) throw new ExportFault('CANCELLED');
        if (!isOpenDeviceDiagnosticCollector(collector)) throw new ExportFault('OWNER_REVOKED');
        try {
          if (!current()) throw new Error();
        } catch {
          throw new ExportFault('OWNER_REVOKED');
        }
        if (signal.aborted) throw new ExportFault('CANCELLED');
        if (!isOpenDeviceDiagnosticCollector(collector)) throw new ExportFault('OWNER_REVOKED');
      };
      const checkParent = async () => {
        const observed = await lstat(parent, { bigint: true });
        if (
          !parentIdentity ||
          !observed.isDirectory() ||
          observed.ino <= 0n ||
          observed.isSymbolicLink() ||
          !same(observed, parentIdentity) ||
          (await realpath(parent)) !== parent
        )
          throw new ExportFault('IO_FAILED');
      };
      const checkDirectory = async () => {
        await checkParent();
        const observed = await lstat(directory, { bigint: true });
        if (
          !directoryIdentity ||
          !observed.isDirectory() ||
          observed.ino <= 0n ||
          observed.isSymbolicLink() ||
          !same(observed, directoryIdentity)
        )
          throw new ExportFault('IO_FAILED');
      };
      const cleanup = async (): Promise<boolean> => {
        let clean = true;
        for (const handle of handles) {
          try {
            await handle.close();
          } catch {
            clean = false;
          }
        }
        handles.clear();
        if (!created) return clean;
        try {
          await checkDirectory();
          for (const [name, identity] of ownedFiles) {
            await checkDirectory();
            const target = join(directory, name);
            const observed = await lstat(target, { bigint: true });
            if (!observed.isFile() || observed.isSymbolicLink() || !same(observed, identity)) {
              clean = false;
              continue;
            }
            await unlink(target);
          }
          await checkDirectory();
          // Nonrecursive: unknown entries are preserved and make cleanup fail.
          await rmdir(directory);
        } catch {
          clean = false;
        }
        return clean;
      };
      try {
        fence();
        const snapshot = collector.snapshot();
        const payload = snapshot.records.length ? snapshot.records.join('\n') + '\n' : '';
        const digest = sha(payload);
        const manifest =
          JSON.stringify({
            format: 'FONESI_DEVICE_DIAGNOSTICS',
            version: 1,
            records: snapshot.records.length,
            dropped: snapshot.dropped,
            bytes: snapshot.bytes,
            sha256: digest,
          }) + '\n';
        const observed = await lstat(parent, { bigint: true });
        fence();
        if (
          !observed.isDirectory() ||
          observed.ino <= 0n ||
          observed.isSymbolicLink() ||
          (await realpath(parent)) !== parent
        )
          throw new ExportFault('INVALID_REQUEST');
        fence();
        parentIdentity = observed;
        await checkParent();
        fence();
        try {
          await mkdir(directory);
          created = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST')
            throw new ExportFault('COLLISION');
          throw error;
        }
        const createdDirectory = await lstat(directory, { bigint: true });
        if (
          !createdDirectory.isDirectory() ||
          createdDirectory.isSymbolicLink() ||
          createdDirectory.ino <= 0n
        )
          throw new ExportFault('IO_FAILED');
        directoryIdentity = createdDirectory;
        fence();
        const files = [
          ['commands.ndjson', payload],
          ['manifest.json', manifest],
        ] as const;
        for (const [name, content] of files) {
          await checkDirectory();
          fence();
          const handle = await open(join(directory, name), 'wx');
          handles.add(handle);
          const identity = await handle.stat({ bigint: true });
          if (!identity.isFile() || identity.ino <= 0n) throw new ExportFault('IO_FAILED');
          ownedFiles.set(name, identity);
          fence();
          await handle.writeFile(content, 'utf8');
          fence();
          await handle.sync();
          fence();
          await handle.close();
          handles.delete(handle);
          fence();
        }
        await checkDirectory();
        fence();
        const names = await readdir(directory);
        fence();
        if (names.sort().join(',') !== 'commands.ndjson,manifest.json')
          throw new ExportFault('IO_FAILED');
        for (const [name, content] of files) {
          await checkDirectory();
          fence();
          const target = join(directory, name),
            observedFile = await lstat(target, { bigint: true });
          fence();
          const identity = ownedFiles.get(name);
          if (
            !identity ||
            !observedFile.isFile() ||
            observedFile.isSymbolicLink() ||
            !same(identity, observedFile)
          )
            throw new ExportFault('IO_FAILED');
          const expected = Buffer.from(content, 'utf8');
          if (observedFile.size !== BigInt(expected.length)) throw new ExportFault('IO_FAILED');
          const handle = await open(target, 'r');
          handles.add(handle);
          fence();
          const opened = await handle.stat({ bigint: true });
          fence();
          if (
            !opened.isFile() ||
            !same(opened, identity) ||
            opened.size !== BigInt(expected.length)
          )
            throw new ExportFault('IO_FAILED');
          // Read at most the expected bounded payload plus one trailing-byte probe.
          const actual = Buffer.alloc(expected.length + 1);
          let offset = 0;
          while (offset < actual.length) {
            const { bytesRead } = await handle.read(actual, offset, actual.length - offset, offset);
            fence();
            if (bytesRead === 0) break;
            offset += bytesRead;
          }
          await handle.close();
          handles.delete(handle);
          fence();
          if (offset !== expected.length || !actual.subarray(0, offset).equals(expected))
            throw new ExportFault('IO_FAILED');
        }
        await checkDirectory();
        fence();
        const finalNames = await readdir(directory);
        fence();
        if (finalNames.sort().join(',') !== 'commands.ndjson,manifest.json')
          throw new ExportFault('IO_FAILED');
        return Object.freeze({
          ok: true,
          records: snapshot.records.length,
          dropped: snapshot.dropped,
          bytes: snapshot.bytes,
          sha256: digest,
        });
      } catch (error) {
        const code = error instanceof ExportFault ? error.code : 'IO_FAILED';
        return Object.freeze({ ok: false, code: (await cleanup()) ? code : 'CLEANUP_FAILED' });
      } finally {
        busy = false;
      }
    },
  });
}
