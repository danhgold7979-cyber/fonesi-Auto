import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admission = require('../launch/package-admission.cjs');
export const NODE_LICENSE_URL = 'https://raw.githubusercontent.com/nodejs/node/v24.22.1/LICENSE';
export const { NODE_SHA, NODE_LICENSE_SHA, REACT_LICENSE_SHA, BUILD_OUTPUTS, CLOSURE, PROVENANCE } =
  admission;
export function createPackageManifest(root, sourceHead, sourceTree, runtime) {
  return {
    version: 1,
    mode: 'INTERNAL_PRODUCTION',
    sourceHead,
    sourceTree,
    runtime: {
      platform: 'win32',
      arch: 'x64',
      node: '24.22.1',
      electron: '45.1.0',
      nodeExeSha256: NODE_SHA,
      electronExeSha256: runtime.exeSha256,
    },
    entry: 'Launch.ps1',
    files: admission.inventory(root).files,
  };
}
export const verifyPackage = admission.verifyPackage;
export const packageInventory = admission.inventory;
export const packageDigest = admission.digest;
export const packageName = admission.safeName;
