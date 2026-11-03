import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { verify } from '../scripts/verify-dependencies.mjs';
verify(true, '11.9.0');
const url = (p) => new URL(p, import.meta.url).href;
const data = (text) =>
  'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(text)).toString('base64');
const source = (name) => readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
const civilImport = (text) =>
  text.replaceAll(
    "'./schedule-civil-contract.js'",
    JSON.stringify(url('../src/schedule-civil-contract.ts')),
  );
const zone = data(
  civilImport(source('schedule-zone-contract')).replaceAll(
    "'@js-temporal/polyfill'",
    JSON.stringify(url('../node_modules/@js-temporal/polyfill/dist/index.esm.js')),
  ),
);
const { evaluateUnboundScheduleGapPreview: evaluate } = await import(
  data(
    source('schedule-gap-contract').replaceAll(
      "'./schedule-zone-contract.js'",
      JSON.stringify(zone),
    ),
  )
);
const contractSource = source('schedule-draft-contract');
const {
  SCHEDULE_DRAFT_CHANNEL,
  SCHEDULE_DRAFT_CODES,
  snapshotScheduleDraftInput: snapshot,
  parseScheduleDraftRequest: parseRequest,
  parseScheduleDraftResponse: parseResponse,
  scheduleDraftSuccess: success,
  scheduleDraftError: error,
} = await import(data(civilImport(contractSource)));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function input(times = ['09:00', '09:29', '09:59']) {
  return {
    schedule: {
      version: 1,
      kind: 'CIVIL_RULE',
      startDate: '2024-01-01',
      endDate: null,
      maxOccurrences: null,
      rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
      postsPerActiveDay: times.length,
      slots: times.map((time, i) => ({ id: id(i), time })),
    },
    request: {
      version: 1,
      scope: { kind: 'UNBOUND_DRAFT', draftId: id(100), draftRevision: 0 },
      zone: 'Asia/Ho_Chi_Minh',
      fromDate: '2024-01-01',
      throughDate: '2024-01-01',
      limit: 128,
    },
  };
}
const envelope = (i = input()) => ({
  version: 1,
  requestId: 'd1',
  method: 'schedule.draft.preview',
  ...i,
});
const clone = (v) => JSON.parse(JSON.stringify(v));
function real(i = input()) {
  const p = evaluate(i.schedule, i.request);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p;
}
function deepFrozen(v) {
  if (v && typeof v === 'object') {
    assert.equal(Object.isFrozen(v), true);
    for (const nested of Object.values(v)) deepFrozen(nested);
  }
}
test('fixed channel/codes and node-free runtime imports', () => {
  assert.equal(SCHEDULE_DRAFT_CHANNEL, 'foundation:schedule-draft:v1');
  assert.equal(new Set(SCHEDULE_DRAFT_CODES).size, SCHEDULE_DRAFT_CODES.length);
  assert.equal(Object.isFrozen(SCHEDULE_DRAFT_CODES), true);
  const js = stripTypeScriptTypes(contractSource);
  assert.doesNotMatch(js, /node:|@js-temporal|schedule-zone-contract|schedule-gap-contract/);
});
test('snapshot, request and actual evaluator response are detached and deeply frozen', () => {
  const i = input(),
    copy = snapshot(i);
  assert.deepEqual(copy, i);
  i.request.scope.draftRevision = 4;
  i.schedule.slots[0].time = '08:00';
  assert.equal(copy.request.scope.draftRevision, 0);
  assert.equal(copy.schedule.slots[0].time, '09:00');
  deepFrozen(copy);
  const parsed = parseRequest(JSON.stringify(envelope(copy)));
  assert.equal(parsed.ok, true);
  deepFrozen(parsed);
  const p = real(copy),
    raw = success('d1', p);
  assert.equal(typeof raw, 'string');
  assert.equal(raw, JSON.stringify(JSON.parse(raw)));
  const response = parseResponse(raw);
  assert.deepEqual(response, { version: 1, ok: true, requestId: 'd1', preview: p });
  assert.equal(response.preview.warnings.length, 1);
  deepFrozen(response);
});
test('all fixed errors roundtrip without leaking arbitrary strings', () => {
  for (const code of SCHEDULE_DRAFT_CODES)
    for (const requestId of [null, 'd1', 'd9007199254740991']) {
      const r = parseResponse(error(requestId, code));
      assert.deepEqual(r, { version: 1, ok: false, requestId, code });
      deepFrozen(r);
    }
  assert.deepEqual(parseResponse(error('secret', 'private exception')), {
    version: 1,
    ok: false,
    requestId: null,
    code: 'INTERNAL_FAILURE',
  });
});
test('canonical request wire refuses duplicate keys, whitespace and noncanonical numbers/escaping', () => {
  const raw = JSON.stringify(envelope());
  for (const candidate of [
    raw + '\n',
    ' ' + raw,
    raw.replace('"version":1', '"version":1,"version":1'),
    raw.replace('"version":1', '"version":1.0'),
    raw.replace('"draftRevision":0', '"draftRevision":-0'),
    raw.replace('"UTC"', '"UTC"') + ' ',
    raw.replace('schedule.draft.preview', 'schedule\\u002edraft.preview'),
    '{',
  ]) {
    assert.deepEqual(parseRequest(candidate), { ok: false, code: 'INVALID_JSON' });
  }
  for (const value of [null, {}, [], 1, new String(raw)])
    assert.deepEqual(parseRequest(value), { ok: false, code: 'INVALID_TRANSPORT' });
});
test('wire length counts UTF-8 bytes and refuses oversize before parse', () => {
  for (const raw of ['x'.repeat(131073), 'é'.repeat(65537), '💡'.repeat(32769)]) {
    assert.deepEqual(parseRequest(raw), { ok: false, code: 'PAYLOAD_TOO_LARGE' });
    assert.equal(parseResponse(raw), null);
  }
  assert.equal(parseRequest('x'.repeat(131072)).code, 'INVALID_JSON');
});
test('closed request fields, methods, versions and private request IDs', () => {
  assert.equal(
    parseRequest(JSON.stringify({ ...envelope(), version: 2 })).code,
    'UNSUPPORTED_VERSION',
  );
  assert.equal(
    parseRequest(JSON.stringify({ ...envelope(), method: 'save' })).code,
    'UNKNOWN_METHOD',
  );
  for (const requestId of ['', 'd0', 'd01', 'd-1', 'd1.0', 'd9007199254740992', 'd1\n', 1, null])
    assert.equal(parseRequest(JSON.stringify({ ...envelope(), requestId })).code, 'INVALID_SHAPE');
  for (const requestId of ['d1', 'd9007199254740991'])
    assert.equal(parseRequest(JSON.stringify({ ...envelope(), requestId })).ok, true);
  for (const patch of [{ extra: true }, { schedule: {} }, { request: {} }])
    assert.equal(parseRequest(JSON.stringify({ ...envelope(), ...patch })).code, 'INVALID_SHAPE');
  const missing = envelope();
  delete missing.method;
  assert.equal(parseRequest(JSON.stringify(missing)).code, 'INVALID_SHAPE');
});
test('input enforces horizon, valid Gregorian dates and 1970..2099 window', () => {
  for (const [fromDate, throughDate, valid] of [
    ['2024-01-01', '2024-12-31', true],
    ['2024-01-01', '2025-01-01', false],
    ['2023-01-01', '2024-01-01', true],
    ['2024-02-29', '2024-02-29', true],
    ['2023-02-29', '2023-03-01', false],
    ['2024-04-31', '2024-05-01', false],
    ['1969-12-31', '1970-01-01', false],
    ['2099-12-31', '2100-01-01', false],
    ['1970-01-01', '1970-01-01', true],
    ['2099-12-31', '2099-12-31', true],
    ['2024-1-01', '2024-01-01', false],
    ['2024-01-02', '2024-01-01', false],
  ]) {
    const i = input();
    Object.assign(i.request, { fromDate, throughDate });
    assert.equal(snapshot(i) !== null, valid, `${fromDate}/${throughDate}`);
  }
});
test('bridge row bound refuses without clamping; civil slots retain existing 1440 bound', () => {
  for (const limit of [0, -0, -1, 1.5, 129, 4096, NaN, Infinity]) {
    const i = input();
    i.request.limit = limit;
    assert.equal(snapshot(i), null);
  }
  for (const limit of [1, 128]) {
    const i = input();
    i.request.limit = limit;
    assert.equal(snapshot(i).request.limit, limit);
  }
  const times = Array.from(
    { length: 1440 },
    (_, n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
  );
  assert.equal(snapshot(input(times)).schedule.slots.length, 1440);
  assert.equal(snapshot(input([...times, '00:00'])), null);
});
test('scope, zone syntax, schedule and nested fields remain closed', () => {
  const patches = [
    (i) => (i.extra = 1),
    (i) => (i.request.extra = 1),
    (i) => (i.request.scope.extra = 1),
    (i) => (i.request.scope.kind = 'BOUND'),
    (i) => (i.request.scope.draftId = 'secret'),
    (i) => (i.request.scope.draftRevision = -0),
    (i) => (i.request.scope.draftRevision = -1),
    (i) => (i.request.scope.draftRevision = 1.5),
    (i) => (i.request.scope.draftRevision = Number.MAX_SAFE_INTEGER + 1),
    (i) => (i.request.version = 2),
    (i) => (i.schedule.slots[0].extra = 1),
    (i) => (i.schedule.slots[0].time = '24:00'),
    (i) => (i.schedule.rule.extra = true),
    (i) => (i.schedule.startDate = '2024-02-30'),
  ];
  for (const patch of patches) {
    const i = input();
    patch(i);
    assert.equal(snapshot(i), null);
  }
  for (const zone of [
    '',
    'America',
    '+07:00',
    'Asia/../secret',
    'Asia/Việt',
    'UTC\n',
    'A/' + 'x'.repeat(127),
  ]) {
    const i = input();
    i.request.zone = zone;
    assert.equal(snapshot(i), null);
  }
  // Syntax-only admission: actual support is main evaluator authority.
  const i = input();
  i.request.zone = 'Invented/Zone';
  assert.notEqual(snapshot(i), null);
});
test('hostile descriptors and revoked/throwing proxies refuse without invoking getters', () => {
  for (const path of [
    [],
    ['request'],
    ['request', 'scope'],
    ['schedule'],
    ['schedule', 'slots', 0],
  ]) {
    const i = input();
    let target = i;
    for (const key of path) target = target[key];
    const key = Object.keys(target)[0];
    let calls = 0;
    Object.defineProperty(target, key, {
      enumerable: true,
      get() {
        calls++;
        throw Error('secret');
      },
    });
    assert.equal(snapshot(i), null);
    assert.equal(calls, 0);
  }
  const i = input();
  Object.defineProperty(i.request, 'zone', { enumerable: false });
  assert.equal(snapshot(i), null);
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const value of [
    revoked.proxy,
    new Proxy(
      {},
      {
        getPrototypeOf() {
          throw Error('secret');
        },
      },
    ),
    new Proxy(input(), {
      ownKeys() {
        throw Error('secret');
      },
    }),
    new Proxy(input(), {
      getOwnPropertyDescriptor() {
        throw Error('secret');
      },
    }),
  ]) {
    assert.equal(snapshot(value), null);
    assert.equal(success('d1', value), null);
  }
  const sparse = input();
  delete sparse.schedule.slots[0];
  assert.equal(snapshot(sparse), null);
  const symbol = input();
  symbol.request[Symbol('secret')] = 1;
  assert.equal(snapshot(symbol), null);
});
test('real truncated and complete 128-row responses, 127 warnings, max next bound', () => {
  const times = Array.from(
    { length: 129 },
    (_, n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
  );
  for (const count of [128, 129]) {
    const p = real(input(times.slice(0, count))),
      raw = success('d2', p);
    assert.notEqual(raw, null);
    const r = parseResponse(raw);
    assert.notEqual(r, null);
    deepFrozen(r);
    assert.equal(r.preview.warnings.length, 127);
    assert.equal(r.preview.preview.truncated, count === 129);
    assert.equal(r.preview.preview.next?.plannedOrdinal ?? null, count === 129 ? 129 : null);
  }
});
test('actual DST gap and overlap retain exact resolution shapes', () => {
  for (const [date, expected] of [
    ['2024-03-10', 'SKIPPED_GAP'],
    ['2024-11-03', 'OVERLAP_EARLIER'],
  ]) {
    const i = input([date === '2024-03-10' ? '02:30' : '01:30']);
    i.schedule.startDate = date;
    Object.assign(i.request, { fromDate: date, throughDate: date, zone: 'America/New_York' });
    const r = parseResponse(success('d3', real(i)));
    assert.equal(r.preview.preview.occurrences[0].resolution, expected);
  }
});
test('output rejects extras at every nested record and hostile accessors before serialization', () => {
  const p = real();
  for (const path of [
    [],
    ['scope'],
    ['window'],
    ['preview'],
    ['preview', 'runtime'],
    ['preview', 'occurrences', 0],
    ['warnings', 0],
  ]) {
    const copy = clone(p);
    let target = copy;
    for (const key of path) target = target[key];
    target.extra = 'secret';
    assert.equal(success('d1', copy), null);
    delete target.extra;
    const key = Object.keys(target)[0];
    let calls = 0;
    Object.defineProperty(target, key, {
      enumerable: true,
      get() {
        calls++;
        throw Error('secret');
      },
    });
    assert.equal(success('d1', copy), null);
    assert.equal(calls, 0);
  }
  const a = clone(p);
  a.preview.occurrences.extra = true;
  assert.equal(success('d1', a), null);
  const b = clone(p);
  delete b.preview.occurrences[0];
  assert.equal(success('d1', b), null);
});
test('output validates all discriminants, numeric fields and complete/truncated consistency', () => {
  const patches = [
    (p) => (p.kind = 'SCHEDULE_GAP_ADVISORY'),
    (p) => (p.version = 2),
    (p) => (p.ok = false),
    (p) => (p.scope.kind = 'BOUND'),
    (p) => (p.scope.draftRevision = -0),
    (p) => (p.window.limit = 129),
    (p) => (p.thresholdMs = 1),
    (p) => (p.comparison = 'LOCAL'),
    (p) => (p.coverage = 'TRUNCATED_PREFIX'),
    (p) => (p.preview.truncated = true),
    (p) => (p.preview.next = p.preview.occurrences[0]),
    (p) => (p.preview.policy = 'OTHER'),
    (p) => (p.preview.kind = 'CIVIL_INTENT'),
    (p) => (p.preview.version = 2),
    (p) => (p.preview.ok = false),
    (p) => (p.preview.zone = 'bad'),
    (p) => (p.preview.resolvedZone = 'bad'),
    (p) => (p.preview.runtime.runtimeKind = 'BROWSER'),
    (p) => (p.preview.runtime.profileId = 'other'),
    (p) => (p.preview.runtime.profileSha256 = 'x'.repeat(64)),
    (p) => (p.preview.runtime.electronVersion = '45.1.0'),
    (p) => (p.preview.runtime.nodeVersion = 'secret path'),
    (p) => (p.preview.runtime.source = 'FAKE'),
    (p) => (p.preview.runtime.polyfillVersion = '99'),
    (p) => (p.preview.runtime.policy = 'OTHER'),
    (p) => (p.preview.occurrences[0].resolution = 'OTHER'),
    (p) => (p.preview.occurrences[0].date = '2024-02-30'),
    (p) => (p.preview.occurrences[0].date = '2024-01-02'),
    (p) => (p.preview.occurrences[0].time = '24:00'),
    (p) => (p.preview.occurrences[0].slotId = 'invalid'),
    (p) => (p.preview.occurrences[0].plannedOrdinal = 0),
    (p) => (p.preview.occurrences[1].plannedOrdinal = 10),
    (p) => (p.preview.occurrences[1].time = '08:00'),
    (p) => (p.preview.occurrences[0].utcMs = Infinity),
    (p) => (p.preview.occurrences[0].offsetSeconds = 86400),
    (p) => (p.preview.occurrences[0].notification = 'DST_GAP_SKIPPED'),
    (p) => (p.preview.occurrences[0].resolution = 'SKIPPED_GAP'),
    (p) => (p.warnings[0].gapMs = -0),
    (p) => (p.warnings[0].code = 'OTHER'),
    (p) => (p.warnings[0].earlierPlannedOrdinal = 999),
    (p) => (p.warnings = []),
    (p) => p.warnings.push(p.warnings[0]),
    (p) => p.preview.occurrences.push(...p.preview.occurrences),
  ];
  for (const patch of patches) {
    const p = clone(real());
    patch(p);
    assert.equal(success('d1', p), null, String(patch));
  }
});
test('response wire rejects unknown codes, mismatched variants, extras, duplicates and noncanonical JSON', () => {
  const good = JSON.parse(success('d1', real()));
  for (const value of [
    { ...good, extra: true },
    { ...good, requestId: null },
    { ...good, code: 'BUSY' },
    { version: 1, ok: false, requestId: 'd1', code: 'SECRET' },
    { version: 1, ok: false, requestId: 'd1', code: 'BUSY', preview: good.preview },
    { version: 2, ok: false, requestId: null, code: 'BUSY' },
    null,
    [],
  ])
    assert.equal(parseResponse(JSON.stringify(value)), null);
  const raw = JSON.stringify(good);
  for (const wire of [raw + '\n', raw.replace('"version":1', '"version":1,"version":1'), {}, null])
    assert.equal(parseResponse(wire), null);
  assert.equal(success('d0', real()), null);
});
test('synthetic runtime variants are structural fixtures, not Electron execution evidence', () => {
  for (const [runtimeKind, profileId] of [
    ['ELECTRON', 'ELECTRON_4510_ICU782_2026E_1970_2099_V1'],
    ['ELECTRON_CANDIDATE', 'ELECTRON_4510_ICU782_2026E_CANDIDATE_V1'],
  ]) {
    const p = clone(real());
    Object.assign(p.preview.runtime, { runtimeKind, profileId, electronVersion: '45.1.0' });
    assert.notEqual(parseResponse(success('d1', p)), null);
    p.preview.runtime.electronVersion = null;
    assert.equal(success('d1', p), null);
  }
});
test('output row, warning, array descriptor and next bounds fail closed', () => {
  const p = real();
  for (const patch of [
    (p) => (p.preview.occurrences = Array(129).fill(p.preview.occurrences[0])),
    (p) => (p.warnings = Array(128).fill(p.warnings[0])),
    (p) => (p.preview.occurrences[Symbol('secret')] = 1),
    (p) => Object.defineProperty(p.preview.occurrences, '0', { enumerable: false }),
    (p) => (p.preview.next = { ...p.preview.occurrences[0], extra: true }),
    (p) => (p.preview.runtime.nodeVersion = '1'.repeat(65)),
    (p) => (p.preview.occurrences[0].utcMs = Number.MAX_SAFE_INTEGER),
    (p) => (p.preview.occurrences[0].offsetSeconds = -0),
    (p) => (p.preview.occurrences[0].plannedOrdinal = Number.MAX_SAFE_INTEGER + 1),
  ]) {
    const c = clone(p);
    patch(c);
    assert.equal(success('d1', c), null);
  }
  const i = input();
  i.request.limit = 1;
  const truncated = clone(real(i));
  assert.notEqual(success('d1', truncated), null);
  truncated.preview.next.plannedOrdinal = 99;
  assert.equal(success('d1', truncated), null);
  const c = clone(p);
  let calls = 0;
  Object.defineProperty(c.preview.occurrences, '0', {
    enumerable: true,
    get() {
      calls++;
      throw Error('private');
    },
  });
  assert.equal(success('d1', c), null);
  assert.equal(calls, 0);
});
test('input revision maximum and object prototype boundaries are explicit', () => {
  const i = input();
  i.request.scope.draftRevision = Number.MAX_SAFE_INTEGER;
  assert.equal(snapshot(i).request.scope.draftRevision, Number.MAX_SAFE_INTEGER);
  for (const value of [Object.assign(Object.create(null), input()), Object.create(input())])
    assert.equal(snapshot(value), null);
  const a = input();
  Object.setPrototypeOf(a.schedule.slots, null);
  assert.equal(snapshot(a), null);
  const rev = Proxy.revocable(input().request, {});
  rev.revoke();
  const b = input();
  b.request = rev.proxy;
  assert.equal(snapshot(b), null);
  // A transparent proxy is not claimed to be detectable by descriptor snapshots.
  assert.notEqual(snapshot(new Proxy(input(), {})), null);
});
