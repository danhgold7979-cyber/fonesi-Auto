import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import { encodeLogRecord, diagnosticId, utcTimestamp } from '../log-contract.ts';
import type { LogRecord, LogHealth, LogCode } from '../log-contract.ts';
import {
  segmentFilename,
  metadataFilename,
  verifySegment,
  SEGMENT_BYTES,
} from '../log-store-schema.ts';
import type { SegmentMetadata } from '../log-store-schema.ts';
import { OwnedLogFiles, readLogFile, logInventory } from './log-files.ts';
import type { LogLocation } from './log-files.ts';
export type QueueResult = 'QUEUED' | 'DROPPED' | 'FAILED';
export type HoldResult = 'PERSISTED' | 'FAILED' | 'UNCERTAIN' | 'MISSING_SEGMENT';
export type WriterState = 'QUEUED' | 'WRITTEN' | 'FLUSHED' | 'DROPPED' | 'FAILED';
type Active = { handle: FileHandle; metadata: SegmentMetadata; bytes: number; day: string };
// Injection is main/test-owned only; never renderer supplied. ENOSPC tests do not fill disks.
export type StoreFault = (
  operation: 'append' | 'sync' | 'metadata' | 'hold' | 'prune' | 'release',
) => void | Promise<void>;
export class LogStore {
  private readonly files: OwnedLogFiles;
  private readonly fault: StoreFault;
  private queue: { record: LogRecord; encoded: string }[] = [];
  private active: Active | undefined;
  private tail: Promise<void> = Promise.resolve();
  private draining = false;
  private closed = false;
  private closePromise: Promise<'FLUSHED' | 'FAILED'> | undefined;
  private cleanupDisabled = false;
  private currentHealth: LogHealth = 'AVAILABLE';
  private state: WriterState = 'FLUSHED';
  private issue: LogCode | null = null;
  get failureCode(): LogCode | null {
    return this.issue;
  }
  get recovered(): boolean {
    return this.hasRecovery;
  }
  private lastSequence = 0;
  private runId: string | undefined;
  private retentionUtc: string | null = null;
  private holds = new Set<string>();
  private readonly preserved = new Set<string>();
  private hasRecovery = false;
  private readonly preservedPending = new Set<string>();
  private constructor(files: OwnedLogFiles, fault: StoreFault) {
    this.files = files;
    this.fault = fault;
  }
  static async open(
    location: LogLocation,
    now: string,
    fault: StoreFault = () => {},
  ): Promise<LogStore> {
    if (!utcTimestamp(now)) throw new Error('LOG_TIME_REJECTED');
    const files = await OwnedLogFiles.acquire(location),
      store = new LogStore(files, fault);
    const hold = await files.document('holds.json', 'holds'),
      state = await files.document('state.json', 'state');
    store.holds = new Set(hold.segmentIds as string[]);
    store.retentionUtc = state.lastRetentionUtc as string | null;
    const names = await logInventory(files.root);
    for (const name of names) {
      if (name.startsWith('pending-')) continue;
      if (name.startsWith('recovery-')) {
        const receipt = await files.document(name, 'recovery');
        store.hasRecovery = true;
        for (const id of receipt.segmentIds as string[]) store.preserved.add(id);
        for (const id of receipt.pendingIds as string[]) store.preservedPending.add(id);
      }
    }
    for (const name of names)
      if (name.startsWith('pending-') && !store.preservedPending.has(name.slice(8, 44)))
        throw new Error('LOG_RECOVERY_REQUIRED');
    await store.validateSegments(names);
    await store.prune(now);
    return store;
  }
  get health(): LogHealth {
    return this.currentHealth;
  }
  get writerState(): WriterState {
    return this.state;
  }
  get storeId(): string {
    return this.files.storeId;
  }
  get ownerToken(): string {
    return this.files.ownerToken;
  }
  get pending(): number {
    return this.queue.length;
  }
  private fail(code: LogCode = 'WRITE_FAILED'): void {
    this.issue ??= code;
    this.currentHealth = 'DEGRADED';
    this.cleanupDisabled = true;
    this.state = 'FAILED';
    this.queue = [];
  }
  private lane<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private async validateSegments(names: string[]): Promise<void> {
    for (const name of names) {
      if (!name.startsWith('segment-')) continue;
      const id = name.slice(8, 44);
      if (this.preserved.has(id)) continue;
      if (
        !diagnosticId(id) ||
        !names.includes(segmentFilename(id)) ||
        !names.includes(metadataFilename(id))
      )
        throw new Error('LOG_SEGMENT_INCOMPLETE');
      if (name.endsWith('.meta.json')) {
        const metadata = (await this.files.document(name, 'segment')) as SegmentMetadata;
        if (
          metadata.segmentId !== id ||
          !metadata.finalized ||
          !verifySegment(
            await readLogFile(join(this.files.root, segmentFilename(id)), SEGMENT_BYTES),
            metadata,
          )
        )
          throw new Error('LOG_SEGMENT_INVALID');
      }
    }
    for (const id of this.holds)
      if (!names.includes(segmentFilename(id))) throw new Error('LOG_HOLD_MISSING');
  }
  enqueue(record: LogRecord): QueueResult {
    if (this.closed || this.currentHealth === 'DEGRADED') return 'FAILED';
    const encoded = encodeLogRecord(record);
    if (
      encoded === null ||
      record.sequence <= this.lastSequence ||
      (this.runId !== undefined && record.runId !== this.runId)
    ) {
      this.fail();
      return 'FAILED';
    }
    this.lastSequence = record.sequence;
    this.runId = record.runId;
    if (this.queue.length >= 256) {
      this.issue ??= 'QUEUE_FULL';
      this.currentHealth = 'DEGRADED';
      this.cleanupDisabled = true;
      this.state = 'DROPPED';
      return 'DROPPED';
    }
    this.queue.push({ record: JSON.parse(encoded) as LogRecord, encoded });
    this.state = 'QUEUED';
    this.scheduleDrain();
    return 'QUEUED';
  }
  private scheduleDrain(): void {
    if (this.draining || this.closed || this.queue.length === 0) return;
    this.draining = true;
    void this.lane(() => this.drain()).finally(() => {
      this.draining = false;
      // An enqueue can arrive after drain empties but before this completion.
      if (!this.cleanupDisabled) this.scheduleDrain();
    });
  }
  private async finalize(): Promise<void> {
    const active = this.active;
    if (!active) return;
    let handleClosed = false;
    try {
      await this.fault('sync');
      await active.handle.sync();
      await active.handle.close();
      handleClosed = true;
      const metadata = { ...active.metadata, finalized: true };
      await this.fault('metadata');
      await this.files.replace(metadataFilename(metadata.segmentId), 'segment', metadata);
      this.active = undefined;
    } catch {
      if (!handleClosed) {
        try {
          await active.handle.close();
          handleClosed = true;
        } catch {
          /* Owned handle remains uncertain; lock is retained. */
        }
      }
      if (handleClosed) this.active = undefined;
      throw new Error('LOG_FINALIZE_FAILED');
    }
  }
  private async disposeActive(): Promise<void> {
    const active = this.active;
    if (active) {
      try {
        await active.handle.close();
        this.active = undefined;
      } catch {
        this.fail();
      }
    }
  }
  abandon(): void {
    this.closed = true;
    this.fail('FLUSH_FAILED');
  }

