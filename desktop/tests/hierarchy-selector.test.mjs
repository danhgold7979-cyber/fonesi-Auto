// Supplied synthetic hierarchy only; no Android acquisition, identity or dispatch proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeHierarchyXml, validateHierarchyXml } from '../src/main/capture-contract.ts';
import { resolveHierarchySelector as resolve } from '../src/main/hierarchy-selector.ts';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const display = () => ({
  version: 1,
  evidenceId: id(1),
  deviceId: id(2),
  bindingId: id(3),
  generation: 1,
  serial: 'synthetic-device',
  displayId: 0,
  width: 100,
  height: 200,
  rotation: 0,
  orientationEpoch: 1,
  observedUtc: 100,
  validUntilUtc: 200,
  source: 'SYNTHETIC_TEST',
});
const node = (extra = '', children = '') =>
  `<node index="0" class="View" package="synthetic.app" bounds="[0,0][50,50]" enabled="true" visible-to-user="true" ${extra}>${children}</node>`;
const xml = (nodes) => `<hierarchy rotation="0">${nodes}</hierarchy>`;
function fixture(nodes = node('text="Xin chào 😀" resource-id="id/title"')) {
  const normalized = normalizeHierarchyXml(xml(nodes), display());
  assert.equal(normalized.ok, true);
  const tree = normalized.tree;
  const profile = {
    version: 1,
    kind: 'SUPPLIED_EXACT_V1',
    profileId: 'synthetic-v1',
    appPackage: 'synthetic.app',
    appVersion: '1.0',
    locale: 'vi-VN',
    treeSha256: tree.sha256,
  };
  const current = {
    profileId: profile.profileId,
    appPackage: profile.appPackage,
    appVersion: profile.appVersion,
    locale: profile.locale,
    display: display(),
    connected: true,
  };
  const query = { version: 1, predicates: [{ field: 'resourceId', value: 'id/title' }] };
  return { tree, profile, current, query, run: () => resolve(tree, profile, query, current, 150) };
}
test('actual scanner normalizes nested Unicode and preserves immutable hierarchy without authority', () => {
  const f = fixture(
    node('text="cha"', node('text="Xin chào 😀" resource-id="id/title" content-desc="Nội dung"')),
  );
  assert.equal(f.tree.source, 'SUPPLIED_HIERARCHY_V1');
  assert.deepEqual(f.tree.nodes[0].childOrdinals, [1]);
  assert.equal(f.tree.nodes[1].parentOrdinal, 0);
  assert.equal(f.tree.nodes[1].text, 'Xin chào 😀');
  assert.equal(f.tree.nodes[1].flags.clickable, null);
  assert.ok(
    Object.isFrozen(f.tree) &&
      Object.isFrozen(f.tree.nodes) &&
      Object.isFrozen(f.tree.nodes[0].flags),
  );
  assert.throws(() => {
    f.tree.nodes[0].childOrdinals.push(7);
  }, TypeError);
  assert.deepEqual(f.run(), {
    status: 'UNIQUE',
    code: 'OK',
    nodeOrdinal: 1,
    matchedCount: 1,
    source: 'SUPPLIED_HIERARCHY_V1',
  });
  const legacy = validateHierarchyXml(xml(node()), display());
  assert.equal(legacy.ok, true);
  assert.equal(legacy.nodeCount, 1);
  assert.equal('nodes' in legacy, false);
});
test('duplicate semantic IDs stay ambiguous; predicates are conjunction, never fallback or partial match', () => {
  const f = fixture(
    node('resource-id="id/title" text="one"') + node('resource-id="id/title" text="two"'),
  );
  assert.equal(f.run().status, 'AMBIGUOUS');
  assert.equal(f.run().matchedCount, 2);
  f.query.predicates.push({ field: 'text', value: 'two' });
  assert.equal(f.run().nodeOrdinal, 1);
  f.query.predicates[1].value = 'tw';
  assert.equal(f.run().status, 'NOT_FOUND');
  f.query.predicates[1].value = 'absent';
  assert.equal(f.run().status, 'NOT_FOUND');
});
test('missing eligibility is unavailable; hidden disabled zero and offscreen bounds never produce a node', () => {
  for (const [change, status] of [
    [(s) => s.replace('enabled="true"', ''), 'UNAVAILABLE'],
    [(s) => s.replace('visible-to-user="true"', ''), 'UNAVAILABLE'],
    [(s) => s.replace('enabled="true"', 'enabled="false"'), 'NOT_FOUND'],
    [(s) => s.replace('visible-to-user="true"', 'visible-to-user="false"'), 'NOT_FOUND'],
    [(s) => s.replace('[0,0][50,50]', '[0,0][0,50]'), 'UNAVAILABLE'],
    [(s) => s.replace('[0,0][50,50]', '[-1,0][50,50]'), 'UNAVAILABLE'],
    [(s) => s.replace('[0,0][50,50]', '[0,0][101,50]'), 'UNAVAILABLE'],
  ]) {
    const f = fixture(change(node('resource-id="id/title"')));
    assert.equal(f.run().status, status);
    assert.equal(f.run().nodeOrdinal, null);
  }
  const f = fixture(
    node('resource-id="id/title"') + node('resource-id="id/title"').replace('enabled="true"', ''),
  );
  assert.equal(f.run().status, 'UNAVAILABLE');
});
test('supplied freshness binds exact display generation and context without a new age threshold', () => {
  for (const [key, value, code] of [
    ['generation', 2, 'BINDING_CHANGED'],
    ['bindingId', id(8), 'BINDING_CHANGED'],
    ['rotation', 90, 'ROTATED'],
    ['orientationEpoch', 2, 'ROTATED'],
    ['evidenceId', id(9), 'STALE_CAPTURE'],
    ['validUntilUtc', 201, 'STALE_CAPTURE'],
  ]) {
    const f = fixture();
    f.current.display[key] = value;
    assert.equal(f.run().code, code);
  }
  for (const key of ['appVersion', 'appPackage', 'profileId', 'locale']) {
    const f = fixture();
    f.current[key] = 'changed';
    assert.equal(f.run().code, 'CONTEXT_CHANGED');
  }
  const f = fixture();
  assert.equal(resolve(f.tree, f.profile, f.query, f.current, 199).status, 'UNIQUE');
  assert.equal(resolve(f.tree, f.profile, f.query, f.current, 200).code, 'STALE_CAPTURE');
  assert.equal(resolve(f.tree, f.profile, f.query, f.current, 99).code, 'STALE_CAPTURE');
  f.current.connected = false;
  assert.equal(f.run().code, 'DISCONNECTED');
});
test('closed descriptors reject getters forged trees malformed queries and unsafe profiles without calling accessors', () => {
  for (const target of ['tree', 'profile', 'query', 'current']) {
    const f = fixture();
    let calls = 0;
    const clone = { ...f[target] };
    const key = Object.keys(clone)[0];
    Object.defineProperty(clone, key, {
      get() {
        calls++;
        throw Error('PRIVATE');
      },
      enumerable: true,
    });
    const args = [f.tree, f.profile, f.query, f.current, 150];
    args[['tree', 'profile', 'query', 'current'].indexOf(target)] = clone;
    assert.equal(resolve(...args).status, 'UNAVAILABLE');
    assert.equal(calls, 0);
  }
  for (const predicates of [
    [],
    [{ field: 'regex', value: '.*' }],
    [{ field: 'text', value: '' }],
    [
      { field: 'text', value: 'x' },
      { field: 'text', value: 'x' },
    ],
    [{ field: 'bounds', value: [0, 0, 1] }],
  ]) {
    const f = fixture();
    f.query.predicates = predicates;
    assert.equal(f.run().code, 'INVALID_SELECTOR');
  }
  const f = fixture();
  const malformed = structuredClone(f.tree);
  malformed.nodes[0].childOrdinals = [0];
  assert.equal(resolve(malformed, f.profile, f.query, f.current, 150).code, 'INVALID_TREE');
  f.profile.treeSha256 = '0'.repeat(64);
  assert.equal(f.run().code, 'UNSUPPORTED_PROFILE');
});
test('caller mutation during later descriptor snapshots cannot change already captured tree', () => {
  const f = fixture();
  const mutable = structuredClone(f.tree);
  let mutated = false;
  const profile = new Proxy(f.profile, {
    getOwnPropertyDescriptor(target, key) {
      if (!mutated) {
        mutable.nodes[0].resourceId = 'different';
        mutated = true;
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(resolve(mutable, profile, f.query, f.current, 150).status, 'UNIQUE');
  assert.equal(mutable.nodes[0].resourceId, 'different');
});
test('existing unsupported XML language is unchanged and no dispatch import or action result is added', () => {
  for (const value of ['&amp;', '&#65;', '<!DOCTYPE hierarchy>', '<!--comment-->', '\u0000']) {
    const raw = xml(node(`text="${value}"`));
    assert.equal(normalizeHierarchyXml(raw, display()).ok, false);
    assert.equal(validateHierarchyXml(raw, display()).ok, false);
  }
  const empty = fixture('');
  assert.equal(empty.run().status, 'NOT_FOUND');
  const source = readFileSync(
    new URL('../src/main/hierarchy-selector.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /from ['"][^'"]*(?:actor|service|logging|registry-store|node:child_process|electron)/,
  );
  assert.deepEqual(Object.keys(fixture().run()), [
    'status',
    'code',
    'nodeOrdinal',
    'matchedCount',
    'source',
  ]);
});
test('bounded descriptor snapshots reject oversized or sparse arrays without ordinary property reads', () => {
  const f = fixture();
  let reads = 0;
  const nodes = new Proxy(f.tree.nodes, {
    get() {
      reads++;
      throw Error('PRIVATE');
    },
  });
  assert.equal(resolve({ ...f.tree, nodes }, f.profile, f.query, f.current, 150).status, 'UNIQUE');
  assert.equal(reads, 0);
  const huge = [];
  huge.length = 10001;
  assert.equal(
    resolve({ ...f.tree, nodes: huge }, f.profile, f.query, f.current, 150).code,
    'INVALID_TREE',
  );
  const sparse = new Array(1);
  assert.equal(
    resolve({ ...f.tree, nodes: sparse }, f.profile, f.query, f.current, 150).code,
    'INVALID_TREE',
  );
  const query = { version: 1, predicates: new Array(6) };
  assert.equal(resolve(f.tree, f.profile, query, f.current, 150).code, 'INVALID_SELECTOR');
});
test('scanner-supported deepest self-closing leaf and negative zero normalize without changing legacy acceptance', () => {
  const attrs =
    'index="0" class="View" package="synthetic.app" bounds="[-0,0][50,50]" enabled="true" visible-to-user="true"';
  const body =
    `<node ${attrs}>`.repeat(63) + `<node ${attrs} resource-id="id/title"/>` + '</node>'.repeat(63);
  const f = fixture(body);
  assert.equal(f.tree.nodes.length, 64);
  assert.equal(f.run().status, 'UNIQUE');
  assert.equal(f.run().nodeOrdinal, 63);
  assert.equal(Object.is(f.tree.nodes[0].bounds[0], -0), false);
});
