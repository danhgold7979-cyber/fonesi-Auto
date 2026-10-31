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
  const session = fakeSession(), dispose = installSessionPolicy(session, 'OWNED', 'OWNED_JS');
  let permitted; session.state.request(null, 'any', (value) => { permitted = value; }); assert.equal(permitted, false);
  assert.equal(session.state.check(), false);
  for (const [url, cancel] of [[ENTRY_URL, false], ['https://blocked.invalid/', true]]) {
    let actual; session.state.before({ url, method: 'GET' }, (value) => { actual = value.cancel; }); assert.equal(actual, cancel);
  }
  let prevented = false; session.events.get('will-download')({ preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  const ok = session.state.protocol({ url: ENTRY_URL, method: 'GET' }); assert.equal(await ok.text(), 'OWNED'); assert.equal(ok.headers.get('content-security-policy'), CSP);
  const js = session.state.protocol({ url: 'auto-foundation://app/renderer.js', method: 'GET' });
  assert.equal(await js.text(), 'OWNED_JS'); assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  for (const [url, method] of [['auto-foundation://app/renderer.js?x', 'GET'], ['auto-foundation://app/renderer.js', 'POST']]) assert.equal(session.state.protocol({ url, method }).status, 403);
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
test('approved public bridge has no effect service or arbitrary renderer API', () => {
  const main = readFileSync(resolve(root, 'build/main.cjs'), 'utf8');
  for (const token of ['openExternal', 'node:child_process', 'node:sqlite', 'safeStorage']) assert.equal(main.includes(token), false);
  const html = readFileSync(resolve(root, 'build/status.html'), 'utf8'); assert.equal(/<iframe|<webview/i.test(html), false);
  assert.equal((html.match(/<script /g) ?? []).length, 1);
  assert.ok(html.includes('src="auto-foundation://app/renderer.js"'));
  const preload = readFileSync(resolve(root, 'src/preload.ts'), 'utf8');
  assert.match(preload, /health: \(\) => client.health\(\)/);
  assert.match(preload, /settings: \(\) => client.settings\(\)/);
  assert.equal(preload.includes("exposeInMainWorld('ipcRenderer'"), false);
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

test('actual bootstrap uses security floor plus exactly one manifest-bound preload', () => {
  const source = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
  assert.match(source, /webPreferences: \{ \.\.\.securePreferences\(ownedSession\), preload: join\(__dirname, 'preload.cjs'\) \}/);
  assert.equal((source.match(/preload\s*:/g) ?? []).length, 1);
  const bundle = readFileSync(resolve(root, 'build/main.cjs'), 'utf8');
  assert.equal((bundle.match(/preload\s*:/g) ?? []).length, 1);
});
test('runtime probe does not mistake omitted devTools or preload fields for disabled settings', () => {
  const probe = readFileSync(resolve(root, 'verification/runtime-probe.cjs'), 'utf8');
  assert.equal(probe.includes('preferences.devTools === false'), false);
  assert.equal(probe.includes('preferences.preload'), false);
  for (const operation of ['contents.openDevTools(', 'opened: contents.isDevToolsOpened()',
    'contents.devToolsWebContents === null', 'contents.session.getPreloadScripts()',
    'cases.approved_preload =', 'securePreferenceEvidence(preferences, configured']) {
    assert.equal(probe.includes(operation), true);
  }
});

test('secure preference evidence rejects enabled, opened, observed and missing DevTools states', () => {
  const { securePreferenceEvidence } = require('../verification/runtime-measurements.cjs');
  const configured = securePreferences({});
  const saved = { ...configured }; delete saved.devTools;
  const state = { eventObserved: false, opened: false, contentsAbsent: true };
  assert.equal(securePreferenceEvidence(saved, configured, state), true);
  assert.equal(securePreferenceEvidence(saved, { ...configured, devTools: true }, state), false);
  assert.equal(securePreferenceEvidence(saved, {}, state), false);
  for (const field of ['eventObserved', 'opened', 'contentsAbsent']) {
    assert.equal(securePreferenceEvidence(saved, configured, { ...state, [field]: !state[field] }), false);
    assert.equal(securePreferenceEvidence(saved, configured, { ...state, [field]: undefined }), false);
  }
  for (const field of ['sandbox', 'contextIsolation', 'webSecurity', 'nodeIntegration',
    'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'webviewTag', 'allowRunningInsecureContent']) {
    assert.equal(securePreferenceEvidence({ ...saved, [field]: !saved[field] }, configured, state), false);
  }
});
test('preload evidence rejects registered scripts and any configured preload property', () => {
  const { preloadEvidence } = require('../verification/runtime-measurements.cjs');
  const configured = securePreferences({});
  assert.equal(preloadEvidence(configured, []), true);
  for (const registered of [[{}], null, {}, undefined]) assert.equal(preloadEvidence(configured, registered), false);
  for (const value of ['', undefined, 'synthetic-preload']) {
    assert.equal(preloadEvidence({ ...configured, preload: value }, []), false);
  }
});

test('actual dispatcher admits only public reads and rejects wrong sender/frame/wire', () => {
 const { EventEmitter } = require('node:events');
 const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
 let handler, removed;
 const bridge = installFoundationBridge({ handle(channel, fn) { assert.equal(channel, 'foundation:request:v1'); handler = fn; }, removeHandler(channel) { removed = channel; } });
 const contents = new EventEmitter(); contents.isDestroyed = () => false;
 contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY_URL };
 const window = new EventEmitter(); window.webContents = contents;
 const view = bridge.attach(window); const event = { sender: contents, senderFrame: contents.mainFrame };
 const wire = JSON.stringify({ version: 1, requestId: 'r', method: 'health.get' });
 const read = (ev = event, body = wire, ...extra) => JSON.parse(handler(ev, body, ...extra));
 assert.equal(read().code, 'SESSION_UNAVAILABLE');
 contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL }); assert.equal(view.arm(), true);
 assert.equal(read().result.status, 'READY');
 assert.equal(read({ sender: {}, senderFrame: null }).code, 'UNTRUSTED_SENDER');
 assert.equal(read({ ...event, senderFrame: null }).code, 'UNTRUSTED_SENDER');
 assert.equal(read({ sender: contents, get senderFrame() { throw new Error('PRIVATE'); } }).code, 'UNTRUSTED_SENDER');
 contents.isDestroyed = () => true; assert.equal(read().code, 'UNTRUSTED_SENDER'); contents.isDestroyed = () => false;
 assert.equal(read({ ...event, senderFrame: { ...contents.mainFrame } }).code, 'UNTRUSTED_SENDER');
 assert.equal(read(event, wire, 'extra').code, 'INVALID_SHAPE');
 assert.equal(read(event, '{').code, 'INVALID_JSON');
 contents.mainFrame.origin = 'null'; assert.equal(read().code, 'UNTRUSTED_SENDER'); contents.mainFrame.origin = 'auto-foundation://app';
 contents.emit('did-start-navigation', { isMainFrame: true, url: 'about:blank' });
 assert.equal(read().code, 'SESSION_REVOKED'); assert.equal(view.arm(), false);
 bridge.dispose(); assert.equal(removed, 'foundation:request:v1'); assert.equal(read().code, 'UNTRUSTED_SENDER');
});

test('observed denied navigation also revokes the actual view before return', () => {
 const { EventEmitter } = require('node:events');
 const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
 for (const eventName of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
  let handler;
  const bridge = installFoundationBridge({ handle(_channel, fn) { handler = fn; }, removeHandler() {} });
  const contents = new EventEmitter(); contents.isDestroyed = () => false;
  contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY_URL };
  const window = new EventEmitter(); window.webContents = contents;
  const view = bridge.attach(window); contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL }); assert.equal(view.arm(), true);
  contents.emit(eventName, { isMainFrame: true });
  const response = JSON.parse(handler({ sender: contents, senderFrame: contents.mainFrame }, JSON.stringify({ version: 1, requestId: 'r', method: 'health.get' })));
  assert.equal(response.code, 'SESSION_REVOKED'); bridge.dispose();
 }
});

