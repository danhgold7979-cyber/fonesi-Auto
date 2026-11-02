'use strict';
const CASES = Object.freeze(
  [
    ['HCM', 'Asia/Ho_Chi_Minh', '2024-01-01T00:00:00Z'],
    ['SAIGON_ALIAS', 'Asia/Saigon', '2024-01-01T00:00:00Z'],
    ['NY_SPRING_BEFORE', 'America/New_York', '2024-03-10T06:59:00Z'],
    ['NY_SPRING_AFTER', 'America/New_York', '2024-03-10T07:00:00Z'],
    ['NY_FOLD_EARLIER', 'America/New_York', '2024-11-03T05:30:00Z'],
    ['NY_FOLD_LATER', 'America/New_York', '2024-11-03T06:30:00Z'],
    ['LORD_HOWE_BEFORE', 'Australia/Lord_Howe', '2024-10-05T15:29:00Z'],
    ['LORD_HOWE_AFTER', 'Australia/Lord_Howe', '2024-10-05T15:30:00Z'],
  ].map(([id, zone, utc]) => Object.freeze({ id, zone, utc })),
);
const VERSION_KEYS = Object.freeze(['electron', 'node', 'v8', 'icu', 'cldr', 'tz', 'unicode']);
const PARTS = Object.freeze(['month', 'day', 'year', 'hour', 'minute', 'timeZoneName']);
function fail() {
  throw new Error('SCHEDULE_RUNTIME_REJECTED');
}
function record(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    fail();
  const own = Reflect.ownKeys(value);
  if (
    own.length !== keys.length ||
    own.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    fail();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || !d.enumerable) fail();
  }
  return value;
}
function canonical(raw, maxBytes) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > maxBytes || !raw.length) fail();
  const value = JSON.parse(raw);
  if (JSON.stringify(value) !== raw) fail();
  return value;
}
function validateObservation(value) {
  record(value, ['version', 'kind', 'platform', 'arch', 'versions', 'overrideAbsent', 'cases']);
  if (
    value.version !== 1 ||
    value.kind !== 'SCHEDULE_RUNTIME_OBSERVATION' ||
    value.platform !== 'win32' ||
    value.arch !== 'x64' ||
    value.overrideAbsent !== true
  )
    fail();
  record(value.versions, VERSION_KEYS);
  for (const key of VERSION_KEYS)
    if (typeof value.versions[key] !== 'string' || !/^[!-~]{1,64}$/.test(value.versions[key]))
      fail();
  if (value.versions.electron !== '45.1.0') fail();
  if (!Array.isArray(value.cases) || value.cases.length !== CASES.length) fail();
  for (let i = 0; i < CASES.length; i++) {
    const row = record(value.cases[i], ['id', 'requestedZone', 'resolvedZone', 'parts']);
    const fixture = CASES[i];
    if (row.id !== fixture.id || row.requestedZone !== fixture.zone) fail();
    const zones =
      fixture.zone === 'Asia/Ho_Chi_Minh' || fixture.zone === 'Asia/Saigon'
        ? ['Asia/Ho_Chi_Minh', 'Asia/Saigon']
        : [fixture.zone];
    if (!zones.includes(row.resolvedZone) || !Array.isArray(row.parts) || row.parts.length !== 6)
      fail();
    if (
      row.parts.some(
        (part, index) => Object.getOwnPropertyDescriptor(part, 'type')?.value !== PARTS[index],
      )
    )
      fail();
    const seen = new Set();
    for (const part of row.parts) {
      record(part, ['type', 'value']);
      if (!PARTS.includes(part.type) || seen.has(part.type) || typeof part.value !== 'string')
        fail();
      seen.add(part.type);
      if (part.type === 'timeZoneName') {
        if (!/^GMT(?:[+-](?:[0-9]|1[0-9]|2[0-3])(?::[0-5][0-9])?)?$/.test(part.value)) fail();
      } else if (!(part.type === 'year' ? /^[0-9]{4}$/ : /^[0-9]{1,2}$/).test(part.value)) fail();
    }
  }
  return value;
}
function parseFramed(stdout, validator) {
  if (typeof stdout !== 'string' || !stdout.endsWith('\n') || stdout.endsWith('\n\n'))
    throw new Error('SCHEDULE_CAPTURE_FRAMING');
  // Electron may emit empty preamble lines. Admit only this finite framing,
  // never trim JSON whitespace or extract a record from arbitrary output.
  for (let count = 0; count < 2; count++) {
    if (stdout.startsWith('\r\n')) stdout = stdout.slice(2);
    else if (stdout.startsWith('\n')) stdout = stdout.slice(1);
    else break;
  }
  if (stdout.startsWith('\n') || stdout.startsWith('\r\n'))
    throw new Error('SCHEDULE_CAPTURE_FRAMING');
  const raw = stdout.endsWith('\r\n') ? stdout.slice(0, -2) : stdout.slice(0, -1);
  if (Buffer.byteLength(raw) > 16384) throw new Error('SCHEDULE_CAPTURE_LIMIT');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('SCHEDULE_CAPTURE_GRAMMAR');
  }
  if (JSON.stringify(value) !== raw) throw new Error('SCHEDULE_CAPTURE_REPRESENTATION');
  try {
    return validator(value);
  } catch {
    throw new Error('SCHEDULE_CAPTURE_SCHEMA');
  }
}
function parseObservation(stdout) {
  return parseFramed(stdout, validateObservation);
}
const HOST_ZONES = Object.freeze(['UTC', 'America/Los_Angeles', 'Asia/Tokyo']);
const CORPUS_CASES = Object.freeze([
  'HCM_ALIAS',
  'NY_GAP',
  'NY_FOLD',
  'LORD_HOWE',
  'THRESHOLD',
  'MIDNIGHT',
  'BOUNDS_NEXT',
  'DENSE_PREFIX',
  'CALENDAR',
  'FAIL_CLOSED',
]);
function validateCandidate(value) {
  record(value, [
    'version',
    'kind',
    'hostZone',
    'hostOffsetMinutes',
    'hostResolvedZone',
    'observation',
    'productionRefusal',
    'corpus',
  ]);
  const index = HOST_ZONES.indexOf(value.hostZone);
  if (
    value.version !== 1 ||
    value.kind !== 'SCHEDULE_CANDIDATE_RESULT' ||
    index < 0 ||
    value.hostOffsetMinutes !== [0, 480, -540][index] ||
    value.hostResolvedZone !== value.hostZone ||
    value.productionRefusal !== 'DATA_VERSION_MISMATCH'
  )
    fail();
  const observation = validateObservation(value.observation);
  if (
    JSON.stringify(observation.versions) !==
    JSON.stringify({
      electron: '45.1.0',
      node: '24.22.1',
      v8: '15.6.75.19-electron.0',
      icu: '78.2',
      cldr: '48.0',
      tz: '2026e',
      unicode: '17.0',
    })
  )
    fail();
  record(value.corpus, ['version', 'kind', 'cases', 'checks', 'semanticSha256']);
  if (
    value.corpus.version !== 1 ||
    value.corpus.kind !== 'SCHEDULE_CANDIDATE_CORPUS' ||
    JSON.stringify(value.corpus.cases) !== JSON.stringify(CORPUS_CASES) ||
    value.corpus.checks !== 4284 ||
    !/^[0-9a-f]{64}$/.test(value.corpus.semanticSha256)
  )
    fail();
  return value;
}
function parseCandidate(stdout) {
  return parseFramed(stdout, validateCandidate);
}
function validateProduction(value) {
  record(value, [
    'version',
    'kind',
    'hostZone',
    'hostOffsetMinutes',
    'hostResolvedZone',
    'observation',
    'candidate',
    'production',
  ]);
  const index = HOST_ZONES.indexOf(value.hostZone);
  if (
    value.version !== 2 ||
    value.kind !== 'SCHEDULE_PRODUCTION_RESULT' ||
    index < 0 ||
    value.hostOffsetMinutes !== [0, 480, -540][index] ||
    value.hostResolvedZone !== value.hostZone
  )
    fail();
  validateObservation(value.observation);
  const versions = {
    electron: '45.1.0',
    node: '24.22.1',
    v8: '15.6.75.19-electron.0',
    icu: '78.2',
    cldr: '48.0',
    tz: '2026e',
    unicode: '17.0',
  };
  if (JSON.stringify(value.observation.versions) !== JSON.stringify(versions)) fail();
  for (const key of ['candidate', 'production']) {
    const proof = value[key];
    record(proof, ['runtime', 'corpus']);
    const candidate = key === 'candidate';
    const expected = {
      version: 1,
      source: 'TEMPORAL_POLYFILL_INTL',
      runtimeKind: candidate ? 'ELECTRON_CANDIDATE' : 'ELECTRON',
      nodeVersion: '24.22.1',
      electronVersion: '45.1.0',
      v8Version: '15.6.75.19-electron.0',
      icuVersion: '78.2',
      cldrVersion: '48.0',
      tzVersion: '2026e',
      unicodeVersion: '17.0',
      polyfillVersion: '0.5.1',
      jsbiVersion: '4.3.2',
      profileId: candidate
        ? 'ELECTRON_4510_ICU782_2026E_CANDIDATE_V1'
        : 'ELECTRON_4510_ICU782_2026E_1970_2099_V1',
      profileSha256: candidate
        ? 'abbffc0a0eaa71b70f7f1316d08f98612ebb3ac50f5f1eeee422b8a13d4498d9'
        : 'a17146a19f2e736b011a85b0bf507308c8e3a771e0ce664e211997483a755898',
      policy: 'GAP_SKIP_OVERLAP_EARLIER_V1',
    };
    record(proof.runtime, Object.keys(expected));
    if (JSON.stringify(proof.runtime) !== JSON.stringify(expected)) fail();
    record(proof.corpus, ['version', 'kind', 'cases', 'checks', 'semanticSha256']);
    if (
      proof.corpus.version !== 1 ||
      proof.corpus.kind !== 'SCHEDULE_CANDIDATE_CORPUS' ||
      JSON.stringify(proof.corpus.cases) !== JSON.stringify(CORPUS_CASES) ||
      proof.corpus.checks !== 4284 ||
      !/^[0-9a-f]{64}$/.test(proof.corpus.semanticSha256)
    )
      fail();
  }
  if (JSON.stringify(value.candidate.corpus) !== JSON.stringify(value.production.corpus)) fail();
  return value;
}
function parseProduction(stdout) {
  return parseFramed(stdout, validateProduction);
}
function assertOverridesAbsent(env, execArgv) {
  if (!Array.isArray(execArgv) || execArgv.length) fail();
  for (const key of Object.keys(env)) {
    if (
      /electron/i.test(key) ||
      ['NODE_OPTIONS', 'NODE_PATH', 'ESBUILD_BINARY_PATH', 'NODE_ICU_DATA', 'ICU_DATA'].includes(
        key.toUpperCase(),
      )
    )
      fail();
  }
}
function capture(versions, env, execArgv, platform, arch) {
  assertOverridesAbsent(env, execArgv);
  const actual = Object.fromEntries(VERSION_KEYS.map((key) => [key, versions[key]]));
  const cases = CASES.map(({ id, zone, utc }) => {
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    });
    return {
      id,
      requestedZone: zone,
      resolvedZone: formatter.resolvedOptions().timeZone,
      parts: formatter
        .formatToParts(new Date(utc))
        .filter((part) => part.type !== 'literal')
        .map(({ type, value }) => ({ type, value })),
    };
  });
  return validateObservation({
    version: 1,
    kind: 'SCHEDULE_RUNTIME_OBSERVATION',
    platform,
    arch,
    versions: actual,
    overrideAbsent: true,
    cases,
  });
}
module.exports = {
  CASES,
  HOST_ZONES,
  CORPUS_CASES,
  validateCandidate,
  validateProduction,
  parseProduction,
  parseCandidate,
  VERSION_KEYS,
  record,
  canonical,
  validateObservation,
  parseObservation,
  assertOverridesAbsent,
  capture,
};
