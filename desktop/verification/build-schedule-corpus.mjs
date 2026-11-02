import { readFileSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verify } from '../scripts/verify-dependencies.mjs';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const INPUTS = Object.freeze([
  'verification/schedule-candidate-corpus.ts',
  'src/schedule-civil-contract.ts',
  'src/schedule-zone-contract.ts',
  'src/schedule-gap-contract.ts',
  'node_modules/@js-temporal/polyfill/dist/index.esm.js',
  'node_modules/jsbi/dist/jsbi-cjs.js',
]);
export async function compileCorpus() {
  verify(true, '11.9.0');
  const { build } = await import('esbuild');
  const files = [];
  let closure = null;
  for (const [name, flag] of [
    ['candidate.cjs', 'true'],
    ['production.cjs', 'false'],
  ]) {
    const out = await build({
      absWorkingDir: desktop,
      entryPoints: ['verification/schedule-candidate-corpus.ts'],
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      write: false,
      sourcemap: false,
      logLevel: 'silent',
      metafile: true,
      define: { __SCHEDULE_ELECTRON_CANDIDATE__: flag },
    });
    const names = Object.keys(out.metafile.inputs).sort();
    if (
      JSON.stringify(names) !== JSON.stringify([...INPUTS].sort()) ||
      out.outputFiles.length !== 1
    )
      throw Error('CORPUS_BUILD_CLOSURE');
    for (const input of Object.values(out.metafile.inputs))
      for (const imp of input.imports) {
        if (imp.external && !['node:crypto', 'node:process'].includes(imp.path))
          throw Error('CORPUS_BUILD_EXTERNAL');
      }
    const inputs = names.map((path) => {
      const full = resolve(desktop, path),
        s = lstatSync(full);
      if (!s.isFile() || s.isSymbolicLink() || s.size > 1048576) throw Error('CORPUS_BUILD_INPUT');
      return { path, sha256: sha(readFileSync(full)) };
    });
    if (closure && JSON.stringify(inputs) !== JSON.stringify(closure))
      throw Error('CORPUS_BUILD_MUTATION');
    closure = inputs;
    const bytes = out.outputFiles[0].contents;
    if (bytes.length > 450000) throw Error('CORPUS_BUILD_LIMIT');
    files.push({ name, bytes, sha256: sha(bytes) });
  }
  return { files, inputs: closure };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('CORPUS_BUILD_ARGS');
    const target = resolve(desktop, '.schedule-corpus-build');
    mkdirSync(target);
    const result = await compileCorpus();
    for (const file of result.files)
      writeFileSync(resolve(target, file.name), file.bytes, { flag: 'wx' });
    writeFileSync(
      resolve(target, 'manifest.json'),
      JSON.stringify({
        version: 1,
        inputs: result.inputs,
        files: result.files.map(({ name, sha256, bytes }) => ({
          name,
          sha256,
          bytes: bytes.length,
        })),
      }),
      { flag: 'wx' },
    );
    console.log('SCHEDULE_CORPUS_BUILD_PASS');
  } catch {
    console.log('SCHEDULE_CORPUS_BUILD_FAILED');
    process.exitCode = 1;
  }
}
