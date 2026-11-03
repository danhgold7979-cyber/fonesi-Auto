import { randomUUID } from 'node:crypto';
import { createDeviceDiagnosticCollector } from './device-diagnostic-collector.ts';
import { createDeviceDiagnosticExporter } from './device-diagnostic-export.ts';
import type { DeviceDiagnosticInput } from './device-diagnostics.ts';
import {
  parseDiagnosticsExportRequest,
  diagnosticsExportError,
  diagnosticsExportSuccess,
  diagnosticExportId,
  type DiagnosticsExportSnapshot,
} from '../diagnostics-report-contract.ts';

export const DIAGNOSTICS_MUTATION_LIMIT = 1024;

export function createDiagnosticsExportService(
  options: Readonly<{
    chooseDirectory(): Promise<string | null>;
    current(): boolean;
  }>,
) {
  const collector = createDeviceDiagnosticCollector(),
    exporter = createDeviceDiagnosticExporter(collector);
  const choose = options.chooseDirectory.bind(options),
    owned = options.current.bind(options);
  const mutations = new Map<string, Readonly<{ canonical: string; response: string }>>();
  let closed = false,
    entering = false,
    cleanupFailed = false;
  let state: DiagnosticsExportSnapshot = Object.freeze({
    revision: 0,
    state: 'IDLE',
    operationId: null,
    records: 0,
    dropped: 0,
    bytes: 0,
    sha256: null,
    code: null,
  });
  let active: {
    id: string;
    abort: AbortController;
    current: () => boolean;
    fileWork: Promise<void> | null;
  } | null = null;
  const isCurrent = (operation: () => boolean) => {
    try {
      return !closed && owned() === true && operation() === true && !closed;
    } catch {
      return false;
    }
  };
  const terminal = (
    op: NonNullable<typeof active>,
    result: Awaited<ReturnType<typeof exporter.export>>,
  ) => {
    if (!result.ok && result.code === 'CLEANUP_FAILED') cleanupFailed = true;
    if (active !== op) return;
    const counts = collector.snapshot();
    state = Object.freeze({
      revision: state.revision + 1,
      state: result.ok ? 'EXPORTED' : result.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
      operationId: op.id,
      records: result.ok ? result.records : counts.records.length,
      dropped: result.ok ? result.dropped : counts.dropped,
      bytes: result.ok ? result.bytes : counts.bytes,
      sha256: result.ok ? result.sha256 : null,
      code: result.ok ? null : result.code,
    });
    active = null;
  };
  const launch = async (op: NonNullable<typeof active>) => {
    try {
      if (!isCurrent(op.current)) {
        terminal(op, { ok: false, code: 'OWNER_REVOKED' });
        return;
      }
      if (op.abort.signal.aborted) {
        terminal(op, { ok: false, code: 'CANCELLED' });
        return;
      }
      const parent = await choose();
      if (!isCurrent(op.current)) {
        terminal(op, { ok: false, code: 'OWNER_REVOKED' });
        return;
      }
      if (op.abort.signal.aborted || parent === null) {
        terminal(op, { ok: false, code: 'CANCELLED' });
        return;
      }
      if (typeof parent !== 'string') {
        terminal(op, { ok: false, code: 'INVALID_REQUEST' });
        return;
      }
      // Set fileWork synchronously before yielding; close never misses started filesystem work.
      op.fileWork = exporter
        .export({ version: 1, exportId: op.id }, parent, op.abort.signal, () =>
          isCurrent(op.current),
        )
        .then(
          (result) => {
            terminal(op, result);
          },
          () => {
            terminal(op, { ok: false, code: 'IO_FAILED' });
          },
        );
      await op.fileWork;
    } catch {
      terminal(op, { ok: false, code: 'IO_FAILED' });
    }
  };
  return Object.freeze({
    observer(): (record: DeviceDiagnosticInput) => void {
      return (record) => {
        if (!closed) collector.append(record);
      };
    },
    execute(raw: unknown, operationCurrent: () => boolean): string {
      const request = parseDiagnosticsExportRequest(raw);
      if (!request) return diagnosticsExportError(null, 'INVALID_REQUEST');
      const fail = (code: Parameters<typeof diagnosticsExportError>[1]) =>
        diagnosticsExportError(request.requestId, code);
      if (entering) return fail('BUSY');
      entering = true;
      try {
        if (!isCurrent(operationCurrent)) return fail('SESSION_REVOKED');
        const canonical = JSON.stringify(request),
          prior = mutations.get(request.requestId);
        if (prior) return prior.canonical === canonical ? prior.response : fail('ID_CONFLICT');
        if (request.method === 'diagnostics.get') {
          const counts = collector.snapshot();
          const shown =
            state.state === 'IDLE'
              ? Object.freeze({
                  ...state,
                  records: counts.records.length,
                  dropped: counts.dropped,
                  bytes: counts.bytes,
                })
              : state;
          return diagnosticsExportSuccess(request.requestId, shown);
        }
        if (
          mutations.size >= DIAGNOSTICS_MUTATION_LIMIT ||
          state.revision > Number.MAX_SAFE_INTEGER - 3
        )
          return fail('LIMIT_EXCEEDED');
        const rememberFailure = (code: Parameters<typeof diagnosticsExportError>[1]) => {
          const response = fail(code);
          mutations.set(request.requestId, Object.freeze({ canonical, response }));
          return response;
        };
        let response: string;
        if (request.method === 'diagnostics.export') {
          if (active) return rememberFailure('BUSY');
          if (request.expectedRevision !== state.revision) return rememberFailure('STALE_REVISION');
          const id = randomUUID();
          if (!diagnosticExportId(id)) return rememberFailure('INTERNAL_FAILURE');
          const counts = collector.snapshot();
          const op = {
            id,
            abort: new AbortController(),
            current: operationCurrent,
            fileWork: null as Promise<void> | null,
          };
          active = op;
          state = Object.freeze({
            revision: state.revision + 1,
            state: 'PENDING',
            operationId: id,
            records: counts.records.length,
            dropped: counts.dropped,
            bytes: counts.bytes,
            sha256: null,
            code: null,
          });
          response = diagnosticsExportSuccess(request.requestId, state);
          mutations.set(request.requestId, Object.freeze({ canonical, response }));
          void Promise.resolve().then(() => launch(op));
        } else {
          if (!active || request.operationId !== active.id)
            return rememberFailure('STALE_REVISION');
          if (state.state !== 'CANCEL_PENDING')
            state = Object.freeze({
              ...state,
              revision: state.revision + 1,
              state: 'CANCEL_PENDING',
            });
          active.abort.abort();
          response = diagnosticsExportSuccess(request.requestId, state);
          mutations.set(request.requestId, Object.freeze({ canonical, response }));
        }
        return response;
      } catch {
        return fail('INTERNAL_FAILURE');
      } finally {
        entering = false;
      }
    },
    close(): Promise<boolean> {
      closed = true;
      collector.close();
      active?.abort.abort();
      // A revoked native picker cannot create files and need not hold shutdown open.
      return (active?.fileWork ?? Promise.resolve()).then(() => !cleanupFailed);
    },
  });
}
