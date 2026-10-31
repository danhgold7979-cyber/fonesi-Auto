import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import {
  BACKUP_MAGIC,
  BACKUP_HEADER_BYTES,
  BACKUP_SNAPSHOT_BYTES,
  canonicalBase64,
  parseBackupHeader,
} from '../backup-container-contract.ts';
import type { BackupHeader, BackupMetadata } from '../backup-container-contract.ts';
export type BackupKeyAdapter = Readonly<{
  wrap: (base64Key: string) => Promise<Uint8Array>;
  unwrap: (wrapped: Uint8Array) => Promise<Readonly<{ result: string; shouldReEncrypt: boolean }>>;
}>;
export type ContainerFailure =
  | 'CONTAINER_REJECTED'
  | 'KEY_UNAVAILABLE'
  | 'KEY_ROTATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'IO_FAILED'
  | 'SOURCE_CHANGED'
  | 'DESTINATION_EXISTS';
export type ContainerResult =
  | Readonly<{ ok: true; header: BackupHeader; encryptedSha256: string }>
  | Readonly<{ ok: false; code: ContainerFailure }>;
const CHUNK = 65536;
// Main-only caller holds exclusive store ownership and validates both parent paths.
// Destinations must be new PRIVATE staging files. Failed plaintext is never usable;
// preserve it privately until caller's settled owned cleanup, never promote on existence.
// Filesystem checks do not defeat a hostile same-user concurrent path replacement.
async function source(path: string, limit: number): Promise<FileHandle> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > limit)
    throw new Error('FILE_REJECTED');
  const file = await open(path, 'r');
  try {
    const after = await file.stat();
    if (
      !after.isFile() ||
      after.size !== before.size ||
      after.ino !== before.ino ||
      after.dev !== before.dev
    )
      throw new Error('FILE_CHANGED');
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}
async function exact(file: FileHandle, length: number, position: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = await file.read(bytes, offset, length - offset, position + offset);
    if (read.bytesRead === 0) throw new Error('SHORT_READ');
    offset += read.bytesRead;
  }
  return bytes;
}
async function write(file: FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await file.write(bytes, offset, bytes.length - offset, null);
    if (result.bytesWritten === 0) throw new Error('SHORT_WRITE');
    offset += result.bytesWritten;
  }
}
async function digest(file: FileHandle, size: number): Promise<string> {
  const hash = createHash('sha256');
  for (let at = 0; at < size; at += CHUNK)
    hash.update(await exact(file, Math.min(CHUNK, size - at), at));
  return hash.digest('hex');
}
const failed = (code: ContainerFailure): ContainerResult => ({ ok: false, code });
function destinationError(error: unknown): ContainerFailure {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'
    ? 'DESTINATION_EXISTS'
    : 'IO_FAILED';
}
export async function encryptSnapshot(
  sourcePath: string,
  destinationPath: string,
  metadata: BackupMetadata,
  keys: BackupKeyAdapter,
): Promise<ContainerResult> {
  let input: FileHandle | undefined, output: FileHandle | undefined, key: Buffer | undefined;
  let code: ContainerFailure = 'IO_FAILED';
  try {
    input = await source(sourcePath, BACKUP_SNAPSHOT_BYTES);
    const size = (await input.stat()).size,
      plainHash = await digest(input, size);
    key = randomBytes(32);
    const nonce = randomBytes(12);
    code = 'KEY_UNAVAILABLE';
    const wrapped = await keys.wrap(key.toString('base64'));
    if (!(wrapped instanceof Uint8Array) || wrapped.byteLength < 1 || wrapped.byteLength > 49152)
      return failed('KEY_UNAVAILABLE');
    const raw = JSON.stringify({
      formatVersion: 1,
      storeId: metadata.storeId,
      locationId: metadata.locationId,
      backupId: metadata.backupId,
      keyRef: metadata.keyRef,
      reason: metadata.reason,
      snapshotUtc: metadata.snapshotUtc,
      schemaVersion: metadata.schemaVersion,
      plaintextBytes: size,
      plaintextSha256: plainHash,
      nonceBase64: nonce.toString('base64'),
      wrappedKeyBase64: Buffer.from(wrapped).toString('base64'),
    });
    const header = parseBackupHeader(raw);
    if (!header) return failed('CONTAINER_REJECTED');
    const encoded = Buffer.from(raw, 'utf8'),
      prefix = Buffer.alloc(12);
    prefix.write(BACKUP_MAGIC, 0, 'ascii');
    prefix.writeUInt32BE(encoded.length, 8);
    const aad = Buffer.concat([prefix, encoded]);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    code = 'IO_FAILED';
    try {
      output = await open(destinationPath, 'wx', 0o600);
    } catch (error) {
      return failed(destinationError(error));
    }
    const encryptedHash = createHash('sha256'),
      secondHash = createHash('sha256');
    await write(output, aad);
    encryptedHash.update(aad);
    for (let at = 0; at < size; at += CHUNK) {
      const plain = await exact(input, Math.min(CHUNK, size - at), at);
      secondHash.update(plain);
      const encrypted = cipher.update(plain);
      plain.fill(0);
      await write(output, encrypted);
      encryptedHash.update(encrypted);
    }
    if ((await input.stat()).size !== size || secondHash.digest('hex') !== plainHash)
      return failed('SOURCE_CHANGED');
    const final = cipher.final(),
      tag = cipher.getAuthTag();
    await write(output, final);
    await write(output, tag);
    encryptedHash.update(final);
    encryptedHash.update(tag);
    await input.close();
    input = undefined;
    await output.sync();
    await output.close();
    output = undefined;
    return { ok: true, header, encryptedSha256: encryptedHash.digest('hex') };
  } catch {
    return failed(code);
  } finally {
    key?.fill(0);
    if (output) await output.close().catch(() => {});
    if (input) await input.close().catch(() => {});
  }
}
export async function decryptSnapshot(
  containerPath: string,
  destinationPath: string,
  keys: BackupKeyAdapter,
): Promise<ContainerResult> {
  let input: FileHandle | undefined, output: FileHandle | undefined, key: Buffer | undefined;
  let code: ContainerFailure = 'CONTAINER_REJECTED';
  try {
    input = await source(containerPath, 12 + BACKUP_HEADER_BYTES + BACKUP_SNAPSHOT_BYTES + 16);
    const size = (await input.stat()).size;
    if (size < 29) return failed('CONTAINER_REJECTED');
    const prefix = await exact(input, 12, 0);
    if (!prefix.subarray(0, 8).equals(Buffer.from(BACKUP_MAGIC, 'ascii')))
      return failed('CONTAINER_REJECTED');
    const headerBytes = prefix.readUInt32BE(8);
    if (headerBytes < 1 || headerBytes > BACKUP_HEADER_BYTES || 12 + headerBytes + 16 >= size)
      return failed('CONTAINER_REJECTED');
    const encoded = await exact(input, headerBytes, 12),
      header = parseBackupHeader(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(encoded),
      );
    if (!header || size !== 12 + headerBytes + header.plaintextBytes + 16)
      return failed('CONTAINER_REJECTED');
    code = 'KEY_UNAVAILABLE';
    const recovered = await keys.unwrap(Buffer.from(header.wrappedKeyBase64, 'base64'));
    if (
      recovered === null ||
      typeof recovered !== 'object' ||
      typeof recovered.shouldReEncrypt !== 'boolean' ||
      !canonicalBase64(recovered.result, 32, 32)
    )
      return failed('KEY_UNAVAILABLE');
    if (recovered.shouldReEncrypt) return failed('KEY_ROTATION_REQUIRED');
    key = Buffer.from(recovered.result, 'base64');
    const aad = Buffer.concat([prefix, encoded]),
      tag = await exact(input, 16, size - 16),
      decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.nonceBase64, 'base64'), {
        authTagLength: 16,
      });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    code = 'IO_FAILED';
    try {
      output = await open(destinationPath, 'wx', 0o600);
    } catch (error) {
      return failed(destinationError(error));
    }
    const plainHash = createHash('sha256'),
      encryptedHash = createHash('sha256');
    encryptedHash.update(aad);
    let total = 0;
    for (let at = 0; at < header.plaintextBytes; at += CHUNK) {
      const encrypted = await exact(
        input,
        Math.min(CHUNK, header.plaintextBytes - at),
        12 + headerBytes + at,
      );
      encryptedHash.update(encrypted);
      const plain = decipher.update(encrypted);
      total += plain.length;
      plainHash.update(plain);
      await write(output, plain);
      plain.fill(0);
    }
    code = 'AUTHENTICATION_FAILED';
    const final = decipher.final();
    total += final.length;
    plainHash.update(final);
    if (
      total !== header.plaintextBytes ||
      plainHash.digest('hex') !== header.plaintextSha256 ||
      (await input.stat()).size !== size
    )
      return failed('AUTHENTICATION_FAILED');
    code = 'IO_FAILED';
    await write(output, final);
    final.fill(0);
    encryptedHash.update(tag);
    await input.close();
    input = undefined;
    await output.sync();
    await output.close();
    output = undefined;
    return { ok: true, header, encryptedSha256: encryptedHash.digest('hex') };
  } catch {
    return failed(code);
  } finally {
    key?.fill(0);
    if (output) await output.close().catch(() => {});
    if (input) await input.close().catch(() => {});
  }
}
