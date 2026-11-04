'use strict';
// Verification-only fixed vocabulary. No fixture activation or production capability.
const { plain, read, write, exact } = require('./settings-contract.cjs');
const { saveImage } = require('./ui-contract.cjs');
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const MODES = Object.freeze(['source', 'package', 'production']);
const DEMO_CASES = Object.freeze([
  'verifiedDemoBuild',
  'explicitArgument',
  'ownedProfile',
  'sandboxAndIsolation',
  'isolatedOrigin',
  'noPreloadOrIpc',
  'syntheticFixtureCounts',
  'allSixTabs',
  'bannerEveryPage',
  'bannerBothThemes',
  'bannerWithModal',
  'media25Reachable',
  'dependentSelection',
  'domainUnavailable',
  'localPreferenceReadback',
  'invalidPreferenceDefaults',
  'deniedPreferenceVisible',
  'orderlyQuit',
]);
const PRODUCTION_CASES = Object.freeze([
  'realMain',
  'originalKeyAuthenticated',
  'demoEnvironmentIgnored',
  'productionEmpty',
  'fixtureCanaryAbsent',
  'productionOrigin',
  'orderlyQuit',
]);
function caseNames(mode) {
  if (!MODES.includes(mode)) throw Error('DEMO_MODE');
  return mode === 'production' ? PRODUCTION_CASES : DEMO_CASES;
}
function imageSpecs(mode) {
  caseNames(mode);
  const names =
    mode === 'source'
      ? [
          'demo-source-overview-light.png',
          'demo-source-overview-dark.png',
          'demo-source-setup-light.png',
        ]
      : mode === 'package'
        ? ['demo-package-overview-light.png']
        : ['demo-production-overview-light.png'];
  return names.map((name) => ({ name, width: 1440, height: 900 }));
}
function validateResult(raw) {
  const value = exact(raw, ['version', 'mode', 'versions', 'cases', 'images']);
  if (
    value.version !== 1 ||
    !MODES.includes(value.mode) ||
    JSON.stringify(value.versions) !== JSON.stringify(VERSIONS)
  )
    throw Error('DEMO_RESULT');
  const names = caseNames(value.mode);
  if (
    !value.cases ||
    Object.keys(value.cases).join('|') !== names.join('|') ||
    !names.every((name) => typeof value.cases[name] === 'boolean')
  )
    throw Error('DEMO_RESULT');
  const specs = imageSpecs(value.mode);
  if (!Array.isArray(value.images) || value.images.length !== specs.length)
    throw Error('DEMO_RESULT');
  let total = 0;
  for (let i = 0; i < specs.length; i++) {
    const item = exact(JSON.stringify(value.images[i]), [
      'name',
      'width',
      'height',
      'bytes',
      'sha256',
    ]);
    const spec = specs[i];
    if (
      item.name !== spec.name ||
      item.width !== spec.width ||
      item.height !== spec.height ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 45 ||
      item.bytes > 4194304 ||
      typeof item.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    )
      throw Error('DEMO_RESULT');
    total += item.bytes;
  }
  if (total > 20971520) throw Error('DEMO_RESULT');
  return value;
}
module.exports = {
  plain,
  read,
  write,
  exact,
  saveImage,
  VERSIONS,
  MODES,
  DEMO_CASES,
  PRODUCTION_CASES,
  caseNames,
  imageSpecs,
  validateResult,
};
