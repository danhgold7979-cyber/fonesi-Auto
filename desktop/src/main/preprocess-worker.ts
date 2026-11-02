// Supplied-input Linux development composition only. Not installed app/runtime authority.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  constants,
  openSync,
  closeSync,
  fstatSync,
  lstatSync,
  readSync,
  readdirSync,
  realpathSync,
  mkdtempSync,
  mkdirSync,
  rmdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodePreprocessPng, classifyCaptureEvidence } from './capture-contract.ts';
import { snapshotDisplayEvidence, type DisplayEvidence } from './input-contract.ts';
import {
  PREPROCESS_PIPELINE,
  PREPROCESS_BYTES,
  digest,
  safeInteger,
  ownRecord,
  snapshotRoi,
  dimensions,
  mappingFor,
  encodePreprocessFrame,
  parsePreprocessReply,
  type Header,
  type PreprocessCode,
  type Mapping,
} from './preprocess-contract.ts';
const runtime = '/tmp/auto-p4-preprocess-runtime-v1';
const interpreter = `${runtime}/bin/python`;
const vision = '/workspace/scratch/55d236e904dc/fonesi-Auto-phase-04/desktop/vision';
const script = join(vision, 'preprocess_worker.py');
const WORK_MS = 10000,
  DRAIN_MS = 5000;
