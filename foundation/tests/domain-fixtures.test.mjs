import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runNode, root } from '../scripts/run-tool.mjs';
let directory;
let api;
const parent = resolve(root, '.test-output');
function verifyParent() {
  const stat = lstatSync(parent);
  assert.equal(stat.isDirectory() && !stat.isSymbolicLink(), true);
  assert.equal(realpathSync(parent), resolve(realpathSync(root), '.test-output'));
}
before(async () => {
  try {
    mkdirSync(parent);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  verifyParent();
  directory = mkdtempSync(resolve(parent, 'domain-'));
  const result = runNode([
    'node_modules/typescript/bin/tsc',
    '-p',
    'tsconfig.json',
    '--noEmit',
    'false',
    '--rootDir',
    'src/contracts',
    '--outDir',
    directory,
    '--pretty',
    'false',
  ]);
  assert.equal(result.failed, false);
  assert.equal(result.status, 0, 'PURE_SOURCE_COMPILE_FAILED');
  api = await import(pathToFileURL(resolve(directory, 'domain-fixtures.js')).href);
});
after(() => {
  if (!directory) return;
  verifyParent();
  assert.equal(lstatSync(directory).isSymbolicLink(), false);
  assert.equal(realpathSync(directory), resolve(realpathSync(parent), basename(directory)));
  rmSync(directory, { recursive: true, force: false });
});
const id = (n) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;
const empty = () => ({
  contract: 'p1-domain-fixture',
  version: 1,
  correlationId: 'synthetic',
  devices: [],
  bindings: [],
  identities: [],
  accounts: [],
  targets: [],
  evidence: [],
  secrets: [],
  desired: [],
  observed: [],
  effects: [],
  holds: [],
});
function good() {
  return {
    ...empty(),
    devices: [
      { deviceId: id(1), generation: 2 },
      { deviceId: id(2), generation: 4 },
    ],
    bindings: [
      { bindingId: id(3), deviceId: id(1), generation: 2, serial: 'SYNTHETIC-A' },
      { bindingId: id(4), deviceId: id(2), generation: 4, serial: 'SYNTHETIC-B' },
    ],
    identities: [{ identityId: id(5), platform: 'fixture', state: 'VERIFIED', evidenceId: id(6) }],
    accounts: [
      { accountId: id(7), deviceId: id(1), platform: 'fixture', identityId: id(5) },
      { accountId: id(8), deviceId: id(2), platform: 'fixture', identityId: id(5) },
    ],
    targets: [
      { targetId: id(9), accountId: id(7), platform: 'fixture' },
      { targetId: id(10), accountId: id(8), platform: 'fixture' },
    ],
    evidence: [
      { evidenceId: id(6), kind: 'IDENTITY', subjectId: id(5) },
      { evidenceId: id(11), kind: 'EFFECT', subjectId: id(12) },
      { evidenceId: id(13), kind: 'RECOVERY', subjectId: id(12) },
    ],
    secrets: [{ secretRefId: id(14), deviceId: id(1), purpose: 'PROXY_CREDENTIAL' }],
    desired: [{ desiredId: id(15), deviceId: id(1), revision: 7, enabled: true }],
    observed: [
      {
        observationId: id(16),
        deviceId: id(1),
        desiredRevision: 7,
        availability: 'AVAILABLE',
        effectiveEnabled: false,
        source: 'synthetic',
        freshness: 'STALE',
      },
    ],
    effects: [
      {
        effectId: id(12),
        accountId: id(7),
        targetId: id(9),
        bindingId: id(3),
        state: 'UNKNOWN',
        evidenceId: id(11),
      },
    ],
    holds: [{ holdId: id(17), reason: 'UNKNOWN_RECOVERY', subjectIds: [id(12), id(14)] }],
  };
}
const validate = (value) => api.validateDomainSnapshot(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
test('empty snapshot and shared identity graph round trip without mutation', () => {
  for (const value of [empty(), good()]) {
    const bytes = JSON.stringify(value);
    assert.equal(validate(freeze(value)), 'VALID');
    const decoded = JSON.parse(bytes);
    assert.equal(validate(decoded), 'VALID');
    assert.deepEqual(decoded, value);
    assert.equal(JSON.stringify(value), bytes);
  }
});
test('desired and observed stay distinct, all unavailable observations retain null', () => {
  for (const availability of ['UNAVAILABLE', 'UNKNOWN', 'ERROR']) {
    const v = good();
    v.observed[0].availability = availability;
    v.observed[0].effectiveEnabled = null;
    assert.equal(validate(v), 'VALID');
    v.observed[0].effectiveEnabled = false;
    assert.equal(validate(v), 'INVARIANT_VIOLATION');
  }
  const v = good();
  v.observed[0].effectiveEnabled = null;
  assert.equal(validate(v), 'INVARIANT_VIOLATION');
});
test('descriptor-only inspection rejects getters without invocation', () => {
  let calls = 0;
  for (const location of ['root', 'row', 'array']) {
    const v = good();
    const target = location === 'root' ? v : location === 'row' ? v.devices[0] : v.devices;
    const key = location === 'root' ? 'version' : location === 'row' ? 'deviceId' : '0';
    Object.defineProperty(target, key, {
      get() {
        calls++;
        throw new Error('private');
      },
      enumerable: true,
    });
    assert.equal(validate(v), 'INVALID_SHAPE');
  }
  assert.equal(calls, 0);
});
test('reject record prototype, hidden field, symbol, primitive, extra and missing keys', () => {
  for (const value of [null, false, 1, 'private', [], Object.create(null), new Date()])
    assert.equal(validate(value), 'INVALID_SHAPE');
  for (const mutate of [
    (v) => {
      Object.setPrototypeOf(v.devices[0], {});
    },
    (v) => {
      Object.defineProperty(v, 'version', { value: 1, enumerable: false });
    },
    (v) => {
      v[Symbol('private')] = 1;
    },
    (v) => {
      v.nativeCommand = 'private';
    },
    (v) => {
      delete v.correlationId;
    },
    (v) => {
      v.identities[0].displayName = 'private';
    },
  ]) {
    const v = good();
    mutate(v);
    assert.equal(validate(v), 'INVALID_SHAPE');
  }
});
test('reject malformed arrays, cycles, repeated references and functions', () => {
  for (const mutate of [
    (v) => {
      delete v.devices[0];
    },
    (v) => {
      v.devices.extra = 1;
    },
    (v) => {
      v.devices[Symbol('x')] = 1;
    },
    (v) => {
      Object.setPrototypeOf(v.devices, {});
    },
    (v) => {
      v.devices[0] = v;
    },
    (v) => {
      v.devices.push(v.devices[0]);
    },
    (v) => {
      v.correlationId = () => 'x';
    },
  ]) {
    const v = good();
    mutate(v);
    assert.equal(validate(v), 'INVALID_SHAPE');
  }
});
test('throwing and revoked proxies return fixed errors, not sandbox claims', () => {
  assert.equal(
    validate(
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('private');
          },
        },
      ),
    ),
    'INVALID_SHAPE',
  );
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.equal(validate(proxy), 'INVALID_SHAPE');
});
test('collection/reference limits and structural depth/node limits reject', () => {
  const v = empty();
  v.devices = Array.from({ length: 33 }, (_, n) => ({ deviceId: id(n), generation: 0 }));
  assert.equal(validate(v), 'LIMIT_EXCEEDED');
  const h = good();
  h.holds[0].subjectIds = Array.from({ length: 33 }, (_, n) => id(n));
  assert.equal(validate(h), 'LIMIT_EXCEEDED');
  let deep = {};
  for (let n = 0; n < 10; n++) deep = { next: deep };
  assert.equal(validate(deep), 'LIMIT_EXCEEDED');
  const branch = () => Array.from({ length: 32 }, () => ({}));
  const broad = { a: Array.from({ length: 32 }, branch), b: Array.from({ length: 32 }, branch) };
  assert.equal(validate(broad), 'LIMIT_EXCEEDED');
  const at = empty();
  at.devices = Array.from({ length: 32 }, (_, n) => ({ deviceId: id(n), generation: 0 }));
  assert.equal(validate(at), 'VALID');
});
test('shape/version/field precedence and unsupported old/new versions', () => {
  for (const version of [0, -0, -1, 2, Number.MAX_SAFE_INTEGER])
    assert.equal(validate({ ...empty(), version }), 'UNSUPPORTED_VERSION');
  for (const version of [NaN, Infinity, 1.5, true, '1', Number.MAX_SAFE_INTEGER + 1])
    assert.equal(validate({ ...empty(), version }), 'INVALID_FIELD');
  assert.equal(validate({ ...empty(), version: 2, extra: true }), 'INVALID_SHAPE');
  assert.equal(validate({ ...empty(), version: 2, correlationId: '' }), 'UNSUPPORTED_VERSION');
});
test('scalar canonical IDs, correlation, platform, serial and revision boundaries', () => {
  for (const value of ['', 'x'.repeat(65), 'é', 'has space'])
    assert.equal(validate({ ...empty(), correlationId: value }), 'INVALID_FIELD');
  for (const value of ['x', 'x'.repeat(64)])
    assert.equal(validate({ ...empty(), correlationId: value }), 'VALID');
  for (const value of [-0, -1, NaN, Infinity, 0.5, true, Number.MAX_SAFE_INTEGER + 1]) {
    const v = good();
    v.devices[0].generation = value;
    assert.equal(validate(v), 'INVALID_FIELD');
  }
  for (const value of ['', 'a'.repeat(257), 'a b', '\n', 'é']) {
    const v = good();
    v.bindings[0].serial = value;
    assert.equal(validate(v), 'INVALID_FIELD');
  }
  for (const value of ['!', 'a'.repeat(256)]) {
    const v = good();
    v.bindings[0].serial = value;
    assert.equal(validate(v), 'VALID');
  }
  const v = good();
  v.devices[0].deviceId = 'AAAAAAAA-0000-0000-0000-000000000001';
  assert.equal(validate(v), 'INVALID_FIELD');
  v.devices[0].deviceId = id(1);
  v.accounts[0].platform = 'Upper';
  assert.equal(validate(v), 'INVALID_FIELD');
});
test('unknown enum, extra credential and duplicate reference-list fields reject', () => {
  for (const [collection, field] of [
    ['identities', 'state'],
    ['effects', 'state'],
    ['evidence', 'kind'],
    ['secrets', 'purpose'],
    ['observed', 'availability'],
    ['observed', 'freshness'],
    ['holds', 'reason'],
  ]) {
    const v = good();
    v[collection][0][field] = 'UNREVIEWED';
    assert.equal(validate(v), 'INVALID_FIELD');
  }
  const v = good();
  v.secrets[0].password = 'synthetic-secret';
  assert.equal(validate(v), 'INVALID_SHAPE');
  const h = good();
  h.holds[0].subjectIds = [id(12), id(12)];
  assert.equal(validate(h), 'INVALID_FIELD');
});
test('global duplicate IDs and missing/wrong-kind references reject before invariants', () => {
  const d = good();
  d.targets[0].targetId = id(1);
  assert.equal(validate(d), 'DUPLICATE_ID');
  for (const [collection, field, value] of [
    ['bindings', 'deviceId', id(7)],
    ['accounts', 'identityId', id(1)],
    ['targets', 'accountId', id(99)],
    ['effects', 'bindingId', id(1)],
    ['evidence', 'subjectId', id(7)],
    ['secrets', 'deviceId', id(99)],
  ]) {
    const v = good();
    v[collection][0][field] = value;
    assert.equal(validate(v), 'INVALID_REFERENCE');
  }
});
test('stale epochs and duplicate current binding/desired records reject', () => {
  const stale = good();
  stale.bindings[0].generation++;
  assert.equal(validate(stale), 'INVARIANT_VIOLATION');
  for (const collection of ['bindings', 'desired']) {
    const v = good();
    const key = collection === 'bindings' ? 'bindingId' : 'desiredId';
    v[collection].push({ ...v[collection][0], [key]: id(99) });
    assert.equal(validate(v), 'INVARIANT_VIOLATION');
  }
});
test('identity/effect evidence scope and foreign account/device/target fail', () => {
  for (const mutate of [
    (v) => {
      v.identities[0].evidenceId = null;
    },
    (v) => {
      v.identities[0].evidenceId = id(11);
    },
    (v) => {
      v.accounts[0].platform = 'other';
    },
    (v) => {
      v.targets[0].platform = 'other';
    },
    (v) => {
      v.effects[0].targetId = id(10);
    },
    (v) => {
      v.effects[0].bindingId = id(4);
    },
    (v) => {
      v.effects[0].evidenceId = id(6);
    },
    (v) => {
      v.effects[0].state = 'VERIFIED';
      v.effects[0].evidenceId = null;
    },
    (v) => {
      v.observed[0].desiredRevision++;
    },
    (v) => {
      v.desired = [];
    },
  ]) {
    const v = good();
    mutate(v);
    assert.equal(validate(v), 'INVARIANT_VIOLATION');
  }
});
test('nonverified identity evidence never upgrades state, optional references valid', () => {
  for (const state of ['UNVERIFIED', 'CONFLICT', 'RETIRED']) {
    const v = good();
    v.identities[0].state = state;
    v.identities[0].evidenceId = null;
    assert.equal(validate(v), 'VALID');
    assert.equal(v.identities[0].state, state);
  }
  const v = good();
  v.accounts[0].identityId = null;
  assert.equal(validate(v), 'VALID');
});
test('recovery references and holds preserve correct entity kinds', () => {
  const v = good();
  v.evidence[2].subjectId = id(6);
  assert.equal(validate(v), 'INVALID_REFERENCE');
  const h = good();
  h.holds[0].subjectIds = [id(17)];
  assert.equal(validate(h), 'INVALID_REFERENCE');
  const no = good();
  no.holds[0].subjectIds = [id(14)];
  assert.equal(validate(no), 'INVARIANT_VIOLATION');
  no.holds[0].reason = 'QUEUED_WORK';
  assert.equal(validate(no), 'VALID');
});
function transitionBase(state) {
  const v = good();
  v.holds = [];
  v.effects[0].state = state;
  return v;
}
test('effect transition exact positive and forbidden regression matrix', () => {
  const states = ['NOT_DISPATCHED', 'DISPATCH_POSSIBLE', 'UNKNOWN', 'VERIFIED', 'FAILED_KNOWN'];
  for (const a of states)
    for (const b of states) {
      const accepted =
        a === b ||
        (a === 'NOT_DISPATCHED' && b === 'DISPATCH_POSSIBLE') ||
        (a === 'DISPATCH_POSSIBLE' && b === 'UNKNOWN');
      const forbidden = ['UNKNOWN', 'DISPATCH_POSSIBLE'].includes(a) && b === 'NOT_DISPATCHED';
      assert.equal(
        api.compareEffectTransition(transitionBase(a), transitionBase(b), id(12)),
        accepted
          ? 'ACCEPTED_FIXTURE_TRANSITION'
          : forbidden
            ? 'FORBIDDEN_REGRESSION'
            : 'UNSUPPORTED_CASE',
      );
    }
});
test('effect comparison rejects invalid inputs/candidate and any context mutation', () => {
  const a = transitionBase('UNKNOWN');
  assert.equal(api.compareEffectTransition({}, a, id(12)), 'INVALID_SNAPSHOT');
  for (const candidate of ['bad', id(99), null])
    assert.equal(api.compareEffectTransition(a, a, candidate), 'INVALID_CANDIDATE');
  for (const mutate of [
    (v) => {
      v.correlationId = 'other';
    },
    (v) => {
      v.devices.reverse();
    },
    (v) => {
      v.effects[0].evidenceId = null;
    },
    (v) => {
      v.bindings[0].serial = 'SYNTHETIC-OTHER';
    },
    (v) => {
      v.observed[0].effectiveEnabled = true;
    },
  ]) {
    const b = structuredClone(a);
    mutate(b);
    assert.equal(validate(b), 'VALID');
    assert.equal(api.compareEffectTransition(a, b, id(12)), 'CHANGED_CONTEXT');
  }
  const b = structuredClone(a);
  b.effects[0] = Object.fromEntries(Object.entries(b.effects[0]).reverse());
  assert.equal(api.compareEffectTransition(a, b, id(12)), 'ACCEPTED_FIXTURE_TRANSITION');
});
test('claimed binding is exact supplied-fact comparison, no normalization', () => {
  const v = good();
  const claim = { deviceId: id(1), bindingId: id(3), generation: 2, serial: 'SYNTHETIC-A' };
  assert.equal(api.compareClaimedBinding(v, freeze(claim)), 'MATCH_IN_FIXTURE');
  for (const change of [
    { serial: 'synthetic-a' },
    { generation: 3 },
    { deviceId: id(2) },
    { bindingId: id(99) },
  ])
    assert.equal(api.compareClaimedBinding(v, { ...claim, ...change }), 'BINDING_MISMATCH');
  for (const change of [{ serial: '' }, { generation: -0 }, { shell: true }])
    assert.equal(api.compareClaimedBinding(v, { ...claim, ...change }), 'INVALID_CLAIM');
  assert.equal(api.compareClaimedBinding({}, claim), 'INVALID_SNAPSHOT');
});
test('deletion identifies incoming references and never mutates/cascades', () => {
  const v = good(),
    before = JSON.stringify(v);
  for (const target of [id(1), id(5), id(6), id(7), id(9), id(11), id(12), id(14), id(15)])
    assert.equal(api.checkDeletionFixture(v, target), 'REFERENCED');
  for (const target of [id(13), id(16), id(17)])
    assert.equal(api.checkDeletionFixture(v, target), 'UNREFERENCED_IN_FIXTURE');
  assert.equal(api.checkDeletionFixture(v, id(99)), 'INVALID_CANDIDATE');
  assert.equal(api.checkDeletionFixture({}, id(1)), 'INVALID_SNAPSHOT');
  const removed = structuredClone(v);
  removed.effects = [];
  assert.equal(validate(removed), 'INVALID_REFERENCE');
  assert.equal(JSON.stringify(v), before);
});
test('C-21 complete 12-case truth table and malformed controls', () => {
  for (const toolOwned of [false, true])
    for (const completion of ['VERIFIED', 'UNKNOWN', 'NOT_VERIFIED'])
      for (const neededForRecovery of [false, true])
        assert.equal(
          api.checkCleanupFixture({ toolOwned, completion, neededForRecovery }),
          toolOwned && completion === 'VERIFIED' && !neededForRecovery ? 'CANDIDATE' : 'PRESERVE',
        );
  for (const value of [
    {},
    { toolOwned: 1, completion: 'VERIFIED', neededForRecovery: false },
    { toolOwned: true, completion: 'VERIFIED', neededForRecovery: false, path: 'private' },
  ])
    assert.equal(api.checkCleanupFixture(value), 'INVALID_SHAPE');
});

test('primary evidence IDs cannot use nullable-reference rules', () => {
  const v = empty();
  v.devices = [{ deviceId: id(1), generation: 0 }];
  v.evidence = [{ evidenceId: null, kind: 'RECOVERY', subjectId: id(1) }];
  assert.equal(validate(v), 'INVALID_FIELD');
});

test('inspection cannot spoof internal fixed failure classifications', () => {
  for (const code of ['INVALID_FIELD', 'LIMIT_EXCEEDED', 'DUPLICATE_ID', 'VALID'])
    assert.equal(
      validate(
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw code;
            },
          },
        ),
      ),
      'INVALID_SHAPE',
    );
});

test('desired deletion preserves implicit observation revision relationship', () => {
  const v = good();
  assert.equal(api.checkDeletionFixture(v, id(15)), 'REFERENCED');
  v.observed = [];
  assert.equal(api.checkDeletionFixture(v, id(15)), 'UNREFERENCED_IN_FIXTURE');
});
