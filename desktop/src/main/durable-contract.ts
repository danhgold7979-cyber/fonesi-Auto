// Pure bounded durable rows/deltas, never runtime VERIFIED or filesystem authority.
import { validAdbSerial, validTransportId } from './adb-discovery.ts';
import {
  snapshotAssociationRow,
  parseAssociationReceipt,
  type DurableAssociationReceipt,
} from './association-receipt-contract.ts';
export const DURABLE_LIMITS = Object.freeze({
  devices: 256,
  bindings: 4096,
  identityEvidence: 4096,
  associationReceipts: 4096,
  captures: 4096,
  holds: 4096,
});
export type DurableKind = 'STARTUP' | 'RECONCILE' | 'DISPLAY' | 'CAPTURE' | 'HOLD' | 'PRUNE';
export type CaptureState =
  | 'RESERVED'
  | 'VALIDATED'
  | 'STALE'
  | 'DELETE_PENDING'
  | 'DELETED'
  | 'UNCERTAIN';
export type DurableMeta = Readonly<{
  singleton: 1;
  revision: number;
  host_epoch: number;
  last_change_utc: number | null;
  last_operation_id: string | null;
  last_change_kind: DurableKind | null;
}>;
export type DurableDevice = Readonly<{
  device_id: string;
  generation: number;
  display_profile_revision: number;
  created_utc: number;
  updated_utc: number;
  last_seen_utc: number | null;
}>;
export type DurableBinding = Readonly<{
  binding_id: string;
  device_id: string;
  generation: number;
  serial: string;
  transport_id: string | null;
  source: 'ADB_DISCOVERY' | 'SYNTHETIC_TEST';
  last_state: 'DEVICE' | 'UNAUTHORIZED' | 'OFFLINE' | 'UNKNOWN';
  observed_utc: number;
  retired: 0 | 1;
}>;
export type DurableIdentityEvidence = Readonly<{
  evidence_id: string;
  device_id: string;
  observed_utc: number;
  source: 'ADB_DISCOVERY' | 'SYNTHETIC_TEST';
  identity_sha256: string | null;
}>;
export type DurableCapture = Readonly<{
  evidence_id: string;
  device_id: string;
  binding_id: string;
  generation: number;
  display_profile_revision: number;
  kind: 'PNG' | 'HIERARCHY_XML';
  captured_utc: number;
  display_evidence_id: string;
  display_observed_utc: number;
  valid_until_utc: number;
  expires_utc: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  source: 'SYNTHETIC_TEST' | 'VALIDATED_CAPTURE';
  relative_name: string;
  sha256: string | null;
  bytes: number | null;
  state: CaptureState;
}>;
export type DurableHold = Readonly<{
  hold_id: string;
  evidence_id: string;
  reason: 'OUTCOME_UNKNOWN' | 'RECONCILIATION';
}>;
export type DurableSnapshot = Readonly<{
  meta: DurableMeta;
  devices: readonly DurableDevice[];
  bindings: readonly DurableBinding[];
  identityEvidence: readonly DurableIdentityEvidence[];
  associationReceipts: readonly DurableAssociationReceipt[];
  captures: readonly DurableCapture[];
  holds: readonly DurableHold[];
}>;
export type DurableTransition = Readonly<{
  evidenceId: string;
  expectedState: CaptureState;
  state: CaptureState;
  sha256: string | null;
  bytes: number | null;
}>;
export type DurableDelta = Readonly<{
  operationId: string;
  kind: DurableKind;
  utc: number;
  hostEpoch: number;
  devices: Readonly<{ insert: readonly DurableDevice[]; update: readonly DurableDevice[] }>;
  bindings: Readonly<{
    insert: readonly DurableBinding[];
    refresh: readonly Readonly<{ bindingId: string; observedUtc: number }>[];
    retireIds: readonly string[];
  }>;
  identityEvidence: Readonly<{ insert: readonly DurableIdentityEvidence[] }>;
  associationReceipts: Readonly<{ insert: readonly DurableAssociationReceipt[] }>;
  captures: Readonly<{
    insert: readonly DurableCapture[];
    transition: readonly DurableTransition[];
  }>;
  holds: Readonly<{ insert: readonly DurableHold[]; releaseIds: readonly string[] }>;
}>;
export const DURABLE_COLUMNS = Object.freeze({
  registry_meta: Object.freeze([
    'singleton',
    'revision',
    'host_epoch',
    'last_change_utc',
    'last_operation_id',
    'last_change_kind',
  ]),
  registry_device: Object.freeze([
    'device_id',
    'generation',
    'display_profile_revision',
    'created_utc',
    'updated_utc',
    'last_seen_utc',
  ]),
  registry_binding: Object.freeze([
    'binding_id',
    'device_id',
    'generation',
    'serial',
    'transport_id',
    'source',
    'last_state',
    'observed_utc',
    'retired',
  ]),
  registry_identity_evidence: Object.freeze([
    'evidence_id',
    'device_id',
    'observed_utc',
    'source',
    'identity_sha256',
  ]),
  capture_artifact: Object.freeze([
    'evidence_id',
    'device_id',
    'binding_id',
    'generation',
    'display_profile_revision',
    'kind',
    'captured_utc',
    'display_evidence_id',
    'display_observed_utc',
    'valid_until_utc',
    'expires_utc',
    'width',
    'height',
    'rotation',
    'source',
    'relative_name',
    'sha256',
    'bytes',
    'state',
  ]),
  capture_hold: Object.freeze(['hold_id', 'evidence_id', 'reason']),
  device_session_association: Object.freeze([
    'evidence_id',
    'receipt_version',
    'receipt_json',
    'transcript_sha256',
  ]),
});
const kinds = ['STARTUP', 'RECONCILE', 'DISPLAY', 'CAPTURE', 'HOLD', 'PRUNE'];
const states = ['RESERVED', 'VALIDATED', 'STALE', 'DELETE_PENDING', 'DELETED', 'UNCERTAIN'];
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const hash = (v: unknown): v is string =>
  typeof v === 'string' && v.length === 64 && /^[0-9a-f]{64}$/.test(v);
