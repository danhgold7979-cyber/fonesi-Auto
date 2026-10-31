'use strict';
// Trusted launch supervisor's Node control. All native captures and identities stay
// in its private owned launch directory. No renderer IPC or arbitrary service API.
const fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const uuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function plain(p) {
  const s = fs.lstatSync(p);
  if (
    path.resolve(p) !== p ||
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    fs.realpathSync(p).toLowerCase() !== p.toLowerCase()
  )
    throw new Error('DIRECTORY');
}
function absent(p) {
  try {
    fs.lstatSync(p);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    throw e;
  }
}
function read(p) {
  plain(path.dirname(p));
  const s = fs.lstatSync(p);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'r'),
    b = Buffer.alloc(65537);
  let n = 0;
  try {
    for (;;) {
      const c = fs.readSync(fd, b, n, b.length - n, null);
      if (!c) break;
      n += c;
      if (n === b.length) throw new Error('FILE');
    }
  } finally {
    fs.closeSync(fd);
  }
  return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(b.subarray(0, n));
}
function parse(p) {
  const raw = read(p),
    v = JSON.parse(raw);
  if (JSON.stringify(v) !== raw) throw new Error('JSON');
  return v;
}
function write(p, v) {
  plain(path.dirname(p));
  const raw = JSON.stringify(v);
  if (Buffer.byteLength(raw) > 65536) throw new Error('FILE');
  const fd = fs.openSync(p, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, raw);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
function keys(v, names) {
  if (
    v === null ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    JSON.stringify(Object.keys(v)) !== JSON.stringify(names)
  )
    throw new Error('SHAPE');
}
function witness(v) {
  keys(v, ['storeId', 'backupId', 'locationId', 'encryptedSha256']);
  if (
    ![v.storeId, v.backupId, v.locationId].every(uuid) ||
    typeof v.encryptedSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(v.encryptedSha256)
  )
    throw new Error('WITNESS');
  return v;
}
function capture(launch, stage) {
  const c = parse(path.join(launch, stage + '-capture.json'));
  keys(c, ['process', 'stdout', 'stderr']);
  keys(c.process, ['status', 'exitCode', 'cleanupComplete', 'stdoutTruncated', 'stderrTruncated']);
  if (
    c.process.status !== 'SUCCESS' ||
    c.process.exitCode !== 0 ||
    c.process.cleanupComplete !== true ||
    c.process.stdoutTruncated !== false ||
    c.process.stderrTruncated !== false ||
    typeof c.stdout !== 'string' ||
    typeof c.stderr !== 'string' ||
    c.stdout.length > 32768 ||
    c.stderr.length > 32768
  )
    throw new Error('RETIREMENT');
  const lines = c.stdout.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] === '') lines.shift();
  if (
    c.stderr
      .split(/\r?\n/)
      .some((x) =>
        [
          'PERSISTENCE_INITIALIZE_FAILED',
          'BOOTSTRAP_FAILED',
          'BOOTSTRAP_CLEANUP_FAILED',
          'PERSISTENCE_SHUTDOWN_FAILED',
          'LOGGING_DEGRADED',
        ].includes(x),
      )
  )
    throw new Error('NATIVE_FAILURE');
  return lines;
}
async function run() {
  const [action, root, launch] = process.argv.slice(2);
  if (
    process.argv.length !== 5 ||
    ![
      'setup',
      'prepare-provision',
      'observe-provision',
      'prepare-auth',
      'observe-auth',
      'prepare-ready',
      'release',
    ].includes(action) ||
    process.versions.node !== '24.22.1'
  )
    throw new Error('ARGUMENTS');
  const { verifyBuild } = await import('../scripts/build-manifest.mjs');
  if (!verifyBuild(path.resolve(__dirname, '..'))) throw new Error('BUILD');
  const files = require('../build/persistence-files.cjs'),
    profile = require('../build/backup-key-profile.cjs'),
    proofs = require('../build/persistence-proof.cjs');
  plain(root);
  plain(launch);
  if (
    path.dirname(launch) !== root ||
    !/^launch-[0-9a-f-]{36}$/.test(path.basename(launch)) ||
    !uuid(read(path.join(launch, '.owner')))
  )
    throw new Error('LAUNCH');
  const parentToken = read(path.join(root, '.owner'));
  if (!uuid(parentToken)) throw new Error('OWNER');
  const location = { root: path.join(root, 'data-main'), parentToken },
    stateFile = path.join(launch, 'state.json');
  if (action === 'setup') {
    if (absent(location.root))
      await files.createPersistenceRoot(location, {
        version: 1,
        storeId: randomUUID(),
        kind: 'FRESH',
        restoreReceiptId: null,
      });
    const provenance = await files.verifyPersistenceRoot(location);
    if (provenance.kind !== 'FRESH') throw new Error('RESTORED_MAINTENANCE_REQUIRED');
    const ownerToken = randomUUID();
    await files.acquirePersistenceLease(location, ownerToken);
    const runtime = parse(path.join(launch, 'runtime-attestation.json'));
    if (
      runtime.version !== 1 ||
      runtime.electron !== '45.1.0' ||
      typeof runtime.exeSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(runtime.exeSha256)
    )
      throw new Error('RUNTIME');
    const needsProvision = absent(path.join(location.root, 'migration-backups.json'));
    // Existing missing/corrupt initialization is not silently reset: only an empty
    // staged catalogue from an observed prior cancellation is retryable below.
    if (needsProvision && !absent(path.join(location.root, 'staging'))) {
      if (
        read(path.join(root, 'provision-cancelled.json')) !==
          JSON.stringify({ version: 1, storeId: provenance.storeId }) ||
        read(path.join(location.root, 'backup-locations.json')) !==
          JSON.stringify({
            version: 1,
            storeId: provenance.storeId,
            activeLocationId: null,
            locations: [],
          }) ||
        !absent(path.join(location.root, 'active.sqlite')) ||
        !absent(path.join(location.root, 'staging/install.sqlite'))
      )
        throw new Error('PROVISION_INTERRUPTED');
    }
    write(stateFile, {
      version: 1,
      root,
      parentToken,
      ownerToken,
      storeId: provenance.storeId,
      needsProvision,
      runtimeExeSha256: runtime.exeSha256,
    });
    console.log('PERSISTENCE_LAUNCH_CONTROL_PASS');
    return;
  }
  const state = parse(stateFile);
  keys(state, [
    'version',
    'root',
    'parentToken',
    'ownerToken',
    'storeId',
    'needsProvision',
    'runtimeExeSha256',
  ]);
  if (
    state.version !== 1 ||
    state.root !== root ||
    state.parentToken !== parentToken ||
    ![state.ownerToken, state.storeId].every(uuid) ||
    typeof state.needsProvision !== 'boolean' ||
    typeof state.runtimeExeSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(state.runtimeExeSha256)
  )
    throw new Error('STATE');
  const owned = () => files.assertBorrowedPersistenceLease(location, state.ownerToken);
  await owned();
  if (action === 'prepare-provision' || action === 'prepare-auth') {
    const stage = action.slice(8);
    if (stage === 'provision' && !state.needsProvision) throw new Error('STAGE');
    if (
      stage === 'auth' &&
      state.needsProvision &&
      parse(path.join(launch, 'provision-observed.json')).status !== 'PROVISIONED'
    )
      throw new Error('STAGE');
    const fresh = stage === 'provision' && absent(path.join(location.root, 'key-profile'));
    const key = await profile.prepareBackupKeyProfile(location.root, state.storeId, fresh, owned);
    const profilePath = path.join(
      launch,
      'fonesi-auto-foundation-' + path.basename(launch).slice(7) + '-' + stage,
    );
    plain(profilePath);
    write(path.join(launch, stage + '-control.json'), {
      version: 1,
      stage,
      root,
      parentToken,
      ownerToken: state.ownerToken,
      storeId: state.storeId,
      checkpoint: key.checkpoint === null ? null : path.basename(key.checkpoint),
      fresh,
      profile: profilePath,
      runtimeExeSha256: state.runtimeExeSha256,
    });
  } else if (action === 'observe-provision' || action === 'observe-auth') {
    const stage = action.slice(8),
      lines = capture(launch, stage);
    if (JSON.stringify(lines) !== JSON.stringify(['PERSISTENCE_INITIALIZE_ORDERLY']))
      throw new Error('MARKER');
    const result = parse(path.join(launch, stage + '-result.json'));
    keys(result, ['version', 'stage', 'status', 'witness']);
    if (result.version !== 1 || result.stage !== stage) throw new Error('RESULT');
    if (stage === 'provision' && result.status === 'CANCELLED') {
      if (result.witness !== null) throw new Error('RESULT');
      write(path.join(launch, 'provision-observed.json'), result);
      if (absent(path.join(root, 'provision-cancelled.json')))
        write(path.join(root, 'provision-cancelled.json'), { version: 1, storeId: state.storeId });
      console.log('PERSISTENCE_LAUNCH_CANCELLED');
    } else {
      if (
        result.status !== (stage === 'provision' ? 'PROVISIONED' : 'AUTHENTICATED') ||
        witness(result.witness).storeId !== state.storeId
      )
        throw new Error('RESULT');
      if (stage === 'auth') {
        const registry = parse(path.join(location.root, 'migration-backups.json'));
        if (!Array.isArray(registry) || registry.length < 1 || registry.length > 64)
          throw new Error('REGISTRY');
        const first = registry[0];
        const original = {
          storeId: first.header.storeId,
          backupId: first.header.backupId,
          locationId: first.header.locationId,
          encryptedSha256: first.encryptedSha256,
        };
        if (JSON.stringify(witness(original)) !== JSON.stringify(result.witness))
          throw new Error('OLD_BACKUP_CHANGED');
        if (
          state.needsProvision &&
          JSON.stringify(parse(path.join(launch, 'provision-observed.json')).witness) !==
            JSON.stringify(original)
        )
          throw new Error('OLD_BACKUP_CHANGED');
        const proofFile = path.join(location.root, 'key-durability-proof.json');
        if (absent(proofFile))
          write(proofFile, {
            version: 2,
            ...original,
            state: 'ORDERLY_REOPEN_AUTHENTICATED',
            runtimeCertification: proofs.RUNTIME_CERTIFICATION,
          });
        else if (
          !proofs.proofMatchesWitness(proofs.parsePersistenceProof(read(proofFile)), original)
        )
          throw new Error('PROOF_CHANGED');
      }
      write(path.join(launch, stage + '-observed.json'), result);
    }
  } else if (action === 'prepare-ready') {
    if (parse(path.join(launch, 'auth-observed.json')).status !== 'AUTHENTICATED')
      throw new Error('AUTH_MISSING');
    const key = await profile.prepareBackupKeyProfile(location.root, state.storeId, false, owned);
    if (key.checkpoint === null) throw new Error('CHECKPOINT');
    const ready = path.join(location.root, '.ready-launch.json'),
      bytes = JSON.stringify({
        version: 2,
        state: 'READY',
        root: location.root,
        parentToken,
        ownerToken: state.ownerToken,
        storeId: state.storeId,
        checkpoint: path.basename(key.checkpoint),
        runtimeExeSha256: state.runtimeExeSha256,
      });
    if (absent(ready)) await files.writePersistenceFile(ready, bytes);
    else await files.replacePersistenceFile(ready, bytes);
  } else if (action === 'release') {
    const cancelled =
      !absent(path.join(launch, 'provision-observed.json')) &&
      parse(path.join(launch, 'provision-observed.json')).status === 'CANCELLED';
    if (!cancelled) {
      const lines = capture(launch, 'main');
      if (
        lines.length !== 2 ||
        lines[1] !== 'BOOTSTRAP_CLOSED' ||
        ![
          'BOOTSTRAP_READY',
          'PERSISTENCE_MAINTENANCE_COMPLETED',
          'PERSISTENCE_MAINTENANCE_CANCELLED',
        ].includes(lines[0])
      )
        throw new Error('MAIN_RETIREMENT');
    }
    await owned();
    const owner = JSON.stringify({
      version: 1,
      storeId: state.storeId,
      ownerToken: state.ownerToken,
    });
    await files.writePersistenceFile(
      path.join(location.root, '.released-' + state.ownerToken + '.json'),
      owner,
    );
    await owned();
    fs.unlinkSync(path.join(location.root, '.writer-lock/owner.json'));
    fs.rmdirSync(path.join(location.root, '.writer-lock'));
  }
  console.log('PERSISTENCE_LAUNCH_CONTROL_PASS');
}
run().catch(() => {
  console.log('PERSISTENCE_LAUNCH_CONTROL_FAILED');
  process.exitCode = 1;
});
