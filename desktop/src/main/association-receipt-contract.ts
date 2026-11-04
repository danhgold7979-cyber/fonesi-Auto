// Private canonical transcript integrity, never a physical fingerprint or runtime authority.
import { createHash } from 'node:crypto';
import { validAdbSerial, validTransportId } from './adb-discovery.ts';
export type AssociationRow = Readonly<{ serial: string; transportId: string; state: 'DEVICE' }>;
export type AssociationStage = Readonly<{
  sequence: number;
  observedUtc: number;
  registryRevision: number;
  durableRevision: number;
  rowsSha256: string;
}>;
export type AssociationConfirmation = Readonly<
  Pick<AssociationStage, 'sequence' | 'observedUtc' | 'rowsSha256'>
>;
type Common = Readonly<{
  version: 1;
  kind: 'OPERATOR_CABLE_SESSION';
  evidenceId: string;
  deviceId: string;
  mode: 'CURRENT' | 'HISTORICAL';
  hostEpoch: number;
  installationRevision: number;
  admittedUtc: number;
  deadlineUtc: number;
  priorBindingId: string | null;
  priorGeneration: number;
  beforeRow: AssociationRow;
  returnRow: AssociationRow;
  attestation: Readonly<{ heldHandset: true; cableCycle: true; sameHistoricalHandset: boolean }>;
}>;
export type AssociationTranscript = Common &
  Readonly<{
    stages: Readonly<{
      baseline: AssociationStage;
      removal: AssociationStage;
      return: AssociationStage;
      confirmation: AssociationConfirmation;
    }>;
  }>;
export type AssociationReceipt = Common &
  Readonly<{
    finalBindingId: string;
    finalGeneration: number;
    stages: Readonly<{
      baseline: AssociationStage;
      removal: AssociationStage;
      return: AssociationStage;
      confirmation: AssociationStage;
    }>;
  }>;
