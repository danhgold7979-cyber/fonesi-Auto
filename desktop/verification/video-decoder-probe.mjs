// Verification-only main: no production main, native provider, ADB or persistence import.
import { app, BrowserWindow, session, protocol, ipcMain } from 'electron';
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  fstatSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { installVideoStreamBridge } from '../src/video-stream-bridge.ts';
import { ViewSession } from '../src/view-session.ts';
import {
  securePreferences,
  installSessionPolicy,
  installWindowPolicy,
} from '../src/main/window-policy.ts';
import { parseSettingsRequest, settingsSuccess } from '../src/settings-contract.ts';
import { parseFleetRequest, fleetSuccess } from '../src/fleet-contract.ts';
import { parseSetupRequest, setupError } from '../src/platform-tools-setup-contract.ts';
import { parseMetadataRequest, metadataError } from '../src/metadata-contract.ts';
import { generateVideoDecoderFixture } from './video-decoder-fixture.mjs';
import {
  VIDEO_QUALIFICATION_SCOPE,
  VIDEO_QUALIFICATION_CASES,
  validInputs,
  validateVideoQualification,
  exact,
  VIDEO_DIAGNOSTIC_STATES,
  validateVideoDiagnostic,
  validateVideoGeometry,
} from './video-decoder-contract.mjs';
const ENTRY = 'auto-foundation://app/status.html',
  ORIGIN = 'auto-foundation://app';
const DEVICE = '11111111-1111-4111-8111-111111111111',
  VIDEO = '22222222-2222-4222-8222-222222222222';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function plain(file, limit = 1048576) {
  const s = lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size < 1 ||
    s.size > limit ||
    realpathSync(file) !== file
  )
    throw Error();
  return readFileSync(file);
}
function executableHash(file) {
  const before = lstatSync(file);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > 536870912 ||
    realpathSync(file) !== file
  )
    throw Error();
  const fd = openSync(file, 'r');
  try {
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size)
      throw Error();
    const h = createHash('sha256'),
      buffer = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      total += n;
      if (total > before.size) throw Error();
      h.update(buffer.subarray(0, n));
    }
    const after = fstatSync(fd);
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs)
      throw Error();
    return h.digest('hex');
  } finally {
    closeSync(fd);
  }
}
const root = resolve(process.argv[2] ?? '');
let window,
  bridge,
  view,
  done = false,
  stopped = false,
  stops = 0,
  begins = 0,
  sink = null,
  credit = 0,
  packet = 0,
  geometry = 0,
  config = 0;
const cases = Object.fromEntries(VIDEO_QUALIFICATION_CASES.map((k) => [k, false]));
let control, landscape, portrait;
let diagnosticBound = false,
  stage = 'ADMISSION',
  rendererState = 'UNOBSERVED',
  failureGeometry = null;
