# ADR-0005 — Renderer navigation: immutable document versus containment

**Status: PROPOSED, NOT APPROVED; documentation only.** 2026-10-30 19:30 UTC.
Decision owner: product owner/delegated plan reviewer. Engineering and independent
security review required before any experiment amendment. No implementation grant
or architecture/Phase acceptance follows from this document.

## Context and preserved evidence

[C-05](../16_ACCEPTED_PRODUCT_DECISIONS.md) and [ADR-0001](ADR-0001-desktop-stack-candidates.md)
select the Electron/TypeScript/React direction, not an exact security mechanism.
Canonical [architecture](../02_TECHNICAL_ARCHITECTURE.md) separates privileged main
from typed renderer IPC; AC-01 requires secure IPC and no renderer shell execution.
The disposable G0-12 lab additionally asserted **pre-commit denial AND unchanged
trusted-document URL** for an `about:blank` anchor navigation. These are distinct
claims: privilege confinement does not imply document immutability or availability.

Exact candidate Electron45.1.0, hosted run41113076545: source20/21 and package20/21;
`navigation_denied=false`, denialObserved=false and trustedDocumentUnchanged=false
in both modes. Job/directory cleanup passed. Preserve this failure and all original
21 assertions unchanged, with their [evidence](../evidence/G0-12-hosted-stack-lab-2026-10-30.md).
No finding demonstrates a privilege escape; neither does it prove containment
after navigation in the original privileged window. The existing separate-window
untrusted-sender test is insufficient for that latter claim.

## Alternatives requiring an explicit choice

**A — Retain immutable-document requirement and blocker (current default).**
Do not implement a workaround. G0-12 remains FAIL/BLOCKED until a reviewed mechanism
can prove the original invariant on the selected candidate, or an explicit future
stack decision is approved. No native fork or version swap is authorized here.
Consequence: honest unresolved feasibility, no speculative production foundation.

**B — Authorize a separate containment/availability experiment, not an old-test fix.**
Keep the old immutable-document result FAIL. Add a separately named contract that
permits a transient unauthorized document transition only if it cannot acquire or
retain privileged capability; revoke the document's authority and terminate the
compromised view, with availability loss explicitly reported. This changes the
proposed security objective and requires approval; it is not relabeling20/21 PASS.
Any eventual G0-12 disposition must explicitly address the old invariant by an
approved amendment/deferral, never silently replace it with the new result.

Proposed B requirements (all unproved):
- Keep sandbox/contextIsolation/webSecurity enabled and Node integration disabled;
  no generic invoke/process/filesystem/secret APIs. Runtime schemas and method,
  exact resource and navigation allowlists stay mandatory.
- Main owns per-document generation/revocation state. Bind requests to the actual
  original window, main frame, trusted document and current generation, not URL
  alone or renderer-supplied identity. A changed document cannot regain authority
  merely by navigating back to the trusted URL. New authority requires a fresh,
  main-created view and handshake; never restore the revoked view's token.
- Revalidate authority at privileged dispatch/commit, including after every await
  or queue boundary; stale queued work must never reach an effect sink. Renderer
  lifecycle signals alone are not a proven atomic navigation/dispatch barrier.
  If reliable document identity or race ordering cannot be demonstrated, report
  BLOCKED; do not infer safety from a later navigation callback or teardown.
- Deny resources except exact owned app assets (not the old blanket `file:` rule),
  deny unexpected protocols/redirects/subframes, popups, webviews and permissions.
  No real network or arbitrary filesystem access to test these denials. Request
  interception may not cover no-loader navigation; no claim otherwise.
- Unauthorized transition revokes authority and ends that view. No automatic
  reload, queued-operation replay or effect retry. Any production recovery design
  remains out of scope; uncertain prior external outcomes require reconciliation.
- DOM click guards and CSP navigation restrictions are defense-in-depth at most,
  not proof of privileged pre-commit prevention. Synchronous `stop()` from a
  navigation observer is excluded as an unsafe/unverified workaround, not offered
  as a containment layer.

## Proposed bounded evidence contract (only after approval)

Use the same locked candidate, synthetic owned resources, existing Windows Job
supervision/deadlines and source/package copies. No device, account, secrets,
external service, native fork, version change or production side effect. A private
in-memory synthetic effect counter is the only effect sink. New results have a
separate schema/gate; retain the historical21-case evidence untouched.

