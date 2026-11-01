'use strict';
// Read-only finalized history; sequence identity is (runId,sequence), never sequence alone.
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { entries } = require('./package-owned-files.cjs');
const { validateBinding, EXPECTED, fail } = require('./retained-rollback-contract.cjs');
const hash = (b) => createHash('sha256').update(b).digest('hex');
function correlate(rows, b) {
  const setups = rows.filter((v) => v.schemaVersion === 8),
    versions = rows.filter((v) => v.schemaVersion === 7);
  function group(all, op, isSetup) {
    const reads = all.filter((v) => v.operation === 'READ'),
      effects = all.filter((v) => v.operation !== 'READ');
    if (
      reads.length !== (isSetup ? (op ? 3 : 2) : 2) ||
      reads.some(
        (v) =>
          v.phase !== 'RESULT' ||
          v.outcome !== 'OBSERVED' ||
          v.code !== 'OK' ||
          v.operationId !== null ||
          v.expectedRevision !== null,
      )
    )
      fail('AUDIT');
    if (!op) {
      if (effects.length) fail('AUDIT');
      return;
    }
    const expected = [
      ['REQUEST', 'INTENT', 'INTENT', null],
      ['REQUEST', 'RESULT', 'PENDING', op.pendingRevision],
      [isSetup ? 'PROVISION' : 'VERIFY', 'INTENT', 'INTENT', null],
      [
        isSetup ? 'PROVISION' : 'VERIFY',
        'RESULT',
        isSetup ? 'VERIFIED_LOCAL' : 'VERIFIED',
        op.verifiedRevision,
      ],
    ];
    if (effects.length !== 4 || new Set(effects.map((v) => v.diagnosticId)).size !== 1)
      fail('AUDIT');
    effects.forEach((v, i) => {
      const [operation, phase, outcome, revision] = expected[i];
      if (
        v.operation !== operation ||
        v.phase !== phase ||
        v.outcome !== outcome ||
        v.resultingRevision !== revision ||
        v.code !== 'OK' ||
        v.operationId !== op.operationId ||
        v.expectedRevision !== op.expectedRevision ||
        (isSetup
          ? v.action !== (i < 2 ? null : op.action)
          : v.installationRevision !== op.installationRevision)
      )
        fail('AUDIT');
    });
    if (
      reads.slice(0, -1).some((v) => v.sequence >= effects[0].sequence) ||
      reads.at(-1).sequence <= effects[3].sequence ||
      reads.at(-2).resultingRevision !== op.expectedRevision ||
      reads.at(-1).resultingRevision !== op.verifiedRevision ||
      reads.some(
        (v) =>
          !Number.isSafeInteger(v.resultingRevision) || v.resultingRevision > op.verifiedRevision,
      )
    )
      fail('AUDIT');
    if (!isSetup && reads.some((v) => v.installationRevision !== op.installationRevision))
      fail('AUDIT');
  }
  group(setups, b.setup, true);
  group(versions, b.runtime, false);
  if (
    b.setup &&
    Math.max(...setups.map((v) => v.sequence)) >= Math.min(...versions.map((v) => v.sequence))
  )
    fail('AUDIT');
}
async function audit(directory, binding, binary, ownerToken, previous, packaged) {
  const b = validateBinding(binding),
    { parseStoreDocument, verifySegment, segmentFilename, metadataFilename } = await import(
      '../src/log-store-schema.ts'
    );
  const { encodeLogRecord } = packaged
    ? require('./main-runtime-version-package.cjs').loadBuild(packaged, 'log-contract.cjs')
    : require('../build/log-contract.cjs');
  const listing = entries(directory, 516),
    names = listing.map((e) => e.name).sort();
  if (listing.some((e) => !e.stat.isFile() || e.stat.nlink !== 1)) fail('AUDIT');
  const segments = names.filter((n) => n.endsWith('.jsonl'));
  if (segments.length < 1 || segments.length > 256) fail('LIMIT');
  const allowed = [
    'owner.json',
    'holds.json',
    'state.json',
    'release.json',
    ...segments,
    ...segments.map((n) => n.slice(0, -6) + '.meta.json'),
  ].sort();
  if (JSON.stringify(names) !== JSON.stringify(allowed)) fail('INVENTORY');
  const witness = {},
    history = {};
  function raw(name, limit) {
    const file = path.join(directory, name),
      before = fs.lstatSync(file),
      bytes = binary(file, limit),
      after = fs.lstatSync(file);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs ||
      after.nlink !== 1
    )
      fail('HISTORY');
    witness[name] = {
      bytes: bytes.length,
      sha256: hash(bytes),
      dev: after.dev,
      ino: after.ino,
      mtimeMs: after.mtimeMs,
    };
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  const owner = parseStoreDocument(raw('owner.json', 65536), 'owner');
  if (!owner) fail('AUDIT');
  for (const kind of ['holds', 'state', 'release']) {
    const d = parseStoreDocument(raw(kind + '.json', 65536), kind, owner.storeId);
    if (!d || (kind === 'release' && d.ownerToken !== ownerToken)) fail('AUDIT');
  }
  const oldRuns = previous?.runIds ?? [];
  if (
    !Array.isArray(oldRuns) ||
    oldRuns.length !== EXPECTED[b.stage].epoch - 1 ||
    new Set(oldRuns).size !== oldRuns.length
  )
    fail('HISTORY');
  const records = [],
    pairs = new Set();
  let bytes = 0;
  for (const name of segments) {
    const text = raw(name, 1048576);
    bytes += Buffer.byteLength(text);
    if (bytes > 1048576) fail('LIMIT');
    const metaName = name.slice(0, -6) + '.meta.json',
      meta = parseStoreDocument(raw(metaName, 65536), 'segment', owner.storeId);
    if (
      !meta?.finalized ||
      name !== segmentFilename(meta.segmentId) ||
      metaName !== metadataFilename(meta.segmentId) ||
      !verifySegment(text, meta)
    )
      fail('AUDIT');
    history[name] = witness[name];
    history[metaName] = witness[metaName];
    for (const line of text.slice(0, -1).split('\n')) {
      if (Buffer.byteLength(line) + 1 > 2048 || records.length >= 512) fail('LIMIT');
      const v = JSON.parse(line),
        key = v.runId + ':' + v.sequence;
      if (encodeLogRecord(v) !== line + '\n' || pairs.has(key)) fail('AUDIT');
      if (!Object.hasOwn(previous?.history ?? {}, name) && oldRuns.includes(v.runId))
        fail('HISTORY');
      pairs.add(key);
      records.push(v);
    }
  }
  for (const [name, proof] of Object.entries(previous?.history ?? {}))
    if (JSON.stringify(history[name]) !== JSON.stringify(proof)) fail('HISTORY');
  const runIds = [...new Set(records.map((v) => v.runId))],
    added = runIds.filter((id) => !oldRuns.includes(id));
  if (
    added.length !== 1 ||
    runIds.length !== EXPECTED[b.stage].epoch ||
    oldRuns.some((id) => !runIds.includes(id))
  )
    fail('HISTORY');
  const current = records
    .filter((v) => v.runId === added[0])
    .sort((a, c) => a.sequence - c.sequence);
  correlate(current, b);
  for (const [name, proof] of Object.entries(witness)) {
    const data = binary(path.join(directory, name), name.endsWith('.jsonl') ? 1048576 : 65536);
    const stat = fs.lstatSync(path.join(directory, name));
    if (
      data.length !== proof.bytes ||
      hash(data) !== proof.sha256 ||
      stat.dev !== proof.dev ||
      stat.ino !== proof.ino ||
      stat.mtimeMs !== proof.mtimeMs ||
      stat.nlink !== 1
    )
      fail('HISTORY');
  }
  if (
    JSON.stringify(
      entries(directory, 516)
        .map((e) => e.name)
        .sort(),
    ) !== JSON.stringify(names)
  )
    fail('HISTORY');
  return { runIds: [...oldRuns, added[0]], history };
}
module.exports = { audit, correlate };
