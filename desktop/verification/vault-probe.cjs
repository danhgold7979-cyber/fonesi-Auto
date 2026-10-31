'use strict';
// Actual library/provider custody; no production test flags or secret transport.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const promises = require('node:fs/promises');
const { observeIndexRename } = require('./vault-denial.cjs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { directory, read, write } = require('./vault-owned.cjs');
const {
  CASES,
  VERSIONS,
  exact,
  uuid,
  auditMatches,
  control: parseControl,
  result: parseResult,
} = require('./vault-contract.cjs');
const { FoundationPersistence } = require('../build/foundation-persistence.cjs');
const { createNativeSecretStore } = require('../build/secret-store.cjs');
const { snapshotRef } = require('../build/secret-contract.cjs');
const { ApplicationLogger } = require('../build/logging.cjs');
const { encodeLogRecord } = require('../build/log-contract.cjs');
const { assertBorrowedPersistenceLease } = require('../build/persistence-files.cjs');
const { backupKeys, validBackupLocalState } = require('../build/backup-key-profile.cjs');
const { prepareOwnedProfile } = require('../build/profile-owner.cjs');
const canaries = ['P106_SYNTHETIC_VAULT_INITIAL_CANARY', 'P106_SYNTHETIC_VAULT_REPLACED_CANARY'];
const cases = Object.fromEntries(CASES.map((k) => [k, false]));
let control,
  root,
  data,
  logger,
  store,
  persistence,
  finished = false,
  recordCount = 0,
  accessDeniedCode = null;
const timer = setTimeout(() => {
  console.error('VAULT_DEADLINE');
  app.exit(74);
}, 110000);
function reference(stage) {
  const raw = read(path.join(root, `persistence-vault-reference-${control.mode}-${stage}.json`));
  const value = JSON.parse(raw),
    checked = snapshotRef(value);
  if (raw !== JSON.stringify(value) || !checked.ok) throw new Error('REF');
  return checked.value;
}
function success(v, operation) {
  if (v?.ok !== true || v.operation !== operation || v.auditHealth !== 'AVAILABLE')
    throw new Error('OPERATION');
  return v.data;
}
function denied(v, code) {
  if (v?.ok !== false || v.code !== code || v.auditHealth !== 'AVAILABLE')
    throw new Error('DENIAL');
}
function sameBytes(v, expected) {
  const data = success(v, 'READ');
  try {
    if (!Buffer.from(data.bytes).equals(Buffer.from(expected))) throw new Error('BYTES');
  } finally {
    data.bytes.fill(0);
  }
}
function cipherHash(file) {
  directory(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error('CIPHER');
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(32769);
    let n = 0;
    while (n < bytes.length) {
      const got = fs.readSync(fd, bytes, n, bytes.length - n, null);
      if (!got) break;
      n += got;
    }
    if (n !== stat.size || n > 32768) throw new Error('CIPHER');
    return createHash('sha256').update(bytes.subarray(0, n)).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}
function scan(logRoot, expected) {
  directory(logRoot);
  const names = fs.opendirSync(logRoot);
  const observed = [];
  let count = 0,
    total = 0;
  try {
    for (;;) {
      const entry = names.readSync();
      if (!entry) break;
      if (++count > 256 || !entry.isFile() || entry.isSymbolicLink()) throw new Error('SCAN');
      const file = path.join(logRoot, entry.name),
        stat = fs.lstatSync(file);
      total += stat.size;
      if (stat.size > 1048576 || total > 8 * 1024 * 1024) throw new Error('SCAN');
      const bytes = fs.readFileSync(file);
      if (bytes.length !== stat.size) throw new Error('SCAN');
      for (const canary of canaries)
        for (const encoding of ['utf8', 'utf16le'])
          if (
            bytes.includes(Buffer.from(canary, encoding)) ||
            bytes.includes(Buffer.from(Buffer.from(canary).toString('base64')))
          )
            throw new Error('CANARY');
      if (!entry.name.endsWith('.jsonl')) continue;
      const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (!text.endsWith('\n')) throw new Error('SCAN');
      for (const line of text.slice(0, -1).split('\n')) {
        const value = JSON.parse(line);
        if (encodeLogRecord(value) !== line + '\n' || ++recordCount > 128) throw new Error('SCAN');
        observed.push(value);
      }
    }
  } finally {
    names.closeSync();
  }
  if (!auditMatches(observed, expected)) throw new Error('AUDIT');
  cases.auditCanonical = true;
  cases.canaryAbsent = true;
}
try {
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_FORCE_IS_PACKAGED',
  ])
    if (process.env[name] !== undefined) throw new Error('ENV');
  for (const name of [
    'no-sandbox',
    'disable-gpu-sandbox',
    'disable-setuid-sandbox',
    'disable-web-security',
    'allow-running-insecure-content',
    'ignore-certificate-errors',
    'remote-debugging-port',
    'remote-debugging-pipe',
    'inspect',
    'inspect-brk',
  ])
    if (app.commandLine.hasSwitch(name)) throw new Error('ARGS');
  root = process.env.FONESI_PERSISTENCE_RUN_ROOT;
  directory(root);
  const name = process.env.FONESI_PERSISTENCE_CONTROL_NAME;
  if (
    typeof name !== 'string' ||
    !/^persistence-vault-control-(source|package)-(create|replace|denied|delete|deleted)\.json$/.test(
      name,
    )
  )
    throw new Error('CONTROL');
  control = parseControl(read(path.join(root, name)));
  if (
    name !== `persistence-vault-control-${control.mode}-${control.stage}.json` ||
    read(path.join(root, '.owner')) !== control.parentToken ||
    app.isReady() ||
    app.isPackaged !== (control.mode === 'package') ||
    process.argv.slice(app.isPackaged ? 1 : 2).length
  )
    throw new Error('ENTRY');
  data = path.join(root, `data-${control.mode}`);
  directory(data);
  if (
    read(path.join(data, '.persistence-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, kind: 'FRESH', restoreReceiptId: null })
  )
    throw new Error('DATA_OWNER');
  const lock = path.join(data, '.writer-lock');
  directory(lock);
  const lockEntries = fs.opendirSync(lock);
  try {
    if (lockEntries.readSync()?.name !== 'owner.json' || lockEntries.readSync() !== null)
      throw new Error('LEASE');
  } finally {
    lockEntries.closeSync();
  }
  if (
    read(path.join(lock, 'owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId, ownerToken: control.ownerToken })
  )
    throw new Error('LEASE');
  if (
    JSON.stringify({
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }) !== JSON.stringify(VERSIONS)
  )
    throw new Error('RUNTIME');
  const profile = path.join(data, 'key-profile');
  directory(profile);
  if (
    read(path.join(profile, '.key-profile-owner.json')) !==
    JSON.stringify({ version: 1, storeId: control.storeId })
  )
    throw new Error('PROFILE');
  const localState = read(path.join(profile, 'Local State'));
  if (
    !validBackupLocalState(localState) ||
    read(path.join(data, control.checkpoint)) !== localState
  )
    throw new Error('CHECKPOINT');
  const paths = prepareOwnedProfile(
    path.join(root, `fonesi-auto-foundation-${control.mode}-vault-${control.stage}`),
  );
  for (const [key, value] of Object.entries(paths)) app.setPath(key, value);
  app.setPath('sessionData', profile);
  cases.profileBeforeReady = true;
  app.on('will-quit', () => {
    clearTimeout(timer);
    if (!finished) {
      console.error('VAULT_UNEXPECTED_QUIT');
      app.exit(1);
      return;
    }
    const value = {
      version: 1,
      mode: control.mode,
      stage: control.stage,
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
      cases,
      recordCount,
      accessDeniedCode,
    };
    if (!parseResult(JSON.stringify(value), control.mode, control.stage).passed) {
      console.error('VAULT_FAILED');
      app.exit(1);
      return;
    }
    write(path.join(root, `persistence-vault-result-${control.mode}-${control.stage}.json`), value);
    console.log('VAULT_ORDERLY');
  });
  app
    .whenReady()
    .then(async () => {
      const assertOwned = () =>
        assertBorrowedPersistenceLease(
          { root: data, parentToken: control.parentToken },
          control.ownerToken,
        );
      await assertOwned();
      cases.leaseVerified = true;
      const witnessRaw = read(path.join(root, `persistence-witness-${control.mode}.json`)),
        witness = JSON.parse(witnessRaw);
      exact(witness, ['storeId', 'backupId', 'locationId', 'encryptedSha256']);
      if (
        witnessRaw !== JSON.stringify(witness) ||
        witness.storeId !== control.storeId ||
        ![witness.storeId, witness.backupId, witness.locationId].every(uuid) ||
        typeof witness.encryptedSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(witness.encryptedSha256)
      )
        throw new Error('WITNESS');
      if (
        read(path.join(data, 'key-durability-proof.json')) !==
        JSON.stringify({ version: 1, ...witness, state: 'ORDERLY_AND_ABRUPT_RECOVERED' })
      )
        throw new Error('PROOF');
      persistence = await FoundationPersistence.open(
        { root: data, parentToken: control.parentToken },
        control.ownerToken,
        await backupKeys(safeStorage),
        false,
      );
      const receipt = await persistence.authenticateBootstrap();
      if (
        JSON.stringify({
          storeId: receipt.header.storeId,
          backupId: receipt.header.backupId,
          locationId: receipt.header.locationId,
          encryptedSha256: receipt.encryptedSha256,
        }) !== witnessRaw
      )
        throw new Error('AUTH');
      await assertOwned();
      const expected = [];
      const logRoot = path.join(root, `logs-${control.mode}-vault-${control.stage}`);
      logger = await ApplicationLogger.open(
        { root: logRoot, parentToken: control.parentToken },
        () => {},
      );
      if (logger.health !== 'AVAILABLE') throw new Error('AUDIT');
      const options = {
        root: data,
        storeId: control.storeId,
        assertOwned,
        provider: safeStorage,
        audit: async (fields) => {
          const snapshot = { ...fields };
          const health = await logger.vaultAudit(fields);
          if (health === 'AVAILABLE') expected.push(snapshot);
          return health;
        },
      };
      store = createNativeSecretStore(options);
      await store.verify();
      cases.providerBound = true;
      const caller = store.grant(['CREATE', 'READ', 'REPLACE', 'DELETE', 'STATUS']);
      if (control.stage === 'create') {
        const created = success(
          await store.create(caller, 'PROXY_CREDENTIAL', Buffer.from(canaries[0])),
          'CREATE',
        );
        sameBytes(await store.read(caller, created.reference), canaries[0]);
        denied(
          await store.read(caller, {
            ...created.reference,
            revision: created.reference.revision + 1,
          }),
          'STALE_REFERENCE',
        );
        write(
          path.join(root, `persistence-vault-reference-${control.mode}-create.json`),
          created.reference,
        );
        cases.referenceDenial = true;
      } else if (control.stage === 'replace') {
        const old = reference('create');
        sameBytes(await store.read(caller, old), canaries[0]);
        const replaced = success(
          await store.replace(caller, old, Buffer.from(canaries[1])),
          'REPLACE',
        );
        if (replaced.reference.id !== old.id || replaced.reference.revision !== old.revision + 1)
          throw new Error('REVISION');
        denied(await store.read(caller, old), 'STALE_REFERENCE');
        sameBytes(await store.read(caller, replaced.reference), canaries[1]);
        write(
          path.join(root, `persistence-vault-reference-${control.mode}-replace.json`),
          replaced.reference,
        );
        cases.referenceDenial = true;
      } else if (control.stage === 'denied') {
        const current = reference('replace');
        sameBytes(await store.read(caller, current), canaries[1]);
        denied(await store.read(caller, reference('create')), 'STALE_REFERENCE');
        const index = path.join(data, 'vault', 'index.json');
        const cipher = path.join(data, 'vault', `secret-${current.id}-r${current.revision}.bin`);
        const beforeIndex = read(index),
          beforeCipher = cipherHash(cipher);
        const observed = await observeIndexRename(promises, index, () =>
          store.replace(caller, current, Buffer.from(canaries[0])),
        );
        denied(observed.result, 'OWNER_REVOKED');
        if (
          !['EACCES', 'EPERM', 'EBUSY'].includes(observed.denialCode) ||
          read(index) !== beforeIndex ||
          cipherHash(cipher) !== beforeCipher
        )
          throw new Error('DENIED_WRITE');
        accessDeniedCode = observed.denialCode;
        await store.close();
        store = createNativeSecretStore(options);
        await store.verify();
        sameBytes(await store.read(store.grant(['READ']), current), canaries[1]);
        cases.referenceDenial = true;
      } else if (control.stage === 'delete') {
        const current = reference('replace');
        sameBytes(await store.read(caller, current), canaries[1]);
        success(await store.delete(caller, current), 'DELETE');
        denied(await store.read(caller, current), 'DELETED');
        denied(await store.read(caller, reference('create')), 'STALE_REFERENCE');
        cases.referenceDenial = true;
      } else {
        const current = reference('replace');
        denied(await store.read(caller, current), 'DELETED');
        denied(await store.read(caller, reference('create')), 'STALE_REFERENCE');
        const status = success(await store.status(current), 'STATUS');
        if (status.status !== 'DELETED') throw new Error('STATUS');
        const again = await store.delete(caller, current);
        success(again, 'DELETE');
        if (again.outcome !== 'UNCHANGED') throw new Error('DELETE');
        cases.referenceDenial = true;
      }
      cases.operationVerified = true;
      await store.close();
      persistence.close();
      if ((await logger.close()) !== 'FLUSHED') throw new Error('FLUSH');
      cases.auditFlushed = true;
      scan(logRoot, expected);
      await assertOwned();
      cases.closed = true;
      finished = true;
      app.quit();
    })
    .catch(async () => {
      clearTimeout(timer);
      try {
        await store?.close();
        persistence?.close();
        await logger?.close();
      } catch {}
      console.error('VAULT_FAILED');
      app.exit(1);
    });
} catch {
  clearTimeout(timer);
  console.error('VAULT_FAILED');
  app.exit(1);
}
