import { verify } from './verify-dependencies.mjs';
import { verifyRuntimeGraph, readMap, validateGraph } from './check-module-graph.mjs';
import {
  sources,
  outputs,
  bytes,
  plainDirectory,
  createDemoManifest,
  verifyDemoBuild,
  scanProductionSource,
  scanProductionPayload,
  boundedNames,
} from './demo-build-manifest.mjs';
import { mkdirSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HTML =
  '<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fonesi-Auto DEMO</title><link rel="stylesheet" href="v9.css"><link rel="stylesheet" href="demo.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>';
export function demoSources(base = root) {
  for (const directory of ['demo', 'src', 'src/ui']) plainDirectory(resolve(base, directory));
  const actual = boundedNames(resolve(base, 'demo'), 6).sort();
  if (
    JSON.stringify(actual) !==
    JSON.stringify([
      'demo.css',
      'fixtures.ts',
      'main.ts',
      'preferences.ts',
      'renderer.tsx',
      'runtime-contract.ts',
    ])
  )
    throw Error('DEMO_SOURCE_INVENTORY');
  return Object.fromEntries(
    sources.map((file) => [file, bytes(resolve(base, file), 1048576).toString('utf8')]),
  );
}
export async function buildDemo(npmVersion) {
  verify(true, npmVersion);
  const source = demoSources();
  const map = readMap(resolve(root, 'demo-module-map.json'));
  await verifyRuntimeGraph(source, map);
  const checked = await validateGraph(source, map);
  scanProductionSource(root);
  scanProductionPayload(resolve(root, 'build'));
  const output = resolve(root, 'demo-build');
  try {
    mkdirSync(output);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  plainDirectory(output);
  for (const name of boundedNames(output, outputs.length + 1)) {
    if (![...outputs, '.verified-demo-build.json'].includes(name))
      throw Error('DEMO_OUTPUT_UNKNOWN');
    bytes(resolve(output, name));
  }
  const marker = resolve(output, '.verified-demo-build.json');
  try {
    lstatSync(marker);
    unlinkSync(marker);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const { build } = await import('esbuild');
  const require = createRequire(resolve(root, 'package.json'));
  const plugin = {
    name: 'closed-demo-source',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          const name = args.path.startsWith('demo-entry:')
            ? args.path.slice('demo-entry:'.length)
            : '';
          if (!Object.hasOwn(source, name)) return { errors: [{ text: 'DEMO_ENTRY_DENIED' }] };
          return { path: name, namespace: 'demo-owned' };
        }
        if (args.namespace !== 'demo-owned') return undefined;
        const edge = checked.parsed[args.importer].find(
          (item) => item.specifier === args.path && Object.values(item.bindings).includes('value'),
        );
        const generated =
          args.path === 'react/jsx-runtime' && map.modules[args.importer].role === 'renderer';
        if (!edge && !generated) return { errors: [{ text: 'DEMO_EDGE_DENIED' }] };
        if (args.path.startsWith('.')) {
          const name = posix
            .normalize(posix.join(posix.dirname(args.importer), args.path))
            .replace(/\.js$/, '.ts');
          if (!Object.hasOwn(source, name)) return { errors: [{ text: 'DEMO_TARGET_DENIED' }] };
          return { path: name, namespace: 'demo-owned' };
        }
        if (['react', 'react-dom/client', 'react/jsx-runtime'].includes(args.path))
          return { path: require.resolve(args.path) };
        return { path: args.path, external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: 'demo-owned' }, (args) => ({
        contents: source[args.path],
        loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
        resolveDir: root,
      }));
    },
  };
  const common = {
    bundle: true,
    write: false,
    sourcemap: false,
    logLevel: 'silent',
    plugins: [plugin],
  };
  const main = await build({
    ...common,
    entryPoints: ['demo-entry:demo/main.ts'],
    platform: 'node',
    target: 'node24',
    format: 'cjs',
  });
  const renderer = await build({
    ...common,
    entryPoints: ['demo-entry:demo/renderer.tsx'],
    platform: 'browser',
    target: 'chrome156',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const data = {
    'main.cjs': main.outputFiles[0]?.contents,
    'renderer.js': renderer.outputFiles[0]?.contents,
    'index.html': Buffer.from(HTML),
    'v9.css': bytes(resolve(root, 'assets/v9.css')),
    'demo.css': bytes(resolve(root, 'demo/demo.css')),
  };
  if (
    main.warnings.length ||
    renderer.warnings.length ||
    main.outputFiles.length !== 1 ||
    renderer.outputFiles.length !== 1
  )
    throw Error('DEMO_BUNDLE_REJECTED');
  for (const name of outputs) {
    const value = data[name];
    if (!value || value.length > 8 * 1024 * 1024) throw Error('DEMO_OUTPUT_REJECTED');
    writeFileSync(resolve(output, name), value);
  }
  writeFileSync(marker, JSON.stringify(createDemoManifest(root)), { flag: 'wx' });
  if (!verifyDemoBuild(root)) {
    unlinkSync(marker);
    throw Error('DEMO_MANIFEST_REJECTED');
  }
  return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw Error('ARGUMENTS');
    await buildDemo(process.argv[2]);
    console.log('DEMO_BUILD_VERIFIED');
  } catch {
    console.log('DEMO_BUILD_FAILED');
    process.exitCode = 1;
  }
}
