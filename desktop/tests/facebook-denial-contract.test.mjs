import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { facebookWorkflowDenial } from '../src/facebook-denial-contract.ts';

const cases = [
  ['fb-page-video', 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING'],
  ['fb-page-photo', 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING'],
  ['fb-page-reels', 'PAGE_PERMISSION_AND_CERTIFICATION_MISSING'],
  ['fb-story', 'STORY_SEPARATE_PERMISSION_AND_CERTIFICATION_MISSING'],
  ['fb-group-video', 'GROUP_OUTSIDE_PILOT_SCOPE'],
  ['fb-group-photo', 'GROUP_OUTSIDE_PILOT_SCOPE'],
  ['fb-profile-video', 'PROFILE_OUTSIDE_PILOT_SCOPE'],
  ['fb-profile-photo', 'PROFILE_OUTSIDE_PILOT_SCOPE'],
  ['fb-profile-reels', 'PROFILE_OUTSIDE_PILOT_SCOPE'],
  ['fb-comment-links', 'COMMENT_SCOPE_AND_CERTIFICATION_MISSING'],
  ['fb-reaction-links', 'REACTION_AND_SHARE_OUTSIDE_PILOT_SCOPE'],
];
function assertDenial(result) {
  assert.deepEqual(Object.keys(result), [
    'kind',
    'state',
    'allowed',
    'workflowId',
    'reason',
    'detail',
  ]);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.kind, 'FACEBOOK_WORKFLOW_DENIAL');
  assert.equal(result.state, 'DISABLED');
  assert.equal(result.allowed, false);
  assert.equal(typeof result.detail, 'string');
  assert.ok(result.detail.startsWith('Disabled:'));
  assert.ok(Object.isFrozen(result));
}
for (const [id, reason] of cases) {
  test(`${id} is unconditionally disabled with its exact reason`, () => {
    const result = facebookWorkflowDenial(id);
    assertDenial(result);
    assert.equal(result.workflowId, id);
    assert.equal(result.reason, reason);
  });
}
test('exact existing catalog is covered without deleting or reclassifying other networks', () => {
  const source = readFileSync(new URL('../src/ui/work-pages.tsx', import.meta.url), 'utf8');
  const rows = [...source.matchAll(/id: '([^']+)',\s+network: '([^']+)',/g)];
  assert.equal(rows.length, 21);
  assert.equal(new Set(rows.map((row) => row[2])).size, 9);
  const facebook = rows.filter((row) => row[2] === 'facebook').map((row) => row[1]);
  assert.deepEqual(facebook.sort(), cases.map(([id]) => id).sort());
  assert.equal(rows.filter((row) => row[2] !== 'facebook').length, 10);
  for (const row of rows.filter((entry) => entry[2] !== 'facebook')) {
    assert.equal(facebookWorkflowDenial(row[1]).reason, 'UNKNOWN_WORKFLOW');
  }
});
test('Page, Story, Group, Profile, comments and reactions retain distinct reason families', () => {
  assert.equal(new Set(cases.map(([, reason]) => reason)).size, 6);
  for (const id of ['fb-page-video', 'fb-page-photo', 'fb-page-reels']) {
    const detail = facebookWorkflowDenial(id).detail;
    assert.match(detail, /separate permission and complete technical certification/);
    assert.match(detail, /Catalog or manifest existence grants neither/);
  }
  assert.match(facebookWorkflowDenial('fb-story').detail, /Story requires its own permission/);
  assert.match(
    facebookWorkflowDenial('fb-story').detail,
    /Page, feed-video or Reels approval cannot substitute/,
  );
  for (const id of ['fb-group-video', 'fb-profile-video']) {
    assert.match(facebookWorkflowDenial(id).detail, /outside the accepted pilot scope/);
    assert.match(
      facebookWorkflowDenial(id).detail,
      /Future enablement requires separate permission/,
    );
  }
  assert.match(
    facebookWorkflowDenial('fb-comment-links').detail,
    /verified owned\/administered scope/,
  );
  assert.match(
    facebookWorkflowDenial('fb-comment-links').detail,
    /Arbitrary links do not establish permission/,
  );
  const reactions = facebookWorkflowDenial('fb-reaction-links').detail;
  assert.match(reactions, /Like, Love and Share/);
  assert.match(reactions, /each requires separate permission/);
  assert.match(reactions, /Bulk fake engagement is excluded/);
});
test('unknown, prefix, padded and case-changed strings never resolve or echo input', () => {
  for (const input of [
    '',
    'facebook',
    'fb-page',
    'fb-page-video-extra',
    'FB-PAGE-VIDEO',
    ' fb-page-video',
    'fb-page-video ',
    'fb-page-video\n',
    'fb-page-video\0',
    'fb-like',
    'fb-love',
    'fb-share',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'valueOf',
    '\ud800',
    'x'.repeat(100000),
  ]) {
    const result = facebookWorkflowDenial(input);
    assertDenial(result);
    assert.equal(result.workflowId, null);
    assert.equal(result.reason, 'UNKNOWN_WORKFLOW');
    assert.deepEqual(result, facebookWorkflowDenial(''));
  }
});
test('all non-string primitives, wrappers and containers fail closed without coercion', () => {
  for (const input of [
    undefined,
    null,
    false,
    true,
    0,
    1,
    NaN,
    Infinity,
    1n,
    Symbol('fb-page-video'),
    {},
    [],
    ['fb-page-video'],
    Object.create(null),
    Object('fb-page-video'),
    new Date(0),
    new Map(),
    new Set(),
    () => 'fb-page-video',
  ]) {
    assert.deepEqual(facebookWorkflowDenial(input), facebookWorkflowDenial(''));
  }
});
test('caller accessors and string conversions are never invoked', () => {
  let calls = 0;
  const trap = () => {
    calls++;
    throw Error('must not run');
  };
  const value = {
    get workflowId() {
      return trap();
    },
    get allowed() {
      return trap();
    },
    get ready() {
      return trap();
    },
    toString: trap,
    valueOf: trap,
    [Symbol.toPrimitive]: trap,
  };
  assert.deepEqual(facebookWorkflowDenial(value), facebookWorkflowDenial(''));
  assert.equal(calls, 0);
  assert.equal(Object.isFrozen(value), false);
});
test('hostile and revoked proxies are neither inspected nor executed', () => {
  let calls = 0;
  const trap = () => {
    calls++;
    throw Error('must not run');
  };
  const proxy = new Proxy(
    {},
    { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap },
  );
  const callable = new Proxy(() => 'fb-page-video', { apply: trap, get: trap });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const input of [proxy, callable, revoked.proxy]) {
    assert.deepEqual(facebookWorkflowDenial(input), facebookWorkflowDenial(''));
  }
  assert.equal(calls, 0);
});
test('caller readiness and approval claims are not capability inputs', () => {
  for (const [id] of cases) {
    const input = {
      workflowId: id,
      allowed: true,
      state: 'READY',
      permission: 'APPROVED',
      certification: 'VERIFIED',
      source: 'saved-schedule',
    };
    const original = structuredClone(input);
    assert.equal(facebookWorkflowDenial(input).reason, 'UNKNOWN_WORKFLOW');
    assert.deepEqual(input, original);
    assert.equal(Object.isFrozen(input), false);
    assert.equal(facebookWorkflowDenial(id).allowed, false);
  }
});
test('results cannot be mutated or extended and repeated calls stay denied', () => {
  for (const input of [...cases.map(([id]) => id), 'unknown']) {
    const result = facebookWorkflowDenial(input);
    const original = structuredClone(result);
    assert.throws(() => {
      result.allowed = true;
    }, TypeError);
    assert.throws(() => {
      result.state = 'READY';
    }, TypeError);
    assert.throws(() => {
      result.reason = 'APPROVED';
    }, TypeError);
    assert.throws(() => {
      result.token = {};
    }, TypeError);
    assert.throws(() => {
      delete result.detail;
    }, TypeError);
    assert.deepEqual(result, original);
    assert.deepEqual(facebookWorkflowDenial(input), original);
  }
});
test('source leaf has no imports, runtime consumers or effect operations', () => {
  const root = new URL('../src/', import.meta.url);
  const source = readFileSync(new URL('facebook-denial-contract.ts', root), 'utf8');
  assert.doesNotMatch(source, /^\s*(?:import|export.+from)\s/m);
  for (const term of [
    'fetch(',
    'process.',
    'window.',
    'setTimeout(',
    'Date.',
    'Math.random(',
    'Promise',
  ]) {
    assert.equal(source.includes(term), false, term);
  }
  const paths = readdirSync(root, { recursive: true }).filter((path) => /\.(?:ts|tsx)$/.test(path));
  for (const path of paths.filter((path) => path !== 'facebook-denial-contract.ts')) {
    assert.equal(
      readFileSync(new URL(path, root), 'utf8').includes('facebook-denial-contract'),
      false,
      path,
    );
  }
  const map = JSON.parse(readFileSync(new URL('../module-map.json', import.meta.url), 'utf8'));
  assert.deepEqual(map.modules['facebook-denial-contract.ts'], { role: 'contract', imports: {} });
});

