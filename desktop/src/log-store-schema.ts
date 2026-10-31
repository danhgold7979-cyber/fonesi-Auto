import { diagnosticId, utcTimestamp, encodeLogRecord } from './log-contract.ts';
export type StoreKind =
  | 'owner'
  | 'holds'
  | 'state'
  | 'lock'
  | 'unfinished'
  | 'segment'
  | 'recovery'
  | 'release';
export type StoreDocument = Record<string, unknown>;
export type SegmentMetadata = Readonly<{
  schemaVersion: 1;
  segmentId: string;
  storeId: string;
  runId: string;
  firstSequence: number;
  lastSequence: number;
  maxUtc: string;
  finalized: boolean;
}>;
export const STORE_DOCUMENT_BYTES = 65536;
export const SEGMENT_BYTES = 1048576;
export const ROOT_ENTRY_LIMIT = 4096;
const fields: Record<StoreKind, readonly string[]> = {
  owner: ['schemaVersion', 'storeId'],
  holds: ['schemaVersion', 'storeId', 'segmentIds'],
  state: ['schemaVersion', 'storeId', 'lastRetentionUtc'],
  lock: ['schemaVersion', 'storeId', 'ownerToken', 'pid'],
  unfinished: ['schemaVersion', 'storeId', 'ownerToken'],
  release: ['schemaVersion', 'storeId', 'ownerToken'],
  segment: [
    'schemaVersion',
    'segmentId',
    'storeId',
    'runId',
    'firstSequence',
    'lastSequence',
    'maxUtc',
    'finalized',
  ],
  recovery: [
    'schemaVersion',
    'storeId',
    'recoveryId',
    'previousOwnerToken',
    'segmentIds',
    'pendingIds',
  ],
};
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function parseStoreDocument(
  raw: unknown,
  kind: StoreKind,
  expectedStore?: string,
): StoreDocument | null {
  if (
    typeof raw !== 'string' ||
    raw.length > STORE_DOCUMENT_BYTES ||
    new TextEncoder().encode(raw).byteLength > STORE_DOCUMENT_BYTES
  )
    return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const document = value as StoreDocument,
      canonical: StoreDocument = {};
    if (
      Object.keys(document).length !== fields[kind].length ||
      document.schemaVersion !== 1 ||
      !diagnosticId(document.storeId) ||
      (expectedStore !== undefined && document.storeId !== expectedStore)
    )
      return null;
    for (const name of fields[kind]) {
      if (!Object.hasOwn(document, name)) return null;
      canonical[name] = document[name];
    }
    if (raw !== JSON.stringify(canonical) + '\n') return null;
    if (kind === 'holds' || kind === 'recovery') {
      if (
        !Array.isArray(document.segmentIds) ||
        document.segmentIds.length > ROOT_ENTRY_LIMIT ||
        !document.segmentIds.every(diagnosticId) ||
        new Set(document.segmentIds).size !== document.segmentIds.length
      )
        return null;
    }
    if (
      kind === 'recovery' &&
      (!Array.isArray(document.pendingIds) ||
        document.pendingIds.length > ROOT_ENTRY_LIMIT ||
        !document.pendingIds.every(diagnosticId) ||
        new Set(document.pendingIds).size !== document.pendingIds.length)
    )
      return null;
    if (
      kind === 'state' &&
      document.lastRetentionUtc !== null &&
      !utcTimestamp(document.lastRetentionUtc)
    )
      return null;
    if (
      (kind === 'lock' || kind === 'unfinished' || kind === 'release') &&
      !diagnosticId(document.ownerToken)
    )
      return null;
    if (kind === 'lock' && !positive(document.pid)) return null;
    if (
      kind === 'recovery' &&
      (!diagnosticId(document.recoveryId) || !diagnosticId(document.previousOwnerToken))
    )
      return null;
    if (
      kind === 'segment' &&
      (!diagnosticId(document.segmentId) ||
        !diagnosticId(document.runId) ||
        !positive(document.firstSequence) ||
        !positive(document.lastSequence) ||
        document.lastSequence < document.firstSequence ||
        !utcTimestamp(document.maxUtc) ||
        typeof document.finalized !== 'boolean')
    )
      return null;
    return canonical;
  } catch {
    return null;
  }
}
export function segmentFilename(id: string): string {
  if (!diagnosticId(id)) throw new Error('SEGMENT_ID');
  return `segment-${id}.jsonl`;
}
export function metadataFilename(id: string): string {
  if (!diagnosticId(id)) throw new Error('SEGMENT_ID');
  return `segment-${id}.meta.json`;
}
export function recognizedStoreName(name: string): boolean {
  if (
    [
      'owner.json',
      'holds.json',
      'state.json',
      'unfinished.json',
      'release.json',
      '.writer-lock',
    ].includes(name)
  )
    return true;
  return (
    (/^segment-[0-9a-f-]{36}\.(?:jsonl|meta\.json)$/.test(name) &&
      diagnosticId(name.slice(8, 44))) ||
    (/^recovery-[0-9a-f-]{36}\.json$/.test(name) && diagnosticId(name.slice(9, 45))) ||
    (/^pending-[0-9a-f-]{36}\.tmp$/.test(name) && diagnosticId(name.slice(8, 44)))
  );
}
// Finalized metadata is not sufficient alone: retention also verifies the stored records.
export function verifySegment(raw: unknown, metadata: SegmentMetadata): boolean {
  if (
    typeof raw !== 'string' ||
    raw.length > SEGMENT_BYTES ||
    new TextEncoder().encode(raw).byteLength > SEGMENT_BYTES ||
    !raw.endsWith('\n')
  )
    return false;
  const lines = raw.slice(0, -1).split('\n');
  let previous = 0,
    first = 0,
    maxUtc = '';
  for (const line of lines) {
    if (!line || line.length > 2048) return false;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return false;
    }
    const canonical = encodeLogRecord(value);
    if (canonical !== line + '\n') return false;
    const record = value as Record<string, unknown>;
    if (
      record.runId !== metadata.runId ||
      typeof record.sequence !== 'number' ||
      record.sequence <= previous ||
      typeof record.utc !== 'string'
    )
      return false;
    if (first === 0) first = record.sequence;
    previous = record.sequence;
    if (record.utc > maxUtc) maxUtc = record.utc;
  }
  return (
    first === metadata.firstSequence &&
    previous === metadata.lastSequence &&
    maxUtc === metadata.maxUtc
  );
}
