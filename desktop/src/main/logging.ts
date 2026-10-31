import { randomUUID } from 'node:crypto';
import { LogStore } from './log-store.ts';
import type { LogLocation } from './log-files.ts';
import { diagnosticId } from '../log-contract.ts';
import type { LogCode, LogEvent, LogHealth, LogRecord } from '../log-contract.ts';
export type LogClock = () => string;
export type LogNotice = (marker: 'LOGGING_DEGRADED') => void;
// Main-owned only. Caller content, request IDs and native errors never enter emit().
export class ApplicationLogger {
  private readonly store: LogStore | undefined;
  private readonly clock: LogClock;
  private readonly notice: LogNotice;
  private readonly uuid: () => string;
  private readonly runId: string | null;
  private sequence = 0;
  private broken = false;
  private noticed = false;
  private denialRecorded = false;
  private regressionRecorded = false;
  private lastUtc: string | null = null;
  private closing: Promise<'FLUSHED' | 'FAILED'> | undefined;
  constructor(
    store: LogStore | undefined,
    clock: LogClock = () => new Date().toISOString(),
    notice: LogNotice = () => {},
    uuid: () => string = randomUUID,
  ) {
    this.store = store;
    this.clock = clock;
    this.notice = notice;
    this.uuid = uuid;
    try {
      const id = uuid();
      if (!diagnosticId(id)) throw new Error('LOG_ID_REJECTED');
      this.runId = id;
    } catch {
      this.runId = null;
      this.broken = true;
    }
    if (!store) this.broken = true;
  }
  static async open(
    location: LogLocation | undefined,
    notice: LogNotice,
  ): Promise<ApplicationLogger> {
    let store: LogStore | undefined;
    try {
      if (location) store = await LogStore.open(location, new Date().toISOString());
    } catch {
      /* Fixed health only; never native message. */
    }
    const logger = new ApplicationLogger(store, undefined, notice);
    logger.reportHealth();
    if (store?.health === 'AVAILABLE') {
      if (store.recovered) logger.emit('LOGGING_RECOVERED', 'RECOVERED');
      logger.emit('RETENTION_RESULT', 'OK');
    }
    return logger;
  }
  get health(): LogHealth {
    return this.broken || !this.store || this.store.health === 'DEGRADED'
      ? 'DEGRADED'
      : 'AVAILABLE';
  }
  private reportHealth(): void {
    if (this.health === 'DEGRADED' && !this.noticed) {
      this.noticed = true;
      try {
        this.notice('LOGGING_DEGRADED');
      } catch {
        /* No recursive fallback. */
      }
    }
  }
  newDiagnostic(): string | null {
    try {
      const id = this.uuid();
      if (!diagnosticId(id)) throw new Error('LOG_ID_REJECTED');
      return id;
    } catch {
      this.broken = true;
      this.reportHealth();
      return null;
    }
  }
  emit(event: LogEvent, code: LogCode, reference: string | null = null): void {
    try {
      if (!this.store || this.runId === null || !Number.isSafeInteger(this.sequence + 1)) {
        this.broken = true;
        this.reportHealth();
        return;
      }
      const utc = this.clock();
      if (this.lastUtc !== null && utc < this.lastUtc && !this.regressionRecorded) {
        this.regressionRecorded = true;
        this.emit('LOGGING_DEGRADED', 'CLOCK_REGRESSION');
      }
      this.lastUtc = utc;
      const component =
        event === 'BRIDGE_RESULT'
          ? 'PRELOAD_BOUNDARY'
          : ['STARTUP_READY', 'STARTUP_FAILED', 'SHUTDOWN', 'RENDERER_LOST'].includes(event)
            ? 'MAIN'
            : 'LOGGING';
      const severity =
        event === 'BRIDGE_RESULT'
          ? code === 'OK'
            ? 'INFO'
            : code === 'INTERNAL_FAILURE'
              ? 'ERROR'
              : 'WARN'
          : event === 'RETENTION_RESULT'
            ? code === 'OK'
              ? 'INFO'
              : 'WARN'
            : event === 'LOGGING_DEGRADED'
              ? code === 'CLOCK_REGRESSION'
                ? 'WARN'
                : 'ERROR'
              : ['STARTUP_FAILED', 'RENDERER_LOST'].includes(event) || code === 'FLUSH_FAILED'
                ? 'ERROR'
                : 'INFO';
      const record: LogRecord = {
        schemaVersion: 1,
        runId: this.runId,
        sequence: ++this.sequence,
        utc,
        severity,
        component,
        task: 'P1-04',
        event,
        diagnosticId: reference,
        code,
      };
      if (this.store.enqueue(record) !== 'QUEUED') this.broken = true;
      this.reportHealth();
    } catch {
      this.broken = true;
      this.reportHealth();
    }
  }
  outcome(code: LogCode, reference: string | null): void {
    if (reference === null) {
      if (this.denialRecorded) return;
      this.denialRecorded = true;
    }
    this.emit('BRIDGE_RESULT', code, reference);
  }
  close(): Promise<'FLUSHED' | 'FAILED'> {
    if (this.closing) return this.closing;
    this.emit('SHUTDOWN', 'OK');
    this.closing = new Promise((resolve) => {
      if (!this.store) {
        this.broken = true;
        this.reportHealth();
        resolve('FAILED');
        return;
      }
      let completed = false;
      const deadline = setTimeout(() => {
        if (completed) return;
        completed = true;
        this.store?.abandon();
        this.broken = true;
        this.reportHealth();
        resolve('FAILED');
      }, 5000);
      this.store.close().then(
        (result) => {
          if (completed) return;
          completed = true;
          clearTimeout(deadline);
          if (result !== 'FLUSHED') this.broken = true;
          this.reportHealth();
          resolve(result);
        },
        () => {
          if (completed) return;
          completed = true;
          clearTimeout(deadline);
          this.broken = true;
          this.reportHealth();
          resolve('FAILED');
        },
      );
    });
    return this.closing;
  }
}
