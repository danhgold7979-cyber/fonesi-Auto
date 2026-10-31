'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  PAGES,
  LABELS,
  VERSIONS,
  REFERENCE_SHA256,
  pageKeys,
  imageSpecs,
  caseNames,
  validateResult,
  referenceBytes,
  referencePolicy,
} = require('./ui-contract.cjs');
function valid(mode) {
  return {
    version: 1,
    mode,
    versions: VERSIONS,
    cases: Object.fromEntries(caseNames(mode).map((key) => [key, true])),
    pages: Object.fromEntries(pageKeys().map((key) => [key, true])),
    images: imageSpecs(mode).map((spec) => ({ ...spec, bytes: 100, sha256: 'a'.repeat(64) })),
  };
}
test('exact six-tab order and bounded32 image inventory are fixed and distinct', () => {
  assert.deepEqual(PAGES, ['overview', 'accounts', 'tracking', 'setup', 'calendar', 'workflows']);
  assert.equal(LABELS.length, 6);
  const all = ['source', 'package', 'reference'].flatMap(imageSpecs);
  assert.equal(all.length, 32);
  assert.equal(new Set(all.map((x) => x.name)).size, 32);
  assert.equal(imageSpecs('source').length, 16);
  assert.equal(imageSpecs('package').length, 4);
  assert.equal(imageSpecs('reference').length, 12);
  assert.throws(() => imageSpecs('../outside'));
});
test('all exact result forms preserve false cases rather than synthesize success', () => {
  for (const mode of ['source', 'package', 'reference']) {
    const value = valid(mode);
    assert.deepEqual(validateResult(JSON.stringify(value)), value);
    value.cases[caseNames(mode)[0]] = false;
    value.pages['overview-light'] = false;
    const parsed = validateResult(JSON.stringify(value));
    assert.equal(parsed.cases[caseNames(mode)[0]], false);
    assert.equal(parsed.pages['overview-light'], false);
  }
});
test('result schema rejects duplicate keys, unknown cases, near versions and image drift', () => {
  const raw = JSON.stringify(valid('source'));
  assert.throws(() => validateResult(raw.replace('"version":1', '"version":1,"version":1')));
  assert.throws(() =>
    validateResult(raw.replace('"realMain":true', '"realMain":false,"realMain":true')),
  );
  const mutations = [
    (v) => {
      v.versions = { ...VERSIONS, node: '24.22.2' };
    },
    (v) => {
      v.cases.extra = true;
    },
    (v) => {
      delete v.pages['overview-light'];
    },
    (v) => {
      v.images[0].name = '../private.png';
    },
    (v) => {
      v.images[0].width = 1439;
    },
    (v) => {
      v.images[0].bytes = 4194305;
    },
    (v) => {
      v.images[0].bytes = true;
    },
    (v) => {
      v.images[0].sha256 = 'secret';
    },
    (v) => {
      v.images.pop();
    },
    (v) => {
      v.images.reverse();
    },
  ];
  for (const mutate of mutations) {
    const v = JSON.parse(raw);
    mutate(v);
    assert.throws(() => validateResult(JSON.stringify(v)));
  }
});
test('unchanged reference bytes are hash bound and CSP admits exact blocks only', () => {
  const file = path.resolve(__dirname, '../../ui-reference/Fonesi-Auto-V9-UI-Reference.html'),
    bytes = referenceBytes(file),
    policy = referencePolicy(bytes);
  assert.equal(
    require('node:crypto').createHash('sha256').update(bytes).digest('hex'),
    REFERENCE_SHA256,
  );
  assert.equal((policy.match(/sha256-/g) || []).length, 2);
  assert.ok(policy.includes("style-src-attr 'unsafe-inline'"));
  assert.ok(!policy.includes("script-src 'unsafe-inline'"));
  assert.ok(!policy.includes('unsafe-eval'));
  for (const clause of [
    "connect-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
  ])
    assert.ok(policy.includes(clause));
  const changed = Buffer.from(bytes);
  changed[0] ^= 1;
  assert.throws(() => referencePolicy(changed));
});
test('native probes bind real main and visible help without hidden diagnostics or broad protocol access', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ui-main-probe.cjs'), 'utf8'),
    reference = fs.readFileSync(path.join(__dirname, 'ui-reference-probe.cjs'), 'utf8');
  assert.ok(source.indexOf('verifyBundles();') < source.indexOf("require('../build/main.cjs')"));
  assert.ok(source.includes("await click('#help-top')"));
  assert.ok(source.includes('sendInputEvent'));
  assert.match(reference, /request\.url\s*===\s*URL\s*&&\s*request\.method\s*===\s*'GET'/);
  assert.match(reference, /action:\s*'deny'/);
  assert.ok(reference.includes('frame-src') === false);
  assert.ok(!reference.includes('preload:'));
  assert.match(reference, /nodeIntegration:\s*false/);
  assert.match(reference, /sandbox:\s*true/);
  const old = fs.readFileSync(path.join(__dirname, 'settings-main-probe.cjs'), 'utf8');
  assert.ok(old.includes("document.getElementById('help-top').click()"));
  assert.ok(old.includes('getComputedStyle(document.body).backgroundColor'));
});