test('bounded seeded IPC campaign: seed 0x5a17c0de, 4096 inputs and 16384 dispatches', { timeout: 10000 }, () => {
  const { performance } = require('node:perf_hooks');
  const { EventEmitter } = require('node:events');
  const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
  // Use the exact bundled parser exported by the normal pure build.
  const { parseRequest } = require('../build/ipc-contract.cjs');
  const started = performance.now();
  let seed = 0x5a17c0de;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const codes = new Set(['INVALID_TRANSPORT', 'PAYLOAD_TOO_LARGE', 'INVALID_JSON', 'INVALID_SHAPE', 'UNSUPPORTED_VERSION', 'UNKNOWN_METHOD', 'UNTRUSTED_SENDER', 'SESSION_UNAVAILABLE', 'SESSION_REVOKED', 'BUSY', 'TIMEOUT', 'INTERNAL_FAILURE']);
  const setups = ['INITIALIZING', 'ACTIVE', 'REVOKED', 'CLOSED'].map(state => {
    let handler;
    const bridge = installFoundationBridge({ handle(_channel, fn) { handler = fn; }, removeHandler() {} });
    const contents = new EventEmitter(); contents.isDestroyed = () => false;
    contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY_URL };
    const window = new EventEmitter(); window.webContents = contents;
    const view = bridge.attach(window);
    if (state !== 'INITIALIZING') { contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL }); assert.equal(view.arm(), true); }
    if (state === 'REVOKED') contents.emit('will-navigate', {});
    if (state === 'CLOSED') window.emit('closed');
    return { state, bridge, handler, event: { sender: contents, senderFrame: contents.mainFrame } };
  });
  try {
    for (let index = 0; index < 4096; index++) {
      if (performance.now() - started > 5000) throw new Error('FUZZ_DEADLINE');
      const id = `r${random().toString(16)}`, method = random() % 2 ? 'health.get' : 'settings.get';
      const good = JSON.stringify({ version: 1, requestId: id, method });
      const canary = `PRIVATE_CANARY_${random().toString(16)}`;
      let raw, expectedValid = false;
      switch (index % 16) {
        case 0: raw = good; expectedValid = true; break;
        case 1: raw = `{"version":2,"version":1,"requestId":"${id}","method":"${method}"}`; break;
        case 2: raw = `{"version":1,"requestId":"bad","\\u0072equestId":"${id}","method":"${method}"}`; break;
        case 3: raw = 'x'.repeat(513 + random() % 512); break;
        case 4: raw = '#' + Array.from({ length: random() % 128 }, () => String.fromCharCode(random() % 128)).join(''); break;
        case 5: raw = JSON.stringify({ version: 1, requestId: id, method: `blocked_${random()}` }); break;
        case 6: raw = JSON.stringify({ version: 1, requestId: id, method, secret: canary }); break;
        case 7: raw = JSON.stringify({ version: 2 + random() % 8, requestId: id, method }); break;
        case 8: raw = JSON.stringify({ version: 1, requestId: { nested: [canary] }, method }); break;
        case 9: raw = JSON.stringify({ version: 1, requestId: 'é'.repeat(1 + random() % 32), method }); break;
        case 10: raw = ' \t\r\n' + good; expectedValid = true; break;
        case 11: { const size = 511 + random() % 3; raw = good + ' '.repeat(size - good.length); expectedValid = size <= 512; break; }
        case 12: raw = `{"\\u0076ersion":0,"version":1,"requestId":"${id}","method":"${method}"}`; break;
        case 13: raw = `{"version":1e309,"requestId":"${id}","method":"${method}"}`; break;
        case 14: raw = 'é'.repeat(257 + random() % 32); break;
        default: raw = random() % 2 ? null : { secret: canary }; break;
      }
      assert.ok(typeof raw !== 'string' || (raw.length <= 1024 && Buffer.byteLength(raw) <= 2048));
      const parsed = parseRequest(raw);
      assert.equal(parsed.ok, expectedValid);
      if (!parsed.ok) assert.ok(codes.has(parsed.code));
      for (const setup of setups) {
        const output = setup.handler(setup.event, raw);
        assert.equal(typeof output, 'string'); assert.ok(Buffer.byteLength(output) <= 1024);
        assert.equal(output.includes(canary), false);
        const result = JSON.parse(output);
        if (setup.state === 'ACTIVE' && expectedValid) {
          const expected = method === 'health.get' ? { kind: 'health', status: 'READY', services: 'UNAVAILABLE' }
            : { kind: 'settings', revision: 0, persistence: 'NOT_PERSISTED', theme: 'LIGHT' };
          assert.equal(output, JSON.stringify({ version: 1, ok: true, requestId: id, result: expected }));
        } else {
          assert.deepEqual(Object.keys(result), ['version', 'ok', 'code']);
          assert.equal(result.version, 1); assert.equal(result.ok, false); assert.ok(codes.has(result.code));
          if (setup.state === 'INITIALIZING') assert.equal(result.code, 'SESSION_UNAVAILABLE');
          if (setup.state === 'REVOKED') assert.equal(result.code, 'SESSION_REVOKED');
          if (setup.state === 'CLOSED') assert.equal(result.code, 'UNTRUSTED_SENDER');
        }
      }
    }
    assert.ok(performance.now() - started <= 5000, 'FUZZ_DEADLINE');
  } finally { for (const setup of setups) setup.bridge.dispose(); }
});

