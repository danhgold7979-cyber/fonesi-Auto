export const FLEET_ERRORS = Object.freeze([
  'INVALID_TRANSPORT',
  'PAYLOAD_TOO_LARGE',
  'INVALID_JSON',
  'INVALID_SHAPE',
  'UNSUPPORTED_VERSION',
  'UNKNOWN_METHOD',
  'UNTRUSTED_SENDER',
  'SESSION_UNAVAILABLE',
  'SESSION_REVOKED',
  'BUSY',
  'TIMEOUT',
  'INTERNAL_FAILURE',
  'CONFLICT',
  'MEMBER_UNAVAILABLE',
  'LIMIT_EXCEEDED',
  'OWNER_REVOKED',
  'FLEET_UNAVAILABLE',
] as const);
export type FleetErrorCode = (typeof FLEET_ERRORS)[number];
export type FleetSelection = Readonly<{
  selectedDeviceIds: readonly string[];
  activeDeviceId: string | null;
  groups: readonly Readonly<{ groupId: string; deviceIds: readonly string[] }>[];
}>;
export type FleetDevice = Readonly<{
  deviceId: string;
  generation: number;
  label: string;
  state: 'DEVICE' | 'UNAUTHORIZED' | 'OFFLINE' | 'UNKNOWN' | 'CONFLICT' | 'DISCONNECTED';
  verification: 'PROVISIONAL' | 'VERIFIED';
}>;
export type FleetSnapshot = Readonly<{
  registryRevision: number;
  availability: 'UNAVAILABLE' | 'OBSERVED';
  reason: 'BINARY_UNAVAILABLE' | 'LIVE_DISCOVERY_UNAVAILABLE' | null;
  devices: readonly FleetDevice[];
  selection: FleetSelection & Readonly<{ revision: number }>;
}>;
export type FleetRequest =
  | Readonly<{ version: 1; requestId: string; method: 'fleet.get' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'fleet.selection.replace';
      expectedRevision: number;
      selection: FleetSelection;
    }>;
export type FleetResponse =
  | Readonly<{
      version: 1;
      ok: true;
      requestId: string;
      outcome: 'OBSERVED' | 'UNCHANGED' | 'APPLIED';
      fleet: FleetSnapshot;
      auditHealth: 'AVAILABLE' | 'DEGRADED';
    }>
  | Readonly<{
      version: 1;
      ok: false;
      code: FleetErrorCode;
      diagnosticId: string | null;
      auditHealth: 'AVAILABLE' | 'DEGRADED';
    }>;
export const validFleetRevision = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^f[1-9][0-9]{0,15}$/.test(v) &&
  Number.isSafeInteger(Number(v.slice(1))) &&
  String(Number(v.slice(1))) === v.slice(1);
