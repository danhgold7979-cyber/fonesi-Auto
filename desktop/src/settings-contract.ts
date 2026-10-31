export const SETTINGS_ERRORS = Object.freeze([
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
  'CONFLICT',
  'CANCELLED',
  'RECOVERY_REQUIRED',
  'WRITE_FAILED',
  'OUTCOME_UNKNOWN',
  'TIMEOUT',
  'INTERNAL_FAILURE',
] as const);
export type SettingsErrorCode = (typeof SETTINGS_ERRORS)[number];
export type SettingsPreferences = Readonly<{
  theme: 'LIGHT' | 'DARK';
  dockWidth: number | null;
  tileWidth: number;
}>;
export type NativeWindowState = Readonly<{
  normalBounds: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  maximized: boolean;
}>;
export type SettingsSnapshot = SettingsPreferences &
  NativeWindowState &
  Readonly<{ revision: number }>;
export type PublicSettings = SettingsPreferences &
  Readonly<{ revision: number; persistence: 'PERSISTED' }>;
export type SettingsPatch = Readonly<Partial<SettingsPreferences>>;
export const DEFAULT_PREFERENCES: SettingsPreferences = Object.freeze({
  theme: 'LIGHT',
  dockWidth: null,
  tileWidth: 150,
});
export const DEFAULT_NATIVE_WINDOW: NativeWindowState = Object.freeze({
  normalBounds: null,
  maximized: false,
});
export type SettingsMethod =
  | 'preferences.get'
  | 'preferences.update'
  | 'preferences.reset'
  | 'preferences.restorePrevious';
export type SettingsRequest =
  | Readonly<{ version: 1; requestId: string; method: 'preferences.get' }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'preferences.update';
      expectedRevision: number;
      patch: SettingsPatch;
    }>
  | Readonly<{
      version: 1;
      requestId: string;
      method: 'preferences.reset' | 'preferences.restorePrevious';
      expectedRevision: number;
    }>;
export type SettingsResponse =
  | Readonly<{
      version: 1;
      ok: true;
      requestId: string;
      outcome: 'OBSERVED' | 'UNCHANGED' | 'COMMITTED';
      settings: PublicSettings;
      auditHealth: 'AVAILABLE' | 'DEGRADED';
    }>
  | Readonly<{
      version: 1;
      ok: false;
      code: SettingsErrorCode;
      diagnosticId: string | null;
      auditHealth: 'AVAILABLE' | 'DEGRADED';
    }>;
function record(
  value: unknown,
  keys: readonly string[],
  partial = false,
): Record<string, unknown> | null {
  try {
    if (value === null || typeof value !== 'object') return null;
    const p = Object.getPrototypeOf(value);
    if (p !== Object.prototype && p !== null) return null;
    const own = Reflect.ownKeys(value);
    if (
      (!partial && own.length !== keys.length) ||
      (partial && (own.length === 0 || own.length > keys.length))
    )
      return null;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of own) {
      if (typeof key !== 'string' || !keys.includes(key)) return null;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d) || !d.enumerable) return null;
      result[key] = d.value;
    }
    return result;
  } catch {
    return null;
  }
}
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max;
export const validSettingsRevision = (v: unknown): v is number =>
  integer(v, 0, Number.MAX_SAFE_INTEGER);
