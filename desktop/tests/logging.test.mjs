import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  lstatSync,
  realpathSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { LogStore } from '../src/main/log-store.ts';
import { ApplicationLogger } from '../src/main/logging.ts';
import { createLogShutdown } from '../src/main/log-shutdown.ts';
import { createDiagnosticClient } from '../src/preload-client.ts';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
function fixture() {
  const base = join(root, '.test-output');
  try {
    mkdirSync(base);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  assert.equal(lstatSync(base).isSymbolicLink(), false);
  assert.equal(realpathSync(base), resolve(base));
  const directory = mkdtempSync(join(base, 'logging-')),
    token = randomUUID();
  writeFileSync(join(directory, '.owner'), token, { flag: 'wx' });
  return {
    directory,
    location: { root: join(directory, 'logs-main'), parentToken: token },
    cleanup() {
      assert.equal(lstatSync(directory).isSymbolicLink(), false);
      assert.equal(realpathSync(directory), resolve(directory));
      rmSync(directory, { recursive: true, force: false });
    },
  };
}
function attached(logging) {
  const { installFoundationBridge } = require('../build/foundation-bridge.cjs');
  const handlers = new Map();
  const bridge = installFoundationBridge(
    {
      handle(channel, fn) {
        handlers.set(channel, fn);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    },
    logging,
  );
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.mainFrame = {
    origin: 'auto-foundation://app',
    url: 'auto-foundation://app/status.html',
  };
  const window = new EventEmitter();
  window.webContents = contents;
  const view = bridge.attach(window);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  contents.emit('did-start-navigation', { isMainFrame: true, url: contents.mainFrame.url });
  assert.equal(view.arm(), true);
  return { handlers, bridge, event, window };
}
test('actual compiled v2 dispatcher and preload share main diagnostic with persisted safe error', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-10-31T00:00:00.000Z'),
      logger = new ApplicationLogger(store, () => '2026-10-31T06:00:00.000Z');
    const app = attached(logger),
      handler = app.handlers.get('foundation:request:v2');
    const client = createDiagnosticClient(async () =>
      handler(app.event, '{"password":"PRIVATE_CANARY","version":2}'),
    );
    const result = JSON.parse(await client.health());
    assert.equal(result.code, 'INVALID_SHAPE');
    assert.equal(typeof result.diagnosticId, 'string');
    assert.equal(result.logging, 'AVAILABLE');
    const old = JSON.parse(
      app.handlers.get('foundation:request:v1')(
        app.event,
        JSON.stringify({ version: 1, requestId: 'PRIVATE_CALLER_ID', method: 'health.get' }),
      ),
    );
    assert.equal(old.version, 1);
    assert.equal(old.ok, true);
    assert.equal(await logger.close(), 'FLUSHED');
    const bytes = readdirSync(f.location.root)
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => readFileSync(join(f.location.root, n), 'utf8'))
      .join('');
    const logs = bytes.trim().split('\n').map(JSON.parse);
    assert.ok(
      logs.some((row) => row.diagnosticId === result.diagnosticId && row.code === 'INVALID_SHAPE'),
    );
    assert.equal(bytes.includes('PRIVATE_CANARY'), false);
    assert.equal(bytes.includes('PRIVATE_CALLER_ID'), false);
    app.bridge.dispose();
    client.dispose();
  } finally {
    f.cleanup();
  }
});
test('pre-admission denials do not allocate IDs; logger coalesces rejected traffic', async () => {
  const f = fixture();
  try {
    const store = await LogStore.open(f.location, '2026-10-31T00:00:00.000Z');
    let ids = 0;
    const logger = new ApplicationLogger(
        store,
        () => '2026-10-31T06:00:00.000Z',
        () => {},
        () => {
          ids++;
          return randomUUID();
        },
      ),
      app = attached(logger);
    const before = ids;
    for (let n = 0; n < 20; n++) {
      const response = JSON.parse(
        app.handlers.get('foundation:request:v2')({ sender: {}, senderFrame: null }, 'PRIVATE'),
      );
      assert.equal(response.diagnosticId, null);
      assert.equal(response.code, 'UNTRUSTED_SENDER');
    }
    assert.equal(ids, before);
    assert.equal(await logger.close(), 'FLUSHED');
    const rows = readdirSync(f.location.root)
      .filter((n) => n.endsWith('.jsonl'))
      .flatMap((n) =>
        readFileSync(join(f.location.root, n), 'utf8').trim().split('\n').map(JSON.parse),
      );
    assert.equal(rows.filter((r) => r.event === 'BRIDGE_RESULT').length, 1);
    app.bridge.dispose();
  } finally {
    f.cleanup();
  }
});
test('main UUID failure is degraded with null reference and v1 stays readable', () => {
  for (const newDiagnostic of [
    () => null,
    () => {
      throw new Error('PRIVATE');
    },
  ]) {
    const app = attached({ newDiagnostic, outcome: () => {}, health: 'DEGRADED' });
    assert.deepEqual(
      JSON.parse(
        app.handlers.get('foundation:request:v2')(
          app.event,
          JSON.stringify({ version: 2, requestId: 'r', method: 'health.get' }),
        ),
      ),
      { version: 2, ok: false, diagnosticId: null, logging: 'DEGRADED', code: 'INTERNAL_FAILURE' },
    );
    assert.equal(
      JSON.parse(
        app.handlers.get('foundation:request:v1')(
          app.event,
          JSON.stringify({ version: 1, requestId: 'r', method: 'health.get' }),
        ),
      ).ok,
      true,
    );
    app.bridge.dispose();
  }
});
test('one-shot shutdown prevents reentrant quit until actual flush completion', async () => {
  let finish,
    stops = 0,
    flushes = 0,
    resumes = 0,
    degraded = 0,
    failed = 0,
    prevented = 0;
  const wait = new Promise((r) => {
    finish = r;
  });
  const gate = createLogShutdown({
      stop() {
        stops++;
        return true;
      },
      flush() {
        flushes++;
        return wait;
      },
      degraded() {
        degraded++;
      },
      resume() {
        resumes++;
      },
      fail() {
        failed++;
      },
    }),
    event = {
      preventDefault() {
        prevented++;
      },
    };
  gate.beforeQuit(event);
  gate.beforeQuit(event);
  assert.equal(stops, 1);
  assert.equal(flushes, 1);
  assert.equal(resumes, 0);
  finish('FAILED');
  await Promise.resolve();
  assert.equal(degraded, 1);
  assert.equal(resumes, 1);
  assert.equal(failed, 0);
  gate.beforeQuit(event);
  assert.equal(prevented, 2);
});
test('shutdown cleanup failure exits without normal resume; thrown flush stays fixed', async () => {
  let resumes = 0,
    failed = 0,
    degraded = 0;
  const gate = createLogShutdown({
    stop: () => false,
    flush() {
      throw new Error('PRIVATE');
    },
    degraded() {
      degraded++;
    },
    resume() {
      resumes++;
    },
    fail() {
      failed++;
    },
  });
  gate.beforeQuit({ preventDefault() {} });
  await Promise.resolve();
  assert.deepEqual({ resumes, failed, degraded }, { resumes: 0, failed: 1, degraded: 1 });
});
test('five-second shutdown deadline abandons unresolved sink and ignores late completion', async () => {
  let finish,
    abandoned = 0,
    notices = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const store = {
    health: 'AVAILABLE',
    enqueue: () => 'QUEUED',
    close: () => pending,
    abandon() {
      abandoned++;
    },
  };
  const logger = new ApplicationLogger(
    store,
    () => '2026-10-31T06:00:00.000Z',
    () => {
      notices++;
    },
  );
  const start = Date.now(),
    closing = logger.close();
  assert.equal(logger.close(), closing);
  assert.equal(await closing, 'FAILED');
  assert.ok(Date.now() - start >= 4900);
  assert.equal(abandoned, 1);
  assert.equal(notices, 1);
  assert.equal(logger.health, 'DEGRADED');
  finish('FLUSHED');
  await Promise.resolve();
  assert.equal(await logger.close(), 'FAILED');
  assert.equal(abandoned, 1);
  assert.equal(notices, 1);
});

test('offline maintenance requires explicit stopped-owner acknowledgment and fixed failures', () => {
  for (const args of [
    [],
    ['--guess-owner'],
    ['--owners-stopped-and-launches-excluded', 'PRIVATE_PATH'],
  ]) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/recover-logs.mjs'), ...args], {
      encoding: 'utf8',
      shell: false,
      timeout: 10000,
      maxBuffer: 8192,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), 'RECOVERY_FAILED');
    assert.equal(result.stderr, '');
  }
});
