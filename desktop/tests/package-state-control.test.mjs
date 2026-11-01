import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FoundationDatabase, statement } from '../src/main/foundation-database.ts';
const require = createRequire(import.meta.url);
const {
  names,
  provenance,
  databaseFacts,
  capture,
  validateState,
} = require('../verification/package-state-control.cjs');
const { write } = require('../verification/package-contract.cjs');
function fixture() {
  const base = fileURLToPath(new URL('../.test-output', import.meta.url));
  if (!fs.existsSync(base)) fs.mkdirSync(base);
  assert.equal(fs.lstatSync(base).isSymbolicLink(), false);
  assert.equal(fs.realpathSync.native(base), base);
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(base, 'package-state-')));
  return {
    root,
    close() {
      assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
      assert.equal(fs.realpathSync.native(root), root);
      fs.rmSync(root, { recursive: true, force: false });
    },
  };
}
function marker(root, kind = 'FRESH') {
  const id = randomUUID(),
    receipt = kind === 'RESTORED' ? randomUUID() : null,
    data = path.join(root, kind === 'FRESH' ? 'data-main' : `data-${id}`);
  fs.mkdirSync(data);
  write(path.join(data, '.persistence-owner.json'), {
    version: 1,
    storeId: id,
    kind,
    restoreReceiptId: receipt,
  });
  if (receipt)
    write(path.join(data, '.restore-receipt.json'), {
      version: 1,
      storeId: id,
      restoreReceiptId: receipt,
      quarantined: true,
    });
  return { data, id };
}
test('package state provenance binds exact fresh/restored basename and restore receipt', () => {
  const f = fixture();
  try {
    const a = marker(f.root);
    assert.equal(provenance(a.data).kind, 'FRESH');
    write(path.join(a.data, '.restore-receipt.json'), {});
    assert.throws(() => provenance(a.data));
    const b = marker(f.root, 'RESTORED');
    assert.equal(provenance(b.data).storeId, b.id);
    fs.unlinkSync(path.join(b.data, '.restore-receipt.json'));
    assert.throws(() => provenance(b.data));
  } finally {
    f.close();
  }
});
test('package controller inventory is bounded and refuses symlink aliases', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'a'), '');
    assert.deepEqual(names(f.root), ['a']);
    fs.symlinkSync(path.join(f.root, 'a'), path.join(f.root, 'link'));
    assert.throws(() => names(f.root));
    fs.unlinkSync(path.join(f.root, 'link'));
    for (let i = 0; i < 256; i++) fs.writeFileSync(path.join(f.root, `entry-${i}`), '');
    assert.throws(() => names(f.root));
  } finally {
    f.close();
  }
});
test('package capture requires exact fixed outcome and actual retirement', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'package-capture-first-launch.json');
    const c = {
      process: {
        status: 'SUCCESS',
        exitCode: 0,
        cleanupComplete: true,
        stdoutTruncated: false,
        stderrTruncated: false,
      },
      stdout: 'PERSISTENCE_DESKTOP_CLOSED\r\n',
      stderr: '',
    };
    write(file, c);
    assert.equal(capture(f.root, 'first-launch').process.exitCode, 0);
    for (const changed of [
      { ...c, process: { ...c.process, cleanupComplete: false } },
      { ...c, stdout: c.stdout + 'PRIVATE\n' },
      { ...c, process: { ...c.process, status: 'NONZERO_EXIT' } },
    ]) {
      fs.writeFileSync(file, JSON.stringify(changed));
      assert.throws(() => capture(f.root, 'first-launch'));
    }
  } finally {
    f.close();
  }
});
test('private package state rejects redirected root and unknown fields before use', () => {
  const f = fixture();
  try {
    const state = {
      version: 1,
      packageHash: 'a'.repeat(64),
      managedRoot: null,
      storeId: null,
      backup: null,
      original: null,
      settings: null,
      source: null,
      rootA: null,
      rootAWitness: null,
      retainedLaunchId: null,
    };
    assert.equal(validateState(f.root, state), state);
    assert.throws(() => validateState(f.root, { ...state, managedRoot: f.root }));
    assert.throws(() => validateState(f.root, { ...state, extra: true }));
    assert.throws(() =>
      validateState(f.root, {
        ...state,
        backup: { file: '/tmp/backup-' + randomUUID() + '.fonaub' },
      }),
    );
  } finally {
    f.close();
  }
});
test('actual SQLite settings facts exclude native geometry and reject corrupt CURRENT', async () => {
  const f = fixture();
  try {
    const { data, id } = marker(f.root),
      file = path.join(data, 'active.sqlite');
    let db = new FoundationDatabase(file, id);
    // Historical schema3 campaign: deliberately stop before migration4.
    await assert.rejects(
      db.migrate(async (version) => {
        if (version === 3) throw new Error('HISTORICAL_SCHEMA3_STOP');
        const snap = path.join(f.root, `snap-${version}.sqlite`);
        await db.snapshot(snap);
        const copy = new FoundationDatabase(snap, id, true);
        try {
          return {
            backupId: randomUUID(),
            schemaVersion: version,
            fingerprint: copy.fingerprint(),
          };
        } finally {
          copy.close();
        }
      }, 1000),
      /HISTORICAL_SCHEMA3_STOP/,
    );
    db.close();
    const facts = databaseFacts(data, FoundationDatabase, statement);
    assert.equal(facts.version, 3);
    assert.deepEqual(Object.keys(facts.settings), ['theme', 'dockWidth', 'tileWidth']);
    db = new FoundationDatabase(file, id);
    db.connection.exec('PRAGMA ignore_check_constraints=ON');
    statement(
      db.connection,
      "UPDATE app_settings_revision SET tile_width=1 WHERE slot='CURRENT'",
      (s) => s.run(),
    );
    db.close();
    assert.throws(() => databaseFacts(data, FoundationDatabase, statement));
  } finally {
    f.close();
  }
});

