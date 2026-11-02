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
function parseObservation(stdout) {
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
    return validateObservation(value);
  } catch {
    throw new Error('SCHEDULE_CAPTURE_SCHEMA');
  }
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
  VERSION_KEYS,
  record,
  canonical,
  validateObservation,
  parseObservation,
  assertOverridesAbsent,
  capture,
};
