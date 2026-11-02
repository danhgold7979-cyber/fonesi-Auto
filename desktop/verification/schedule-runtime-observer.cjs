'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonical, record, capture } = require('./schedule-runtime-contract.cjs');
const reject = () => {
  throw new Error('SCHEDULE_RUNTIME_REJECTED');
};
const plain = (p, directory) => {
  const s = fs.lstatSync(p);
  if (
    s.isSymbolicLink() ||
    (directory ? !s.isDirectory() : !s.isFile()) ||
    fs.realpathSync.native(p) !== path.resolve(p)
  )
    reject();
  return s;
};
const timer = setTimeout(() => app.exit(1), 5000);
try {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    process.argv.length !== 1 ||
    process.argv[0] !== process.execPath
  )
    reject();
  const packageRoot = path.dirname(process.execPath),
    run = path.dirname(packageRoot);
  if (path.basename(packageRoot) !== 'package' || !/^run-[0-9a-f-]{36}$/.test(path.basename(run)))
    reject();
  plain(run, true);
  plain(packageRoot, true);
  if (path.resolve(__dirname) !== path.join(packageRoot, 'resources', 'app')) reject();
  const file = path.join(__dirname, 'control.json');
  if (plain(file, false).size > 16384) reject();
  const c = canonical(fs.readFileSync(file, 'utf8'), 16384);
  record(c, ['version', 'token', 'head', 'tree', 'observerSha256', 'contractSha256']);
  if (
    c.version !== 1 ||
    !/^[0-9a-f-]{36}$/.test(c.token) ||
    !/^[0-9a-f]{40}$/.test(c.head) ||
    !/^[0-9a-f]{40}$/.test(c.tree)
  )
    reject();
  const marker = path.join(run, '.owner');
  if (plain(marker, false).size !== 36 || fs.readFileSync(marker, 'utf8') !== c.token) reject();
  for (const [name, expected] of [
    ['schedule-runtime-observer.cjs', c.observerSha256],
    ['schedule-runtime-contract.cjs', c.contractSha256],
  ]) {
    const f = path.join(__dirname, name);
    if (
      plain(f, false).size > 16384 ||
      !/^[0-9a-f]{64}$/.test(expected) ||
      crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') !== expected
    )
      reject();
  }
  const profile = path.join(run, 'fonesi-auto-foundation-source');
  plain(profile, true);
  const profileMarker = path.join(profile, '.owner');
  if (
    plain(profileMarker, false).size !== 34 ||
    fs.readFileSync(profileMarker, 'utf8') !== 'FONESI_AUTO_FOUNDATION_PROFILE_V1\n'
  )
    reject();
  for (const key of ['userData', 'sessionData', 'logs', 'crashDumps']) {
    const target = path.join(profile, key);
    fs.mkdirSync(target);
    plain(target, true);
    app.setPath(key, target);
  }
  const result = capture(
    process.versions,
    process.env,
    process.execArgv,
    process.platform,
    process.arch,
  );
  const raw = JSON.stringify(result);
  if (Buffer.byteLength(raw) > 16384) reject();
  clearTimeout(timer);
  fs.writeSync(1, raw + '\n');
  app.exit(0);
} catch {
  clearTimeout(timer);
  fs.writeSync(2, 'SCHEDULE_RUNTIME_OBSERVATION_FAILED\n');
  app.exit(1);
}
