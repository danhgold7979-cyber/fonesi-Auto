// Pure supplied observations only. No acquisition, certification, identity or dispatch authority.
import {
  CAPTURE_LIMITS,
  classifyCaptureEvidence,
  type HierarchyNode,
  type NormalizedHierarchy,
} from './capture-contract.ts';
import { snapshotDisplayEvidence } from './input-contract.ts';

export type SelectorResult = Readonly<{
  status: 'UNIQUE' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE';
  code:
    | 'OK'
    | 'INVALID_TREE'
    | 'INVALID_SELECTOR'
    | 'UNSUPPORTED_PROFILE'
    | 'INVALID_CONTEXT'
    | 'STALE_CAPTURE'
    | 'ROTATED'
    | 'BINDING_CHANGED'
    | 'DISCONNECTED'
    | 'CONTEXT_CHANGED'
    | 'INCOMPLETE_NODE';
  nodeOrdinal: number | null;
  matchedCount: number;
  source: 'SUPPLIED_HIERARCHY_V1';
}>;
const flags = [
  'checkable',
  'checked',
  'clickable',
  'enabled',
  'focusable',
  'focused',
  'scrollable',
  'long-clickable',
  'password',
  'selected',
  'visible-to-user',
] as const;
const fields = ['resourceId', 'contentDescription', 'text', 'className', 'bounds'] as const;
const nodeKeys = [
  'ordinal',
  'parentOrdinal',
  'childOrdinals',
  'resourceId',
  'contentDescription',
  'text',
  'className',
  'packageName',
  'hint',
  'index',
  'drawingOrder',
  'bounds',
  'flags',
];
function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some((k) => typeof k !== 'string' || !keys.includes(k)))
    return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d)) return null;
    out[key] = d.value;
  }
  return out;
}
function array(value: unknown, cap: number): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const length = Object.getOwnPropertyDescriptor(value, 'length');
  if (!length || !('value' in length) || !integer(length.value, 0, cap)) return null;
  if (Reflect.ownKeys(value).length !== length.value + 1) return null;
  const out: unknown[] = [];
  for (let i = 0; i < length.value; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !('value' in d)) return null;
    out.push(d.value);
  }
  return out;
}
function integer(v: unknown, min: number, max: number): v is number {
  return (
    typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0) && v >= min && v <= max
  );
}
function text(v: unknown, max = 4096): v is string {
  if (typeof v !== 'string' || v.length > max) return false;
  for (const c of v) {
    const n = c.codePointAt(0) ?? 0;
    if (
      (n < 32 && ![9, 10, 13].includes(n)) ||
      (n >= 0xd800 && n <= 0xdfff) ||
      n === 0xfffe ||
      n === 0xffff
    )
      return false;
  }
  return true;
}
function bounds(v: unknown): readonly [number, number, number, number] | null {
  const a = array(v, 4);
  if (a?.length !== 4 || !a.every((x) => integer(x, -999999, 999999))) return null;
  const b = a as [number, number, number, number];
  return b[0] <= b[2] && b[1] <= b[3] ? Object.freeze(b) : null;
}
function snapshotTree(value: unknown): NormalizedHierarchy | null {
  const t = record(value, ['version', 'source', 'sha256', 'encodedBytes', 'evidence', 'nodes']);
  if (
    t?.version !== 1 ||
    t.source !== 'SUPPLIED_HIERARCHY_V1' ||
    typeof t.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(t.sha256) ||
    t.sha256.length !== 64 ||
    !integer(t.encodedBytes, 1, CAPTURE_LIMITS.xmlBytes)
  )
    return null;
  const evidence = snapshotDisplayEvidence(t.evidence),
    list = array(t.nodes, CAPTURE_LIMITS.xmlNodes);
  if (!evidence || !list) return null;
  const nodes: HierarchyNode[] = [];
  let characters = 0,
    edges = 0;
  for (let i = 0; i < list.length; i++) {
    const n = record(list[i], nodeKeys);
    if (
      !n ||
      n.ordinal !== i ||
      !(n.parentOrdinal === null || integer(n.parentOrdinal, 0, i - 1)) ||
      !integer(n.index, 0, 999999999) ||
      !(n.drawingOrder === null || integer(n.drawingOrder, 0, 999999999))
    )
      return null;
    for (const key of [
      'resourceId',
      'contentDescription',
      'text',
      'className',
      'packageName',
      'hint',
    ]) {
      const s = n[key];
      if (s === null && key !== 'className') continue;
      if (!text(s) || (key === 'className' && !s.length)) return null;
      characters += s.length;
      if (characters > CAPTURE_LIMITS.xmlBytes) return null;
    }
    const b = bounds(n.bounds),
      f = record(n.flags, flags),
      children = array(n.childOrdinals, CAPTURE_LIMITS.xmlNodes);
    if (!b || !f || flags.some((k) => f[k] !== null && typeof f[k] !== 'boolean') || !children)
      return null;
    edges += children.length;
    if (edges > CAPTURE_LIMITS.xmlNodes) return null;
    let prior = i;
    for (const c of children) {
      if (!integer(c, prior + 1, list.length - 1)) return null;
      prior = c;
    }
    nodes.push(
      Object.freeze({
        ...n,
        bounds: b,
        flags: Object.freeze(f),
        childOrdinals: Object.freeze(children),
      }) as HierarchyNode,
    );
  }
  const expected = nodes.map(() => [] as number[]),
    depths: number[] = [];
  for (const n of nodes) {
    const depth =
      n.parentOrdinal === null ? 1 : (depths[n.parentOrdinal] ?? CAPTURE_LIMITS.xmlDepth) + 1;
    if (depth > CAPTURE_LIMITS.xmlDepth) return null;
    depths.push(depth);
    if (n.parentOrdinal !== null) {
      const parent = expected[n.parentOrdinal];
      if (!parent) return null;
      parent.push(n.ordinal);
    }
  }
  for (const n of nodes)
    if (
      n.childOrdinals.length !== expected[n.ordinal]?.length ||
      n.childOrdinals.some((v, i) => v !== expected[n.ordinal]?.[i])
    )
      return null;
  return Object.freeze({
    version: 1,
    source: 'SUPPLIED_HIERARCHY_V1',
    sha256: t.sha256,
    encodedBytes: t.encodedBytes,
    evidence,
    nodes: Object.freeze(nodes),
  });
}
const result = (
  status: SelectorResult['status'],
  code: SelectorResult['code'],
  nodeOrdinal: number | null = null,
  matchedCount = 0,
): SelectorResult =>
  Object.freeze({ status, code, nodeOrdinal, matchedCount, source: 'SUPPLIED_HIERARCHY_V1' });