test('first-cancel observe composes real owned journal with explicitly synthetic package/native admission', () => {
  const f = fixture();
  try {
    const module = { exports: {} };
    const pkg = path.join(f.root, 'relocated-package');
    const journal = require('../launch/launch-journal.cjs');
    const source = fs.readFileSync(
      new URL('../verification/package-state-control.cjs', import.meta.url),
      'utf8',
    );
    const actualRequire = createRequire(
      new URL('../verification/package-state-control.cjs', import.meta.url),
    );
    const fixtureRequire = (name) => {
      if (name === '../launch/package-admission.cjs')
        return {
          verifyPackage: () => ({ fixtureOnly: true }),
          assertDataOutsidePackage: (pkg, target) =>
            assert.ok(!target.startsWith(`${pkg}${path.sep}`)),
        };
      if (name === path.join(pkg, 'app/build/foundation-database.cjs'))
        return {
          FoundationDatabase: class {
            constructor() {
              assert.fail('cancel must not inspect SQLite');
            }
          },
          statement() {
            assert.fail('cancel must not query SQLite');
          },
        };
      if (name === path.join(pkg, 'app/build/backup-service.cjs'))
        return {
          parseBackupReceipt() {
            assert.fail('cancel has no backup');
          },
        };
      if (name === path.join(pkg, 'app/launch/launch-journal.cjs')) return journal;
      return actualRequire(name);
    };
    // Only this test loader substitutes package/native admission; no production hook exists.
    new Function('require', 'module', source)(fixtureRequire, module);
    const controller = module.exports;
    fs.mkdirSync(pkg);
    fs.writeFileSync(path.join(f.root, '.owner'), randomUUID());
    controller.prepare(f.root, pkg, 'first-cancel');
    const parent = path.join(f.root, 'products', `Fonesi-Auto-${randomUUID()}`);
    fs.mkdirSync(parent);
    fs.writeFileSync(path.join(parent, '.owner'), randomUUID());
    const launch = path.join(parent, `launch-${randomUUID()}`);
    fs.mkdirSync(launch);
    fs.writeFileSync(path.join(launch, '.owner'), randomUUID());
    const data = path.join(parent, 'data-main');
    const h = journal.plan(parent, launch, data, 'PACKAGE', 'NORMAL', 'a'.repeat(64));
    const process = {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    };
    const stages = ['SETUP', 'PREPARE_PROVISION', 'PROVISION', 'OBSERVE_PROVISION', 'RELEASE'];
    for (const [index, stage] of stages.entries()) {
      const n = index + 1;
      journal.appendIntent(parent, launch, n, stage);
      if (stage === 'SETUP') {
        fs.mkdirSync(data);
        write(path.join(data, '.persistence-owner.json'), {
          version: 1,
          storeId: h.storeId,
          kind: 'FRESH',
          restoreReceiptId: null,
        });
        fs.mkdirSync(path.join(data, '.writer-lock'));
        write(path.join(data, '.writer-lock/owner.json'), {
          version: 1,
          storeId: h.storeId,
          ownerToken: h.ownerToken,
        });
        journal.recordAcquired(parent, launch);
      }
      if (stage === 'RELEASE') {
        write(path.join(data, `.released-${h.ownerToken}.json`), {
          version: 1,
          storeId: h.storeId,
          ownerToken: h.ownerToken,
        });
        fs.unlinkSync(path.join(data, '.writer-lock/owner.json'));
        fs.rmdirSync(path.join(data, '.writer-lock'));
      }
      write(path.join(launch, `capture-${String(n).padStart(2, '0')}.json`), {
        process,
        stdout: stage === 'OBSERVE_PROVISION' ? 'PERSISTENCE_LAUNCH_CANCELLED\n' : 'FIXTURE_ONLY\n',
        stderr: '',
      });
      journal.settle(parent, launch, n);
    }
    const outer = path.join(f.root, 'package-probe-first-cancel');
    fs.mkdirSync(outer);
    const { witness } = require('../verification/package-launch-observer.cjs');
    write(
      path.join(outer, 'observer-provision.json'),
      witness({ stage: 'first-cancel' }, 'provision', {
        closed: true,
        opens: 1,
        confirms: 0,
        cancelled: true,
      }),
    );
    const transported = JSON.stringify({
      process,
      stdout: 'PERSISTENCE_DESKTOP_CANCELLED\r\n',
      stderr: "warning: 'fixture-only'",
    }).replaceAll("'", '\\u0027');
    fs.writeFileSync(path.join(f.root, 'package-capture-first-cancel.json'), transported, {
      flag: 'wx',
    });
    const result = controller.observe(f.root, pkg, 'first-cancel');
    assert.equal(Object.values(result.cases).every(Boolean), true);
    assert.equal(fs.existsSync(path.join(f.root, 'package-state-first-cancel.json')), true);
    const diagnostics = controller.journalDiagnostics(f.root, pkg, 'first-cancel');
    assert.equal(diagnostics.BINDING, 'VALID');
    assert.equal(diagnostics.CHAIN, 'VALID');
    assert.equal(diagnostics.INTENT, 'RELEASE');
    assert.equal(diagnostics.SETTLEMENT, 'PRESENT');
    assert.equal(diagnostics.CAPTURE, 'VALID_JSON');
    assert.equal(diagnostics.CAPTURE_CANONICAL, 'TRUE');
    const last = path.join(launch, 'capture-05.json');
    fs.appendFileSync(last, ' ');
    const beforeDiagnostic = fs.readFileSync(last, 'utf8');
    const changed = controller.journalDiagnostics(f.root, pkg, 'first-cancel');
    assert.equal(changed.CHAIN, 'INVALID');
    assert.equal(changed.CAPTURE, 'VALID_JSON');
    assert.equal(changed.CAPTURE_CANONICAL, 'FALSE');
    assert.equal(changed.CAPTURE_RETIREMENT, 'RETIRED');
    assert.equal(fs.readFileSync(last, 'utf8'), beforeDiagnostic);
    assert.equal(JSON.stringify(changed).includes(f.root), false);
    const adapted = JSON.parse(beforeDiagnostic);
    adapted.stdout = 'PERSISTENCE_INITIALIZE_ORDERLY\n';
    adapted.stderr = 'PERSISTENCE_INITIALIZE_FAILED\n';
    fs.writeFileSync(last, JSON.stringify(adapted));
    const nativeKinds = controller.journalDiagnostics(f.root, pkg, 'first-cancel');
    assert.equal(nativeKinds.CAPTURE_STDOUT, 'PASS');
    assert.equal(nativeKinds.CAPTURE_STDERR, 'INITIALIZE_FAILURE');
    assert.equal(nativeKinds.CAPTURE_PARSE_REASON, 'VALID');
  } finally {
    f.close();
  }
});

