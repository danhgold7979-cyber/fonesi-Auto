'use strict';
// Verification-only exact main instrumentation; actual factory uses its real default bindings.
const fs = require('node:fs'),
  path = require('node:path'),
  Module = require('node:module');
const { createHash, randomUUID } = require('node:crypto');
const {
  DIAGNOSTICS,
  contextDiagnostic,
  reason,
  CASES,
  PHASES,
  SCOPE,
  validateResult,
  deriveMain,
  write,
  rootForLaunch,
} = require('./retained-host-contract.cjs');
let context = null;
function bindContext(value) {
  if (
    context !== null ||
    !Object.isFrozen(value) ||
    JSON.stringify(Object.keys(value)) !==
      JSON.stringify(['entry', 'runtimeCustody', 'setup', 'assertOwnedSync']) ||
    typeof value.assertOwnedSync !== 'function'
  )
    throw Error('RETAINED_HOST_CONTEXT');
  value.assertOwnedSync();
  context = value;
}
function bounded(file, max) {
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size < 1 ||
    s.size > max ||
    fs.realpathSync.native(file) !== file
  )
    throw Error('RETAINED_HOST_FILE');
  const fd = fs.openSync(file, 'r');
  try {
    const before = fs.fstatSync(fd),
      b = Buffer.alloc(s.size + 1);
    let n = 0;
    while (n < b.length) {
      const got = fs.readSync(fd, b, n, b.length - n, null);
      if (!got) break;
      n += got;
    }
    const after = fs.fstatSync(fd);
    if (
      n !== s.size ||
      before.ino !== s.ino ||
      before.dev !== s.dev ||
      after.size !== s.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw Error('RETAINED_HOST_FILE');
    return b.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
function runObserver() {
  const { app, dialog, shell, safeStorage } = require('electron');
  let phase = 'PREPARE',
    root,
    launch,
    factory,
    ready = 0,
    closed = 0,
    complete = false,
    failed = false,
    dialogIndex = 0,
    request = 0;
  const cases = Object.fromEntries(CASES.map((k) => [k, false]));
  let hostResult = null;
  const originalLog = console.log;
  const deadline = setTimeout(() => fail(), 210000);
  function fail(error) {
    if (failed) return;
    failed = true;
    const e = factory?.evidence;
    let contextFacts = {};
    if (phase === 'ADMISSION' && reason(error) === 'HOST_CONTEXT_REJECTED') {
      try {
        const file = path.resolve(__dirname, '../build/adb-host-factory.cjs');
        const manifest = JSON.parse(
          bounded(path.resolve(__dirname, '../build/.verified-build.json'), 65536),
        );
        const source = bounded(file, 8388608).toString('utf8');
        let system = {};
        try {
          const exe = path.join(
            process.env.SystemRoot,
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'powershell.exe',
          );
          const stat = fs.lstatSync(exe);
          system = {
            SYSTEMREGULAR: stat.isFile(),
            SYSTEMREPARSE: stat.isSymbolicLink(),
            SYSTEMSINGLELINK: stat.nlink === 1,
            SYSTEMCANONICAL: fs.realpathSync.native(exe) === exe,
          };
        } catch {
          /* unavailable diagnostic only */
        }
        contextFacts = contextDiagnostic(
          error,
          source,
          file,
          manifest.outputs['adb-host-factory.cjs'],
          system,
        );
      } catch {
        /* unavailable diagnostic only */
      }
    }
    const values = {
      ...contextFacts,
      REASON: reason(error),
      OUTCOME: hostResult?.outcome,
      CODE: hostResult?.code,
      HELPERSTATE: e?.helperState,
      HELPERPHASE: e?.phase,
      HELPEREXIT: e?.exit,
    };
    for (const [slot, allowed] of Object.entries(DIAGNOSTICS)) {
      const value = allowed.includes(values[slot]) ? values[slot] : 'UNAVAILABLE';
      fs.writeSync(2, `RETAINED_HOST_DIAGNOSTIC_${slot}_${value}\n`);
    }
    fs.writeSync(
      2,
      `RETAINED_HOST_PHASE_${PHASES.includes(phase) ? phase : 'PREPARE'}\nRETAINED_HOST_FAILED\n`,
    );
    clearTimeout(deadline);
    app.exit(1);
  }
  function current() {
    try {
      context.assertOwnedSync();
      return !failed;
    } catch {
      return false;
    }
  }
  async function read() {
    const r = JSON.parse(
      await context.setup.execute(
        { version: 1, requestId: `p${++request}`, method: 'platformTools.get' },
        current,
      ),
    );
    if (!r.ok || r.outcome !== 'OBSERVED') throw Error('RETAINED_HOST_SETUP');
    return r.snapshot;
  }
  async function poll(fn) {
    const stop = Date.now() + 120000;
    while (Date.now() < stop) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error('RETAINED_HOST_TIMEOUT');
  }
  dialog.showMessageBox = async (...args) => {
    const o = args.at(-1);
    const expected = [
      ['Hủy', 'Mở điều khoản', 'Tôi đã đọc và đồng ý'],
      ['Hủy', 'Chọn tệp ZIP', 'Tải từ Google'],
      ['Hủy', 'Xác nhận thiết lập'],
    ];
    const index = dialogIndex++;
    if (
      phase !== 'SETUP' ||
      index > 2 ||
      o.title !== 'Thiết lập Android Platform Tools' ||
      o.defaultId !== 0 ||
      o.cancelId !== 0 ||
      JSON.stringify(o.buttons) !== JSON.stringify(expected[index])
    )
      throw Error('RETAINED_HOST_DIALOG');
    return { response: [2, 1, 1][index], checkboxChecked: false };
  };
  let pickers = 0;
  dialog.showOpenDialog = async (...args) => {
    const o = args.at(-1);
    if (
      phase !== 'SETUP' ||
      ++pickers !== 1 ||
      dialogIndex !== 2 ||
      o.title !== 'Chọn Android Platform Tools 37.0.1 ZIP' ||
      JSON.stringify(o.properties) !== JSON.stringify(['openFile'])
    )
      throw Error('RETAINED_HOST_DIALOG');
    return { canceled: false, filePaths: [path.join(root, 'official.zip')] };
  };
  shell.openExternal = async () => {
    throw Error('RETAINED_HOST_TERMS_NOT_OPENED');
  };
  async function run() {
    if (!context || ready !== 1) throw Error('RETAINED_HOST_CONTEXT');
    cases.mainReady = true;
    phase = 'MIGRATION';
    if ((await require('./fleet-ui-schema4.cjs').observeSchema4(launch, safeStorage)) !== true)
      throw Error('RETAINED_HOST_SCHEMA');
    write(path.join(root, 'schema4-observed.json'), {
      version: 2,
      migration3BackupAuthenticated: true,
      migration4ReceiptBound: true,
      durableStartupCommitted: true,
      captureStoreEmpty: true,
    });
    cases.schema4Observed = true;
    phase = 'SETUP';
    const initial = await read();
    if (initial.state !== 'UNAVAILABLE' || initial.installationRevision !== 0)
      throw Error('RETAINED_HOST_INITIAL');
    const ack = JSON.parse(
      await context.setup.execute(
        {
          version: 1,
          requestId: `p${++request}`,
          method: 'platformTools.setup.request',
          expectedRevision: initial.revision,
        },
        current,
      ),
    );
    if (!ack.ok || ack.outcome !== 'PENDING') throw Error('RETAINED_HOST_PENDING');
    await poll(async () => {
      const s = await read();
      if (['FAILED', 'DECLINED', 'OUTCOME_UNKNOWN'].includes(s.state))
        throw Error('RETAINED_HOST_SETUP');
      return (
        s.state === 'VERIFIED_LOCAL' &&
        s.installationRevision === 1 &&
        s.code === null &&
        context.setup.retired
      );
    });
    if (dialogIndex !== 3 || pickers !== 1 || !context.runtimeCustody.retired)
      throw Error('RETAINED_HOST_CUSTODY');
    cases.archiveProvisioned = true;
    cases.setupRetired = true;
    phase = 'ADMISSION';
    const checked = await context.runtimeCustody.acquireRead();
    if (
      !checked.ok ||
      checked.status !== 'READ_VERIFIED_ONLY' ||
      checked.observation.release !== '37.0.1' ||
      checked.observation.installationRevision !== 1
    )
      throw Error('RETAINED_HOST_RUNTIME');
    const released = await context.runtimeCustody.releaseRead(checked.token);
    if (!released.ok || released.status !== 'RETIRED') throw Error('RETAINED_HOST_RUNTIME');
    cases.actualRuntimeAdmitted = true;
    const receipt = JSON.parse(bounded(path.join(launch, 'host-parent.json'), 4096));
    if (
      receipt.parentPid !== process.pid ||
      receipt.storeId !== context.entry.storeId ||
      receipt.ownerToken !== context.entry.ownerToken
    )
      throw Error('RETAINED_HOST_PARENT');
    cases.parentReceiptBound = true;
    factory = require('../build/adb-host-factory.cjs').createHostFactory({
      entry: context.entry,
      launchRoot: launch,
      desktopRoot: path.resolve(__dirname, '..'),
      runtimeCustody: context.runtimeCustody,
      assertOwnedSync: context.assertOwnedSync,
      now: () => Date.now(),
      diagnosticId: () => randomUUID(),
    });
    const owner = randomUUID(),
      cap = factory.grant(owner, context.assertOwnedSync);
    phase = 'VERSION';
    const result = await factory.execute(cap, {
      version: 1,
      commandId: randomUUID(),
      correlationId: randomUUID(),
      ownerId: owner,
      operation: 'HOST_VERSION',
      deadlineUtc: Date.now() + 30000,
    });
    hostResult = result;
    if (result.outcome !== 'OBSERVED' || result.code !== 'OK' || !context.runtimeCustody.retired)
      throw Error('RETAINED_HOST_VERSION');
    cases.versionObserved = true;
    cases.invocationRetired = true;
    cases.helperStarted = factory.evidence.helperState === 'RUNNING';
    phase = 'RETIRE';
    if ((await factory.close()) !== 'RETIRED' || !factory.retired)
      throw Error('RETAINED_HOST_RETIRE');
    const evidence = factory.evidence;
    cases.helperRetired = true;
    cases.helperExitZero = evidence.helperState === 'EXITED' && evidence.exit === 'ZERO';
    cases.helperDirectoryRemoved =
      evidence.directoryCleanup &&
      !fs.readdirSync(launch).some((n) => n.startsWith('host-session'));
    if (CASES.filter((k) => k !== 'mainClosed').some((k) => cases[k] !== true))
      throw Error('RETAINED_HOST_CASES');
    phase = 'CLOSE';
    complete = true;
    app.quit();
  }
  try {
    const profile = process.env.FONESI_BOOTSTRAP_ROOT;
    if (typeof profile !== 'string' || profile !== path.resolve(profile))
      throw Error('RETAINED_HOST_PROFILE');
    launch = path.dirname(profile);
    root = rootForLaunch(launch);
    console.log = (...args) => {
      if (args.length === 1 && args[0] === 'BOOTSTRAP_READY') {
        if (++ready !== 1) fail();
        else setImmediate(() => run().catch(fail));
      }
      if (args.length === 1 && args[0] === 'BOOTSTRAP_CLOSED') closed++;
      originalLog.apply(console, args);
    };
    const main = path.resolve(__dirname, '../build/main.cjs'),
      raw = bounded(main, 8388608),
      manifest = JSON.parse(
        bounded(path.resolve(__dirname, '../build/.verified-build.json'), 65536),
      ),
      proof = JSON.parse(bounded(path.join(root, 'copy.json'), 65536));
    if (hash(raw) !== manifest.outputs['main.cjs'] || hash(raw) !== proof.originalMainSha256)
      throw Error('RETAINED_HOST_MAIN');
    const derived = deriveMain(new TextDecoder('utf8', { fatal: true }).decode(raw), __filename);
    if (hash(derived) !== proof.derivedMainSha256) throw Error('RETAINED_HOST_MAIN');
    const loaded = new Module(main, module);
    loaded.filename = main;
    loaded.paths = Module._nodeModulePaths(path.dirname(main));
    loaded._compile(derived, main);
    loaded.loaded = true;
    app.on('will-quit', () => {
      try {
        if (!complete || ready !== 1 || closed !== 1 || !factory.retired)
          throw Error('RETAINED_HOST_CLOSE');
        cases.mainClosed = true;
        const result = { version: 1, scope: SCOPE, cases, readyCount: ready, closedCount: closed };
        if (!validateResult(result).passed) throw Error('RETAINED_HOST_CASES');
        write(path.join(root, 'retained-host-result.json'), result);
        write(path.join(root, `launcher-witness-${path.basename(launch).slice(7)}-ui.json`), {
          version: 1,
          ready: true,
          quitRequested: true,
          closed: true,
        });
        clearTimeout(deadline);
      } catch {
        fail();
      }
    });
  } catch (error) {
    fail(error);
  }
}
module.exports = { bindContext, runObserver };
// Electron default_app imports this CJS entry; it is not require.main.
// Export before starting so the derived main can bind through the module cache.
runObserver();
