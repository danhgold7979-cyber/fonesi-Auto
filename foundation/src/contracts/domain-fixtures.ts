// Development-only synthetic records. VALID is not authority or verified truth.
type Row = Record<string, unknown>;
type Snapshot = Record<string, unknown>;
export type SnapshotCode =
  | 'INVALID_SHAPE'
  | 'INVALID_FIELD'
  | 'UNSUPPORTED_VERSION'
  | 'LIMIT_EXCEEDED'
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVARIANT_VIOLATION'
  | 'VALID';
// Private identity sentinels distinguish validator failures from thrown inspection data.
const failures = {
  INVALID_SHAPE: Object.freeze({}),
  INVALID_FIELD: Object.freeze({}),
  UNSUPPORTED_VERSION: Object.freeze({}),
  LIMIT_EXCEEDED: Object.freeze({}),
  DUPLICATE_ID: Object.freeze({}),
  INVALID_REFERENCE: Object.freeze({}),
  INVARIANT_VIOLATION: Object.freeze({}),
};
const collections = [
  'devices',
  'bindings',
  'identities',
  'accounts',
  'targets',
  'evidence',
  'secrets',
  'desired',
  'observed',
  'effects',
  'holds',
] as const;
const fields: Record<string, readonly string[]> = {
  devices: ['deviceId', 'generation'],
  bindings: ['bindingId', 'deviceId', 'generation', 'serial'],
  identities: ['identityId', 'platform', 'state', 'evidenceId'],
  accounts: ['accountId', 'deviceId', 'platform', 'identityId'],
  targets: ['targetId', 'accountId', 'platform'],
  evidence: ['evidenceId', 'kind', 'subjectId'],
  secrets: ['secretRefId', 'deviceId', 'purpose'],
  desired: ['desiredId', 'deviceId', 'revision', 'enabled'],
  observed: [
    'observationId',
    'deviceId',
    'desiredRevision',
    'availability',
    'effectiveEnabled',
    'source',
    'freshness',
  ],
  effects: ['effectId', 'accountId', 'targetId', 'bindingId', 'state', 'evidenceId'],
  holds: ['holdId', 'reason', 'subjectIds'],
};
function ascii(value: string, mode: 'label' | 'platform' | 'serial'): boolean {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    const lower = code >= 97 && code <= 122;
    if (mode === 'serial') {
      if (code < 33 || code > 126) return false;
    } else if (mode === 'platform' && index === 0) {
      if (!lower) return false;
    } else if (
      !(
        lower ||
        (code >= 48 && code <= 57) ||
        code === 45 ||
        code === 95 ||
        (mode === 'label' && code >= 65 && code <= 90)
      )
    )
      return false;
  }
  return true;
}
function id(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 36) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ([8, 13, 18, 23].includes(index)) {
      if (code !== 45) return false;
    } else if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return false;
  }
  return true;
}
const revision = (value: unknown): boolean =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const member = (value: unknown, values: readonly string[]): boolean =>
  typeof value === 'string' && values.includes(value);
