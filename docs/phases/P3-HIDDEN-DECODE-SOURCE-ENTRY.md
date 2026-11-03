# P3-09.C bounded window-hidden decode source entry

Prepared 2026-11-03 23:01 UTC. **ADOPTED for bounded source implementation at 2026-11-03 23:05 UTC.**
Independent exact-byte review CLEAR for draft SHA256
`0658ae666f34cd078998ab2d9b1477e5af39406657e7db842c1ec73c6f998798`.
Coordinator continuation follows the completed disk CI; source/runtime tests for
this new behavior remain NOT_RUN until implementation evidence exists.
Repository `danhgold7979-cyber/fonesi-Auto`, verified origin
`https://github.com/danhgold7979-cyber/fonesi-Auto.git`, branch `phase-03`, base
`2b5085939184ccd0b6c4088186f5993904572f3d`; clean at investigation start.
This author changes only this entry document. Prior disk checkpoint exact-head
Windows CI41734597404 SUCCESS is coordinator-supplied history, not a test run here.
Only P3/P10 work lanes remain active. No Phase/task acceptance, main merge,
user-computer/device operation, security change or new legal agreement follows.

## 1. Decision and explicit coverage limit

Meaningful application implementation can proceed after review: suspend the actual
renderer decoder when the **captured application's main-owned BrowserWindow is
hidden or minimized**, continue bounded encoded transport consumption, and resume
only on a later validated IDR. This is non-presentation lifecycle management, not
Auto/Manual pressure policy: requested/effective stream settings, producer FPS,
resolution, bitrate, DeviceActor and DEC-019 safeguards are unchanged.

This is a **subset of P3-09.C**. Renderer `document.hidden` is not authority to waive
main deadlines. Offscreen, CSS-hidden, collapsed or filtered tiles, obscuration by
another window, and automatic restart are excluded. Canvas removal/unmount retains
Stop, not suspension. No full C ledger credit is earned by this bounded entry,
even after source tests. P3-07 is existing behavior and is not reimplemented.

Existing obstacles are substantive: `createTileVideoDecoder.receive/process`
requires contiguous delivery/packet IDs, CONFIG awaits support asynchronously,
a held media delivery is unconsumed, and outputs carry decoder generations.
`installVideoStreamBridge` retains three paint identities and a 30-second paint
watchdog. A renderer-only pause exhausts paint slots or expires main; dropping
packets in main without a new reseed contract breaks decoder continuity. Therefore
this design continues delivering and validating every packet; it does not skip IDs
or resend CONFIG with invented identities.

## 2. Trusted window observation and application wiring

`desktop/src/main.ts` already constructs the real BrowserWindow in `createLifecycle`
and retains `platformToolsWindow`. Extend `installVideoStreamBridge` with a private
main-only window-observer dependency, capturing the exact window for an admitted
sender. The production adapter must check: window exists, not destroyed, its
`webContents === event.sender`, current app lifecycle not closing/disposed, and the
existing captured mainFrame/URL/admission/reservation checks. Never search arbitrary
windows or accept a renderer-supplied window ID. Capture once per owner; replacement
window invalidates the owner instead of rebinding it.

The observer's read result is `VISIBLE | HIDDEN | UNAVAILABLE`, where HIDDEN is
`isMinimized() || !isVisible()`. Subscribe to `hide`, `show`, `minimize`, `restore`
and `closed`; re-read the getters on events rather than trusting event names.
Subscribe before the initial read and verify identity afterward. Dispose listeners
on every terminal path. No `blur`, focus, geometry, display, or tile heuristic.
Re-read before processing control ACK, admitting a paint, and renewing/scheduling
paint health. Throw/identity loss is terminal, not HIDDEN. Source tests use a narrow
observer substitute; production must supply the genuine BrowserWindow adapter.

