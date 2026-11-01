export const INVOCATION_LIMIT = 8;
export const ORDINARY_INVOCATION_LIMIT = 7;
export type InvocationLease = Readonly<{ release: () => void }>;
export type InvocationBudget = Readonly<{
  acquire: () => InvocationLease | null;
  acquireCleanup: () => InvocationLease | null;
  outstanding: () => number;
}>;
// The cleanup slot is inside the same eight native-promise leases, never a ninth.
export function createInvocationBudget(): InvocationBudget {
  let ordinary = 0,
    cleanup = 0;
  function acquire(isCleanup: boolean): InvocationLease | null {
    if (
      ordinary + cleanup >= INVOCATION_LIMIT ||
      (isCleanup ? cleanup >= 1 : ordinary >= ORDINARY_INVOCATION_LIMIT)
    )
      return null;
    if (isCleanup) cleanup++;
    else ordinary++;
    let active = true;
    return Object.freeze({
      release: () => {
        if (!active) return;
        active = false;
        if (isCleanup) cleanup--;
        else ordinary--;
      },
    });
  }
  return Object.freeze({
    acquire: () => acquire(false),
    acquireCleanup: () => acquire(true),
    outstanding: () => ordinary + cleanup,
  });
}
