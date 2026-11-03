'use strict';
// Fixed verification artifact vocabulary, not a production renderer API.
const { read, write, plain, exact } = require('./settings-contract.cjs');
const PAGES = Object.freeze(['overview', 'accounts', 'tracking', 'setup', 'calendar', 'workflows']);
const THEMES = Object.freeze(['light', 'dark']);
const LABELS = Object.freeze([
  'Tổng quan',
  'Tài khoản',
  'Theo dõi',
  'Thiết lập & nội dung',
  'Quản lý lịch đăng',
  'Quy trình',
]);
const REFERENCE_SHA256 = '26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe';
const VERSIONS = Object.freeze({ electron: '45.1.0', node: '24.22.1', chrome: '156.0.8078.49' });
const MAIN_CASES = Object.freeze([
  'realMain',
  'originalKeyAuthenticated',
  'sandboxAndIsolation',
  'exactTabs',
  'productionEmpty',
  'allPagesBothThemes',
  'modalCancel',
  'modalEscape',
  'focusRestored',
  'dropdownKeyboard',
  'dockResize',
  'tileZoom',
  'tableScroll',
  'repeatedNavigation',
  'themePersisted',
  'orderlyQuit',
]);
const REFERENCE_CASES = Object.freeze([
  'referenceHash',
  'isolatedSession',
  'sandboxAndIsolation',
  'exactAssetPolicy',
  'exactTabs',
  'allPagesBothThemes',
  'orderlyQuit',
]);
function pageKeys() {
  return THEMES.flatMap((theme) => PAGES.map((page) => `${page}-${theme}`));
}
function imageSpecs(mode) {
  if (!['source', 'package', 'reference'].includes(mode)) throw Error('UI_MODE');
  const pages = mode === 'package' ? ['overview', 'setup'] : PAGES;
  const specs = THEMES.flatMap((theme) =>
    pages.map((page) => ({ name: `ui-${mode}-${page}-${theme}.png`, width: 1440, height: 900 })),
  );
  if (mode === 'source')
    for (const width of [880, 600])
      for (const theme of THEMES)
        specs.push({ name: `ui-source-overview-${theme}-${width}.png`, width, height: 768 });
  return specs;
}
function caseNames(mode) {
  return mode === 'reference'
    ? REFERENCE_CASES
    : mode === 'source'
      ? [...MAIN_CASES, 'responsive']
      : mode === 'package'
        ? MAIN_CASES
        : [];
}
function validateResult(raw) {
  const v = exact(raw, ['version', 'mode', 'versions', 'cases', 'pages', 'images']);
  if (
    v.version !== 1 ||
    !['source', 'package', 'reference'].includes(v.mode) ||
    JSON.stringify(v.versions) !== JSON.stringify(VERSIONS)
  )
    throw Error('UI_RESULT');
  const keys = caseNames(v.mode),
    pages = pageKeys();
  if (
    !v.cases ||
    Object.keys(v.cases).join('|') !== keys.join('|') ||
    !keys.every((key) => typeof v.cases[key] === 'boolean')
  )
    throw Error('UI_RESULT');
  if (
    !v.pages ||
    Object.keys(v.pages).join('|') !== pages.join('|') ||
    !pages.every((key) => typeof v.pages[key] === 'boolean')
  )
    throw Error('UI_RESULT');
  const specs = imageSpecs(v.mode);
  if (!Array.isArray(v.images) || v.images.length !== specs.length) throw Error('UI_RESULT');
  let bytes = 0;
  for (let i = 0; i < specs.length; i++) {
    const image = v.images[i],
      spec = specs[i];
    if (
      !image ||
      Object.keys(image).join('|') !== 'name|width|height|bytes|sha256' ||
      image.name !== spec.name ||
      image.width !== spec.width ||
      image.height !== spec.height ||
      !Number.isSafeInteger(image.bytes) ||
      image.bytes < 32 ||
      image.bytes > 4194304 ||
      typeof image.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(image.sha256)
    )
      throw Error('UI_RESULT');
    bytes += image.bytes;
  }
  if (bytes > 67108864 || JSON.stringify(v) !== raw) throw Error('UI_RESULT');
  return v;
}
module.exports = {
  PAGES,
  THEMES,
  LABELS,
  REFERENCE_SHA256,
  VERSIONS,
  MAIN_CASES,
  REFERENCE_CASES,
  pageKeys,
  imageSpecs,
  caseNames,
  validateResult,
  read,
  write,
  plain,
};

function referenceBytes(file) {
  const fs = require('node:fs'),
    path = require('node:path'),
    { createHash } = require('node:crypto');
  plain(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 249014)
    throw Error('UI_REFERENCE_FILE');
  const fd = fs.openSync(file, 'r');
  let bytes;
  try {
    bytes = Buffer.alloc(249015);
    let n = 0;
    while (n < bytes.length) {
      const got = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!got) break;
      n += got;
    }
    bytes = bytes.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
  if (
    bytes.length !== 249014 ||
    createHash('sha256').update(bytes).digest('hex') !== REFERENCE_SHA256
  )
    throw Error('UI_REFERENCE_HASH');
  return bytes;
}
function referencePolicy(bytes) {
  const { createHash } = require('node:crypto');
  if (createHash('sha256').update(bytes).digest('hex') !== REFERENCE_SHA256)
    throw Error('UI_REFERENCE_HASH');
  const html = new TextDecoder('utf8', { fatal: true }).decode(bytes);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)],
    styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  if (scripts.length !== 1 || styles.length !== 1) throw Error('UI_REFERENCE_BLOCKS');
  const hash = (value) => createHash('sha256').update(value).digest('base64');
  return `default-src 'none'; script-src 'sha256-${hash(scripts[0][1])}'; style-src-elem 'sha256-${hash(styles[0][1])}'; style-src-attr 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
}
function verifyBundles() {
  const fs = require('node:fs'),
    path = require('node:path'),
    { createHash } = require('node:crypto');
  const dir = path.resolve(__dirname, '../build');
  plain(dir);
  const marker = JSON.parse(read(path.join(dir, '.verified-build.json')));
  if (marker.schema !== 1 || !marker.outputs || typeof marker.outputs !== 'object')
    throw Error('UI_BUILD');
  for (const name of [
    'main.cjs',
    'preload.cjs',
    'renderer.js',
    'v9.css',
    'status.html',
    'window-policy.cjs',
    'settings-contract.cjs',
    'foundation-database.cjs',
    'backup-key-profile.cjs',
    'foundation-persistence.cjs',
    'backup-service.cjs',
    'persistence-files.cjs',
  ]) {
    const file = path.join(dir, name),
      s = fs.lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.size > 8388608 ||
      typeof marker.outputs[name] !== 'string' ||
      createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== marker.outputs[name]
    )
      throw Error('UI_BUILD');
  }
}
function saveImage(root, spec, image) {
  const fs = require('node:fs'),
    path = require('node:path'),
    { createHash } = require('node:crypto');
  plain(root);
  const size = image.getSize(),
    bytes = image.toPNG();
  if (
    size.width !== spec.width ||
    size.height !== spec.height ||
    bytes.length < 32 ||
    bytes.length > 4194304
  )
    throw Error('UI_IMAGE');
  const fd = fs.openSync(path.join(root, spec.name), 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return { ...spec, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
Object.assign(module.exports, { referenceBytes, referencePolicy, verifyBundles, saveImage });
