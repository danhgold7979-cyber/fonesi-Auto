import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admittedDependencyInventory, renderDependencyInventory } from './dependency-inventory.mjs';
import { TOOL_LICENSE_PROVENANCE } from './reviewed-tool-license-pins.mjs';
import { REACT_LICENSE_SHA, TIMEZONE_LICENSES } from './package-manifest.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 32768;
const OUTPUT_LIMIT = 262144;
const INPUTS = [
  ['package.json', 16384],
  ['package-lock.json', 131072],
  ['dependency-review.json', 262144],
];
const FILES = [
  [
    '@js-temporal/polyfill',
    TIMEZONE_LICENSES['js-temporal-polyfill'],
    'TIMEZONE_LICENSES.js-temporal-polyfill',
  ],
  ['jsbi', TIMEZONE_LICENSES.jsbi, 'TIMEZONE_LICENSES.jsbi'],
  ['react', REACT_LICENSE_SHA, 'REACT_LICENSE_SHA'],
  ['react-dom', REACT_LICENSE_SHA, 'REACT_LICENSE_SHA'],
  ['scheduler', REACT_LICENSE_SHA, 'REACT_LICENSE_SHA'],
].map(([name, expected, pin]) => ({
  name,
  expected,
  path: `node_modules/${name}/LICENSE`,
  limit: LIMIT,
  pinSource: `desktop/launch/package-admission.cjs#${pin}`,
}));
for (const artifact of JSON.parse(TOOL_LICENSE_PROVENANCE).artifacts) {
  for (const text of artifact.texts) {
    FILES.push({
      name: artifact.name,
      expected: text.sha256,
      path: `${artifact.lockPath}/${text.archiveMember.slice('package/'.length)}`,
      limit: text.readLimitBytes,
      size: text.sizeBytes,
      artifact,
      archiveMember: text.archiveMember,
      pinSource: 'desktop/scripts/reviewed-tool-license-pins.mjs#TOOL_LICENSE_PROVENANCE',
    });
  }
}
const reject = () => {
  throw new Error('REVIEWED_LICENSE_EVIDENCE_REJECTED');
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function decode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return reject();
  }
}
function identity(a, b) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeMs === b.mtimeMs &&
    a.ctimeMs === b.ctimeMs
  );
}
// Exported solely for fixture tests; production calls use only the fixed relative paths below.
export function readEvidenceFile(base, name, limit) {
  if (
    typeof name !== 'string' ||
    !/^[A-Za-z0-9@._/-]+$/.test(name) ||
    name.split('/').some((part) => !part || part === '.' || part === '..') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > OUTPUT_LIMIT
  )
    reject();
  let current = resolve(base);
  const baseStat = lstatSync(current);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) reject();
  const parts = name.split('/');
  for (const part of parts.slice(0, -1)) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject();
  }
  const file = resolve(current, parts.at(-1)),
    before = lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > limit)
    reject();
  const fd = openSync(file, 'r');
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || !identity(before, opened)) reject();
    const bytes = Buffer.alloc(limit + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    const after = lstatSync(file);
    if (
      size !== before.size ||
      size > limit ||
      !identity(before, fstatSync(fd)) ||
      after.isSymbolicLink() ||
      !identity(before, after)
    )
      reject();
    const result = bytes.subarray(0, size);
    decode(result);
    return result;
  } finally {
    closeSync(fd);
  }
}
// Pure rendering is not admission. The CLI separately invokes existing inventory admission.
export function renderReviewedLicenseEvidence(manifest, lock, review, licenses) {
  const inventoryText = renderDependencyInventory(manifest, lock, review);
  const inventory = JSON.parse(inventoryText),
    reviewedFiles = JSON.parse(review).reviewedFiles;
  if (!Array.isArray(licenses) || licenses.length !== FILES.length) reject();
  const collected = FILES.map((file, index) => {
    const { name, expected, path, limit, pinSource } = file;
    const input = licenses[index];
    if (!input || typeof input !== 'object') reject();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(descriptors).length !== 2 ||
      !Object.hasOwn(descriptors, 'path') ||
      !Object.hasOwn(descriptors, 'bytes') ||
      !Object.hasOwn(descriptors.path, 'value') ||
      !Object.hasOwn(descriptors.bytes, 'value') ||
      descriptors.path.value !== path ||
      !Buffer.isBuffer(descriptors.bytes.value) ||
      descriptors.bytes.value.length < 1 ||
      descriptors.bytes.value.length > limit
    )
      reject();
    // One owned snapshot supplies the decoded text, digest and byte count together.
    const bytes = Buffer.from(descriptors.bytes.value);
    const text = decode(bytes);
    if (sha(bytes) !== expected || (index < 2 && reviewedFiles?.[path] !== expected)) reject();
    const matches = inventory.packages.filter(
      (item) => item.lockPath === `node_modules/${name}` && item.name === name,
    );
    if (matches.length !== 1) reject();
    if (file.artifact) {
      if (bytes.length !== file.size) reject();
      for (const key of ['name', 'version', 'registryArtifact', 'integrity', 'declaredLicense'])
        if (matches[0][key] !== file.artifact[key]) reject();
    }
    return {
      lockPath: matches[0].lockPath,
      path: `desktop/${path}`,
      sha256: expected,
      bytes: bytes.length,
      pinSource,
      archiveMember: file.archiveMember ?? null,
      text,
    };
  });
  const packages = inventory.packages.map((item) => {
    const evidence = collected.filter((entry) => entry.lockPath === item.lockPath);
    return {
      lockPath: item.lockPath,
      name: item.name,
      version: item.version,
      registryArtifact: item.registryArtifact,
      integrity: item.integrity,
      declaredLicense: item.declaredLicense,
      status: evidence.length ? 'COLLECTED_REVIEWED_TEXT' : 'NOT_COLLECTED_BY_THIS_TOOL',
      licenseTexts: evidence.map((entry) => ({
        path: entry.path,
        sha256: entry.sha256,
        bytes: entry.bytes,
        pinSource: entry.pinSource,
        archiveMember: entry.archiveMember,
      })),
    };
  });
  const limitations = [
    'Only twelve fixed reviewed texts across eight package rows are collected; other entries are not assessed by this tool.',
    'This is not complete third-party notices, installed-host or shipped-product inventory, or a full SBOM.',
    'Text and lock metadata do not establish redistribution approval, legal clearance or release acceptance.',
    'Lock identities are not verification of whole installed package contents or source-repository attribution.',
    'Bundled runtimes, models, additional notices and license obligations remain outside this slice.',
    'Tool artifact rehash and member equality are recorded research, not archive or signature verification by this CLI.',
    'Biome alternatives and Rome attribution are retained without selecting a license option.',
    'The nested vscode-jsonrpc text is a TypeScript artifact member, not a separately resolved package.',
    'Digests bind collected bytes and projection inputs, not every existing admission dependency.',
  ];
  const notice =
    'FONESI-AUTO REVIEWED LICENSE TEXT EVIDENCE\nDEVELOPMENT EVIDENCE ONLY\n\n' +
    limitations.join('\n') +
    '\n\n' +
    collected
      .map(
        (item) =>
          `=== ${item.lockPath} ===\nSource: ${item.path}\nSHA256: ${item.sha256}\nBytes: ${item.bytes}\nBEGIN EXACT TEXT\n${item.text}\nEND EXACT TEXT\n`,
      )
      .join('\n');
  const json =
    JSON.stringify(
      {
        kind: 'FONESI_AUTO_REVIEWED_LICENSE_TEXT_EVIDENCE',
        schemaVersion: 2,
        scope: 'TWELVE_FIXED_REVIEWED_NPM_LICENSE_TEXTS_ONLY',
        limitations,
        inputs: inventory.inputs,
        inventory: { path: 'desktop/dependency-inventory.json', sha256: sha(inventoryText) },
        notices: {
          path: 'desktop/reviewed-license-notices.txt',
          sha256: sha(notice),
          bytes: Buffer.byteLength(notice),
        },
        toolProvenance: {
          path: 'desktop/reviewed-tool-license-provenance.json',
          sha256: sha(TOOL_LICENSE_PROVENANCE),
        },
        packageCount: packages.length,
        collectedPackageCount: packages.filter((item) => item.licenseTexts.length > 0).length,
        collectedTextCount: collected.length,
        notCollectedPackageCount: packages.filter((item) => item.licenseTexts.length === 0).length,
        packages,
      },
      null,
      2,
    ) + '\n';
  if ([json, notice].some((text) => Buffer.byteLength(text) > OUTPUT_LIMIT)) reject();
  return { json, notice };
}
export function admittedReviewedLicenseEvidence(npmVersion) {
  const inventory = admittedDependencyInventory(npmVersion);
  const inputs = INPUTS.map(([path, limit]) => decode(readEvidenceFile(root, path, limit)));
  if (
    renderDependencyInventory(...inputs) !== inventory ||
    decode(readEvidenceFile(root, 'dependency-inventory.json', OUTPUT_LIMIT)) !== inventory
  )
    reject();
  if (
    decode(readEvidenceFile(root, 'reviewed-tool-license-provenance.json', 16384)) !==
    TOOL_LICENSE_PROVENANCE
  )
    reject();
  const licenses = FILES.map(({ path, limit }) => ({
    path,
    bytes: readEvidenceFile(root, path, limit),
  }));
  return renderReviewedLicenseEvidence(...inputs, licenses);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || !['--json', '--notice', '--check'].includes(process.argv[2]))
      reject();
    const output = admittedReviewedLicenseEvidence(process.argv[3]);
    if (process.argv[2] === '--json') process.stdout.write(output.json);
    else if (process.argv[2] === '--notice') process.stdout.write(output.notice);
    else {
      for (const [key, path] of [
        ['json', 'reviewed-license-evidence.json'],
        ['notice', 'reviewed-license-notices.txt'],
      ])
        if (decode(readEvidenceFile(root, path, OUTPUT_LIMIT)) !== output[key]) reject();
      console.log('REVIEWED_LICENSE_EVIDENCE_PASS');
    }
  } catch {
    console.log('REVIEWED_LICENSE_EVIDENCE_FAILED');
    process.exitCode = 1;
  }
}
