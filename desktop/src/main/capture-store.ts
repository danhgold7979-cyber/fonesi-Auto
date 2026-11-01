// Main-only owned artifact bytes. No caller paths, transport acquisition or IPC.
import { lstat, realpath, mkdir, open, opendir, link, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { snapshotDisplayEvidence, type DisplayEvidence } from './input-contract.ts';
import {
  validateCapturePng,
  validateHierarchyXml,
  classifyCaptureEvidence,
} from './capture-contract.ts';
import type { DurableCapture, DurableSnapshot, DurableDelta } from './durable-contract.ts';

import {
  DurableFault,
  type DurableContext,
  type DurableStepResult,
  type DurableDenied,
  type createDurableCoordinator,
} from './durable-coordinator.ts';
const TOTAL = 256 * 1024 * 1024;
const MAX_ENTRIES = 8193;
const WEEK = 604800000;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const maximum = (kind: DurableCapture['kind']) => (kind === 'PNG' ? 16777216 : 1048576);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
function record(v: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!v || typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      return null;
    const d = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(d).length !== keys.length) return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const x = d[key];
      if (!x || !Object.hasOwn(x, 'value') || !x.enumerable) return null;
      out[key] = x.value;
    }
    return out;
  } catch {
    return null;
  }
}
function bytes(input: unknown, limit: number): Uint8Array | null {
  try {
    const p = Object.getPrototypeOf(Uint8Array.prototype);
    if (Object.getOwnPropertyDescriptor(p, Symbol.toStringTag)?.get?.call(input) !== 'Uint8Array')
      return null;
    const buffer = Object.getOwnPropertyDescriptor(p, 'buffer')?.get?.call(input);
    const offset = Object.getOwnPropertyDescriptor(p, 'byteOffset')?.get?.call(input);
    const size = Object.getOwnPropertyDescriptor(p, 'byteLength')?.get?.call(input);
    if (
      !(buffer instanceof ArrayBuffer) ||
      !integer(offset) ||
      !integer(size) ||
      size < 1 ||
      size > limit
    )
      return null;
    return new Uint8Array(new Uint8Array(buffer, offset, size));
  } catch {
    return null;
  }
}
async function plain(directory: string): Promise<void> {
  if (directory !== resolve(directory)) throw Error('CAPTURE_PATH');
  let current = directory;
  for (;;) {
    const s = await lstat(current);
    if (!s.isDirectory() || s.isSymbolicLink() || (await realpath(current)) !== current)
      throw Error('CAPTURE_PATH');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function same(
  a: { dev: number; ino: number; size: number },
  b: { dev: number; ino: number; size: number },
): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size;
}
async function readFile(file: string, limit: number, links = 1): Promise<Uint8Array> {
  await plain(dirname(file));
  const before = await lstat(file);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== links ||
    before.size < 1 ||
    before.size > limit
  )
    throw Error('CAPTURE_FILE');
  const handle = await open(file, 'r');
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || actual.nlink !== links || !same(before, actual))
      throw Error('CAPTURE_FILE');
    const out = new Uint8Array(before.size + 1);
    let count = 0;
    while (count < out.length) {
      const r = await handle.read(out, count, out.length - count, null);
      if (!r.bytesRead) break;
      count += r.bytesRead;
    }
    const after = await handle.stat(),
      named = await lstat(file);
    if (
      count !== before.size ||
      !same(before, after) ||
      !same(after, named) ||
      after.nlink !== links ||
      named.nlink !== links ||
      named.isSymbolicLink()
    )
      throw Error('CAPTURE_FILE');
    return out.slice(0, count);
  } finally {
    await handle.close();
  }
}
async function writeNew(
  file: string,
  value: Uint8Array,
  admit: () => void,
  mutationStarted: () => void,
): Promise<void> {
  await plain(dirname(file));
  admit();
  mutationStarted();
  const h = await open(file, 'wx', 0o600);
  try {
    await h.writeFile(value);
    await h.sync();
  } finally {
    await h.close();
  }
  if (sha(await readFile(file, value.length)) !== sha(value)) throw Error('CAPTURE_FILE');
}
type Inventory = Readonly<{
  total: number;
  files: ReadonlyMap<string, Readonly<{ size: number; links: number }>>;
}>;
async function inventory(
  root: string,
  marker: string,
  rows: readonly DurableCapture[],
  permitLinked = false,
): Promise<Inventory> {
  await plain(root);
  if (Buffer.from(await readFile(join(root, '.owner'), 256)).toString('utf8') !== marker)
    throw Error('CAPTURE_OWNER');
  const allowed = new Map<string, number>([['.owner', 256]]);
  for (const row of rows) {
    allowed.set(row.relative_name, maximum(row.kind));
    allowed.set(row.relative_name + '.part', maximum(row.kind));
  }
  const files = new Map<string, { size: number; links: number }>();
  let count = 0,
    total = 0;
  const dir = await opendir(root);
  try {
    for (;;) {
      const e = await dir.read();
      if (!e) break;
      if (++count > MAX_ENTRIES || !allowed.has(e.name) || !e.isFile() || e.isSymbolicLink())
        throw Error('CAPTURE_INVENTORY');
      const s = await lstat(join(root, e.name));
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.size > (allowed.get(e.name) ?? 0) ||
        s.nlink < 1 ||
        s.nlink > (permitLinked && e.name !== '.owner' ? 2 : 1)
      )
        throw Error('CAPTURE_INVENTORY');
      if (e.name !== '.owner') {
        total += s.size;
        if (total > TOTAL) throw Error('CAPTURE_LIMIT');
        files.set(e.name, Object.freeze({ size: s.size, links: s.nlink }));
      }
    }
  } finally {
    await dir.close();
  }
  if (
    !permitLinked &&
    rows.some((row) => files.has(row.relative_name) && files.has(row.relative_name + '.part'))
  )
    throw Error('CAPTURE_INVENTORY');
  return { total, files };
}
function displayFor(row: DurableCapture, snapshot: DurableSnapshot): DisplayEvidence {
  const binding = snapshot.bindings.find((b) => b.binding_id === row.binding_id);
  if (!binding) throw Error('CAPTURE_BINDING');
  return {
    version: 1,
    evidenceId: row.display_evidence_id,
    deviceId: row.device_id,
    bindingId: row.binding_id,
    generation: row.generation,
    serial: binding.serial,
    displayId: 0,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    orientationEpoch: row.display_profile_revision,
    observedUtc: row.display_observed_utc,
    validUntilUtc: row.valid_until_utc,
    source: row.source,
  };
}
function valid(data: Uint8Array, row: DurableCapture, snapshot: DurableSnapshot): boolean {
  const display = displayFor(row, snapshot);
  try {
    return row.kind === 'PNG'
      ? validateCapturePng(data, display).ok
      : validateHierarchyXml(
          new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data),
          display,
        ).ok;
  } catch {
    return false;
  }
}

