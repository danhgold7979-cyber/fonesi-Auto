import { readFileSync, lstatSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const hooks = [
  'preinstall',
  'install',
  'postinstall',
  'preprepare',
  'prepare',
  'postprepare',
  'prepublish',
  'prepublishOnly',
];
export function verify(installed, npmVersion) {
  if (process.version !== 'v24.22.1' || !['11.9.0', '11.19.1'].includes(npmVersion))
    throw new Error('RUNTIME_MISMATCH');
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'ESBUILD_BINARY_PATH',
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_FORCE_IS_PACKAGED',
  ])
    if (process.env[key] !== undefined) throw new Error('OVERRIDE_REJECTED');
  const review = json('dependency-review.json'),
    lock = json('package-lock.json');
  if (
    !isDeepStrictEqual(lock, review.lock) ||
    !isDeepStrictEqual(json('package.json'), review.manifest)
  )
    throw new Error('METADATA_MISMATCH');
  const biomeReview = json('biome-review.json');
  if (sha(resolve(root, 'biome-review.json')) !== review.biomeReviewSha256)
    throw new Error('TOOL_REVIEW_CHANGED');
  const previous = resolve(root, '../tools/phase-00/desktop-stack-lab');
  if (
    sha(resolve(previous, 'package-lock.json')) !== review.sourceLockSha256 ||
    sha(resolve(previous, 'dependency-review.json')) !== review.sourceReviewSha256
  )
    throw new Error('PROVENANCE_MISMATCH');
  for (const [name, item] of Object.entries(lock.packages)) {
    if (!name) continue;
    const expected = review.packages[name];
    for (const field of ['version', 'resolved', 'integrity', 'license'])
      if (item[field] !== expected?.[field]) throw new Error('UNREVIEWED_DEPENDENCY');
    const biomeName = name.slice('node_modules/'.length);
    const reviewedBiome =
      Object.hasOwn(biomeReview.packages, biomeName) &&
      item.version === '2.6.4' &&
      item.license === 'MIT OR Apache-2.0' &&
      item.integrity === biomeReview.packages[biomeName].dist.integrity &&
      item.resolved === biomeReview.packages[biomeName].dist.tarball;
    if (
      !item.resolved.startsWith('https://registry.npmjs.org/') ||
      !item.integrity.startsWith('sha512-') ||
      (!['MIT', 'ISC', 'Apache-2.0'].includes(item.license) && !reviewedBiome)
    )
      throw new Error('UNREVIEWED_DEPENDENCY');
    if (!installed) continue;
    const file = resolve(root, name, 'package.json');
    // Registry entries omit libc constraints; npm declared os/cpu applicability stays.
    // The native launcher separately refuses non-glibc Linux and never selects musl.
    const applicable =
      (!item.os || item.os.includes(process.platform)) &&
      (!item.cpu || item.cpu.includes(process.arch));
    if (!existsSync(file)) {
      if (item.optional && !applicable) continue;
      throw new Error('MISSING_PACKAGE');
    }
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())
      throw new Error('PACKAGE_PATH_REJECTED');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    if (manifest.version !== item.version) throw new Error('INSTALLED_VERSION_MISMATCH');
    const presentHooks = Object.fromEntries(
      hooks
        .filter((hook) => Object.hasOwn(manifest.scripts ?? {}, hook))
        .map((hook) => [hook, manifest.scripts[hook]]),
    );
    if (!isDeepStrictEqual(presentHooks, review.neverExecutedLifecycleCommands[name] ?? {}))
      throw new Error('UNREVIEWED_HOOK');
  }
  if (installed) {
    for (const [file, expected] of Object.entries(review.reviewedFiles))
      if (sha(resolve(root, file)) !== expected) throw new Error('REVIEWED_FILE_CHANGED');
    if (process.arch !== 'x64' || !['linux', 'win32'].includes(process.platform))
      throw new Error('UNTESTED_TOOL_HOST');
    const pkg = process.platform === 'win32' ? '@esbuild/win32-x64' : '@esbuild/linux-x64';
    const sub = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild';
    const expected = json('node_modules/esbuild/package.json')['esbuild.binaryHashes'][
      `${pkg}/${sub}`
    ];
    if (sha(resolve(root, 'node_modules', pkg, sub)) !== expected)
      throw new Error('BUILD_BINARY_MISMATCH');
  }
  return Object.keys(review.packages).length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !['--metadata', '--installed'].includes(process.argv[2]))
      throw new Error('ARGUMENTS_REJECTED');
    console.log(
      `DEPENDENCIES_VERIFIED ${verify(process.argv[2] === '--installed', process.argv[3])}`,
    );
  } catch {
    console.log('DEPENDENCY_CHECK_FAILED');
    process.exitCode = 1;
  }
}