export type DurableAssociationReceipt = Readonly<{
  evidence_id: string;
  receipt_version: 1;
  receipt_json: string;
  transcript_sha256: string;
}>;
const baseKeys = [
  'version',
  'kind',
  'evidenceId',
  'deviceId',
  'mode',
  'hostEpoch',
  'installationRevision',
  'admittedUtc',
  'deadlineUtc',
  'priorBindingId',
  'priorGeneration',
] as const;
const tailKeys = ['beforeRow', 'returnRow', 'attestation', 'stages'] as const;
const stages = ['baseline', 'removal', 'return', 'confirmation'] as const;
const num = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const utc = (v: unknown): v is number => num(v) && v <= 8640000000000000;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && v.length === 64 && /^[0-9a-f]{64}$/.test(v);
function reject(): never {
  throw Error('ASSOCIATION_RECEIPT_REJECTED');
}
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    reject();
  const d = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(d).length !== keys.length) reject();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const p = d[k];
    if (!p || !Object.hasOwn(p, 'value') || !p.enumerable) reject();
    out[k] = p.value;
  }
  return out;
}
function row(v: unknown): AssociationRow {
  const r = record(v, ['serial', 'transportId', 'state']);
  if (
    !validAdbSerial(r.serial) ||
    !validTransportId(r.transportId) ||
    typeof r.serial !== 'string' ||
    typeof r.transportId !== 'string' ||
    /[\r\n]/.test(r.serial + r.transportId) ||
    r.state !== 'DEVICE'
  )
    reject();
  return Object.freeze(r) as AssociationRow;
}
function snapshot(input: unknown, final: boolean): AssociationTranscript | AssociationReceipt {
  const v = record(input, [
    ...baseKeys,
    ...(final ? ['finalBindingId', 'finalGeneration'] : []),
    ...tailKeys,
  ]);
  if (
    v.version !== 1 ||
    v.kind !== 'OPERATOR_CABLE_SESSION' ||
    !uuid(v.evidenceId) ||
    !uuid(v.deviceId) ||
    v.evidenceId === v.deviceId ||
    !['CURRENT', 'HISTORICAL'].includes(v.mode as string) ||
    !num(v.hostEpoch) ||
    v.hostEpoch < 1 ||
    !num(v.installationRevision) ||
    v.installationRevision < 1 ||
    !utc(v.admittedUtc) ||
    !utc(v.deadlineUtc) ||
    v.deadlineUtc - v.admittedUtc !== 120000 ||
    !num(v.priorGeneration)
  )
    reject();
  if (v.priorBindingId !== null && !uuid(v.priorBindingId)) reject();
  if (v.mode === 'CURRENT' && v.priorBindingId === null) reject();
  if (
    final &&
    (!uuid(v.finalBindingId) || !num(v.finalGeneration) || v.finalGeneration < v.priorGeneration)
  )
    reject();
  const ids = [
    v.evidenceId,
    v.deviceId,
    ...(v.priorBindingId === null ? [] : [v.priorBindingId]),
    ...(final ? [v.finalBindingId] : []),
  ];
  if (new Set(ids).size !== ids.length) reject();
  v.beforeRow = row(v.beforeRow);
  v.returnRow = row(v.returnRow);
  const before = v.beforeRow as AssociationRow,
    returned = v.returnRow as AssociationRow;
  if (before.serial !== returned.serial || before.transportId === returned.transportId) reject();
  const attest = record(v.attestation, ['heldHandset', 'cableCycle', 'sameHistoricalHandset']);
  if (
    attest.heldHandset !== true ||
    attest.cableCycle !== true ||
    attest.sameHistoricalHandset !== (v.mode === 'HISTORICAL')
  )
    reject();
  v.attestation = Object.freeze(attest);
  const all = record(v.stages, stages),
    out: Record<string, unknown> = {};
  let seq = -1,
    time = v.admittedUtc,
    registry = -1,
    durable = -1;
  for (const name of stages) {
    const complete = final || name !== 'confirmation';
    const s = record(
      all[name],
      complete
        ? ['sequence', 'observedUtc', 'registryRevision', 'durableRevision', 'rowsSha256']
        : ['sequence', 'observedUtc', 'rowsSha256'],
    );
    if (
      !num(s.sequence) ||
      s.sequence <= seq ||
      !utc(s.observedUtc) ||
      s.observedUtc < time ||
      s.observedUtc > v.deadlineUtc ||
      !hash(s.rowsSha256)
    )
      reject();
    if (complete) {
      if (
        !num(s.registryRevision) ||
        s.registryRevision <= registry ||
        !num(s.durableRevision) ||
        s.durableRevision <= durable
      )
        reject();
      registry = s.registryRevision;
      durable = s.durableRevision;
    }
    seq = s.sequence;
    time = s.observedUtc;
    out[name] = Object.freeze(s);
  }
  if (
    (out.return as AssociationStage).rowsSha256 !==
    (out.confirmation as AssociationConfirmation).rowsSha256
  )
    reject();
  v.stages = Object.freeze(out);
  const result = Object.freeze(v);
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4096) reject();
  return result as AssociationTranscript | AssociationReceipt;
}
export function snapshotAssociationTranscript(input: unknown): AssociationTranscript | null {
  try {
    return snapshot(input, false) as AssociationTranscript;
  } catch {
    return null;
  }
}
export function snapshotAssociationReceipt(input: unknown): AssociationReceipt | null {
  try {
    return snapshot(input, true) as AssociationReceipt;
  } catch {
    return null;
  }
}
export function parseAssociationReceipt(raw: unknown): AssociationReceipt | null {
  try {
    if (typeof raw !== 'string' || raw.length > 4096 || Buffer.byteLength(raw, 'utf8') > 4096)
      return null;
    const value = snapshotAssociationReceipt(JSON.parse(raw));
    return value && JSON.stringify(value) === raw ? value : null;
  } catch {
    return null;
  }
}
export function snapshotAssociationRow(input: unknown): DurableAssociationReceipt | null {
  try {
    const row = record(input, [
      'evidence_id',
      'receipt_version',
      'receipt_json',
      'transcript_sha256',
    ]);
    const r = parseAssociationReceipt(row.receipt_json);
    if (
      !r ||
      row.evidence_id !== r.evidenceId ||
      row.receipt_version !== 1 ||
      !hash(row.transcript_sha256) ||
      createHash('sha256')
        .update(row.receipt_json as string, 'utf8')
        .digest('hex') !== row.transcript_sha256
    )
      return null;
    return Object.freeze(row) as DurableAssociationReceipt;
  } catch {
    return null;
  }
}
export function createAssociationReceipt(
  input: unknown,
  finalInput: unknown,
): DurableAssociationReceipt | null {
  try {
    const t = snapshotAssociationTranscript(input),
      f = record(finalInput, [
        'finalBindingId',
        'finalGeneration',
        'registryRevision',
        'durableRevision',
      ]);
    if (!t) return null;
    const receipt = snapshotAssociationReceipt({
      ...t,
      finalBindingId: f.finalBindingId,
      finalGeneration: f.finalGeneration,
      stages: {
        ...t.stages,
        confirmation: {
          ...t.stages.confirmation,
          registryRevision: f.registryRevision,
          durableRevision: f.durableRevision,
        },
      },
    });
    if (!receipt) return null;
    const raw = JSON.stringify(receipt);
    return Object.freeze({
      evidence_id: receipt.evidenceId,
      receipt_version: 1,
      receipt_json: raw,
      transcript_sha256: createHash('sha256').update(raw, 'utf8').digest('hex'),
    });
  } catch {
    return null;
  }
}
// Canonical complete normalized rowsets: fixed key order, code-unit lexical tuple order.
export function associationRowsSha256(input: unknown): string | null {
  try {
    if (!Array.isArray(input)) return null;
    const length = Object.getOwnPropertyDescriptor(input, 'length')?.value;
    if (!num(length) || length > 256) return null;
    const d = Object.getOwnPropertyDescriptors(input) as Record<string, PropertyDescriptor>;
    if (d.length?.value !== length || Reflect.ownKeys(d).length !== length + 1) return null;
    const rows: Readonly<{ serial: string; transportId: string | null; state: string }>[] = [];
    const serials = new Set<string>(),
      transports = new Set<string>();
    for (let i = 0; i < length; i++) {
      const item = d[String(i)];
      if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) return null;
      const r = record(item.value, ['serial', 'transportId', 'state']);
      if (
        !validAdbSerial(r.serial) ||
        typeof r.serial !== 'string' ||
        /[\r\n]/.test(r.serial) ||
        !(
          r.transportId === null ||
          (typeof r.transportId === 'string' &&
            validTransportId(r.transportId) &&
            !/[\r\n]/.test(r.transportId))
        ) ||
        !['DEVICE', 'UNAUTHORIZED', 'OFFLINE', 'UNKNOWN'].includes(r.state as string) ||
        serials.has(r.serial) ||
        (r.transportId !== null && transports.has(r.transportId as string))
      )
        return null;
      serials.add(r.serial);
      if (r.transportId !== null) transports.add(r.transportId as string);
      rows.push(Object.freeze(r) as (typeof rows)[number]);
    }
    rows.sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
    return createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
  } catch {
    return null;
  }
}