test('observe failure emits only the fixed boundary diagnostic, never the supplied path', () => {
  const { spawnSync } = require('node:child_process');
  const secret = fileURLToPath(
    new URL('../.test-output/PRIVATE_MISSING_OBSERVE_CANARY', import.meta.url),
  );
  const r = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../verification/package-state-control.cjs', import.meta.url)),
      'observe',
      secret,
      path.join(secret, 'relocated-package'),
      'first-cancel',
    ],
    { encoding: 'utf8', timeout: 5000, maxBuffer: 4096 },
  );
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'PACKAGE_STATE_FAILED\n');
  assert.equal(r.stderr, 'PACKAGE_OBSERVE_ADMISSION\nPACKAGE_OBSERVE_ERROR_ENOENT\n');
  assert.equal((r.stdout + r.stderr).includes(secret), false);
});

test('private callback exceptions select fixed diagnostic codes without echo or getter access', () => {
  const { fixedObservationError } = require('../verification/package-state-control.cjs');
  function invoke(callback) {
    try {
      callback();
    } catch (error) {
      return fixedObservationError(error);
    }
  }
  assert.equal(
    invoke(() => {
      throw Error('PRIVATE_PATH_TOKEN_CANARY');
    }),
    'UNCLASSIFIED',
  );
  assert.equal(
    invoke(() => {
      throw Error('RESTORE_SCHEMA');
    }),
    'RESTORE_SCHEMA',
  );
  assert.equal(
    fixedObservationError({
      get message() {
        return assert.fail('getter executed');
      },
    }),
    'UNCLASSIFIED',
  );
  assert.equal(fixedObservationError(Error('restore_schema')), 'UNCLASSIFIED');
});