export function resolveHierarchySelector(
  tree: unknown,
  profile: unknown,
  query: unknown,
  currentContext: unknown,
  now: unknown,
): SelectorResult {
  try {
    const t = snapshotTree(tree);
    if (!t) return result('UNAVAILABLE', 'INVALID_TREE');
    const p = record(profile, [
      'version',
      'kind',
      'profileId',
      'appPackage',
      'appVersion',
      'locale',
      'treeSha256',
    ]);
    if (
      p?.version !== 1 ||
      p.kind !== 'SUPPLIED_EXACT_V1' ||
      ['profileId', 'appPackage', 'appVersion', 'locale'].some(
        (k) => !text(p[k], 256) || (p[k] as string).length === 0,
      ) ||
      p.treeSha256 !== t.sha256
    )
      return result('UNAVAILABLE', 'UNSUPPORTED_PROFILE');
    const c = record(currentContext, [
      'profileId',
      'appPackage',
      'appVersion',
      'locale',
      'display',
      'connected',
    ]);
    if (
      !c ||
      typeof c.connected !== 'boolean' ||
      ['profileId', 'appPackage', 'appVersion', 'locale'].some(
        (k) => !text(c[k], 256) || (c[k] as string).length === 0,
      )
    )
      return result('UNAVAILABLE', 'INVALID_CONTEXT');
    const freshness = classifyCaptureEvidence(t.evidence, c.display, now, c.connected);
    if (freshness !== 'CURRENT')
      return result(
        'UNAVAILABLE',
        freshness === 'STALE'
          ? 'STALE_CAPTURE'
          : freshness === 'INVALID_CAPTURE'
            ? 'INVALID_CONTEXT'
            : freshness,
      );
    if (['profileId', 'appPackage', 'appVersion', 'locale'].some((k) => p[k] !== c[k]))
      return result('UNAVAILABLE', 'CONTEXT_CHANGED');
    const q = record(query, ['version', 'predicates']),
      predicates = q ? array(q.predicates, fields.length) : null;
    if (q?.version !== 1 || !predicates?.length) return result('UNAVAILABLE', 'INVALID_SELECTOR');
    const seen = new Set<string>();
    const normalized: { field: (typeof fields)[number]; value: string | readonly number[] }[] = [];
    for (const v of predicates) {
      const e = record(v, ['field', 'value']);
      if (!e || !fields.includes(e.field as (typeof fields)[number]) || seen.has(e.field as string))
        return result('UNAVAILABLE', 'INVALID_SELECTOR');
      const field = e.field as (typeof fields)[number];
      seen.add(field);
      const value =
        field === 'bounds' ? bounds(e.value) : text(e.value) && e.value.length ? e.value : null;
      if (value === null) return result('UNAVAILABLE', 'INVALID_SELECTOR');
      normalized.push({ field, value });
    }
    const matches = t.nodes.filter((n) =>
      normalized.every((e) =>
        e.field === 'bounds'
          ? n.bounds.every((x, i) => x === (e.value as readonly number[])[i])
          : n[e.field] === e.value,
      ),
    );
    const eligible: HierarchyNode[] = [];
    let incomplete = false;
    for (const n of matches) {
      if (n.flags.enabled === false || n.flags['visible-to-user'] === false) continue;
      const [l, top, r, b] = n.bounds;
      if (
        n.flags.enabled === null ||
        n.flags['visible-to-user'] === null ||
        n.packageName === null ||
        l < 0 ||
        top < 0 ||
        r > t.evidence.width ||
        b > t.evidence.height ||
        l === r ||
        top === b
      ) {
        incomplete = true;
        continue;
      }
      if (n.packageName === p.appPackage) eligible.push(n);
    }
    if (incomplete) return result('UNAVAILABLE', 'INCOMPLETE_NODE', null, matches.length);
    if (eligible.length > 1) return result('AMBIGUOUS', 'OK', null, eligible.length);
    const selected = eligible[0];
    if (!selected) return result('NOT_FOUND', 'OK');
    return result('UNIQUE', 'OK', selected.ordinal, 1);
  } catch {
    return result('UNAVAILABLE', 'INVALID_TREE');
  }
}