test('same actual adapter disposes an old view and admits only a fresh reopened view', () => {
  const { EventEmitter } = require('node:events');
  const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
  let handler;
  const bridge = installFoundationBridge({ handle(_channel, fn) { handler = fn; }, removeHandler() {} });
  const make = () => {
    const contents = new EventEmitter(); contents.isDestroyed = () => false;
    contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY_URL };
    const window = new EventEmitter(); window.webContents = contents;
    const view = bridge.attach(window);
    const event = { sender: contents, senderFrame: contents.mainFrame };
    return { window, contents, view, event };
  };
  const wire = JSON.stringify({ version: 1, requestId: 'reopen', method: 'health.get' });
  const first = make(); first.contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL });
  assert.equal(first.view.arm(), true); assert.equal(JSON.parse(handler(first.event, wire)).ok, true);
  first.window.emit('close'); assert.equal(JSON.parse(handler(first.event, wire)).code, 'SESSION_REVOKED');
  first.window.emit('closed'); assert.equal(JSON.parse(handler(first.event, wire)).code, 'UNTRUSTED_SENDER');
  const second = make(); assert.equal(JSON.parse(handler(second.event, wire)).code, 'SESSION_UNAVAILABLE');
  second.contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY_URL });
  assert.equal(second.view.arm(), true); assert.equal(JSON.parse(handler(second.event, wire)).ok, true);
  assert.equal(first.view.arm(), false); assert.equal(JSON.parse(handler(first.event, wire)).code, 'UNTRUSTED_SENDER');
  bridge.dispose(); assert.equal(JSON.parse(handler(second.event, wire)).code, 'UNTRUSTED_SENDER');
});
