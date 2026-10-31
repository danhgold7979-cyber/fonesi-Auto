'use strict';
// Injected only into the hash-bound verification copy, never the shipped demo build.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const {
  plain,
  read,
  exact,
  write,
  VERSIONS,
  caseNames,
  imageSpecs,
  validateResult,
  saveImage,
} = require('./demo-contract.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const INJECTION = '\nrequire("../verification/demo-probe.cjs");\n';
const root = path.resolve(__dirname, '..'),
  output = path.join(root, 'demo-build');
let mode,
  window,
  complete = false,
  quitting = false,
  phase = 'ADMISSION';
let cases;
const images = [];
const deadline = setTimeout(() => {
  fs.writeSync(2, 'DEMO_PROBE_DEADLINE\n');
  app.exit(74);
}, 110000);
function fail() {
  clearTimeout(deadline);
  if (['ADMISSION', 'READY', 'PAGES', 'SELECTION', 'STORAGE', 'CLOSE'].includes(phase))
    fs.writeSync(2, `DEMO_PROBE_STAGE_${phase}\n`);
  fs.writeSync(2, 'DEMO_PROBE_FAILED\n');
  app.exit(1);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function execute(code) {
  if (window?.webContents.getURL() !== 'fonesi-demo://app/index.html') throw Error('DEMO_ORIGIN');
  return window.webContents.executeJavaScript(code);
}
async function poll(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(25);
  }
  throw Error('DEMO_POLL');
}
async function click(selector) {
  await execute(
    `(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node||node.disabled)throw Error('CONTROL');node.click();return true;})()`,
  );
}
async function theme(value) {
  if ((await execute('document.documentElement.dataset.theme')) !== value)
    await click('#theme-toggle');
  await poll(() => execute(`document.documentElement.dataset.theme===${JSON.stringify(value)}`));
  await pause(60);
}
async function page(value) {
  await click(`#nav [data-page="${value}"]`);
  await poll(() =>
    execute(`document.querySelector('#nav [data-page="${value}"]').classList.contains('active')`),
  );
  await pause(60);
}
async function banner() {
  return execute(
    "(()=>{const n=document.getElementById('demo-banner'),r=n?.getBoundingClientRect();return !!n&&n.textContent.includes('DEMO — DỮ LIỆU GIẢ LẬP / KHÔNG ĐIỀU KHIỂN THIẾT BỊ')&&n.dataset.demoFixture==='FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1'&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&!n.inert&&getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).display!=='none'&&Number(getComputedStyle(n).opacity)>0&&n.contains(document.elementFromPoint(r.left+Math.min(40,r.width/2),r.top+Math.min(18,r.height/2)));})()",
  );
}
async function capture(name) {
  const spec = imageSpecs(mode).find((value) => value.name === name);
  if (!spec) throw Error('DEMO_IMAGE');
  window.setContentSize(spec.width, spec.height);
  await poll(() => execute(`innerWidth===${spec.width}&&innerHeight===${spec.height}`));
  if (window.webContents.getZoomFactor() !== 1) throw Error('DEMO_ZOOM');
  await pause(80);
  images.push(saveImage(root, spec, await window.webContents.capturePage()));
}
async function run() {
  phase = 'READY';
  await poll(async () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length !== 1) return false;
    window = windows[0];
    return (
      window.isVisible() &&
      window.webContents.getURL() === 'fonesi-demo://app/index.html' &&
      (await execute(
        "!!document.getElementById('demo-banner')&&!!document.getElementById('theme-toggle')",
      ))
    );
  });
  const prefs = window.webContents.getLastWebPreferences();
  cases.sandboxAndIsolation =
    prefs.sandbox === true &&
    prefs.contextIsolation === true &&
    prefs.nodeIntegration === false &&
    prefs.webSecurity === true &&
    (await execute("typeof require==='undefined'&&typeof process==='undefined'"));
  cases.isolatedOrigin = await execute("location.origin==='fonesi-demo://app'");
  cases.noPreloadOrIpc =
    window.webContents.session.getPreloadScripts().length === 0 &&
    (await execute(
      "typeof window.foundation==='undefined'&&typeof window.preferences==='undefined'&&typeof window.require==='undefined'",
    ));
  phase = 'PAGES';
  let all = true;
  for (const tone of ['light', 'dark']) {
    await theme(tone);
    for (const name of ['overview', 'accounts', 'tracking', 'setup', 'calendar', 'workflows']) {
      await page(name);
      all = all && (await banner());
      if (name === 'overview' && (mode === 'source' || tone === 'light'))
        await capture(`demo-${mode}-overview-${tone}.png`);
    }
  }
  cases.allSixTabs = await execute(
    "Array.from(document.querySelectorAll('#nav [data-page]')).map(n=>n.dataset.page).join('|')==='overview|accounts|tracking|setup|calendar|workflows'",
  );
  cases.bannerEveryPage = all;
  cases.bannerBothThemes = all;
  await theme('light');
  await page('setup');
  cases.media25Reachable = await execute(
    "(()=>{const area=document.getElementById('media-table-scroll'),rows=area?.querySelectorAll('tbody .filecol');if(rows?.length!==25||area.scrollHeight<=area.clientHeight)return false;area.scrollTop=area.scrollHeight;return area.scrollTop>0&&rows[24].textContent.includes('DEMO-');})()",
  );
  const deviceCount = await execute(
    "document.querySelectorAll('#setup-phone option[value]').length===4",
  );
  await page('accounts');
  const accountCount = await execute(
    "document.querySelectorAll('#workspace .account-row').length===3",
  );
  await page('calendar');
  await execute(
    "(()=>{const input=document.querySelector('input[aria-label=\"Ngày lịch\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-10-31');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()",
  );
  await poll(() => execute("document.querySelectorAll('#workspace .job-block').length===3"));
  const jobCount = await execute("document.querySelectorAll('#workspace .job-block').length===3");
  cases.syntheticFixtureCounts = deviceCount && accountCount && jobCount && cases.media25Reachable;
  await page('setup');
  if (mode === 'source') {
    await execute("document.getElementById('media-table-scroll').scrollTop=0;true");
    await capture('demo-source-setup-light.png');
  }
  phase = 'SELECTION';
  await execute(
    "(()=>{const s=document.getElementById('setup-phone');s.value='DEMO-DEVICE-1';s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()",
  );
  await poll(() => execute("document.getElementById('setup-phone').value==='DEMO-DEVICE-1'"));
  cases.dependentSelection = await execute(
    "(()=>{const menu=document.querySelector('#setup-identity .identity-menu');return !!menu&&menu.textContent.includes('DEMO Tài khoản giả lập 1')&&!menu.textContent.includes('DEMO Tài khoản giả lập 2');})()",
  );
  await click('#help-top');
  await poll(() => execute("!!document.getElementById('dialog-shade')"));
  cases.bannerWithModal = await banner();
  window.setContentSize(600, 768);
  await poll(() => execute('innerWidth===600'));
  cases.bannerWithModal = cases.bannerWithModal && (await banner());
  window.setContentSize(1440, 900);
  await poll(() => execute('innerWidth===1440'));
  await click('#dialog-cancel');
  await poll(() => execute("!document.getElementById('dialog-shade')"));
  await execute(
    "Array.from(document.querySelectorAll('#workspace button')).find(n=>n.textContent.trim()==='Lập lịch hàng loạt').click();true",
  );
  await poll(() => execute("!!document.getElementById('dialog-shade')"));
  cases.domainUnavailable = await execute(
    "document.querySelector('.dialog').textContent.includes('chưa')&&!document.querySelector('.dialog').textContent.includes('thành công')",
  );
  await click('#dialog-cancel');
  await poll(() => execute("!document.getElementById('dialog-shade')"));
  phase = 'STORAGE';
  await theme('dark');
  cases.localPreferenceReadback = await execute(
    "localStorage.getItem('fonesi.demo.preferences.v1')===JSON.stringify({version:1,theme:'DARK',dockWidth:null,tileWidth:150})",
  );
  await execute(
    'localStorage.setItem(\'demo-verification-other-key\',\'PRESERVE\');localStorage.setItem(\'fonesi.demo.preferences.v1\',\'{"version":1,"theme":"LIGHT","theme":"DARK","dockWidth":null,"tileWidth":150}\');true',
  );
  await new Promise((resolve) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.reload();
  });
  await poll(() =>
    execute(
      "!!document.getElementById('demo-banner')&&document.documentElement.dataset.theme==='light'",
    ),
  );
  cases.invalidPreferenceDefaults = await execute(
    "localStorage.getItem('fonesi.demo.preferences.v1')===null&&localStorage.getItem('demo-verification-other-key')==='PRESERVE'",
  );
  await execute(
    "window.__demoOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('DENIED','SecurityError')};true",
  );
  try {
    await click('#theme-toggle');
    await poll(() =>
      execute(
        "document.getElementById('demo-storage-state').textContent.includes('DEMO · CHƯA LƯU')",
      ),
    );
    cases.deniedPreferenceVisible =
      (await banner()) &&
      (await execute(
        "document.documentElement.dataset.theme==='dark'&&localStorage.getItem('demo-verification-other-key')==='PRESERVE'",
      ));
  } finally {
    await execute(
      "Storage.prototype.setItem=window.__demoOriginalSetItem;delete window.__demoOriginalSetItem;localStorage.removeItem('demo-verification-other-key');true",
    );
  }
  phase = 'CLOSE';
  complete = true;
  app.quit();
}
try {
  plain(root);
  plain(output);
  const proof = exact(read(path.join(root, '.verification-provenance.json')), [
    'version',
    'mode',
    'originalMainSha256',
    'derivedMainSha256',
    'injectionSha256',
    'originalOutputs',
    'observerSha256',
  ]);
  mode = proof.mode;
  if (proof.version !== 1 || !['source', 'package'].includes(mode)) throw Error('DEMO_PROOF');
  const current = fs.readFileSync(path.join(output, 'main.cjs')),
    text = current.toString('utf8');
  if (
    hash(current) !== proof.derivedMainSha256 ||
    hash(Buffer.from(INJECTION)) !== proof.injectionSha256 ||
    text.split(INJECTION).length !== 2 ||
    !text.startsWith(
      '// demo-owned:demo/main.ts\nvar import_electron = require("electron");\n' + INJECTION,
    ) ||
    hash(Buffer.from(text.replace(INJECTION, ''))) !== proof.originalMainSha256 ||
    hash(fs.readFileSync(__filename)) !== proof.observerSha256
  )
    throw Error('DEMO_DERIVATION');
  const manifest = exact(read(path.join(output, '.verified-demo-build.json')), [
    'version',
    'mode',
    'inputs',
    'outputs',
  ]);
  for (const [name, digest] of Object.entries(proof.originalOutputs)) {
    if (name === 'main.cjs') {
      if (digest !== proof.originalMainSha256 || manifest.outputs[name] !== proof.derivedMainSha256)
        throw Error('DEMO_DERIVATION');
    } else if (
      hash(fs.readFileSync(path.join(output, name))) !== digest ||
      manifest.outputs[name] !== digest
    )
      throw Error('DEMO_DERIVATION');
  }
  const marker = exact(read(path.join(root, 'session/.demo-owner.json')), [
    'version',
    'kind',
    'ownerToken',
  ]);
  cases = Object.fromEntries(caseNames(mode).map((name) => [name, false]));
  cases.verifiedDemoBuild = true;
  cases.explicitArgument =
    process.argv.length === 3 &&
    process.argv[1] === path.join(output, 'main.cjs') &&
    process.argv[2] === '--demo';
  cases.ownedProfile =
    process.env.FONESI_BOOTSTRAP_ROOT === path.join(root, 'session/profile') &&
    marker.version === 1 &&
    marker.kind === 'FONESI_DEMO' &&
    /^[0-9a-f-]{36}$/.test(marker.ownerToken);
  if (
    JSON.stringify({
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }) !== JSON.stringify(VERSIONS)
  )
    throw Error('DEMO_VERSION');
  app.on('will-quit', () => {
    quitting = true;
  });
  app.on('quit', () => {
    clearTimeout(deadline);
    if (!complete || !quitting) return;
    cases.orderlyQuit = true;
    const result = {
      version: 1,
      mode,
      versions: VERSIONS,
      cases,
      images: imageSpecs(mode).map((spec) => images.find((image) => image.name === spec.name)),
    };
    validateResult(JSON.stringify(result));
    write(path.join(root, `demo-${mode}.json`), result);
    fs.writeSync(1, 'DEMO_VERIFIED\n');
  });
  void app
    .whenReady()
    .then(() => run())
    .catch(fail);
} catch {
  fail();
}
