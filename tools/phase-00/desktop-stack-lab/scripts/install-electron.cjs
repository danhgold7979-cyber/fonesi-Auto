require('./verify-dependencies.cjs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
// Native Job helper intentionally starts in the executable directory.
process.chdir(path.resolve(__dirname, '..'));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('WINDOWS_X64_LAB_ONLY');
for (const key of Object.keys(process.env)) {
  if (/electron/i.test(key) || ['NODE_OPTIONS','ESBUILD_BINARY_PATH'].includes(key))
    throw new Error('UNREVIEWED_INSTALL_OVERRIDE');
}
// Explicitly reviewed official installer; checksums are bundled in integrity-locked npm package.
const result = spawnSync(process.execPath, [path.resolve('node_modules/electron/install.js')], {
  shell:false, stdio:'inherit', timeout:180_000,
  env:{...process.env, electron_config_cache:path.resolve('node_modules/.electron-cache')},
});
if (result.error || result.status !== 0) throw new Error('ELECTRON_INSTALL_FAILED');
if (fs.readFileSync('node_modules/electron/dist/version','utf8').trim().replace(/^v/,'') !== '45.1.0')
  throw new Error('ELECTRON_VERSION_MISMATCH');
for (const notice of ['LICENSE','LICENSES.chromium.html']) {
  if (fs.statSync(path.join('node_modules/electron/dist',notice)).size < 1) throw new Error('NOTICE_MISSING');
}
console.log('PASS OFFICIAL_ELECTRON_INSTALL_WITH_BUNDLED_SHA256');