function record(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error();
  const p = Object.getPrototypeOf(v);
  if (p !== Object.prototype && p !== null) throw Error();
  const d = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(d).length !== keys.length) throw Error();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const entry = d[key];
    if (!entry || !('value' in entry) || !entry.enumerable) throw Error();
    out[key] = entry.value;
  }
  return out;
}
function array(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v)) throw Error();
  const n = Object.getOwnPropertyDescriptor(v, 'length')?.value;
  if (!validFleetRevision(n) || n > max) throw Error();
  const d = Object.getOwnPropertyDescriptors(v);
  if (Reflect.ownKeys(d).length !== n + 1) throw Error();
  const out: unknown[] = [];
  for (let i = 0; i < n; i++) {
    const entry = d[String(i)];
    if (!entry || !('value' in entry) || !entry.enumerable) throw Error();
    out.push(entry.value);
  }
  return out;
}
function ids(v: unknown): readonly string[] {
  const items = array(v, 128);
  if (!items.every(uuid) || new Set(items).size !== items.length) throw Error();
  return Object.freeze((items as string[]).slice().sort());
}
export function snapshotFleetSelection(input: unknown): FleetSelection | null {
  try {
    const v = record(input, ['selectedDeviceIds', 'activeDeviceId', 'groups']);
    const selectedDeviceIds = ids(v.selectedDeviceIds);
    if (v.activeDeviceId !== null && !uuid(v.activeDeviceId)) return null;
    let total = 0;
    const groups = array(v.groups, 32).map((item) => {
      const g = record(item, ['groupId', 'deviceIds']);
      if (!uuid(g.groupId)) throw Error();
      const deviceIds = ids(g.deviceIds);
      total += deviceIds.length;
      if (total > 128) throw Error();
      return Object.freeze({ groupId: g.groupId, deviceIds });
    });
    if (new Set(groups.map((g) => g.groupId)).size !== groups.length) return null;
    groups.sort((a, b) => (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0));
    return Object.freeze({
      selectedDeviceIds,
      activeDeviceId: v.activeDeviceId as string | null,
      groups: Object.freeze(groups),
    });
  } catch {
    return null;
  }
}
export function snapshotFleetRequest(input: unknown): FleetRequest | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const descriptor = Object.getOwnPropertyDescriptor(input, 'method');
    if (!descriptor || !('value' in descriptor)) return null;
    const method = descriptor.value;
    const v = record(
      input,
      method === 'fleet.get'
        ? ['version', 'requestId', 'method']
        : ['version', 'requestId', 'method', 'expectedRevision', 'selection'],
    );
    if (v.version !== 1 || !id(v.requestId) || v.method !== method) return null;
    if (method === 'fleet.get')
      return Object.freeze({ version: 1, requestId: v.requestId, method });
    if (method !== 'fleet.selection.replace' || !validFleetRevision(v.expectedRevision))
      return null;
    const selection = snapshotFleetSelection(v.selection);
    return selection
      ? Object.freeze({
          version: 1,
          requestId: v.requestId,
          method,
          expectedRevision: v.expectedRevision,
          selection,
        })
      : null;
  } catch {
    return null;
  }
}
export function snapshotFleetSnapshot(input: unknown): FleetSnapshot | null {
  try {
    const v = record(input, ['registryRevision', 'availability', 'reason', 'devices', 'selection']);
    if (!validFleetRevision(v.registryRevision)) return null;
    const raw = record(v.selection, ['revision', 'selectedDeviceIds', 'activeDeviceId', 'groups']);
    if (!validFleetRevision(raw.revision)) return null;
    const selection = snapshotFleetSelection({
      selectedDeviceIds: raw.selectedDeviceIds,
      activeDeviceId: raw.activeDeviceId,
      groups: raw.groups,
    });
    if (!selection) return null;
    const devices = array(v.devices, 256).map((item) => {
      const d = record(item, ['deviceId', 'generation', 'label', 'state', 'verification']);
      if (
        !uuid(d.deviceId) ||
        !validFleetRevision(d.generation) ||
        typeof d.label !== 'string' ||
        !/^Device (?:00[0-9]{2}|01[0-9]{2}|02[0-5][0-9])$/.test(d.label) ||
        Number(d.label.slice(7)) < 1 ||
        Number(d.label.slice(7)) > 256 ||
        !['DEVICE', 'UNAUTHORIZED', 'OFFLINE', 'UNKNOWN', 'CONFLICT', 'DISCONNECTED'].includes(
          d.state as string,
        ) ||
        !['PROVISIONAL', 'VERIFIED'].includes(d.verification as string)
      )
        throw Error();
      return Object.freeze({ ...d }) as FleetDevice;
    });
    if (
      new Set(devices.map((d) => d.deviceId)).size !== devices.length ||
      new Set(devices.map((d) => d.label)).size !== devices.length
    )
      return null;
    if (v.availability === 'UNAVAILABLE') {
      if (
        !['BINARY_UNAVAILABLE', 'LIVE_DISCOVERY_UNAVAILABLE'].includes(v.reason as string) ||
        devices.length !== 0
      )
        return null;
    } else if (v.availability !== 'OBSERVED' || v.reason !== null) return null;
    const available = new Set(devices.map((d) => d.deviceId));
    if (
      [
        ...selection.selectedDeviceIds,
        ...selection.groups.flatMap((g) => g.deviceIds),
        ...(selection.activeDeviceId === null ? [] : [selection.activeDeviceId]),
      ].some((deviceId) => !available.has(deviceId))
    )
      return null;
    return Object.freeze({
      registryRevision: v.registryRevision,
      availability: v.availability,
      reason: v.reason,
      devices: Object.freeze(devices),
      selection: Object.freeze({ revision: raw.revision, ...selection }),
    }) as FleetSnapshot;
  } catch {
    return null;
  }
}
// Bounded duplicate-aware JSON grammar. Exact decoded keys; arrays never exceed wire budget.
function json(raw: string): unknown {
  let at = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(raw[at] ?? '!')) at++;
  };
  const str = (): string => {
    const start = at++;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '"') return JSON.parse(raw.slice(start, at));
      if (c === '\\') at++;
    }
    throw Error();
  };
  const value = (depth: number): unknown => {
    ws();
    if (depth > 8) throw Error();
    if (raw[at] === '"') return str();
    if (raw[at] === '{') {
      at++;
      ws();
      const out: Record<string, unknown> = Object.create(null);
      if (raw[at] === '}') {
        at++;
        return out;
      }
      while (true) {
        ws();
        if (raw[at] !== '"') throw Error();
        const key = str();
        if (Object.hasOwn(out, key)) throw Error();
        ws();
        if (raw[at++] !== ':') throw Error();
        out[key] = value(depth + 1);
        ws();
        const c = raw[at++];
        if (c === '}') return out;
        if (c !== ',') throw Error();
      }
    }
    if (raw[at] === '[') {
      at++;
      ws();
      const out: unknown[] = [];
      if (raw[at] === ']') {
        at++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        const c = raw[at++];
        if (c === ']') return out;
        if (c !== ',') throw Error();
      }
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      raw.slice(at),
    );
    if (!m) throw Error();
    at += m[0].length;
    return JSON.parse(m[0]);
  };
  const out = value(0);
  ws();
  if (at !== raw.length) throw Error();
  return out;
}
const bounded = (raw: unknown, max: number): raw is string =>
  typeof raw === 'string' && raw.length <= max && new TextEncoder().encode(raw).length <= max;
