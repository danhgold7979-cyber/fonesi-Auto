'use strict';
// Synthetic main-only filesystem checks. Native Job supervision remains outside.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { LogStore } = require('../build/log-store.cjs');
const { fingerprint } = require('./logging-evidence.cjs');
const mode = process.argv[2];
const location = {
  root: process.env.FONESI_LOG_ROOT,
  parentToken: process.env.FONESI_LOG_PARENT_TOKEN,
};
const now = '2026-10-31T00:00:00.000Z';
function record(sequence, runId) {
  return {
    schemaVersion: 1,
    runId,
    sequence,
    utc: now,
    severity: 'INFO',
    component: 'MAIN',
    task: 'P1-04',
    event: 'STARTUP_READY',
    diagnosticId: null,
    code: 'OK',
  };
}
function segment() {
  const names = fs
    .readdirSync(location.root)
    .filter((name) => /^segment-[0-9a-f-]{36}\.meta\.json$/.test(name));
  if (names.length < 1) throw new Error('SEGMENT_CONTROL');
  return JSON.parse(fs.readFileSync(path.join(location.root, names[0]), 'utf8')).segmentId;
}
async function seed() {
  const store = await LogStore.open(location, now);
  if (
    store.enqueue(record(1, crypto.randomUUID())) !== 'QUEUED' ||
    (await store.flush()) !== 'FLUSHED'
  )
    throw new Error('SEED_FAILED');
  return store;
}
function boundedChild(role) {
  const child = spawn(process.execPath, [__filename, role], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  let output = '',
    failure = false;
  const timer = setTimeout(() => {
    failure = true;
    child.kill();
  }, 5000);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (bytes) => {
      if (failure) return;
      const chunk = bytes.toString('utf8');
      if (chunk.length > 4096 - output.length) {
        failure = true;
        child.kill();
        return;
      }
      output += chunk;
    });
  const ended = new Promise((resolve, reject) => {
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('CHILD_FAILED'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(new Error('CHILD_BOUND'));
      else resolve({ code, output });
    });
  });
  return { child, ended };
}
async function run() {
  if (
    process.argv.length !== 3 ||
    ![
      'prepare',
      'prepare-reparse',
      'reparse',
      'unowned',
      'traversal',
      'crash',
      'recover',
      'sharing',
      'concurrent',
      'owner',
      'contender',
      'enospc',
    ].includes(mode)
  )
    throw new Error('ARGUMENTS');
  if (mode === 'owner') {
    const store = await LogStore.open(location, now);
    fs.writeFileSync(path.join(path.dirname(location.root), '.logging-owner-ready'), 'READY', {
      flag: 'wx',
    });
    const deadline = Date.now() + 3500;
    while (
      !fs.existsSync(path.join(path.dirname(location.root), '.logging-owner-release')) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    fs.unlinkSync(path.join(path.dirname(location.root), '.logging-owner-ready'));
    fs.unlinkSync(path.join(path.dirname(location.root), '.logging-owner-release'));
    if ((await store.close()) !== 'FLUSHED') throw new Error('OWNER_CLOSE');
    console.log('OWNER_CLOSED');
    return;
  }
  if (mode === 'contender') {
    let denied = false;
    try {
      await LogStore.open(location, now);
    } catch {
      denied = true;
    }
    if (!denied) throw new Error('SECOND_OWNER');
    console.log('CONTENDER_DENIED');
    return;
  }
  if (mode === 'concurrent') {
    const first = boundedChild('owner');
    const deadline = Date.now() + 2000;
    while (
      !fs.existsSync(path.join(path.dirname(location.root), '.logging-owner-ready')) &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (!fs.existsSync(path.join(path.dirname(location.root), '.logging-owner-ready')))
      throw new Error('OWNER_NOT_READY');
    const second = await boundedChild('contender').ended;
    fs.writeFileSync(path.join(path.dirname(location.root), '.logging-owner-release'), 'RELEASE', {
      flag: 'wx',
    });
    const closed = await first.ended;
    console.log(
      'FOUNDATION_STORE_RESULT ' +
        JSON.stringify({
          mode,
          passed:
            second.code === 0 &&
            second.output.trim() === 'CONTENDER_DENIED' &&
            closed.code === 0 &&
            closed.output.trim() === 'OWNER_CLOSED',
        }),
    );
    return;
  }
  if (mode === 'prepare' || mode === 'prepare-reparse') {
    const store = await seed();
    const closed = await store.close();
    console.log(
      'FOUNDATION_STORE_RESULT ' + JSON.stringify({ mode, passed: closed === 'FLUSHED' }),
    );
    return;
  }
  if (mode === 'reparse' || mode === 'unowned' || mode === 'traversal') {
    const target = path.join(path.dirname(location.root), 'logs-reparse-target');
    const before = fingerprint(target);
    if (mode === 'unowned') fs.mkdirSync(location.root);
    const candidate =
      mode === 'traversal'
        ? {
            ...location,
            root:
              path.dirname(location.root) +
              path.sep +
              'unused' +
              path.sep +
              '..' +
              path.sep +
              'logs-reparse-target',
          }
        : location;
    let denied = false;
    try {
      await LogStore.open(candidate, now);
    } catch {
      denied = true;
    }
    const unchanged =
      before === fingerprint(target) && !fs.existsSync(path.join(target, '.writer-lock'));
    let empty = true;
    if (mode === 'unowned') {
      empty = fs.readdirSync(location.root).length === 0;
      fs.rmdirSync(location.root);
    }
    console.log(
      'FOUNDATION_STORE_RESULT ' + JSON.stringify({ mode, passed: denied && unchanged && empty }),
    );
    return;
  }
  if (mode === 'crash') {
    const store = await seed();
    if ((await store.hold(segment())) !== 'PERSISTED') throw new Error('HOLD_FAILED');
    console.log('FOUNDATION_STORE_CRASH_READY');
    process.exit(73); // Deliberate unclean process exit; caller must prove Job retirement.
  }
  if (mode === 'recover') {
    const owner = JSON.parse(fs.readFileSync(path.join(location.root, 'owner.json'), 'utf8'));
    const lock = JSON.parse(
      fs.readFileSync(path.join(location.root, '.writer-lock/owner.json'), 'utf8'),
    );
    const held = fs.readFileSync(path.join(location.root, 'holds.json'));
    const oldSegment = segment();
    const cli = path.join(__dirname, '../scripts/recover-logs.mjs');
    const invokeRecovery = (token) =>
      spawnSync(
        process.execPath,
        [
          cli,
          '--owners-stopped-and-launches-excluded',
          location.root,
          location.parentToken,
          owner.storeId,
          token,
        ],
        { shell: false, windowsHide: true, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 },
      );
    const wrong = invokeRecovery(crypto.randomUUID());
    if (wrong.error || wrong.status === 0 || wrong.stdout.trim() !== 'OWNERSHIP_REJECTED')
      throw new Error('WRONG_RECOVERY');
    const recovered = invokeRecovery(lock.ownerToken);
    if (recovered.error || recovered.status !== 0 || recovered.stdout.trim() !== 'RECOVERED')
      throw new Error('RECOVERY_FAILED');
    const store = await seed();
    const pruning = await store.prune('2027-12-01T00:00:00.000Z');
    const preserved =
      fs.existsSync(path.join(location.root, `segment-${oldSegment}.jsonl`)) &&
      held.equals(fs.readFileSync(path.join(location.root, 'holds.json')));
    const closed = await store.close();
    console.log(
      'FOUNDATION_STORE_RESULT ' +
        JSON.stringify({ mode, passed: preserved && pruning === 'PRUNED' && closed === 'FLUSHED' }),
    );
    return;
  }
  if (mode === 'sharing') {
    const store = await seed();
    const result = await store.hold(segment());
    const failed = await store.close();
    console.log(
      'FOUNDATION_STORE_RESULT ' +
        JSON.stringify({
          mode,
          passed: result === 'UNCERTAIN' && failed === 'FAILED' && store.health === 'DEGRADED',
        }),
    );
    return;
  }
  const store = await LogStore.open(location, now, async (stage) => {
    if (stage === 'append') {
      const error = new Error('SYNTHETIC_PRIVATE_ENOSPC');
      error.code = 'ENOSPC';
      throw error;
    }
  });
  store.enqueue(record(1, crypto.randomUUID()));
  const flushed = await store.flush();
  const closed = await store.close();
  console.log(
    'FOUNDATION_STORE_RESULT ' +
      JSON.stringify({
        mode,
        passed: flushed === 'FAILED' && closed === 'FAILED' && store.health === 'DEGRADED',
      }),
  );
}
run().catch(() => {
  console.log('FOUNDATION_STORE_FAILED');
  process.exitCode = 1;
});