function fail() {
  if (done) return;
  done = true;
  try {
    bridge?.close();
    window?.destroy();
  } catch {}
  if (diagnosticBound) {
    try {
      const diagnostic = {
        version: 1,
        scope: VIDEO_QUALIFICATION_SCOPE,
        head: control.head,
        inputs: control.inputs,
        stage,
        rendererState,
        geometry: failureGeometry,
        cases,
      };
      if (validateVideoDiagnostic(diagnostic))
        writeFileSync(join(root, 'failure.json'), JSON.stringify(diagnostic), { flag: 'wx' });
    } catch {}
  }
  console.error('VIDEO_DECODER_PROBE_FAIL');
  app.exit(1);
}
const deadline = setTimeout(fail, 90000);
async function until(test) {
  for (let n = 0; n < 800; n++) {
    if (done) throw Error();
    const result = await test();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error();
}
async function js(code) {
  return window.webContents.executeJavaScript(code, true);
}
function caller(event) {
  return {
    sender: event.sender,
    isMainFrame: event.senderFrame === window.webContents.mainFrame,
    origin: ORIGIN,
    url: event.senderFrame?.url,
  };
}
function fixedRead(channel, parse, method, answer) {
  ipcMain.handle(channel, (event, raw, ...extra) => {
    const a = view.admit(caller(event));
    try {
      const p = extra.length ? null : parse(raw);
      if (!a.ok || !p?.ok || p.value.method !== method) throw Error();
      const value = answer(p.value);
      if (typeof value !== 'string') throw Error();
      return value;
    } catch {
      fail();
      throw Error('FIXTURE_REQUEST_REJECTED');
    } finally {
      if (a.ok) a.release();
    }
  });
}
async function send(kind, fixture) {
  const bytes =
    kind === 'SESSION' ? new Uint8Array() : kind === 'CONFIG' ? fixture.configuration : fixture.key;
  if (kind === 'SESSION') {
    geometry++;
    config = 0;
  } else if (kind === 'CONFIG') config++;
  // Configuration IDs never reset even when presentation geometry changes.
  const configId = geometry === 1 ? config : kind === 'SESSION' ? 0 : config + 1;
  if (kind !== 'SESSION') packet++;
  await sink.accept(
    Object.freeze({
      version: 1,
      sessionId: '33333333-3333-4333-8333-333333333333',
      attemptId: '44444444-4444-4444-8444-444444444444',
      videoId: VIDEO,
      creditId: ++credit,
      geometryId: geometry,
      configId,
      packetId: kind === 'SESSION' ? 0 : packet,
      kind,
      ptsUs: kind === 'KEY' ? packet : null,
      totalBytes: bytes.length,
      offset: 0,
      width: fixture.width,
      height: fixture.height,
    }),
    bytes,
  );
}
let baselineChrome = null;
const canvasFacts = `(()=>{const c=document.querySelector('canvas[aria-label="Video Device 0001"]');if(!c)return null;const r=c.getBoundingClientRect(),s=getComputedStyle(c),t=c.closest('.tile-footprint').getBoundingClientRect(),p=c.parentElement.querySelector('p').getBoundingClientRect();return {geometry:c.dataset.videoGeometry?.slice(0,513)??null,tile:[t.x,t.y,t.width,t.height],chrome:[p.x,p.y,p.width,p.height],width:c.width,height:c.height,x:r.x,y:r.y,w:r.width,h:r.height,fit:s.objectFit,visible:s.visibility==='visible'&&s.display!=='none',state:c.parentElement.querySelector('small')?.textContent,clear:Array.from(c.getContext('2d').getImageData(0,0,1,1).data).every(v=>v===0)};})()`;
function observeState(v) {
  failureGeometry = null;
  rendererState = VIDEO_DIAGNOSTIC_STATES.includes(v?.state) ? v.state : 'UNRECOGNIZED';
  if (typeof v?.geometry === 'string' && v.geometry.length <= 512) {
    try {
      const g = JSON.parse(v.geometry);
      if (validateVideoGeometry(g)) failureGeometry = g;
    } catch {}
  }
}
async function observe(fixture) {
  const f = await until(async () => {
    const v = await js(canvasFacts);
    observeState(v);
    return v?.state === 'DISPLAYING' && v.width === fixture.width && v.height === fixture.height
      ? v
      : null;
  });
  if (
    !f.visible ||
    f.fit !== 'contain' ||
    ![f.x, f.y, f.w, f.h].every(Number.isFinite) ||
    f.x < 0 ||
    f.y < 0 ||
    f.w < 16 ||
    f.h < 16 ||
    f.w > 1600 ||
    f.h > 1000
  )
    throw Error();
  const scale = Math.min(f.w / fixture.width, f.h / fixture.height),
    cw = fixture.width * scale,
    ch = fixture.height * scale;
  const offsetX = (f.w - cw) / 2,
    offsetY = (f.h - ch) / 2;
  if (Math.abs(cw / ch - fixture.width / fixture.height) > 0.00001 || offsetX < 0 || offsetY < 0)
    throw Error();
  const chrome = [...f.tile, ...f.chrome];
  if (!chrome.every(Number.isFinite) || f.tile[2] <= 0 || f.tile[3] <= 0) throw Error();
  if (baselineChrome && chrome.some((v, i) => Math.abs(v - baselineChrome[i]) > 1)) throw Error();
  baselineChrome ??= chrome;
  const rect = {
    x: Math.floor(f.x),
    y: Math.floor(f.y),
    width: Math.ceil(f.w + 1),
    height: Math.ceil(f.h + 1),
  };
  const image = await window.webContents.capturePage(rect),
    size = image.getSize(),
    bitmap = image.toBitmap();
  if (
    size.width < 1 ||
    size.height < 1 ||
    size.width > 3200 ||
    size.height > 2000 ||
    bitmap.length !== size.width * size.height * 4
  )
    throw Error();
  const boxSample = (x, y) => {
    const px = Math.floor(((f.x - rect.x + x) * size.width) / rect.width),
      py = Math.floor(((f.y - rect.y + y) * size.height) / rect.height);
    if (px < 0 || py < 0 || px >= size.width || py >= size.height) throw Error();
    return [...bitmap.subarray((py * size.width + px) * 4, (py * size.width + px) * 4 + 4)];
  };
  const sample = (x, y) => boxSample(offsetX + x * scale, offsetY + y * scale);
  const dark = sample(8, 8),
    light = sample(fixture.width === 32 ? 24 : 8, fixture.height === 32 ? 24 : 8);
  if (
    !dark.slice(0, 3).every((v) => v <= 8) ||
    !light.slice(0, 3).every((v) => v >= 247) ||
    dark[3] !== 255 ||
    light[3] !== 255
  )
    throw Error();
  // Existing V9 gradient is blue, unlike the synthetic neutral grayscale. Sample
  // letterbox on the dark half, so an actual stretched image cannot pass.
  if (Math.max(offsetX, offsetY) < 3) throw Error();
  const letterbox =
    offsetX >= offsetY
      ? boxSample(offsetX / 2, offsetY + ch / 4)
      : boxSample(offsetX + cw / 4, offsetY / 2);
  if (
    Math.max(...letterbox.slice(0, 3)) < 245 ||
    Math.min(...letterbox.slice(0, 3)) < 225 ||
    Math.max(...letterbox.slice(0, 3)) - Math.min(...letterbox.slice(0, 3)) < 3 ||
    letterbox[3] !== 255
  )
    throw Error();
  return {
    width: fixture.width,
    height: fixture.height,
    dark,
    light,
    letterbox,
    box: [f.x, f.y, f.w, f.h],
    tile: f.tile,
  };
}
try {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    process.versions.electron !== '45.1.0' ||
    process.versions.node !== '24.22.1' ||
    process.argv.length !== 3
  )
    throw Error();
  for (const key of Object.keys(process.env))
    if (/electron/i.test(key) || ['NODE_PATH', 'NODE_OPTIONS', 'ESBUILD_BINARY_PATH'].includes(key))
      throw Error();
  if (
    !lstatSync(root).isDirectory() ||
    lstatSync(root).isSymbolicLink() ||
    realpathSync(root) !== root
  )
    throw Error();
  control = JSON.parse(plain(join(root, 'control.json'), 16384).toString('utf8'));
  if (
    !exact(control, ['version', 'head', 'token', 'desktop', 'inputs']) ||
    control.version !== 1 ||
    !/^[0-9a-f]{40}$/.test(control.head) ||
    !validInputs(control.inputs) ||
    plain(join(root, '.owner'), 36).toString() !== control.token ||
    sha(plain(process.argv[1])) !== control.inputs.probe
  )
    throw Error();
  const desktop = resolve(control.desktop);
  if (
    desktop !== control.desktop ||
    !lstatSync(desktop).isDirectory() ||
    realpathSync(desktop) !== desktop
  )
    throw Error();
  const manifestBytes = plain(join(desktop, 'build/.verified-build.json'));
  if (
    sha(manifestBytes) !== control.inputs.productionManifest ||
    executableHash(process.execPath) !== control.inputs.executable
  )
    throw Error();
  const manifest = JSON.parse(manifestBytes.toString());
  const assets = {};
  for (const name of ['status.html', 'renderer.js', 'v9.css', 'preload.cjs']) {
    const b = plain(join(desktop, 'build', name), 8388608);
    if (manifest.outputs[name] !== sha(b)) throw Error();
    assets[name] = b;
  }
  diagnosticBound = true;
  stage = 'READY';
  for (const name of ['user-data', 'session-data']) mkdirSync(join(root, name));
  app.setPath('userData', join(root, 'user-data'));
  app.setPath('sessionData', join(root, 'session-data'));
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'auto-foundation',
      privileges: { standard: true, secure: true, supportFetchAPI: false, stream: false },
    },
  ]);
  app
    .whenReady()
    .then(async () => {
      const privateSession = session.fromPartition('video-decoder-qualification');
      installSessionPolicy(
        privateSession,
        assets['status.html'].toString(),
        assets['renderer.js'].toString(),
        assets['v9.css'].toString(),
      );
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        show: true,
        webPreferences: {
          ...securePreferences(privateSession),
          preload: join(desktop, 'build/preload.cjs'),
        },
      });
      installWindowPolicy(window);
      view = new ViewSession(window.webContents, ORIGIN, ENTRY, () => {
        void bridge?.close();
      });
      view.beginMainLoad(ENTRY);
      const preferences = window.webContents.getLastWebPreferences();
      cases.sandbox =
        preferences.sandbox === true &&
        preferences.contextIsolation === true &&
        preferences.nodeIntegration === false &&
        preferences.webSecurity === true;
      fixedRead('foundation:preferences:v1', parseSettingsRequest, 'preferences.get', (r) =>
        settingsSuccess(
          r.requestId,
          'OBSERVED',
          {
            revision: 0,
            theme: 'LIGHT',
            dockWidth: null,
            tileWidth: 150,
            persistence: 'PERSISTED',
          },
          'AVAILABLE',
        ),
      );
      fixedRead('foundation:fleet:v1', parseFleetRequest, 'fleet.get', (r) =>
        fleetSuccess(
          r.requestId,
          'OBSERVED',
          {
            registryRevision: 1,
            availability: 'OBSERVED',
            reason: null,
            devices: [
              {
                deviceId: DEVICE,
                generation: 1,
                label: 'Device 0001',
                state: 'DEVICE',
                verification: 'VERIFIED',
              },
            ],
            selection: {
              revision: 0,
              selectedDeviceIds: [DEVICE],
              activeDeviceId: DEVICE,
              groups: [],
            },
          },
          'AVAILABLE',
        ),
      );
      fixedRead('foundation:platform-tools:v2', parseSetupRequest, 'platformTools.get', (r) =>
        setupError(r.requestId, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
      );
      fixedRead('foundation:metadata:v1', parseMetadataRequest, 'metadata.get', (r) =>
        metadataError(r.requestId, 'SESSION_UNAVAILABLE', null, 'DEGRADED'),
      );
      bridge = installVideoStreamBridge(
        ipcMain,
        (e) => view.admit(e && caller(e)),
        (e) => view.admitCleanup(caller(e)),
        () => ({
          reserveVideo(device, revision) {
            if (device !== DEVICE || revision !== 1 || begins || stopped) throw Error();
            return {
              videoId: VIDEO,
              generation: 1,
              deadlineUtc: Date.now() + 30000,
              current: () => !stopped,
              begin(value) {
                begins++;
                sink = value;
                cases.portReady = true;
                return { started: Promise.resolve() };
              },
              stop() {
                stops++;
                stopped = true;
                return Promise.resolve(true);
              },
            };
          },
        }),
      );
      window.webContents.once('did-finish-load', () => {
        if (
          !view.finishInitial({
            sender: window.webContents,
            isMainFrame: true,
            origin: ORIGIN,
            url: window.webContents.getURL(),
          })
        )
          return fail();
        window.webContents.send('foundation:preferences:ready');
      });
      stage = 'LOAD';
      await window.loadURL(ENTRY);
      cases.secureOrigin = await js(
        `location.href==='${ENTRY}'&&window.isSecureContext&&typeof VideoDecoder==='function'&&typeof EncodedVideoChunk==='function'`,
      );
      stage = 'START_BUTTON';
      await until(() =>
        js(
          `(()=>{const b=document.querySelector('button[aria-label="Start video Device 0001"]');return !!b&&!b.disabled;})()`,
        ),
      );
      cases.explicitStart = begins === 0;
      await js(`document.querySelector('button[aria-label="Start video Device 0001"]').click()`);
      stage = 'PORT';
      await until(async () => {
        if (sink) return sink;
        const v = await js(canvasFacts);
        observeState(v);
        return false;
      });
      const wide = generateVideoDecoderFixture('LANDSCAPE'),
        tall = generateVideoDecoderFixture('PORTRAIT');
      stage = 'LANDSCAPE_MEDIA';
      await send('SESSION', wide);
      await send('CONFIG', wide);
      await send('KEY', wide);
      stage = 'LANDSCAPE_OUTPUT';
      landscape = await observe(wide);
      cases.landscapeDecoded = true;
      cases.landscapePlacement = true;
      stage = 'ROTATION';
      await send('SESSION', tall);
      cases.rotationCleared = await js(canvasFacts).then(
        (f) => f?.clear === true && f.state !== 'DISPLAYING',
      );
      stage = 'PORTRAIT_MEDIA';
      await send('CONFIG', tall);
      await send('KEY', tall);
      stage = 'PORTRAIT_OUTPUT';
      portrait = await observe(tall);
      cases.portraitDecoded = true;
      cases.portraitPlacement = true;
      stage = 'STOP';
      if (stops !== 0 || stopped) throw Error();
      await js(`document.querySelector('button[aria-label="Stop video Device 0001"]').click()`);
      await until(async () => {
        const f = await js(canvasFacts);
        return stopped && f?.clear && f.state === 'STOPPED';
      });
      cases.stopCleared = true;
      cases.singleOwnerStop = stops === 1;
      stage = 'STALE';
      // Late old-geometry media after explicit Stop cannot revive the cleared tile.
      let staleRefused = false;
      try {
        await sink.accept(
          {
            version: 1,
            sessionId: '33333333-3333-4333-8333-333333333333',
            attemptId: '44444444-4444-4444-8444-444444444444',
            videoId: VIDEO,
            creditId: ++credit,
            geometryId: 1,
            configId: 1,
            packetId: ++packet,
            kind: 'KEY',
            ptsUs: packet,
            totalBytes: wide.key.length,
            offset: 0,
            width: 32,
            height: 16,
          },
          wide.key,
        );
      } catch {
        staleRefused = true;
      }
      const finalFacts = await js(canvasFacts);
      cases.staleRejected =
        staleRefused && finalFacts.clear && finalFacts.state === 'STOPPED' && stops === 1;
      stage = 'CLOSE';
      if (!(await bridge.close())) throw Error();
      view.close();
      window.once('closed', () => {
        cases.windowClosed = true;
        const result = {
          version: 1,
          scope: VIDEO_QUALIFICATION_SCOPE,
          head: control.head,
          electron: process.versions.electron,
          node: process.versions.node,
          inputs: control.inputs,
          cases,
          landscape,
          portrait,
        };
        if (!validateVideoQualification(result)) return fail();
        const text = JSON.stringify(result);
        if (Buffer.byteLength(text) > 16384) return fail();
        writeFileSync(join(root, 'result.json'), text, { flag: 'wx' });
        done = true;
        clearTimeout(deadline);
        console.log('VIDEO_DECODER_PROBE_PASS');
        app.quit();
      });
      window.close();
    })
    .catch(fail);
  app.on('window-all-closed', () => {
    if (!done) fail();
  });
} catch {
  fail();
}
