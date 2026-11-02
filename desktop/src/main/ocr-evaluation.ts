// Linux supplied-input evaluation only. No application activation or action authority.
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
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { classifyCaptureEvidence } from './capture-contract.ts';
import { snapshotDisplayEvidence, type DisplayEvidence } from './input-contract.ts';
import { digest, ownRecord, safeInteger, type Mapping } from './preprocess-contract.ts';
import { createSuppliedPreprocessor, type SuppliedPreprocessor } from './preprocess-worker.ts';
const runtime = '/tmp/auto-p4-ocr-runtime-v1';
const interpreter = `${runtime}/bin/python`;
const vision = '/workspace/scratch/55d236e904dc/fonesi-Auto-phase-04/desktop/vision';
const script = join(vision, 'ocr_evaluation_worker.py');
// Replaced only with the independently frozen source-owned manifest, never caller input.
const MANIFEST_SHA256 = '146a80a4bf1892b2f24b9e8a723f0ca2a813217681f1392d849f343692506dd4';
const MODEL = 'en_PP-OCRv5_mobile_rec';
const MODEL_SHA256 = 'e595b4cf2ffad19fbb5a61ba345d63939577a3ab8717b6e5995642590c9101b4';
const WORK_MS = 30000,
  DRAIN_MS = 5000;
