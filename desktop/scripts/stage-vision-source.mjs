// Source-owned materialization step, not a runtime/model launch. Native staging
// custody must be held by the supervising harness for this entire process.
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  constants,
  copyFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-dependencies.mjs';
import { verifyBuild } from './build-manifest.mjs';

const ROOT = 'D:\\a\\_temp\\fonesi-p4-windows-candidate-v1';
const NODE_SHA256 = 'd702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function sourceStagePolicy(v) {
  return (
    v.platform === 'win32' &&
    v.arch === 'x64' &&
    v.node === '24.22.1' &&
    v.root === ROOT &&
    v.overrides === false &&
    v.build === true &&
    v.argv === 3 &&
    v.nodeHash === NODE_SHA256
  );
}
function exactDirectory(path) {
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync.native(path) !== path)
    throw Error('STAGING_PATH');
}
export async function stageSource(npmVersion) {
  const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (
    !sourceStagePolicy({
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      root: ROOT,
      argv: process.argv.length,
      overrides: ['NODE_OPTIONS', 'NODE_PATH', 'ESBUILD_BINARY_PATH'].some(
        (key) => process.env[key] !== undefined,
      ),
      build: verifyBuild(desktop),
      nodeHash: hash(readFileSync(process.execPath)),
    })
  )
    throw Error('STAGING_POLICY');
  exactDirectory('D:\\a');
  exactDirectory('D:\\a\\_temp');
  exactDirectory(ROOT);
  verify(true, npmVersion);
  const { build } = await import('esbuild');
  const result = await build({
    absWorkingDir: desktop,
    entryPoints: [join(desktop, 'verification/vision-qualification-fixture.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    write: false,
    sourcemap: false,
    legalComments: 'inline',
    logLevel: 'silent',
    metafile: true,
  });
  if (
    result.outputFiles.length !== 1 ||
    result.outputFiles[0].contents.length > 1048576 ||
    Object.keys(result.metafile.inputs).length > 16
  )
    throw Error('BUNDLE_LIMIT');
  const source = join(ROOT, 'source'),
    tooling = join(ROOT, 'tooling');
  mkdirSync(source);
  mkdirSync(tooling);
  exactDirectory(source);
  exactDirectory(tooling);
  const files = [
    ['preprocess_worker.py', join(desktop, 'vision/preprocess_worker.py')],
    ['ocr_windows_worker.py', join(desktop, 'vision/ocr_windows_worker.py')],
    ['ocr_evaluation_metrics.py', join(desktop, 'verification/ocr_evaluation_metrics.py')],
  ];
  const output = [];
  for (const [name, path] of files) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576) throw Error('SOURCE_PATH');
    const bytes = readFileSync(path);
    writeFileSync(join(source, name), bytes, { flag: 'wx' });
    output.push({ path: 'source/' + name, sha256: hash(bytes) });
  }
  const bundle = result.outputFiles[0].contents;
  writeFileSync(join(source, 'vision-qualification-fixture.mjs'), bundle, { flag: 'wx' });
  output.push({ path: 'source/vision-qualification-fixture.mjs', sha256: hash(bundle) });
  copyFileSync(process.execPath, join(tooling, 'node.exe'), constants.COPYFILE_EXCL);
  if (hash(readFileSync(join(tooling, 'node.exe'))) !== NODE_SHA256) throw Error('TOOL_CHANGED');
  output.push({ path: 'tooling/node.exe', sha256: NODE_SHA256 });
  return { version: 1, scope: 'SOURCE_STAGING_ONLY', files: output };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify(await stageSource(process.argv[2])) + '\n');
  } catch {
    process.stderr.write('VISION_SOURCE_STAGING_UNAVAILABLE\n');
    process.exitCode = 1;
  }
}
