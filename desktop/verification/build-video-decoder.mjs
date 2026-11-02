// Compile the fixed verification-only main; never execute Electron or device code.
import { verify } from '../scripts/verify-dependencies.mjs';
import { verifyBuild } from '../scripts/build-manifest.mjs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lstatSync, mkdirSync, realpathSync, writeFileSync, readFileSync } from 'node:fs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  if (process.argv.length !== 3) throw Error();
  verify(true, process.argv[2]);
  if (!verifyBuild(desktop)) throw Error();
  const out = resolve(desktop, '.test-output', 'video-decoder-build');
  mkdirSync(out, { recursive: true });
  for (let p = out; p !== desktop; p = dirname(p)) {
    if (!lstatSync(p).isDirectory() || lstatSync(p).isSymbolicLink() || realpathSync(p) !== p)
      throw Error();
  }
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: [resolve(desktop, 'verification/video-decoder-probe.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron'],
    metafile: true,
    absWorkingDir: desktop,
    write: false,
    logLevel: 'silent',
  });
  if (result.outputFiles.length !== 1 || result.outputFiles[0].contents.length > 1048576)
    throw Error();
  const file = resolve(out, 'probe.cjs');
  try {
    const s = lstatSync(file);
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw Error();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  writeFileSync(file, result.outputFiles[0].contents);
  const digest = (b) => createHash('sha256').update(b).digest('hex');
  const inputs = Object.fromEntries(
    Object.keys(result.metafile.inputs)
      .sort()
      .map((name) => {
        if (!/^(src|verification)\/[a-zA-Z0-9/_.-]+\.(ts|mjs)$/.test(name) || name.includes('..'))
          throw Error();
        return [name, digest(readFileSync(resolve(desktop, name)))];
      }),
  );
  const proofPath = resolve(out, 'proof.json');
  try {
    const s = lstatSync(proofPath);
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw Error();
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  writeFileSync(
    proofPath,
    JSON.stringify({
      version: 1,
      productionManifest: digest(readFileSync(resolve(desktop, 'build/.verified-build.json'))),
      inputs,
      output: digest(result.outputFiles[0].contents),
    }),
  );
  console.log('VIDEO_DECODER_BUILD_PASS');
} catch {
  console.error('VIDEO_DECODER_BUILD_FAIL');
  process.exitCode = 1;
}
