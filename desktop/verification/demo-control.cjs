'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { plain, read, write, exact } = require('./demo-contract.cjs');
const desktop = path.resolve(__dirname, '..');
const INJECTION = '\nrequire("../verification/demo-probe.cjs");\n';
const PREFIX = '"use strict";';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function instrument(original) {
  if (!Buffer.isBuffer(original) || original.length > 8388608) throw Error('DEMO_SOURCE');
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(original);
  if (!raw.startsWith(PREFIX) || raw.split(PREFIX).length !== 2 || raw.includes(INJECTION))
    throw Error('DEMO_INJECTION');
  return Buffer.from(PREFIX + INJECTION + raw.slice(PREFIX.length));
}
function admit(root) {
  plain(root);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      read(path.join(root, '.owner')),
    )
  )
    throw Error('DEMO_OWNER');
}
function fileBytes(file, limit = 8388608) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw Error('DEMO_FILE');
  return fs.readFileSync(file);
}
function copyFile(from, to) {
  const before = fileBytes(from);
  fs.writeFileSync(to, before, { flag: 'wx', mode: 0o600 });
  if (!fileBytes(to).equals(before)) throw Error('DEMO_COPY');
}
async function prepare(root, mode) {
  admit(root);
  if (!['source', 'package'].includes(mode)) throw Error('DEMO_MODE');
  const tooling = await import(
    pathToFileURL(path.join(desktop, 'scripts/demo-build-manifest.mjs')).href
  );
  const production = await import(
    pathToFileURL(path.join(desktop, 'scripts/build-manifest.mjs')).href
  );
  if (!tooling.verifyDemoBuild(desktop) || !production.verifyBuild(desktop))
    throw Error('DEMO_BUILD');
  tooling.scanProductionSource(desktop);
  tooling.scanProductionPayload(path.join(desktop, 'build'));
  const owner = path.join(root, `demo-${mode}`);
  fs.mkdirSync(owner, { mode: 0o700 });
  plain(owner);
  const session = path.join(owner, 'session');
  fs.mkdirSync(session, { mode: 0o700 });
  const token = randomUUID();
  write(path.join(session, '.demo-owner.json'), {
    version: 1,
    kind: 'FONESI_DEMO',
    ownerToken: token,
  });
  fs.mkdirSync(path.join(session, 'profile'), { mode: 0o700 });
  const output = path.join(owner, 'demo-build');
  fs.mkdirSync(output, { mode: 0o700 });
  const manifest = exact(read(path.join(desktop, 'demo-build/.verified-demo-build.json')), [
    'version',
    'mode',
    'inputs',
    'outputs',
  ]);
  for (const name of tooling.outputs)
    copyFile(path.join(desktop, 'demo-build', name), path.join(output, name));
  const original = fileBytes(path.join(output, 'main.cjs'));
  if (hash(original) !== manifest.outputs['main.cjs']) throw Error('DEMO_MAIN');
  const derived = instrument(original);
  fs.unlinkSync(path.join(output, 'main.cjs'));
  fs.writeFileSync(path.join(output, 'main.cjs'), derived, { flag: 'wx', mode: 0o600 });
  const derivedManifest = {
    ...manifest,
    outputs: { ...manifest.outputs, 'main.cjs': hash(derived) },
  };
  write(path.join(output, '.verified-demo-build.json'), derivedManifest);
  const verification = path.join(owner, 'verification');
  fs.mkdirSync(verification, { mode: 0o700 });
  const files = [
    'demo-probe.cjs',
    'demo-contract.cjs',
    'ui-contract.cjs',
    'settings-contract.cjs',
    'persistence-restore-contract.cjs',
  ];
  for (const name of files) copyFile(path.join(__dirname, name), path.join(verification, name));
  write(path.join(owner, '.verification-provenance.json'), {
    version: 1,
    mode,
    originalMainSha256: hash(original),
    derivedMainSha256: hash(derived),
    injectionSha256: hash(Buffer.from(INJECTION)),
    originalOutputs: manifest.outputs,
    observerSha256: hash(fileBytes(path.join(verification, 'demo-probe.cjs'))),
  });
  return owner;
}
async function prepareNegative(root, kind) {
  admit(root);
  if (!['marker', 'manifest'].includes(kind)) throw Error('DEMO_NEGATIVE');
  const tooling = await import(
    pathToFileURL(path.join(desktop, 'scripts/demo-build-manifest.mjs')).href
  );
  if (!tooling.verifyDemoBuild(desktop)) throw Error('DEMO_BUILD');
  const outer = path.join(root, `demo-negative-${kind}`);
  fs.mkdirSync(outer, { mode: 0o700 });
  const session = path.join(outer, 'session');
  fs.mkdirSync(session, { mode: 0o700 });
  fs.mkdirSync(path.join(session, 'profile'), { mode: 0o700 });
  write(path.join(session, '.demo-owner.json'), {
    version: 1,
    kind: kind === 'marker' ? 'NOT_FONESI_DEMO' : 'FONESI_DEMO',
    ownerToken: randomUUID(),
  });
  const output = path.join(outer, 'demo-build');
  fs.mkdirSync(output, { mode: 0o700 });
  for (const name of [...tooling.outputs, '.verified-demo-build.json'])
    copyFile(path.join(desktop, 'demo-build', name), path.join(output, name));
  if (kind === 'manifest') {
    const file = path.join(output, '.verified-demo-build.json');
    const original = read(file);
    const value = exact(original, ['version', 'mode', 'inputs', 'outputs']);
    fs.unlinkSync(file);
    write(file, { ...value, mode: 'NOT_DEMO' });
  }
  return outer;
}
function snapshot(directory, limit = 134217728) {
  plain(directory);
  let count = 0,
    total = 0;
  const rows = Object.create(null);
  function visit(current, relative, depth) {
    if (depth > 16) throw Error('DEMO_DEPTH');
    const handle = fs.opendirSync(current);
    try {
      let entry = handle.readSync();
      while (entry !== null) {
        if (++count > 256) throw Error('DEMO_COUNT');
        const file = path.join(current, entry.name),
          name = relative ? `${relative}/${entry.name}` : entry.name,
          stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw Error('DEMO_LINK');
        if (stat.isDirectory()) {
          plain(file);
          rows[name] = 'DIRECTORY';
          visit(file, name, depth + 1);
        } else if (stat.isFile()) {
          total += stat.size;
          if (total > limit) throw Error('DEMO_BYTES');
          const bytes = fileBytes(file, 134217728);
          if (bytes.includes(Buffer.from('FONESI_DEMO_FIXTURE_BUNDLE_20261031_V1')))
            throw Error('DEMO_PRODUCTION_LEAK');
          rows[name] = hash(bytes);
        } else throw Error('DEMO_TYPE');
        entry = handle.readSync();
      }
    } finally {
      handle.closeSync();
    }
  }
  visit(directory, '', 0);
  return Object.fromEntries(
    Object.keys(rows)
      .sort()
      .map((name) => [name, rows[name]]),
  );
}
function witness(root, compare) {
  admit(root);
  const file = path.join(root, 'demo-production-witness.json');
  const current = {
    version: 1,
    data: snapshot(path.join(root, 'data-source')),
    backups: snapshot(path.join(root, 'backup-parent-source')),
    logs: snapshot(path.join(root, 'logs-source-settings-ui'), 8388608),
  };
  if (compare) {
    if (read(file) !== JSON.stringify(current)) throw Error('DEMO_PRODUCTION_CHANGED');
  } else write(file, current);
}
async function main() {
  try {
    const [action, root, mode] = process.argv.slice(2);
    if (process.versions.node !== '24.22.1') throw Error('DEMO_NODE');
    if (action === 'prepare' && process.argv.length === 5) {
      await prepare(root, mode);
      fs.writeSync(1, 'DEMO_CONTROL_PREPARED\n');
    } else if (action === 'negative' && process.argv.length === 5) {
      await prepareNegative(root, mode);
      fs.writeSync(1, 'DEMO_NEGATIVE_PREPARED\n');
    } else if (action === 'scan-copy' && process.argv.length === 4) {
      admit(root);
      const tooling = await import(
        pathToFileURL(path.join(desktop, 'scripts/demo-build-manifest.mjs')).href
      );
      if (!tooling.verifyDemoBuild(desktop)) throw Error('DEMO_BUILD');
      tooling.scanProductionPayload(path.join(root, 'production-payload'));
      fs.writeSync(1, 'DEMO_PRODUCTION_COPY_CLEAN\n');
    } else if (action === 'witness' && process.argv.length === 4) {
      witness(root, false);
      fs.writeSync(1, 'DEMO_PRODUCTION_WITNESSED\n');
    } else if (action === 'compare' && process.argv.length === 4) {
      witness(root, true);
      fs.writeSync(1, 'DEMO_PRODUCTION_UNCHANGED\n');
    } else throw Error('DEMO_ARGUMENTS');
  } catch {
    fs.writeSync(1, 'DEMO_CONTROL_FAILED\n');
    process.exitCode = 1;
  }
}
module.exports = { INJECTION, instrument, snapshot, prepare, prepareNegative, witness };
if (require.main === module) void main();
