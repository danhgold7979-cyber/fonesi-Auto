import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verify } from '../scripts/verify-dependencies.mjs';
verify(true, '11.9.0');
const require = createRequire(import.meta.url),
  { buildSync } = require('esbuild');
const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
const compiled = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/schedule-draft-bridge.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { installScheduleDraftBridge } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`
);
const clientBundle = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/schedule-draft-client.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { createScheduleDraftClient } = await import(
  `data:text/javascript;base64,${Buffer.from(clientBundle.outputFiles[0].contents).toString('base64')}`
);
const CHANNEL = 'foundation:schedule-draft:v1',
  ENTRY = 'auto-foundation://app/status.html';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function request(date = '2024-01-01', times = ['09:00', '09:29'], patch = {}) {
  return JSON.stringify({
    version: 1,
    requestId: 'd1',
    method: 'schedule.draft.preview',
    schedule: {
      version: 1,
      kind: 'CIVIL_RULE',
      startDate: date,
      endDate: null,
      maxOccurrences: null,
      rule: { kind: 'EVERY_N_DAYS', intervalDays: 1 },
      postsPerActiveDay: times.length,
      slots: times.map((time, i) => ({ id: id(i), time })),
    },
    request: {
      version: 1,
      scope: { kind: 'UNBOUND_DRAFT', draftId: id(100), draftRevision: 2 },
      zone: 'Asia/Ho_Chi_Minh',
      fromDate: date,
      throughDate: date,
      limit: 128,
      ...patch,
    },
  });
}
function fixture() {
  const handlers = new Map(),
    ipc = { handle: (k, v) => handlers.set(k, v), removeHandler: (k) => handlers.delete(k) },
    foundation = installFoundationBridge(ipc),
    contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.mainFrame = { origin: 'auto-foundation://app', url: ENTRY };
  const window = new EventEmitter();
  window.webContents = contents;
  const view = foundation.attach(window);
  contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY });
  assert.equal(view.arm(), true);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const bridge = installScheduleDraftBridge(ipc, foundation.admitPreferences),
    handler = handlers.get(CHANNEL);
  return {
    handlers,
    foundation,
    contents,
    event,
    view,
    bridge,
    call: (raw = request(), ev = event, ...extra) => JSON.parse(handler(ev, raw, ...extra)),
    close() {
      bridge.dispose();
      foundation.dispose();
    },
  };
}
test('real main dispatcher resolves detached unbound 29/30 minute previews and DST without persistence', () => {
  const f = fixture();
  try {
    for (const [time, count] of [
      ['09:29', 1],
      ['09:30', 0],
    ]) {
      const r = f.call(request('2024-01-01', ['09:00', time]));
      assert.equal(r.ok, true);
      assert.equal(r.preview.warnings.length, count);
      assert.deepEqual(r.preview.scope, {
        kind: 'UNBOUND_DRAFT',
        draftId: id(100),
        draftRevision: 2,
      });
    }
    const dst = f.call(
      request('2024-03-10', ['01:59', '02:15', '03:00'], { zone: 'America/New_York' }),
    );
    assert.equal(dst.ok, true);
    assert.equal(dst.preview.preview.occurrences[1].resolution, 'SKIPPED_GAP');
    assert.equal(dst.preview.warnings[0].gapMs, 60000);
    const truncated = f.call(request('2024-01-01', ['09:00', '09:29'], { limit: 1 }));
    assert.equal(truncated.ok, true);
    assert.equal(truncated.preview.preview.truncated, true);
  } finally {
    f.close();
  }
});
test('shared live ViewSession rejects sender frame wire extras and revoked navigation before work', () => {
  const f = fixture();
  try {
    for (const ev of [
      { sender: {}, senderFrame: null },
      { ...f.event, senderFrame: null },
      { ...f.event, senderFrame: { ...f.contents.mainFrame } },
      {
        sender: f.contents,
        get senderFrame() {
          throw Error('PRIVATE');
        },
      },
    ])
      assert.equal(f.call(request(), ev).code, 'UNTRUSTED_SENDER');
    for (const raw of [
      '{',
      {},
      request().replace('"version":1', '"version":1,"version":1'),
      request().replace('"limit":128', '"limit":129'),
    ])
      assert.equal(f.call(raw).ok, false);
    assert.equal(f.call('x'.repeat(131073)).code, 'PAYLOAD_TOO_LARGE');
    assert.equal(f.call(request(), f.event, 'extra').code, 'INVALID_SHAPE');
    assert.equal(f.call().ok, true);
    f.contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY });
    assert.equal(f.call().code, 'SESSION_REVOKED');
  } finally {
    f.close();
  }
});
test('ordinary shared admission budget stays bounded and every success or refusal releases', () => {
  const f = fixture();
  try {
    const leases = Array.from({ length: 7 }, () => f.foundation.admitPreferences(f.event));
    assert(leases.every((l) => l.ok));
    assert.equal(f.call().code, 'BUSY');
    for (const lease of leases) lease.release();
    for (let n = 0; n < 20; n++) {
      assert.equal(f.call('{').ok, false);
      assert.equal(f.call().ok, true);
    }
    assert.equal(
      f.call(request('2024-01-01', ['09:00'], { zone: 'Invalid/Zone' })).code,
      'UNSUPPORTED_ZONE',
    );
  } finally {
    f.close();
  }
});
test('lifecycle disposal removes fixed handler and stale callback cannot run new work', () => {
  const f = fixture();
  f.bridge.dispose();
  assert(!f.handlers.has(CHANNEL));
  assert.equal(f.call().code, 'SESSION_REVOKED');
  f.foundation.dispose();
});
test('main rechecks admitted currency around resolver and releases on malformed or throwing admission', () => {
  for (const failAt of [1, 2]) {
    let checks = 0,
      released = 0,
      handler;
    const bridge = installScheduleDraftBridge(
      {
        handle(_k, fn) {
          handler = fn;
        },
        removeHandler() {},
      },
      () => ({
        ok: true,
        current: () => ++checks !== failAt,
        operationCurrent: () => true,
        release: () => released++,
      }),
    );
    assert.equal(JSON.parse(handler({}, request())).code, 'SESSION_REVOKED');
    assert.equal(released, 1);
    bridge.dispose();
  }
  for (const admit of [
    () => {
      throw Error('PRIVATE');
    },
    () => ({ ok: false, code: 'PRIVATE' }),
  ]) {
    let handler;
    installScheduleDraftBridge(
      {
        handle(_k, fn) {
          handler = fn;
        },
        removeHandler() {},
      },
      admit,
    );
    const raw = handler({}, request());
    assert.equal(JSON.parse(raw).code, 'INTERNAL_FAILURE');
    assert(!raw.includes('PRIVATE'));
  }
});
test('actual built preload contains draft surface but no Temporal or Node timezone engine; main contains resolver', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8'),
    preload = read('../build/preload.cjs'),
    main = read('../build/main.cjs'),
    src = read('../src/preload.ts'),
    mainSrc = read('../src/main.ts');
  assert(preload.includes(CHANNEL));
  assert(preload.includes('scheduleDraft'));
  assert.doesNotMatch(
    preload,
    /@js-temporal|node:crypto|node:process|process\.versions\.icu|function resolveCivilPreview/,
  );
  assert(main.includes('GAP_SKIP_OVERLAP_EARLIER_V1'));
  assert(mainSrc.includes('installScheduleDraftBridge(ipcMain, bridge.admitPreferences)'));
  assert(src.includes('scheduleDraft.dispose()'));
  assert(src.indexOf('scheduleDraft.dispose()') < src.indexOf('readiness.dispose()'));
  assert.equal((src.match(/ipcRenderer\.invoke\(SCHEDULE_DRAFT_CHANNEL, wire\)/g) || []).length, 1);
  assert.doesNotMatch(src, /scheduleDraft\.preview\(\)/);
});

test('actual client to admitted main handler to resolver roundtrip preserves detached draft correlation', async () => {
  const f = fixture();
  const client = createScheduleDraftClient(async (wire) => JSON.stringify(f.call(wire)));
  try {
    const { schedule, request: draft } = JSON.parse(request());
    const r = JSON.parse(await client.preview({ schedule, request: draft }));
    assert.equal(r.ok, true);
    assert.equal(r.requestId, 'd1');
    assert.equal(r.preview.scope.draftRevision, 2);
    assert.equal(r.preview.warnings[0].gapMs, 1740000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(client.outstanding(), 0);
    for (const raw of [
      request('2024-03-10', ['01:59', '02:15', '03:00'], { zone: 'America/New_York' }),
      request('2024-01-01', ['09:00', '09:29'], { limit: 1 }),
    ]) {
      const { schedule, request: draft } = JSON.parse(raw);
      const result = JSON.parse(await client.preview({ schedule, request: draft }));
      assert.equal(result.ok, true);
      if (draft.limit === 1) {
        assert.equal(result.preview.coverage, 'TRUNCATED_PREFIX');
        assert.notEqual(result.preview.preview.next, null);
      } else {
        assert.equal(result.preview.preview.occurrences[1].resolution, 'SKIPPED_GAP');
        assert.equal(result.preview.warnings[0].gapMs, 60000);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    f.contents.emit('did-start-navigation', { isMainFrame: true, url: ENTRY });
    assert.equal(
      JSON.parse(await client.preview({ schedule, request: draft })).code,
      'SESSION_REVOKED',
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(client.outstanding(), 0);
  } finally {
    client.dispose();
    f.close();
  }
});
