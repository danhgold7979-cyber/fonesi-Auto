import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { verify } from './verify-dependencies.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const directories = [
  'foundation/src',
  'foundation/scripts',
  'foundation/tests',
  'desktop/src',
  'desktop/scripts',
  'desktop/tests',
  'desktop/verification',
];
function rejectConfig(path) {
  try {
    lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('TOOL_NESTED_CONFIG');
}
export function inventory() {
  rejectConfig(resolve(root, 'biome.jsonc'));
  for (const directory of ['foundation', 'desktop']) {
    const stat = lstatSync(resolve(root, directory));
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('INVENTORY_LINK');
    for (const name of ['biome.json', 'biome.jsonc']) rejectConfig(resolve(root, directory, name));
  }
  const files = [];
  let entries = 0;
  function walk(path, depth) {
    if (++entries > 512 || depth > 12) throw new Error('INVENTORY_LIMIT');
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error('INVENTORY_LINK');
    if (stat.isDirectory()) {
      for (const name of ['biome.json', 'biome.jsonc']) rejectConfig(resolve(path, name));
      for (const name of readdirSync(path).sort()) {
        if (name === '__pycache__') continue;
        walk(resolve(path, name), depth + 1);
      }
    } else if (!stat.isFile()) throw new Error('INVENTORY_KIND');
    else if (/\.(?:ts|tsx|mjs|cjs)$/.test(path)) {
      if (stat.size > 1048576) throw new Error('SOURCE_LIMIT');
      files.push(relative(root, path));
    }
  }
  for (const directory of directories) walk(resolve(root, directory), 0);
  if (!files.length) throw new Error('EMPTY_CORPUS');
  return files;
}
export function executable(npmVersion) {
  for (const key of Object.keys(process.env)) {
    if (
      key.toUpperCase().startsWith('BIOME_') ||
      ['NODE_OPTIONS', 'NODE_PATH'].includes(key.toUpperCase())
    )
      throw new Error('TOOL_OVERRIDE');
  }
  verify(true, npmVersion);
  if (process.arch !== 'x64' || !['linux', 'win32'].includes(process.platform))
    throw new Error('TOOL_PLATFORM');
  if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime)
    throw new Error('TOOL_LIBC');
  const review = JSON.parse(readFileSync(resolve(root, 'desktop/biome-review.json'), 'utf8'));
  const config = resolve(root, 'biome.json');
  if (
    !lstatSync(config).isFile() ||
    lstatSync(config).isSymbolicLink() ||
    sha(readFileSync(config)) !== review.configurationSha256
  )
    throw new Error('TOOL_CONFIG');
  const name =
    process.platform === 'win32'
      ? '@biomejs/cli-win32-x64/biome.exe'
      : '@biomejs/cli-linux-x64/biome';
  const path = resolve(root, 'desktop/node_modules', name);
  let parent = dirname(path);
  while (parent !== root) {
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('TOOL_PARENT');
    parent = dirname(parent);
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 134217728 || stat.size === 0)
    throw new Error('TOOL_FILE');
  if (sha(readFileSync(path)) !== review.nativeSha256[name]) throw new Error('TOOL_HASH');
  return path;
}
export function invoke(binary, mode, files, input) {
  inventory(); // Sole reviewed config before every native invocation, including fixtures.
  if (!['check', 'format', 'format-write', 'lint', 'version'].includes(mode))
    throw new Error('TOOL_MODE');
  if (!Array.isArray(files) || files.length > 512) throw new Error('TOOL_TARGETS');
  if (
    input !== undefined &&
    (typeof input !== 'string' || input.length > 1048576 || files.length || mode === 'format-write')
  )
    throw new Error('TOOL_INPUT');
  for (const file of files) {
    if (typeof file !== 'string') throw new Error('TOOL_TARGETS');
    const path = resolve(root, file);
    const name = relative(root, path).replaceAll('\\', '/');
    if (
      !directories.some((directory) => name.startsWith(`${directory}/`)) ||
      !/\.(?:ts|tsx|mjs|cjs)$/.test(name)
    )
      throw new Error('TOOL_TARGETS');
    let current = path;
    while (current !== root) {
      const stat = lstatSync(current);
      if (
        stat.isSymbolicLink() ||
        (current === path ? !stat.isFile() || stat.size > 1048576 : !stat.isDirectory())
      )
        throw new Error('TOOL_TARGETS');
      current = dirname(current);
    }
  }
  const args =
    mode === 'version'
      ? ['--version']
      : [
          mode === 'format-write' ? 'format' : mode,
          ...(mode === 'format-write' ? ['--write'] : []),
          '--config-path',
          root,
          '--colors=off',
          ...(['check', 'lint'].includes(mode) ? ['--error-on-warnings'] : []),
          '--max-diagnostics=3',
          ...(input === undefined ? files : ['--stdin-file-path=desktop/src/quality-fixture.ts']),
        ];
  return spawnSync(binary, args, {
    cwd: root,
    shell: false,
    encoding: 'utf8',
    input,
    timeout: 30000,
    maxBuffer: 65536,
    windowsHide: true,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--inventory')
      throw new Error('ARGUMENTS');
    const binary = executable(process.argv[3]);
    const version = invoke(binary, 'version', []);
    if (version.status !== 0 || version.stdout.trim() !== 'Version: 2.6.4')
      throw new Error('TOOL_VERSION');
    const files = inventory();
    const result = invoke(binary, 'check', files);
    console.log(`QUALITY_CORPUS_FILES ${files.length}`);
    if (result.error || result.signal) throw new Error('TOOL_EXECUTION');
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exitCode = result.status === 0 ? 0 : 1;
  } catch {
    console.log('QUALITY_TOOL_FAILED');
    process.exitCode = 1;
  }
}
