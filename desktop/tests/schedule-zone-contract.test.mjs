import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verify } from '../scripts/verify-dependencies.mjs';
verify(true, '11.9.0');
const source = readFileSync(new URL('../src/schedule-zone-contract.ts', import.meta.url), 'utf8');
async function load(transform = (s) => s) {
  const text = stripTypeScriptTypes(transform(source))
    .replaceAll(
      "'@js-temporal/polyfill'",
      JSON.stringify(
        new URL('../node_modules/@js-temporal/polyfill/dist/index.esm.js', import.meta.url).href,
      ),
    )
    .replaceAll(
      "'./schedule-civil-contract.js'",
      JSON.stringify(new URL('../src/schedule-civil-contract.ts', import.meta.url).href),
    );
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
}
const api = await load();
const id = '00000000-0000-4000-8000-000000000001';
const schedule = (date, time = '09:00', patch = {}) => ({
  version: 1,
  kind: 'CIVIL_RULE',
  startDate: date,
  endDate: null,
  maxOccurrences: null,
  rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
  postsPerActiveDay: 1,
  slots: [{ id, time }],
  ...patch,
});
const request = (zone, date, patch = {}) => ({
  version: 1,
  zone,
  fromDate: date,
  throughDate: date,
  limit: 4096,
  ...patch,
});
const row = (zone, date, time) => {
  const r = api.resolveCivilPreview(schedule(date, time), request(zone, date));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.occurrences[0];
};
test('actual runtime witness and HCM alias retain requested identity without host fallback', () => {
  const r = api.captureTimezoneRuntime();
  assert.equal(r.ok, true);
  assert.equal(r.runtime.tzVersion, '2026e');
  assert.equal(r.runtime.electronVersion, null);
  assert.ok(Object.isFrozen(r.runtime));
  const out = api.resolveCivilPreview(
    schedule('2024-01-01'),
    request('Asia/Ho_Chi_Minh', '2024-01-01'),
  );
  assert.equal(out.ok, true);
  assert.equal(out.zone, 'Asia/Ho_Chi_Minh');
  assert.equal(out.resolvedZone, 'Asia/Saigon');
  assert.equal(out.occurrences[0].utcMs, 1704074400000);
  assert.equal(out.occurrences[0].offsetSeconds, 25200);
});
test('actual Temporal NY gap skips and fold chooses earlier instant exactly once', () => {
  assert.deepEqual(row('America/New_York', '2024-03-10', '02:30'), {
    date: '2024-03-10',
    time: '02:30',
    slotId: id,
    plannedOrdinal: 1,
    resolution: 'SKIPPED_GAP',
    utcMs: null,
    offsetSeconds: null,
    notification: 'DST_GAP_SKIPPED',
  });
  const fold = row('America/New_York', '2024-11-03', '01:30');
  assert.equal(fold.resolution, 'OVERLAP_EARLIER');
  assert.equal(fold.utcMs, 1730611800000);
  assert.equal(fold.offsetSeconds, -14400);
});
test('half-hour Lord Howe and whole-date Apia gaps are not one-hour assumptions', () => {
  assert.equal(row('Australia/Lord_Howe', '2024-10-06', '02:15').resolution, 'SKIPPED_GAP');
  const f = row('Australia/Lord_Howe', '2024-04-07', '01:45');
  assert.equal(f.resolution, 'OVERLAP_EARLIER');
  assert.equal(f.utcMs, 1712414700000);
  assert.equal(f.offsetSeconds, 39600);
  assert.equal(row('Pacific/Apia', '2011-12-30', '12:00').resolution, 'SKIPPED_GAP');
});
// Independent tzdb2026e source: asia3982–3991 (+08 until1975Jun13); africa415–418 (-00:44:30 until1972Jan7).
// https://data.iana.org/time-zones/tzdb-2026e/asia ; https://data.iana.org/time-zones/tzdb-2026e/africa
test('historical integral-second offsets survive and UTC epoch may be signed', () => {
  const f = row('Africa/Monrovia', '1970-01-01', '00:00');
  assert.equal(f.offsetSeconds, -2670);
  assert.equal(f.utcMs, 2670000);
  assert.equal(row('Asia/Ho_Chi_Minh', '1970-01-01', '00:00').utcMs, -28800000);
  assert.equal(row('UTC', '2099-12-31', '23:59').utcMs, 4102444740000);
});
test('real civil max/end/next composition preserves skipped ordinal with no replacement', () => {
  const r = api.resolveCivilPreview(
    schedule('2024-03-09', '02:30', { maxOccurrences: 3 }),
    request('America/New_York', '2024-03-09', { throughDate: '2024-03-12', limit: 2 }),
  );
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.occurrences.map((x) => x.plannedOrdinal),
    [1, 2],
  );
  assert.equal(r.occurrences[1].resolution, 'SKIPPED_GAP');
  assert.equal(r.next.plannedOrdinal, 3);
  assert.equal(r.next.date, '2024-03-11');
  assert.equal(r.truncated, true);
  assert.ok(Object.isFrozen(r.occurrences));
});
test('closed request syntax, civil precedence, local domain and admitted name refusal', () => {
  const s = schedule('2024-01-01');
  for (const zone of ['', '+07:00', 'EST', 'asia/ho_chi_minh', 'Unknown/Place'])
    assert.equal(api.resolveCivilPreview(s, request(zone, '2024-01-01')).ok, false);
  assert.equal(
    api.resolveCivilPreview(schedule('bad'), request('Unknown/Place', '1969-01-01')).code,
    'INVALID_DATE',
  );
  assert.equal(
    api.resolveCivilPreview(s, request('UTC', '1969-01-01')).code,
    'UNSUPPORTED_DATE_RANGE',
  );
  assert.equal(
    api.resolveCivilPreview(s, request('Unknown/Place', '2024-01-01')).code,
    'UNSUPPORTED_ZONE',
  );
  assert.equal(
    api.resolveCivilPreview(s, { ...request('UTC', '2024-01-01'), extra: 1 }).code,
    'INVALID_SCHEMA',
  );
});
test('getters/coercion/hostile descriptors never become library inputs or raw errors', () => {
  let calls = 0;
  const r = request('UTC', '2024-01-01');
  Object.defineProperty(r, 'zone', {
    get() {
      calls++;
      throw Error('PRIVATE');
    },
  });
  assert.equal(api.resolveCivilPreview(schedule('2024-01-01'), r).ok, false);
  assert.equal(calls, 0);
  const p = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw Error('PRIVATE');
      },
    },
  );
  assert.deepEqual(api.resolveCivilPreview(p, request('UTC', '2024-01-01')), {
    ok: false,
    code: 'INVALID_SCHEMA',
  });
});
test('version and malformed numeric/roundtrip transformed seams fail closed', async () => {
  const mismatch = await load((s) => s.replace("node: '24.22.1'", "node: '0.0.0'"));
  assert.deepEqual(mismatch.captureTimezoneRuntime(), { ok: false, code: 'DATA_VERSION_MISMATCH' });
  for (const [old, value] of [
    [
      'const ns = value.epochNanoseconds,\n    ms = value.epochMilliseconds;',
      'const ns = 1n, ms = value.epochMilliseconds;',
    ],
    ['const delta = (late.seconds - early.seconds) * 1000;', 'const delta=1;'],
    [
      'const ns = value.epochNanoseconds,\n    ms = value.epochMilliseconds;',
      "throw new Error('PRIVATE'); const ns = value.epochNanoseconds,\n    ms = value.epochMilliseconds;",
    ],
  ]) {
    assert.ok(source.includes(old));
    const bad = await load((s) => s.replace(old, value));
    const out = bad.resolveCivilPreview(
      schedule('2024-03-10', '02:30'),
      request('America/New_York', '2024-03-10'),
    );
    assert.equal(out.ok, false);
    assert.ok(!JSON.stringify(out).includes('PRIVATE'));
  }
});
test('actual library cross-TZ subprocess results and explicit override refusal', () => {
  const code = `import {stripTypeScriptTypes} from 'node:module';import{readFileSync}from'node:fs';const s=stripTypeScriptTypes(readFileSync(${JSON.stringify(fileURLToPath(new URL('../src/schedule-zone-contract.ts', import.meta.url)))},'utf8')).replaceAll("'@js-temporal/polyfill'",${JSON.stringify(JSON.stringify(new URL('../node_modules/@js-temporal/polyfill/dist/index.esm.js', import.meta.url).href))}).replaceAll("'./schedule-civil-contract.js'",${JSON.stringify(JSON.stringify(new URL('../src/schedule-civil-contract.ts', import.meta.url).href))});const m=await import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));console.log(JSON.stringify(m.resolveCivilPreview(${JSON.stringify(schedule('2024-11-03', '01:30'))},${JSON.stringify(request('America/New_York', '2024-11-03'))})));`;
  const outputs = [];
  for (const TZ of ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York']) {
    const p = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, TZ },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(p.status, 0, p.stderr);
    outputs.push(p.stdout);
  }
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[1], outputs[2]);
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, NODE_ICU_DATA: '' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(p.status, 0);
  assert.equal(JSON.parse(p.stdout).code, 'RUNTIME_UNAVAILABLE');
});
test('source remains nonactivated and exact dependency versions/byte review precede imports', () => {
  assert.doesNotMatch(source, /Temporal\.Now|setTimeout|node:fs|node:child_process/);
  for (const name of ['main.ts', 'preload.ts', 'renderer.tsx'])
    assert.ok(
      !readFileSync(new URL('../src/' + name, import.meta.url), 'utf8').includes('schedule-zone'),
    );
  const review = JSON.parse(readFileSync(new URL('../dependency-review.json', import.meta.url)));
  assert.equal(review.packages['node_modules/@js-temporal/polyfill'].version, '0.5.1');
  assert.equal(review.packages['node_modules/jsbi'].version, '4.3.2');
  assert.ok(review.reviewedFiles['node_modules/@js-temporal/polyfill/dist/index.esm.js']);
});
test('caller mutation after snapshots cannot alter frozen resolved history', () => {
  const s = schedule('2024-01-01');
  const q = request('UTC', '2024-01-01');
  const out = api.resolveCivilPreview(s, q);
  assert.equal(out.ok, true);
  s.slots[0].time = '23:59';
  q.zone = 'America/New_York';
  assert.equal(out.occurrences[0].time, '09:00');
  assert.equal(out.zone, 'UTC');
  assert.ok(Object.isFrozen(out.occurrences[0]));
  assert.throws(() => {
    out.occurrences[0].utcMs = 1;
  });
  let get = 0;
  const bad = new Proxy(
    {},
    {
      getPrototypeOf() {
        get++;
        throw 'PRIVATE';
      },
    },
  );
  assert.deepEqual(api.resolveCivilPreview(s, bad), { ok: false, code: 'INVALID_SCHEMA' });
  assert.equal(get, 1);
});
test('all override forms and unobserved Electron tuple refuse without host-default fallback', async () => {
  for (const token of ['--icu-data-dir=/private', '--icu-data-dir']) {
    const changed = await load((s) =>
      s.replace('execArgv.some(', JSON.stringify([token]) + '.some('),
    );
    assert.equal(changed.captureTimezoneRuntime().code, 'RUNTIME_UNAVAILABLE');
  }
  for (const variable of ['NODE_OPTIONS', 'NODE_ICU_DATA']) {
    const changed = await load((s) => s.replace(`env.${variable} !== undefined`, 'true'));
    assert.equal(changed.captureTimezoneRuntime().code, 'RUNTIME_UNAVAILABLE');
  }
  const electron = await load((s) => s.replace('versions.electron !== undefined', 'true'));
  assert.equal(electron.captureTimezoneRuntime().code, 'DATA_VERSION_MISMATCH');
});
test('4096 row bound composes with civil truncation and exact within-window next', () => {
  const slots = Array.from({ length: 1440 }, (_, n) => ({
    id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
    time: `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`,
  }));
  const s = schedule('2024-01-01', '00:00', { postsPerActiveDay: 1440, slots });
  const r = api.resolveCivilPreview(s, request('UTC', '2024-01-01', { throughDate: '2024-01-03' }));
  assert.equal(r.ok, true);
  assert.equal(r.occurrences.length, 4096);
  assert.equal(r.next.plannedOrdinal, 4097);
  assert.equal(r.truncated, true);
  assert.equal(
    api.resolveCivilPreview(s, request('UTC', '2024-01-01', { limit: 4097 })).code,
    'INVALID_PREVIEW',
  );
});
test('numeric coherence rejects unequal offsets, one-sided locals and false gap brackets', async () => {
  for (const replacement of [
    "const late = { ...facts(from(fields, { overflow: 'reject', disambiguation: 'later' })), local: 0 };",
    "const late = { ...facts(from(fields, { overflow: 'reject', disambiguation: 'later' })), seconds: 0 };",
  ]) {
    const old =
      "const late = facts(from(fields, { overflow: 'reject', disambiguation: 'later' }));";
    assert.ok(source.includes(old));
    const bad = await load((s) => s.replace(old, replacement));
    assert.equal(
      bad.resolveCivilPreview(
        schedule('2024-11-03', '01:30'),
        request('America/New_York', '2024-11-03'),
      ).code,
      'RESOLUTION_UNAVAILABLE',
    );
  }
});
