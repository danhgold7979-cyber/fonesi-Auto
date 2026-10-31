export function createPersistenceLifecycle<T extends { shutdown: () => Promise<void> }>(
  deadlineMs = 120000,
) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 120000)
    throw new Error('PERSISTENCE_DEADLINE_REJECTED');
  let opening: Promise<T> | undefined,
    stopping = false,
    closing: Promise<void> | undefined;
  return Object.freeze({
    open(factory: () => Promise<T>): Promise<T> {
      if (opening || stopping) return Promise.reject(new Error('PERSISTENCE_START_REJECTED'));
      try {
        opening = Promise.resolve(factory());
      } catch (error) {
        opening = Promise.reject(error);
      }
      return opening;
    },
    stop(): Promise<void> {
      if (closing) return closing;
      stopping = true;
      closing = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            (async () => {
              const current = await opening;
              await current?.shutdown();
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('PERSISTENCE_SHUTDOWN_TIMEOUT')),
                deadlineMs,
              );
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      })();
      return closing;
    },
    get stopping() {
      return stopping;
    },
  });
}
