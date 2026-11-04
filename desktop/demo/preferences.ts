// Demo origin only. No filesystem, production preference, bridge or service access.
export const DEMO_PREFERENCE_KEY = 'fonesi.demo.preferences.v1';
export type DemoPreferences = Readonly<{
  version: 1;
  theme: 'LIGHT' | 'DARK';
  dockWidth: number | null;
  tileWidth: number;
}>;
export type DemoPreferenceState = Readonly<{
  value: DemoPreferences;
  status: 'SESSION_ONLY' | 'NOT_SAVED';
}>;
export type DemoStorage = Readonly<{
  read: () => string | null;
  write: (value: string) => void;
  remove: () => void;
}>;
export const DEFAULT_DEMO_PREFERENCES: DemoPreferences = Object.freeze({
  version: 1,
  theme: 'LIGHT',
  dockWidth: null,
  tileWidth: 150,
});
const range = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  !Object.is(value, -0) &&
  value >= min &&
  value <= max;
export function snapshotDemoPreferences(value: unknown): DemoPreferences | null {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 4 ||
      keys.some(
        (key) =>
          typeof key !== 'string' || !['version', 'theme', 'dockWidth', 'tileWidth'].includes(key),
      )
    )
      return null;
    const data: Record<string, unknown> = {};
    for (const key of ['version', 'theme', 'dockWidth', 'tileWidth']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return null;
      data[key] = descriptor.value;
    }
    if (
      data.version !== 1 ||
      (data.theme !== 'LIGHT' && data.theme !== 'DARK') ||
      (data.dockWidth !== null && !range(data.dockWidth, 300, 16384)) ||
      !range(data.tileWidth, 70, 520)
    )
      return null;
    return Object.freeze({
      version: 1,
      theme: data.theme,
      dockWidth: data.dockWidth as number | null,
      tileWidth: data.tileWidth,
    });
  } catch {
    return null;
  }
}
export function serializeDemoPreferences(value: unknown): string | null {
  const snapshot = snapshotDemoPreferences(value);
  return snapshot ? JSON.stringify(snapshot) : null;
}
export function parseDemoPreferences(raw: unknown): DemoPreferences | null {
  if (typeof raw !== 'string' || raw.length > 512 || new TextEncoder().encode(raw).length > 512)
    return null;
  // Flat JSON grammar admits harmless whitespace/key order, but rejects duplicate
  // decoded keys before JSON.parse can normalize them. No nested JSON is accepted.
  const string = '"(?:[^"\\\\\u0000-\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
  const scalar = `(?:${string}|null|-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)`;
  const member = new RegExp(`\\s*(${string})\\s*:\\s*(${scalar})\\s*`, 'y');
  const body = raw.trim();
  if (!body.startsWith('{') || !body.endsWith('}')) return null;
  const seen = new Set<string>();
  let at = 1;
  try {
    while (at < body.length - 1) {
      member.lastIndex = at;
      const match = member.exec(body);
      if (!match?.[1]) return null;
      const key: unknown = JSON.parse(match[1]);
      if (typeof key !== 'string' || seen.has(key)) return null;
      seen.add(key);
      at = member.lastIndex;
      if (at === body.length - 1) break;
      if (body[at] !== ',') return null;
      at++;
      if (at === body.length - 1) return null;
    }
    return snapshotDemoPreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function createDemoPreferences(storage: DemoStorage | null) {
  const read = storage?.read,
    write = storage?.write,
    remove = storage?.remove;
  let state: DemoPreferenceState = Object.freeze({
    value: DEFAULT_DEMO_PREFERENCES,
    status: 'SESSION_ONLY',
  });
  try {
    if (!read || !write || !remove) throw Error('STORAGE');
    const raw = read();
    if (raw !== null) {
      const value = parseDemoPreferences(raw);
      if (value) state = Object.freeze({ value, status: 'SESSION_ONLY' });
      else {
        remove();
        if (read() !== null) throw Error('STORAGE');
      }
    }
  } catch {
    state = Object.freeze({ value: DEFAULT_DEMO_PREFERENCES, status: 'NOT_SAVED' });
  }
  return Object.freeze({
    read: () => state,
    update(input: unknown): DemoPreferenceState {
      const value = snapshotDemoPreferences(input);
      if (!value) return state;
      let status: DemoPreferenceState['status'] = 'NOT_SAVED';
      try {
        const canonical = JSON.stringify(value);
        if (!write || !read) throw Error('STORAGE');
        write(canonical);
        if (read() !== canonical) throw Error('STORAGE');
        status = 'SESSION_ONLY';
      } catch {
        /* retain only in memory */
      }
      state = Object.freeze({ value, status });
      return state;
    },
  });
}
