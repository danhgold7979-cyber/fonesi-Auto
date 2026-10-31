'use strict';
// Verification-only observer of the actual compiled main/preload/React application.
const { app, BrowserWindow, safeStorage } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
const {
  PAGES,
  THEMES,
  LABELS,
  VERSIONS,
  pageKeys,
  imageSpecs,
  caseNames,
  validateResult,
  verifyBundles,
  saveImage,
  write,
} = require('./ui-contract.cjs');
const { preflight, authenticated } = require('./settings-native.cjs');
let state,
  cases,
  pages,
  window,
  complete = false,
  ready = 0,
  closed = 0,
  phase = 'PREPARE';
const images = [],
  originalLog = console.log;
const deadline = setTimeout(() => {
  fs.writeSync(2, 'UI_DEADLINE\n');
  app.exit(74);
}, 110000);
function fail() {
  clearTimeout(deadline);
  if (
    [
      'PREPARE',
      'HYDRATE',
      'PAGES',
      'DROPDOWN',
      'MODAL',
      'DIMENSIONS',
      'RESPONSIVE',
      'CLOSE',
    ].includes(phase)
  )
    fs.writeSync(2, `UI_STAGE_${phase}\n`);
  fs.writeSync(2, 'UI_FAILED\n');
  app.exit(1);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const execute = (code) => window.webContents.executeJavaScript(code);
async function poll(predicate) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await pause(25);
  }
  throw Error('UI_WAIT');
}
async function click(selector) {
  await execute(
    `(() => {const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('CONTROL');n.click();return true;})()`,
  );
  await pause(35);
}
async function help() {
  await click('#help-top');
  await poll(() =>
    execute(
      "!!document.getElementById('preferences-status') && !document.getElementById('preferences-read').disabled && ['OBSERVED','COMMITTED','UNCHANGED'].some(value=>document.getElementById('preferences-status').textContent.startsWith(value+' / PERSISTED / REVISION '))",
    ),
  );
}
async function noModal() {
  await click('#dialog-close');
  await poll(() =>
    execute("!document.getElementById('dialog-shade') && !document.getElementById('shell').inert"),
  );
}
async function readSettings() {
  const { parseSettingsResponse } = require('../build/settings-contract.cjs');
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const value = parseSettingsResponse(await execute('window.preferences.read()'));
    if (value?.ok) return value.settings;
    if (value?.code !== 'BUSY') throw Error('UI_SETTINGS');
    await pause(25);
  }
  throw Error('UI_SETTINGS_BUSY');
}
async function viewport(width, height) {
  window.setContentSize(width, height);
  window.webContents.setZoomFactor(1);
  await pause(400);
  const actual = await execute('({width:innerWidth,height:innerHeight,ratio:devicePixelRatio})');
  if (
    actual.width !== width ||
    actual.height !== height ||
    actual.ratio !== 1 ||
    window.webContents.getZoomFactor() !== 1
  )
    throw Error('UI_VIEWPORT');
}
async function theme(value) {
  if (!THEMES.includes(value)) throw Error('UI_THEME');
  const current = await execute('document.documentElement.dataset.theme');
  if (current !== value) await click('#theme-toggle');
  await poll(() =>
    execute(
      `document.documentElement.dataset.theme===${JSON.stringify(value)} && !document.getElementById('theme-toggle').disabled`,
    ),
  );
  const observed = await readSettings();
  if (observed.theme !== value.toUpperCase()) throw Error('UI_THEME_PERSISTENCE');
}
async function page(value) {
  if (!PAGES.includes(value)) throw Error('UI_PAGE');
  await click(`#nav [data-page="${value}"]`);
  await poll(() =>
    execute(
      `document.getElementById('workspace').dataset.page===${JSON.stringify(value)} && !!document.querySelector('#workspace h1')`,
    ),
  );
  const required = {
    overview: [
      'Tổng quan · Quản lý điện thoại',
      '#overview-search',
      '.device-table',
      '#overview-ops',
    ],
    accounts: [
      'Tài khoản & đích đăng',
      '#accounts-phone',
      '#accounts-network',
      '#accounts-search',
      '.account-list-head',
    ],
    tracking: [
      'Theo dõi tăng trưởng',
      '#tracking-phone',
      '#tracking-network',
      '#tracking-account',
      '.tracking-metrics-grid',
      '.health-table',
    ],
    setup: [
      'Thiết lập điện thoại · media · nội dung',
      '.stepper',
      '#setup-phone',
      '#setup-workflow',
      '#media-table-scroll',
    ],
    calendar: [
      'Quản lý lịch đăng',
      '.cal-toolbar',
      '.calendar-filters',
      '#timeline-scroll',
      '.legend',
    ],
    workflows: ['Quy trình Facebook', '.workflow-tree', '.tree-root'],
  }[value];
  const structure = await execute(
    `(() => { const required=${JSON.stringify(required)};return document.querySelector('#workspace h1').textContent===required[0]&&required.slice(1).every(selector=>document.querySelector('#workspace '+selector)); })()`,
  );
  if (!structure) throw Error('UI_PAGE_STRUCTURE');
  await execute('scrollTo(0,0);true');
  await pause(60);
}
async function geometry(width, height) {
  const value = await execute(
    `(() => {const side=document.querySelector('.side').getBoundingClientRect(),wall=document.getElementById('wall').getBoundingClientRect(),top=document.querySelector('.topbar').getBoundingClientRect();return {width:innerWidth,height:innerHeight,side:side.width,wall:wall.width,top:top.height,wallBelow:wall.top>=top.bottom,columns:getComputedStyle(document.getElementById('shell')).gridTemplateColumns,display:getComputedStyle(document.getElementById('shell')).display};})()`,
  );
  if (value.width !== width || value.height !== height || Math.abs(value.top - 57) > 1)
    throw Error('UI_GEOMETRY');
  if (
    width === 1440 &&
    (Math.abs(value.side - 168) > 1 || Math.abs(value.wall - 400) > 1 || value.wallBelow)
  )
    throw Error('UI_GEOMETRY');
  if (width === 880 && !value.wallBelow) throw Error('UI_GEOMETRY');
  if (width === 600 && value.display !== 'block') throw Error('UI_GEOMETRY');
  return true;
}
async function screenshot(spec) {
  const actual = await execute('({width:innerWidth,height:innerHeight})');
  if (
    actual.width !== spec.width ||
    actual.height !== spec.height ||
    window.webContents.getZoomFactor() !== 1
  )
    throw Error('UI_VIEWPORT');
  images.push(saveImage(state.root, spec, await window.webContents.capturePage()));
}
async function run() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length !== 1) throw Error('UI_WINDOW');
  window = windows[0];
  cases.realMain = true;
  phase = 'HYDRATE';
  await poll(() =>
    execute(
      "!!document.getElementById('help-top') && !document.getElementById('theme-toggle').disabled",
    ),
  );
  await help();
  await authenticated(state, safeStorage);
  cases.originalKeyAuthenticated = true;
  const prefs = window.webContents.getLastWebPreferences();
  cases.sandboxAndIsolation =
    prefs.sandbox === true &&
    prefs.contextIsolation === true &&
    prefs.nodeIntegration === false &&
    prefs.webSecurity === true &&
    (await execute("typeof require==='undefined' && typeof process==='undefined'")) === true;
  // Fixed real public-preference call establishes the visual baseline, followed by
  // visible explicit reconciliation. It is not a claim of native user keystrokes.
  let current = await readSettings();
  if (current.dockWidth !== null || current.tileWidth !== 150) {
    const { parseSettingsResponse } = require('../build/settings-contract.cjs');
    const updated = parseSettingsResponse(
      await execute(
        `window.preferences.update(${current.revision},{dockWidth:null,tileWidth:150})`,
      ),
    );
    if (!updated?.ok) throw Error('UI_BASELINE');
    await click('#preferences-read');
    await poll(() =>
      execute(
        "!document.getElementById('preferences-read').disabled && document.getElementById('preferences-status').textContent.startsWith('OBSERVED / PERSISTED / ')",
      ),
    );
  }
  await noModal();
  await viewport(1440, 900);
  await pause(400);
  const tabs = await execute(
    "Array.from(document.querySelectorAll('#nav [data-page]')).map(n=>({key:n.dataset.page,label:n.querySelector('span:not(.navcount)').textContent.trim()}))",
  );
  cases.exactTabs =
    JSON.stringify(tabs.map((v) => v.key)) === JSON.stringify(PAGES) &&
    JSON.stringify(tabs.map((v) => v.label)) === JSON.stringify(LABELS);
  phase = 'PAGES';
  for (const tone of THEMES) {
    await theme(tone);
    for (const name of PAGES) {
      await page(name);
      const shown = await execute(
        "document.querySelectorAll('#screens-grid .wall-screen,.account-row,.job-block').length===0 && !document.body.textContent.includes('PHONE-01') && !document.body.textContent.includes('SCHEDULED_DEMO')",
      );
      if (!shown) throw Error('UI_PRODUCTION_DATA');
      await geometry(1440, 900);
      pages[`${name}-${tone}`] = true;
      const spec = imageSpecs(state.c.mode).find(
        (item) => item.name === `ui-${state.c.mode}-${name}-${tone}.png`,
      );
      if (spec) await screenshot(spec);
    }
  }
  cases.productionEmpty = true;
  cases.allPagesBothThemes = Object.values(pages).every(Boolean);
  cases.themePersisted = true;
  await page('setup');
  cases.tableScroll = await execute(
    "(() => {const table=document.getElementById('media-table-scroll');if(!table||table.scrollWidth<=table.clientWidth)return false;table.scrollLeft=200;return table.scrollLeft>0;})()",
  );
  await page('calendar');
  for (const [label, count] of [
    ['Tuần', 7],
    ['Tháng', 42],
  ]) {
    await execute(
      `Array.from(document.querySelectorAll('#workspace .segment button')).find(n=>n.textContent===${JSON.stringify(label)}).click();true`,
    );
    await poll(() =>
      execute(`document.querySelectorAll('#workspace .day-card').length===${count}`),
    );
  }
  await execute(
    "Array.from(document.querySelectorAll('#workspace .segment button')).find(n=>n.textContent==='Ngày').click();true",
  );
  await poll(() => execute("!!document.getElementById('timeline-scroll')"));
  await page('workflows');
  await execute(
    "Array.from(document.querySelectorAll('#workspace button')).find(n=>n.textContent==='Mở tất cả').click();true",
  );
  await poll(() =>
    execute(
      "document.querySelectorAll('#workspace .tree-root').length===9 && document.querySelectorAll('#workspace .tree-leaf').length===21",
    ),
  );
  await execute(
    "Array.from(document.querySelectorAll('#workspace button')).find(n=>n.textContent==='Thu gọn').click();true",
  );
  await poll(() => execute("document.querySelectorAll('#workspace .tree-leaf').length===0"));
  for (const name of [...PAGES].reverse()) await page(name);
  cases.repeatedNavigation = await execute(
    "document.querySelectorAll('#workspace').length===1 && !document.getElementById('dialog-shade') && !document.getElementById('shell').inert",
  );
  phase = 'DROPDOWN';
  await click('#wall-device-picker');
  await poll(() => execute("!!document.getElementById('wall-dropdown')"));
  await execute("document.getElementById('wall-search').focus();true");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await poll(() => execute("!document.getElementById('wall-dropdown')"));
  cases.dropdownKeyboard = await execute("document.activeElement.id==='wall-device-picker'");
  phase = 'MODAL';
  await execute("document.getElementById('help-top').focus();true");
  await help();
  await click('#dialog-cancel');
  await poll(() => execute("!document.getElementById('dialog-shade')"));
  cases.modalCancel = await execute("!document.getElementById('shell').inert");
  cases.focusRestored = await execute("document.activeElement.id==='help-top'");
  await help();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await poll(() => execute("!document.getElementById('dialog-shade')"));
  cases.modalEscape = await execute(
    "!document.getElementById('shell').inert && document.activeElement.id==='help-top'",
  );
  phase = 'DIMENSIONS';
  await execute("document.getElementById('wall-resizer').focus();true");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left' });
  await poll(async () => {
    current = await readSettings();
    return current.dockWidth === 410;
  });
  cases.dockResize = await execute(
    "Math.abs(document.getElementById('wall').getBoundingClientRect().width-410)<1",
  );
  await click('.zoomactions button[title="Phóng to"]');
  await poll(async () => {
    current = await readSettings();
    return current.tileWidth === 160;
  });
  cases.tileZoom = await execute("Number(document.getElementById('wall-size').value)===160");
  await click('#wall-reset');
  await poll(async () => {
    current = await readSettings();
    return current.dockWidth === null;
  });
  if (state.c.mode === 'source') {
    phase = 'RESPONSIVE';
    await page('overview');
    for (const width of [880, 600])
      for (const tone of THEMES) {
        await viewport(width, 768);
        await theme(tone);
        await geometry(width, 768);
        const spec = imageSpecs('source').find(
          (item) => item.name === `ui-source-overview-${tone}-${width}.png`,
        );
        await screenshot(spec);
      }
    cases.responsive = true;
  }
  if (
    !Object.entries(cases)
      .filter(([key]) => key !== 'orderlyQuit')
      .every(([, value]) => value)
  )
    throw Error('UI_CASES');
  phase = 'CLOSE';
  complete = true;
  app.quit();
}
try {
  verifyBundles();
  state = preflight(app);
  if (state.c.stage !== 'ui') throw Error('UI_CONTROL');
  cases = Object.fromEntries(caseNames(state.c.mode).map((key) => [key, false]));
  pages = Object.fromEntries(pageKeys().map((key) => [key, false]));
  console.log = (...args) => {
    if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
      ready++;
      if (ready !== 1) fail();
      else setImmediate(() => run().catch(fail));
    }
    if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
    originalLog(...args);
  };
  require('../build/main.cjs');
  app.on('will-quit', () => {
    try {
      if (!complete || ready !== 1 || closed !== 1) throw Error('UI_CLOSE');
      cases.orderlyQuit = true;
      const output = { version: 1, mode: state.c.mode, versions: VERSIONS, cases, pages, images };
      if (
        JSON.stringify(VERSIONS) !==
        JSON.stringify({
          electron: process.versions.electron,
          node: process.versions.node,
          chrome: process.versions.chrome,
        })
      )
        throw Error('UI_VERSION');
      validateResult(JSON.stringify(output));
      write(path.join(state.root, `ui-${state.c.mode}.json`), output);
      clearTimeout(deadline);
      fs.writeSync(1, 'UI_CLOSED\n');
    } catch {
      fail();
    }
  });
} catch {
  fail();
}
