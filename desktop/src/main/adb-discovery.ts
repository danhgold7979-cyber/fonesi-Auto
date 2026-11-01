// Main-only bounded text contract. Parsed observations are not dispatch authority.
export type AdbDiscoveryRow = Readonly<{
  serial: string;
  transportId: string | null;
  state: 'DEVICE' | 'UNAUTHORIZED' | 'OFFLINE' | 'UNKNOWN';
}>;
export type AdbDiscoveryResult =
  | Readonly<{ ok: true; rows: readonly AdbDiscoveryRow[] }>
  | Readonly<{ ok: false; code: 'INVALID_DISCOVERY' | 'DISCOVERY_LIMIT' }>;
export const DISCOVERY_BYTES = 1024 * 1024;
export function validAdbSerial(value: unknown): value is string {
  // Opaque exact token; never use it as a path, shell fragment or identity proof.
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:\[\]-]*$/.test(value)
  );
}
export function validTransportId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(value) &&
    (value.length < 20 || value <= '18446744073709551615')
  );
}
export function snapshotDiscoveryRow(input: unknown): AdbDiscoveryRow | null {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return null;
    const keys = ['serial', 'transportId', 'state'];
    if (Reflect.ownKeys(input).length !== keys.length) return null;
    const v: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d || !('value' in d) || !d.enumerable) return null;
      v[key] = d.value;
    }
    if (
      !validAdbSerial(v.serial) ||
      (v.transportId !== null && !validTransportId(v.transportId)) ||
      !['DEVICE', 'UNAUTHORIZED', 'OFFLINE', 'UNKNOWN'].includes(v.state as string)
    )
      return null;
    return Object.freeze({
      serial: v.serial,
      transportId: v.transportId as string | null,
      state: v.state as AdbDiscoveryRow['state'],
    });
  } catch {
    return null;
  }
}
export function parseAdbDiscovery(raw: unknown): AdbDiscoveryResult {
  const bad = (code: 'INVALID_DISCOVERY' | 'DISCOVERY_LIMIT'): AdbDiscoveryResult =>
    Object.freeze({ ok: false, code });
  if (typeof raw !== 'string') return bad('INVALID_DISCOVERY');
  if (raw.length > DISCOVERY_BYTES || new TextEncoder().encode(raw).length > DISCOVERY_BYTES)
    return bad('DISCOVERY_LIMIT');
  const text = raw.replace(/\r\n/g, '\n');
  if (/[\r\0]/.test(text)) return bad('INVALID_DISCOVERY');
  const lines = text.split('\n');
  if (lines.shift() !== 'List of devices attached') return bad('INVALID_DISCOVERY');
  return parseRows(lines);
}
// Actual host:devices-l payload, not CLI output and never a fabricated header.
export function parseAdbServerDiscovery(raw: unknown): AdbDiscoveryResult {
  if (typeof raw !== 'string') return Object.freeze({ ok: false, code: 'INVALID_DISCOVERY' });
  if (raw.length > 32768 || new TextEncoder().encode(raw).length > 32768)
    return Object.freeze({ ok: false, code: 'DISCOVERY_LIMIT' });
  if (/[\r\0\ufeff]/.test(raw)) return Object.freeze({ ok: false, code: 'INVALID_DISCOVERY' });
  return parseRows(raw.split('\n'));
}
function parseRows(lines: string[]): AdbDiscoveryResult {
  const bad = (code: 'INVALID_DISCOVERY' | 'DISCOVERY_LIMIT'): AdbDiscoveryResult =>
    Object.freeze({ ok: false, code });
  // Both existing CLI and server listings permit up to two terminal separators.
  for (let n = 0; n < 2 && lines.at(-1) === ''; n++) lines.pop();
  const rows: AdbDiscoveryRow[] = [];
  for (const line of lines) {
    if (line.length > 4096) return bad('DISCOVERY_LIMIT');
    const m = /^([^\s]+)[ \t]+([a-z][a-z_-]*)(?:[ \t]+(.+))?$/.exec(line);
    if (!m || !validAdbSerial(m[1])) return bad('INVALID_DISCOVERY');
    const serial = m[1];
    let transportId: string | null = null;
    const seen = new Set<string>();
    if (m[3])
      for (const field of m[3].split(/[ \t]+/)) {
        const separator = field.indexOf(':');
        if (separator < 1) return bad('INVALID_DISCOVERY');
        const key = field.slice(0, separator),
          value = field.slice(separator + 1);
        if (
          !['usb', 'product', 'model', 'device', 'transport_id'].includes(key) ||
          seen.has(key) ||
          !/^[!-~]+$/.test(value) ||
          value.length > 256
        )
          return bad('INVALID_DISCOVERY');
        seen.add(key);
        if (key === 'transport_id') {
          if (!validTransportId(value)) return bad('INVALID_DISCOVERY');
          transportId = value;
        }
      }
    const state =
      m[2] === 'device'
        ? 'DEVICE'
        : m[2] === 'unauthorized'
          ? 'UNAUTHORIZED'
          : m[2] === 'offline'
            ? 'OFFLINE'
            : 'UNKNOWN';
    rows.push(Object.freeze({ serial, transportId, state }));
  }
  // Duplicate claims deliberately survive: the registry quarantines, never merges them.
  return Object.freeze({ ok: true, rows: Object.freeze(rows) });
}