function row(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, names: readonly string[]): value is Row {
  return (
    row(value) &&
    Object.keys(value).length === names.length &&
    names.every((name) => Object.hasOwn(value, name))
  );
}
// Copy ordinary data through descriptors before semantic inspection. No ordinary getters.
function inspect(input: unknown): unknown {
  const seen = new Set<object>();
  let nodes = 0;
  function visit(value: unknown, depth: number): unknown {
    if (value === null || typeof value !== 'object') {
      if (
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        typeof value === 'bigint' ||
        value === undefined
      )
        throw failures.INVALID_SHAPE;
      return value;
    }
    if (depth > 8 || ++nodes > 2048) throw failures.LIMIT_EXCEEDED;
    if (seen.has(value)) throw failures.INVALID_SHAPE;
    seen.add(value);
    const array = Array.isArray(value);
    if (
      Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype) ||
      Object.getOwnPropertySymbols(value).length !== 0
    )
      throw failures.INVALID_SHAPE;
    const names = Object.getOwnPropertyNames(value);
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0)
        throw failures.INVALID_SHAPE;
      if (length > 32) throw failures.LIMIT_EXCEEDED;
      if (names.length !== length + 1) throw failures.INVALID_SHAPE;
      const result: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true)
          throw failures.INVALID_SHAPE;
        result.push(visit(descriptor.value, depth + 1));
      }
      return result;
    }
    const result: Row = Object.create(null) as Row;
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true)
        throw failures.INVALID_SHAPE;
      result[name] = visit(descriptor.value, depth + 1);
    }
    return result;
  }
  return visit(input, 0);
}
function rows(snapshot: Snapshot, name: string): Row[] {
  return snapshot[name] as Row[];
}
function fieldValid(name: string, value: unknown, collection: string): boolean {
  if (name.endsWith('Id'))
    return ((name === 'identityId' && collection === 'accounts') ||
      (name === 'evidenceId' && (collection === 'identities' || collection === 'effects'))) &&
      value === null
      ? true
      : id(value);
  if (name === 'subjectIds')
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(id) &&
      new Set(value).size === value.length
    );
  if (name === 'generation' || name === 'revision' || name === 'desiredRevision')
    return revision(value);
  if (name === 'platform')
    return typeof value === 'string' && value.length <= 32 && ascii(value, 'platform');
  if (name === 'serial')
    return typeof value === 'string' && value.length <= 256 && ascii(value, 'serial');
  if (name === 'source')
    return typeof value === 'string' && value.length <= 64 && ascii(value, 'label');
  if (name === 'enabled') return typeof value === 'boolean';
  if (name === 'effectiveEnabled') return value === null || typeof value === 'boolean';
  if (name === 'state')
    return member(
      value,
      collection === 'identities'
        ? ['VERIFIED', 'UNVERIFIED', 'CONFLICT', 'RETIRED']
        : ['NOT_DISPATCHED', 'DISPATCH_POSSIBLE', 'VERIFIED', 'FAILED_KNOWN', 'UNKNOWN'],
    );
  if (name === 'kind') return member(value, ['IDENTITY', 'EFFECT', 'RECOVERY']);
  if (name === 'purpose') return value === 'PROXY_CREDENTIAL';
  if (name === 'availability')
    return member(value, ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN', 'ERROR']);
  if (name === 'freshness') return member(value, ['CURRENT', 'STALE']);
  if (name === 'reason') return member(value, ['QUEUED_WORK', 'UNKNOWN_RECOVERY']);
  return false;
}
function checked(input: unknown): Snapshot {
  const data = inspect(input);
  if (!exact(data, ['contract', 'version', 'correlationId', ...collections]))
    throw failures.INVALID_SHAPE;
  for (const collection of collections) {
    if (!Array.isArray(data[collection])) throw failures.INVALID_SHAPE;
    for (const item of rows(data, collection)) {
      if (!exact(item, fields[collection] ?? [])) throw failures.INVALID_SHAPE;
      if (collection === 'holds' && !Array.isArray(item.subjectIds)) throw failures.INVALID_SHAPE;
    }
  }
  if (typeof data.version !== 'number' || !Number.isSafeInteger(data.version))
    throw failures.INVALID_FIELD;
  if (data.version !== 1) throw failures.UNSUPPORTED_VERSION;
  if (
    data.contract !== 'p1-domain-fixture' ||
    typeof data.correlationId !== 'string' ||
    data.correlationId.length > 64 ||
    !ascii(data.correlationId, 'label')
  )
    throw failures.INVALID_FIELD;
  for (const collection of collections)
    for (const item of rows(data, collection))
      for (const name of fields[collection] ?? [])
        if (!fieldValid(name, item[name], collection)) throw failures.INVALID_FIELD;
  const all = new Map<unknown, { collection: string; item: Row }>();
  const tables = new Map<string, Map<unknown, Row>>();
  for (const collection of collections) {
    const table = new Map<unknown, Row>();
    tables.set(collection, table);
    const key = fields[collection]?.[0];
    if (!key) throw failures.INVALID_SHAPE;
    for (const item of rows(data, collection)) {
      if (all.has(item[key])) throw failures.DUPLICATE_ID;
      all.set(item[key], { collection, item });
      table.set(item[key], item);
    }
  }
  function resolve(collection: string, key: unknown): Row {
    const item = tables.get(collection)?.get(key);
    if (!item) throw failures.INVALID_REFERENCE;
    return item;
  }
  // Complete reference stage before any semantic-invariant classification.
  for (const item of rows(data, 'bindings')) resolve('devices', item.deviceId);
  for (const item of rows(data, 'identities'))
    if (item.evidenceId !== null) resolve('evidence', item.evidenceId);
  for (const item of rows(data, 'accounts')) {
    resolve('devices', item.deviceId);
    if (item.identityId !== null) resolve('identities', item.identityId);
  }
  for (const item of rows(data, 'targets')) resolve('accounts', item.accountId);
  for (const item of rows(data, 'evidence')) {
    if (item.kind === 'IDENTITY') resolve('identities', item.subjectId);
    else if (item.kind === 'EFFECT') resolve('effects', item.subjectId);
    else {
      const target = all.get(item.subjectId);
      if (!target || target.collection === 'evidence' || target.collection === 'holds')
        throw failures.INVALID_REFERENCE;
    }
  }
  for (const name of ['secrets', 'desired', 'observed'])
    for (const item of rows(data, name)) resolve('devices', item.deviceId);
  for (const item of rows(data, 'effects')) {
    resolve('accounts', item.accountId);
    resolve('targets', item.targetId);
    resolve('bindings', item.bindingId);
    if (item.evidenceId !== null) resolve('evidence', item.evidenceId);
  }
  for (const item of rows(data, 'holds'))
    for (const key of item.subjectIds as string[]) {
      const target = all.get(key);
      if (!target || target.collection === 'holds') throw failures.INVALID_REFERENCE;
    }
  const bound = new Set<unknown>(),
    desired = new Map<unknown, Row>();
  for (const item of rows(data, 'bindings')) {
    if (
      bound.has(item.deviceId) ||
      item.generation !== resolve('devices', item.deviceId).generation
    )
      throw failures.INVARIANT_VIOLATION;
    bound.add(item.deviceId);
  }
  for (const item of rows(data, 'identities')) {
    if (item.state === 'VERIFIED' && item.evidenceId === null) throw failures.INVARIANT_VIOLATION;
    if (item.evidenceId !== null) {
      const proof = resolve('evidence', item.evidenceId);
      if (proof.kind !== 'IDENTITY' || proof.subjectId !== item.identityId)
        throw failures.INVARIANT_VIOLATION;
    }
  }
  for (const item of rows(data, 'accounts'))
    if (
      item.identityId !== null &&
      resolve('identities', item.identityId).platform !== item.platform
    )
      throw failures.INVARIANT_VIOLATION;
  for (const item of rows(data, 'targets'))
    if (resolve('accounts', item.accountId).platform !== item.platform)
      throw failures.INVARIANT_VIOLATION;
  for (const item of rows(data, 'desired')) {
    if (desired.has(item.deviceId)) throw failures.INVARIANT_VIOLATION;
    desired.set(item.deviceId, item);
  }
  for (const item of rows(data, 'observed')) {
    if (
      !desired.has(item.deviceId) ||
      desired.get(item.deviceId)?.revision !== item.desiredRevision ||
      (item.availability === 'AVAILABLE'
        ? typeof item.effectiveEnabled !== 'boolean'
        : item.effectiveEnabled !== null)
    )
      throw failures.INVARIANT_VIOLATION;
  }
  for (const item of rows(data, 'effects')) {
    if (
      resolve('targets', item.targetId).accountId !== item.accountId ||
      resolve('bindings', item.bindingId).deviceId !== resolve('accounts', item.accountId).deviceId
    )
      throw failures.INVARIANT_VIOLATION;
    if ((item.state === 'VERIFIED' || item.state === 'FAILED_KNOWN') && item.evidenceId === null)
      throw failures.INVARIANT_VIOLATION;
    if (item.evidenceId !== null) {
      const proof = resolve('evidence', item.evidenceId);
      if (proof.kind !== 'EFFECT' || proof.subjectId !== item.effectId)
        throw failures.INVARIANT_VIOLATION;
    }
  }
  for (const item of rows(data, 'holds'))
    if (
      item.reason === 'UNKNOWN_RECOVERY' &&
      !(item.subjectIds as string[]).some((key) => {
        const target = all.get(key);
        return (
          target?.collection === 'effects' &&
          (target.item.state === 'UNKNOWN' || target.item.state === 'DISPATCH_POSSIBLE')
        );
      })
    )
      throw failures.INVARIANT_VIOLATION;
  return data;
}
export function validateDomainSnapshot(input: unknown): SnapshotCode {
  try {
    checked(input);
    return 'VALID';
  } catch (error) {
    for (const code of [
      'INVALID_FIELD',
      'UNSUPPORTED_VERSION',
      'LIMIT_EXCEEDED',
      'DUPLICATE_ID',
      'INVALID_REFERENCE',
      'INVARIANT_VIOLATION',
    ] as const)
      if (error === failures[code]) return code;
    return 'INVALID_SHAPE';
  }
}
export type TransitionCode =
  | 'INVALID_SNAPSHOT'
  | 'INVALID_CANDIDATE'
  | 'CHANGED_CONTEXT'
  | 'ACCEPTED_FIXTURE_TRANSITION'
  | 'FORBIDDEN_REGRESSION'
  | 'UNSUPPORTED_CASE';