Official Electron documentation checked 2026-11-03:
[BrowserWindow page visibility and methods](https://www.electronjs.org/docs/latest/api/browser-window),
[BaseWindow visibility methods](https://www.electronjs.org/docs/latest/api/base-window).
Electron documents Windows page-hidden behavior for minimized/explicitly hidden
windows, an initially visible document for `show:false`, and visibility differences
when background throttling is disabled. Consequently document and window visibility
are deliberately not equated. No webPreferences/background-throttling/ready-to-show
change is authorized. The current initially hidden window cannot start a new video:
return existing UNAVAILABLE before reservation until main confirms VISIBLE. A hide
after reservation can suspend decoding, but cannot waive the original first-paint
startup deadline. Native/browser runtime behavior remains separately unverified.

`renderer.tsx` routes private visibility fences from the already captured port to
the decoder. It may observe `visibilitychange` only as a **wake-up hint** asking main
to re-read the owned window (exact bounded message, no hidden boolean or timeout).
It must never implement a second deadline authority. A document-hidden output guard
can suppress drawing immediately, but cannot acknowledge a successful paint or
renew a budget; unmatched document-only hiding remains under the normal finite
paint timeout and may terminate. Thus only main-attested hide/minimize is promised
as a sustainable suspension. Pagehide, unmount, disconnect, loss of eligibility,
Stop and port errors retain their existing stronger terminal behavior.

## 3. Ordered private-port protocol

Keep public START/STOP request/response and `VideoPortMetadata` unchanged. Native
media framing, credit IDs, producer packets and lifecycle protocol remain v1 and
unchanged. Introduce a strict **private port v2** envelope/parser shared by bridge
and renderer, preferably `video-presentation-contract.ts`; register its actual
module/build edges. Do not relax existing `snapshotVideoMediaDelivery` v1 parsing.

Exact variants, with no extra keys/accessors/prototype tricks:
- Main MEDIA: `{version:2, videoId, kind:'MEDIA', epoch, delivery}`; nested delivery
  remains the existing exact v1 object with the same videoId and contiguous IDs.
- Main visibility: `{version:2, videoId, kind:'PRESENTATION', epoch, state,
  afterDeliveryId, afterPacketId, remainingMs}`; state is VISIBLE/HIDDEN,
  remainingMs is finite positive and <=30000. `afterPacketId` includes the current
  partial packet's header.packetId, not just last completed packet.
- Renderer fence ACK: `{version:2,videoId,kind:'PRESENTATION_ACK',epoch}`.
- Renderer CONSUMED: `{version:2,videoId,kind:'CONSUMED',epoch,deliveryId}`.
- Renderer PAINTED: existing exact identity fields plus version2 and epoch.
- READY, STOP, DECODER_UNAVAILABLE, DECODE_FAILED retain exact small shapes but use
  private version2. REFUSED likewise migrates only its private-port shape/parser.
- Optional wake hint: `{version:2,videoId,kind:'VISIBILITY_HINT'}`. It never changes
  state or budget unless a trusted window read independently changes state. Ignore
  repeated hints with no state change; do not enqueue work/timers per hint.

All counters are nonnegative safe integers, no -0; epoch starts at 1, strictly
increases on a transmitted fence, and cannot wrap. Bound transmitted transitions
at 65536 per owner; exhausting it stops rather than growing bookkeeping. Bootstrap:
after READY and before starting media, send initial VISIBLE fence epoch1, await
its ACK under original startup budget, then begin the reserved session. This puts
all deliveries in an established presentation epoch without a new public method.

At most one fence is awaiting ACK, one coalesced latest desired window state, one
pending media delivery and the existing one assembled packet. No unbounded event
queue. On actual window transition, account elapsed visible time immediately,
clear old paint identities and revoke their renewal authority, even while a prior
fence ACK is pending. Gate new media posts until the fence for the latest observed
state is ACKed. An already pending delivery still requires its exact CONSUMED ACK;
never resolve it merely because visibility changed. The lower sink promise remains
retained, and its existing ownership/Stop mechanics remain effective.

A fence travels on the same main-to-renderer port after prior posted media. It can
interrupt held output or an awaited support check; it does not wait for decode
completion. Once ACKed, if trusted state changed again, send only the coalesced
latest fence before further media posts. Re-sample/capture the complete delivery
and partial-packet frontier at the actual VISIBLE fence send. The frontier cannot
move backward. Resume freshness is packetId > this frontier, preventing a KEY
already partly assembled, posted, pending or held at resume from qualifying.

ACKs must match the one outstanding fence exactly. An exact pending CONSUMED from
the older epoch remains valid once, even after visibility changes; it releases only
that delivery, not presentation health. Other stale consumption or future epochs
fail closed. Structurally valid PAINTED from an older epoch is ignored without
renewal; malformed/future/current-unknown identities fail. Current PAINTED must also
match one of at most three actual posted decode-eligible media identities, current
geometry/config, and current trusted VISIBLE state. Hidden/drain/pre-fresh-key
packets never acquire paint slots. Keep a scalar retired-epoch fence, not a history
map. A closed owner ignores later callbacks and cannot be resurrected.

## 4. Decoder lifecycle, validation and freshness

Separate **wire admission cursors** from decode submission cursors. At receipt,
validate envelope, delivery+1, packet+1 (SESSION retains its existing special zero
packet identity), geometry/config sequence, dimensions and increasing media PTS
within configuration. Commit each admitted cursor once, synchronously, before any
awaited support check or reentrant callback. `held` means admitted but unconsumed;
processing it later never re-admits or increments accounting a second time.

Maintain one owned latest validated AVC configuration, <=65536 encoded bytes plus
its bounded parsed parameter bytes; avoid retaining duplicate encoded copies after
parse. SESSION invalidates it. CONFIG replacement parses the entire current SPS/PPS
and geometry before replacing it, invalidates the decoder generation and all prior
outputs, and never reuses old geometry/config on failure. Do not call support,
create/configure, chunk or decode while HIDDEN. Every hidden KEY/DELTA still receives
strict identity/PTS and `prepareAvcChunk` validation against that latest config,
then is discarded and consumed once. Temporary validation allocations retain the
existing 8MiB packet cap; no encoded KEY, bitmap, VideoFrame or frame backlog is
cached for resume. If no valid config exists, reject media rather than guess.

On HIDDEN fence: advance generation **before** decoder.close or user callbacks;
settle pending and held media as hidden discards, clear canvas and pending map,
release a valid held delivery's CONSUMED exactly once, retain only latest config
and wire cursors, and publish `PAUSED_HIDDEN` with explicit WINDOW_HIDDEN reason.
A CONFIG already admitted but awaiting support retains its validated config; the
fence completes its consumption exactly once without waiting for support. Its old
support resolution/error is fenced from creation, publication and duplicate ACK.
An operation token owns pending asynchronous work; an old finally cannot clear a
new operation's busy state. Independently retain at most **one unresolved support
Promise** per owner, including invalidated checks: invalidation does not cancel the
underlying Promise. Do not issue another check until it settles. A later fresh KEY
may remain the one held/unconsumed delivery while awaiting that settlement under
its existing non-renewable ACK and visible deadlines, then start its own check if
still current. Stop if the wait expires; never accumulate abandoned checks across
repeated hide/show or CONFIG changes. Settlement clears only its captured support
slot, not a newer decode operation. Stale output always closes its VideoFrame. Reentrant
close/state/accounting/ACK callbacks must recheck closed/generation/epoch before
any additional work. Stop's terminal latch always wins.

On VISIBLE fence: invalidate decoder/output generation again; keep canvas empty,
record the main packet frontier, enter `WAITING_FRESH_KEY`, ACK the fence after
synchronous invalidation, and retain config only as configuration. Continue strict
validation/drain of DELTA and keys at/below the frontier. The first later KEY must
pass actual IDR/current parameter-set validation; a KEY label alone is insufficient.
Only then perform `isConfigSupported`, instantiate/configure the new decoder and
submit that same fresh KEY under the remaining finite budget. Recheck ownership,
epoch, generation, config identity and deadline after every await/call. If hidden
again during support, consume/discard that admitted KEY once and invalidate the
work. No arbitrary delta resume and no CONFIG replay with reused/invented IDs.

New CONFIG while waiting invalidates configuration and old outputs but does not
reset the freshness frontier or replenish time; next valid later IDR must use the
new CONFIG. SESSION replacement also resets retained configuration; packet/global
configuration continuity follows existing source contract, not reset-to-one guesses.
Here “fresh” means newly admitted past the main resume packet frontier; it does
not prove that the phone captured the image after the restore wall-clock instant.
Buffered upstream data has no such capture-time attestation in this protocol.
No keyframe cadence is assumed or requested. An encoder that sends no later IDR
may truthfully fail the finite resume budget; there is no auto-restart/key request.

## 5. Deadlines and bounded liveness

Maintain three independent concepts, all monotonic and fail-closed on NaN, backward
clock, ownership loss, or expired budget:
1. Original admission/startup absolute deadline is never suspended, extended or
   restarted, including initial fence/support checks and hide before first paint.
2. After a successful current paint, remaining visible draw budget is 30000ms.
   Charge elapsed main-attested VISIBLE time. A hide freezes the **remaining** amount;
   show continues that amount, never a new 30s. Repeated hide/show, CONFIG, hints,
   fence ACK, CONSUMED, encoded arrivals and support results cannot replenish it.
   Only a genuinely current eligible PAINTED resets it. Check expiry before entering
   HIDDEN so a late hide cannot save an already expired owner.
3. Each pending media ACK and fence ACK has an independent non-pausable <=30000ms
   operation deadline, capped by startup while startup applies. A toggle never
   resets an outstanding operation's deadline. Missing ACK, stalled renderer,
   failed port or hung support leads to Stop even while hidden. No paint-health
   waiver can excuse transport failure.

Source inspection: `RetainedVideoSession.StreamTime` computes the remaining
30000ms from `lastMedia`; `RetainedAdbProtocol.VideoMedia.Emit` invokes that callback
in its initial-credit and write/flush waits, not only between socket reads. Native
progress is therefore independently checked through those waits. Nevertheless it
is not a substitute for the explicit exact-send main ACK timer above: a flushed
packet can precede its renderer consumption, and native progress timestamps are
not the main pending-delivery deadline.

Native `RetainedVideoSession` encoded-media progress and existing provider/writer/
credit/cleanup deadlines are untouched. Hidden transport still flows through the
real sink and renderer validation/CONSUMED path; an ACK means only bounded ownership
release, not a draw or native retirement. Genuine sustained hidden mode may last
while independently validated encoded traffic progresses, but stalled media still
expires natively. No native health is renewed with visibility/config/credit alone.

Send `remainingMs` in fences as an upper bound for the renderer's local watchdog.
It cannot control main authority. Renderer charges its own visible elapsed time
and never increases an existing unrenewed allowance on a fence; it may conservatively
time out earlier due to transit. Only successful local draw can renew its watchdog,
and main independently checks PAINTED. Initial startup local deadline stays intact.

## 6. Accounting and UI truth

Add one `hidden` discard reason to `VideoAccounting`, its `accountingSnapshot`
conservation checks and the renderer popover display/fixtures. Preserve:
`admitted = drawn + discarded + outstanding` and
`discarded = waitingKey + reset + stopped + hidden`.
Every valid KEY/DELTA reaching decoder admission is counted once, including hidden
and waiting-fresh drains; CONFIG and SESSION are not media-frame admissions.
`submitted` counts only actual decode submissions. Outstanding pending/held settle
once on hide. Stale callbacks cannot count again; counter overflow still invalidates
accounting rather than rounding. A draw already executing during a reentrant hide
uses existing deferred settlement: a successful draw counts drawn, but emits no
current PAINTED/renewal after invalidation, and the canvas must be cleared after
the draw returns so no stale image survives. Failed draw settles the deferred
hidden/Stop outcome exactly once. Do not claim physical/GPU presentation.

Use existing tile status space for PAUSED_HIDDEN and WAITING_FRESH_KEY; keep Stop
available. No V9 rearrangement or fake ACTIVE/input changes. Preserve stale sampling,
identity and last-reading fences in the P3-11 preview accounting UI. Read the complete
V9 reference before renderer implementation; source entry makes no visual claim.

## 7. Exact implementation inventory and verification gate

Expected production files/functions:
- `desktop/src/main.ts`: captured BrowserWindow observer production adapter and
  private bridge dependency; existing lifecycle teardown integration.
- `desktop/src/video-stream-bridge.ts`: `installVideoStreamBridge`, owner lifecycle,
  `send`, `sink.accept`, port handler, `arm`, Stop; split operation deadlines from
  presentation budget, ordered epoch fences and fresh packet-frontier eligibility.
- New `desktop/src/video-presentation-contract.ts`: exact v2 private-port variants;
  existing `video-media-contract.ts` v1 schema remains unchanged.
- `desktop/src/video-decoder.ts`: `receive`, `process`, `output`, `reset`, `schedule`,
  `accountingSnapshot`, plus `presentation` fence method; cursor/async-token split.
- `desktop/src/renderer.tsx`: `attachVideo`, captured port routing, lifetime-safe
  document observation/hint and draw guard, unchanged stronger pagehide/unmount Stop.
- `desktop/src/video-stream-contract.ts` only if existing REFUSED parser lives there;
  do not alter public START/STOP or port-transfer metadata schemas.
- Existing `video-decoder.ts` accounting checks and `renderer.tsx` `readPreview`,
  `currentPreview` and preview popover render; hidden-count conservation/display. Source module/build/manifest
  lists and qualifier fixtures only where the real new private protocol requires it.

Do not edit native producer/retained transport, DeviceActor, discovery target/ticket
lifecycle, profile/resource-policy services, settings or public API. If implementation
cannot preserve these boundaries, stop and return a revised entry for review.

Required focused source tests (actual application modules, not standalone model):
- Observer production wiring; foreign sender/window, replaced/destroyed window,
  getter failure, startup show:false, blur-only no transition, duplicate events,
  subscribe/read race and listener removal on each terminal path.
- Bridge+decoder joined port fixture: real CONFIG/KEY/draw then hide, many packets
  beyond three-paint bound with constant memory, show, DELTA drain, later IDR draw.
  Prove same native session, no repeated begin/reserve/Stop or actor/profile call.
- Hide with two pending outputs and one held unconsumed packet; pause during support,
  creation/configure/decode/output/draw/CONSUMED/state callbacks; late resolve/reject
  and stale output; no duplicate ACK, no busy-state theft, every VideoFrame closes.
- Hide/show before first paint keeps original startup expiry; 29s visible then hidden
  then resume leaves <=1s. Repeated toggles/hints/configs do not refresh budgets.
  Real current paint renews; old epoch paint cannot. Clock faults fail closed.
- Missing fence ACK, missing CONSUMED, stopped encoded progress while hidden,
  pending lower sink/Stop/refusal path: deadlines and retirement remain independent.
- Key partially assembled at VISIBLE fence, pre-hide held KEY, queued KEY and old
  CONFIG cannot qualify as fresh. Later same-config IDR can; a non-IDR KEY, wrong
  SPS/PPS, regressing PTS, changed geometry, oversized CONFIG and missing config fail.
- Unknown/future epochs, duplicate ACK, old valid paint, wrong video/identity,
  extra/accessor keys, transition limit, controls coalesced while ACK held, final
  trusted state differs from fence state; bounded queue and truthful Stop.
- Accounting conservation after hidden drains, held settlement, draw reentrancy,
  reset/Stop/failure/overflow; UI exact schema and stale sampling preserved.
- App renderer integration captures correct port; listeners cleaned up; unmatched
  document.hidden grants no deadline waiver; unmount/disconnect/pagehide/Stop wins
  over resume and pending capability work; no cached canvas repaint.

After implementation, coordinator must run focused decoder/bridge/protocol/renderer/
accounting suites, strict types, lint/module boundaries, full current desktop and
foundation/Python regressions and production/qualifier builds. Run exact repository
commands from current tooling, recording actual command/counts, not copied expected
counts. Independent source review precedes publication and exact-head Windows CI.
Later real Electron hide/minimize/restore with background throttling, visual V9
parity, decoder/native runtime and device acceptance remain separately open.

## 8. Entry outcome and exclusions

Source feasibility: **YES for owned-window hidden/minimized suspension with the
above protocol changes**. Existing main-owned window is sufficient authority for
that subset; it is **not** sufficient to attest arbitrary document/CSS/offscreen
claims. No new device or lifecycle authority is needed. This is an application
integration task, not validation scaffolding. Proposed plan does not earn source,
integrated or formal acceptance credit on its own.

This drafting session runs no tests/builds, no native/device operations and no
publication. Required implementation gates are NOT_RUN. Historical full C, visual,
Electron/native/device, predecessor and P1-06 gates remain open. Coordinator records
review/adoption and any canonical status updates separately; this author changes
only this file.
