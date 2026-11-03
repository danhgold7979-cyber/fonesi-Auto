'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'recipient-setup-main-probe.cjs'), 'utf8');
test('actual observer dependency failure emits only fixed PREPARE marker and exits', () => {
  const output = [],
    exits = [];
  vm.runInNewContext(source, {
    require(name) {
      if (name === 'electron') return { app: { exit: (n) => exits.push(n) } };
      if (name === 'node:fs') return { writeSync: (_fd, text) => output.push(text) };
      throw Error('/private/no leak');
    },
  });
  assert.deepEqual(output, ['RECIPIENT_SETUP_PHASE_PREPARE\nRECIPIENT_SETUP_FAILED\n']);
  assert.deepEqual(exits, [1]);
});
test('observer preserves full handler receiver/arguments and injects only native answer boundary', () => {
  assert.match(source, /callback\.apply\(this, args\)/);
  assert.match(source, /handle\.call\(this, channel, async function \(\.\.\.args\)/);
  for (const forbidden of [
    'createPlatformToolsProvisioner',
    'createPlatformToolsSetupService',
    'recipient.read',
    'readOfficialArchive',
    'child_process',
    'spawnSync',
    'execFile',
  ])
    assert.equal(source.includes(forbidden), false);
  assert.match(source, /dialog\.showMessageBox = async/);
  assert.match(source, /dialog\.showOpenDialog = async/);
  assert.match(source, /url !== 'https:\/\/developer.android.com\/studio\/terms'/);
});
test('FIRST authenticates original schema4 and REOPEN calls separate actual second-startup helper', () => {
  assert.match(source, /await observeSchema4\(launch, safeStorage\)/);
  assert.match(source, /await observeReopenStartup\(launch\)/);
  assert.match(source, /first-release\.json/);
  assert.match(source, /installationRevision === 2/);
  assert.match(source, /nativeCalls === 0 && termsCalls === 0/);
  assert.match(source, /BOOTSTRAP_READY/);
  assert.match(source, /BOOTSTRAP_CLOSED/);
  assert.match(source, /setup-first-result\.json/);
  assert.match(source, /setup-reopen-result\.json/);
});
test('real visible setup/read controls, bounded native pending and canonical hash/physical checks remain mandatory', () => {
  for (const selector of ['#platform-tools-setup', '#platform-tools-read', '#help-top'])
    assert.ok(source.includes(selector));
  assert.match(source, /duplicate\.code === 'BUSY'/);
  assert.match(source, /holdRelease\(\)/);
  assert.match(source, /wrong-hash\.zip/);
  assert.match(source, /official\.zip/);
  assert.match(source, /settled\('FAILED', 'ARCHIVE_REJECTED', 1\)/);
  assert.match(source, /settled\('VERIFIED_LOCAL', null, 2\)/);
  assert.match(source, /names\.length >= 14/);
  assert.match(source, /stat\.nlink !== 1/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /r\.bottom\s*<=\s*innerHeight/);
  assert.match(source, /securePreferences\(window\.webContents\.session\)/);
});
test('actual extracted response guard rejects unknown fields and malformed installation revision', () => {
  const start = source.indexOf('  function parse(raw) {'),
    end = source.indexOf('  function next(kind)', start);
  assert.ok(start >= 0 && end > start);
  const parse = vm.runInNewContext(`(${source.slice(start, end).trim()})`);
  const base = {
    version: 1,
    requestId: 'p1',
    ok: true,
    outcome: 'OBSERVED',
    snapshot: {
      revision: 0,
      installationRevision: 0,
      state: 'UNAVAILABLE',
      operationId: null,
      code: null,
      candidateVersion: '37.0.1',
    },
    diagnosticId: null,
    loggingHealth: 'DEGRADED',
  };
  assert.equal(parse(JSON.stringify(base)).ok, true);
  assert.throws(() => parse(JSON.stringify({ ...base, path: '/private' })));
  assert.throws(() =>
    parse(JSON.stringify({ ...base, snapshot: { ...base.snapshot, installationRevision: -1 } })),
  );
});
test('actual visibleRead helper cannot accept preexisting OBSERVED text before fresh response and enabled UI', async () => {
  const start = source.indexOf('  async function visibleRead() {'),
    end = source.indexOf('  function absent()', start);
  assert.ok(start >= 0 && end > start);
  const responses = [];
  let stage = 0,
    enabled = false;
  const helper = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    responses,
    click: async (selector) => assert.equal(selector, '#platform-tools-read'),
    execute: async (code) => {
      if (stage === 0) return true;
      assert.match(code, /platform-tools-read.*disabled/);
      return enabled;
    },
    poll: async (predicate) => {
      if (stage++ === 0) return;
      assert.equal(await predicate(), false);
      responses.push({ request: { method: 'platformTools.get' } });
      assert.equal(await predicate(), false);
      enabled = true;
      assert.equal(await predicate(), true);
    },
  });
  await helper();
  assert.equal(stage, 2);
});
test('held native answer requires actual rendered PENDING acknowledgment, not only handler completion', () => {
  const start = source.indexOf("phase = 'PENDING'"),
    end = source.indexOf('cases.pendingAcknowledged = true', start),
    block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /holdRelease !== null/);
  assert.match(block, /x\.response\.outcome === 'PENDING'/);
  assert.match(block, /PENDING \/ AWAITING_RECIPIENT \/ /);
  assert.match(block, /platform-tools-read.*disabled/);
  assert.match(source, /value\.snapshot\.revision > afterRevision/);
});
