# Adopted P4-05 supplied-observation stability source entry

ADOPTED 2026-11-02 12:30 UTC. Independent review CLEAR binds pre-adoption draft SHA256 `0e4ff22a9ddaf1a1e267a047e266ae7e898a9485acdc6410e2ab4c0b7c4160cd`. Continue only this bounded source slice on the existing canonical local phase-04, base `0a9e79f74626574a14ec700eb66bcd89e3736c3e`, tree `3e180db72fac0c77ec44cd967d4be39e1bdf4744`. Historical draft/proposed wording below records entry decisions, now adopted for source only—not acquisition/action authority or whole-cell/phase acceptance.

# Phase04 next source entry — bounded supplied-screen stability

**Draft for one independent entry review; 2026-11-02. No implementation authorization inferred from this draft.** Canonical `phase-04`, local baseline `0a9e79f`, existing 49-cell checklist. Continue the user-requested Phase04 lane under Amendment03; no new branch, Phase03 edits, device access or phase acceptance.

## 1. Concrete dependency-ready outcome

Implement the **supplied-observation portion of P4-05.B**: determine whether independently sequenced, individually fresh supplied PNG and hierarchy observations remain exactly equal for an explicitly supplied bounded policy window; reset on animation/change; expire or cancel deterministically. Compose the existing actual PNG decoder and XML normalizer, not caller assertions of hashes. The resulting observation is useful to supplied capture/selector replay now, without an acquisition provider.

P4-05.A's actual recognition-to-action/current-authority fence and P4-05.C's cancellation of a real queued action/safe recapture remain unavailable: no native capture issuer/current-display provider/action queue is connected. P4-01/02 are not accepted. An implemented software subset is not automatically completion of the entire P4-05.B cell; checklist changes require the existing evidence review, with the denominator unchanged.

## 2. Owned source and import boundary

- New `desktop/src/main/supplied-screen-stability.ts` and `desktop/tests/supplied-screen-stability.test.mjs` only for functional code.
- Reuse `validateCapturePng`, `normalizeHierarchyXml`, `classifyCaptureEvidence`, and `snapshotDisplayEvidence`; no change to their admitted image/XML language, limits or source labels. No new image decoder, XML parser, cryptographic authority or issuer registration.
- Exact additive existing module-map/build-source/test-inventory integration by the coordinator after source review. No main/preload/IPC/renderer, DB/logging, native/actor, acquisition, dependency or workflow change.
- Tests compose real normalize→stability→existing exact selector using supplied current context. A successful stability observation does not bypass selector freshness checks and never returns coordinates, an action, a capability or an authenticated identity.

## 3. Frozen private API and closed input shapes

`createSuppliedScreenStability(policy: unknown, initialContext: unknown, clock: unknown)` returns a frozen gate, or `null` for invalid constructor input. Gate methods are `observe(frame: unknown, currentContext: unknown, clock: unknown)`, `tick(currentContext: unknown, clock: unknown)`, `cancel()`, `snapshot()`. All return immutable snapshots; no promises, external callback, provider or scheduling injection.

Exact policy keys:

`{version:1,kind:'SUPPLIED_EXACT_EQUALITY_V1',minimumSamples,stableForMs,maximumGapMs,timeoutMs}`

- `minimumSamples`: integer2..8; `stableForMs`: integer1..10000; `maximumGapMs`: integer1..5000; `timeoutMs`: integer1..30000.
- `stableForMs <= timeoutMs`, `maximumGapMs <= timeoutMs`; all numbers finite safe integers, excluding -0. These are defensive supplied-test policy bounds, **not a certified latency/freshness/animation threshold**. No default silently chooses an approved product policy.
- Hard operation cap16 admitted frames. Existing per-frame PNG16MiB/decoded64MiB and XML1MiB/depth64/nodes10000 stay unchanged. At most16 decode attempts; no queue or retained history of raw PNG/XML/pixels. Retain only scalar commitments/window counters, the latest immutable DisplayEvidence and a bounded set of all admitted evidence IDs; never retain a normalized tree or raw image/XML after validation. Terminal state releases retained DisplayEvidence and the ID set; public snapshot contains only bounded scalar commitments.

Exact context keys:

`{profileId,appPackage,appVersion,locale,appRevision,screenRevision,ownershipRevision,connected,display}`

The four strings use the existing selector's nonempty <=256-character, control-refusing semantics. Revisions are nonnegative safe integers excluding -0; `connected` boolean; `display` is the existing descriptor-snapshotted `DisplayEvidence`. These are **supplied comparisons**, not proof that the caller knows actual app/navigation/owner state. The constructor refuses disconnected or currently expired/invalid display evidence. The fixed context tuple excludes changing capture-specific evidenceId/observation timestamps, but includes device/binding/generation/serial, displayId/dimensions/rotation/orientationEpoch, source, all four strings and three revisions.

