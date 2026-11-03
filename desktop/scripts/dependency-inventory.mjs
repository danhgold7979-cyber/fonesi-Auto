import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { verify } from './verify-dependencies.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = Object.freeze([
  ['package.json', 16384],
  ['package-lock.json', 131072],
  ['dependency-review.json', 262144],
]);
const ADMISSION_INPUTS = Object.freeze([
  ['biome-review.json', 65536],
  ['../tools/phase-00/desktop-stack-lab/package-lock.json', 131072],
  ['../tools/phase-00/desktop-stack-lab/dependency-review.json', 262144],
]);
const OUTPUT_LIMIT = 262144;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
const reject = () => {
  throw new Error('DEPENDENCY_INVENTORY_REJECTED');
};
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
function parse(text, limit) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > limit) reject();
  try {
    const value = JSON.parse(text);
    if (!record(value)) reject();
    return value;
  } catch {
    return reject();
  }
}
function flag(item, key) {
  if (!Object.hasOwn(item, key)) return false;
  if (typeof item[key] !== 'boolean') reject();
  return item[key];
}
function platforms(item, key) {
  if (!Object.hasOwn(item, key)) return null;
  const values = item[key];
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 32 ||
    values.some((value) => typeof value !== 'string' || !/^!?[a-z0-9_-]{1,32}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    reject();
  return [...values].sort();
}
function packageName(path) {
  if (typeof path !== 'string' || path.length > 512 || !path.startsWith('node_modules/')) reject();
  const names = path.slice(13).split('/node_modules/');
  if (names.length > 8 || names.some((name) => name.length > 214 || !NAME.test(name))) reject();
  return names.at(-1);
}
function requirementMap(value) {
  if (value === undefined) return {};
  if (!record(value) || Object.keys(value).length > 128) reject();
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((name) => {
        const range = value[name];
        if (
          name.length > 214 ||
          !NAME.test(name) ||
          typeof range !== 'string' ||
          range.length < 1 ||
          range.length > 128 ||
          !/^[0-9A-Za-z.*~^<>=| -]+$/.test(range)
        )
          reject();
        return [name, range];
      }),
  );
}
// This pure projection does not confer trust. The CLI separately invokes existing admission.
export function renderDependencyInventory(manifestText, lockText, reviewText) {
  const texts = [manifestText, lockText, reviewText];
  const [manifest, lock, review] = texts.map((text, i) => parse(text, INPUTS[i][1]));
  if (
    !isDeepStrictEqual(manifest, review.manifest) ||
    !isDeepStrictEqual(lock, review.lock) ||
    lock.lockfileVersion !== 3 ||
    lock.requires !== true ||
    !record(lock.packages) ||
    !record(review.packages) ||
    !record(lock.packages['']) ||
    manifest.name !== lock.name ||
    manifest.version !== lock.version ||
    manifest.name !== lock.packages[''].name ||
    manifest.version !== lock.packages[''].version ||
    typeof manifest.name !== 'string' ||
    manifest.name.length > 214 ||
    !NAME.test(manifest.name) ||
    typeof manifest.version !== 'string' ||
    !VERSION.test(manifest.version) ||
    manifest.private !== true
  )
    reject();
  for (const kind of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    if (!isDeepStrictEqual(manifest[kind], lock.packages[''][kind])) reject();
    requirementMap(manifest[kind]);
  }
  const paths = Object.keys(lock.packages)
    .filter((path) => path !== '')
    .sort();
  if (
    paths.length < 1 ||
    paths.length > 128 ||
    !isDeepStrictEqual(paths, Object.keys(review.packages).sort())
  )
    reject();
  const packages = paths.map((path) => {
    const name = packageName(path),
      item = lock.packages[path],
      expected = review.packages[path];
    if (!record(item) || !record(expected)) reject();
    for (const field of ['version', 'resolved', 'integrity', 'license'])
      if (item[field] !== expected[field]) reject();
    if (
      typeof item.version !== 'string' ||
      item.version.length > 128 ||
      !VERSION.test(item.version) ||
      typeof item.integrity !== 'string' ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.integrity) ||
      Buffer.from(item.integrity.slice(7), 'base64').toString('base64') !==
        item.integrity.slice(7) ||
      !['MIT', 'ISC', 'Apache-2.0', 'MIT OR Apache-2.0'].includes(item.license)
    )
      reject();
    const artifact = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${item.version}.tgz`;
    if (item.resolved !== artifact) reject();
    return {
      lockPath: path,
      name,
      version: item.version,
      registryArtifact: artifact,
      integrity: item.integrity,
      declaredLicense: item.license,
      development: flag(item, 'dev'),
      optional: flag(item, 'optional'),
      os: platforms(item, 'os'),
      cpu: platforms(item, 'cpu'),
      declaredRequirements: {
        dependencies: requirementMap(item.dependencies),
        optionalDependencies: requirementMap(item.optionalDependencies),
        peerDependencies: requirementMap(item.peerDependencies),
      },
    };
  });
  const result =
    JSON.stringify(
      {
        kind: 'FONESI_AUTO_NPM_LOCK_INVENTORY',
        schemaVersion: 1,
        scope: 'DESKTOP_NPM_LOCK_RESOLUTION_ONLY',
        limitations: [
          'Lock resolution is not installed-host or shipped-product inventory.',
          'Declared licenses do not replace license texts, notices or legal review.',
          'This projection asserts no signature/advisory verification or release acceptance.',
          'Bundled runtimes, transitive runtime components and models are outside this inventory.',
          'Input digests identify projection inputs, not all existing admission dependencies.',
          'Declared dependency ranges are not a resolved dependency graph.',
        ],
        inputs: INPUTS.map(([path], i) => ({ path: `desktop/${path}`, sha256: sha(texts[i]) })),
        project: { name: manifest.name, version: manifest.version, private: true },
        packageCount: packages.length,
        packages,
      },
      null,
      2,
    ) + '\n';
  if (Buffer.byteLength(result, 'utf8') > OUTPUT_LIMIT) reject();
  return result;
}
export function matchesDependencyInventory(expected, actual) {
  return (
    typeof expected === 'string' &&
    typeof actual === 'string' &&
    Buffer.byteLength(expected, 'utf8') <= OUTPUT_LIMIT &&
    Buffer.byteLength(actual, 'utf8') <= OUTPUT_LIMIT &&
    expected === actual
  );
}
function readFixed(path, limit) {
  const file = resolve(root, path),
    stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) reject();
  const bytes = readFileSync(file);
  if (bytes.length > limit) reject();
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
export function admittedDependencyInventory(npmVersion) {
  const texts = INPUTS.map(([path, limit]) => readFixed(path, limit));
  for (const [path, limit] of ADMISSION_INPUTS) parse(readFixed(path, limit), limit);
  // Do not add an alternate admission or install/execute any dependency here.
  verify(false, npmVersion);
  return renderDependencyInventory(...texts);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !['--json', '--check'].includes(process.argv[2])) reject();
    const expected = admittedDependencyInventory(process.argv[3]);
    if (process.argv[2] === '--json') process.stdout.write(expected);
    else {
      if (
        !matchesDependencyInventory(expected, readFixed('dependency-inventory.json', OUTPUT_LIMIT))
      )
        reject();
      console.log('DEPENDENCY_INVENTORY_PASS');
    }
  } catch {
    console.log('DEPENDENCY_INVENTORY_FAILED');
    process.exitCode = 1;
  }
}
