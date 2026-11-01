// Pure pinned ZIP decoding; no filesystem, network, license or executable authority.
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { PLATFORM_TOOLS_CANDIDATE } from './platform-tools-candidate.ts';
export type PlatformToolsArchiveFile = Readonly<{ name: string; bytes: Uint8Array }>;
const sha = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
function reject(): never {
  throw new Error('ARCHIVE_REJECTED');
}
function crc(raw: Uint8Array): number {
  let n = 0xffffffff;
  for (const b of raw) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
export function snapshotPlatformToolsArchive(raw: unknown): Buffer {
  try {
    const prototype = Object.getPrototypeOf(Uint8Array.prototype);
    if (
      Object.getOwnPropertyDescriptor(prototype, Symbol.toStringTag)?.get?.call(raw) !==
      'Uint8Array'
    )
      reject();
    const buffer = Object.getOwnPropertyDescriptor(prototype, 'buffer')?.get?.call(raw);
    const offset = Object.getOwnPropertyDescriptor(prototype, 'byteOffset')?.get?.call(raw);
    const length = Object.getOwnPropertyDescriptor(prototype, 'byteLength')?.get?.call(raw);
    if (
      !(buffer instanceof ArrayBuffer) ||
      length !== PLATFORM_TOOLS_CANDIDATE.archive.bytes ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      reject();
    const copy = Buffer.from(new Uint8Array(buffer, offset, length));
    if (sha(copy) !== PLATFORM_TOOLS_CANDIDATE.archive.sha256) reject();
    return copy;
  } catch {
    reject();
  }
}
export function decodePlatformToolsArchive(input: unknown): readonly PlatformToolsArchiveFile[] {
  try {
    const raw = snapshotPlatformToolsArchive(input),
      candidate = PLATFORM_TOOLS_CANDIDATE;
    if (sha(raw) !== candidate.archive.sha256) reject();
    const end = raw.length - 22;
    if (
      raw.readUInt32LE(end) !== 0x06054b50 ||
      raw.readUInt16LE(end + 4) !== 0 ||
      raw.readUInt16LE(end + 6) !== 0 ||
      raw.readUInt16LE(end + 20) !== 0
    )
      reject();
    const count = raw.readUInt16LE(end + 8),
      total = raw.readUInt16LE(end + 10),
      size = raw.readUInt32LE(end + 12),
      start = raw.readUInt32LE(end + 16);
    if (count !== 15 || total !== 15 || start + size !== end) reject();
    const expected = new Map(candidate.files.map((row) => ['platform-tools/' + row.path, row]));
    const seen = new Set<string>(),
      out: PlatformToolsArchiveFile[] = [];
    let at = start,
      localEnd = 0,
      expanded = 0;
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || raw.readUInt32LE(at) !== 0x02014b50) reject();
      const flags = raw.readUInt16LE(at + 8),
        method = raw.readUInt16LE(at + 10),
        checksum = raw.readUInt32LE(at + 16),
        compressed = raw.readUInt32LE(at + 20),
        length = raw.readUInt32LE(at + 24),
        nameSize = raw.readUInt16LE(at + 28),
        extra = raw.readUInt16LE(at + 30),
        comment = raw.readUInt16LE(at + 32),
        disk = raw.readUInt16LE(at + 34),
        attributes = raw.readUInt32LE(at + 38),
        offset = raw.readUInt32LE(at + 42);
      if (
        flags !== 0 ||
        extra !== 0 ||
        comment !== 0 ||
        disk !== 0 ||
        nameSize < 1 ||
        nameSize > 128 ||
        at + 46 + nameSize > end ||
        offset !== localEnd
      )
        reject();
      const nameBytes = raw.subarray(at + 46, at + 46 + nameSize),
        name = nameBytes.toString('utf8');
      if (!Buffer.from(name, 'utf8').equals(nameBytes) || seen.has(name)) reject();
      seen.add(name);
      const directory = name === 'platform-tools/',
        row = expected.get(name);
      if (
        directory
          ? i !== 0 ||
            method !== 0 ||
            length !== 0 ||
            compressed !== 0 ||
            checksum !== 0 ||
            ((attributes >>> 16) & 0xf000) !== 0x4000
          : !row ||
            method !== 8 ||
            length !== row.bytes ||
            ((attributes >>> 16) & 0xf000) !== 0x8000
      )
        reject();
      if (
        offset + 30 + nameSize > start ||
        raw.readUInt32LE(offset) !== 0x04034b50 ||
        raw.readUInt16LE(offset + 6) !== flags ||
        raw.readUInt16LE(offset + 8) !== method ||
        raw.readUInt32LE(offset + 14) !== checksum ||
        raw.readUInt32LE(offset + 18) !== compressed ||
        raw.readUInt32LE(offset + 22) !== length ||
        raw.readUInt16LE(offset + 26) !== nameSize ||
        raw.readUInt16LE(offset + 28) !== 0 ||
        !raw.subarray(offset + 30, offset + 30 + nameSize).equals(nameBytes)
      )
        reject();
      const dataStart = offset + 30 + nameSize;
      localEnd = dataStart + compressed;
      if (localEnd > start) reject();
      if (!directory && row) {
        const data = inflateRawSync(raw.subarray(dataStart, localEnd), { maxOutputLength: length });
        expanded += data.length;
        if (
          data.length !== length ||
          expanded > 17529398 ||
          crc(data) !== checksum ||
          sha(data) !== row.sha256
        )
          reject();
        if (row.peMachine !== null) {
          const pe = data.readUInt32LE(0x3c);
          if (
            data.readUInt16LE(0) !== 0x5a4d ||
            pe < 64 ||
            pe > 1048576 ||
            pe > data.length - 26 ||
            data.readUInt32LE(pe) !== 0x00004550 ||
            data.readUInt16LE(pe + 4) !== row.peMachine ||
            data.readUInt16LE(pe + 24) !== row.peMagic
          )
            reject();
        }
        out.push(Object.freeze({ name: row.path, bytes: new Uint8Array(data) }));
      }
      at += 46 + nameSize;
    }
    if (
      at !== end ||
      localEnd !== start ||
      out.length !== 14 ||
      expanded !== 17529398 ||
      !candidate.files.every((row) => seen.has('platform-tools/' + row.path))
    )
      reject();
    return Object.freeze(out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
  } catch {
    reject();
  }
}