test('visible help readiness accepts prior persisted mutations but rejects unknown outcomes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ui-main-probe.cjs'), 'utf8');
  const helper = source.slice(
    source.indexOf('async function help()'),
    source.indexOf('async function noModal()'),
  );
  const match = helper.match(/execute\(\s*("[^\n]+")/);
  assert.ok(match);
  const predicate = JSON.parse(match[1]);
  const evaluate = (status, disabled = false) =>
    require('node:vm').runInNewContext(predicate, {
      document: {
        getElementById(id) {
          return id === 'preferences-status' ? { textContent: status } : { disabled };
        },
      },
    });
  for (const state of ['OBSERVED', 'COMMITTED', 'UNCHANGED'])
    assert.equal(evaluate(`${state} / PERSISTED / REVISION 3 / AUDIT AVAILABLE`), true);
  for (const state of [
    'TIMEOUT / OUTCOME UNKNOWN',
    'PENDING / OUTCOME NOT YET KNOWN',
    'INTERNAL_FAILURE',
    'NOT_READY',
  ])
    assert.equal(evaluate(state), false);
  assert.equal(evaluate('OBSERVED / PERSISTED / REVISION 3', true), false);
});
test('foundation unavailable observation requires exact visible V9 banner rather than hidden text', () => {
  const { VISIBLE_UNAVAILABLE } = require('./runtime-measurements.cjs');
  const { runInNewContext } = require('node:vm');
  let banner = null,
    empty = null;
  const document = {
    querySelector(selector) {
      assert.ok(['.top-demo', '#workspace .empty[role="status"] .muted'].includes(selector));
      return selector === '.top-demo' ? banner : empty;
    },
  };
  const observe = () => runInNewContext(VISIBLE_UNAVAILABLE, { document });
  assert.equal(observe(), false);
  banner = { textContent: 'UNAVAILABLE', getClientRects: () => [1] };
  assert.equal(observe(), false);
  banner.textContent = 'Dịch vụ chưa khả dụng';
  banner.getClientRects = () => [];
  assert.equal(observe(), false);
  banner.getClientRects = () => [1];
  assert.equal(observe(), true);
  // V9 intentionally hides the header badge below1120px; the genuine overview
  // empty-state remains rendered in the foundation640px window.
  banner.getClientRects = () => [];
  empty = {
    textContent: 'Chưa có điện thoại phù hợp. Dịch vụ thiết bị chưa khả dụng.',
    getClientRects: () => [1],
  };
  assert.equal(observe(), true);
  empty.getClientRects = () => [];
  assert.equal(observe(), false);
  empty.getClientRects = () => [1];
  empty.textContent = 'UNAVAILABLE';
  assert.equal(observe(), false);
  const css = fs.readFileSync(path.join(__dirname, '../assets/v9.css'), 'utf8');
  assert.match(css, /@media\(max-width:1120px\)[^@]*\.top-demo\{display:none\}/);
});
test('foundation and degraded probes open genuine help before explicit visible diagnostic read', () => {
  const { MOUNT_DIAGNOSTICS } = require('./runtime-measurements.cjs');
  const { runInNewContext } = require('node:vm');
  const nodes = new Map();
  let opens = 0;
  const document = {
    getElementById(id) {
      return nodes.get(id) ?? null;
    },
  };
  const mount = () => runInNewContext(MOUNT_DIAGNOSTICS, { document });
  assert.equal(mount(), false);
  nodes.set('help-top', {
    click() {
      opens++;
    },
  });
  assert.equal(mount(), false);
  assert.equal(opens, 1);
  nodes.set('health-read', { getClientRects: () => [1] });
  nodes.set('bridge-status', { getClientRects: () => [] });
  assert.equal(mount(), false);
  nodes.set('bridge-status', { getClientRects: () => [1] });
  assert.equal(mount(), true);
  assert.equal(opens, 1);
  for (const name of ['runtime-probe.cjs', 'logging-degraded-probe.cjs']) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.ok(
      source.includes('executeJavaScript(\n              MOUNT_DIAGNOSTICS') ||
        source.includes('executeJavaScript(MOUNT_DIAGNOSTICS'),
    );
  }
  const degraded = fs.readFileSync(path.join(__dirname, 'logging-degraded-probe.cjs'), 'utf8');
  assert.ok(
    degraded.includes(
      "status.getClientRects().length > 0 && status.textContent.includes('LOGGING DEGRADED — diagnostics may be incomplete')",
    ),
  );
});

