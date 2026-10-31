// Limited text hygiene, not a formatter or semantic linter.
import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './run-tool.mjs';
export function cleanText(text) {
  return text.endsWith('\n') && !text.includes('\r') && !text.includes('\t') &&
    text.split('\n').every((line) => line === line.trimEnd());
}
export function checkHygiene() {
  let count = 0;
  function inspect(path, depth = 0) {
    if (depth > 4 || ++count > 128) return false;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return false;
    if (stat.isDirectory()) return readdirSync(path).every((name) => inspect(resolve(path, name), depth + 1));
    return stat.isFile() && stat.size <= 65536 && cleanText(readFileSync(path, 'utf8'));
  }
  return ['scripts', 'tests', 'src', 'package.json', 'package-lock.json', 'dependency-review.json',
    'tsconfig.json', 'README.md', '.gitignore'].every((name) => inspect(resolve(root, name)));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let ok = false; try { ok = checkHygiene(); } catch { /* fixed failure below */ }
  console.log(ok ? 'HYGIENE_PASS' : 'HYGIENE_FAILED'); process.exitCode = ok ? 0 : 1;
}