export function compareEffectTransition(
  before: unknown,
  after: unknown,
  effectId: unknown,
): TransitionCode {
  let first: Snapshot, second: Snapshot;
  try {
    first = checked(before);
    second = checked(after);
  } catch {
    return 'INVALID_SNAPSHOT';
  }
  if (!id(effectId)) return 'INVALID_CANDIDATE';
  const left = rows(first, 'effects').find((item) => item.effectId === effectId);
  const right = rows(second, 'effects').find((item) => item.effectId === effectId);
  if (!left || !right) return 'INVALID_CANDIDATE';
  for (const name of ['contract', 'version', 'correlationId'])
    if (first[name] !== second[name]) return 'CHANGED_CONTEXT';
  for (const collection of collections) {
    const a = rows(first, collection),
      b = rows(second, collection);
    if (a.length !== b.length) return 'CHANGED_CONTEXT';
    for (let index = 0; index < a.length; index++) {
      const x = a[index],
        y = b[index];
      if (!x || !y) return 'CHANGED_CONTEXT';
      for (const name of fields[collection] ?? []) {
        if (
          collection === 'effects' &&
          x.effectId === effectId &&
          y.effectId === effectId &&
          name === 'state'
        )
          continue;
        const v = x[name],
          w = y[name];
        if (Array.isArray(v) && Array.isArray(w)) {
          if (v.length !== w.length || v.some((item, offset) => item !== w[offset]))
            return 'CHANGED_CONTEXT';
        } else if (v !== w) return 'CHANGED_CONTEXT';
      }
    }
  }
  if (
    left.state === right.state ||
    (left.state === 'NOT_DISPATCHED' && right.state === 'DISPATCH_POSSIBLE') ||
    (left.state === 'DISPATCH_POSSIBLE' && right.state === 'UNKNOWN')
  )
    return 'ACCEPTED_FIXTURE_TRANSITION';
  if (
    (left.state === 'UNKNOWN' || left.state === 'DISPATCH_POSSIBLE') &&
    right.state === 'NOT_DISPATCHED'
  )
    return 'FORBIDDEN_REGRESSION';
  return 'UNSUPPORTED_CASE';
}
export type BindingCode =
  | 'INVALID_SNAPSHOT'
  | 'INVALID_CLAIM'
  | 'BINDING_MISMATCH'
  | 'MATCH_IN_FIXTURE';