const id = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 1 && v.length <= 32 && /^[A-Za-z0-9_-]+$/.test(v);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function field(key: string, v: unknown) {
  return key === 'theme'
    ? v === 'LIGHT' || v === 'DARK'
    : key === 'dockWidth'
      ? v === null || integer(v, 300, 16384)
      : integer(v, 70, 520);
}
export function snapshotPreferences(input: unknown): SettingsPreferences | null {
  const r = record(input, ['theme', 'dockWidth', 'tileWidth']);
  if (!r || !Object.entries(r).every(([k, v]) => field(k, v))) return null;
  return Object.freeze({
    theme: r.theme,
    dockWidth: r.dockWidth,
    tileWidth: r.tileWidth,
  }) as SettingsPreferences;
}
export function snapshotPatch(input: unknown): SettingsPatch | null {
  const r = record(input, ['theme', 'dockWidth', 'tileWidth'], true);
  if (!r || !Object.entries(r).every(([k, v]) => field(k, v))) return null;
  const out: Record<string, unknown> = {};
  for (const k of ['theme', 'dockWidth', 'tileWidth']) if (Object.hasOwn(r, k)) out[k] = r[k];
  return Object.freeze(out) as SettingsPatch;
}
export function snapshotNativeWindowState(input: unknown): NativeWindowState | null {
  const r = record(input, ['normalBounds', 'maximized']);
  if (!r || typeof r.maximized !== 'boolean') return null;
  if (r.normalBounds === null) return Object.freeze({ normalBounds: null, maximized: r.maximized });
  const b = record(r.normalBounds, ['x', 'y', 'width', 'height']);
  if (
    !b ||
    !integer(b.x, -2147483648, 2147483647) ||
    !integer(b.y, -2147483648, 2147483647) ||
    !integer(b.width, 1, 16384) ||
    !integer(b.height, 1, 16384)
  )
    return null;
  return Object.freeze({
    normalBounds: Object.freeze({ x: b.x, y: b.y, width: b.width, height: b.height }),
    maximized: r.maximized,
  });
}
export function snapshotSettings(input: unknown): SettingsSnapshot | null {
  const r = record(input, [
    'revision',
    'theme',
    'dockWidth',
    'tileWidth',
    'normalBounds',
    'maximized',
  ]);
  if (!r || !validSettingsRevision(r.revision)) return null;
  const p = snapshotPreferences({ theme: r.theme, dockWidth: r.dockWidth, tileWidth: r.tileWidth }),
    n = snapshotNativeWindowState({ normalBounds: r.normalBounds, maximized: r.maximized });
  return p && n ? Object.freeze({ revision: r.revision, ...p, ...n }) : null;
}
function publicSettings(input: unknown): PublicSettings | null {
  const r = record(input, ['revision', 'theme', 'dockWidth', 'tileWidth', 'persistence']);
  if (!r || !validSettingsRevision(r.revision) || r.persistence !== 'PERSISTED') return null;
  const p = snapshotPreferences({ theme: r.theme, dockWidth: r.dockWidth, tileWidth: r.tileWidth });
  return p ? Object.freeze({ revision: r.revision, ...p, persistence: 'PERSISTED' }) : null;
}
// Bounded object/scalar JSON grammar: rejects decoded duplicate keys at every level.
// Request order/whitespace remain valid. Arrays and nesting beyond the patch are unsupported.
function json(raw: string): unknown {
  let at = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(raw[at] ?? '!')) at++;
  };
  const string = () => {
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
    if (raw[at] === '"') return string();
    if (raw[at] === '{') {
      if (depth > 1) throw Error();
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
        const key = string();
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
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      raw.slice(at),
    );
    if (!match) throw Error();
    at += match[0].length;
    return JSON.parse(match[0]);
  };
  const out = value(0);
  ws();
  if (at !== raw.length) throw Error();
  return out;
}
function bounded(raw: unknown, limit: number): raw is string {
  return (
    typeof raw === 'string' && raw.length <= limit && new TextEncoder().encode(raw).length <= limit
  );
}
export function parseSettingsRequest(
  raw: unknown,
):
  | Readonly<{ ok: true; value: SettingsRequest }>
  | Readonly<{ ok: false; code: SettingsErrorCode }> {
  const fail = (code: SettingsErrorCode) => Object.freeze({ ok: false as const, code });
  if (typeof raw !== 'string') return fail('INVALID_TRANSPORT');
  if (!bounded(raw, 1024)) return fail('PAYLOAD_TOO_LARGE');
  let value: unknown;
  try {
    value = json(raw);
  } catch {
    return fail('INVALID_JSON');
  }
  const base = record(value, ['version', 'requestId', 'method', 'expectedRevision', 'patch'], true);
  if (
    !base ||
    !Object.hasOwn(base, 'version') ||
    !Object.hasOwn(base, 'requestId') ||
    !Object.hasOwn(base, 'method')
  )
    return fail('INVALID_SHAPE');
  if (
    typeof base.version !== 'number' ||
    !Number.isSafeInteger(base.version) ||
    Object.is(base.version, -0)
  )
    return fail('INVALID_SHAPE');
  if (base.version !== 1) return fail('UNSUPPORTED_VERSION');
  if (!id(base.requestId) || typeof base.method !== 'string') return fail('INVALID_SHAPE');
  if (
    ![
      'preferences.get',
      'preferences.update',
      'preferences.reset',
      'preferences.restorePrevious',
    ].includes(base.method)
  )
    return fail('UNKNOWN_METHOD');
  const common = { version: 1 as const, requestId: base.requestId };
  if (base.method === 'preferences.get') {
    if (!record(value, ['version', 'requestId', 'method'])) return fail('INVALID_SHAPE');
    return Object.freeze({ ok: true, value: Object.freeze({ ...common, method: base.method }) });
  }
  const keys =
    base.method === 'preferences.update'
      ? ['version', 'requestId', 'method', 'expectedRevision', 'patch']
      : ['version', 'requestId', 'method', 'expectedRevision'];
  if (!record(value, keys) || !validSettingsRevision(base.expectedRevision))
    return fail('INVALID_SHAPE');
  if (base.method === 'preferences.update') {
    const patch = snapshotPatch(base.patch);
    if (!patch) return fail('INVALID_SHAPE');
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...common,
        method: base.method,
        expectedRevision: base.expectedRevision,
        patch,
      }),
    });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...common,
      method: base.method as 'preferences.reset' | 'preferences.restorePrevious',
      expectedRevision: base.expectedRevision,
    }),
  });
}
export function settingsSuccess(
  requestId: unknown,
  outcome: unknown,
  settings: unknown,
  auditHealth: unknown,
): string | null {
  const s = publicSettings(settings);
  if (
    !id(requestId) ||
    !['OBSERVED', 'UNCHANGED', 'COMMITTED'].includes(outcome as string) ||
    !s ||
    !['AVAILABLE', 'DEGRADED'].includes(auditHealth as string)
  )
    return null;
  return JSON.stringify({ version: 1, ok: true, requestId, outcome, settings: s, auditHealth });
}
export function settingsError(
  code: unknown,
  diagnosticId: unknown,
  auditHealth: unknown,
): string | null {
  if (
    !SETTINGS_ERRORS.includes(code as SettingsErrorCode) ||
    (diagnosticId !== null && !uuid(diagnosticId)) ||
    !['AVAILABLE', 'DEGRADED'].includes(auditHealth as string) ||
    (diagnosticId === null && auditHealth !== 'DEGRADED')
  )
    return null;
  return JSON.stringify({ version: 1, ok: false, code, diagnosticId, auditHealth });
}
export function parseSettingsResponse(raw: unknown): SettingsResponse | null {
  if (!bounded(raw, 2048)) return null;
  try {
    const value = JSON.parse(raw);
    const r = record(
      value,
      value?.ok === true
        ? ['version', 'ok', 'requestId', 'outcome', 'settings', 'auditHealth']
        : ['version', 'ok', 'code', 'diagnosticId', 'auditHealth'],
    );
    if (r?.version !== 1 || typeof r.ok !== 'boolean') return null;
    const canonical = r.ok
      ? settingsSuccess(r.requestId, r.outcome, r.settings, r.auditHealth)
      : settingsError(r.code, r.diagnosticId, r.auditHealth);
    if (canonical !== raw) return null;
    if (r.ok)
      return Object.freeze({
        version: 1,
        ok: true,
        requestId: r.requestId as string,
        outcome: r.outcome as 'OBSERVED' | 'UNCHANGED' | 'COMMITTED',
        settings: publicSettings(r.settings) as PublicSettings,
        auditHealth: r.auditHealth as 'AVAILABLE' | 'DEGRADED',
      });
    return Object.freeze(value) as SettingsResponse;
  } catch {
    return null;
  }
}