type Context = Readonly<{
  version: 1;
  revision: number;
  connected: boolean;
  display: DisplayEvidence;
}>;
export type OcrEvaluationResult = Readonly<{
  version: 1;
  scope: 'EVALUATION_ONLY';
  capability: 'UNQUALIFIED';
  status: 'TEXT' | 'NO_TEXT' | 'UNAVAILABLE';
  code: string;
  requestId: string;
  language: 'EN' | 'VI' | null;
  text: string | null;
  rawScore: number | null;
  model: string | null;
  modelSha256: string | null;
  runtimeSha256: string;
  sourcePixelSha256: string | null;
  inputSha256: string | null;
  mapping: Mapping | null;
  modelLatencyMs: number | null;
  peakRssBytes: number | null;
  endToEndLatencyMs: number;
  retired: boolean;
}>;
export type OcrEvaluationOperation = Readonly<{
  requestId: string;
  result: Promise<OcrEvaluationResult>;
  cancel(): void;
}>;
export type OcrEvaluator = Readonly<{
  begin(
    request: unknown,
  ):
    | Readonly<{ accepted: false; code: 'BUSY' | 'CONTEXT_CHANGED' }>
    | Readonly<{ accepted: true; operation: OcrEvaluationOperation }>;
  replaceContext(context: unknown): void;
  revoke(): void;
  close(): Promise<boolean>;
}>;
function snapshotContext(value: unknown): Context | null {
  const r = ownRecord(value, ['version', 'revision', 'connected', 'display']);
  if (r?.version !== 1 || !safeInteger(r.revision) || typeof r.connected !== 'boolean') return null;
  const display = snapshotDisplayEvidence(r.display);
  return display
    ? Object.freeze({ version: 1, revision: r.revision, connected: r.connected, display })
    : null;
}
function identity(s: NonNullable<ReturnType<typeof lstatSync>>): string {
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
}
function fileHash(path: string, limit: number): string {
  const a = lstatSync(path);
  if (!a.isFile() || a.isSymbolicLink() || a.size > limit) throw new Error('FILE');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (identity(fstatSync(fd)) !== identity(a)) throw new Error('FILE');
    const h = createHash('sha256'),
      buffer = Buffer.alloc(65536);
    let count = 0;
    for (;;) {
      const n = readSync(fd, buffer, 0, Math.min(buffer.length, a.size - count + 1), null);
      if (!n) break;
      count += n;
      if (count > a.size) throw new Error('FILE');
      h.update(buffer.subarray(0, n));
    }
    if (
      count !== a.size ||
      identity(fstatSync(fd)) !== identity(a) ||
      identity(lstatSync(path)) !== identity(a)
    )
      throw new Error('FILE');
    return h.digest('hex');
  } finally {
    closeSync(fd);
  }
}
function readSmall(path: string): Buffer {
  const a = lstatSync(path);
  if (!a.isFile() || a.isSymbolicLink() || a.size > 16384) throw new Error('MANIFEST');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (identity(fstatSync(fd)) !== identity(a)) throw new Error('MANIFEST');
    const b = Buffer.alloc(a.size);
    let offset = 0;
    while (offset < b.length) {
      const n = readSync(fd, b, offset, b.length - offset, null);
      if (!n) throw new Error('MANIFEST');
      offset += n;
    }
    if (
      readSync(fd, Buffer.alloc(1), 0, 1, null) ||
      identity(fstatSync(fd)) !== identity(a) ||
      identity(lstatSync(path)) !== identity(a)
    )
      throw new Error('MANIFEST');
    return b;
  } finally {
    closeSync(fd);
  }
}
function runtimeAdmitted(): boolean {
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') return false;
    const bytes = readSmall(join(vision, 'ocr_evaluation_manifest.json'));
    if (digest(bytes) !== MANIFEST_SHA256) return false;
    const m = JSON.parse(bytes.toString('utf8'));
    const site = join(runtime, 'lib/python3.12/site-packages');
    if (
      m.version !== 1 ||
      m.scope !== 'LINUX_EVALUATION_ONLY' ||
      realpathSync(runtime) !== runtime ||
      realpathSync(site) !== site ||
      fileHash(realpathSync(interpreter), 32 * 1024 * 1024) !== m.pythonSha256 ||
      fileHash(join(runtime, 'pyvenv.cfg'), 4096) !== m.configurationSha256 ||
      fileHash(script, 65536) !== m.workerSha256
    )
      return false;
    const rows: (string | number)[][] = [];
    let entries = 0,
      total = 0;
    const directories = new Set<string>();
    const walk = (dir: string, prefix: string): void => {
      const before = lstatSync(dir);
      if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('DIRECTORY');
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (++entries > 50000) throw new Error('LIMIT');
        const rel = prefix + entry.name,
          path = join(dir, entry.name);
        if (entry.isDirectory()) {
          directories.add(rel);
          walk(path, `${rel}/`);
        } else {
          if (!entry.isFile()) throw new Error('FILE');
          const a = lstatSync(path);
          total += a.size;
          if (total > 2 * 1024 * 1024 * 1024) throw new Error('LIMIT');
          const sha = fileHash(path, 512 * 1024 * 1024);
          if (identity(lstatSync(path)) !== identity(a)) throw new Error('FILE');
          rows.push([rel, a.size, sha]);
        }
      }
      if (identity(lstatSync(dir)) !== identity(before)) throw new Error('DIRECTORY');
    };
    walk(site, '');
    const expected = new Set<string>();
    for (const row of rows) {
      const parts = String(row[0]).split('/');
      parts.pop();
      while (parts.length) {
        expected.add(parts.join('/'));
        parts.pop();
      }
    }
    if (expected.size !== directories.size || [...directories].some((d) => !expected.has(d)))
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
type Header = Readonly<Record<string, string | number>>;
type Parsed = Readonly<{
  status: 'TEXT' | 'NO_TEXT' | 'UNAVAILABLE';
  code: string;
  text: string | null;
  rawScore: number | null;
  modelLatencyMs: number | null;
  peakRssBytes: number;
}>;
function flatReplyJson(raw: string): unknown {
  // Fixed flat scalar schema: no nesting, duplicate decoded keys or permissive UTF8.
  let offset = 0;
  const record: Record<string, unknown> = Object.create(null);
  const whitespace = () => {
    while (/[ \t\r\n]/.test(raw[offset] ?? '') && offset < raw.length) offset++;
  };
  const scalar =
    /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null/y;
  const token = (): string => {
    whitespace();
    scalar.lastIndex = offset;
    const match = scalar.exec(raw);
    if (!match) throw new Error('JSON');
    offset = scalar.lastIndex;
    return match[0];
  };
  whitespace();
  if (raw[offset++] !== '{') throw new Error('JSON');
  for (let count = 0; count < 32; count++) {
    const keyToken = token();
    if (!keyToken.startsWith('"')) throw new Error('JSON');
    const key = JSON.parse(keyToken) as string;
    if (Object.hasOwn(record, key)) throw new Error('JSON_DUPLICATE');
    whitespace();
    if (raw[offset++] !== ':') throw new Error('JSON');
    record[key] = JSON.parse(token());
    whitespace();
    const end = raw[offset++];
    if (end === '}') {
      whitespace();
      if (offset !== raw.length) throw new Error('JSON');
      return record;
    }
    if (end !== ',') throw new Error('JSON');
  }
  throw new Error('JSON_LIMIT');
}
function parseReply(bytes: Buffer, h: Header): Parsed | null {
  try {
    if (bytes.length < 5 || bytes.length > 16384 || bytes.readUInt32LE(0) !== bytes.length - 4)
      return null;
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4)),
      value = flatReplyJson(raw);
    const r = ownRecord(value, [
      'version',
      'kind',
      'scope',
      'capability',
      'requestId',
      'captureId',
      'deviceId',
      'bindingId',
      'generation',
      'orientationEpoch',
      'language',
      'sourcePixelSha256',
      'inputSha256',
      'status',
      'code',
      'model',
      'modelSha256',
      'text',
      'rawScore',
      'modelLatencyMs',
      'peakRssBytes',
    ]);
    if (
      r?.version !== 1 ||
      r.kind !== 'OCR_EVALUATION_RESULT' ||
      r.scope !== 'EVALUATION_ONLY' ||
      r.capability !== 'UNQUALIFIED'
    )
      return null;
    for (const key of [
      'requestId',
      'captureId',
      'deviceId',
      'bindingId',
      'generation',
      'orientationEpoch',
      'language',
      'sourcePixelSha256',
      'inputSha256',
    ])
      if (r[key] !== h[key]) return null;
    if (r.model !== MODEL || r.modelSha256 !== MODEL_SHA256 || !safeInteger(r.peakRssBytes))
      return null;
    if (r.status === 'UNAVAILABLE') {
      if (
        r.code !== 'WORKER_UNAVAILABLE' ||
        r.text !== null ||
        r.rawScore !== null ||
        r.modelLatencyMs !== null
      )
        return null;
      return Object.freeze({
        status: 'UNAVAILABLE',
        code: r.code,
        text: null,
        rawScore: null,
        modelLatencyMs: null,
        peakRssBytes: r.peakRssBytes,
      });
    }
    if (
      (r.status !== 'TEXT' && r.status !== 'NO_TEXT') ||
      r.code !== 'OK' ||
      typeof r.text !== 'string' ||
      Buffer.byteLength(r.text) > 4096 ||
      Buffer.from(r.text, 'utf8').toString('utf8') !== r.text ||
      [...r.text].length > 1024 ||
      (r.status === 'TEXT') !== r.text.length > 0 ||
      typeof r.rawScore !== 'number' ||
      !Number.isFinite(r.rawScore) ||
      r.rawScore < 0 ||
      r.rawScore > 1 ||
      typeof r.modelLatencyMs !== 'number' ||
      !Number.isFinite(r.modelLatencyMs) ||
      r.modelLatencyMs < 0 ||
      r.modelLatencyMs > WORK_MS
    )
      return null;
    return Object.freeze({
      status: r.status,
      code: 'OK',
      text: r.text,
      rawScore: r.rawScore,
      modelLatencyMs: r.modelLatencyMs,
      peakRssBytes: r.peakRssBytes,
    });
  } catch {
    return null;
  }
}
type Work = {
  id: string;
  generation: number;
  started: number;
  deadline: number;
  context: Context;
  language: 'EN' | 'VI' | null;
  cancelled: string | null;
  settled: boolean;
  resolve: (r: OcrEvaluationResult) => void;
  pre: SuppliedPreprocessor | null;
  preRetired: boolean;
  preClosing: boolean;
  child: ChildProcessWithoutNullStreams | null;
  closed: boolean;
  pgid: number | null;
  groupAbsent: boolean;
  groupTimer: ReturnType<typeof setTimeout> | null;
  stdoutClosed: boolean;
  stderrClosed: boolean;
  outEOF: boolean;
  errEOF: boolean;
  writes: number;
  exit: number | null;
  error: boolean;
  chunks: Buffer[];
  bytes: number;
  errBytes: number;
  timer: ReturnType<typeof setTimeout> | null;
  drain: ReturnType<typeof setTimeout> | null;
  drainExpired: boolean;
  header: Header | null;
  mapping: Mapping | null;
  root: string | null;
  rootIdentity: string | null;
};
export function createOcrEvaluator(initialContext: unknown): OcrEvaluator | null {
  let context = snapshotContext(initialContext),
    generation = 0,
    revoked = false,
    active: Work | null = null;
  if (!context) return null;
  const waiters: ((b: boolean) => void)[] = [];
  const live = (w: Work): boolean =>
    active === w &&
    !revoked &&
    generation === w.generation &&
    !w.cancelled &&
    performance.now() >= w.started &&
    performance.now() < w.deadline;
  const result = (
    w: Work,
    code: string,
    retired: boolean,
    p: Parsed | null = null,
  ): OcrEvaluationResult =>
    Object.freeze({
      version: 1,
      scope: 'EVALUATION_ONLY',
      capability: 'UNQUALIFIED',
      status: p?.status ?? 'UNAVAILABLE',
      code,
      requestId: w.id,
      language: w.language,
      text: p?.text ?? null,
      rawScore: p?.rawScore ?? null,
      model: w.header ? MODEL : null,
      modelSha256: w.header ? MODEL_SHA256 : null,
      runtimeSha256: MANIFEST_SHA256,
      sourcePixelSha256:
        typeof w.header?.sourcePixelSha256 === 'string' ? w.header.sourcePixelSha256 : null,
      inputSha256: typeof w.header?.inputSha256 === 'string' ? w.header.inputSha256 : null,
      mapping: w.mapping,
      modelLatencyMs: p?.modelLatencyMs ?? null,
      peakRssBytes: p?.peakRssBytes ?? null,
      endToEndLatencyMs: Math.max(0, performance.now() - w.started),
      retired,
    });
  const deliver = (w: Work, r: OcrEvaluationResult): void => {
    if (!w.settled) {
      w.settled = true;
      w.resolve(r);
    }
  };
  const cleanup = (w: Work): boolean => {
    if (!w.root) return true;
    try {
      const base = lstatSync(w.root);
      if (
        !base.isDirectory() ||
        base.isSymbolicLink() ||
        `${base.dev}:${base.ino}` !== w.rootIdentity
      )
        return false;
      let entries = 0,
        total = 0;
      const files: { path: string; identity: string }[] = [],
        dirs: { path: string; identity: string }[] = [];
      const inspect = (dir: string): void => {
        const before = lstatSync(dir);
        if (!before.isDirectory() || before.isSymbolicLink()) throw new Error('CACHE');
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (++entries > 3000) throw new Error('CACHE_LIMIT');
          const path = join(dir, e.name),
            a = lstatSync(path);
          if (e.isDirectory()) {
            inspect(path);
          } else {
            if (!e.isFile() || !a.isFile() || a.isSymbolicLink()) throw new Error('CACHE');
            total += a.size;
            if (total > 64 * 1024 * 1024) throw new Error('CACHE_LIMIT');
            files.push({ path, identity: identity(a) });
          }
        }
        if (identity(lstatSync(dir)) !== identity(before)) throw new Error('CACHE');
        dirs.push({ path: dir, identity: `${before.dev}:${before.ino}` });
      };
      inspect(w.root);
      for (const f of files) {
        if (identity(lstatSync(f.path)) !== f.identity) throw new Error('CACHE');
        unlinkSync(f.path);
      }
      for (const d of dirs) {
        const a = lstatSync(d.path);
        if (!a.isDirectory() || a.isSymbolicLink() || `${a.dev}:${a.ino}` !== d.identity)
          throw new Error('CACHE');
        rmdirSync(d.path);
      }
      w.root = null;
      return true;
    } catch {
      return false;
    }
  };
  const observeGroup = (w: Work): boolean => {
    if (w.groupAbsent) return true;
    if (w.pgid === null) return false;
    try {
      process.kill(-w.pgid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') w.groupAbsent = true;
    }
    return w.groupAbsent;
  };
  const stopGroup = (w: Work): void => {
    if (observeGroup(w) || w.pgid === null) return;
    try {
      process.kill(-w.pgid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') w.groupAbsent = true;
      // EPERM/unknown never proves retirement; retain exact group registration.
    }
  };
  const monitorGroup = (w: Work): void => {
    if (active !== w || w.groupAbsent || w.groupTimer || w.drainExpired) return;
    w.groupTimer = setTimeout(() => {
      w.groupTimer = null;
      observeGroup(w);
      finish(w);
      monitorGroup(w);
    }, 25);
  };
  const finish = (w: Work): void => {
    if (
      active !== w ||
      !w.preRetired ||
      !w.closed ||
      !w.stdoutClosed ||
      !w.stderrClosed ||
      w.writes ||
      !observeGroup(w)
    )
      return;
    const wasLive = live(w);
    const parsed =
      w.header && !w.error && w.outEOF && w.errEOF && w.exit === 0
        ? parseReply(Buffer.concat(w.chunks), w.header)
        : null;
    if (!cleanup(w)) {
      w.drainExpired = true;
      deliver(w, result(w, 'UNRETIRED', false));
      for (const resolve of waiters.splice(0)) resolve(false);
      return;
    }
    if (w.timer) clearTimeout(w.timer);
    if (w.drain) clearTimeout(w.drain);
    if (w.groupTimer) clearTimeout(w.groupTimer);
    active = null;
    for (const resolve of waiters.splice(0)) resolve(true);
    if (w.settled) return;
    if (
      !wasLive ||
      revoked ||
      generation !== w.generation ||
      w.cancelled !== null ||
      performance.now() < w.started ||
      performance.now() >= w.deadline ||
      classifyCaptureEvidence(
        w.context.display,
        w.context.display,
        Date.now(),
        w.context.connected,
      ) !== 'CURRENT'
    ) {
      deliver(
        w,
        result(
          w,
          w.cancelled ??
            (performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED'),
          true,
        ),
      );
      return;
    }
    if (!w.header) {
      deliver(w, result(w, w.cancelled ?? 'INVALID_INPUT', true));
      return;
    }
    if (!parsed) {
      deliver(w, result(w, w.error || w.exit !== 0 ? 'WORKER_FAILED' : 'MALFORMED_REPLY', true));
      return;
    }
    deliver(w, result(w, parsed.code, true, parsed));
  };
  const retirePre = async (w: Work): Promise<void> => {
    if (w.preRetired || w.preClosing) return;
    w.preClosing = true;
    try {
      w.preRetired = w.pre ? await w.pre.close() : true;
    } catch {
      w.preRetired = false;
    }
    w.preClosing = false;
    finish(w);
  };
  const cancel = (w: Work, code: string): void => {
    if (active !== w || w.cancelled) return;
    w.cancelled = code;
    if (w.timer) clearTimeout(w.timer);
    if (w.pre) void retirePre(w);
    else w.preRetired = true;
    if (w.child) {
      try {
        w.child.stdin.destroy();
      } catch {
        /* Actual stream settlement remains required. */
      }
      stopGroup(w);
    } else {
      w.closed = true;
      w.stdoutClosed = true;
      w.stderrClosed = true;
    }
    finish(w);
    if (active === w) {
      deliver(w, result(w, code, false));
      monitorGroup(w);
      w.drain = setTimeout(() => {
        w.drainExpired = true;
        if (w.groupTimer) {
          clearTimeout(w.groupTimer);
          w.groupTimer = null;
        }
        for (const resolve of waiters.splice(0)) resolve(false);
      }, DRAIN_MS);
    }
  };
  const start = async (w: Work, request: unknown): Promise<void> => {
    try {
      if (!live(w)) {
        cancel(w, 'CONTEXT_CHANGED');
        return;
      }
      const r = ownRecord(request, ['version', 'language', 'preprocess']);
      if (!live(w)) return;
      if (r?.version !== 1 || (r.language !== 'EN' && r.language !== 'VI')) {
        cancel(w, 'INVALID_INPUT');
        return;
      }
      w.language = r.language;
      if (r.language === 'VI') {
        cancel(w, 'VI_CHARACTER_REPERTOIRE_UNSUPPORTED');
        return;
      }
      const pre = ownRecord(r.preprocess, [
        'version',
        'png',
        'display',
        'roi',
        'scale',
        'contrast',
      ]);
      if (!live(w)) return;
      const display = pre ? snapshotDisplayEvidence(pre.display) : null;
      if (!live(w)) return;
      if (
        pre?.version !== 1 ||
        !display ||
        JSON.stringify(display) !== JSON.stringify(w.context.display) ||
        classifyCaptureEvidence(display, w.context.display, Date.now(), w.context.connected) !==
          'CURRENT'
      ) {
        cancel(w, 'INVALID_INPUT');
        return;
      }
      if (!runtimeAdmitted()) {
        cancel(w, 'WORKER_UNAVAILABLE');
        return;
      }
      if (!live(w)) {
        cancel(w, 'DEADLINE_EXCEEDED');
        return;
      }
      w.pre = createSuppliedPreprocessor(w.context);
      w.preRetired = false;
      if (!w.pre) {
        w.preRetired = true;
        cancel(w, 'WORKER_UNAVAILABLE');
        return;
      }
      const begun = w.pre.begin(pre);
      if (!begun.accepted) {
        await retirePre(w);
        cancel(w, begun.code);
        return;
      }
      const output = await begun.operation.result;
      await retirePre(w);
      if (!live(w)) {
        if (!w.cancelled)
          cancel(w, performance.now() >= w.deadline ? 'DEADLINE_EXCEEDED' : 'CONTEXT_CHANGED');
        else finish(w);
        return;
      }
      if (!w.preRetired || !output.retired) {
        cancel(w, 'UNRETIRED');
        return;
      }
      if (
        output.status !== 'PROCESSED' ||
        !output.rgba ||
        !output.mapping ||
        !output.sourcePixelSha256 ||
        !output.outputSha256
      ) {
        cancel(w, output.code);
        return;
      }
      const m = output.mapping,
        width = (m.roi.width * m.numerator) / m.denominator,
        height = (m.roi.height * m.numerator) / m.denominator;
      if (
        !safeInteger(width, 1, 2048) ||
        !safeInteger(height, 1, 256) ||
        width * height > 524288 ||
        output.rgba.length !== width * height * 4
      ) {
        cancel(w, 'INPUT_LIMIT');
        return;
      }
      const rgba = Buffer.from(output.rgba);
      if (digest(rgba) !== output.outputSha256) {
        cancel(w, 'INVALID_INPUT');
        return;
      }
      for (let i = 3; i < rgba.length; i += 4)
        if (rgba[i] !== 255) {
          cancel(w, 'INVALID_INPUT');
          return;
        }
      w.mapping = m;
      const h: Header = Object.freeze({
        version: 1,
        kind: 'OCR_EVALUATION',
        requestId: w.id,
        captureId: display.evidenceId,
        deviceId: display.deviceId,
        bindingId: display.bindingId,
        generation: display.generation,
        orientationEpoch: display.orientationEpoch,
        language: 'EN',
        sourcePixelSha256: output.sourcePixelSha256,
        inputSha256: digest(rgba),
        width,
        height,
        inputBytes: rgba.length,
      });
      w.header = h;
      const raw = Buffer.from(JSON.stringify(h));
      if (raw.length > 4096) {
        cancel(w, 'INPUT_LIMIT');
        return;
      }
      const frame = Buffer.alloc(4 + raw.length + rgba.length);
      frame.writeUInt32LE(raw.length);
      raw.copy(frame, 4);
      rgba.copy(frame, 4 + raw.length);
      const root = mkdtempSync('/tmp/auto-p4-ocr-job-');
      w.root = root;
      const rs = lstatSync(root);
      w.rootIdentity = `${rs.dev}:${rs.ino}`;
      for (const n of ['home', 'tmp', 'cache']) mkdirSync(join(root, n));
      if (!live(w)) {
        cancel(w, 'DEADLINE_EXCEEDED');
        return;
      }
      const child = spawn(interpreter, ['-I', '-B', script], {
        cwd: root,
        stdio: 'pipe',
        detached: true,
        env: {
          PATH: '/usr/bin:/bin',
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          HOME: join(root, 'home'),
          TMPDIR: join(root, 'tmp'),
          TMP: join(root, 'tmp'),
          TEMP: join(root, 'tmp'),
          PADDLE_PDX_CACHE_HOME: join(root, 'cache'),
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True',
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          HF_HOME: join(root, 'cache', 'hf'),
          SETUPTOOLS_USE_DISTUTILS: 'local',
          OMP_NUM_THREADS: '1',
          OPENBLAS_NUM_THREADS: '1',
          MKL_NUM_THREADS: '1',
          NUMEXPR_NUM_THREADS: '1',
          VECLIB_MAXIMUM_THREADS: '1',
          OPENCV_FOR_THREADS_NUM: '1',
          GLOG_minloglevel: '2',
        },
      });
      w.child = child;
      w.groupAbsent = false;
      w.pgid =
        safeInteger(child.pid, 1, 2147483647) && child.pid !== process.pid ? child.pid : null;
      child.stdout.on('data', (b: Buffer) => {
        w.bytes += b.length;
        if (w.bytes > 16384) {
          cancel(w, 'MALFORMED_REPLY');
          return;
        }
        if (!w.cancelled) w.chunks.push(Buffer.from(b));
      });
      child.stderr.on('data', (b: Buffer) => {
        w.errBytes += b.length;
        if (w.errBytes > 4096) cancel(w, 'WORKER_FAILED');
      });
      child.stdout.once('end', () => {
        w.outEOF = true;
        w.stdoutClosed = true;
        finish(w);
      });
      child.stdout.once('close', () => {
        w.stdoutClosed = true;
        finish(w);
      });
      child.stderr.once('end', () => {
        w.errEOF = true;
        w.stderrClosed = true;
        finish(w);
      });
      child.stderr.once('close', () => {
        w.stderrClosed = true;
        finish(w);
      });
      const leaderExited = (): void => {
        if (!observeGroup(w)) {
          w.error = true;
          cancel(w, 'DESCENDANT_UNRETIRED');
          monitorGroup(w);
        }
        finish(w);
      };
      child.once('exit', leaderExited);
      child.once('close', (code) => {
        w.exit = code;
        w.closed = true;
        leaderExited();
      });
      child.on('error', () => {
        w.error = true;
        cancel(w, 'WORKER_FAILED');
      });
      for (const stream of [child.stdout, child.stderr])
        stream.on('error', () => {
          w.error = true;
          cancel(w, 'WORKER_FAILED');
        });
      child.stdin.on('error', () => {
        w.error = true;
        cancel(w, 'WORKER_FAILED');
      });
      if (w.pgid === null) {
        cancel(w, 'WORKER_UNAVAILABLE');
        return;
      }
      if (!live(w)) {
        cancel(w, 'DEADLINE_EXCEEDED');
        return;
      }
      let settled = false;
      const done = (): void => {
        if (settled) return;
        settled = true;
        w.writes--;
        finish(w);
      };
      w.writes++;
      try {
        child.stdin.end(frame, done);
      } catch {
        if (
          !settled &&
          child.stdin.writableEnded === false &&
          child.stdin.writableLength === 0 &&
          child.stdin.destroyed === false
        )
          done();
        cancel(w, 'WORKER_FAILED');
      }
    } catch {
      cancel(w, 'WORKER_FAILED');
    }
  };
  const owner: OcrEvaluator = Object.freeze({
    begin(request: unknown) {
      if (active) return Object.freeze({ accepted: false as const, code: 'BUSY' as const });
      if (revoked || !context || !context.connected)
        return Object.freeze({ accepted: false as const, code: 'CONTEXT_CHANGED' as const });
      let resolve!: (r: OcrEvaluationResult) => void;
      const promise = new Promise<OcrEvaluationResult>((r) => {
        resolve = r;
      });
      const now = performance.now();
      const w: Work = {
        id: randomUUID(),
        generation,
        started: now,
        deadline: now + WORK_MS,
        context,
        language: null,
        cancelled: null,
        settled: false,
        resolve,
        pre: null,
        preRetired: true,
        preClosing: false,
        child: null,
        closed: false,
        pgid: null,
        groupAbsent: true,
        groupTimer: null,
        stdoutClosed: false,
        stderrClosed: false,
        outEOF: false,
        errEOF: false,
        writes: 0,
        exit: null,
        error: false,
        chunks: [],
        bytes: 0,
        errBytes: 0,
        timer: null,
        drain: null,
        drainExpired: false,
        header: null,
        mapping: null,
        root: null,
        rootIdentity: null,
      };
      active = w;
      w.timer = setTimeout(() => cancel(w, 'DEADLINE_EXCEEDED'), WORK_MS);
      queueMicrotask(() => {
        void start(w, request);
      });
      return Object.freeze({
        accepted: true as const,
        operation: Object.freeze({
          requestId: w.id,
          result: promise,
          cancel: () => cancel(w, 'CANCELLED'),
        }),
      });
    },
    replaceContext(value: unknown) {
      const g = ++generation;
      context = null;
      if (active) cancel(active, 'CONTEXT_CHANGED');
      const next = snapshotContext(value);
      if (!revoked && generation === g) context = next;
    },
    revoke() {
      revoked = true;
      generation++;
      context = null;
      if (active) cancel(active, 'CONTEXT_CHANGED');
    },
    async close() {
      owner.revoke();
      const w = active;
      if (!w) return true;
      await retirePre(w);
      observeGroup(w);
      finish(w);
      if (!active) return true;
      if (w.drainExpired) return false;
      return new Promise<boolean>((r) => {
        waiters.push(r);
      });
    },
  });
  return owner;
}
