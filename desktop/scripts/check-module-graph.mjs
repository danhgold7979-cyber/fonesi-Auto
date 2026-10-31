// Development import policy, not a runtime capability sandbox.
import { readFileSync, lstatSync, readdirSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from './verify-dependencies.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reject = (code) => {
  throw new Error(code);
};
let scannerModule;
export async function sourceImports(source, syntax = 'ts') {
  if (!['ts', 'tsx'].includes(syntax)) reject('LEXICAL_UNSUPPORTED');
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1048576) reject('SOURCE_LIMIT');
  if (/@ts-(?:ignore|nocheck|expect-error)|<reference\b/.test(source)) reject('DIRECTIVE_REJECTED');
  scannerModule ??= await import('typescript/unstable/ast');
  const { createScanner, SyntaxKind: K, LanguageVariant } = scannerModule;
  const scanner = createScanner(false, LanguageVariant.Standard, source);
  const tokens = [];
  const trivia = new Set([
    K.WhitespaceTrivia,
    K.NewLineTrivia,
    K.SingleLineCommentTrivia,
    K.MultiLineCommentTrivia,
  ]);
  const regexAfter = new Set([
    K.EqualsToken,
    K.OpenParenToken,
    K.CommaToken,
    K.ReturnKeyword,
    K.OpenBracketToken,
    K.ColonToken,
    K.AmpersandAmpersandToken,
    K.BarBarToken,
    K.ExclamationToken,
    K.QuestionToken,
  ]);
  const templates = [];
  // Standard scanning cannot distinguish all JSX text from lexical data.
  // Deliberately reject code-like opaque spans, rather than claim full JSX parsing.
  const opaque = new Set([
    K.StringLiteral,
    K.NoSubstitutionTemplateLiteral,
    K.TemplateHead,
    K.TemplateMiddle,
    K.TemplateTail,
    K.SingleLineCommentTrivia,
    K.MultiLineCommentTrivia,
    K.RegularExpressionLiteral,
  ]);
  function rejectOpaque(kind) {
    if (!opaque.has(kind)) return;
    const decoded = scanner
      .getTokenText()
      .replace(/\\u(?:\{([0-9a-fA-F]{1,6})\}|([0-9a-fA-F]{4}))/g, (_, braced, fixed) =>
        String.fromCodePoint(Number.parseInt(braced || fixed, 16)),
      );
    if (
      (syntax === 'tsx' || decoded.includes('{')) &&
      /\b(?:import|export|require)\b/.test(decoded)
    )
      reject('LEXICAL_UNSUPPORTED');
  }
  let previous;
  for (;;) {
    let kind = scanner.scan();
    if (kind === K.EndOfFile) break;
    rejectOpaque(kind);
    if (trivia.has(kind)) continue;
    if (kind === K.SlashToken && regexAfter.has(previous)) kind = scanner.reScanSlashToken();
    if (kind === K.CloseBraceToken && templates.length) {
      if (templates.at(-1) === 0) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === K.TemplateTail) templates.pop();
      } else templates[templates.length - 1]--;
    } else if (kind === K.OpenBraceToken && templates.length) templates[templates.length - 1]++;
    if (kind === K.TemplateHead) templates.push(0);
    rejectOpaque(kind);
    if (scanner.isUnterminated()) reject('LEXICAL_UNSUPPORTED');
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      escaped: scanner.hasUnicodeEscape() || scanner.hasExtendedUnicodeEscape(),
    });
    if (tokens.length > 200000) reject('TOKEN_LIMIT');
    previous = kind;
  }
  if (templates.length) reject('LEXICAL_UNSUPPORTED');
  const imports = [];
  let i = 0;
  const take = (text) => {
    if (tokens[i++]?.text !== text) reject('IMPORT_SYNTAX');
  };
  while (tokens[i]?.kind === K.ImportKeyword) {
    i++;
    const declarationType = tokens[i]?.text === 'type';
    if (declarationType) i++;
    take('{');
    const bindings = {};
    while (tokens[i]?.text !== '}') {
      let type = declarationType;
      if (tokens[i]?.text === 'type') {
        type = true;
        i++;
      }
      const token = tokens[i++];
      if (token?.kind !== K.Identifier || token.escaped || Object.hasOwn(bindings, token.text))
        reject('IMPORT_BINDING');
      bindings[token.text] = type ? 'type' : 'value';
      if (tokens[i]?.text === ',') i++;
      else if (tokens[i]?.text !== '}') reject('IMPORT_SYNTAX');
    }
    take('}');
    take('from');
    const module = tokens[i++];
    if (module?.kind !== K.StringLiteral || !/^['"][A-Za-z0-9@./:_-]+['"]$/.test(module.text))
      reject('IMPORT_SPECIFIER');
    take(';');
    if (!Object.keys(bindings).length) reject('IMPORT_BINDING');
    imports.push({ specifier: module.value, bindings });
  }
  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === K.ImportKeyword) reject('DYNAMIC_OR_LATE_IMPORT');
    if (token.kind === K.RequireKeyword || (token.kind === K.Identifier && token.escaped))
      reject('REQUIRE_REJECTED');
    if (
      token.kind === K.ExportKeyword &&
      (['*', '{'].includes(tokens[i + 1]?.text) ||
        (tokens[i + 1]?.text === 'type' && ['*', '{'].includes(tokens[i + 2]?.text)))
    )
      reject('REEXPORT_UNSUPPORTED');
  }
  return imports;
}
export function localTarget(module, specifier, modules) {
  if (!specifier.startsWith('./')) return null;
  if (!/^\.\/[A-Za-z0-9/-]+\.(?:js|ts|tsx)$/.test(specifier) || specifier.includes('..'))
    reject('LOCAL_SPECIFIER');
  const target = posix.join(posix.dirname(module), specifier).replace(/\.js$/, '.ts');
  if (!Object.hasOwn(modules, target)) reject('MISSING_TARGET');
  return target;
}
export async function validateGraph(sources, map) {
  if (
    map.schemaVersion !== 1 ||
    !map.modules ||
    Object.keys(map.modules).length > 64 ||
    Object.keys(map.modules).length === 0
  )
    reject('MAP_INVALID');
  const names = Object.keys(map.modules).sort();
  const roleEdges = {
    renderer: ['renderer', 'contract'],
    preload: ['client', 'contract'],
    client: ['contract'],
    contract: ['contract'],
    main: ['main-adapter', 'contract'],
    'main-adapter': ['main-adapter', 'contract'],
  };
  for (const name of names) {
    const node = map.modules[name];
    if (
      !/^[A-Za-z0-9/-]+\.(?:ts|tsx)$/.test(name) ||
      name.startsWith('/') ||
      name.includes('..') ||
      !Object.hasOwn(roleEdges, node.role) ||
      !node.imports ||
      Array.isArray(node.imports)
    )
      reject('MAP_INVALID');
  }
  if (JSON.stringify(Object.keys(sources).sort()) !== JSON.stringify(names))
    reject('SOURCE_INVENTORY');
  const graph = {},
    parsed = {};
  for (const name of names) {
    const edges = await sourceImports(sources[name], name.endsWith('.tsx') ? 'tsx' : 'ts');
    parsed[name] = edges;
    graph[name] = [];
    for (const edge of edges) {
      const allowed = Object.hasOwn(map.modules[name].imports, edge.specifier)
        ? map.modules[name].imports[edge.specifier]
        : undefined;
      if (!allowed) reject('EDGE_DENIED');
      for (const [binding, kind] of Object.entries(edge.bindings))
        if (!Object.hasOwn(allowed, binding) || allowed[binding] !== kind) reject('BINDING_DENIED');
      const target = localTarget(name, edge.specifier, map.modules);
      if (target) {
        if (!roleEdges[map.modules[name].role].includes(map.modules[target].role))
          reject('LAYER_DENIED');
        graph[name].push(target);
      } else if (
        edge.specifier.startsWith('.') ||
        edge.specifier.startsWith('/') ||
        edge.specifier.includes('\\')
      )
        reject('IMPORT_SPECIFIER');
    }
  }
  const active = new Set(),
    done = new Set();
  function visit(name) {
    if (active.has(name)) reject('IMPORT_CYCLE');
    if (done.has(name)) return;
    active.add(name);
    for (const target of graph[name]) visit(target);
    active.delete(name);
    done.add(name);
  }
  for (const name of names) visit(name);
  return { graph, parsed };
}
export async function verifyRuntimeGraph(sources, map) {
  const validated = await validateGraph(sources, map); // No resolver runs before source policy.
  const { build } = await import('esbuild');
  const result = await build({
    entryPoints: Object.keys(sources),
    outdir: 'owned-module-graph',
    write: false,
    bundle: true,
    metafile: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    treeShaking: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'registered-source-only',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') {
              if (!Object.hasOwn(sources, args.path))
                return { errors: [{ text: 'UNREGISTERED_ENTRY' }] };
              return { path: args.path, namespace: 'owned' };
            }
            if (args.namespace !== 'owned' || !Object.hasOwn(validated.parsed, args.importer))
              return { errors: [{ text: 'UNREGISTERED_IMPORTER' }] };
            const edge = validated.parsed[args.importer].find(
              (item) =>
                item.specifier === args.path && Object.values(item.bindings).includes('value'),
            );
            const generated =
              args.path === 'react/jsx-runtime' && map.modules[args.importer].role === 'renderer';
            if (!edge && !generated) return { errors: [{ text: 'RUNTIME_EDGE_DENIED' }] };
            const target = localTarget(args.importer, args.path, map.modules);
            return target
              ? { path: target, namespace: 'owned' }
              : { path: args.path, external: true };
          });
          builder.onLoad({ filter: /.*/, namespace: 'owned' }, (args) => {
            if (!Object.hasOwn(sources, args.path))
              return { errors: [{ text: 'UNREGISTERED_SOURCE' }] };
            return {
              contents: sources[args.path],
              loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
            };
          });
        },
      },
    ],
  });
  if (
    result.warnings.length ||
    !result.metafile ||
    Object.keys(result.metafile.inputs).length !== Object.keys(sources).length
  )
    reject('RUNTIME_GRAPH_MISMATCH');
  for (const [name, input] of Object.entries(result.metafile.inputs)) {
    const module = name.replace(/^owned:/, '');
    if (!Object.hasOwn(sources, module)) reject('RUNTIME_GRAPH_MISMATCH');
    for (const edge of input.imports) {
      if (!['import-statement'].includes(edge.kind)) reject('RUNTIME_EDGE_KIND');
      if (!edge.external && !validated.graph[module].includes(edge.path.replace(/^owned:/, '')))
        reject('RUNTIME_GRAPH_MISMATCH');
    }
  }
  return {
    modules: Object.keys(sources).length,
    runtimeInputs: Object.keys(result.metafile.inputs).length,
  };
}
export function readMap(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) reject('MAP_INVALID');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function inventory(sourceRoot) {
  const sources = {};
  let count = 0;
  function walk(path, name, depth) {
    if (++count > 128 || depth > 8) reject('INVENTORY_LIMIT');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) reject('SOURCE_LINK');
    if (stat.isDirectory()) {
      for (const child of readdirSync(path).sort())
        walk(resolve(path, child), name ? `${name}/${child}` : child, depth + 1);
    } else {
      if (!stat.isFile() || !/\.(ts|tsx)$/.test(name) || stat.size > 1048576) reject('SOURCE_FILE');
      sources[name] = readFileSync(path, 'utf8');
    }
  }
  walk(sourceRoot, '', 0);
  return sources;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) reject('ARGUMENTS');
    verify(true, process.argv[2]);
    const map = readMap(resolve(root, 'module-map.json'));
    const sources = inventory(resolve(root, 'src'));
    await verifyRuntimeGraph(sources, map);
    console.log(`MODULE_GRAPH_PASS ${Object.keys(sources).length}`);
  } catch (error) {
    const codes = new Set([
      'SOURCE_LIMIT',
      'DIRECTIVE_REJECTED',
      'TOKEN_LIMIT',
      'LEXICAL_UNSUPPORTED',
      'IMPORT_SYNTAX',
      'IMPORT_BINDING',
      'IMPORT_SPECIFIER',
      'DYNAMIC_OR_LATE_IMPORT',
      'REQUIRE_REJECTED',
      'REEXPORT_UNSUPPORTED',
      'LOCAL_SPECIFIER',
      'MISSING_TARGET',
      'MAP_INVALID',
      'SOURCE_INVENTORY',
      'EDGE_DENIED',
      'BINDING_DENIED',
      'IMPORT_CYCLE',
      'INVENTORY_LIMIT',
      'SOURCE_LINK',
      'SOURCE_FILE',
      'LAYER_DENIED',
      'RUNTIME_GRAPH_MISMATCH',
      'RUNTIME_EDGE_KIND',
    ]);
    console.log(
      `MODULE_GRAPH_FAILED ${codes.has(error.message) ? error.message : 'UNEXPECTED_FAILURE'}`,
    );
    process.exitCode = 1;
  }
}