type Coordinator = ReturnType<typeof createDurableCoordinator>;
type CaptureReceipt = Readonly<{
  evidenceId: string;
  kind: DurableCapture['kind'];
  capturedUtc: number;
  sha256: string;
  bytes: number;
}>;
type Artifact = Readonly<{
  evidenceId: string;
  kind: DurableCapture['kind'];
  sha256: string;
  bytes: number;
  capturedUtc: number;
  freshness: 'CURRENT' | 'STALE';
}>;
export type CaptureRead =
  | Readonly<{ ok: true; outcome: 'OBSERVED'; artifact: Artifact; data: Uint8Array }>
  | Readonly<{
      ok: false;
      outcome: 'NOT_OBSERVED';
      code:
        | 'INVALID_REQUEST'
        | 'OWNER_REVOKED'
        | 'INVALID_CAPTURE'
        | 'STALE_CAPTURE'
        | 'STORAGE_FAILED'
        | 'RECOVERY_REQUIRED'
        | 'NOT_FOUND';
    }>;
export type CaptureStoreOptions = Readonly<{
  coordinator: Coordinator;
  dataRoot: string;
  storeId: string;
  assertOwnedSync: () => void;
  clock: () => number;
  newId: () => string;
  currentDisplay: (deviceId: string) => Readonly<{ display: unknown; connected: boolean }>;
}>;
function delta(ctx: DurableContext, kind: DurableDelta['kind']): DurableDelta {
  return {
    operationId: ctx.operationId,
    kind,
    utc: ctx.utc,
    hostEpoch: ctx.snapshot.meta.host_epoch,
    devices: { insert: [], update: [] },
    bindings: { insert: [], refresh: [], retireIds: [] },
    identityEvidence: { insert: [] },
    captures: { insert: [], transition: [] },
    holds: { insert: [], releaseIds: [] },
  };
}
function reject(code: ConstructorParameters<typeof DurableFault>[0]): never {
  throw new DurableFault(code);
}
function find(snapshot: DurableSnapshot, id: string): DurableCapture {
  const row = snapshot.captures.find((r) => r.evidence_id === id);
  if (!row) reject('INVALID_REQUEST');
  return row;
}
export class CaptureStore {
  private readonly lane: Coordinator['withLane'];
  private readonly root: string;
  private readonly marker: string;
  private readonly owned: () => void;
  private readonly now: () => number;
  private readonly nextId: () => string;
  private readonly current: CaptureStoreOptions['currentDisplay'];
  private lastPruneUtc = 0;
  constructor(options: CaptureStoreOptions) {
    if (
      typeof options.dataRoot !== 'string' ||
      options.dataRoot !== resolve(options.dataRoot) ||
      !uuid(options.storeId)
    )
      throw new DurableFault('INVALID_REQUEST');
    this.root = join(options.dataRoot, 'captures-v1');
    this.marker = JSON.stringify({ version: 1, storeId: options.storeId, kind: 'CAPTURE_STORE' });
    this.lane = options.coordinator.withLane.bind(options.coordinator);
    this.owned = options.assertOwnedSync.bind(options);
    this.now = options.clock.bind(options);
    this.nextId = options.newId.bind(options);
    this.current = options.currentDisplay.bind(options);
  }
  private clock(): number {
    const n = this.now();
    if (!integer(n)) reject('INVALID_REQUEST');
    return n;
  }
  private freshness(row: DurableCapture, snapshot: DurableSnapshot): 'CURRENT' | 'STALE' {
    const current = this.current(row.device_id),
      display = snapshotDisplayEvidence(current.display);
    return classifyCaptureEvidence(
      displayFor(row, snapshot),
      display,
      this.clock(),
      current.connected,
    ) === 'CURRENT'
      ? 'CURRENT'
      : 'STALE';
  }
  private async scan(
    snapshot: DurableSnapshot,
    optional = false,
    linked = false,
  ): Promise<Inventory | null> {
    this.owned();
    try {
      return await inventory(this.root, this.marker, snapshot.captures, linked);
    } catch (error) {
      if (
        optional &&
        error instanceof Error &&
        Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ENOENT'
      ) {
        try {
          await lstat(this.root);
        } catch (missing) {
          if (
            missing instanceof Error &&
            Object.getOwnPropertyDescriptor(missing, 'code')?.value === 'ENOENT'
          )
            return null;
        }
      }
      reject('RECOVERY_REQUIRED');
    }
  }
  private async createRoot(mutationStarted: () => void, admit: () => void): Promise<void> {
    admit();
    await plain(dirname(this.root));
    let absent = false;
    try {
      await lstat(this.root);
    } catch (error) {
      if (
        error instanceof Error &&
        Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ENOENT'
      )
        absent = true;
      else throw error;
    }
    if (absent) {
      admit();
      mutationStarted();
      await mkdir(this.root);
      await writeNew(join(this.root, '.owner'), Buffer.from(this.marker), admit, mutationStarted);
    }
    if (
      Buffer.from(await readFile(join(this.root, '.owner'), 256)).toString('utf8') !== this.marker
    )
      reject('RECOVERY_REQUIRED');
  }
  reserve(
    expectedRevision: number,
    input: unknown,
  ): Promise<DurableStepResult<string> | DurableDenied> {
    const request = record(input, ['kind', 'display']),
      display = snapshotDisplayEvidence(request?.display),
      kind = request?.kind;
    return this.lane(async (lane) =>
      lane.step(
        'CAPTURE_RESERVE',
        expectedRevision,
        (ctx) => {
          if (!request || !display || !['PNG', 'HIERARCHY_XML'].includes(kind as string))
            reject('INVALID_REQUEST');
          if (ctx.snapshot.captures.length >= 4096) reject('LIMIT_EXCEEDED');
          const device = ctx.snapshot.devices.find((d) => d.device_id === display.deviceId),
            binding = ctx.snapshot.bindings.find((b) => b.binding_id === display.bindingId);
          if (
            !device ||
            !binding ||
            binding.retired ||
            binding.device_id !== display.deviceId ||
            binding.generation !== display.generation ||
            device.generation !== display.generation ||
            device.display_profile_revision !== display.orientationEpoch ||
            binding.serial !== display.serial
          )
            reject('STALE_CAPTURE');
          const id = this.nextId(),
            captured = ctx.utc;
          const ids = [
            ...ctx.snapshot.devices.map((x) => x.device_id),
            ...ctx.snapshot.bindings.map((x) => x.binding_id),
            ...ctx.snapshot.identityEvidence.map((x) => x.evidence_id),
            ...ctx.snapshot.captures.flatMap((x) => [x.evidence_id, x.display_evidence_id]),
            ...ctx.snapshot.holds.map((x) => x.hold_id),
            display.evidenceId,
            ctx.operationId,
            ctx.diagnosticId,
          ];
          if (!uuid(id) || ids.includes(id) || !Number.isSafeInteger(captured + WEEK))
            reject('LIMIT_EXCEEDED');
          const row: DurableCapture = {
            evidence_id: id,
            device_id: display.deviceId,
            binding_id: display.bindingId,
            generation: display.generation,
            display_profile_revision: display.orientationEpoch,
            kind: kind as DurableCapture['kind'],
            captured_utc: captured,
            display_evidence_id: display.evidenceId,
            display_observed_utc: display.observedUtc,
            valid_until_utc: display.validUntilUtc,
            expires_utc: captured + WEEK,
            width: display.width,
            height: display.height,
            rotation: display.rotation,
            source: display.source,
            relative_name: `capture-${id}.${kind === 'PNG' ? 'png' : 'xml'}`,
            sha256: null,
            bytes: null,
            state: 'RESERVED',
          };
          if (this.freshness(row, ctx.snapshot) !== 'CURRENT') reject('STALE_CAPTURE');
          let dirty = false;
          return {
            mutationStarted: () => dirty,
            effect: async () => {
              const inv = await this.scan(ctx.snapshot, true);
              let reserved = inv?.total ?? 0;
              for (const prior of ctx.snapshot.captures)
                if (prior.state === 'RESERVED')
                  reserved += Math.max(
                    0,
                    maximum(prior.kind) -
                      ((inv?.files.get(prior.relative_name)?.size ?? 0) +
                        (inv?.files.get(prior.relative_name + '.part')?.size ?? 0)),
                  );
              if (reserved + maximum(row.kind) > TOTAL) reject('LIMIT_EXCEEDED');
              await this.createRoot(
                () => {
                  dirty = true;
                },
                () => lane.assertCurrent(this.owned),
              );
              return id;
            },
            delta: () => ({
              ...delta(ctx, 'CAPTURE'),
              captures: { insert: [row], transition: [] },
            }),
          };
        },
        () => {
          this.owned();
          if (display) {
            const c = this.current(display.deviceId);
            if (
              classifyCaptureEvidence(display, c.display, this.clock(), c.connected) !== 'CURRENT'
            )
              reject('STALE_CAPTURE');
          }
        },
      ),
    );
  }
  complete(
    expectedRevision: number,
    evidenceId: unknown,
    input: unknown,
  ): Promise<
    | DurableStepResult<
        Readonly<{
          evidenceId: string;
          kind: DurableCapture['kind'];
          capturedUtc: number;
          sha256: string;
          bytes: number;
        }>
      >
    | DurableDenied
  > {
    const copy = bytes(input, 16777216);
    return this.lane(async (lane) => {
      const result = await lane.step<CaptureReceipt>(
        'CAPTURE_COMMIT',
        expectedRevision,
        (ctx) => {
          if (!uuid(evidenceId) || !copy) reject('INVALID_REQUEST');
          const row = find(ctx.snapshot, evidenceId);
          if (row.state !== 'RESERVED') reject('RECOVERY_REQUIRED');
          let stale = this.freshness(row, ctx.snapshot) !== 'CURRENT';
          let dirty = false;
          if (copy.length > maximum(row.kind) || !valid(copy, row, ctx.snapshot))
            reject('INVALID_CAPTURE');
          return {
            mutationStarted: () => dirty,
            effect: async () => {
              const inv = await this.scan(ctx.snapshot);
              if (
                !inv ||
                inv.files.has(row.relative_name) ||
                inv.files.has(row.relative_name + '.part')
              )
                reject('RECOVERY_REQUIRED');
              if (inv.total + copy.length > TOTAL) reject('LIMIT_EXCEEDED');
              const part = join(this.root, row.relative_name + '.part'),
                final = join(this.root, row.relative_name);
              await writeNew(
                part,
                copy,
                () => lane.assertCurrent(this.owned),
                () => {
                  dirty = true;
                },
              );
              const reread = await readFile(part, maximum(row.kind));
              if (!valid(reread, row, ctx.snapshot) || sha(reread) !== sha(copy))
                reject('INVALID_CAPTURE');
              lane.assertCurrent(this.owned);
              stale ||= this.freshness(row, lane.read()) !== 'CURRENT';
              lane.assertCurrent(this.owned);
              await link(part, final);
              const a = await lstat(part),
                b = await lstat(final);
              if (
                !same(a, b) ||
                a.nlink !== 2 ||
                b.nlink !== 2 ||
                a.isSymbolicLink() ||
                b.isSymbolicLink()
              )
                reject('RECOVERY_REQUIRED');
              if (sha(await readFile(final, maximum(row.kind), 2)) !== sha(copy))
                reject('INVALID_CAPTURE');
              lane.assertCurrent(this.owned);
              await unlink(part);
              const stored = await readFile(final, maximum(row.kind));
              if (sha(stored) !== sha(copy) || !valid(stored, row, ctx.snapshot))
                reject('INVALID_CAPTURE');
              return Object.freeze({
                evidenceId: row.evidence_id,
                kind: row.kind,
                capturedUtc: row.captured_utc,
                sha256: sha(stored),
                bytes: stored.length,
              });
            },
            delta: (effect, current) => {
              if (!effect) reject('STORAGE_FAILED');
              const fresh = stale ? 'STALE' : this.freshness(row, current);
              return {
                ...delta(ctx, 'CAPTURE'),
                captures: {
                  insert: [],
                  transition: [
                    {
                      evidenceId: row.evidence_id,
                      expectedState: 'RESERVED',
                      state: fresh === 'CURRENT' ? 'VALIDATED' : 'STALE',
                      sha256: effect.sha256,
                      bytes: effect.bytes,
                    },
                  ],
                },
              };
            },
          };
        },
        this.owned,
      );
      if (result.ok) {
        try {
          lane.assertCurrent(this.owned);
        } catch {
          return { ...result, value: undefined };
        }
      }
      return result;
    });
  }
  async read(evidenceId: unknown, allowStale = false): Promise<CaptureRead> {
    if (!uuid(evidenceId) || typeof allowStale !== 'boolean')
      return { ok: false, outcome: 'NOT_OBSERVED', code: 'INVALID_REQUEST' };
    const result = await this.lane(async (lane) => {
      try {
        lane.assertCurrent(this.owned);
        const snapshot = lane.read(),
          row = snapshot.captures.find((r) => r.evidence_id === evidenceId);
        if (!row || row.state === 'DELETED')
          return { ok: false, outcome: 'NOT_OBSERVED', code: 'NOT_FOUND' } as CaptureRead;
        if (
          !['VALIDATED', 'STALE'].includes(row.state) ||
          row.sha256 === null ||
          row.bytes === null
        )
          reject('RECOVERY_REQUIRED');
        const inv = await this.scan(snapshot);
        if (!inv || inv.files.has(row.relative_name + '.part')) reject('RECOVERY_REQUIRED');
        const data = await readFile(join(this.root, row.relative_name), maximum(row.kind));
        if (data.length !== row.bytes || sha(data) !== row.sha256 || !valid(data, row, snapshot))
          reject('INVALID_CAPTURE');
        lane.assertCurrent(this.owned);
        const freshness = row.state === 'STALE' ? 'STALE' : this.freshness(row, lane.read());
        if (!allowStale && freshness !== 'CURRENT') reject('STALE_CAPTURE');
        lane.assertCurrent(this.owned);
        return {
          ok: true,
          outcome: 'OBSERVED',
          artifact: Object.freeze({
            evidenceId: row.evidence_id,
            kind: row.kind,
            sha256: row.sha256,
            bytes: row.bytes,
            capturedUtc: row.captured_utc,
            freshness,
          }),
          data: new Uint8Array(data),
        } as CaptureRead;
      } catch (error) {
        const code =
          error instanceof DurableFault &&
          [
            'OWNER_REVOKED',
            'INVALID_CAPTURE',
            'STALE_CAPTURE',
            'RECOVERY_REQUIRED',
            'INVALID_REQUEST',
          ].includes(error.code)
            ? error.code
            : 'STORAGE_FAILED';
        return { ok: false, outcome: 'NOT_OBSERVED', code } as CaptureRead;
      }
    });
    if ('outcome' in result && result.outcome === 'NOT_COMMITTED')
      return {
        ok: false,
        outcome: 'NOT_OBSERVED',
        code: result.code === 'OWNER_REVOKED' ? 'OWNER_REVOKED' : 'RECOVERY_REQUIRED',
      };
    return result as CaptureRead;
  }
  addHold(
    expectedRevision: number,
    evidenceId: unknown,
    reason: unknown,
  ): Promise<DurableStepResult<string> | DurableDenied> {
    return this.lane(async (lane) =>
      lane.step(
        'HOLD_ADD',
        expectedRevision,
        (ctx) => {
          if (
            !uuid(evidenceId) ||
            !['OUTCOME_UNKNOWN', 'RECONCILIATION'].includes(reason as string)
          )
            reject('INVALID_REQUEST');
          const row = find(ctx.snapshot, evidenceId);
          if (['DELETE_PENDING', 'DELETED'].includes(row.state)) reject('RECOVERY_REQUIRED');
          if (ctx.snapshot.holds.length >= 4096) reject('LIMIT_EXCEEDED');
          const id = this.nextId();
          const ids = [
            ctx.operationId,
            ctx.diagnosticId,
            ...ctx.snapshot.devices.map((r) => r.device_id),
            ...ctx.snapshot.bindings.map((r) => r.binding_id),
            ...ctx.snapshot.identityEvidence.map((r) => r.evidence_id),
            ...ctx.snapshot.captures.flatMap((r) => [r.evidence_id, r.display_evidence_id]),
            ...ctx.snapshot.holds.map((r) => r.hold_id),
          ];
          if (!uuid(id) || ids.includes(id)) reject('LIMIT_EXCEEDED');
          return {
            effect: async () => id,
            delta: () => ({
              ...delta(ctx, 'HOLD'),
              holds: {
                insert: [
                  {
                    hold_id: id,
                    evidence_id: evidenceId,
                    reason: reason as 'OUTCOME_UNKNOWN' | 'RECONCILIATION',
                  },
                ],
                releaseIds: [],
              },
            }),
          };
        },
        this.owned,
      ),
    );
  }
  releaseHold(
    expectedRevision: number,
    holdId: unknown,
    disposition: unknown,
  ): Promise<DurableStepResult<never> | DurableDenied> {
    return this.lane(async (lane) =>
      lane.step<never>(
        'HOLD_RELEASE',
        expectedRevision,
        (ctx) => {
          if (
            !uuid(holdId) ||
            disposition !== 'RECONCILED' ||
            !ctx.snapshot.holds.some((h) => h.hold_id === holdId)
          )
            reject('INVALID_REQUEST');
          return {
            delta: () => ({ ...delta(ctx, 'HOLD'), holds: { insert: [], releaseIds: [holdId] } }),
          };
        },
        this.owned,
      ),
    );
  }
  prune(
    expectedRevision: number,
    evidenceId: unknown,
  ): Promise<DurableStepResult<never> | DurableDenied> {
    return this.lane(async (lane) => {
      if (!uuid(evidenceId))
        return lane.step<never>('PRUNE_MARK', expectedRevision, () => reject('INVALID_REQUEST'));
      const check = (snapshot: DurableSnapshot) => {
        const row = find(snapshot, evidenceId),
          now = this.clock();
        if (now < this.lastPruneUtc) reject('STALE_CAPTURE');
        this.lastPruneUtc = now;
        if (now < row.expires_utc || snapshot.holds.some((h) => h.evidence_id === evidenceId))
          reject('STALE_CAPTURE');
        if (
          !['VALIDATED', 'STALE', 'DELETE_PENDING'].includes(row.state) ||
          row.sha256 === null ||
          row.bytes === null
        )
          reject('RECOVERY_REQUIRED');
        return row;
      };
      let snapshot = lane.read(),
        row = check(snapshot),
        revision = expectedRevision;
      if (row.state !== 'DELETE_PENDING') {
        const marked = await lane.step<never>(
          'PRUNE_MARK',
          revision,
          (ctx) => {
            const current = check(ctx.snapshot);
            return {
              effect: async () => {
                const inv = await this.scan(ctx.snapshot);
                if (!inv || inv.files.has(current.relative_name + '.part'))
                  reject('RECOVERY_REQUIRED');
                const data = await readFile(
                  join(this.root, current.relative_name),
                  maximum(current.kind),
                );
                if (data.length !== current.bytes || sha(data) !== current.sha256)
                  reject('RECOVERY_REQUIRED');
                return undefined as never;
              },
              delta: () => ({
                ...delta(ctx, 'PRUNE'),
                captures: {
                  insert: [],
                  transition: [
                    {
                      evidenceId,
                      expectedState: current.state,
                      state: 'DELETE_PENDING',
                      sha256: current.sha256,
                      bytes: current.bytes,
                    },
                  ],
                },
              }),
            };
          },
          this.owned,
        );
        if (!marked.ok) return marked;
        revision = marked.result.revision;
      }
      snapshot = lane.read();
      row = check(snapshot);
      return lane.step<never>(
        'PRUNE_COMPLETE',
        revision,
        (ctx) => {
          const current = check(ctx.snapshot);
          let dirty = false;
          return {
            mutationStarted: () => dirty,
            effect: async () => {
              const inv = await this.scan(ctx.snapshot);
              if (!inv || inv.files.has(current.relative_name + '.part'))
                reject('RECOVERY_REQUIRED');
              if (inv.files.has(current.relative_name)) {
                const file = join(this.root, current.relative_name),
                  data = await readFile(file, maximum(current.kind));
                if (data.length !== current.bytes || sha(data) !== current.sha256)
                  reject('RECOVERY_REQUIRED');
                lane.assertCurrent(this.owned);
                check(lane.read());
                lane.assertCurrent(this.owned);
                dirty = true;
                await unlink(file);
                try {
                  await lstat(file);
                  reject('RECOVERY_REQUIRED');
                } catch (error) {
                  if (
                    !(error instanceof Error) ||
                    Object.getOwnPropertyDescriptor(error, 'code')?.value !== 'ENOENT'
                  )
                    throw error;
                }
              }
              return undefined as never;
            },
            delta: () => ({
              ...delta(ctx, 'PRUNE'),
              captures: {
                insert: [],
                transition: [
                  {
                    evidenceId,
                    expectedState: 'DELETE_PENDING',
                    state: 'DELETED',
                    sha256: current.sha256,
                    bytes: current.bytes,
                  },
                ],
              },
            }),
          };
        },
        this.owned,
      );
    });
  }
  recover(expectedRevision: number): Promise<DurableStepResult<readonly string[]> | DurableDenied> {
    return this.lane(async (lane) => {
      const pending: string[] = [];
      const result = await lane.step(
        'RECOVER_CLASSIFY',
        expectedRevision,
        (ctx) => {
          const transitions: DurableDelta['captures']['transition'][number][] = [];
          return {
            effect: async () => {
              const inv = await this.scan(ctx.snapshot, true, true);
              for (const row of ctx.snapshot.captures) {
                if (row.state === 'DELETED') {
                  if (
                    inv?.files.has(row.relative_name) ||
                    inv?.files.has(row.relative_name + '.part')
                  )
                    reject('RECOVERY_REQUIRED');
                  continue;
                }
                let state: DurableCapture['state'] = row.state;
                const final = inv?.files.get(row.relative_name),
                  part = inv?.files.get(row.relative_name + '.part');
                if (row.state === 'RESERVED' || part || final?.links === 2) state = 'UNCERTAIN';
                else if (!final)
                  state =
                    row.state === 'DELETE_PENDING' &&
                    ctx.utc >= row.expires_utc &&
                    !ctx.snapshot.holds.some((h) => h.evidence_id === row.evidence_id)
                      ? 'DELETED'
                      : 'UNCERTAIN';
                else if (row.sha256 !== null && row.bytes !== null) {
                  try {
                    const data = await readFile(
                      join(this.root, row.relative_name),
                      maximum(row.kind),
                    );
                    if (
                      data.length !== row.bytes ||
                      sha(data) !== row.sha256 ||
                      !valid(data, row, ctx.snapshot)
                    )
                      state = 'UNCERTAIN';
                  } catch {
                    state = 'UNCERTAIN';
                  }
                } else state = 'UNCERTAIN';
                if (state === 'DELETED') {
                  pending.push(row.evidence_id);
                  continue;
                }
                if (state !== row.state)
                  transitions.push({
                    evidenceId: row.evidence_id,
                    expectedState: row.state,
                    state,
                    sha256: row.sha256,
                    bytes: row.bytes,
                  });
              }
              return Object.freeze(transitions.map((t) => t.evidenceId));
            },
            delta: () => ({
              ...delta(ctx, 'CAPTURE'),
              captures: { insert: [], transition: transitions },
            }),
          };
        },
        this.owned,
      );
      if (!result.ok) return result;
      let last = result;
      for (const evidenceId of pending) {
        const completed = await lane.step<readonly string[]>(
          'PRUNE_COMPLETE',
          last.result.revision,
          (ctx) => {
            const row = find(ctx.snapshot, evidenceId);
            if (
              row.state !== 'DELETE_PENDING' ||
              ctx.utc < row.expires_utc ||
              ctx.snapshot.holds.some((h) => h.evidence_id === evidenceId)
            )
              reject('RECOVERY_REQUIRED');
            return {
              effect: async () => {
                const inv = await this.scan(ctx.snapshot, true);
                if (
                  inv?.files.has(row.relative_name) ||
                  inv?.files.has(row.relative_name + '.part')
                )
                  reject('RECOVERY_REQUIRED');
                return Object.freeze([...(last.value ?? []), evidenceId]);
              },
              delta: () => ({
                ...delta(ctx, 'PRUNE'),
                captures: {
                  insert: [],
                  transition: [
                    {
                      evidenceId,
                      expectedState: 'DELETE_PENDING',
                      state: 'DELETED',
                      sha256: row.sha256,
                      bytes: row.bytes,
                    },
                  ],
                },
              }),
            };
          },
          this.owned,
        );
        if (!completed.ok) return completed;
        last = completed;
      }
      return last;
    });
  }
}
