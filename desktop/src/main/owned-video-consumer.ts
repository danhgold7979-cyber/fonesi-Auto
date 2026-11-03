/** One headless session over a genuine sealed native target; no caller effect callbacks. */
import { randomBytes, randomUUID } from 'node:crypto';
import { inspectOwnedVideoTarget } from './adb-discovery-service.ts';
import { inspectOwnedVideoRecoveryTarget } from './adb-discovery-service.ts';
import {
  snapshotVideoRecoveryResult,
  videoRecoveryRetired,
  type VideoRecoveryResult,
  type VideoRecoverySession,
  type VideoRecoveryTransportSession,
  preparingVideo,
  videoRecord,
  videoUuid,
  type VideoMediaSink,
  snapshotVideo,
  type VideoSnapshot,
  type VideoSession,
  type VideoTransportSession,
} from './video-contract.ts';
const claimed = new WeakSet<object>();
const scids = new Set<number>();
const nonces = new Set<string>();
const clock = Date.now.bind(Date);
export function createOwnedVideoConsumer(target: unknown): VideoSession {
  return createConsumer(target);
}
export function createOwnedVideoMediaConsumer(
  target: unknown,
  context: Readonly<{ admittedUtc: number; deadlineUtc: number; videoId: string }>,
  sink: VideoMediaSink,
): VideoSession {
  const c = videoRecord(context, ['admittedUtc', 'deadlineUtc', 'videoId']);
  const m = videoRecord(sink, ['accept', 'close']);
  if (
    !c ||
    !m ||
    typeof m.accept !== 'function' ||
    typeof m.close !== 'function' ||
    !Number.isSafeInteger(c.admittedUtc) ||
    (c.admittedUtc as number) < 0 ||
    Object.is(c.admittedUtc, -0) ||
    !Number.isSafeInteger(c.deadlineUtc) ||
    c.deadlineUtc !== (c.admittedUtc as number) + 30000 ||
    !videoUuid(c.videoId)
  )
    throw Error('VIDEO_REJECTED');
  const captured = Object.freeze({
    admittedUtc: c.admittedUtc as number,
    deadlineUtc: c.deadlineUtc as number,
    videoId: c.videoId,
  });
  const media: VideoMediaSink = Object.freeze({
    accept: m.accept.bind(sink),
    close: m.close.bind(sink),
  });
  return createConsumer(target, captured, media);
}
function createConsumer(
  target: unknown,
  context?: Readonly<{ admittedUtc: number; deadlineUtc: number; videoId: string }>,
  media?: VideoMediaSink,
): VideoSession {
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
  const admittedUtc = context?.admittedUtc ?? clock();
  const deadlineUtc = context?.deadlineUtc ?? admittedUtc + 30000;
  const sessionId = context?.videoId ?? randomUUID();
  let view = preparingVideo(sessionId),
    native: VideoSnapshot | null = null;
  let stopped = false,
    unknown = false,
    actualPending = 0,
    beginEntered = false;
  let mediaClosed = false;
  const guardedMedia: VideoMediaSink | undefined = media
    ? Object.freeze({
        async accept(header, bytes) {
          if (stopped || mediaClosed) throw Error('VIDEO_REJECTED');
          record.current();
          if (stopped || mediaClosed || !record.finalCurrent()) throw Error('VIDEO_REJECTED');
          await media.accept(header, bytes);
          record.current();
          if (stopped || mediaClosed || !record.finalCurrent()) throw Error('VIDEO_REJECTED');
        },
        close() {
          if (mediaClosed) return;
          mediaClosed = true;
          media.close();
        },
      })
    : undefined;
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
    try {
      guardedMedia?.close();
    } catch {
      unknown = true;
    }
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
    actualPending++;
    try {
      guardedMedia?.close();
    } catch {
      latchUnknown();
    }
    // Retain actual transport completion independently of bounded logical reporting.
    const timer = setTimeout(() => {
      latchUnknown();
      resolve(view);
    }, 120000);
    let immediate: Promise<VideoSnapshot> | null = null;
    try {
      if (transport) immediate = transport.stop();
    } catch {
      latchUnknown();
    }
    void Promise.resolve()
      .then(async () => {
        if (immediate) accept(await immediate);
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
      if (clock() < admittedUtc || clock() >= deadlineUtc) throw Error('VIDEO_REJECTED');
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
      transport = record.begin(
        Object.freeze({ videoId: sessionId, scid, nonceHex, deadlineUtc }),
        guardedMedia,
      );
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

/** Explicit sequential media attempt. Cancellation is not a native retirement witness. */
export function createOwnedVideoRecoveryMediaConsumer(
  target: unknown,
  context: Readonly<{ admittedUtc: number; deadlineUtc: number; videoId: string }>,
  sink: VideoMediaSink,
): VideoRecoverySession {
  const record = inspectOwnedVideoRecoveryTarget(target);
  const c = videoRecord(context, ['admittedUtc', 'deadlineUtc', 'videoId']);
  const m = videoRecord(sink, ['accept', 'close']);
  if (
    !record ||
    !target ||
    typeof target !== 'object' ||
    claimed.has(target) ||
    scids.size >= 65536 ||
    nonces.size >= 65536 ||
    !c ||
    !m ||
    typeof m.accept !== 'function' ||
    typeof m.close !== 'function' ||
    !Number.isSafeInteger(c.admittedUtc) ||
    (c.admittedUtc as number) < 0 ||
    Object.is(c.admittedUtc, -0) ||
    !Number.isSafeInteger(c.deadlineUtc) ||
    c.deadlineUtc !== (c.admittedUtc as number) + 30000 ||
    !videoUuid(c.videoId)
  )
    throw Error('VIDEO_REJECTED');
  claimed.add(target);
  const admitted = c.admittedUtc as number,
    deadline = c.deadlineUtc as number,
    id = c.videoId;
  const acceptMedia = m.accept.bind(sink),
    closeMedia = m.close.bind(sink);
  let stopped = false,
    mediaClosed = false,
    uncertain = false,
    entered = false,
    pending = 1,
    stopDone = false;
  let transport: VideoRecoveryTransportSession | null = null;
  let latest: VideoRecoveryResult | null = null;
  let stopWork: Promise<VideoRecoveryResult | null> | null = null;
  const statusWorks = new Set<Promise<unknown>>();
  const media: VideoMediaSink = Object.freeze({
    async accept(header, bytes) {
      if (stopped || mediaClosed) throw Error('VIDEO_REJECTED');
      record.current();
      if (!record.finalCurrent()) throw Error('VIDEO_REJECTED');
      await acceptMedia(header, bytes);
      if (stopped || mediaClosed || !record.finalCurrent()) throw Error('VIDEO_REJECTED');
    },
    close() {
      if (mediaClosed) return;
      mediaClosed = true;
      closeMedia();
    },
  });
  function accept(raw: VideoRecoveryResult | null) {
    if (raw === null) {
      if (latest !== null) throw Error('VIDEO_REJECTED');
      return null;
    }
    const value = snapshotVideoRecoveryResult(raw);
    if (
      !value ||
      value.videoId !== id ||
      (latest && (latest.videoOrdinal !== value.videoOrdinal || latest.handoff !== value.handoff))
    )
      throw Error('VIDEO_REJECTED');
    const old = latest?.snapshot,
      next = value.snapshot;
    if (old && next && next.snapshotRevision < old.snapshotRevision) return latest;
    if (
      old &&
      next &&
      ((next.snapshotRevision === old.snapshotRevision &&
        JSON.stringify(old) !== JSON.stringify(next)) ||
        (old.localRetired && !next.localRetired))
    )
      throw Error('VIDEO_REJECTED');
    latest = value;
    return value;
  }
  const timer = setTimeout(
    () => {
      uncertain = true;
      void stop().catch(() => {});
    },
    Math.max(0, deadline - clock()),
  );
  const started = Promise.resolve()
    .then(async () => {
      if (stopped) return null;
      record.current();
      if (clock() < admitted || clock() >= deadline || !record.finalCurrent())
        throw Error('VIDEO_REJECTED');
      const scid = randomBytes(4).readUInt32BE(0) & 0x7fffffff;
      const nonceHex = randomBytes(32).toString('hex');
      if (scids.has(scid) || nonces.has(nonceHex)) throw Error('VIDEO_REJECTED');
      scids.add(scid);
      nonces.add(nonceHex);
      record.current();
      if (stopped) return null;
      if (clock() >= deadline || !record.finalCurrent()) throw Error('VIDEO_REJECTED');
      entered = true;
      transport = record.begin(
        Object.freeze({ videoId: id, deadlineUtc: deadline, scid, nonceHex }),
        media,
      );
      return accept(await transport.started);
    })
    .catch(() => {
      // Construction entered without a retained transport cannot be certified side-effect free.
      if (!entered) return null;
      uncertain = true;
      throw Error('VIDEO_REJECTED');
    })
    .finally(() => {
      pending--;
      clearTimeout(timer);
    });
  function stop(): Promise<VideoRecoveryResult | null> {
    if (stopWork) return stopWork;
    stopped = true;
    let resolve: (v: VideoRecoveryResult | null) => void = () => {};
    let reject: (e: Error) => void = () => {};
    stopWork = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    pending++;
    try {
      media.close();
    } catch {
      uncertain = true;
    }
    let immediate: Promise<VideoRecoveryResult | null> | null = null;
    try {
      if (transport) immediate = transport.stop();
    } catch {
      uncertain = true;
    }
    void Promise.resolve()
      .then(async () => {
        if (immediate) accept(await immediate);
        await started.catch(() => {});
        const lower = transport as VideoRecoveryTransportSession | null;
        if (!immediate && lower) accept(await lower.stop());
        await Promise.allSettled([...statusWorks]);
        if (entered && (!lower?.retired || (latest !== null && !videoRecoveryRetired(latest))))
          uncertain = true;
      })
      .catch(() => {
        uncertain = true;
      })
      .finally(() => {
        pending--;
        stopDone = true;
        clearTimeout(timer);
        if (uncertain) reject(Error('VIDEO_REJECTED'));
        else resolve(latest);
      });
    return stopWork;
  }
  // Retain cleanup for every failed start, even if its caller has already gone away.
  void started.then(
    () => {
      if (!entered || latest === null || latest.handoff === 'NOT_STARTED')
        void stop().catch(() => {});
    },
    () => {
      void stop().catch(() => {});
    },
  );
  return Object.freeze({
    started,
    stop,
    snapshot() {
      return latest;
    },
    get retired() {
      return (
        stopped && stopDone && pending === 0 && !uncertain && (!entered || !!transport?.retired)
      );
    },
    async status() {
      if (stopped || !transport) return latest;
      record.current();
      if (!record.finalCurrent() || statusWorks.size) throw Error('VIDEO_REJECTED');
      pending++;
      const lower = transport;
      const work = Promise.resolve().then(() => lower.status());
      statusWorks.add(work);
      try {
        return accept(await work);
      } catch {
        uncertain = true;
        void stop().catch(() => {});
        throw Error('VIDEO_REJECTED');
      } finally {
        pending--;
        statusWorks.delete(work);
      }
    },
  });
}
