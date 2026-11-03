'use strict';
// Verification-owned partitions only. No product launcher cleanup or generic unlock.
const fs = require('node:fs'),
  path = require('node:path');
const { plain, read, uuid, STAGES } = require('./package-contract.cjs');
const admission = require('../launch/package-admission.cjs');
function entries(directory, limit = 256) {
  plain(directory);
  const out = [],
    handle = fs.opendirSync(directory);
  try {
    for (;;) {
      const item = handle.readSync();
      if (item === null) break;
      if (out.length >= limit) throw Error('PACKAGE_COUNT');
      const file = path.join(directory, item.name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
        throw Error('PACKAGE_TYPE');
      out.push({ file, name: item.name, stat });
    }
  } finally {
    handle.closeSync();
  }
  return out;
}
function tree(directory, limit) {
  const out = [];
  let bytes = 0;
  function walk(dir, depth) {
    if (depth > 16) throw Error('PACKAGE_DEPTH');
    for (const item of entries(dir)) {
      if (out.length >= 256) throw Error('PACKAGE_COUNT');
      out.push(item);
      if (item.stat.isDirectory()) walk(item.file, depth + 1);
      else {
        bytes += item.stat.size;
        if (bytes > limit) throw Error('PACKAGE_BYTES');
      }
    }
  }
  walk(directory, 0);
  return { directory, entries: out };
}
function copyPackage(source, target) {
  const manifest = admission.verifyPackage(source),
    before = admission.inventory(source);
  fs.mkdirSync(target);
  plain(target);
  for (const name of before.directories
    .slice()
    .sort((a, b) => a.split('/').length - b.split('/').length))
    fs.mkdirSync(path.join(target, name));
  for (const file of before.files) {
    fs.copyFileSync(
      path.join(source, file.path),
      path.join(target, file.path),
      fs.constants.COPYFILE_EXCL,
    );
    const actual = admission.digest(path.join(target, file.path));
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw Error('PACKAGE_COPY');
  }
  const copied = admission.verifyPackage(target);
  if (
    JSON.stringify(copied) !== JSON.stringify(manifest) ||
    JSON.stringify(admission.inventory(source)) !== JSON.stringify(before)
  )
    throw Error('PACKAGE_CHANGED');
  return manifest;
}
function cleanup(root) {
  plain(root);
  const token = read(path.join(root, '.owner'));
  if (!uuid(token)) throw Error('PACKAGE_OWNER');
  const plans = [],
    files = [];
  const addTree = (directory, limit) => plans.push(tree(directory, limit));
  function launch(directory) {
    const id = path.basename(directory).slice(7);
    if (!uuid(id) || !uuid(read(path.join(directory, '.owner')))) throw Error('PACKAGE_LAUNCH');
    const fixed = [];
    for (const item of entries(directory)) {
      if (item.stat.isDirectory()) {
        if (
          !['provision', 'auth', 'main'].some(
            (stage) => item.name === `fonesi-auto-foundation-${id}-${stage}`,
          ) ||
          read(path.join(item.file, '.owner')) !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
        )
          throw Error('PACKAGE_PROFILE');
        addTree(item.file, 8388608);
      } else {
        if (
          ![
            '.owner',
            'launch-journal.json',
            'lease-acquired.json',
            'lease-recovery.json',
            'state.json',
            'runtime-attestation.json',
            'log-launch-proof.json',
            'log-recovery-owner.json',
            'main-capture.json',
          ].includes(item.name) &&
          !/^(intent|settled|capture)-(?:0[1-9]|1[0-6])\.json$/.test(item.name) &&
          !/^(provision|auth)-(control|result|observed|capture)\.json$/.test(item.name)
        )
          throw Error('PACKAGE_LAUNCH_ENTRY');
        if (item.stat.size > 65536) throw Error('PACKAGE_CONTROL_LIMIT');
        fixed.push(item);
      }
    }
    if (fixed.reduce((n, item) => n + item.stat.size, 0) > 1048576)
      throw Error('PACKAGE_CONTROL_LIMIT');
    plans.push({ directory, entries: fixed });
  }
  function store(directory, restored) {
    const token = read(path.join(directory, '.owner'));
    if (!uuid(token)) throw Error('PACKAGE_STORE_OWNER');
    let dataCount = 0;
    const fixed = [];
    for (const item of entries(directory)) {
      if (item.stat.isDirectory()) {
        if (item.name === 'data-main' || /^data-[0-9a-f-]{36}$/.test(item.name)) {
          dataCount++;
          const raw = read(path.join(item.file, '.persistence-owner.json')),
            v = JSON.parse(raw);
          if (
            JSON.stringify(v) !== raw ||
            JSON.stringify(Object.keys(v)) !==
              JSON.stringify(['version', 'storeId', 'kind', 'restoreReceiptId']) ||
            v.version !== 1 ||
            !uuid(v.storeId) ||
            v.kind !== (restored ? 'RESTORED' : 'FRESH') ||
            (restored ? !uuid(v.restoreReceiptId) : v.restoreReceiptId !== null) ||
            item.name !== (restored ? 'data-' + v.storeId : 'data-main')
          )
            throw Error('PACKAGE_STORE_OWNER');
          const receipt = path.join(item.file, '.restore-receipt.json');
          if (restored) {
            if (
              read(receipt) !==
              JSON.stringify({
                version: 1,
                storeId: v.storeId,
                restoreReceiptId: v.restoreReceiptId,
                quarantined: true,
              })
            )
              throw Error('PACKAGE_RESTORE_RECEIPT');
          } else {
            try {
              fs.lstatSync(receipt);
              throw Error('PACKAGE_RESTORE_RECEIPT');
            } catch (error) {
              if (error.code !== 'ENOENT') throw error;
            }
          }
          addTree(item.file, 134217728);
        } else if (item.name === 'logs-main') {
          const raw = read(path.join(item.file, 'owner.json'));
          if (
            !/^\{"schemaVersion":1,"storeId":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\}\n$/.test(
              raw,
            )
          )
            throw Error('PACKAGE_LOG_OWNER');
          if (raw !== JSON.stringify(JSON.parse(raw)) + '\n') throw Error('PACKAGE_LOG_OWNER');
          addTree(item.file, 8388608);
        } else if (/^launch-[0-9a-f-]{36}$/.test(item.name)) launch(item.file);
        else throw Error('PACKAGE_STORE_ENTRY');
      } else {
        if (
          ![
            '.owner',
            '.launcher-guard',
            '.launcher-current.json',
            'provision-cancelled.json',
          ].includes(item.name) ||
          item.stat.size > 65536
        )
          throw Error('PACKAGE_STORE_ENTRY');
        fixed.push(item);
      }
    }
    if (dataCount !== 1) throw Error('PACKAGE_STORE_COUNT');
    plans.push({ directory, entries: fixed });
  }
  for (const item of entries(root)) {
    if (item.stat.isDirectory()) {
      if (['relocated-package', 'package-negative'].includes(item.name)) {
        admission.verifyPackage(item.file);
        const inv = admission.inventory(item.file);
        plans.push({
          directory: item.file,
          entries: [
            ...inv.files.map((file) => ({
              file: path.join(item.file, file.path),
              stat: { isDirectory: () => false },
            })),
            ...inv.directories.map((name) => ({
              file: path.join(item.file, name),
              stat: { isDirectory: () => true },
            })),
          ],
        });
      } else if (
        item.name === 'products' ||
        item.name === 'restore-first' ||
        item.name === 'restore-second'
      ) {
        const children = entries(item.file, 2);
        if (children.length > (item.name === 'products' ? 2 : 1))
          throw Error('PACKAGE_STORE_COUNT');
        for (const child of children) {
          if (
            !child.stat.isDirectory() ||
            !(
              item.name === 'products'
                ? /^Fonesi-Auto-[0-9a-f-]{36}$/
                : /^fonesi-restore-[0-9a-f-]{36}$/
            ).test(child.name)
          )
            throw Error('PACKAGE_STORE_NAME');
          store(child.file, item.name !== 'products');
        }
        plans.push({ directory: item.file, entries: [] });
      } else if (item.name === 'backups') {
        for (const child of entries(item.file, 2)) {
          if (!child.stat.isDirectory() || !/^backup-[0-9a-f-]{36}$/.test(child.name))
            throw Error('PACKAGE_BACKUP');
          const raw = read(path.join(child.file, '.backup-owner.json')),
            v = JSON.parse(raw);
          if (
            JSON.stringify(v) !== raw ||
            JSON.stringify(Object.keys(v)) !==
              JSON.stringify(['version', 'storeId', 'locationId', 'folderMarkerId']) ||
            v.version !== 1 ||
            !uuid(v.storeId) ||
            !uuid(v.locationId) ||
            !uuid(v.folderMarkerId) ||
            child.name !== 'backup-' + v.folderMarkerId
          )
            throw Error('PACKAGE_BACKUP');
        }
        addTree(item.file, 134217728);
      } else if (STAGES.some((stage) => item.name === 'package-probe-' + stage)) {
        const stage = item.name.slice(14),
          control = JSON.parse(read(path.join(item.file, 'control.json')));
        if (control.runRoot !== root || control.runToken !== token || control.stage !== stage)
          throw Error('PACKAGE_PROBE_OWNER');
        addTree(item.file, 1048576);
      } else throw Error('PACKAGE_ROOT_ENTRY');
    } else {
      if (item.stat.size > 65536) throw Error('PACKAGE_ROOT_LIMIT');
      files.push(item);
    }
  }
  const allowed = new Set([
    '.owner',
    'package-info.json',
    'package-negatives.json',
    'package-negatives-capture.json',
    'package-negatives-public.json',
  ]);
  for (const stage of STAGES)
    for (const prefix of ['before', 'stage', 'state', 'result', 'capture', 'public'])
      allowed.add(`package-${prefix}-${stage}.json`);
  for (const item of files) if (!allowed.has(item.name)) throw Error('PACKAGE_ROOT_ENTRY');
  if (files.reduce((n, item) => n + item.stat.size, 0) > 1048576) throw Error('PACKAGE_ROOT_LIMIT');
  if (read(path.join(root, '.owner')) !== token) throw Error('PACKAGE_OWNER_CHANGED');
  // Every partition and identity above is validated before the first removal.
  for (const plan of plans) {
    for (const item of plan.entries) if (!item.stat.isDirectory()) fs.unlinkSync(item.file);
    for (const item of plan.entries
      .filter((item) => item.stat.isDirectory())
      .sort((a, b) => b.file.length - a.file.length))
      fs.rmdirSync(item.file);
    fs.rmdirSync(plan.directory);
  }
  for (const item of files) if (item.name !== '.owner') fs.unlinkSync(item.file);
  fs.unlinkSync(path.join(root, '.owner'));
  fs.rmdirSync(root);
}
module.exports = { entries, tree, copyPackage, cleanup };
