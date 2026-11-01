'use strict';
// Fixed private evidence only: no process, runtime invocation, or public log rows.
const path = require('node:path'),
  { createHash } = require('node:crypto');
const { entries } = require('./package-owned-files.cjs');
const HASHES = Object.freeze({
  'desktop/native/IsolatedAdbServer.cs':
    '4bf1cddd06ad6ead68f2f22cdb0c9b7c43cda96d41005f7546973c81b92029d7',
  'desktop/native/RetainedAdbSession.cs':
    'ee8081174a680e8ff43283ed8b43ffc789a47c46596bb2c13ae0ec7555274655',
  'desktop/native/RetainedAdbProtocol.cs':
    '187637ea62b9455ad1bb0fd6730c7a8ac7a0ed86b906277c1407fed17905a9dc',
  'desktop/native/RetainedHostAdmission.cs':
    '2e5602d3965b753ae536cf51a9467af77e59fc1b477ae06029dcfbd56e9c3110',
  'desktop/tests/fixtures/RetainedAdbProtocolFixture.cs':
    '5c16986dd90468dc5e3408465b18ca332d5f2a317a2c8abb0e574fcc8984f387',
  'desktop/verification/Invoke-RetainedManagedFixture.ps1':
    '7446fdb1c47aaa077b65dc30abca658762844ce19fa851a573476540653433d2',
  'desktop/scripts/retained-managed-fixture.mjs':
    '7cbbe255f265c9e906a7db95e1625075cb0fc5c8277b248172b695a708069bca',
  'tools/phase-00/HostProbeNative.cs':
    'b7fdc51aadaebd9733a4634c72c892cb5179a8a6e24e1020e57d0c0d8e8a5d89',
  'desktop/verification/WindowsBoundary.psm1':
    'd796fa5596b4d3c140bd1044033274481e4d90cf0d69226bdde09eae8a602aaf',
  'desktop/verification/OwnedFiles.psm1':
    '17884274d9647f22a431aca83fbd7bc7c624f7b5cf334a2aba7b7da44eea2a29',
});
const REPORT_SHA = '41e93f3cef944512e6d48d2ebebe526f7c56615c7d66a3aab1e542d177b82a0d';
const LABEL = 'REUSED_C955D1CA_NOT_RERUN';
const hash = (b) => createHash('sha256').update(b).digest('hex');
function fail() {
  throw Error('MAIN_VERSION_AUDIT');
}
function historical(desktop, binary) {
  const repo = path.dirname(desktop),
    sourceHashes = {};
  for (const [name, expected] of Object.entries(HASHES)) {
    const actual = hash(binary(path.join(repo, name), 1048576));
    if (actual !== expected) throw Error('MAIN_VERSION_HISTORY');
    sourceHashes[name] = actual;
  }
  return { version: 1, reportSha256: REPORT_SHA, sourceHashes };
}
function binding(value) {
  const keys = [
    'version',
    'operationId',
    'installationRevision',
    'expectedRevision',
    'pendingRevision',
    'verifiedRevision',
    'reads',
    'requestId',
  ];
  if (
    !value ||
    JSON.stringify(Object.keys(value)) !== JSON.stringify(keys) ||
    value.version !== 1 ||
    typeof value.operationId !== 'string' ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.operationId) ||
    ![
      'installationRevision',
      'expectedRevision',
      'pendingRevision',
      'verifiedRevision',
      'reads',
    ].every((k) => Number.isSafeInteger(value[k]) && value[k] >= 0 && !Object.is(value[k], -0)) ||
    value.installationRevision < 1 ||
    value.reads < 1 ||
    value.reads > 41 ||
    !(
      value.expectedRevision < value.pendingRevision &&
      value.pendingRevision < value.verifiedRevision
    ) ||
    typeof value.requestId !== 'string' ||
    !/^p[1-9][0-9]{0,15}$/.test(value.requestId) ||
    !Number.isSafeInteger(Number(value.requestId.slice(1))) ||
    String(Number(value.requestId.slice(1))) !== value.requestId.slice(1)
  )
    fail();
  return value;
}
async function audit(directory, privateBinding, binary, ownerToken) {
  const b = binding(privateBinding),
    { parseStoreDocument, verifySegment } = await import('../src/log-store-schema.ts');
  const { encodeLogRecord } = require('../build/log-contract.cjs');
  const list = entries(directory, 256),
    files = list.map((e) => e.name),
    witness = {};
  if (list.some((e) => !e.stat.isFile() || e.stat.nlink !== 1)) fail();
  const segments = files.filter((n) => /^segment-[0-9a-f-]{36}\.jsonl$/.test(n));
  // Each real audit flush finalizes a segment; all byte/record caps remain independent.
  if (segments.length < 1 || segments.length > 64) fail();
  const allowed = [
    'owner.json',
    'holds.json',
    'state.json',
    'release.json',
    ...segments,
    ...segments.map((n) => n.slice(0, -6) + '.meta.json'),
  ];
  if (files.length !== allowed.length || files.some((n) => !allowed.includes(n))) fail();
  function raw(name, limit) {
    const bytes = binary(path.join(directory, name), limit);
    witness[name] = { bytes: bytes.length, sha256: hash(bytes) };
    return new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  const owner = parseStoreDocument(raw('owner.json', 65536), 'owner');
  if (!owner) fail();
  for (const kind of ['holds', 'state', 'release']) {
    const d = parseStoreDocument(raw(kind + '.json', 65536), kind, owner.storeId);
    if (!d || (kind === 'release' && d.ownerToken !== ownerToken)) fail();
  }
  let total = 0;
  const records = [],
    runs = new Set(),
    sequences = new Set();
  for (const name of segments) {
    const text = raw(name, 1048576);
    total += Buffer.byteLength(text);
    if (total > 1048576) fail();
    const meta = parseStoreDocument(
      raw(name.slice(0, -6) + '.meta.json', 65536),
      'segment',
      owner.storeId,
    );
    if (!meta?.finalized || !verifySegment(text, meta)) fail();
    for (const line of text.slice(0, -1).split('\n')) {
      if (Buffer.byteLength(line) + 1 > 2048 || records.length >= 256) fail();
      const v = JSON.parse(line);
      if (encodeLogRecord(v) !== line + '\n' || sequences.has(v.sequence)) fail();
      runs.add(v.runId);
      sequences.add(v.sequence);
      records.push(v);
    }
  }
  if (runs.size !== 1) fail();
  records.sort((a, c) => a.sequence - c.sequence);
  const rows = records.filter((v) => v.schemaVersion === 7),
    effects = rows.filter((v) => v.operation !== 'READ'),
    reads = rows.filter((v) => v.operation === 'READ');
  if (
    effects.length !== 4 ||
    reads.length !== b.reads ||
    reads.some((v) => v.code !== 'OK' || v.outcome !== 'OBSERVED' || v.phase !== 'RESULT')
  )
    fail();
  const expected = [
    ['REQUEST', 'INTENT', 'INTENT', null],
    ['REQUEST', 'RESULT', 'PENDING', b.pendingRevision],
    ['VERIFY', 'INTENT', 'INTENT', null],
    ['VERIFY', 'RESULT', 'VERIFIED', b.verifiedRevision],
  ];
  for (let i = 0; i < 4; i++) {
    const v = effects[i],
      [operation, phase, outcome, resultingRevision] = expected[i];
    if (
      v.operation !== operation ||
      v.phase !== phase ||
      v.outcome !== outcome ||
      v.code !== 'OK' ||
      v.operationId !== b.operationId ||
      v.installationRevision !== b.installationRevision ||
      v.expectedRevision !== b.expectedRevision ||
      v.resultingRevision !== resultingRevision
    )
      fail();
  }
  if (
    new Set(effects.map((v) => v.diagnosticId)).size !== 1 ||
    reads.some(
      (v) =>
        !Number.isSafeInteger(v.resultingRevision) ||
        v.resultingRevision < b.expectedRevision ||
        v.resultingRevision > b.verifiedRevision ||
        v.installationRevision !== b.installationRevision ||
        v.operationId !== null ||
        v.expectedRevision !== null,
    ) ||
    reads[0]?.resultingRevision !== b.expectedRevision ||
    reads[0]?.sequence >= effects[0].sequence ||
    reads.at(-1)?.resultingRevision !== b.verifiedRevision ||
    reads.at(-1)?.sequence <= effects[3].sequence
  )
    fail();
  const after = entries(directory, 256)
    .map((e) => e.name)
    .sort();
  if (JSON.stringify(after) !== JSON.stringify(files.sort())) fail();
  for (const [name, proof] of Object.entries(witness)) {
    const bytes = binary(path.join(directory, name), name.endsWith('.jsonl') ? 1048576 : 65536);
    if (bytes.length !== proof.bytes || hash(bytes) !== proof.sha256) fail();
  }
  return { schema7Intents: true, schema7Result: true };
}
module.exports = { HASHES, REPORT_SHA, LABEL, historical, binding, audit };