  private async append(record: LogRecord, encoded: string): Promise<void> {
    const bytes = Buffer.byteLength(encoded),
      day = record.utc.slice(0, 10);
    if (this.active && (this.active.bytes + bytes > SEGMENT_BYTES || this.active.day !== day)) {
      const changedDay = this.active.day !== day;
      await this.finalize();
      if (changedDay) {
        await this.pruneInside(record.utc);
        if (this.cleanupDisabled) throw new Error('LOG_RETENTION_BLOCKED');
      }
    }
    if (!this.active) {
      const id = randomUUID(),
        metadata: SegmentMetadata = {
          schemaVersion: 1,
          segmentId: id,
          storeId: this.files.storeId,
          runId: record.runId,
          firstSequence: record.sequence,
          lastSequence: record.sequence,
          maxUtc: record.utc,
          finalized: false,
        };
      const handle = await this.files.createSegment(segmentFilename(id));
      this.active = { handle, metadata, bytes: 0, day };
      await this.files.replace(metadataFilename(id), 'segment', metadata);
    }
    await this.fault('append');
    await this.files.verify();
    await this.active.handle.writeFile(encoded, 'utf8');
    this.active.bytes += bytes;
    let maxUtc = this.active.metadata.maxUtc;
    if (record.utc > maxUtc) maxUtc = record.utc;
    this.active.metadata = {
      ...this.active.metadata,
      lastSequence: record.sequence,
      maxUtc,
    };
    this.state = 'WRITTEN';
  }
  private async drain(): Promise<void> {
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, 16);
        for (const item of batch) await this.append(item.record, item.encoded);
        if (this.queue.length) await setImmediate();
      }
    } catch {
      this.fail();
    }
  }
  async flush(): Promise<'FLUSHED' | 'FAILED'> {
    return this.lane(async () => {
      await this.drain();
      if (this.currentHealth === 'DEGRADED') return 'FAILED';
      try {
        await this.finalize();
        this.state = 'FLUSHED';
        return 'FLUSHED';
      } catch {
        this.fail('FLUSH_FAILED');
        return 'FAILED';
      }
    });
  }
  async hold(segmentId: string): Promise<HoldResult> {
    return this.lane(async () => {
      if (this.closed || this.cleanupDisabled || !diagnosticId(segmentId)) return 'FAILED';
      try {
        const names = await logInventory(this.files.root);
        if (!names.includes(segmentFilename(segmentId))) return 'MISSING_SEGMENT';
        const next = new Set(this.holds);
        next.add(segmentId);
        await this.fault('hold');
        await this.files.replace('holds.json', 'holds', {
          schemaVersion: 1,
          storeId: this.files.storeId,
          segmentIds: [...next],
        });
        this.holds = next;
        return 'PERSISTED';
      } catch {
        this.fail('HOLDS_UNAVAILABLE');
        return 'UNCERTAIN';
      }
    });
  }
  async prune(now: string): Promise<'PRUNED' | 'PRESERVED'> {
    return this.lane(() => this.pruneInside(now));
  }
  private async pruneInside(now: string): Promise<'PRUNED' | 'PRESERVED'> {
    if (this.closed || this.cleanupDisabled || !utcTimestamp(now)) return 'PRESERVED';
    if (this.retentionUtc !== null && now < this.retentionUtc) {
      this.issue ??= 'CLOCK_REGRESSION';
      this.currentHealth = 'DEGRADED';
      this.cleanupDisabled = true;
      return 'PRESERVED';
    }
    try {
      const names = await logInventory(this.files.root);
      const persisted = await this.files.document('holds.json', 'holds');
      const diskHolds = new Set(persisted.segmentIds as string[]);
      if (diskHolds.size !== this.holds.size || [...this.holds].some((id) => !diskHolds.has(id)))
        throw new Error('LOG_HOLDS_CHANGED');
      const cutoff = Date.parse(now) - 30 * 24 * 60 * 60 * 1000;
      const candidates: SegmentMetadata[] = [];
      for (const name of names) {
        if (name.startsWith('pending-') && !this.preservedPending.has(name.slice(8, 44)))
          throw new Error('LOG_RECOVERY_REQUIRED');
        if (
          !name.startsWith('segment-') ||
          !name.endsWith('.meta.json') ||
          this.preserved.has(name.slice(8, 44))
        )
          continue;
        const metadata = (await this.files.document(name, 'segment')) as SegmentMetadata;
        if (metadata.segmentId !== name.slice(8, 44)) throw new Error('LOG_SEGMENT_INVALID');
        if (this.active?.metadata.segmentId === metadata.segmentId) continue;
        if (
          !metadata.finalized ||
          !names.includes(segmentFilename(metadata.segmentId)) ||
          !verifySegment(
            await readLogFile(
              join(this.files.root, segmentFilename(metadata.segmentId)),
              SEGMENT_BYTES,
            ),
            metadata,
          )
        )
          throw new Error('LOG_SEGMENT_INVALID');
        if (
          Date.parse(metadata.maxUtc) < cutoff &&
          !this.holds.has(metadata.segmentId) &&
          !this.preserved.has(metadata.segmentId)
        )
          candidates.push(metadata);
      }
      for (const metadata of candidates) {
        // Same ownership lane as hold(); recheck persisted holds before each deletion.
        const current = await this.files.document('holds.json', 'holds');
        if ((current.segmentIds as string[]).includes(metadata.segmentId)) continue;
        await this.fault('prune');
        await this.files.remove(segmentFilename(metadata.segmentId));
        await this.files.remove(metadataFilename(metadata.segmentId));
      }
      await this.files.replace('state.json', 'state', {
        schemaVersion: 1,
        storeId: this.files.storeId,
        lastRetentionUtc: now,
      });
      this.retentionUtc = now;
      return 'PRUNED';
    } catch {
      this.fail('RETENTION_FAILED');
      return 'PRESERVED';
    }
  }
  close(): Promise<'FLUSHED' | 'FAILED'> {
    if (this.closePromise) return this.closePromise;
    if (this.closed) return Promise.resolve('FAILED');
    this.closed = true;
    this.closePromise = this.lane(async () => {
      await this.drain();
      try {
        if (this.cleanupDisabled) {
          await this.disposeActive();
          return 'FAILED';
        }
        await this.finalize();
        if (this.cleanupDisabled) return 'FAILED';
        await this.files.release(
          async (step) => {
            if (step === 'receipt') await this.fault('release');
          },
          () => !this.cleanupDisabled,
        );
        if (this.cleanupDisabled) return 'FAILED';
        this.state = 'FLUSHED';
        return 'FLUSHED';
      } catch {
        this.fail('FLUSH_FAILED');
        await this.disposeActive();
        return 'FAILED';
      }
    });
    return this.closePromise;
  }
}
