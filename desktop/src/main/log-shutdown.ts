// Actual main uses this one-shot before-quit gate; no timer cancels filesystem I/O.
export function createLogShutdown(
  options: Readonly<{
    stop: () => boolean;
    flush: () => Promise<'FLUSHED' | 'FAILED'>;
    degraded: () => void;
    resume: () => void;
    fail: () => void;
  }>,
) {
  let started = false,
    resuming = false;
  return {
    beforeQuit(event: { preventDefault: () => void }) {
      if (resuming) return;
      event.preventDefault();
      if (started) return;
      started = true;
      let clean = false;
      try {
        clean = options.stop();
      } catch {
        clean = false;
      }
      let flushing: Promise<'FLUSHED' | 'FAILED'>;
      try {
        flushing = options.flush();
      } catch {
        flushing = Promise.resolve('FAILED');
      }
      void flushing.then(
        (result) => {
          if (result !== 'FLUSHED') options.degraded();
          if (!clean) {
            options.fail();
            return;
          }
          resuming = true;
          options.resume();
        },
        () => {
          options.degraded();
          if (!clean) {
            options.fail();
            return;
          }
          resuming = true;
          options.resume();
        },
      );
    },
    get resuming() {
      return resuming;
    },
  };
}