type Context = Readonly<{
  version: 1;
  revision: number;
  connected: boolean;
  display: DisplayEvidence;
}>;
export type PreprocessResult = Readonly<{
  version: 1;
  source: 'SUPPLIED_OPENCV_V1';
  status: 'PROCESSED' | 'REFUSED';
  code: PreprocessCode;
  requestId: string;
  sourcePixelSha256: string | null;
  inputSha256: string | null;
  outputSha256: string | null;
  mapping: Mapping | null;
  statistics: Readonly<{
    minIntensity: number;
    maxIntensity: number;
    clippedChannels: number;
  }> | null;
  rgba: Uint8Array | null;
  retired: boolean;
}>;
export type PreprocessOperation = Readonly<{
  requestId: string;
  result: Promise<PreprocessResult>;
  cancel(): void;
}>;
export type SuppliedPreprocessor = Readonly<{
  begin(
    request: unknown,
  ):
    | Readonly<{ accepted: false; code: 'BUSY' | 'CONTEXT_CHANGED' | 'WORKER_UNAVAILABLE' }>
    | Readonly<{ accepted: true; operation: PreprocessOperation }>;
  replaceContext(context: unknown): void;
  revoke(): void;
  close(): Promise<boolean>;
}>;
function contextSnapshot(v: unknown): Context | null {
  const r = ownRecord(v, ['version', 'revision', 'connected', 'display']);
  if (r?.version !== 1 || !safeInteger(r.revision) || typeof r.connected !== 'boolean') return null;
  const d = snapshotDisplayEvidence(r.display);
  return d
    ? Object.freeze({ version: 1, revision: r.revision, connected: r.connected, display: d })
    : null;
}
function identity(s: NonNullable<ReturnType<typeof lstatSync>>): string {
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
}
function stableRead(path: string, limit: number): Buffer {
  const a = lstatSync(path);
  if (!a.isFile() || a.isSymbolicLink() || a.size > limit) throw new Error('WORKER_UNAVAILABLE');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const f = fstatSync(fd);
    if (identity(a) !== identity(f)) throw new Error('WORKER_UNAVAILABLE');
    const b = Buffer.alloc(a.size);
    let offset = 0;
    while (offset < b.length) {
      const count = readSync(fd, b, offset, b.length - offset, null);
      if (!count) throw new Error('WORKER_UNAVAILABLE');
      offset += count;
    }
    if (readSync(fd, Buffer.alloc(1), 0, 1, null) !== 0) throw new Error('WORKER_UNAVAILABLE');
    if (
      b.length !== a.size ||
      identity(fstatSync(fd)) !== identity(a) ||
      identity(lstatSync(path)) !== identity(a)
    )
      throw new Error('WORKER_UNAVAILABLE');
    return b;
  } finally {
    closeSync(fd);
  }
}
function runtimeAdmitted(): boolean {
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') return false;
    const metadata = stableRead(join(vision, 'runtime-linux.json'), 4096);
    if (
      digest(metadata) !== 'e70f5d74055c77e7487c13701feb7ba3ab3f8847365da63152ebbc34aab1f207' ||
      realpathSync(runtime) !== runtime ||
      realpathSync(join(runtime, 'lib/python3.12/site-packages')) !==
        join(runtime, 'lib/python3.12/site-packages')
    )
      return false;
    const m = JSON.parse(metadata.toString('utf8'));
    if (
      digest(stableRead(join(runtime, 'pyvenv.cfg'), 4096)) !== m.configurationSha256 ||
      m.version !== 1 ||
      m.scope !== 'LINUX_DEVELOPMENT_ONLY' ||
      digest(stableRead(realpathSync(interpreter), 32 * 1024 * 1024)) !== m.pythonSha256 ||
      digest(stableRead(script, 65536)) !== m.workerSha256
    )
      return false;
    const site = join(runtime, 'lib/python3.12/site-packages'),
      rows: (string | number)[][] = [];
    let total = 0,
      entries = 0;
    const directories = new Set<string>();
    const walk = (dir: string, prefix: string): void => {
      const before = lstatSync(dir);
      if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('WORKER_UNAVAILABLE');
      for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      )) {
        if (++entries > 5000) throw new Error('WORKER_UNAVAILABLE');
        const rel = prefix + e.name,
          path = join(dir, e.name);
        if (e.isDirectory()) {
          directories.add(rel);
          walk(path, rel + '/');
        } else {
          if (!e.isFile() || rel.endsWith('.pth') || rows.length >= 5000)
            throw new Error('WORKER_UNAVAILABLE');
          const b = stableRead(path, 128 * 1024 * 1024);
          total += b.length;
          if (total > 300 * 1024 * 1024) throw new Error('WORKER_UNAVAILABLE');
          rows.push([rel, b.length, digest(b)]);
        }
      }
      if (identity(lstatSync(dir)) !== identity(before)) throw new Error('WORKER_UNAVAILABLE');
    };
    walk(site, '');
    const expectedDirectories = new Set<string>();
    for (const row of rows) {
      const parts = String(row[0]).split('/');
      parts.pop();
      while (parts.length) {
        expectedDirectories.add(parts.join('/'));
        parts.pop();
      }
    }
    if (
      directories.size !== expectedDirectories.size ||
      [...directories].some((d) => !expectedDirectories.has(d))
    )
      return false;
    rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));
    return (
      rows.length === m.siteFiles &&
      total === m.siteBytes &&
      digest(Buffer.from(JSON.stringify(rows))) === m.siteSha256
    );
  } catch {
    return false;
  }
}
type Work = {
  id: string;
  generation: number;
  deadline: number;
  settled: boolean;
  cancelled: PreprocessCode | null;
  resolve: (r: PreprocessResult) => void;
  child: ChildProcessWithoutNullStreams | null;
  closed: boolean;
  outEnd: boolean;
  errEnd: boolean;
  writes: number;
  timer: ReturnType<typeof setTimeout> | null;
  drain: ReturnType<typeof setTimeout> | null;
  root: string | null;
  rootIdentity: string | null;
  directoryIdentities: Record<string, string>;
  header: Header | null;
  context: Context;
  finish: () => void;
  drainExpired: boolean;
};
export function createSuppliedPreprocessor(initialContext: unknown): SuppliedPreprocessor | null {
  let generation = 0,
    revoked = false,
    context = contextSnapshot(initialContext),
    active: Work | null = null;
  if (!context) return null;
  const closeWaiters: ((v: boolean) => void)[] = [];
  const refusal = (w: Work, code: PreprocessCode, retired: boolean): PreprocessResult =>
    Object.freeze({
      version: 1,
      source: 'SUPPLIED_OPENCV_V1',
      status: 'REFUSED',
      code,
      requestId: w.id,
      sourcePixelSha256: w.header?.sourcePixelSha256 ?? null,
      inputSha256: w.header?.inputSha256 ?? null,
      outputSha256: null,
      mapping: null,
      statistics: null,
      rgba: null,
      retired,
    });
  const deliver = (w: Work, r: PreprocessResult): void => {
    if (!w.settled) {
      w.settled = true;
      w.resolve(r);
    }
  };
  const current = (w: Work): boolean =>
    active === w &&
    !revoked &&
    w.generation === generation &&
    !w.cancelled &&
    performance.now() < w.deadline;
  const cleanup = (w: Work): boolean => {
    if (!w.root) return true;
    try {
      const s = lstatSync(w.root);
      if (!s.isDirectory() || s.isSymbolicLink() || `${s.dev}:${s.ino}` !== w.rootIdentity)
        return false;
      for (const n of ['tmp', 'home']) {
        const d = join(w.root, n),
          a = lstatSync(d);
        if (
          !a.isDirectory() ||
          a.isSymbolicLink() ||
          `${a.dev}:${a.ino}` !== w.directoryIdentities[n] ||
          readdirSync(d).length
        )
          return false;
        rmdirSync(d);
      }
      if (readdirSync(w.root).length) return false;
      rmdirSync(w.root);
      w.root = null;
      return true;
    } catch {
      return false;
    }
  };
  const release = (w: Work): boolean => {
    if (!w.closed || !w.outEnd || !w.errEnd || w.writes || !cleanup(w)) return false;
    if (w.timer) clearTimeout(w.timer);
    if (w.drain) clearTimeout(w.drain);
    if (active === w) active = null;
    for (const resolve of closeWaiters.splice(0)) resolve(true);
    return true;
  };
  const cancel = (w: Work, code: PreprocessCode): void => {
    if (w.cancelled || active !== w) return;
    w.cancelled = code;
    if (w.timer) clearTimeout(w.timer);
    if (!w.child) {
      w.closed = true;
      w.outEnd = true;
      w.errEnd = true;
      const done = release(w);
      if (!done) w.drainExpired = true;
      deliver(w, refusal(w, code, done));
      return;
    }
    deliver(w, refusal(w, code, false));
    try {
      w.child.stdin.destroy();
      w.child.kill('SIGKILL');
    } catch {
      /* Retain registration until actual close, never infer kill success. */
    }
    w.drain = setTimeout(() => {
      w.drainExpired = true;
      for (const resolve of closeWaiters.splice(0)) resolve(false);
    }, DRAIN_MS);
    w.finish();
  };
  const start = (w: Work, request: unknown): void => {
    try {
      if (!current(w)) {
        cancel(w, performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED');
        return;
      }
      const r = ownRecord(request, ['version', 'png', 'display', 'roi', 'scale', 'contrast']);
      if (!current(w)) return;
      if (r?.version !== 1) {
        cancel(w, 'INVALID_INPUT');
        return;
      }
      const d = snapshotDisplayEvidence(r.display);
      if (!current(w)) return;
      if (
        !d ||
        JSON.stringify(d) !== JSON.stringify(w.context.display) ||
        classifyCaptureEvidence(d, w.context.display, Date.now(), w.context.connected) !== 'CURRENT'
      ) {
        cancel(w, 'CONTEXT_CHANGED');
        return;
      }
      const decoded = decodePreprocessPng(r.png, d);
      if (!current(w)) return;
      if (!decoded.ok) {
        cancel(w, decoded.code === 'CAPTURE_LIMIT' ? 'INPUT_LIMIT' : 'INVALID_INPUT');
        return;
      }
      const roi = snapshotRoi(r.roi, decoded.width, decoded.height);
      if (!current(w)) return;
      if (!roi) {
        cancel(w, 'INVALID_ROI');
        return;
      }
      if (
        (r.scale !== 'HALF' && r.scale !== 'ONE' && r.scale !== 'DOUBLE') ||
        (r.contrast !== 'IDENTITY' && r.contrast !== 'GAIN_125') ||
        !dimensions(roi, r.scale)
      ) {
        cancel(w, 'INVALID_SCALE');
        return;
      }
      const rgba = new Uint8Array(decoded.width * decoded.height * 4);
      for (let i = 0, j = 0; i < decoded.pixels.length; i += decoded.channels, j += 4) {
        rgba[j] = decoded.pixels[i] ?? 0;
        rgba[j + 1] = decoded.pixels[i + 1] ?? 0;
        rgba[j + 2] = decoded.pixels[i + 2] ?? 0;
        rgba[j + 3] = 255;
        if (decoded.channels === 4 && decoded.pixels[i + 3] !== 255) {
          cancel(w, 'UNSUPPORTED_ALPHA');
          return;
        }
      }
      const h: Header = Object.freeze({
        version: 1,
        kind: 'PREPROCESS',
        requestId: w.id,
        captureId: d.evidenceId,
        deviceId: d.deviceId,
        bindingId: d.bindingId,
        generation: d.generation,
        orientationEpoch: d.orientationEpoch,
        pipelineId: PREPROCESS_PIPELINE,
        inputWidth: decoded.width,
        inputHeight: decoded.height,
        inputBytes: rgba.length,
        sourcePixelSha256: decoded.pixelSha256,
        inputSha256: digest(rgba),
        roi,
        scale: r.scale,
        contrast: r.contrast,
      });
      w.header = h;
      if (!runtimeAdmitted()) {
        cancel(w, 'WORKER_UNAVAILABLE');
        return;
      }
      if (!current(w)) {
        cancel(w, 'DEADLINE_EXCEEDED');
        return;
      }
      const root = mkdtempSync('/tmp/auto-p4-preprocess-job-');
      w.root = root;
      const rs = lstatSync(root);
      w.rootIdentity = `${rs.dev}:${rs.ino}`;
      for (const n of ['tmp', 'home']) {
        mkdirSync(join(root, n));
        const ds = lstatSync(join(root, n));
        w.directoryIdentities[n] = `${ds.dev}:${ds.ino}`;
      }
      if (!current(w)) {
        cancel(w, performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED');
        return;
      }
      const child = spawn(interpreter, ['-I', '-B', script], {
        cwd: root,
        stdio: 'pipe',
        env: {
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          PYTHONHASHSEED: '0',
          PYTHONNOUSERSITE: '1',
          OMP_NUM_THREADS: '1',
          OPENBLAS_NUM_THREADS: '1',
          MKL_NUM_THREADS: '1',
          NUMEXPR_NUM_THREADS: '1',
          VECLIB_MAXIMUM_THREADS: '1',
          OPENCV_FOR_THREADS_NUM: '1',
          HOME: join(root, 'home'),
          TMPDIR: join(root, 'tmp'),
          TMP: join(root, 'tmp'),
          TEMP: join(root, 'tmp'),
        },
      });
      w.child = child;
      let count = 0,
        stderr = false,
        outEOF = false,
        errEOF = false,
        exit: number | null = null,
        failed = false;
      const chunks: Buffer[] = [];
      w.finish = () => {
        if (active !== w) return;
        if (!w.closed || !w.outEnd || !w.errEnd || w.writes) return;
        const live = current(w);
        const parsed =
          !stderr && !failed && outEOF && errEOF && exit === 0
            ? parsePreprocessReply(Buffer.concat(chunks), h)
            : null;
        const done = release(w);
        if (!done) {
          w.drainExpired = true;
          deliver(w, refusal(w, 'UNRETIRED', false));
          for (const resolve of closeWaiters.splice(0)) resolve(false);
          return;
        }
        if (!live) {
          deliver(
            w,
            refusal(
              w,
              w.cancelled ??
                (performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED'),
              true,
            ),
          );
          return;
        }
        if (!parsed) {
          deliver(
            w,
            refusal(w, stderr || failed || exit !== 0 ? 'WORKER_FAILED' : 'MALFORMED_REPLY', true),
          );
          return;
        }
        if (parsed.code !== 'OK') {
          deliver(w, refusal(w, parsed.code, true));
          return;
        }
        const finalUtc = Date.now();
        const captureCurrent =
          classifyCaptureEvidence(d, w.context.display, finalUtc, w.context.connected) ===
          'CURRENT';
        // No callbacks/untrusted properties between this private final fence and assignment.
        if (
          revoked ||
          generation !== w.generation ||
          w.cancelled ||
          performance.now() >= w.deadline ||
          !captureCurrent
        ) {
          deliver(w, refusal(w, w.cancelled ?? 'CONTEXT_CHANGED', true));
          return;
        }
        deliver(
          w,
          Object.freeze({
            version: 1,
            source: 'SUPPLIED_OPENCV_V1',
            status: 'PROCESSED',
            code: 'OK',
            requestId: w.id,
            sourcePixelSha256: h.sourcePixelSha256,
            inputSha256: h.inputSha256,
            outputSha256: parsed.outputSha256,
            mapping: mappingFor(h, w.context.revision),
            statistics: parsed.statistics,
            rgba: parsed.rgba,
            retired: true,
          }),
        );
      };
      child.stdout.on('data', (b: Buffer) => {
        count += b.length;
        if (count > PREPROCESS_BYTES + 4100) {
          cancel(w, 'MALFORMED_REPLY');
          return;
        }
        if (!w.cancelled) chunks.push(Buffer.from(b));
      });
      child.stderr.on('data', () => {
        stderr = true;
        cancel(w, 'WORKER_FAILED');
      });
      child.stdout.once('end', () => {
        outEOF = true;
        w.outEnd = true;
        w.finish();
      });
      child.stdout.once('close', () => {
        w.outEnd = true;
        w.finish();
      });
      child.stderr.once('end', () => {
        errEOF = true;
        w.errEnd = true;
        w.finish();
      });
      child.stderr.once('close', () => {
        w.errEnd = true;
        w.finish();
      });
      child.on('error', () => {
        failed = true;
        cancel(w, 'WORKER_FAILED');
      });
      child.stdin.on('error', () => {
        failed = true;
        cancel(w, 'WORKER_FAILED');
      });
      child.once('close', (code) => {
        exit = code;
        w.closed = true;
        w.finish();
      });
      if (!current(w)) {
        cancel(w, w.cancelled ?? 'CONTEXT_CHANGED');
        return;
      }
      const frame = encodePreprocessFrame(h, rgba);
      if (!current(w)) {
        cancel(w, performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED');
        return;
      }
      let writeSettled = false;
      const writeDone = (): void => {
        if (writeSettled) return;
        writeSettled = true;
        w.writes--;
        w.finish();
      };
      w.writes++;
      try {
        child.stdin.end(frame, writeDone);
      } catch {
        // Only the actual stream's unchanged, empty, unended state proves no
        // handoff. An ended/queued/destroyed stream stays registered until its
        // actual callback; a throw alone is never proof of write retirement.
        if (
          !writeSettled &&
          child.stdin.writableEnded === false &&
          child.stdin.writableLength === 0 &&
          child.stdin.destroyed === false
        )
          writeDone();
        cancel(w, 'WORKER_FAILED');
      }
    } catch {
      cancel(w, 'WORKER_FAILED');
    }
  };
  const owner: SuppliedPreprocessor = Object.freeze({
    begin(request: unknown) {
      if (active) return Object.freeze({ accepted: false as const, code: 'BUSY' as const });
      if (revoked || !context || !context.connected)
        return Object.freeze({ accepted: false as const, code: 'CONTEXT_CHANGED' as const });
      let resolve!: (r: PreprocessResult) => void;
      const result = new Promise<PreprocessResult>((r) => {
        resolve = r;
      });
      const w: Work = {
        id: randomUUID(),
        generation,
        deadline: performance.now() + WORK_MS,
        settled: false,
        cancelled: null,
        resolve,
        child: null,
        closed: false,
        outEnd: false,
        errEnd: false,
        writes: 0,
        timer: null,
        drain: null,
        root: null,
        rootIdentity: null,
        directoryIdentities: Object.create(null),
        header: null,
        context,
        finish: () => {},
        drainExpired: false,
      };
      active = w;
      w.timer = setTimeout(() => cancel(w, 'DEADLINE_EXCEEDED'), WORK_MS);
      queueMicrotask(() => start(w, request));
      return Object.freeze({
        accepted: true as const,
        operation: Object.freeze({ requestId: w.id, result, cancel: () => cancel(w, 'CANCELLED') }),
      });
    },
    replaceContext(value: unknown) {
      const g = ++generation;
      context = null;
      if (active) cancel(active, 'CONTEXT_CHANGED');
      const c = contextSnapshot(value);
      if (!revoked && generation === g) context = c;
    },
    revoke() {
      revoked = true;
      generation++;
      context = null;
      if (active) cancel(active, 'CONTEXT_CHANGED');
    },
    async close() {
      owner.revoke();
      if (!active) return true;
      if (active.drainExpired) return false;
      return new Promise<boolean>((resolve) => {
        closeWaiters.push(resolve);
        if (active?.closed) active.finish();
      });
    },
  });
  return owner;
}