test('Phase09 hosted workflow is exact-branch read-only source/build only with pinned actions', () => {
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-09-facebook-source.yml', import.meta.url),
    'utf8',
  );
  assert.match(raw, /^ {2}workflow_dispatch:$/m);
  assert.match(raw, /^ {4}branches: \[phase-09\]$/m);
  assert.match(raw, /^ {4}if: github\.ref == 'refs\/heads\/phase-09'$/m);
  assert.match(raw, /^permissions:\r?\n {2}contents: read$/m);
  assert.match(raw, /^ {4}runs-on: windows-2022$/m);
  assert.match(raw, /^ {4}timeout-minutes: 15$/m);
  assert.equal((raw.match(/ {6}- uses:/g) ?? []).length, 2);
  assert.match(raw, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(raw, /persist-credentials: false/);
  assert.match(raw, /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
  assert.match(raw, /node-version: '24\.22\.1'/);
  assert.match(raw, /package-manager-cache: false/);
  assert.equal((raw.match(/node desktop\/scripts\/check\.mjs --restore/g) ?? []).length, 1);
  assert.match(raw, /if \(\$LASTEXITCODE -ne 0\) \{ exit \$LASTEXITCODE \}/);
  assert.match(raw, /FACEBOOK_CAPABILITIES_DISABLED/);
  assert.match(raw, /DEVICE_HARDWARE_NOT_RUN/);
  assert.match(raw, /P106_CROSS_USER_UNMET_NOT_RERUN/);
  assert.doesNotMatch(
    raw,
    /pull_request_target|secrets\.|contents: write|upload-artifact|Invoke-|ELECTRON_RUN_AS_NODE|--no-sandbox/,
  );
  const commands = raw
    .split(/\r?\n/)
    .filter((line) => /^ {10}\S/.test(line))
    .map((line) => line.trim());
  assert.deepEqual(commands, [
    'persist-credentials: false',
    "node-version: '24.22.1'",
    'package-manager-cache: false',
    'Write-Output "SOURCE_HEAD=$env:GITHUB_SHA"',
    'node desktop/scripts/check.mjs --restore',
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    "Write-Output 'PHASE09_SOURCE_ONLY'",
    "Write-Output 'FACEBOOK_CAPABILITIES_DISABLED'",
    "Write-Output 'DEVICE_HARDWARE_NOT_RUN'",
    "Write-Output 'P106_CROSS_USER_UNMET_NOT_RERUN'",
  ]);
});
