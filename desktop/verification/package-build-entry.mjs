import { closeSync, fsyncSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build-package.mjs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (process.argv.length !== 6) throw Error('PACKAGE_ARGUMENTS');
  const [npmVersion, sourceHead, sourceTree, nodeLicense] = process.argv.slice(2);
  const outputParent = join(desktop, '.package-build');
  const stat = lstatSync(outputParent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync.native(outputParent) !== outputParent
  )
    throw Error('PACKAGE_PARENT');
  if (nodeLicense !== join(outputParent, 'node-LICENSE')) throw Error('PACKAGE_LICENSE');
  const candidate = await buildPackage({
    npmVersion,
    sourceHead,
    sourceTree,
    nodeExe: process.execPath,
    nodeLicense,
    outputParent,
  });
  const fd = openSync(join(outputParent, 'candidate.json'), 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(candidate) + '\n', 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  console.log('PACKAGE_CANDIDATE_WRITTEN');
} catch {
  console.log('PACKAGE_CANDIDATE_FAILED');
  process.exitCode = 1;
}