Exact clock keys: `{monotonicMs,utcMs}`. Both safe nonnegative integers excluding -0; UTC <=8640000000000000. Monotonic addition must remain safe. Constructor fixes `deadlineMonotonicMs = monotonicMs + timeoutMs`. Subsequent calls require nondecreasing monotonic and UTC values. UTC supplies freshness attribution only; the original monotonic deadline controls gate timeout, never restarted by observations. Clock values are supplied, not an OS clock assertion.

Exact frame keys: `{version:1,sequence,png,xml,display}`. Sequence is a positive safe integer; PNG is the existing admitted Uint8Array shape; XML is a string; display is the existing evidence shape. All input records are descriptor-snapshotted with unknown keys/accessors rejected before traversal or data use, exceptions map to fixed refusal. The gate does not retain mutable caller objects. Validate raw PNG and XML with the same captured frame display. Validate frame display against the supplied current display using `classifyCaptureEvidence` at current UTC. Require an evidenceId unique across ALL admitted frames (at most16 IDs), and strictly increasing sequence and observedUtc relative to the last admitted frame. Reusing any admitted evidenceId, even nonconsecutively, refuses. Uint8Array object identity has no role: validators copy bytes, and distinct or reused byte-array objects may contain the same expected pixels. The checks distinguish supplied records, not certified independent physical acquisitions.

## 4. Exact comparison and state transitions

Public snapshot exact keys:

`{version:1,source:'SUPPLIED_STABILITY_V1',state,code,samplesSeen,consecutiveSamples,windowStartMonotonicMs,lastObservationMonotonicMs,deadlineMonotonicMs,pixelSha256,hierarchySha256,evidenceId,observedUtc}`

State is `WAITING | STABLE | TIMEOUT | CANCELLED | UNAVAILABLE`. Null before the first admitted frame: windowStart/lastObservation/pixelSha/hierarchySha/evidenceId/observedUtc; counters start0. Terminal timeout/cancel/unavailable clears all these observation fields and consecutiveSamples to0 while preserving samplesSeen and the original deadline. STABLE retains the last admitted scalar commitments, never the tree/bytes. All terminal states are sticky and idempotent; later observe/tick/cancel return that same immutable historical outcome without reading their arguments and cannot resurrect or replace it. In particular STABLE describes only the admitted observation window at its final frame, never current freshness, a live guard or continuing stability. Later context changes must be checked by a fresh operation and by any subsequent selector/action boundary; terminal calls do not reassert freshness.

Closed codes:

- WAITING: `INSUFFICIENT_SAMPLES | CHANGED | OBSERVATION_GAP` (constructor starts INSUFFICIENT_SAMPLES).
- STABLE: `EXACT_SUPPLIED_MATCH`.
- TIMEOUT: `DEADLINE_EXCEEDED`.
- CANCELLED: `CANCELLED`.
- UNAVAILABLE: `INVALID_INPUT | INVALID_CAPTURE | CAPTURE_LIMIT | DISPLAY_MISMATCH | STALE_CAPTURE | ROTATED | BINDING_CHANGED | DISCONNECTED | CONTEXT_CHANGED | CLOCK_REGRESSION | DUPLICATE_OBSERVATION | OBSERVATION_LIMIT`.

Order on nonterminal observe/tick: admit the one local operation, snapshot/validate arguments; check monotonic/UTC regression; test original deadline (`now >= deadline` means TIMEOUT); check supplied connected/context/binding/orientation/current display freshness. No frame admission after a known terminal condition. `cancel()` has no callback/time argument and immediately transitions a nonterminal gate to CANCELLED.

Each new frame is decoded/normalized by existing validators. Compare **decoded pixel SHA plus width, height and decoded byte length**, and exact XML SHA. Equal encoded PNG hashes alone are insufficient: compression/filter changes may encode the same pixels. RGB and RGBA decoding are conservatively distinct via decoded length; no alpha flattening or color conversion. XML whitespace/attribute-order differences may reset the window despite semantic equivalence: this is intentionally exact, not a structural/perceptual tolerance. Do not use the caller-supplied tree's hash as a replacement for validating raw XML.

First admitted frame starts the window. A changed image/tree resets to one consecutive sample and current time, code CHANGED. An observation gap strictly greater than maximumGapMs also resets to one on a new frame; a tick detecting that gap clears the candidate window and returns WAITING/OBSERVATION_GAP. Neither change nor gap restarts the deadline. Equal observations count consecutively only while every adjacent gap is within policy. STABLE requires both minimumSamples and elapsed monotonic window >=stableForMs **on an actual new admitted equal frame**, never from ticks alone or repeatedly supplying the same capture. Reject frame17 before decoding; samplesSeen counts admitted frames, not failed decoding attempts (failed decoding is terminal).

