import { verifyBuild } from '../scripts/build-manifest.mjs';
import { verify } from '../scripts/verify-dependencies.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, lstatSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root); // NativeProbe deliberately starts in the executable directory.
try {
  if (process.version !== 'v24.22.1' || process.platform !== 'win32' || process.arch !== 'x64' || process.argv.length !== 2) throw new Error('HOST_REJECTED');
  for (const key of Object.keys(process.env)) {
    if (/electron/i.test(key) || ['NODE_OPTIONS','NODE_PATH','ESBUILD_BINARY_PATH'].includes(key)) throw new Error('OVERRIDE_REJECTED');
  }
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npm = spawnSync(process.execPath, [npmCli, '--version'], { shell: false, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
  if (npm.error || npm.status !== 0) throw new Error('NPM_REJECTED');
  verify(true, npm.stdout.trim());
  if (!verifyBuild(root)) throw new Error('BUILD_UNVERIFIED'); // Current source inputs and output hashes.
  console.log('FOUNDATION_BUILD_VERIFIED');
  const cache = join(root, 'node_modules/.electron-cache');
  // install.js otherwise skips archive verification when an old dist merely exists.
  // Refuse old/partial/unknown outputs rather than blessing or deleting them.
  for (const candidate of [join(root, 'node_modules/electron/dist'),
    join(root, 'node_modules/electron/path.txt'), cache]) {
    try { lstatSync(candidate); throw new Error('PREEXISTING_INSTALL_OUTPUT'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  mkdirSync(cache);
  const installed = spawnSync(process.execPath, [join(root, 'node_modules/electron/install.js')], {
    shell: false, stdio: 'inherit', timeout: 110000,
    env: { ...process.env, electron_config_cache: cache },
  });
  if (installed.error || installed.status !== 0) throw new Error('INSTALL_FAILED');
  const dist = join(root, 'node_modules/electron/dist');
  if (readFileSync(join(dist, 'version'), 'utf8').trim().replace(/^v/, '') !== '45.1.0') throw new Error('VERSION_REJECTED');
  for (const name of ['electron.exe','LICENSE','LICENSES.chromium.html']) {
    const stat = lstatSync(join(dist, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) throw new Error('DIST_REJECTED');
  }
  console.log('FOUNDATION_OFFICIAL_INSTALL_VERIFIED');
} catch {
  console.error('FOUNDATION_INSTALL_FAILED');
  process.exitCode = 1;
}
