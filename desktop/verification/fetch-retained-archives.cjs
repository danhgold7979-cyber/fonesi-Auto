'use strict';
// Two fixed, pinned development inputs. No execution, recipient download route or redistribution.
const fs = require('node:fs'),
  path = require('node:path'),
  https = require('node:https');
const { createHash, randomUUID } = require('node:crypto');
const PINS = Object.freeze([
  Object.freeze({
    name: 'platform-tools_r36.0.0-win.zip',
    bytes: 7138784,
    sha256: '12c2841f354e92a0eb2fd7bf6f0f9bf8538abce7bd6b060ac8349d6f6a61107c',
  }),
  Object.freeze({
    name: 'platform-tools_r37.0.1-win.zip',
    bytes: 8044989,
    sha256: '45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99',
  }),
]);
function fail() {
  return Error('RETAINED_ARCHIVE_DOWNLOAD_REJECTED');
}
function plain(directory) {
  const s = fs.lstatSync(directory);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    path.resolve(directory) !== directory ||
    fs.realpathSync.native(directory) !== directory
  )
    throw fail();
  return { dev: s.dev, ino: s.ino };
}
function identity(directory, expected) {
  const s = plain(directory);
  if (s.dev !== expected.dev || s.ino !== expected.ino) throw fail();
}
function readHash(file, bytes) {
  const s = fs.lstatSync(file);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size !== bytes ||
    fs.realpathSync.native(file) !== file
  )
    throw fail();
  const fd = fs.openSync(file, 'r'),
    h = createHash('sha256'),
    b = Buffer.alloc(65536);
  let count = 0;
  try {
    const before = fs.fstatSync(fd);
    if (before.dev !== s.dev || before.ino !== s.ino) throw fail();
    for (;;) {
      const n = fs.readSync(fd, b, 0, Math.min(b.length, bytes - count + 1), null);
      if (!n) break;
      count += n;
      if (count > bytes) throw fail();
      h.update(b.subarray(0, n));
    }
    const after = fs.fstatSync(fd);
    if (count !== bytes || after.size !== bytes || after.mtimeMs !== before.mtimeMs) throw fail();
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}
function download(pin, file, transport, assertOwner) {
  if (!PINS.includes(pin) || pin.bytes > 16 * 1024 * 1024) throw fail();
  assertOwner();
  const fd = fs.openSync(file, 'wx', 0o600),
    h = createHash('sha256');
  let request = null,
    response = null,
    requestClosed = false,
    responseClosed = true,
    ended = false,
    failed = false,
    count = 0,
    done = false;
  return new Promise((resolve, reject) => {
    let timer;
    function settle() {
      if (done || !requestClosed || !responseClosed) return;
      done = true;
      clearTimeout(timer);
      try {
        if (failed || !ended || count !== pin.bytes || h.digest('hex') !== pin.sha256) throw fail();
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        assertOwner();
        if (readHash(file, pin.bytes) !== pin.sha256) throw fail();
        resolve();
      } catch {
        try {
          fs.closeSync(fd);
        } catch {}
        reject(fail());
      }
    }
    function rejectTransport() {
      failed = true;
      try {
        response?.destroy();
      } catch {}
      try {
        request?.destroy();
      } catch {}
      settle();
    }
    timer = setTimeout(rejectTransport, 120000);
    try {
      request = transport.request(
        {
          protocol: 'https:',
          hostname: 'dl.google.com',
          port: 443,
          path: '/android/repository/' + pin.name,
          method: 'GET',
          agent: false,
          headers: {
            'User-Agent': 'Fonesi-Auto-pinned-development-inspection',
            'Accept-Encoding': 'identity',
          },
        },
        (incoming) => {
          if (response !== null) {
            failed = true;
            incoming.destroy();
            rejectTransport();
            return;
          }
          response = incoming;
          responseClosed = false;
          incoming.on('close', () => {
            responseClosed = true;
            if (!ended) failed = true;
            settle();
          });
          incoming.on('error', rejectTransport);
          incoming.on('aborted', rejectTransport);
          incoming.on('data', (chunk) => {
            if (failed) return;
            try {
              assertOwner();
              if (!Buffer.isBuffer(chunk) || count + chunk.length > pin.bytes) throw fail();
              count += chunk.length;
              h.update(chunk);
              let at = 0;
              while (at < chunk.length) {
                const n = fs.writeSync(fd, chunk, at, chunk.length - at);
                if (n <= 0) throw fail();
                at += n;
              }
            } catch {
              rejectTransport();
            }
          });
          incoming.on('end', () => {
            ended = true;
            settle();
          });
          if (
            incoming.statusCode !== 200 ||
            incoming.headers['content-length'] !== String(pin.bytes) ||
            !['identity', undefined].includes(incoming.headers['content-encoding'])
          )
            rejectTransport();
        },
      );
      request.on('close', () => {
        requestClosed = true;
        settle();
      });
      request.on('error', rejectTransport);
      request.end();
    } catch {
      failed = true;
      if (request === null) requestClosed = true;
      rejectTransport();
    }
  });
}
async function fetchArchives(parent, transport = https) {
  const parentIdentity = plain(parent),
    root = path.join(parent, '.platform-tools-input');
  fs.mkdirSync(root, { mode: 0o700 });
  const rootIdentity = plain(root),
    owner = randomUUID(),
    marker = path.join(root, '.owner');
  fs.writeFileSync(marker, owner, { flag: 'wx', mode: 0o600 });
  const markerIdentity = fs.lstatSync(marker);
  const assertOwner = () => {
    identity(parent, parentIdentity);
    identity(root, rootIdentity);
    const s = fs.lstatSync(marker);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.nlink !== 1 ||
      s.size !== 36 ||
      s.dev !== markerIdentity.dev ||
      s.ino !== markerIdentity.ino
    )
      throw fail();
    const fd = fs.openSync(marker, 'r');
    try {
      const opened = fs.fstatSync(fd);
      if (opened.dev !== markerIdentity.dev || opened.ino !== markerIdentity.ino) throw fail();
      const b = Buffer.alloc(37),
        n = fs.readSync(fd, b, 0, 37, 0);
      if (n !== 36 || b.subarray(0, n).toString('utf8') !== owner) throw fail();
    } finally {
      fs.closeSync(fd);
    }
  };
  if (PINS.reduce((n, p) => n + p.bytes, 0) > 32 * 1024 * 1024) throw fail();
  for (const pin of PINS) await download(pin, path.join(root, pin.name), transport, assertOwner);
  assertOwner();
  if (
    JSON.stringify(fs.readdirSync(root).sort()) !==
    JSON.stringify(['.owner', ...PINS.map((p) => p.name)].sort())
  )
    throw fail();
  return root;
}
module.exports = { PINS, fetchArchives, readHash };
if (require.main === module) {
  (async () => {
    try {
      if (process.argv.length !== 3) throw fail();
      await fetchArchives(process.argv[2]);
      console.log('RETAINED_ARCHIVES_DOWNLOAD_VERIFIED');
    } catch {
      console.log('RETAINED_ARCHIVES_DOWNLOAD_REJECTED');
      process.exitCode = 1;
    }
  })();
}