test('page failure diagnostics emit only fixed page theme and step literals', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ui-main-probe.cjs'), 'utf8');
  const functionText = source.slice(
    source.indexOf('function pageFailureCode('),
    source.indexOf('function fail()'),
  );
  const classify = require('node:vm').runInNewContext(`(${functionText.trim()})`, {
    PAGES,
    THEMES: ['light', 'dark'],
  });
  for (const page of PAGES)
    for (const theme of ['light', 'dark'])
      for (const step of ['THEME', 'NAVIGATE', 'STRUCTURE', 'EMPTY', 'GEOMETRY', 'CAPTURE']) {
        assert.equal(
          classify({ page, theme, step }),
          `UI_PAGE_${page.toUpperCase()}_${theme.toUpperCase()}_${step}`,
        );
      }
  for (const value of [
    null,
    {},
    { page: 'private path', theme: 'light', step: 'EMPTY' },
    { page: 'overview', theme: 'private', step: 'EMPTY' },
    { page: 'overview', theme: 'light', step: 'raw error' },
  ])
    assert.equal(classify(value), null);
  assert.ok(source.includes("phase === 'PAGES' ? pageFailureCode(pageDiagnostic) : null"));
});

test('theme mutation reconciles the visible renderer revision after native geometry writes', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'ui-main-probe.cjs'), 'utf8');
  const text = source.slice(
    source.indexOf('async function theme('),
    source.indexOf('async function page('),
  );
  const calls = [];
  const context = {
    THEMES: ['light', 'dark'],
    execute: async (code) => (code === 'document.documentElement.dataset.theme' ? 'light' : true),
    help: async () => calls.push('help'),
    click: async (selector) => calls.push(selector),
    poll: async (predicate) => {
      assert.equal(await predicate(), true);
    },
    noModal: async () => calls.push('close'),
    readSettings: async () => ({ theme: 'DARK' }),
  };
  const run = require('node:vm').runInNewContext(`(${text.trim()})`, context);
  await run('dark');
  assert.deepEqual(calls, ['#help-top', '#preferences-read', 'close', '#theme-toggle']);
  calls.length = 0;
  context.click = async (selector) => {
    calls.push(selector);
    if (selector === '#theme-toggle') throw Error('STALE_REVISION');
  };
  await assert.rejects(run('dark'), /STALE_REVISION/);
  assert.equal(calls.filter((value) => value === '#theme-toggle').length, 1);
});

test('reference progress markers are six fixed stderr literals bound to completed lifecycle operations', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ui-reference-probe.cjs'), 'utf8');
  const names = ['ENTRY', 'PREPARED', 'LOADED', 'CAPTURED', 'CLOSING', 'WRITTEN'];
  const markers = [...source.matchAll(/fs\.writeSync\(2, 'UI_REFERENCE_PROGRESS_([A-Z]+)\\n'\)/g)];
  assert.deepEqual(
    markers.map((match) => match[1]),
    names,
  );
  const at = (name) => source.indexOf(`UI_REFERENCE_PROGRESS_${name}`);
  assert.ok(at('ENTRY') < source.indexOf("require('./ui-contract.cjs')"));
  assert.ok(at('PREPARED') < source.indexOf('await app.whenReady()'));
  assert.ok(at('LOADED') > source.indexOf('await window.loadURL(URL)'));
  assert.ok(at('CAPTURED') > source.indexOf('images.push(saveImage'));
  assert.ok(at('CLOSING') < source.indexOf('window.close()'));
  assert.ok(at('WRITTEN') > source.indexOf("write(path.join(root, 'ui-reference.json'), output)"));
  assert.equal([...source.matchAll(/fs\.writeSync\(1,/g)].length, 1);
  assert.ok(source.includes("fs.writeSync(1, 'UI_REFERENCE_CLOSED\\n')"));
});
