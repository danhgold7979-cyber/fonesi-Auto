'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const desktop = path.resolve(__dirname, '..');
async function verify() {
  if (process.versions.node !== '24.22.1') throw Error('DEMO_NODE');
  const { verifyDemoBuild, scanProductionPayload, scanProductionSource } = await import(
    pathToFileURL(path.join(desktop, 'scripts/demo-build-manifest.mjs')).href
  );
  const { verifyBuild } = await import(
    pathToFileURL(path.join(desktop, 'scripts/build-manifest.mjs')).href
  );
  if (!verifyBuild(desktop) || !verifyDemoBuild(desktop)) throw Error('DEMO_BUILD');
  scanProductionSource(desktop);
  scanProductionPayload(path.join(desktop, 'build'));
}
async function main() {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'verify') throw Error('DEMO_ARGUMENTS');
    await verify();
    fs.writeSync(1, 'DEMO_BUILD_VERIFIED\n');
  } catch {
    fs.writeSync(1, 'DEMO_BUILD_REJECTED\n');
    process.exitCode = 1;
  }
}
module.exports = { verify };
if (require.main === module) void main();
