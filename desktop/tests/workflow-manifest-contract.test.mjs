import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  snapshotWorkflowManifest,
  snapshotWorkflowHistory,
  retainWorkflowManifest,
  resolveWorkflowManifest,
} from '../src/workflow-manifest-contract.ts';
const ids = ['fb-page-video', 'fb-page-photo', 'fb-page-reels'];
const publications = [
  'PAGE_FEED_VIDEO_READBACK',
  'PAGE_ORDERED_PHOTO_READBACK',
  'PAGE_REEL_READBACK',
];
// Synthetic declarations only. These hashes do not claim real policy/profile approval.
function fixture(workflowId = ids[0], definitionVersion = 1) {
  const publication = publications[ids.indexOf(workflowId)];
  return {
    schemaVersion: 1,
    kind: 'FIXED_WORKFLOW_MANIFEST',
    workflowId,
    definitionVersion,
    definitionState: 'UNVERIFIED',
    policySha256: 'a'.repeat(64),
    profileSha256: 'b'.repeat(64),
    inputSchemaSha256: 'c'.repeat(64),
    steps: [
      ['RESOLVE_SCOPE', 'READ_ONLY', 'EXACT_DEVICE_ACCOUNT_TARGET_REFERENCES'],
      ['VERIFY_IDENTITY', 'READ_ONLY', 'CURRENT_ACCOUNT_AND_PAGE_IDENTITY'],
      ['VERIFY_POLICY', 'READ_ONLY', 'ACTION_PERMISSION_AND_EXACT_CAPABILITY'],
      ['VALIDATE_MEDIA', 'READ_ONLY', 'EXACT_MEDIA_HASH_KIND_AND_ORDER'],
      ['PREPARE_COMPOSER', 'DEVICE_MUTATION', 'EXACT_COMPOSER_AND_ORDERED_ASSETS'],
      ['FILL_CONTENT', 'DEVICE_MUTATION', 'EXACT_UNICODE_CAPTION_HASHTAGS'],
      ['PUBLISH', 'EXTERNAL_EFFECT', publication],
      ['VERIFY_PUBLICATION', 'READ_ONLY', publication],
      ['PLAN_COMMENTS', 'DECLARATION_ONLY', 'VERIFIED_POST_COMMENT_DEPENDENCY'],
    ].map(([id, effectClass, verification]) => ({
      id,
      effectClass,
      verification,
      timeoutMs: 1000,
      retry: 'NEVER',
    })),
  };
}
const ref = (definitionVersion = 1, workflowId = ids[0]) => ({ workflowId, definitionVersion });
function deeplyFrozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    for (const entry of Object.values(value)) deeplyFrozen(entry);
  }
}
function invalidManifest(change) {
  const value = fixture();
  change(value);
  assert.equal(snapshotWorkflowManifest(value), null);
}
test('all three fixed IDs snapshot only unverified declarations with distinct exact readback', () => {
  for (let i = 0; i < ids.length; i++) {
    const value = fixture(ids[i]);
    const snapshot = snapshotWorkflowManifest(value);
    assert.deepEqual(snapshot, value);
    assert.equal(snapshot.definitionState, 'UNVERIFIED');
    assert.equal(snapshot.steps[6].verification, publications[i]);
    assert.equal(snapshot.steps[7].verification, publications[i]);
    deeplyFrozen(snapshot);
  }
});
test('snapshot owns and freezes copies without freezing or retaining caller objects', () => {
  const value = fixture();
  const expected = structuredClone(value);
  const snapshot = snapshotWorkflowManifest(value);
  assert.notEqual(snapshot, value);
  assert.notEqual(snapshot.steps, value.steps);
  assert.notEqual(snapshot.steps[0], value.steps[0]);
  assert.equal(Object.isFrozen(value), false);
  assert.equal(Object.isFrozen(value.steps), false);
  assert.equal(Object.isFrozen(value.steps[0]), false);
  value.steps[0].timeoutMs = 7;
  value.steps.reverse();
  value.policySha256 = 'd'.repeat(64);
  assert.deepEqual(snapshot, expected);
  assert.throws(() => (snapshot.steps[0].timeoutMs = 7));
});
test('object property order does not alter canonical declaration/version equality', () => {
  const value = fixture();
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  reordered.steps = value.steps.map((step) => Object.fromEntries(Object.entries(step).reverse()));
  const result = retainWorkflowManifest([value], reordered);
  assert.equal(result.disposition, 'IDENTICAL');
  assert.equal(JSON.stringify(result.history[0]), JSON.stringify(snapshotWorkflowManifest(value)));
});
test('unknown workflow IDs and alternate targets never inherit Page declaration acceptance', () => {
  for (const workflowId of [
    'fb-page-story',
    'fb-profile-video',
    'fb-group-photo',
    'fb-reaction',
    'fb-share',
    'other',
    'FB-PAGE-VIDEO',
    '',
    null,
  ])
    invalidManifest((m) => (m.workflowId = workflowId));
});
test('schema kind readiness and closed top-level keys refuse activation or credential fields', () => {
  for (const [key, value] of [
    ['schemaVersion', 2],
    ['kind', 'EXECUTABLE_WORKFLOW'],
    ['definitionState', 'READY'],
    ['definitionState', 'VERIFIED'],
    ['enabled', true],
    ['password', 'SYNTHETIC_PRIVATE'],
    ['execute', () => assert.fail('executed')],
  ])
    invalidManifest((m) => (m[key] = value));
  for (const key of Object.keys(fixture())) invalidManifest((m) => delete m[key]);
});
test('reference strings require exact lowercase SHA-256 spelling without implying certification', () => {
  for (const key of ['policySha256', 'profileSha256', 'inputSchemaSha256']) {
    for (const bad of [
      '',
      'a'.repeat(63),
      'a'.repeat(65),
      'A'.repeat(64),
      'g'.repeat(64),
      `${'a'.repeat(64)}\n`,
      null,
      1,
      {},
    ])
      invalidManifest((m) => (m[key] = bad));
  }
  assert.equal(
    snapshotWorkflowManifest({ ...fixture(), policySha256: '0'.repeat(64) }).definitionState,
    'UNVERIFIED',
  );
});
test('definition versions are exact positive safe integers with no coercion or latest alias', () => {
  for (const bad of [
    0,
    -0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    'latest',
    null,
    1n,
  ])
    invalidManifest((m) => (m.definitionVersion = bad));
  assert.equal(
    snapshotWorkflowManifest(fixture(ids[0], Number.MAX_SAFE_INTEGER)).definitionVersion,
    Number.MAX_SAFE_INTEGER,
  );
});
test('every missing duplicate unknown or reordered fixed step is refused', () => {
  for (let i = 0; i < 9; i++) {
    invalidManifest((m) => m.steps.splice(i, 1));
    invalidManifest((m) => (m.steps[i].id = 'UNKNOWN_STEP'));
    invalidManifest((m) => (m.steps[i].id = m.steps[(i + 1) % 9].id));
    invalidManifest(
      (m) => ([m.steps[i], m.steps[(i + 1) % 9]] = [m.steps[(i + 1) % 9], m.steps[i]]),
    );
  }
  invalidManifest((m) => m.steps.push(m.steps[0]));
  invalidManifest((m) => (m.steps = []));
});
test('each step must retain its fixed effect classification and exact verification', () => {
  for (let i = 0; i < 9; i++) {
    invalidManifest((m) => (m.steps[i].effectClass = 'NONE'));
    invalidManifest((m) => (m.steps[i].verification = 'TOAST_ONLY'));
    for (const key of Object.keys(fixture().steps[0]))
      invalidManifest((m) => delete m.steps[i][key]);
    invalidManifest((m) => (m.steps[i].command = 'unrequested'));
  }
});
test('Page video photo order and Reel proof cannot be substituted for one another', () => {
  for (let i = 0; i < ids.length; i++) {
    for (const stepIndex of [6, 7]) {
      const value = fixture(ids[i]);
      value.steps[stepIndex].verification = publications[(i + 1) % ids.length];
      assert.equal(snapshotWorkflowManifest(value), null);
    }
  }
});
test('composer and Unicode fill remain device mutations while comments remain declarations', () => {
  const snapshot = snapshotWorkflowManifest(fixture());
  assert.equal(snapshot.steps[4].effectClass, 'DEVICE_MUTATION');
  assert.equal(snapshot.steps[5].effectClass, 'DEVICE_MUTATION');
  assert.equal(snapshot.steps[8].effectClass, 'DECLARATION_ONLY');
  assert.equal(snapshot.steps[8].verification, 'VERIFIED_POST_COMMENT_DEPENDENCY');
  invalidManifest((m) => (m.steps[8].effectClass = 'EXTERNAL_EFFECT'));
});
test('positive bounded timeout metadata has no coercion and every retry permission is refused', () => {
  for (let i = 0; i < 9; i++) {
    for (const bad of [0, -0, -1, NaN, Infinity, 0.1, 2147483648, '1000', null])
      invalidManifest((m) => (m.steps[i].timeoutMs = bad));
    for (const bad of ['ON_FAILURE', 'SAFE_READ', true, 1, null])
      invalidManifest((m) => (m.steps[i].retry = bad));
  }
  for (const timeoutMs of [1, 2147483647]) {
    const value = fixture();
    for (const step of value.steps) step.timeoutMs = timeoutMs;
    assert.ok(snapshotWorkflowManifest(value));
  }
});
test('plain records required at both levels; primitives null prototypes and exotic records refuse', () => {
  for (const bad of [
    undefined,
    null,
    [],
    true,
    1,
    'x',
    new Date(),
    Object.create(null),
    () => {},
  ]) {
    assert.equal(snapshotWorkflowManifest(bad), null);
    invalidManifest((m) => (m.steps[0] = bad));
  }
  invalidManifest((m) => Object.setPrototypeOf(m, { inherited: true }));
  invalidManifest((m) => Object.setPrototypeOf(m.steps[0], { inherited: true }));
});
test('getters are never read on manifests steps arrays histories or exact-version references', () => {
  let reads = 0;
  const accessor = {
    enumerable: true,
    get() {
      reads++;
      throw Error('SYNTHETIC_PRIVATE');
    },
  };
  for (const key of Object.keys(fixture()))
    invalidManifest((m) => Object.defineProperty(m, key, accessor));
  for (const key of Object.keys(fixture().steps[0]))
    invalidManifest((m) => Object.defineProperty(m.steps[0], key, accessor));
  invalidManifest((m) => Object.defineProperty(m.steps, '0', accessor));
  const history = [fixture()];
  Object.defineProperty(history, '0', accessor);
  assert.equal(snapshotWorkflowHistory(history), null);
  const reference = ref();
  Object.defineProperty(reference, 'workflowId', accessor);
  assert.deepEqual(resolveWorkflowManifest([fixture()], reference), {
    ok: false,
    code: 'INVALID_REFERENCE',
  });
  assert.equal(reads, 0);
});
test('symbol and non-enumerable fields cannot hide additional authority', () => {
  invalidManifest((m) => (m[Symbol('hidden')] = true));
  invalidManifest((m) => Object.defineProperty(m, 'hidden', { value: true }));
  invalidManifest((m) => Object.defineProperty(m, 'policySha256', { enumerable: false }));
  invalidManifest((m) => (m.steps[0][Symbol('hidden')] = true));
  invalidManifest((m) => Object.defineProperty(m.steps[0], 'id', { enumerable: false }));
});
test('sparse huge subclassed or decorated arrays fail without coercing or invoking elements', () => {
  class OtherArray extends Array {}
  for (const bad of [
    null,
    {},
    new Array(9),
    new Array(4294967295),
    new OtherArray(...fixture().steps),
  ])
    invalidManifest((m) => (m.steps = bad));
  invalidManifest((m) => (m.steps.hidden = true));
  invalidManifest((m) => (m.steps[Symbol('hidden')] = true));
  invalidManifest((m) => Object.defineProperty(m.steps, '0', { enumerable: false }));
});
test('throwing or revoked Proxy reflection fails closed without raw exception data', () => {
  for (const trap of ['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor']) {
    const value = new Proxy(fixture(), {
      [trap]() {
        throw Error('SYNTHETIC_PRIVATE');
      },
    });
    assert.equal(snapshotWorkflowManifest(value), null);
    assert.deepEqual(retainWorkflowManifest([], value), { ok: false, code: 'INVALID_MANIFEST' });
  }
  const revoked = Proxy.revocable(fixture(), {});
  revoked.revoke();
  assert.equal(snapshotWorkflowManifest(revoked.proxy), null);
});
test('empty history is immutable and history snapshots own all nested copies', () => {
  const empty = snapshotWorkflowHistory([]);
  assert.deepEqual(empty, []);
  deeplyFrozen(empty);
  const input = [fixture()];
  const snapshot = snapshotWorkflowHistory(input);
  input[0].steps[0].timeoutMs++;
  input.push(fixture(ids[1]));
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].steps[0].timeoutMs, 1000);
  deeplyFrozen(snapshot);
});
test('history rejects malformed members duplicate identity/version and hidden properties', () => {
  for (const bad of [
    null,
    {},
    new Array(1),
    [null],
    [fixture(), fixture()],
    [fixture(), { ...fixture(), policySha256: 'd'.repeat(64) }],
  ])
    assert.equal(snapshotWorkflowHistory(bad), null);
  const history = [fixture()];
  history.extra = true;
  assert.equal(snapshotWorkflowHistory(history), null);
  assert.ok(snapshotWorkflowHistory([fixture(ids[0]), fixture(ids[1]), fixture(ids[0], 2)]));
});
test('new versions append without changing prior snapshots or resolving old jobs to latest', () => {
  const history = [fixture()];
  const newer = fixture(ids[0], 2);
  newer.steps[0].timeoutMs = 2000;
  const result = retainWorkflowManifest(history, newer);
  assert.equal(result.disposition, 'ADDED');
  assert.equal(history.length, 1);
  assert.equal(result.history.length, 2);
  assert.equal(resolveWorkflowManifest(result.history, ref(1)).manifest.steps[0].timeoutMs, 1000);
  assert.equal(resolveWorkflowManifest(result.history, ref(2)).manifest.steps[0].timeoutMs, 2000);
  assert.deepEqual(resolveWorkflowManifest(result.history, ref(3)), {
    ok: false,
    code: 'NOT_FOUND',
  });
  deeplyFrozen(result);
});
test('identical retries are idempotent and every changed dependency reference or timeout conflicts', () => {
  assert.equal(retainWorkflowManifest([fixture()], fixture()).disposition, 'IDENTICAL');
  for (const key of ['policySha256', 'profileSha256', 'inputSchemaSha256']) {
    const changed = fixture();
    changed[key] = 'd'.repeat(64);
    assert.deepEqual(retainWorkflowManifest([fixture()], changed), {
      ok: false,
      code: 'VERSION_CONFLICT',
    });
  }
  for (let i = 0; i < 9; i++) {
    const changed = fixture();
    changed.steps[i].timeoutMs++;
    assert.deepEqual(retainWorkflowManifest([fixture()], changed), {
      ok: false,
      code: 'VERSION_CONFLICT',
    });
  }
});
test('new workflow same version and restored older versions retain their exact identity', () => {
  const first = retainWorkflowManifest([fixture(ids[0], 2)], fixture(ids[0], 1));
  const second = retainWorkflowManifest(first.history, fixture(ids[1], 1));
  assert.deepEqual(
    second.history.map((m) => [m.workflowId, m.definitionVersion]),
    [
      [ids[0], 2],
      [ids[0], 1],
      [ids[1], 1],
    ],
  );
  assert.equal(resolveWorkflowManifest(second.history, ref(1, ids[1])).manifest.workflowId, ids[1]);
});
test('history serialization bound refuses overflow but permits identical retry at capacity', () => {
  const history = Array.from({ length: 128 }, (_, i) => fixture(ids[0], i + 1));
  assert.equal(snapshotWorkflowHistory(history).length, 128);
  assert.equal(snapshotWorkflowHistory([...history, fixture(ids[0], 129)]), null);
  assert.deepEqual(retainWorkflowManifest(history, fixture(ids[0], 129)), {
    ok: false,
    code: 'HISTORY_FULL',
  });
  assert.equal(retainWorkflowManifest(history, fixture()).disposition, 'IDENTICAL');
});
test('invalid history and candidate fail with closed codes and no partial result', () => {
  assert.deepEqual(retainWorkflowManifest([null], fixture()), {
    ok: false,
    code: 'INVALID_HISTORY',
  });
  assert.deepEqual(retainWorkflowManifest([], null), { ok: false, code: 'INVALID_MANIFEST' });
  assert.deepEqual(resolveWorkflowManifest([null], ref()), { ok: false, code: 'INVALID_HISTORY' });
  deeplyFrozen(retainWorkflowManifest([], null));
});
test('exact-version resolution never defaults missing unknown or extra reference fields', () => {
  const history = [fixture()];
  for (const bad of [
    null,
    {},
    { workflowId: ids[0] },
    { definitionVersion: 1 },
    { ...ref(), latest: true },
    ref('1'),
    ref(0),
    ref(1, 'fb-group-video'),
    Object.assign(Object.create(null), ref()),
  ])
    assert.deepEqual(resolveWorkflowManifest(history, bad), {
      ok: false,
      code: 'INVALID_REFERENCE',
    });
  assert.deepEqual(resolveWorkflowManifest(history, ref(1, ids[1])), {
    ok: false,
    code: 'NOT_FOUND',
  });
  assert.deepEqual(resolveWorkflowManifest([], ref()), { ok: false, code: 'NOT_FOUND' });
});
test('failed replacement preserves caller state and previously returned version snapshot', () => {
  const history = [fixture()];
  const before = structuredClone(history);
  const old = resolveWorkflowManifest(history, ref());
  const changed = fixture();
  changed.profileSha256 = 'f'.repeat(64);
  assert.equal(retainWorkflowManifest(history, changed).ok, false);
  assert.deepEqual(history, before);
  assert.deepEqual(old.manifest, before[0]);
  deeplyFrozen(old);
});
test('all source imports remain absent; graph and build input registration do not activate runtime', () => {
  const map = JSON.parse(readFileSync(new URL('../module-map.json', import.meta.url), 'utf8'));
  assert.deepEqual(map.modules['workflow-manifest-contract.ts'], { role: 'contract', imports: {} });
  for (const entry of Object.values(map.modules))
    assert.equal(
      Object.keys(entry.imports).some((name) =>
        /workflow-manifest-contract\.(?:ts|js)$/.test(name),
      ),
      false,
    );
  const source = readFileSync(
    new URL('../src/workflow-manifest-contract.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /^import\b/m);
  const build = readFileSync(new URL('../scripts/build-manifest.mjs', import.meta.url), 'utf8');
  assert.match(build, /'src\/workflow-manifest-contract\.ts'/);
});

test('Phase08 hosted workflow is exact-branch read-only source/build only with pinned actions', () => {
  const raw = readFileSync(
    new URL('../../.github/workflows/phase-08-workflow-source.yml', import.meta.url),
    'utf8',
  );
  assert.match(raw, /^ {2}workflow_dispatch:$/m);
  assert.match(raw, /^ {4}branches: \[phase-08\]$/m);
  assert.match(raw, /^ {4}if: github\.ref == 'refs\/heads\/phase-08'$/m);
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
  assert.match(raw, /WORKFLOW_DISPATCH_UNAVAILABLE/);
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
    "Write-Output 'PHASE08_SOURCE_ONLY'",
    "Write-Output 'WORKFLOW_DISPATCH_UNAVAILABLE'",
    "Write-Output 'DEVICE_HARDWARE_NOT_RUN'",
    "Write-Output 'P106_CROSS_USER_UNMET_NOT_RERUN'",
  ]);
});
