'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { plain, read, write, uuid } = require('./persistence-restore-contract.cjs');
const CASES = Object.freeze([
  'mainReady',
  'oneFleetHydration',
  'preferencesHydrated',
  'emptyProduction',
  'readObserved',
  'emptySelectionUnchanged',
  'selectionTimeoutObserved',
  'selectionReconcileRequired',
  'explicitReadReconciled',
  'lateReplyNoReplay',
  'foreignSenderDenied',
  'subframeDenied',
  'revokedSessionDenied',
  'sixTabsPresent',
  'noDeviceActions',
  'lightLayout',
  'darkLayout',
  'mainClosed',
]);
const PHASES = Object.freeze([
  'PREPARE',
  'MIGRATION',
  'HYDRATE',
  'READ',
  'SELECT',
  'RECONCILE',
  'LIGHT',
  'DARK',
  'SENDER',
  'SUBFRAME',
  'REVOKE',
  'CLOSE',
]);
const SCOPE = 'HOSTED_FLEET_UI_SOURCE_ONLY';
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v).sort()) !== JSON.stringify([...keys].sort())
  )
    throw Error('FLEET_UI_SCHEMA');
}
function validateResult(input) {
  exact(input, ['version', 'scope', 'cases', 'screenshots', 'readyCount', 'closedCount']);
  if (
    input.version !== 1 ||
    input.scope !== SCOPE ||
    input.readyCount !== 1 ||
    input.closedCount !== 1
  )
    throw Error('FLEET_UI_SCHEMA');
  exact(input.cases, CASES);
  if (CASES.some((key) => typeof input.cases[key] !== 'boolean')) throw Error('FLEET_UI_SCHEMA');
  exact(input.screenshots, ['light', 'dark']);
  for (const theme of ['light', 'dark']) {
    const v = input.screenshots[theme];
    exact(v, ['file', 'sha256', 'width', 'height', 'bytes']);
    if (
      v.file !== `fleet-${theme}.png` ||
      typeof v.sha256 !== 'string' ||
      v.sha256.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(v.sha256) ||
      v.width !== 1024 ||
      v.height !== 768 ||
      !Number.isInteger(v.bytes) ||
      v.bytes < 32 ||
      v.bytes > 2097152
    )
      throw Error('FLEET_UI_SCHEMA');
  }
  if (input.screenshots.light.sha256 === input.screenshots.dark.sha256)
    throw Error('FLEET_UI_SCHEMA');
  return { ...input, passed: CASES.every((key) => input.cases[key]) };
}
function saveImage(root, theme, image) {
  plain(root);
  if (!['light', 'dark'].includes(theme)) throw Error('FLEET_UI_IMAGE');
  const size = image.getSize(),
    bytes = image.toPNG();
  if (size.width !== 1024 || size.height !== 768 || bytes.length < 32 || bytes.length > 2097152)
    throw Error('FLEET_UI_IMAGE');
  const file = `fleet-${theme}.png`,
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
    throw Error('FLEET_UI_OWNER');
  return root;
}
module.exports = { CASES, PHASES, SCOPE, validateResult, saveImage, rootForLaunch, write };
