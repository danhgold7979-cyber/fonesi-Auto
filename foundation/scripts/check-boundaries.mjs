// Version-pinned scanner, not a runtime sandbox or full semantic linter.
import { createScanner, SyntaxKind, LanguageVariant } from 'typescript/unstable/ast';
import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = new Set(['require', 'process', 'globalThis', 'global', 'window', 'document',
  'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker', 'Function', 'eval', 'constructor',
  '__proto__', 'Reflect', 'module', 'exports', 'Buffer', 'Deno', 'Bun']);
export function inspectSource(text) {
  if (Buffer.byteLength(text, 'utf8') > 65536) return { code: 'SOURCE_TOO_LARGE' };
  if (/@ts-(?:ignore|nocheck|expect-error)|<reference\b/.test(text)) return { code: 'DIRECTIVE_REJECTED' };
  const scanner = createScanner(false, LanguageVariant.Standard, text);
  const tokens = [];
  for (;;) {
    const kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    if (scanner.isUnterminated() || scanner.hasUnicodeEscape() || scanner.hasExtendedUnicodeEscape()) return { code: 'LEXICAL_REJECTED' };
    if ([SyntaxKind.WhitespaceTrivia, SyntaxKind.NewLineTrivia, SyntaxKind.SingleLineCommentTrivia, SyntaxKind.MultiLineCommentTrivia].includes(kind)) continue;
    if ([SyntaxKind.Unknown, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail,
      SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.BacktickToken, SyntaxKind.SlashToken,
      SyntaxKind.SlashEqualsToken, SyntaxKind.AtToken, SyntaxKind.HashToken].includes(kind)) return { code: 'UNSUPPORTED_SYNTAX' };
    tokens.push({ kind, text: scanner.getTokenText(), value: scanner.getTokenValue() });
  }
  const imports = [];
  const identifier = (token) => token?.kind === SyntaxKind.Identifier;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (forbidden.has(token.value || token.text)) return { code: 'FORBIDDEN_REFERENCE' };
    if (['declare', 'namespace', 'from'].includes(token.text)) return { code: 'UNSUPPORTED_DECLARATION' };
    if (token.kind !== SyntaxKind.ImportKeyword) continue;
    // Only: import type { Name[, Name...] } from './sibling.js';
    let j = i + 1;
    if (tokens[j++]?.text !== 'type' || tokens[j++]?.text !== '{') return { code: 'IMPORT_REJECTED' };
    if (!identifier(tokens[j++])) return { code: 'IMPORT_REJECTED' };
    while (tokens[j]?.text === ',') { j++; if (!identifier(tokens[j++])) return { code: 'IMPORT_REJECTED' }; }
    if (tokens[j++]?.text !== '}' || tokens[j++]?.text !== 'from') return { code: 'IMPORT_REJECTED' };
    const specifier = tokens[j++];
    if (specifier?.kind !== SyntaxKind.StringLiteral || /\\/.test(specifier.text) ||
      !/^\.\/[A-Za-z][A-Za-z0-9-]*\.js$/.test(specifier.value)) return { code: 'IMPORT_REJECTED' };
    if (tokens[j++]?.text !== ';') return { code: 'IMPORT_REJECTED' };
    imports.push(specifier.value.slice(2, -3) + '.ts'); i = j - 1;
  }
  return { code: 'SOURCE_ALLOWED', imports };
}
export function checkGraph(sources) {
  const graph = new Map();
  for (const [name, text] of sources) {
    if (!/^[A-Za-z][A-Za-z0-9-]*\.ts$/.test(name) || name.endsWith('.d.ts')) return 'SOURCE_NAME_REJECTED';
    const result = inspectSource(text);
    if (result.code !== 'SOURCE_ALLOWED') return result.code;
    graph.set(name, result.imports);
  }
  const active = new Set(), complete = new Set();
  function visit(name) {
    if (active.has(name)) return 'IMPORT_CYCLE';
    if (complete.has(name)) return null;
    if (!graph.has(name)) return 'IMPORT_TARGET_MISSING';
    active.add(name);
    for (const target of graph.get(name)) { const failure = visit(target); if (failure) return failure; }
    active.delete(name); complete.add(name); return null;
  }
  for (const name of graph.keys()) { const failure = visit(name); if (failure) return failure; }
  return 'BOUNDARIES_PASS';
}
export function readSources(sourceRoot = resolve(root, 'src')) {
  if (lstatSync(sourceRoot).isSymbolicLink() || readdirSync(sourceRoot).join(',') !== 'contracts') throw new Error('SOURCE_ROOT');
  const directory = resolve(sourceRoot, 'contracts');
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('SOURCE_DIRECTORY');
  const entries = readdirSync(directory);
  if (entries.length > 64) throw new Error('SOURCE_COUNT');
  const sources = new Map();
  for (const name of entries) {
    const path = resolve(directory, name), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('SOURCE_ENTRY');
    if (name === 'README.md') continue;
    sources.set(name, readFileSync(path, 'utf8'));
  }
  if (!sources.size) throw new Error('NO_SOURCES');
  return sources;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { code = checkGraph(readSources()); } catch { code = 'BOUNDARY_CHECK_FAILED'; }
  console.log(code); process.exitCode = code === 'BOUNDARIES_PASS' ? 0 : 1;
}
