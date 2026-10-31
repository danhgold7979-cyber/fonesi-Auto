import { verify } from './verify-dependencies.mjs';
import { createManifest, verifyBuild } from './build-manifest.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const output = resolve(root, 'build');
  try { mkdirSync(output); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink() ||
    realpathSync(output) !== resolve(realpathSync(root), 'build')) throw new Error('OUTPUT_REJECTED');
  const marker = resolve(output, '.verified-build.json');
  if (exists(marker)) { if (!lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink()) throw new Error('OUTPUT_REJECTED'); unlinkSync(marker); }
  verify(true, process.argv[2]);
  const { build } = await import('esbuild'); // only after metadata/script/binary verification
  const fixture = readFileSync(resolve(root, 'tests/fixtures/unavailable.html'));
  const hash = createHash('sha256').update(fixture).digest('hex');
  const policy = readFileSync(resolve(root, 'src/main/asset-policy.ts'), 'utf8');
  if (!policy.includes(`ASSET_SHA256 = '${hash}'`)) throw new Error('FIXTURE_CHANGED');
  const options = { bundle: true, platform: 'node', target: 'node24', format: 'cjs',
    sourcemap: false, logLevel: 'silent', write: false };
  const outputs = await build({ ...options, entryPoints: [resolve(root, 'src/main.ts')], external: ['electron'] });
  const pure = await build({ ...options, entryPoints: [resolve(root, 'src/main/asset-policy.ts'), resolve(root, 'src/main/lifecycle.ts'),
    resolve(root, 'src/main/profile-owner.ts'), resolve(root, 'src/main/window-policy.ts')], outdir: output });
  for (const item of [...outputs.outputFiles, ...pure.outputFiles]) {
    const name = item.path === '<stdout>' ? 'main.cjs' : item.path.split(/[\\/]/).at(-1).replace(/\.js$/, '.cjs');
    const file = resolve(output, name);
    if (item.contents.length > 8 * 1024 * 1024 || (exists(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()))) throw new Error('OUTPUT_REJECTED');
    writeFileSync(file, item.contents);
  }
  const asset = resolve(output, 'status.html');
  if (exists(asset) && (!lstatSync(asset).isFile() || lstatSync(asset).isSymbolicLink())) throw new Error('OUTPUT_REJECTED');
  copyFileSync(resolve(root, 'tests/fixtures/unavailable.html'), asset);
  writeFileSync(marker, JSON.stringify(createManifest(root)), { flag: 'wx' });
  if (!verifyBuild(root)) { unlinkSync(marker); throw new Error('BUILD_MANIFEST_FAILED'); }
  console.log('BUILD_VERIFIED');
} catch { console.log('BUILD_FAILED'); process.exitCode = 1; }
function exists(path) { try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