On every admitted nonterminal observe/tick, revalidate the currently retained latest frame against its **own** validity interval and the new supplied context's stable identity tuple. Do not compare successive captures with `classifyCaptureEvidence(previous,current)` as if their evidence IDs must be equal; each new frame is individually checked against its corresponding current display. A stale previous candidate cannot be bridged by a later frame: refuse STALE_CAPTURE. While WAITING, context revision/navigation, binding/generation/reconnect, rotation/orientation, owner revision or supplied source loss terminally invalidates this gate rather than silently carrying its window into another screen. After STABLE, the record remains historical as specified above and cannot serve as a currentness guard.

### Reentrancy and publication fence

Descriptor/own-key inspection can invoke Proxy traps even when getters are refused. The gate therefore admits at most one nonterminal observe/tick operation using a private in-progress bit and operation generation captured BEFORE any inspection of untrusted input. Nested observe/tick calls while busy return a frozen transient `UNAVAILABLE/REENTRANT_CALL` snapshot with the existing counters/deadline and cleared observation fields; they do not change the stored gate state or invalidate the admitted outer operation. Add `REENTRANT_CALL` to the closed UNAVAILABLE code set. `snapshot()` always returns the last committed immutable snapshot, not partially updated work.

`cancel()` remains immediate and callback-free even during inspection: it advances the private generation, clears retained observation state and commits CANCELLED. The admitted operation snapshots all input before interpreting it; after EACH potentially untrusted inspection and before invoking validators or committing any counters/state/public snapshot, it checks that its captured generation remains current and the gate remains nonterminal. If cancellation/terminal transition occurred, it returns the already committed terminal snapshot without overwriting it. Compute tentative changes locally, then perform the final callback-free generation/state check and publication; clear the in-progress bit in finally. Exceptions and malformed input use the same fence, so they cannot replace a cancellation with an error. Constructor inspection has no published gate instance to reenter.

## 5. Time, cancellation and claims

This is a synchronous, externally advanced observation gate, **not a background watcher or actual wall-clock waiter**. `tick` makes timeout/no-new-frame gaps observable without another capture; no automatic polling/timer/capture request exists. If the caller never advances it, no autonomous timeout or physical-currentness claim is made. Every operation is bounded by existing parser limits and the16-frame cap. Cancellation is checked between synchronous calls, not falsely claimed to preempt a running PNG decode. A future async acquisition owner must provide its own actual timer, cancellation and worker-retirement fences under a separate integration review.

Exact equal pixels/tree can still hide motion between captures, repeated stale captures, overlays outside the supplied representation or semantic changes not represented by image/XML. No image variance, perceptual metric, animation detector, confidence score or benchmark is fabricated. No recapture, retry or action is initiated on timeout/change/cancel; the caller receives a terminal typed result and any future action must independently establish real current authority.

## 6. Finite causal tests and stopping condition

Use small real synthetic PNG encodings and actual XML normalizer/selector, fixed supplied clocks only:

1. Different PNG compression/filter bytes with identical decoded pixels count as equal; actual pixel change resets. RGB/RGBA decoded-length distinction stays conservative.
2. XML change with unchanged pixels resets; exact equality over sufficient distinct evidence/sequence/timestamps reaches STABLE only on the required final frame, not a tick.
3. Too few samples, insufficient elapsed window, sparse observation gaps and animation through deadline; original timeout never moves. Boundary equality at deadline times out.
4. Duplicate sequence/evidence/observed time refuses; stale/future evidence, monotonic/UTC regression, integer overflow, -0 and malformed policy/input/accessors fail closed without invoking getters.
5. Rotation/dimensions/orientation epoch, binding/generation/serial/source, app/version/profile/locale/revision/navigation/ownership loss and disconnect invalidate; terminal outputs remain sticky historical records after late input/cancel (including invalid arguments whose traps must not run after terminal state); evidenceId reuse from any earlier, not merely the immediately preceding, admitted frame refuses.
6. Cancel before first frame and mid-window releases state; Proxy ownKeys/getOwnPropertyDescriptor traps cancelling during snapshot preserve CANCELLED, nested observe/tick receives transient REENTRANT_CALL without modifying the outer operation, and exceptions after cancellation cannot overwrite it; invalid PNG/XML/caps and frame17 refuse; no caller mutation changes a previously returned frozen snapshot.
7. Real supplied normalize/PNG→gate→existing selector composition: STABLE is not enough after later supplied context change; the selector still refuses stale/current mismatch. No action/identity capability/effect import appears.

Source checkpoint ends after independent source review, targeted tests and coordinator map/type/build integration. No native/device campaign, public publication or phase acceptance is authorized by this draft. If autonomous waiting or a variance-based product definition is required now, stop this source entry for that concrete design choice rather than pretending this synchronous equality gate satisfies it.
