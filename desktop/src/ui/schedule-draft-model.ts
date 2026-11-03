import {
  snapshotScheduleDraftInput,
  parseScheduleDraftResponse,
  type ScheduleDraftCode,
  type ScheduleDraftResponse,
} from '../schedule-draft-contract.ts';

export type ScheduleDraftPort = Readonly<{
  preview: (input: unknown) => Promise<string>;
  cancel: () => void;
}>;
type Slot = Readonly<{ id: string; time: string }>;
type Preview = Extract<ScheduleDraftResponse, { ok: true }>['preview'];
type RuleKind = 'ONCE' | 'WEEKDAYS' | 'EVERY_N_DAYS';
export type ScheduleDraftState = Readonly<{
  draftId: string;
  revision: number;
  posts: string;
  every: string;
  ruleKind: RuleKind;
  weekdays: readonly number[];
  endDate: string;
  maximum: string;
  startDate: string;
  throughDate: string;
  zone: string;
  slots: readonly Slot[];
  removal: Readonly<{ revision: number; count: number; slots: readonly Slot[] }> | null;
  pending: boolean;
  code: ScheduleDraftCode | null;
  result: Preview | null;
}>;
type Field = 'startDate' | 'throughDate' | 'zone' | 'every' | 'endDate' | 'maximum';
function integer(raw: string, maximum: number): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 && n <= maximum ? n : null;
}
/** Local unsaved input only. Cancellation fences delivery, not native work ownership. */
export function createScheduleDraftEditor(
  port: ScheduleDraftPort | undefined,
  createId: () => string = () => crypto.randomUUID(),
) {
  let state: ScheduleDraftState = Object.freeze({
    draftId: createId(),
    revision: 0,
    posts: '3',
    every: '1',
    ruleKind: 'EVERY_N_DAYS',
    weekdays: Object.freeze([]),
    endDate: '',
    maximum: '',
    startDate: '',
    throughDate: '',
    zone: 'Asia/Ho_Chi_Minh',
    slots: Object.freeze(
      ['08:00', '12:00', '19:00'].map((time) => Object.freeze({ id: createId(), time })),
    ),
    removal: null,
    pending: false,
    code: null,
    result: null,
  });
  let disposed = false;
  const listeners = new Set<(snapshot: ScheduleDraftState) => void>();
  function update(patch: Partial<ScheduleDraftState>) {
    state = Object.freeze({ ...state, ...patch });
    if (!disposed) for (const listener of [...listeners]) listener(state);
  }
  function cancelPort() {
    try {
      port?.cancel();
    } catch {
      // Port failures never expose transport details or revive delivery.
    }
  }
  function edit(patch: Partial<ScheduleDraftState> = {}) {
    if (disposed) return;
    update({
      revision: state.revision + 1,
      posts: state.removal ? String(state.slots.length) : state.posts,
      removal: null,
      code: null,
      result: null,
      ...patch,
    });
    cancelPort();
  }
  function setCount(raw: string) {
    if (disposed) return;
    const count = integer(raw, 1440);
    const revision = state.revision + 1;
    if (count === null) {
      edit({ posts: raw, code: 'INVALID_SHAPE' });
    } else if (count < state.slots.length) {
      edit({
        posts: raw,
        removal: Object.freeze({
          revision,
          count,
          slots: Object.freeze(state.slots.slice(count)),
        }),
      });
    } else {
      const slots = [...state.slots];
      while (slots.length < count) slots.push(Object.freeze({ id: createId(), time: '' }));
      edit({ posts: raw, slots: Object.freeze(slots) });
    }
  }
  function current(captured: ScheduleDraftState) {
    return (
      !disposed &&
      captured.draftId === state.draftId &&
      captured.revision === state.revision &&
      captured.zone === state.zone &&
      captured.startDate === state.startDate &&
      captured.throughDate === state.throughDate
    );
  }
  async function preview(): Promise<void> {
    if (disposed) return;
    if (state.pending) {
      update({ code: 'BUSY' });
      return;
    }
    if (!port) {
      update({ code: 'SESSION_UNAVAILABLE', result: null });
      return;
    }
    const captured = state;
    const count = integer(captured.posts, 1440),
      intervalDays = integer(captured.every, 3652059),
      maximum = captured.maximum === '' ? null : integer(captured.maximum, Number.MAX_SAFE_INTEGER);
    const rule =
      captured.ruleKind === 'ONCE'
        ? { kind: 'ONCE' as const }
        : captured.ruleKind === 'WEEKDAYS'
          ? { kind: 'WEEKDAYS' as const, weekdays: captured.weekdays }
          : intervalDays === null
            ? null
            : { kind: 'EVERY_N_DAYS' as const, intervalDays };
    const input =
      captured.removal === null &&
      count === captured.slots.length &&
      rule !== null &&
      (captured.maximum === '' || maximum !== null)
        ? snapshotScheduleDraftInput({
            schedule: {
              version: 1,
              kind: 'CIVIL_RULE',
              startDate: captured.startDate,
              endDate: captured.endDate === '' ? null : captured.endDate,
              maxOccurrences: maximum,
              rule,
              postsPerActiveDay: count,
              slots: captured.slots,
            },
            request: {
              version: 1,
              scope: {
                kind: 'UNBOUND_DRAFT',
                draftId: captured.draftId,
                draftRevision: captured.revision,
              },
              zone: captured.zone,
              fromDate: captured.startDate,
              throughDate: captured.throughDate,
              limit: 128,
            },
          })
        : null;
    if (!input) {
      update({ code: 'INVALID_SHAPE', result: null });
      return;
    }
    update({ pending: true, code: null, result: null });
    try {
      if (!current(captured)) return;
      const response = parseScheduleDraftResponse(await port.preview(input));
      if (!current(captured)) return;
      if (!response) {
        update({ code: 'INTERNAL_FAILURE' });
      } else if (!response.ok) {
        update({ code: response.code });
      } else {
        const result = response.preview;
        const matches =
          result.scope.draftId === captured.draftId &&
          result.scope.draftRevision === captured.revision &&
          result.preview.zone === captured.zone &&
          result.window.fromDate === captured.startDate &&
          result.window.throughDate === captured.throughDate &&
          result.window.limit === 128;
        update(matches ? { result, code: null } : { code: 'INTERNAL_FAILURE' });
      }
    } catch {
      if (current(captured)) update({ code: 'INTERNAL_FAILURE' });
    } finally {
      update({ pending: false });
    }
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener: (snapshot: ScheduleDraftState) => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setField(field: Field, value: string) {
      edit({
        [field]: value,
        code:
          (field === 'every' &&
            state.ruleKind === 'EVERY_N_DAYS' &&
            integer(value, 3652059) === null) ||
          (field === 'maximum' && value !== '' && integer(value, Number.MAX_SAFE_INTEGER) === null)
            ? 'INVALID_SHAPE'
            : null,
      });
    },
    setRule(kind: string) {
      if (kind === 'ONCE' || kind === 'WEEKDAYS' || kind === 'EVERY_N_DAYS')
        edit({ ruleKind: kind });
      else edit({ code: 'INVALID_SHAPE' });
    },
    toggleWeekday(day: number) {
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        edit({ code: 'INVALID_SHAPE' });
        return;
      }
      edit({
        weekdays: Object.freeze(
          state.weekdays.includes(day)
            ? state.weekdays.filter((value) => value !== day)
            : [...state.weekdays, day].sort((a, b) => a - b),
        ),
      });
    },
    setCount,
    setTime(slotId: string, time: string) {
      if (!state.slots.some((slot) => slot.id === slotId)) return;
      edit({
        slots: Object.freeze(
          state.slots.map((slot) => (slot.id === slotId ? Object.freeze({ ...slot, time }) : slot)),
        ),
      });
    },
    confirmRemoval() {
      const removal = state.removal;
      if (!removal || removal.revision !== state.revision) return;
      edit({
        posts: String(removal.count),
        slots: Object.freeze(state.slots.slice(0, removal.count)),
      });
    },
    cancelRemoval() {
      if (state.removal) edit();
    },
    contextChanged: () => edit(),
    preview,
    cancel: () => edit({ code: 'CANCELLED' }),
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      state = Object.freeze({
        ...state,
        revision: state.revision + 1,
        result: null,
        removal: null,
      });
      cancelPort();
    },
  });
}