export function compareClaimedBinding(input: unknown, claim: unknown): BindingCode {
  let data: Snapshot;
  try {
    data = checked(input);
  } catch {
    return 'INVALID_SNAPSHOT';
  }
  try {
    const value = inspect(claim);
    if (
      !exact(value, ['deviceId', 'bindingId', 'generation', 'serial']) ||
      !id(value.deviceId) ||
      !id(value.bindingId) ||
      !revision(value.generation) ||
      !fieldValid('serial', value.serial, 'bindings')
    )
      return 'INVALID_CLAIM';
    const binding = rows(data, 'bindings').find((item) => item.bindingId === value.bindingId);
    const device = rows(data, 'devices').find((item) => item.deviceId === value.deviceId);
    return binding &&
      device &&
      binding.deviceId === value.deviceId &&
      binding.generation === value.generation &&
      device.generation === value.generation &&
      binding.serial === value.serial
      ? 'MATCH_IN_FIXTURE'
      : 'BINDING_MISMATCH';
  } catch {
    return 'INVALID_CLAIM';
  }
}
export type DeletionCode =
  | 'UNREFERENCED_IN_FIXTURE'
  | 'REFERENCED'
  | 'INVALID_CANDIDATE'
  | 'INVALID_SNAPSHOT';
export function checkDeletionFixture(input: unknown, candidate: unknown): DeletionCode {
  let data: Snapshot;
  try {
    data = checked(input);
  } catch {
    return 'INVALID_SNAPSHOT';
  }
  if (!id(candidate)) return 'INVALID_CANDIDATE';
  let found = false,
    referenced = false;
  for (const collection of collections) {
    const key = fields[collection]?.[0];
    if (!key) return 'INVALID_SNAPSHOT';
    for (const item of rows(data, collection)) {
      if (item[key] === candidate) {
        found = true;
        // Observation references desired state by device/revision, not desiredId.
        if (
          collection === 'desired' &&
          rows(data, 'observed').some(
            (observation) =>
              observation.deviceId === item.deviceId &&
              observation.desiredRevision === item.revision,
          )
        )
          referenced = true;
        continue;
      }
      for (const name of fields[collection] ?? []) {
        if (name === key) continue;
        if (name.endsWith('Id') && item[name] === candidate) referenced = true;
        if (name === 'subjectIds' && (item[name] as string[]).includes(candidate))
          referenced = true;
      }
    }
  }
  return !found ? 'INVALID_CANDIDATE' : referenced ? 'REFERENCED' : 'UNREFERENCED_IN_FIXTURE';
}
export function checkCleanupFixture(input: unknown): 'CANDIDATE' | 'PRESERVE' | 'INVALID_SHAPE' {
  try {
    const data = inspect(input);
    if (
      !exact(data, ['toolOwned', 'completion', 'neededForRecovery']) ||
      typeof data.toolOwned !== 'boolean' ||
      typeof data.neededForRecovery !== 'boolean' ||
      !member(data.completion, ['VERIFIED', 'UNKNOWN', 'NOT_VERIFIED'])
    )
      return 'INVALID_SHAPE';
    return data.toolOwned && data.completion === 'VERIFIED' && !data.neededForRecovery
      ? 'CANDIDATE'
      : 'PRESERVE';
  } catch {
    return 'INVALID_SHAPE';
  }
}