| Test | Required observation, independently in source and package |
|---|---|
| Positive control | Fresh trusted document can make one schema-valid synthetic request; effect count increments exactly once |
| Original-window transition | Trigger original `about:blank` navigation in the original privileged window; record transition/revocation separately from old failed denial predicate |
| Post-transition IPC | Attempt valid and malformed requests from that same window's new document; main rejects/no effect, rather than relying only on missing bridge or a second window |
| Queued work | Hold a valid request before synthetic commit, navigate/revoke, then release it: stale generation rejected, effect count unchanged; include cancellation and queue ordering variants |
| Return/reload | Returning to trusted URL or replaying a captured old request/token cannot restore authority; no side-effect replay during teardown or fresh-view recovery |
| Frames and payloads | Wrong frame/window, unknown method, malformed payload and old generation all denied; no new privileged API exposed |
| Resources | Exact owned asset positive control; unexpected owned synthetic file/protocol, subframe and redirect negatives denied; no external destination contacted |
| Availability and teardown | Revocation/termination observable, no silent recovery; bounded owned-tree and directory cleanup verified, missing evidence or timeout fails |

Race tests are necessary but not sufficient: require source-backed reasoning about
identity lifetime and dispatch linearization, then independent review. UNKNOWN,
missing capability or incomplete evidence cannot become PASS. Aggregate acceptance
for the new experiment requires every new check in both modes; it cannot override
the old lab's nonzero result. Design the separate runner/report relationship before
coding so the old failure cannot be hidden by a new green workflow.

## Evidence basis and limitations

Sources reviewed2026-10-30:
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
  recommends isolation, sandboxing, sender validation and limited navigation/windows.
  It does not promise an immutable document or supply a per-document revocation proof.