test('PowerShell capture transport accepts equivalent escaped JSON without relaxing canonical receipts', () => {
  const { parseCapture } = require('../verification/package-state-control.cjs');
  const { exact } = require('../verification/package-contract.cjs');
  // Representative ConvertTo-Json-compatible escapes, not the unuploaded
  // private text of the failed hosted capture.
  const raw = String.raw` { "process" : {"status":"SUCCESS","exitCode":0,"cleanupComplete":true,"stdoutTruncated":false,"stderrTruncated":false}, "stdout":"PERSISTENCE_DESKTOP_CANCELLED\r\n", "stderr":"warning: \u0027quoted\u0027 \u003cvalue\u003e \u0026 \u00e9" } `;
  const value = parseCapture(raw);
  assert.equal(value.stderr, "warning: 'quoted' <value> & é");
  assert.equal(value.stdout, 'PERSISTENCE_DESKTOP_CANCELLED\r\n');
  assert.throws(() => exact(raw, ['process', 'stdout', 'stderr']));
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'package-capture-first-cancel.json'), raw);
    assert.deepEqual(capture(f.root, 'first-cancel'), value);
  } finally {
    f.close();
  }
});

test('capture parser rejects duplicate masking, unknown shape, invalid JSON and exceeded bounds', () => {
  const { parseCapture } = require('../verification/package-state-control.cjs');
  const value = {
    process: {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    stdout: 'PERSISTENCE_DESKTOP_CANCELLED\n',
    stderr: '',
  };
  const raw = JSON.stringify(value);
  for (const bad of [
    raw.replace('"stdout":', '"stdout":"PRIVATE","stdout":'),
    raw.replace('"cleanupComplete":true', '"cleanupComplete":false,"cleanupComplete":true'),
    raw.replace('"stderrTruncated":false', '"stderrTruncated":true,"stderr\\u0054runcated":false'),
    raw.replace('"exitCode":0', '"exitCode":true'),
    raw.replace('"exitCode":0', '"exitCode":-0'),
    raw.replace('"exitCode":0', '"exitCode":2147483648'),
    raw.replace('"exitCode":0', '"exitCode":1e999'),
    raw.replace('"process":', '"unknown":0,"process":'),
    raw.replace('"status":"SUCCESS"', '"status":"SUCCESS","extra":0'),
    raw.replace('"process":{', '"process":{"nested":{'),
    raw.replace('"stderr":""', '"stderr":[]'),
    raw + 'true',
    '\ufeff' + raw,
    '\u00a0' + raw,
    raw.slice(0, -1) + ',}',
    JSON.stringify({ ...value, stderr: 'x'.repeat(32769) }),
    ' '.repeat(65537),
  ])
    assert.throws(() => parseCapture(bad));
  assert.equal(
    parseCapture(JSON.stringify({ ...value, stderr: 'x'.repeat(32768) })).stderr.length,
    32768,
  );
  assert.equal(
    parseCapture(JSON.stringify({ ...value, stderr: '😀'.repeat(16000) })).stderr.length,
    32000,
  );
});

test('complete capture diagnostic vector covers every acceptance predicate with fixed enums', () => {
  const {
    captureDiagnostics,
    CAPTURE_VECTOR,
    CAPTURE_MARKERS,
  } = require('../verification/package-state-control.cjs');
  const c = {
    process: {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    stdout: 'PERSISTENCE_DESKTOP_CANCELLED\r\n',
    stderr: '',
  };
  const d = captureDiagnostics(JSON.stringify(c), 'first-cancel');
  assert.deepEqual(d, {
    SCHEMA: 'VALID',
    PARSE_REASON: 'VALID',
    STATUS: 'MATCH',
    EXIT: 'MATCH',
    CLEANUP: 'TRUE',
    STDOUT_TRUNCATED: 'FALSE',
    STDERR_TRUNCATED: 'FALSE',
    EXPECTED_MARKER: 'ONE',
    NONEMPTY_LINES: 'ONE',
    STDOUT_MATCH: 'EXACT',
    CANCELLED: 'ONE',
    CLOSED: 'ZERO',
    RECOVERED: 'ZERO',
    FAILURE: 'ZERO',
    FAILURE_PREPARE: 'ZERO',
    FAILURE_SETUP: 'ZERO',
    FAILURE_INITIALIZATION: 'ZERO',
    FAILURE_RECOVERY: 'ZERO',
    FAILURE_APPLICATION: 'ZERO',
    FAILURE_RELEASE: 'ZERO',
    OTHER: 'ZERO',
    FRAMING: 'STANDARD',
    STDERR: 'EMPTY',
  });
  assert.equal(Object.isFrozen(CAPTURE_VECTOR), true);
  assert.equal(Object.isFrozen(d), true);
  assert.equal(Object.keys(d).length, 23);
  for (const [field, value, expected] of [
    ['status', 'NONZERO_EXIT', 'STATUS'],
    ['exitCode', 1, 'EXIT'],
    ['cleanupComplete', false, 'CLEANUP'],
    ['stdoutTruncated', true, 'STDOUT_TRUNCATED'],
    ['stderrTruncated', true, 'STDERR_TRUNCATED'],
  ]) {
    const result = captureDiagnostics(
      JSON.stringify({ ...c, process: { ...c.process, [field]: value } }),
      'first-cancel',
    );
    assert.notEqual(result[expected], d[expected]);
    assert.equal(Object.keys(result).length, 23);
    for (const [key, code] of Object.entries(result))
      assert.ok(CAPTURE_MARKERS.includes(`PACKAGE_CAPTURE_${key}_${code}`));
  }
});

test('capture vector classifies marker families, duplicates and framing without private output', () => {
  const { captureDiagnostics } = require('../verification/package-state-control.cjs');
  const process = {
    status: 'SUCCESS',
    exitCode: 0,
    cleanupComplete: true,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
  const out = (stdout, stderr = '') =>
    captureDiagnostics(JSON.stringify({ process, stdout, stderr }), 'first-cancel');
  const result = out(
    'PERSISTENCE_DESKTOP_CANCELLED\nPERSISTENCE_DESKTOP_CANCELLED\nPERSISTENCE_DESKTOP_CLOSED\nPERSISTENCE_DESKTOP_RECOVERED\nPERSISTENCE_DESKTOP_PREPARE_FAILED\nPRIVATE_TOKEN_PATH\n',
    'PRIVATE_ERROR',
  );
  assert.equal(result.EXPECTED_MARKER, 'MULTIPLE');
  assert.equal(result.NONEMPTY_LINES, 'MULTIPLE');
  assert.equal(result.STDOUT_MATCH, 'OTHER');
  assert.equal(result.CANCELLED, 'MULTIPLE');
  assert.equal(result.CLOSED, 'ONE');
  assert.equal(result.RECOVERED, 'ONE');
  assert.equal(result.FAILURE, 'ONE');
  assert.equal(result.OTHER, 'ONE');
  assert.equal(result.STDERR, 'PRESENT');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  for (const [raw, framing] of [
    ['\nPERSISTENCE_DESKTOP_CANCELLED\n', 'LEADING_EMPTY'],
    ['\n\nPERSISTENCE_DESKTOP_CANCELLED\n', 'EXTRA_EMPTY'],
    ['PERSISTENCE_DESKTOP_CANCELLED\r', 'BARE_CR'],
    ['', 'OTHER'],
  ])
    assert.equal(out(raw).FRAMING, framing);
  assert.equal(out('').EXPECTED_MARKER, 'ZERO');
  assert.equal(out('').NONEMPTY_LINES, 'ZERO');
  assert.equal(out('PERSISTENCE_DESKTOP_CANCELLED \n').OTHER, 'ONE');
});

test('invalid or unavailable capture schema still emits the entire safe unavailable vector', () => {
  const { captureDiagnostics } = require('../verification/package-state-control.cjs');
  for (const raw of [undefined, 'PRIVATE_JSON_CANARY', '{"process":{},"stdout":"","stderr":""}']) {
    const d = captureDiagnostics(raw, 'first-cancel');
    assert.equal(Object.keys(d).length, 23);
    assert.equal(d.SCHEMA, raw === undefined ? 'UNAVAILABLE' : 'INVALID');
    assert.ok(
      Object.entries(d)
        .filter(([key]) => key !== 'SCHEMA' && key !== 'PARSE_REASON')
        .every(([, value]) => value === 'UNAVAILABLE'),
    );
    assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
  }
});

test('capture parse reason vector discriminates every bounded schema rejection without raw errors', () => {
  const { captureDiagnostics } = require('../verification/package-state-control.cjs');
  const c = {
    process: {
      status: 'SUCCESS',
      exitCode: 0,
      cleanupComplete: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    stdout: 'PERSISTENCE_DESKTOP_CANCELLED\n',
    stderr: '',
  };
  const encoded = JSON.stringify(c);
  const cases = [
    ['x'.repeat(65537), 'INPUT_LIMIT'],
    ['{', 'JSON_GRAMMAR'],
    ['{"process":{"nested":{}}}', 'DEPTH'],
    ['{"a":0,"b":0,"c":0,"d":0,"e":0,"f":0,"g":0,"h":0,"i":0}', 'PAIRS'],
    ['{"process":{},"process":{}}', 'DUPLICATE'],
    ['{}', 'ROOT_KEYS'],
    ['{"process":{},"stdout":"","stderr":""}', 'PROCESS_KEYS'],
    [encoded.replace('"status":"SUCCESS"', '"status":true'), 'STATUS_TYPE_OR_ENUM'],
    [encoded.replace('"exitCode":0', '"exitCode":true'), 'EXIT_TYPE_OR_RANGE'],
    [encoded.replace('"cleanupComplete":true', '"cleanupComplete":1'), 'BOOLEAN_TYPES'],
    [JSON.stringify({ ...c, stdout: null }), 'STDOUT_TYPE_OR_LIMIT'],
    [JSON.stringify({ ...c, stderr: null }), 'STDERR_TYPE_OR_LIMIT'],
  ];
  for (const [raw, reason] of cases) {
    const d = captureDiagnostics(raw, 'first-cancel');
    assert.equal(d.SCHEMA, 'INVALID');
    assert.equal(d.PARSE_REASON, reason);
    assert.equal(Object.keys(d).length, 23);
  }
  const source = fs.readFileSync(new URL('../launch/launch-core.ps1', import.meta.url), 'utf8');
  const failures = [...new Set(source.match(/PERSISTENCE_DESKTOP_[A-Z_]+FAILED/g))];
  assert.equal(failures.length, 6);
  for (const marker of failures) {
    const d = captureDiagnostics(JSON.stringify({ ...c, stdout: `${marker}\n` }), 'first-cancel');
    assert.equal(d.FAILURE, 'ONE');
    assert.equal(d.OTHER, 'ZERO');
    assert.equal(
      d[`FAILURE_${marker.slice('PERSISTENCE_DESKTOP_'.length, -'_FAILED'.length)}`],
      'ONE',
    );
  }
});

test('nested observer diagnostics forward only exact paired literals from a bound retired native capture', () => {
  const { observerDiagnostics } = require('../verification/package-state-control.cjs');
  const {
    OBSERVER_PHASES,
    OBSERVER_REASONS,
  } = require('../verification/package-launch-observer.cjs');
  const phase = `PACKAGE_OBSERVER_PHASE_${OBSERVER_PHASES[0]}`,
    reason = `PACKAGE_OBSERVER_REASON_${OBSERVER_REASONS[0]}`;
  const stderr = `PRIVATE_PATH_AND_EXCEPTION\r\n${phase}\r\n${reason}\r\nPACKAGE_OBSERVER_FAILED\r\n`;
  const facts = {
    BINDING: 'VALID',
    CHAIN: 'VALID',
    SETTLEMENT: 'PRESENT',
    CAPTURE_RETIREMENT: 'RETIRED',
    INTENT: 'PROVISION',
  };
  for (const stage of ['PROVISION', 'AUTH', 'MAIN'])
    assert.deepEqual(observerDiagnostics({ ...facts, INTENT: stage }, stderr), [phase, reason]);
  for (const [key, value] of [
    ['BINDING', 'INVALID'],
    ['CHAIN', 'INVALID'],
    ['SETTLEMENT', 'ABSENT'],
    ['CAPTURE_RETIREMENT', 'UNCONFIRMED'],
    ['INTENT', 'SETUP'],
    ['INTENT', 'RELEASE'],
  ])
    assert.deepEqual(observerDiagnostics({ ...facts, [key]: value }, stderr), []);
  const forwarded = observerDiagnostics(facts, stderr);
  assert.equal(Object.isFrozen(forwarded), true);
  assert.equal(JSON.stringify(forwarded).includes('PRIVATE'), false);
});

test('observer forwarding rejects duplicates, prefixes, unknown diagnostics and over-limit streams', () => {
  const { observerDiagnostics } = require('../verification/package-state-control.cjs');
  const {
    OBSERVER_PHASES,
    OBSERVER_REASONS,
  } = require('../verification/package-launch-observer.cjs');
  const phase = `PACKAGE_OBSERVER_PHASE_${OBSERVER_PHASES[0]}`,
    reason = `PACKAGE_OBSERVER_REASON_${OBSERVER_REASONS[0]}`;
  const facts = {
    BINDING: 'VALID',
    CHAIN: 'VALID',
    SETTLEMENT: 'PRESENT',
    CAPTURE_RETIREMENT: 'RETIRED',
    INTENT: 'PROVISION',
  };
  for (const raw of [
    `${phase}\n${phase}\n${reason}`,
    `${phase}\n${reason}\n${reason}`,
    ` ${phase}\n${reason}`,
    `${phase}_PRIVATE\n${reason}`,
    `${phase}\nPACKAGE_OBSERVER_REASON_PRIVATE`,
    phase,
    reason,
    'x'.repeat(32769),
    null,
  ])
    assert.deepEqual(observerDiagnostics(facts, raw), []);
});
