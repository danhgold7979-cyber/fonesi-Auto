'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const FIRST_CASES = Object.freeze([
  'mainReady',
  'initialStatus',
  'termsCancel',
  'termsPageNoConsent',
  'routeCancel',
  'pickerCancel',
  'finalCancel',
  'noCoreBeforeConsent',
  'pendingAcknowledged',
  'duplicateBusy',
  'pendingReadObserved',
  'wrongHashRejected',
  'revisionReconciled',
  'localArchiveVerified',
  'fleetStillUnavailable',
  'foreignSenderDenied',
  'subframeDenied',
  'lightLayout',
  'darkLayout',
  'mainClosed',
]);
const REOPEN_CASES = Object.freeze([
  'mainReady',
  'persistedVerifiedLocal',
  'noAutomaticConsent',
  'installationRevisionRetained',
  'secondStartupObserved',
  'fleetStillUnavailable',
  'mainClosed',
]);
const PHASES = Object.freeze([
  'PREPARE',
  'MIGRATION',
  'HYDRATE',
  'TERMS_CANCEL',
  'TERMS_PAGE',
  'ROUTE_CANCEL',
  'PICKER_CANCEL',
  'FINAL_CANCEL',
  'PENDING',
  'WRONG_HASH',
  'INSTALL',
  'REOPEN',
  'LIGHT',
  'DARK',
  'SENDER',
  'SUBFRAME',
  'CLOSE',
]);
const SCOPE = 'HOSTED_RECIPIENT_SETUP_SOURCE_ONLY';
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v).sort()) !== JSON.stringify([...keys].sort())
  )
    throw Error('RECIPIENT_SETUP_SCHEMA');
}
function validateResult(input) {
  exact(input, ['version', 'scope', 'mode', 'cases', 'screenshots', 'readyCount', 'closedCount']);
  if (
    input.version !== 1 ||
    input.scope !== SCOPE ||
    input.readyCount !== 1 ||
    input.closedCount !== 1
  )
    throw Error('RECIPIENT_SETUP_SCHEMA');
  if (!['FIRST', 'REOPEN'].includes(input.mode)) throw Error('RECIPIENT_SETUP_SCHEMA');
  const CASES = input.mode === 'FIRST' ? FIRST_CASES : REOPEN_CASES;
  exact(input.cases, CASES);
  if (CASES.some((key) => typeof input.cases[key] !== 'boolean'))
    throw Error('RECIPIENT_SETUP_SCHEMA');
  exact(input.screenshots, input.mode === 'FIRST' ? ['light', 'dark'] : []);
  for (const theme of input.mode === 'FIRST' ? ['light', 'dark'] : []) {
    const v = input.screenshots[theme];
    exact(v, ['file', 'sha256', 'width', 'height', 'bytes']);
    if (
      v.file !== `setup-${theme}.png` ||
      typeof v.sha256 !== 'string' ||
      v.sha256.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(v.sha256) ||
      v.width !== 1024 ||
      v.height !== 768 ||
      !Number.isInteger(v.bytes) ||
      v.bytes < 32 ||
      v.bytes > 2097152
    )
      throw Error('RECIPIENT_SETUP_SCHEMA');
  }
  if (input.mode === 'FIRST' && input.screenshots.light.sha256 === input.screenshots.dark.sha256)
    throw Error('RECIPIENT_SETUP_SCHEMA');
  return { ...input, passed: CASES.every((key) => input.cases[key]) };
}
function saveImage(root, theme, image) {
  plain(root);
  if (!['light', 'dark'].includes(theme)) throw Error('RECIPIENT_SETUP_IMAGE');
  const size = image.getSize(),
    bytes = image.toPNG();
  if (size.width !== 1024 || size.height !== 768 || bytes.length < 32 || bytes.length > 2097152)
    throw Error('RECIPIENT_SETUP_IMAGE');
  const file = `setup-${theme}.png`,
    fd = fs.openSync(path.join(root, file), 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 1024,
    height: 768,
    bytes: bytes.length,
  };
}
function rootForLaunch(launch) {
  plain(launch);
  const managed = path.dirname(launch),
    firstUse = path.dirname(managed),
    root = path.dirname(firstUse);
  for (const dir of [managed, firstUse, root]) plain(dir);
  if (
    !path.basename(launch).startsWith('launch-') ||
    !uuid(path.basename(launch).slice(7)) ||
    !path.basename(managed).startsWith('Fonesi-Auto-') ||
    !uuid(path.basename(managed).slice(12)) ||
    path.basename(firstUse) !== 'first-use' ||
    ![launch, managed, root].every((dir) => uuid(read(path.join(dir, '.owner'))))
  )
    throw Error('RECIPIENT_SETUP_OWNER');
  return root;
}
module.exports = {
  FIRST_CASES,
  REOPEN_CASES,
  PHASES,
  SCOPE,
  validateResult,
  saveImage,
  rootForLaunch,
  write,
};