- [Electron v45.1.0 navigation throttle](https://github.com/electron/electron/blob/v45.1.0/shell/browser/electron_navigation_throttle.cc#L23-L58)
  emits navigation-denial events in WillStartRequest. The GitHub page fetch missed
  cache; the [exact-tag raw source](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/electron_navigation_throttle.cc)
  was fetched and inspected successfully in this drafting session.
- [Chromium navigation throttle contract](https://github.com/chromium/chromium/blob/main/content/public/browser/navigation_throttle.h#L180-L196)
  describes about:blank's non-URLLoader path. This moving-branch source supports a
  mechanism inference, not exact bundled-version equivalence or runtime proof.

Reviewer/source analysis rejects relying on synchronous stop or renderer DOM guards
as a privileged prevention boundary. Chromium [navigation-request observer warning](https://github.com/chromium/chromium/blob/main/content/browser/renderer_host/navigation_request.cc#L2219-L2225)
and [unsafe-to-delete callback scope](https://github.com/chromium/chromium/blob/main/content/browser/renderer_host/navigation_request.cc#L3284-L3290),
with Electron45.1.0 [synchronous navigation-start emission](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_contents.cc#L2541-L2548)
and [direct Stop forwarding](https://github.com/electron/electron/blob/v45.1.0/shell/browser/api/electron_api_web_contents.cc#L3181-L3183),
rule out claiming this as a safe supported workaround. The Chromium-main warning
is not a reproduced crash trace on bundled Chromium156. Exact implementation/API ordering for B is
still unresolved and must be reviewed before coding; this proposal deliberately
does not invent a proven document-token API.

## Decision requested and consequences

Choose A (retain current blocker), or approve only B's bounded experiment after
settling its test/identity/dispatch design and recording the playbook exception.
B carries explicit temporary UI availability loss and added revocation complexity.
Neither option approves production implementation, the complete stack, P0-01 host
checks, full P0-06, policy/device gates or Phase0 acceptance. No canonical acceptance
requirement or approved Phase plan is changed by this proposed ADR. After approval,
record approver/time/scope and required amendment links before implementation.

## Review update — 2026-10-30 19:34 UTC

Coordinator, acting under the owner's delegated plan review, authorizes **B design
and primary-source feasibility research only**. The ADR remains PROPOSED; option A
remains the operational blocker. No implementation, synthetic experiment, acceptance
amendment or production effect is authorized. Determine whether monotonic main-owned
view revocation during synchronous navigation-start observation (state mutation
only, never Stop) plus frame/URL/generation checks at every commit has a defensible
ordering guarantee. Explicitly distinguish initial trusted load, subsequent
navigation/reload and `document.open()`. If exact-source identity/ordering cannot
support the claim, retain BLOCKED. Independent design review is required before any
request to implement a separate experiment.

## Source-feasibility findings — 2026-10-30 19:35 UTC (pending review)

**Current verdict: BLOCKED for the full proposed guarantee; no experiment code.**
The following narrower logical property is plausible, but is not the requested
all-document guarantee: once main has irrevocably revoked a view, a synchronous,
non-reentrant synthetic commit that checks that state cannot accept work from it.
A check before an await is insufficient. A renderer transition can precede main's
observation; single-threaded JavaScript does not itself prove cross-process ordering.

Exact-tag sources inspected:
- [v45.1.0 DEPS](https://raw.githubusercontent.com/electron/electron/v45.1.0/DEPS)
  selects Chromium156.0.8078.49 and applies patches. Chromium-main is not a substitute
  for that source plus patch set.
- [WebContents callback](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/api/electron_api_web_contents.cc)
  DidStartNavigation emits its event synchronously under unsafe-to-delete protection.
  State mutation alone avoids the proposed Stop/destruction hazard; this does not
  establish event coverage for every document mutation or renderer IPC ordering.
- [WebFrameMain implementation](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/api/electron_api_web_frame_main.cc)
  tracks FrameTreeNode across navigation and separately maps RFH tokens. Its URL
  accessor reads the last committed URL; frameToken exposes LocalFrameToken. Neither
  is a documented application-visible document-incarnation identifier. The existing
  WebFrameMain wrapper can update its RFH/token during a swap (lines229-246 and
  769-774), so wrapper object equality is not document identity. Rechecking URL/frame
  is necessary but cannot by itself distinguish same-URL replacement.
- [IPC handler](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/electron_api_ipc_handler_impl.cc)
  binds to RFH identity and constructs events before invoking dispatch. No
  application revocation generation is supplied by this API. The [IPC event implementation](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/api/electron_api_ipc_event.cc)
  captures RFH/FrameTreeNode IDs and resolves senderFrame on each read, rather than
  exposing an originating Document token. The proposed generation remains main-owned
  application state, not a native Document token.

| Boundary | Necessary design condition | Unresolved proof obligation |
|---|---|---|
| Initial trusted load | Start unauthorized; main deliberately requests one exact owned entry; authorize only its verified completion/handshake | A URL match/first-event exception cannot distinguish an interrupted load or same-URL replacement without lifecycle identity/order proof |
| Later navigation/reload | Any observed later main-frame transition permanently revokes the view, including same-URL reload; never rearm it | Confirm relevant browser/renderer ordering and coverage on exact bundled source; do not promise revocation at renderer initiation |
| Queued operation | At commit recheck live view, frame, URL, generation and revocation, with no await/reentrant call between check and synthetic effect | Work already committed before observation cannot be retroactively cancelled; external dispatch/cancellation is out of scope |
| `document.open()` | Treat separately from ordinary navigation; do not assume new URL/frame/token or navigation-start event | Need a supported main-observable document-incarnation/coverage mechanism, or a separately reviewed narrower threat contract; neither currently established |

The [HTML standard's document-open algorithm](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#document-open-steps)
reuses the Document in place, removes its nodes/listeners and updates URL/history
from the entry document. This is a concrete reason not to equate document content
replacement with normal navigation. It is standards evidence, not a reproduced
Electron45.1.0 trace or proof that no other notification exists. The exact
WebContents source search found no DidOpenDocumentInputStream override; absence of
that one name is not a complete event-coverage proof.

Access limitation: exact Chromium156 document.cc and web_contents_observer.h raw-tag
retrieval returned cache miss; the googlesource tagged document.cc endpoint was
inaccessible through the web tool. No patched runtime source was substituted with
main and labeled exact. All new runtime checks are NOT_RUN. Remaining action is
independent source/design review and an explicit decision on these unresolved
identity/ordering requirements, not another blind CI run or a relaxed old test.

Independent ordering review19:36UTC agrees with the bounded conditional property:
listener state mutation must be first, synchronous, monotonic and free of awaits,
API calls or reentrancy; synthetic sink validation and effect must be one synchronous
non-reentrant step. [Exact-tag IPC dispatch](https://raw.githubusercontent.com/electron/electron/v45.1.0/shell/browser/api/electron_api_ipc_dispatch.cc)
invokes JavaScript handlers and handles asynchronous completion; an await or queue
release is not a navigation-notification flush/barrier. Initial bootstrap remains
one-time/main-owned while authority is denied; never rearm on did-finish-load or
exempt later same-URL reload/return. Already-admitted native/worker effects cannot be
retroactively cancelled by the latch. Independent review retains full B BLOCKED;
this conditional proof does not authorize experiment code.
