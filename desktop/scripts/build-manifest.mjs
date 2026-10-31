import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const outputs = [
  'main.cjs',
  'asset-policy.cjs',
  'lifecycle.cjs',
  'profile-owner.cjs',
  'window-policy.cjs',
  'foundation-bridge.cjs',
  'ipc-contract.cjs',
  'preload.cjs',
  'renderer.js',
  'status.html',
];
export const inputs = [
  'package.json',
  'package-lock.json',
  'dependency-review.json',
  'tsconfig.json',
  'src/main.ts',
  'src/foundation-bridge.ts',
  'src/ipc-contract.ts',
  'src/view-session.ts',
  'src/preload-client.ts',
  'src/preload.ts',
  'src/renderer.tsx',
  'src/main/asset-policy.ts',
  'src/main/lifecycle.ts',
  'src/main/profile-owner.ts',
  'src/main/window-policy.ts',
  'tests/fixtures/unavailable.html',
  'scripts/build.mjs',
  'scripts/build-manifest.mjs',
];
export function digest(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024)
    throw new Error('BUILD_FILE_REJECTED');
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
export function createManifest(root) {
  return {
    schema: 1,
    inputs: Object.fromEntries(inputs.map((file) => [file, digest(resolve(root, file))])),
    outputs: Object.fromEntries(
      outputs.map((file) => [file, digest(resolve(root, 'build', file))]),
    ),
  };
}
export function verifyBuild(root) {
  try {
    const file = resolve(root, 'build/.verified-build.json');
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 65536 || stat.isSymbolicLink()) return false;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    return JSON.stringify(manifest) === JSON.stringify(createManifest(root));
  } catch {
    return false;
  }
}
