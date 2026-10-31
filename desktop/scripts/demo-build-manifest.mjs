import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, opendirSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { inputs as productionInputs, outputs as productionOutputs } from './build-manifest.mjs';
export const outputs = Object.freeze([
  'main.cjs',
  'renderer.js',
  'index.html',
  'v9.css',
  'demo.css',
]);
export const sources = Object.freeze([
  'demo/main.ts',
  'demo/runtime-contract.ts',
  'demo/renderer.tsx',
  'demo/fixtures.ts',
  'demo/preferences.ts',
  'src/ui/icon-data.ts',
  'src/ui/primary-pages.tsx',
  'src/ui/social-data.ts',
  'src/ui/ui-model.ts',
  'src/ui/ui-shared.tsx',
  'src/ui/ui-shell.tsx',
  'src/ui/work-pages.tsx',
]);
export const inputs = Object.freeze([
  'package.json',
  'package-lock.json',
  'dependency-review.json',
  'biome-review.json',
  'scripts/verify-dependencies.mjs',
  'scripts/quality-tool.mjs',
  'launch/Invoke-Demo.ps1',
  'launch/demo-launch-control.cjs',
  'demo-tsconfig.json',
  'demo-module-map.json',
  'scripts/check-module-graph.mjs',
  'scripts/build-demo.mjs',
  'scripts/demo-build-manifest.mjs',
  'scripts/build-manifest.mjs',
  'assets/v9.css',
  'demo/demo.css',
  ...sources,
]);
const reject = () => {
  throw Error('DEMO_BUILD_REJECTED');
};
export function bytes(file, cap = 8 * 1024 * 1024) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) reject();
  return readFileSync(file);
}
export function digest(file) {
  return createHash('sha256').update(bytes(file)).digest('hex');
}
export function plainDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(path) !== resolve(path))
    reject();
}
export function boundedNames(directory, limit) {
  const handle = opendirSync(directory);
  const names = [];
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) break;
      if (names.length >= limit) reject();
      names.push(entry.name);
    }
  } finally {
    handle.closeSync();
  }
  return names;
}
export function exactInventory(directory, names) {
  plainDirectory(directory);
  const actual = boundedNames(directory, names.length);
  if (
    actual.length !== names.length ||
    JSON.stringify(actual.sort()) !== JSON.stringify([...names].sort())
  )
    reject();
  let total = 0;
  for (const name of actual) {
    total += bytes(resolve(directory, name)).length;
    if (total > 8 * 1024 * 1024) reject();
  }
}
export function createDemoManifest(root) {
  plainDirectory(root);
  for (const directory of new Set(inputs.map((file) => dirname(resolve(root, file)))))
    plainDirectory(directory);
  return {
    version: 1,
    mode: 'DEMO',
    inputs: Object.fromEntries(inputs.map((file) => [file, digest(resolve(root, file))])),
    outputs: Object.fromEntries(
      outputs.map((file) => [file, digest(resolve(root, 'demo-build', file))]),
    ),
  };
}
export function verifyDemoBuild(root) {
  try {
    exactInventory(resolve(root, 'demo-build'), [...outputs, '.verified-demo-build.json']);
    const raw = bytes(resolve(root, 'demo-build/.verified-demo-build.json'), 65536).toString(
      'utf8',
    );
    return raw === JSON.stringify(createDemoManifest(root));
  } catch {
    return false;
  }
}
// Production payloads contain only their exact declared application output files and marker.
// Scan raw bytes, not decoded JSON/JavaScript, so embedded fixture data cannot hide in a bundle.
export function scanProductionPayload(directory) {
  exactInventory(directory, [...productionOutputs, '.verified-build.json']);
  for (const name of [...productionOutputs, '.verified-build.json'])
    scanProductionBytes(bytes(resolve(directory, name)));
  return true;
}
export function scanProductionBytes(value) {
  if (!Buffer.isBuffer(value)) reject();
  for (const token of [
    'FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1',
    'DEMO-DEVICE-',
    'DEMO-ACCOUNT-',
    'DEMO-TARGET-',
    'DEMO-SERIAL-',
    'DEMO-MEDIA-',
    'DEMO-JOB-',
    'demo/fixtures',
    'demo-build/',
    'fonesi.demo.preferences.v1',
  ])
    if (value.includes(Buffer.from(token))) throw Error('PRODUCTION_DEMO_LEAK');
}
export function scanProductionSource(root) {
  for (const file of productionInputs) {
    if (file.split('/').some((part) => part === 'demo' || part === 'demo-build'))
      throw Error('PRODUCTION_DEMO_LEAK');
    scanProductionBytes(bytes(resolve(root, file)));
  }
  return true;
}
