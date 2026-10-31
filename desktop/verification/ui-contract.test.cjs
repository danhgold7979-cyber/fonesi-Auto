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
