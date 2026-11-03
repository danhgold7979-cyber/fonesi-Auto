'use strict';
const CASES = Object.freeze([
  'ownerBefore',
  'distinctContext',
  'foreignPositive',
  'ownerBlobDenied',
  'reverted',
  'ownerAfter',
]);
const STATUSES = Object.freeze([
  'PASS',
  'INVALID_INPUT',
  'OWNER_CONTEXT_INVALID',
  'OWNER_PROVIDER_UNAVAILABLE',
  'TOKEN_UNAVAILABLE',
  'TOKEN_UNAVAILABLE_ACCESS_DENIED',
  'TOKEN_UNAVAILABLE_PRIVILEGE_NOT_HELD',
  'TOKEN_UNAVAILABLE_LOGON_TYPE_NOT_GRANTED',
  'TOKEN_UNAVAILABLE_LOGON_FAILURE',
  'TOKEN_UNAVAILABLE_ACCOUNT_RESTRICTION',
  'TOKEN_UNAVAILABLE_OTHER',
  'IMPERSONATION_UNAVAILABLE',
  'CONTROL_FAILED',
]);
function parse(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4096) throw new Error('INVALID');
  const value = JSON.parse(raw);
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(['version', 'status', ...CASES]) ||
    value.version !== 1 ||
    !STATUSES.includes(value.status) ||
    CASES.some((k) => typeof value[k] !== 'boolean') ||
    JSON.stringify(value) !== raw
  )
    throw new Error('INVALID');
  const passed = value.status === 'PASS' && CASES.every((k) => value[k]);
  if (value.status === 'PASS' && !passed) throw new Error('INVALID');
  return Object.freeze({ ...value, passed });
}
module.exports = { CASES, STATUSES, parse };
