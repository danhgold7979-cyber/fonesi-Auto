export const INVOCATION_LIMIT = 8;
export type InvocationLease = Readonly<{ release: () => void }>;
export type InvocationBudget = Readonly<{
  acquire: () => InvocationLease | null;
  outstanding: () => number;
}>;
// Local native-promise occupancy, not a Chromium transport/backlog memory bound.
export function createInvocationBudget(): InvocationBudget {
  let count = 0;
  return Object.freeze({
    acquire: () => {
      if (count >= INVOCATION_LIMIT) return null;
      count++;
      let active = true;
      return Object.freeze({
        release: () => {
          if (active) {
            active = false;
            count--;
          }
        },
      });
    },
    outstanding: () => count,
  });
}