function reject(): never {
  throw Error('DURABLE_REJECTED');
}
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    reject();
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== keys.length) reject();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const x = d[key];
    if (!x || !Object.hasOwn(x, 'value') || !x.enumerable) reject();
    out[key] = x.value;
  }
  return out;
}
function array(input: unknown, max: number): unknown[] {
  if (!Array.isArray(input)) reject();
  const length = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (!number(length) || length > max) reject();
  const d = Object.getOwnPropertyDescriptors(input) as Record<string, PropertyDescriptor>;
  if (d.length?.value !== length || Reflect.ownKeys(d).length !== length + 1) reject();
  const out = [];
  for (let i = 0; i < length; i++) {
    const x = d[String(i)];
    if (!x || !Object.hasOwn(x, 'value') || !x.enumerable) reject();
    out.push(x.value);
  }
  return out;
}
function ids(input: unknown, max: number): readonly string[] {
  const a = array(input, max);
  if (!a.every(uuid) || new Set(a).size !== a.length) reject();
  return Object.freeze((a as string[]).slice().sort());
}
function row(table: keyof typeof DURABLE_COLUMNS, input: unknown): Record<string, unknown> {
  if (table === 'device_session_association') {
    const value = snapshotAssociationRow(input);
    if (!value) reject();
    return value;
  }
  const v = record(input, DURABLE_COLUMNS[table]);
  for (const [k, x] of Object.entries(v)) {
    if (k === 'singleton') {
      if (x !== 1) reject();
    } else if (k.endsWith('_id') && k !== 'transport_id') {
      if (x === null && k === 'last_operation_id') continue;
      if (!uuid(x)) reject();
    } else if (k.endsWith('_sha256') || k === 'sha256') {
      if (x !== null && !hash(x)) reject();
    } else if (
      k.endsWith('_utc') ||
      [
        'revision',
        'host_epoch',
        'generation',
        'display_profile_revision',
        'width',
        'height',
        'rotation',
        'bytes',
      ].includes(k)
    ) {
      if (x === null && ['last_change_utc', 'last_seen_utc', 'bytes'].includes(k)) continue;
      if (!number(x)) reject();
    } else if (k === 'serial') {
      if (!validAdbSerial(x)) reject();
    } else if (k === 'transport_id') {
      if (x !== null && !validTransportId(x)) reject();
    } else if (k === 'retired') {
      if (x !== 0 && x !== 1) reject();
    } else if (k === 'source') {
      if (
        !(
          table === 'capture_artifact'
            ? ['SYNTHETIC_TEST', 'VALIDATED_CAPTURE']
            : ['ADB_DISCOVERY', 'SYNTHETIC_TEST']
        ).includes(x as string)
      )
        reject();
    } else if (k === 'last_state') {
      if (!['DEVICE', 'UNAUTHORIZED', 'OFFLINE', 'UNKNOWN'].includes(x as string)) reject();
    } else if (k === 'last_change_kind') {
      if (x !== null && !kinds.includes(x as string)) reject();
    } else if (k === 'state') {
      if (!states.includes(x as string)) reject();
    } else if (k === 'kind') {
      if (!['PNG', 'HIERARCHY_XML'].includes(x as string)) reject();
    } else if (k === 'reason') {
      if (!['OUTCOME_UNKNOWN', 'RECONCILIATION'].includes(x as string)) reject();
    } else if (k === 'relative_name') {
      if (
        typeof x !== 'string' ||
        x !== `capture-${v.evidence_id}.${v.kind === 'PNG' ? 'png' : 'xml'}`
      )
        reject();
    } else reject();
  }
  if (table === 'registry_meta') {
    const empty = v.last_change_utc === null;
    if (empty !== (v.last_operation_id === null) || empty !== (v.last_change_kind === null))
      reject();
    if ((v.revision === 0) !== empty || (v.host_epoch as number) > (v.revision as number)) reject();
  }
  if (
    table === 'registry_device' &&
    ((v.updated_utc as number) < (v.created_utc as number) ||
      (v.last_seen_utc !== null && (v.last_seen_utc as number) > (v.updated_utc as number)))
  )
    reject();
  if (table === 'capture_artifact') {
    if (
      (v.width as number) < 1 ||
      (v.width as number) > 65535 ||
      (v.height as number) < 1 ||
      (v.height as number) > 65535 ||
      ![0, 90, 180, 270].includes(v.rotation as number)
    )
      reject();
    if (
      v.evidence_id === v.display_evidence_id ||
      (v.captured_utc as number) < (v.display_observed_utc as number) ||
      (v.valid_until_utc as number) < (v.display_observed_utc as number) ||
      v.expires_utc !== (v.captured_utc as number) + 604800000
    )
      reject();
    if (
      (v.sha256 === null) !== (v.bytes === null) ||
      (['VALIDATED', 'STALE', 'DELETE_PENDING', 'DELETED'].includes(v.state as string) &&
        v.sha256 === null)
    )
      reject();
    if (
      v.bytes !== null &&
      ((v.bytes as number) < 1 || (v.bytes as number) > (v.kind === 'PNG' ? 16777216 : 1048576))
    )
      reject();
  }
  return Object.freeze(v);
}
function rows<T>(
  table: keyof typeof DURABLE_COLUMNS,
  input: unknown,
  max: number,
  key: string,
): readonly T[] {
  const a = array(input, max).map((x) => row(table, x));
  if (new Set(a.map((x) => x[key])).size !== a.length) reject();
  a.sort((x, y) => String(x[key]).localeCompare(String(y[key])));
  return Object.freeze(a) as readonly T[];
}
function snapshot(input: unknown): DurableSnapshot {
  const v = record(input, [
    'meta',
    'devices',
    'bindings',
    'identityEvidence',
    'associationReceipts',
    'captures',
    'holds',
  ]);
  const meta = row('registry_meta', v.meta) as DurableMeta;
  const devices = rows<DurableDevice>('registry_device', v.devices, 256, 'device_id');
  const bindings = rows<DurableBinding>('registry_binding', v.bindings, 4096, 'binding_id');
  const identityEvidence = rows<DurableIdentityEvidence>(
    'registry_identity_evidence',
    v.identityEvidence,
    4096,
    'evidence_id',
  );
  const associationReceipts = rows<DurableAssociationReceipt>(
    'device_session_association',
    v.associationReceipts,
    4096,
    'evidence_id',
  );
  const captures = rows<DurableCapture>('capture_artifact', v.captures, 4096, 'evidence_id');
  const holds = rows<DurableHold>('capture_hold', v.holds, 4096, 'hold_id');
  const all = [
    ...devices.map((x) => x.device_id),
    ...bindings.map((x) => x.binding_id),
    ...identityEvidence.map((x) => x.evidence_id),
    ...captures.map((x) => x.evidence_id),
    ...holds.map((x) => x.hold_id),
  ];
  if (new Set(all).size !== all.length) reject();
  const ds = new Map(devices.map((x) => [x.device_id, x])),
    bs = new Map(bindings.map((x) => [x.binding_id, x])),
    cs = new Map(captures.map((x) => [x.evidence_id, x]));
  const active = new Set<string>();
  for (const b of bindings) {
    const d = ds.get(b.device_id);
    if (!d || b.generation > d.generation) reject();
    if (!b.retired) {
      if (b.generation !== d.generation || active.has(d.device_id)) reject();
      active.add(d.device_id);
    }
  }
  for (const e of identityEvidence) if (!ds.has(e.device_id)) reject();
  for (const a of associationReceipts) {
    const r = parseAssociationReceipt(a.receipt_json);
    if (!r) reject();
    const e = identityEvidence.find((x) => x.evidence_id === r.evidenceId),
      b = bs.get(r.finalBindingId),
      p = r.priorBindingId === null ? null : bs.get(r.priorBindingId);
    if (
      !e ||
      !b ||
      e.device_id !== r.deviceId ||
      e.identity_sha256 !== null ||
      e.observed_utc !== r.stages.confirmation.observedUtc ||
      b.device_id !== r.deviceId ||
      b.generation !== r.finalGeneration ||
      b.serial !== r.returnRow.serial ||
      b.transport_id !== r.returnRow.transportId ||
      b.last_state !== 'DEVICE' ||
      b.source !== e.source ||
      b.observed_utc < e.observed_utc ||
      r.hostEpoch > meta.host_epoch ||
      r.stages.confirmation.durableRevision > meta.revision
    )
      reject();
    if (
      r.priorBindingId !== null &&
      (!p ||
        p.device_id !== r.deviceId ||
        p.generation !== r.priorGeneration ||
        p.serial !== r.beforeRow.serial ||
        p.transport_id !== r.beforeRow.transportId ||
        p.source !== e.source ||
        p.retired !== 1)
    )
      reject();
  }
  for (const c of captures) {
    const d = ds.get(c.device_id),
      b = bs.get(c.binding_id);
    if (
      !d ||
      !b ||
      b.device_id !== c.device_id ||
      b.generation !== c.generation ||
      c.display_profile_revision > d.display_profile_revision ||
      all.includes(c.display_evidence_id)
    )
      reject();
  }
  for (const h of holds) {
    const c = cs.get(h.evidence_id);
    if (!c || ['DELETE_PENDING', 'DELETED'].includes(c.state)) reject();
  }
  return Object.freeze({
    meta,
    devices,
    bindings,
    identityEvidence,
    associationReceipts,
    captures,
    holds,
  });
}
// Explicit historical schema4 normalization only; current callers must supply the new field.
export function snapshotHistoricalDurableV4(input: unknown): DurableSnapshot | null {
  try {
    const v = record(input, [
      'meta',
      'devices',
      'bindings',
      'identityEvidence',
      'captures',
      'holds',
    ]);
    return snapshot({ ...v, associationReceipts: [] });
  } catch {
    return null;
  }
}
export function snapshotDurable(input: unknown): DurableSnapshot | null {
  try {
    return snapshot(input);
  } catch {
    return null;
  }
}
export function snapshotDurableDelta(input: unknown): DurableDelta | null {
  try {
    const v = record(input, [
      'operationId',
      'kind',
      'utc',
      'hostEpoch',
      'devices',
      'bindings',
      'identityEvidence',
      'associationReceipts',
      'captures',
      'holds',
    ]);
    if (
      !uuid(v.operationId) ||
      !kinds.includes(v.kind as string) ||
      !number(v.utc) ||
      !number(v.hostEpoch)
    )
      reject();
    const d = record(v.devices, ['insert', 'update']),
      b = record(v.bindings, ['insert', 'refresh', 'retireIds']),
      e = record(v.identityEvidence, ['insert']),
      a = record(v.associationReceipts, ['insert']),
      c = record(v.captures, ['insert', 'transition']),
      h = record(v.holds, ['insert', 'releaseIds']);
    const refresh = array(b.refresh, 4096).map((x) => {
      const r = record(x, ['bindingId', 'observedUtc']);
      if (!uuid(r.bindingId) || !number(r.observedUtc)) reject();
      return Object.freeze(r) as { bindingId: string; observedUtc: number };
    });
    const transition = array(c.transition, 4096).map((x) => {
      const t = record(x, ['evidenceId', 'expectedState', 'state', 'sha256', 'bytes']);
      if (
        !uuid(t.evidenceId) ||
        !states.includes(t.expectedState as string) ||
        !states.includes(t.state as string) ||
        (t.sha256 !== null && !hash(t.sha256)) ||
        (t.bytes !== null && !number(t.bytes))
      )
        reject();
      return Object.freeze(t) as DurableTransition;
    });
    if (
      new Set(refresh.map((x) => x.bindingId)).size !== refresh.length ||
      new Set(transition.map((x) => x.evidenceId)).size !== transition.length
    )
      reject();
    return Object.freeze({
      operationId: v.operationId,
      kind: v.kind as DurableKind,
      utc: v.utc,
      hostEpoch: v.hostEpoch,
      devices: Object.freeze({
        insert: rows<DurableDevice>('registry_device', d.insert, 256, 'device_id'),
        update: rows<DurableDevice>('registry_device', d.update, 256, 'device_id'),
      }),
      bindings: Object.freeze({
        insert: rows<DurableBinding>('registry_binding', b.insert, 4096, 'binding_id'),
        refresh: Object.freeze(refresh),
        retireIds: ids(b.retireIds, 4096),
      }),
      identityEvidence: Object.freeze({
        insert: rows<DurableIdentityEvidence>(
          'registry_identity_evidence',
          e.insert,
          4096,
          'evidence_id',
        ),
      }),
      associationReceipts: Object.freeze({
        insert: rows<DurableAssociationReceipt>(
          'device_session_association',
          a.insert,
          4096,
          'evidence_id',
        ),
      }),
      captures: Object.freeze({
        insert: rows<DurableCapture>('capture_artifact', c.insert, 4096, 'evidence_id'),
        transition: Object.freeze(transition),
      }),
      holds: Object.freeze({
        insert: rows<DurableHold>('capture_hold', h.insert, 4096, 'hold_id'),
        releaseIds: ids(h.releaseIds, 4096),
      }),
    });
  } catch {
    return null;
  }
}
export function applyDurableDelta(before: unknown, input: unknown): DurableSnapshot | null {
  try {
    const old = snapshot(before),
      d = snapshotDurableDelta(input);
    if (
      !d ||
      old.meta.revision === Number.MAX_SAFE_INTEGER ||
      d.utc < (old.meta.last_change_utc ?? 0) ||
      d.operationId === old.meta.last_operation_id
    )
      reject();
    const hasRegistry =
      d.devices.insert.length +
        d.devices.update.length +
        d.bindings.insert.length +
        d.bindings.refresh.length +
        d.bindings.retireIds.length +
        d.identityEvidence.insert.length +
        d.associationReceipts.insert.length >
      0;
    const hasCapture = d.captures.insert.length + d.captures.transition.length > 0,
      hasHolds = d.holds.insert.length + d.holds.releaseIds.length > 0;
    if (
      (['STARTUP', 'RECONCILE', 'DISPLAY'].includes(d.kind) && (hasCapture || hasHolds)) ||
      (['CAPTURE', 'PRUNE'].includes(d.kind) && (hasRegistry || hasHolds)) ||
      (d.kind === 'HOLD' && (hasRegistry || hasCapture))
    )
      reject();
    if (
      d.hostEpoch !== old.meta.host_epoch + (d.kind === 'STARTUP' ? 1 : 0) ||
      !number(d.hostEpoch)
    )
      reject();
    const devices = new Map(old.devices.map((x) => [x.device_id, x])),
      bindings = new Map(old.bindings.map((x) => [x.binding_id, x])),
      evidence = new Map(old.identityEvidence.map((x) => [x.evidence_id, x])),
      captures = new Map(old.captures.map((x) => [x.evidence_id, x])),
      holds = new Map(old.holds.map((x) => [x.hold_id, x])),
      associations = new Map(old.associationReceipts.map((x) => [x.evidence_id, x]));
    if (d.associationReceipts.insert.length && d.kind !== 'RECONCILE') reject();
    const insert = <T>(map: Map<string, T>, entries: readonly T[], key: (x: T) => string) => {
      for (const x of entries) {
        if (map.has(key(x))) reject();
        map.set(key(x), x);
      }
    };
    if (
      d.devices.update.some((x) => d.devices.insert.some((y) => x.device_id === y.device_id)) ||
      d.bindings.refresh.some(
        (x) =>
          d.bindings.insert.some((y) => x.bindingId === y.binding_id) ||
          d.bindings.retireIds.includes(x.bindingId),
      ) ||
      d.bindings.retireIds.some((x) => d.bindings.insert.some((y) => x === y.binding_id)) ||
      d.captures.transition.some((x) =>
        d.captures.insert.some((y) => x.evidenceId === y.evidence_id),
      ) ||
      d.holds.releaseIds.some((x) => d.holds.insert.some((y) => x === y.hold_id))
    )
      reject();
    if (d.kind === 'STARTUP') {
      if (
        d.devices.insert.length ||
        d.bindings.insert.length ||
        d.bindings.refresh.length ||
        d.identityEvidence.insert.length ||
        d.devices.update.length !== old.devices.length ||
        d.bindings.retireIds.length !== old.bindings.filter((x) => x.retired === 0).length
      )
        reject();
    }
    if (
      d.kind === 'DISPLAY' &&
      (d.devices.insert.length ||
        d.bindings.insert.length ||
        d.bindings.refresh.length ||
        d.bindings.retireIds.length ||
        d.identityEvidence.insert.length)
    )
      reject();
    for (const x of d.devices.insert)
      if (
        x.generation !== 0 ||
        x.display_profile_revision !== 0 ||
        x.created_utc !== d.utc ||
        x.updated_utc !== d.utc
      )
        reject();
    insert(devices, d.devices.insert, (x) => x.device_id);
    for (const x of d.devices.update) {
      const prior = devices.get(x.device_id);
      if (
        !prior ||
        x.created_utc !== prior.created_utc ||
        x.updated_utc !== d.utc ||
        x.generation < prior.generation ||
        x.generation > prior.generation + 1 ||
        x.display_profile_revision < prior.display_profile_revision ||
        x.display_profile_revision > prior.display_profile_revision + 1 ||
        (prior.last_seen_utc !== null &&
          (x.last_seen_utc === null || x.last_seen_utc < prior.last_seen_utc))
      )
        reject();
      if (
        d.kind === 'STARTUP' &&
        (x.generation !== prior.generation + 1 ||
          x.display_profile_revision !== prior.display_profile_revision ||
          x.last_seen_utc !== prior.last_seen_utc)
      )
        reject();
      if (
        d.kind === 'DISPLAY' &&
        (x.generation !== prior.generation ||
          x.display_profile_revision !== prior.display_profile_revision + 1 ||
          x.last_seen_utc !== prior.last_seen_utc)
      )
        reject();
      if (d.kind === 'RECONCILE' && x.display_profile_revision !== prior.display_profile_revision)
        reject();
      devices.set(x.device_id, x);
    }
    for (const key of d.bindings.retireIds) {
      const prior = bindings.get(key);
      if (!prior || prior.retired) reject();
      bindings.set(key, Object.freeze({ ...prior, retired: 1 }));
    }
    for (const x of d.bindings.refresh) {
      const prior = bindings.get(x.bindingId);
      if (!prior || prior.retired || x.observedUtc < prior.observed_utc || x.observedUtc > d.utc)
        reject();
      bindings.set(x.bindingId, Object.freeze({ ...prior, observed_utc: x.observedUtc }));
    }
    for (const x of d.bindings.insert) if (x.retired !== 0 || x.observed_utc > d.utc) reject();
    insert(bindings, d.bindings.insert, (x) => x.binding_id);
    for (const x of d.identityEvidence.insert) if (x.observed_utc > d.utc) reject();
    insert(evidence, d.identityEvidence.insert, (x) => x.evidence_id);
    for (const a of d.associationReceipts.insert) {
      const r = parseAssociationReceipt(a.receipt_json);
      if (!r) reject();
      const e = d.identityEvidence.insert.find((x) => x.evidence_id === r.evidenceId),
        b = d.bindings.insert.find((x) => x.binding_id === r.finalBindingId),
        prior = old.devices.find((x) => x.device_id === r.deviceId);
      if (
        !e ||
        !b ||
        !prior ||
        r.hostEpoch !== d.hostEpoch ||
        r.stages.return.durableRevision !== old.meta.revision ||
        r.stages.confirmation.durableRevision !== old.meta.revision + 1 ||
        d.utc < r.stages.confirmation.observedUtc ||
        d.utc > r.deadlineUtc ||
        b.retired !== 0 ||
        b.observed_utc !== r.stages.confirmation.observedUtc ||
        r.finalGeneration !== prior.generation ||
        d.devices.insert.some((x) => x.device_id === r.deviceId)
      )
        reject();
    }
    insert(associations, d.associationReceipts.insert, (x) => x.evidence_id);
    if (d.kind === 'PRUNE' && d.captures.insert.length) reject();
    for (const x of d.captures.insert)
      if (
        x.state !== 'RESERVED' ||
        x.sha256 !== null ||
        x.bytes !== null ||
        x.captured_utc !== d.utc
      )
        reject();
    insert(captures, d.captures.insert, (x) => x.evidence_id);
    const transitions: Record<CaptureState, readonly CaptureState[]> = {
      RESERVED: ['VALIDATED', 'STALE', 'UNCERTAIN'],
      VALIDATED: ['STALE', 'DELETE_PENDING', 'UNCERTAIN'],
      STALE: ['DELETE_PENDING', 'UNCERTAIN'],
      DELETE_PENDING: ['DELETED', 'UNCERTAIN'],
      DELETED: [],
      UNCERTAIN: ['UNCERTAIN'],
    };
    for (const x of d.captures.transition) {
      const prior = captures.get(x.evidenceId);
      if (!prior || prior.state !== x.expectedState || !transitions[prior.state].includes(x.state))
        reject();
      if (prior.sha256 !== null && (x.sha256 !== prior.sha256 || x.bytes !== prior.bytes)) reject();
      if (['DELETE_PENDING', 'DELETED'].includes(x.state)) {
        if (
          d.kind !== 'PRUNE' ||
          d.utc < prior.expires_utc ||
          [...holds.values()].some((h) => h.evidence_id === x.evidenceId)
        )
          reject();
      } else if (d.kind === 'PRUNE' && x.state !== 'UNCERTAIN') reject();
      captures.set(
        x.evidenceId,
        Object.freeze({ ...prior, state: x.state, sha256: x.sha256, bytes: x.bytes }),
      );
    }
    for (const key of d.holds.releaseIds) {
      if (!holds.delete(key)) reject();
    }
    insert(holds, d.holds.insert, (x) => x.hold_id);
    const meta = {
      singleton: 1,
      revision: old.meta.revision + 1,
      host_epoch: d.hostEpoch,
      last_change_utc: d.utc,
      last_operation_id: d.operationId,
      last_change_kind: d.kind,
    };
    return snapshot({
      meta,
      devices: [...devices.values()],
      bindings: [...bindings.values()],
      identityEvidence: [...evidence.values()],
      associationReceipts: [...associations.values()],
      captures: [...captures.values()],
      holds: [...holds.values()],
    });
  } catch {
    return null;
  }
}
export type DurableCommitResult =
  | Readonly<{ ok: true; value: DurableSnapshot }>
  | Readonly<{
      ok: false;
      code: 'CONFLICT' | 'WRITE_FAILED' | 'OUTCOME_UNKNOWN' | 'RECOVERY_REQUIRED';
    }>;
