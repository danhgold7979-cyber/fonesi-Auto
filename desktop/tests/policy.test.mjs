import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, lstatSync, realpathSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inputs, outputs, createManifest, verifyBuild } from '../scripts/build-manifest.mjs';
import { runStages } from '../scripts/stages.mjs';
const require = createRequire(import.meta.url);
// NEVER import main.cjs or Electron in Node tests (Electron can auto-install).
const { permitsAsset, ENTRY_URL, ASSET_SHA256, CSP } = require('../build/asset-policy.cjs');
const { createLifecycle, disposeResources } = require('../build/lifecycle.cjs');
const { prepareOwnedProfile, OWNER_MARKER } = require('../build/profile-owner.cjs');
const { securePreferences, installSessionPolicy, installWindowPolicy } = require('../build/window-policy.cjs');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function owned(action) {
  const parent = resolve(root, '.test-output');
  try { mkdirSync(parent); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const check = () => { assert.equal(lstatSync(parent).isSymbolicLink(), false); assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output')); };
  check(); const dir = mkdtempSync(resolve(parent, 'fonesi-auto-foundation-'));
  try { return action(dir); }
  finally { check(); assert.equal(lstatSync(dir).isSymbolicLink(), false); assert.equal(realpathSync(dir), resolve(realpathSync(parent), basename(dir))); rmSync(dir, { recursive: true }); }
}
test('exact canonical owned GET asset allowed', () => assert.equal(permitsAsset(ENTRY_URL, 'GET'), true));
for (const [name, url, method] of [
  ['host', 'auto-foundation://other/status.html', 'GET'], ['path', 'auto-foundation://app/secret', 'GET'],
  ['query', ENTRY_URL + '?x', 'GET'], ['fragment', ENTRY_URL + '#x', 'GET'], ['method', ENTRY_URL, 'POST'],
  ['network', 'https://blocked.invalid/', 'GET'], ['file', 'file:///synthetic', 'GET'], ['blank', 'about:blank', 'GET'],
  ['traversal', 'auto-foundation://app/x/../status.html', 'GET'], ['encoded', 'auto-foundation://app/%73tatus.html', 'GET'],
  ['case', 'AUTO-FOUNDATION://APP/status.html', 'GET'], ['type', null, 'GET']
]) test(`raw policy denies ${name}`, () => assert.equal(permitsAsset(url, method), false));
test('canonicalization distinction is explicit', () => assert.equal(permitsAsset(new URL('auto-foundation://app/x/../status.html').href, 'GET'), true));
test('fixed asset hash matches fixture and rejects modified bytes', () => {
  const bytes = readFileSync(resolve(root, 'tests/fixtures/unavailable.html'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), ASSET_SHA256);
  assert.notEqual(createHash('sha256').update(Buffer.concat([bytes, Buffer.from('changed')])).digest('hex'), ASSET_SHA256);
});
test('security preferences have no preload and explicit floor', () => {
  const preferences = securePreferences({});
  for (const name of ['sandbox', 'contextIsolation', 'webSecurity']) assert.equal(preferences[name], true);
  for (const name of ['nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'webviewTag', 'plugins', 'devTools']) assert.equal(preferences[name], false);
  assert.equal(Object.hasOwn(preferences, 'preload'), false);
});
function fakeSession() {
  const state = {}, events = new Map();
  return { state, events, setPermissionRequestHandler: (fn) => { state.request = fn; },
    setPermissionCheckHandler: (fn) => { state.check = fn; },
    webRequest: { onBeforeRequest: (fn) => { state.before = fn; } },
    protocol: { handle: (scheme, fn) => { state.scheme = scheme; state.protocol = fn; }, unhandle: () => { state.unhandled = true; } },
    on: (name, fn) => events.set(name, fn), removeListener: (name) => events.delete(name) };
}
test('session denies permissions/network/download and serves only exact fixed asset', async () => {
  const session = fakeSession(), dispose = installSessionPolicy(session, 'OWNED');
  let permitted; session.state.request(null, 'any', (value) => { permitted = value; }); assert.equal(permitted, false);
  assert.equal(session.state.check(), false);
  for (const [url, cancel] of [[ENTRY_URL, false], ['https://blocked.invalid/', true]]) {
    let actual; session.state.before({ url, method: 'GET' }, (value) => { actual = value.cancel; }); assert.equal(actual, cancel);
  }
  let prevented = false; session.events.get('will-download')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  const ok = session.state.protocol({ url: ENTRY_URL, method: 'GET' }); assert.equal(await ok.text(), 'OWNED'); assert.equal(ok.headers.get('content-security-policy'), CSP);
  assert.equal(session.state.protocol({ url: 'auto-foundation://app/other', method: 'GET' }).status, 403);
  dispose(); assert.equal(session.state.unhandled, true); assert.equal(session.state.before, null); assert.equal(session.events.size, 0);
  assert.equal(session.state.check(), false);
});
test('window policy denies popup, webview and unapproved observed navigation', () => {
  const events = new Map(); let open;
  installWindowPolicy({ webContents: { setWindowOpenHandler(fn) { open = fn; }, on(name, fn) { events.set(name, fn); } } });
  assert.deepEqual(open(), { action: 'deny' });
  for (const name of ['will-attach-webview', 'will-navigate', 'will-frame-navigate', 'will-redirect']) {
    let denied = false; events.get(name)({ url: 'about:blank', isMainFrame: true, preventDefault() { denied = true; } }, 'about:blank'); assert.equal(denied, true);
  }
});
function windowFactory() {
  const windows = [];
  const make = () => { const w = { closed: undefined, closes: 0, destroys: 0,
    onClosed(fn) { this.closed = fn; }, close() { this.closes++; }, destroy() { this.destroys++; this.closed?.(); } }; windows.push(w); return w; };
  return { windows, make };
}
test('lifecycle rejects duplicate start/close and closes then reopens', () => {
  const factory = windowFactory(), life = createLifecycle(factory.make);
  assert.equal(life.phase(), 'IDLE'); assert.equal(life.start(), true); assert.equal(life.start(), false);
  assert.equal(life.close(), true); assert.equal(life.close(), false); assert.equal(life.start(), false);
  factory.windows[0].closed(); assert.equal(life.phase(), 'IDLE'); assert.equal(life.start(), true);
  factory.windows[0].closed(); assert.equal(life.phase(), 'OPEN'); life.dispose(); assert.equal(life.phase(), 'DISPOSED');
  assert.equal(life.start(), false); life.dispose(); assert.equal(factory.windows[1].destroys, 1);
});
test('factory failure leaves lifecycle idle', () => {
  const life = createLifecycle(() => { throw new Error('SYNTHETIC'); }); assert.throws(() => life.start()); assert.equal(life.phase(), 'IDLE'); life.dispose();
});
test('failure cleanup attempts every owned action without exposing error', () => {
  const calls = []; assert.equal(disposeResources([() => { calls.push('window'); throw new Error('PRIVATE'); }, () => calls.push('session')]), false);
  assert.deepEqual(calls, ['window', 'session']); assert.equal(disposeResources([]), true);
});
test('fresh owned profile directories created, second use rejected', () => owned((dir) => {
  writeFileSync(resolve(dir, '.owner'), OWNER_MARKER, { flag: 'wx' });
  const paths = prepareOwnedProfile(dir); assert.equal(Object.keys(paths).length, 4);
  assert.equal(Object.values(paths).every((path) => lstatSync(path).isDirectory()), true);
  assert.throws(() => prepareOwnedProfile(dir), /OWNER_REJECTED/);
}));
test('missing, wrong and extra ownership data rejected', () => owned((dir) => {
  assert.throws(() => prepareOwnedProfile(dir), /OWNER_REJECTED/);
  writeFileSync(resolve(dir, '.owner'), 'WRONG', { flag: 'wx' }); assert.throws(() => prepareOwnedProfile(dir), /OWNER_REJECTED/);
  writeFileSync(resolve(dir, '.owner'), OWNER_MARKER); writeFileSync(resolve(dir, 'unrelated'), 'DO NOT TOUCH');
  assert.throws(() => prepareOwnedProfile(dir), /OWNER_REJECTED/); assert.equal(readFileSync(resolve(dir, 'unrelated'), 'utf8'), 'DO NOT TOUCH');
}));
test('failed preflight prevents restore and build, including thrown failure', () => {
  for (const fail of [() => false, () => { throw new Error('SYNTHETIC'); }]) {
    const calls = []; const result = runStages([['PREFLIGHT', fail], ['RESTORE', () => { calls.push('restore'); return true; }], ['BUILD', () => { calls.push('build'); return true; }]]);
    assert.deepEqual(result, { ok: false, stage: 'PREFLIGHT' }); assert.deepEqual(calls, []);
  }
});
test('failed installed verification prevents build; successful stages run in order', () => {
  const calls = []; assert.equal(runStages([['RESTORE', () => { calls.push('restore'); return true; }], ['INSTALLED', () => false], ['BUILD', () => { calls.push('build'); return true; }]]).ok, false);
  assert.deepEqual(calls, ['restore']); assert.equal(runStages([['A', () => true], ['B', () => true]]).ok, true);
});
test('source and bundle expose no application bridge or effect service', () => {
  const main = readFileSync(resolve(root, 'build/main.cjs'), 'utf8');
  for (const token of ['ipcMain', 'ipcRenderer', 'contextBridge', 'openExternal', 'node:child_process', 'node:sqlite', 'safeStorage']) assert.equal(main.includes(token), false);
  const html = readFileSync(resolve(root, 'build/status.html'), 'utf8'); assert.equal(/<script|<iframe|<webview/i.test(html), false);
  assert.equal(html.includes('UNAVAILABLE'), true); // This is a review aid, not a hostile-source sandbox proof.
});

function copyBuildFixture(directory) {
  for (const file of [...inputs, 'scripts/verify-dependencies.mjs', ...outputs.map((name) => 'build/' + name)]) {
    const target = resolve(directory, file); mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(resolve(root, file)));
  }
  writeFileSync(resolve(directory, 'build/.verified-build.json'), JSON.stringify(createManifest(directory)), { flag: 'wx' });
}
test('manifest ties current source to all built outputs and detects tamper', () => owned((dir) => {
  copyBuildFixture(dir); assert.equal(verifyBuild(dir), true);
  writeFileSync(resolve(dir, 'build/main.cjs'), 'TAMPERED'); assert.equal(verifyBuild(dir), false);
  writeFileSync(resolve(dir, 'build/main.cjs'), readFileSync(resolve(root, 'build/main.cjs'))); assert.equal(verifyBuild(dir), true);
  writeFileSync(resolve(dir, 'src/main.ts'), 'STALE_SOURCE'); assert.equal(verifyBuild(dir), false);
}));
test('missing or partial success manifest cannot pass', () => owned((dir) => {
  copyBuildFixture(dir); writeFileSync(resolve(dir, 'build/.verified-build.json'), '{'); assert.equal(verifyBuild(dir), false);
  rmSync(resolve(dir, 'build/.verified-build.json')); assert.equal(verifyBuild(dir), false);
}));
test('actual failed build invalidates previous success marker before verification', () => owned((dir) => {
  copyBuildFixture(dir); assert.equal(verifyBuild(dir), true);
  const result = spawnSync(process.execPath, [resolve(dir, 'scripts/build.mjs'), '0.0.0'], { shell: false, encoding: 'utf8', timeout: 30000, maxBuffer: 65536 });
  assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.match(result.stdout, /BUILD_FAILED/);
  assert.equal(verifyBuild(dir), false); assert.throws(() => lstatSync(resolve(dir, 'build/.verified-build.json')), { code: 'ENOENT' });
}));

test('nonregular manifest rejected before read', () => owned((dir) => {
  copyBuildFixture(dir); rmSync(resolve(dir, 'build/.verified-build.json'));
  mkdirSync(resolve(dir, 'build/.verified-build.json')); assert.equal(verifyBuild(dir), false);
}));
test('bootstrap explicitly removes default native application menu', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  assert.equal(source.includes('Menu.setApplicationMenu(null)'), true);
  assert.ok(source.indexOf('Menu.setApplicationMenu(null)') < source.indexOf('new BrowserWindow'));
});

test('failure disposal cannot start ordinary quit through window-all-closed', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  const match = source.match(/app\.on\('window-all-closed', (\(\) => \{ if \(!closing\) app\.quit\(\); \})\);/);
  assert.ok(match);
  for (const closing of [false, true]) {
    let quits = 0;
    const callback = new Function('closing', 'app', `return ${match[1]}`)(closing, { quit() { quits++; } });
    callback();
    assert.equal(quits, closing ? 0 : 1);
  }
});
