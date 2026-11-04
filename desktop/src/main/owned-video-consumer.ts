/** One headless session over a genuine sealed native target; no caller effect callbacks. */
import { randomBytes, randomUUID } from 'node:crypto';
import { inspectOwnedVideoTarget } from './adb-discovery-service.ts';
import {
  preparingVideo,
  snapshotVideo,
  type VideoSnapshot,
  type VideoSession,
  type VideoTransportSession,
} from './video-contract.ts';
const claimed = new WeakSet<object>();
const scids = new Set<number>();
const clock = Date.now.bind(Date);
export function createOwnedVideoConsumer(target: unknown): VideoSession {
  const record = inspectOwnedVideoTarget(target);
  if (
    !record ||
    !target ||
    typeof target !== 'object' ||
    claimed.has(target) ||
    scids.size >= 65536
  )
    throw Error('VIDEO_REJECTED');
  claimed.add(target); // Before clock, UUID, authority, artifact or transport callbacks.
  const admittedUtc = clock();
  const deadlineUtc = admittedUtc + 30000;
  const sessionId = randomUUID();
  let view = preparingVideo(sessionId),
    native: VideoSnapshot | null = null;
  let stopped = false,
    unknown = false,
    actualPending = 0,
    beginEntered = false;
  let failure: VideoSnapshot['code'] | null = null;
  let startWork: Promise<void>;
  let transport: VideoTransportSession | null = null;
  let stopPromise: Promise<VideoSnapshot> | null = null;
  let startResolve: (value: VideoSnapshot) => void = () => {};
  let startDelivered = false;
  const started = new Promise<VideoSnapshot>((r) => {
    startResolve = r;
  });
  function publish(next: VideoSnapshot) {
    const body = { ...next, snapshotRevision: view.snapshotRevision };
    if (JSON.stringify(body) === JSON.stringify(view)) return;
    if (view.snapshotRevision >= Number.MAX_SAFE_INTEGER) {
      unknown = true;
      stopped = true;
      return;
    }
    view = Object.freeze({ ...body, snapshotRevision: view.snapshotRevision + 1 });
  }
  function latchUnknown() {
    unknown = true;
    stopped = true;
    publish({ ...view, state: 'UNCERTAIN', code: 'OUTCOME_UNKNOWN' });
  }
  function accept(raw: unknown) {
    const facts = snapshotVideo(raw);
    if (
      !facts ||
      facts.sessionId !== sessionId ||
      (native &&
        facts.snapshotRevision === native.snapshotRevision &&
        JSON.stringify(facts) !== JSON.stringify(native))
    ) {
      latchUnknown();
      return;
    }
    if (native && facts.snapshotRevision < native.snapshotRevision) return;
    if (
      native &&
      (facts.sessionPackets < native.sessionPackets ||
        facts.mediaPackets < native.mediaPackets ||
        facts.encodedBytes < native.encodedBytes ||
        (native.localRetired && !facts.localRetired) ||
        (native.cleanup === 'CLEANED' && facts.cleanup !== 'CLEANED') ||
        (native.directory === 'CREATED' && facts.directory !== 'CREATED') ||
        (native.directory === 'UNKNOWN' && facts.directory !== 'UNKNOWN') ||
        (native.upload === 'VERIFIED' && facts.upload !== 'VERIFIED') ||
        (native.upload === 'PARTIAL' && facts.upload === 'NONE') ||
        (native.launch === 'EXITED' && facts.launch !== 'EXITED') ||
        (native.launch === 'STARTED' && facts.launch === 'NONE'))
    ) {
      latchUnknown();
      return;
    }
    native = facts;
    if (facts.state === 'UNCERTAIN') unknown = true;
    if (facts.state === 'FAILED' && failure === null) failure = facts.code;
    if (unknown) publish({ ...facts, state: 'UNCERTAIN', code: 'OUTCOME_UNKNOWN' });
    else if (stopped)
      publish({
        ...facts,
        state: facts.state === 'CLOSED' ? 'CLOSED' : 'STOPPING',
        code: failure ?? (facts.code === 'OK' ? 'CLOSED' : facts.code),
      });
    else if (failure) publish({ ...facts, state: 'FAILED', code: failure });
    else publish(facts);
  }
  function deliverStart() {
    if (!startDelivered) {
      startDelivered = true;
      clearTimeout(timer);
      startResolve(view);
    }
  }
  function stop(): Promise<VideoSnapshot> {
    if (stopPromise) return stopPromise;
    stopped = true;
    publish({
      ...view,
      state: unknown ? 'UNCERTAIN' : 'STOPPING',
      code: unknown ? 'OUTCOME_UNKNOWN' : (failure ?? 'CLOSED'),
    });
    let resolve: (value: VideoSnapshot) => void = () => {};
    stopPromise = new Promise((r) => {
      resolve = r;
    });
    // Retain actual transport completion independently of bounded logical reporting.
    const timer = setTimeout(() => {
      latchUnknown();
      resolve(view);
    }, 120000);
    actualPending++;
    void Promise.resolve()
      .then(async () => {
        if (transport) accept(await transport.stop());
        else {
          await startWork;
          if (!transport && !beginEntered && !unknown)
            publish({ ...view, state: 'CLOSED', code: failure ?? 'CLOSED', localRetired: true });
          else {
            const late = transport as VideoTransportSession | null;
            if (late) accept(await late.stop());
          }
        }
      })
      .catch(latchUnknown)
      .finally(() => {
        actualPending--;
        clearTimeout(timer);
        resolve(view);
        deliverStart();
      });
    return stopPromise;
  }
  const timer = setTimeout(
    () => {
      latchUnknown();
      deliverStart();
      void stop();
    },
    Math.max(0, deadlineUtc - clock()),
  );
  // The registered session and Stop latch exist before any authority or start callbacks.
  actualPending++;
  startWork = Promise.resolve()
    .then(async () => {
      if (stopped) return;
      record.current();
      const scid = randomBytes(4).readUInt32BE(0) & 0x7fffffff;
      if (scids.has(scid) || clock() >= deadlineUtc || !record.finalCurrent())
        throw Error('VIDEO_REJECTED');
      scids.add(scid);
      const nonceHex = randomBytes(32).toString('hex');
      record.current();
      if (stopped || clock() >= deadlineUtc || !record.finalCurrent())
        throw Error('VIDEO_REJECTED');
      beginEntered = true;
      transport = record.begin(Object.freeze({ videoId: sessionId, scid, nonceHex, deadlineUtc }));
      accept(await transport.started);
      if (!record.finalCurrent() && !stopped) {
        stopped = true;
        void stop();
      }
    })
    .catch(() => {
      if (beginEntered) latchUnknown();
      else {
        failure = 'ADMISSION_REJECTED';
        publish({ ...view, state: 'FAILED', code: failure, localRetired: true });
      }
    })
    .finally(() => {
      actualPending--;
      deliverStart();
      if (unknown || failure) void stop();
    });
  return Object.freeze({
    started,
    snapshot() {
      try {
        if (!stopped && !record.finalCurrent()) void stop();
      } catch {
        latchUnknown();
        void stop();
      }
      return view;
    },
    get retired() {
      return (
        actualPending === 0 &&
        view.localRetired &&
        (view.cleanup === 'CLEANED' || view.cleanup === 'NOT_REQUIRED')
      );
    },
    async status() {
      if (stopped || !transport) return view;
      try {
        record.current();
        if (!record.finalCurrent()) throw Error();
        actualPending++;
        try {
          accept(await transport.status());
        } finally {
          actualPending--;
        }
      } catch {
        latchUnknown();
        void stop();
      }
      try {
        if (unknown || failure || (!stopped && !record.finalCurrent())) void stop();
      } catch {
        latchUnknown();
        void stop();
      }
      return view;
    },
    stop,
  });
}
