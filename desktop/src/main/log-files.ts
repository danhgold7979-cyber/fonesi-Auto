import { lstat, realpath, mkdir, open, opendir, rename, unlink, rmdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diagnosticId } from '../log-contract.ts';
import {
  parseStoreDocument,
  recognizedStoreName,
  STORE_DOCUMENT_BYTES,
  ROOT_ENTRY_LIMIT,
} from '../log-store-schema.ts';
import type { StoreKind, StoreDocument } from '../log-store-schema.ts';
export type LogLocation = Readonly<{ root: string; parentToken: string }>;
const equalPath = (a: string, b: string) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export async function plainLogDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !equalPath(await realpath(path), resolve(path))
  )
    throw new Error('LOG_DIRECTORY_REJECTED');
}
export async function readLogFile(path: string, limit: number): Promise<string> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw new Error('LOG_FILE_REJECTED');
  const handle = await open(path, 'r');
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.size > limit) throw new Error('LOG_FILE_REJECTED');
    const bytes = Buffer.alloc(limit + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, null);
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    if (offset > limit) throw new Error('LOG_FILE_LIMIT');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  } finally {
    await handle.close();
  }
}
export async function logInventory(root: string): Promise<string[]> {
  await plainLogDirectory(root);
  const directory = await opendir(root);
  const names: string[] = [];
  try {
    for (;;) {
      const entry = await directory.read();
      if (!entry) break;
      if (names.length >= ROOT_ENTRY_LIMIT) throw new Error('LOG_ENTRY_LIMIT');
      if (!recognizedStoreName(entry.name)) throw new Error('LOG_ENTRY_REJECTED');
      const stat = await lstat(join(root, entry.name));
      if (
        stat.isSymbolicLink() ||
        (entry.name === '.writer-lock' ? !stat.isDirectory() : !stat.isFile())
      )
        throw new Error('LOG_ENTRY_REJECTED');
      names.push(entry.name);
    }
  } finally {
    await directory.close();
  }
  return names;
}
async function parent(location: LogLocation): Promise<void> {
  if (
    !diagnosticId(location.parentToken) ||
    typeof location.root !== 'string' ||
    location.root !== resolve(location.root) ||
    !/^logs-[a-z0-9-]+$/.test(basename(location.root))
  )
    throw new Error('LOG_LOCATION_REJECTED');
  const directory = dirname(location.root);
  await plainLogDirectory(directory);
  if ((await readLogFile(join(directory, '.owner'), 36)) !== location.parentToken)
    throw new Error('LOG_PARENT_REJECTED');
}
async function exclusive(path: string, bytes: string): Promise<void> {
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}
function documentName(name: string, kind: StoreKind, value: StoreDocument): boolean {
  if (kind === 'segment') return name === `segment-${value.segmentId}.meta.json`;
  if (kind === 'recovery') return name === `recovery-${value.recoveryId}.json`;
  if (kind === 'lock') return false;
  return name === `${kind}.json`;
}
export class OwnedLogFiles {
  readonly root: string;
  readonly storeId: string;
  readonly ownerToken: string;
  private readonly location: LogLocation;
  private released = false;
  private constructor(location: LogLocation, storeId: string, ownerToken: string) {
    this.location = location;
    this.root = location.root;
    this.storeId = storeId;
    this.ownerToken = ownerToken;
  }
  static async acquire(location: LogLocation): Promise<OwnedLogFiles> {
    await parent(location);
    let fresh = false;
    try {
      await lstat(location.root);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw new Error('LOG_LOCATION_REJECTED');
      await mkdir(location.root);
      fresh = true;
    }
    await plainLogDirectory(location.root);
    // Immutable ownership preflight precedes mutation of any existing directory.
    let storeId: string = randomUUID();
    if (!fresh) {
      const owner = parseStoreDocument(
        await readLogFile(join(location.root, 'owner.json'), STORE_DOCUMENT_BYTES),
        'owner',
      );
      if (!owner) throw new Error('LOG_OWNER_REJECTED');
      storeId = owner.storeId as string;
    }
    const names = await logInventory(location.root);
    if (fresh && names.length !== 0) throw new Error('LOG_OWNER_REJECTED');
    const lock = join(location.root, '.writer-lock');
    await mkdir(lock);
    const files = new OwnedLogFiles(location, storeId, randomUUID());
    await exclusive(
      join(lock, 'owner.json'),
      JSON.stringify({
        schemaVersion: 1,
        storeId,
        ownerToken: files.ownerToken,
        pid: process.pid,
      }) + '\n',
    );
    if (fresh) {
      await exclusive(
        join(location.root, 'owner.json'),
        JSON.stringify({ schemaVersion: 1, storeId }) + '\n',
      );
      await exclusive(
        join(location.root, 'holds.json'),
        JSON.stringify({ schemaVersion: 1, storeId, segmentIds: [] }) + '\n',
      );
      await exclusive(
        join(location.root, 'state.json'),
        JSON.stringify({ schemaVersion: 1, storeId, lastRetentionUtc: null }) + '\n',
      );
    } else if (names.includes('unfinished.json')) throw new Error('LOG_RECOVERY_REQUIRED');
    await exclusive(
      join(location.root, 'unfinished.json'),
      JSON.stringify({ schemaVersion: 1, storeId, ownerToken: files.ownerToken }) + '\n',
    );
    return files;
  }
  async verify(): Promise<void> {
    if (this.released) throw new Error('LOG_RELEASED');
    await parent(this.location);
    await plainLogDirectory(this.root);
    const owner = parseStoreDocument(
      await readLogFile(join(this.root, 'owner.json'), STORE_DOCUMENT_BYTES),
      'owner',
      this.storeId,
    );
    const lock = join(this.root, '.writer-lock');
    await plainLogDirectory(lock);
    const identity = parseStoreDocument(
      await readLogFile(join(lock, 'owner.json'), STORE_DOCUMENT_BYTES),
      'lock',
      this.storeId,
    );
    if (!owner || !identity || identity.ownerToken !== this.ownerToken)
      throw new Error('LOG_OWNER_REJECTED');
  }
  async document(name: string, kind: StoreKind): Promise<StoreDocument> {
    await this.verify();
    if (!recognizedStoreName(name) || name === '.writer-lock') throw new Error('LOG_NAME_REJECTED');
    const result = parseStoreDocument(
      await readLogFile(join(this.root, name), STORE_DOCUMENT_BYTES),
      kind,
      this.storeId,
    );
    if (!result || !documentName(name, kind, result)) throw new Error('LOG_METADATA_REJECTED');
    return result;
  }
  async replace(name: string, kind: StoreKind, value: StoreDocument): Promise<void> {
    await this.verify();
    const bytes = JSON.stringify(value) + '\n';
    if (
      !recognizedStoreName(name) ||
      !documentName(name, kind, value) ||
      name === '.writer-lock' ||
      !parseStoreDocument(bytes, kind, this.storeId)
    )
      throw new Error('LOG_METADATA_REJECTED');
    try {
      const stat = await lstat(join(this.root, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('LOG_FILE_REJECTED');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    const temp = join(this.root, `pending-${randomUUID()}.tmp`);
    await exclusive(temp, bytes);
    await rename(temp, join(this.root, name));
    if ((await readLogFile(join(this.root, name), STORE_DOCUMENT_BYTES)) !== bytes)
      throw new Error('LOG_READBACK_FAILED');
  }
  async createSegment(name: string): Promise<FileHandle> {
    await this.verify();
    if (!/^segment-[0-9a-f-]{36}\.jsonl$/.test(name) || !diagnosticId(name.slice(8, 44)))
      throw new Error('LOG_NAME_REJECTED');
    return open(join(this.root, name), 'wx');
  }
  async remove(name: string): Promise<void> {
    await this.verify();
    if (
      !/^segment-[0-9a-f-]{36}\.(?:jsonl|meta\.json)$/.test(name) ||
      !diagnosticId(name.slice(8, 44))
    )
      throw new Error('LOG_NAME_REJECTED');
    const path = join(this.root, name),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('LOG_FILE_REJECTED');
    await unlink(path);
  }
  async release(
    afterStep: (
      step: 'receipt' | 'unfinished' | 'owner' | 'lock',
    ) => void | Promise<void> = () => {},
    mayContinue: () => boolean = () => true,
  ): Promise<void> {
    const proceed = () => {
      if (!mayContinue()) throw new Error('LOG_RELEASE_ABANDONED');
    };
    proceed();
    await this.verify();
    const unfinished = await this.document('unfinished.json', 'unfinished');
    if (unfinished.ownerToken !== this.ownerToken) throw new Error('LOG_OWNER_REJECTED');
    await this.replace('release.json', 'release', {
      schemaVersion: 1,
      storeId: this.storeId,
      ownerToken: this.ownerToken,
    });
    await afterStep('receipt');
    proceed();
    await unlink(join(this.root, 'unfinished.json'));
    await afterStep('unfinished');
    proceed();
    await unlink(join(this.root, '.writer-lock', 'owner.json'));
    await afterStep('owner');
    proceed();
    await rmdir(join(this.root, '.writer-lock'));
    await afterStep('lock');
    this.released = true;
  }
}
