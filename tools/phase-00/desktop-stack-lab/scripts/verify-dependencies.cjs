const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lock = require('../package-lock.json');
const root = path.resolve(__dirname, '..');
let count = 0;
for (const [name, item] of Object.entries(lock.packages)) {
  if (!name) continue;
  if (!item.resolved?.startsWith('https://registry.npmjs.org/') || !item.integrity?.startsWith('sha512-') ||
      !['MIT', 'ISC', 'Apache-2.0'].includes(item.license)) throw new Error('UNREVIEWED_DEPENDENCY');
  if (item.hasInstallScript && name !== 'node_modules/esbuild') throw new Error('UNREVIEWED_LIFECYCLE');
  count++;
}
if (process.env.ESBUILD_BINARY_PATH) throw new Error('UNREVIEWED_BINARY_OVERRIDE');
const pkg = process.platform === 'win32' ? '@esbuild/win32-x64' : '@esbuild/linux-x64';
const sub = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild';
if (process.arch !== 'x64' || !['win32','linux'].includes(process.platform)) throw new Error('UNTESTED_LAB_HOST');
const bytes = fs.readFileSync(path.join(root, 'node_modules', pkg, sub));
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
if (hash !== require('esbuild/package.json')['esbuild.binaryHashes'][`${pkg}/${sub}`]) throw new Error('BINARY_HASH_MISMATCH');
console.log(JSON.stringify({lockedPackages:count, origins:'npm-registry-only', lifecycle:'disabled', esbuildSha256:hash}));
const review = require('../dependency-review.json');
for (const [name, expected] of Object.entries(review.packages)) {
  const actual = lock.packages[name];
  if (!actual || actual.version !== expected.version || actual.integrity !== expected.integrity ||
      actual.resolved !== expected.resolved || actual.license !== expected.license) throw new Error('REVIEW_LOCK_MISMATCH');
}
if (Object.keys(review.packages).length !== count) throw new Error('UNREVIEWED_LOCK_ADDITION');
for (const [file, expected] of Object.entries(review.reviewedFiles)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex') !== expected)
    throw new Error('REVIEWED_FILE_CHANGED');
}