export function parseFleetRequest(
  raw: unknown,
): Readonly<{ ok: true; value: FleetRequest }> | Readonly<{ ok: false; code: FleetErrorCode }> {
  const fail = (code: FleetErrorCode) => Object.freeze({ ok: false as const, code });
  if (typeof raw !== 'string') return fail('INVALID_TRANSPORT');
  if (!bounded(raw, 16384)) return fail('PAYLOAD_TOO_LARGE');
  let input: unknown;
  try {
    input = json(raw);
  } catch {
    return fail('INVALID_JSON');
  }
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_SHAPE');
    const v = input as Record<string, unknown>;
    if (!validFleetRevision(v.version) || !id(v.requestId) || typeof v.method !== 'string')
      return fail('INVALID_SHAPE');
    if (v.version !== 1) return fail('UNSUPPORTED_VERSION');
    if (!['fleet.get', 'fleet.selection.replace'].includes(v.method)) return fail('UNKNOWN_METHOD');
    const request = snapshotFleetRequest(input);
    return request ? Object.freeze({ ok: true, value: request }) : fail('INVALID_SHAPE');
  } catch {
    return fail('INVALID_SHAPE');
  }
}
export function fleetSuccess(
  requestId: unknown,
  outcome: unknown,
  fleet: unknown,
  auditHealth: unknown,
): string | null {
  const snapshot = snapshotFleetSnapshot(fleet);
  if (
    !id(requestId) ||
    !['OBSERVED', 'UNCHANGED', 'APPLIED'].includes(outcome as string) ||
    !snapshot ||
    !['AVAILABLE', 'DEGRADED'].includes(auditHealth as string)
  )
    return null;
  const raw = JSON.stringify({
    version: 1,
    ok: true,
    requestId,
    outcome,
    fleet: snapshot,
    auditHealth,
  });
  return bounded(raw, 65536) ? raw : null;
}
export function fleetError(code: unknown, diagnosticId: unknown, auditHealth: unknown): string {
  if (
    !FLEET_ERRORS.includes(code as FleetErrorCode) ||
    (diagnosticId !== null && !uuid(diagnosticId)) ||
    !['AVAILABLE', 'DEGRADED'].includes(auditHealth as string) ||
    (diagnosticId === null && auditHealth !== 'DEGRADED')
  )
    return '{"version":1,"ok":false,"code":"INTERNAL_FAILURE","diagnosticId":null,"auditHealth":"DEGRADED"}';
  return JSON.stringify({ version: 1, ok: false, code, diagnosticId, auditHealth });
}
export function parseFleetResponse(raw: unknown): FleetResponse | null {
  if (!bounded(raw, 65536)) return null;
  try {
    const input = json(raw);
    if (!input || typeof input !== 'object') return null;
    const ok = (input as Record<string, unknown>).ok;
    if (ok === true) {
      const v = record(input, ['version', 'ok', 'requestId', 'outcome', 'fleet', 'auditHealth']);
      if (v.version !== 1) return null;
      const encoded = fleetSuccess(v.requestId, v.outcome, v.fleet, v.auditHealth);
      return encoded
        ? (Object.freeze({
            version: 1,
            ok: true,
            requestId: v.requestId,
            outcome: v.outcome,
            fleet: snapshotFleetSnapshot(v.fleet),
            auditHealth: v.auditHealth,
          }) as FleetResponse)
        : null;
    }
    const v = record(input, ['version', 'ok', 'code', 'diagnosticId', 'auditHealth']);
    if (
      v.version !== 1 ||
      v.ok !== false ||
      !FLEET_ERRORS.includes(v.code as FleetErrorCode) ||
      (v.diagnosticId !== null && !uuid(v.diagnosticId)) ||
      !['AVAILABLE', 'DEGRADED'].includes(v.auditHealth as string) ||
      (v.diagnosticId === null && v.auditHealth !== 'DEGRADED')
    )
      return null;
    return Object.freeze({ ...v }) as FleetResponse;
  } catch {
    return null;
  }
}
