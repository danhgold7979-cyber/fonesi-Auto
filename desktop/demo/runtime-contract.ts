import { lstatSync, realpathSync, readFileSync, opendirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
export const DEMO_INPUTS = [
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
] as const;
export const DEMO_URL = 'fonesi-demo://app/index.html';
export const DEMO_OUTPUTS = [
  'main.cjs',
  'renderer.js',
  'index.html',
  'v9.css',
  'demo.css',
] as const;
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
function reject(): never {
  throw new Error('DEMO_ADMISSION_REJECTED');
}
export function plainDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(path) !== resolve(path))
    reject();
}
function names(path: string, cap: number): string[] {
  const directory = opendirSync(path),
    result: string[] = [];
  try {
    for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
      if (result.length >= cap) reject();
      result.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return result;
}
function bytes(path: string, cap: number): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > cap) reject();
  const raw = readFileSync(path);
  if (raw.length > cap) reject();
  return raw;
}
export function admitDemoRuntime(
  input: Readonly<{
    entry: string;
    argv: readonly string[];
    profile: string | undefined;
    platform: string;
    arch: string;
    electron: string | undefined;
    node: string;
    chrome: string | undefined;
    environment: Readonly<Record<string, string | undefined>>;
  }>,
): Readonly<{ profile: string; ownerToken: string; assets: Readonly<Record<string, Buffer>> }> {
  if (
    input.platform !== 'win32' ||
    input.arch !== 'x64' ||
    input.electron !== '45.1.0' ||
    input.node !== '24.22.1' ||
    input.chrome !== '156.0.8078.49' ||
    input.argv.length !== 3 ||
    input.argv[1] !== input.entry ||
    input.argv[2] !== '--demo' ||
    !input.profile ||
    basename(input.entry) !== 'main.cjs'
  )
    reject();
  for (const key of Object.keys(input.environment)) {
    if (
      /electron/i.test(key) ||
      ['NODE_OPTIONS', 'NODE_PATH', 'ESBUILD_BINARY_PATH'].includes(key.toUpperCase())
    )
      reject();
  }
  const output = dirname(input.entry);
  plainDirectory(output);
  const outputNames = names(output, DEMO_OUTPUTS.length + 1);
  if (
    outputNames.length !== DEMO_OUTPUTS.length + 1 ||
    !outputNames.every((name) =>
      [...DEMO_OUTPUTS, '.verified-demo-build.json'].includes(name as never),
    )
  )
    reject();
  const manifestRaw = bytes(join(output, '.verified-demo-build.json'), 65536).toString('utf8');
  const manifest: unknown = JSON.parse(manifestRaw);
  if (JSON.stringify(manifest) !== manifestRaw) reject();
  if (
    !exact(manifest, ['version', 'mode', 'inputs', 'outputs']) ||
    manifest.version !== 1 ||
    manifest.mode !== 'DEMO' ||
    !exact(manifest.outputs, DEMO_OUTPUTS) ||
    !exact(manifest.inputs, DEMO_INPUTS) ||
    !Object.values(manifest.inputs).every(
      (hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash),
    )
  )
    reject();
  const assets: Record<string, Buffer> = Object.create(null);
  let totalBytes = 0;
  for (const name of DEMO_OUTPUTS) {
    const raw = bytes(join(output, name), 8 * 1024 * 1024);
    totalBytes += raw.length;
    if (totalBytes > 8 * 1024 * 1024) reject();
    if (createHash('sha256').update(raw).digest('hex') !== manifest.outputs[name]) reject();
    assets[name] = raw;
  }
  const profile = input.profile,
    owner = dirname(profile);
  plainDirectory(owner);
  if (names(owner, 2).sort().join('|') !== '.demo-owner.json|profile') reject();
  plainDirectory(profile);
  if (basename(profile) !== 'profile' || names(profile, 1).length !== 0) reject();
  const markerRaw = bytes(join(owner, '.demo-owner.json'), 512).toString('utf8');
  const marker: unknown = JSON.parse(markerRaw);
  if (JSON.stringify(marker) !== markerRaw) reject();
  if (
    !exact(marker, ['version', 'kind', 'ownerToken']) ||
    marker.version !== 1 ||
    marker.kind !== 'FONESI_DEMO' ||
    typeof marker.ownerToken !== 'string' ||
    marker.ownerToken.length !== 36 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(marker.ownerToken)
  )
    reject();
  return Object.freeze({ profile, ownerToken: marker.ownerToken, assets: Object.freeze(assets) });
}
