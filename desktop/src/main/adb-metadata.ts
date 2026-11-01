// Fixed text formats only. Device association/current generation belongs to the caller.
export const METADATA_BYTES = 64 * 1024;
export type MetadataField =
  | 'MODEL'
  | 'MANUFACTURER'
  | 'OS'
  | 'SDK'
  | 'LOCALE'
  | 'RESOLUTION'
  | 'DENSITY'
  | 'BATTERY'
  | 'STORAGE';
export type MetadataValue =
  | string
  | number
  | Readonly<{ width: number; height: number }>
  | Readonly<{ total: number; used: number; available: number }>;
export type MetadataResult = Readonly<
  {
    field: MetadataField;
    observedUtc: number;
    source: 'ADB_TEXT';
    stale: boolean;
  } & (
    | {
        available: true;
        value: MetadataValue;
        units: 'TEXT' | 'API_LEVEL' | 'PIXELS' | 'DPI' | 'PERCENT' | 'KIB';
      }
    | { available: false; reason: 'INVALID_METADATA' | 'METADATA_LIMIT' | 'UNAVAILABLE' }
  )
>;
const fields: readonly MetadataField[] = [
  'MODEL',
  'MANUFACTURER',
  'OS',
  'SDK',
  'LOCALE',
  'RESOLUTION',
  'DENSITY',
  'BATTERY',
  'STORAGE',
];
function integer(text: string, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(text) || text.length > 16) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}
function lineText(raw: string): string | null {
  const s = raw.replace(/\r\n/g, '\n');
  if (/[\r\0]/.test(s)) return null;
  return s.endsWith('\n') ? s.slice(0, -1) : s;
}
// Invalid envelope has no trusted field/time to attach, so returns null rather than guessing.
export function parseAdbMetadata(
  field: unknown,
  raw: unknown,
  observedUtc: unknown,
): MetadataResult | null {
  if (
    typeof field !== 'string' ||
    !fields.includes(field as MetadataField) ||
    typeof observedUtc !== 'number' ||
    !Number.isSafeInteger(observedUtc) ||
    Object.is(observedUtc, -0) ||
    observedUtc < 0 ||
    observedUtc > 8640000000000000
  )
    return null;
  const base = {
    field: field as MetadataField,
    observedUtc,
    source: 'ADB_TEXT' as const,
    stale: false,
  };
  const bad = (reason: 'INVALID_METADATA' | 'METADATA_LIMIT' | 'UNAVAILABLE'): MetadataResult =>
    Object.freeze({ ...base, available: false, reason });
  const yes = (
    value: MetadataValue,
    units: 'TEXT' | 'API_LEVEL' | 'PIXELS' | 'DPI' | 'PERCENT' | 'KIB',
  ): MetadataResult => Object.freeze({ ...base, available: true, value, units });
  if (typeof raw !== 'string') return bad('INVALID_METADATA');
  if (raw.length > METADATA_BYTES || new TextEncoder().encode(raw).length > METADATA_BYTES)
    return bad('METADATA_LIMIT');
  const text = lineText(raw);
  if (text === null) return bad('INVALID_METADATA');
  if (text === '') return bad('UNAVAILABLE');
  if (['MODEL', 'MANUFACTURER', 'OS', 'LOCALE'].includes(field)) {
    if (
      text.length > 256 ||
      Array.from(text).some((c) => {
        const n = c.codePointAt(0);
        return n === undefined || n < 32 || (n >= 127 && n <= 159) || (n >= 0xd800 && n <= 0xdfff);
      }) ||
      text.trim() !== text
    )
      return bad('INVALID_METADATA');
    if (field === 'LOCALE' && !/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$/.test(text))
      return bad('INVALID_METADATA');
    return yes(text, 'TEXT');
  }
  if (field === 'SDK') {
    const n = integer(text, 10000);
    return n !== null && n > 0 ? yes(n, 'API_LEVEL') : bad('INVALID_METADATA');
  }
  if (field === 'RESOLUTION' || field === 'DENSITY') {
    const lines = text.split('\n');
    if (lines.length < 1 || lines.length > 2) return bad('INVALID_METADATA');
    const values: MetadataValue[] = [];
    for (let i = 0; i < lines.length; i++) {
      const prefix = i === 0 ? 'Physical' : 'Override';
      if (field === 'RESOLUTION') {
        const m = new RegExp(`^${prefix} size: ([0-9]+)x([0-9]+)$`).exec(lines[i] ?? '');
        if (!m) return bad('INVALID_METADATA');
        const width = integer(m[1] ?? '', 65535),
          height = integer(m[2] ?? '', 65535);
        if (!width || !height) return bad('INVALID_METADATA');
        values.push(Object.freeze({ width, height }));
      } else {
        const m = new RegExp(`^${prefix} density: ([0-9]+)$`).exec(lines[i] ?? '');
        const n = m ? integer(m[1] ?? '', 10000) : null;
        if (!n) return bad('INVALID_METADATA');
        values.push(n);
      }
    }
    const value = values.at(-1);
    return value === undefined
      ? bad('INVALID_METADATA')
      : yes(value, field === 'RESOLUTION' ? 'PIXELS' : 'DPI');
  }
  if (field === 'BATTERY') {
    // Bounded dumpsys battery grammar; unsupported vendor additions are unavailable,
    // never interpreted as fresh values. level/scale are mandatory and unique.
    const lines = text.split('\n');
    if (lines.shift() !== 'Current Battery Service state:' || lines.length > 32)
      return bad('INVALID_METADATA');
    const allowed = new Set([
      'AC powered',
      'USB powered',
      'Wireless powered',
      'Dock powered',
      'Max charging current',
      'Max charging voltage',
      'Charge counter',
      'status',
      'health',
      'present',
      'level',
      'scale',
      'voltage',
      'temperature',
      'technology',
    ]);
    const values = new Map<string, string>();
    for (const line of lines) {
      const m = /^ {2}([A-Za-z ]+): ([^\r\n\0]+)$/.exec(line);
      if (!m?.[1] || !m[2] || !allowed.has(m[1]) || values.has(m[1]))
        return bad('INVALID_METADATA');
      values.set(m[1], m[2]);
    }
    for (const [key, value] of values) {
      if (
        ['AC powered', 'USB powered', 'Wireless powered', 'Dock powered', 'present'].includes(key)
      ) {
        if (!['true', 'false'].includes(value)) return bad('INVALID_METADATA');
      } else if (key === 'technology') {
        if (!/^[A-Za-z0-9 -]{1,32}$/.test(value)) return bad('INVALID_METADATA');
      } else if (key === 'temperature') {
        if (!/^-?(0|[1-9][0-9]{0,5})$/.test(value)) return bad('INVALID_METADATA');
      } else if (integer(value, 2147483647) === null) return bad('INVALID_METADATA');
    }
    if (values.get('present') === 'false') return bad('UNAVAILABLE');
    const level = integer(values.get('level') ?? '', 1000000),
      scale = integer(values.get('scale') ?? '', 1000000);
    if (level === null || !scale || level > scale) return bad('INVALID_METADATA');
    return yes((level / scale) * 100, 'PERCENT');
  }
  // Fixed df -k /data shape, exactly one row; no arbitrary path is retained.
  const lines = text.split('\n');
  if (
    lines.length !== 2 ||
    !/^Filesystem[ \t]+1K-blocks[ \t]+Used[ \t]+Available[ \t]+Use%[ \t]+Mounted on$/.test(
      lines[0] ?? '',
    )
  )
    return bad('INVALID_METADATA');
  const m = /^[^\s\0]+[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]+([0-9]+)%[ \t]+\/data$/.exec(
    lines[1] ?? '',
  );
  if (!m) return bad('INVALID_METADATA');
  const total = integer(m[1] ?? ''),
    used = integer(m[2] ?? ''),
    available = integer(m[3] ?? ''),
    percent = integer(m[4] ?? '', 100);
  if (
    !total ||
    used === null ||
    available === null ||
    percent === null ||
    used > total ||
    available > total ||
    used + available > total
  )
    return bad('INVALID_METADATA');
  return yes(Object.freeze({ total, used, available }), 'KIB');
}
export function staleMetadata(previous: MetadataResult): MetadataResult {
  // Intended only for this module's validated immutable output, not caller input.
  return Object.freeze({ ...previous, stale: true });
}
