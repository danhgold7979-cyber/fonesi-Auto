# P2-11 bounded diagnostic collection and export source entry

Start: 2026-11-03 02:16 UTC. Branch phase-02, base a57987e696c6edef7b4457a07f0595c5361ba79b, isolated fonesi-Auto-phase-02 worktree. The coordinator assigned this source-only continuation under the user's instruction to self-allocate and complete the work. No publication before coherent review. Main, P1-06 security proof, host/device access and technical/formal acceptance are unchanged.

## Bounded deliverable and integration

Implement one main-only, bounded result collector and an explicit typed export service, with actual disposable-filesystem tests. This first batch owns new modules and tests only: it does not edit the shared P3 host factory, actor, lifecycle, discovery facade, main bootstrap, preload or UI. The operator entry is a typed main-owned API for subsequent native-dialog/IPC integration, not a claim that an operator UI exists. The first batch is useful complete internal export machinery; P2-11 remains IN_PROGRESS until actual facade collection and operator integration/qualification close.

- New main collector accepts only the existing DeviceDiagnosticInput closed schema through createDeviceDiagnosticEncoder. No raw output, file paths, device serial/IP, argument text, arbitrary messages, screenshots, UI trees, secret-store data or existing log-directory scanning.
- Retain at most 512 encoded results / 512 KiB. Freeze each export snapshot. On capacity overflow reject the new record and increment a bounded dropped counter; never silently evict unresolved outcomes. Session-local memory is supplemental diagnostics, not durable intent/reconciliation evidence. Existing durable records remain untouched.
- Emit exactly two files in a newly created export directory: manifest.json and commands.ndjson. Manifest carries fixed format/version, record count, dropped count, payload byte count and SHA-256. No raw UUID device map is exported; existing per-instance pseudonyms and command/correlation IDs retain their existing semantics.
- Main trusted caller selects a parent directory; no renderer path API. Fixed child name derives only from a validated fresh export UUID. Creation is exclusive, collision refuses without overwriting. Parent must be an existing real directory, not a symlink; revalidate identity before writes/publication. This is not a defense against a concurrent malicious local filesystem actor.
- API request contains only version and exportId; AbortSignal and current-owner predicate supplied by trusted main. Exactly one export at a time. No reusable capability is returned to renderer. On owner loss, cancellation, or failure before success, close handles and remove only files created by this attempt. Never recursive-remove a directory or touch a collision. Cleanup failure is explicit and preserves a truthful failure result.
- Write via exclusive file handles, flush and close, then read back exact bytes/hash and exact two-file inventory before success. Filesystem failure, malformed input, BUSY, CANCELLED, OWNER_REVOKED, COLLISION and CLEANUP_FAILED produce finite results with no raw paths or OS exception text.
- Cancellation is checked before creation and after every asynchronous boundary. Export does not consume records; concurrent append appears only in the next snapshot. Closing collector prevents append/new export; in-flight work fails its owner fence and cleans up.

## Tests and scope limits

Tests cover exact schema and hostile getters/extra fields, secret/serial/IP canary exclusion, bounded records/bytes/dropped count, immutable snapshot, concurrent append, invalid export ID/path, collision and unrelated-file preservation, concurrent requests, cancel before/after write, owner revocation, write/readback/cleanup failures, exact inventory/hash/byte counts, and empty exports. Use owned temporary directories only. No Electron/native execution or account/device operation.

Expected new files: desktop/src/main/device-diagnostic-collector.ts, desktop/src/main/device-diagnostic-export.ts, and matching desktop/tests/*.test.mjs. Add module-map entries only if required by the existing checker; do not claim product integration for unreferenced modules. Run targeted node tests, strict TypeScript, formatting and applicable module graph checks; full existing suites after final review when available. No percentage/acceptance increment accompanies source entry.

Independent design review: CLEAR, 2026-11-03 02:19 UTC (independent reviewer). Required details adopted: reject encoder sentinel, count UTF-8 newline bytes, saturate dropped counter, retain the existing 256-device pseudonym bound, verify exact owned filesystem identities before nonrecursive cleanup, and fence immediately before final success. Implementation may start within this bounded scope. Next coherent integration batch will wire actual outcomes and parented save-dialog/typed IPC/UI under the existing view-session policy, coordinating shared touchpoints with P3 author.

## Local source checkpoint

Implemented bounded collector/export engine and actual-file tests; [evidence and remaining integration](../evidence/P2-diagnostics-export-source-2026-11-03.md). Independent review required bounded readback and explicit unknown-inode refusal; both are implemented. Native operator integration and task acceptance remain open.

## Direct operator integration continuation — 2026-11-03 02:34 UTC

Coordinator authorized continuing the same P2-11 feature from local 9a6752db, not another disconnected helper. No publication or actual user filesystem export is part of this task. One phase-02 writer owns this change; P3 author reviews the forward-compatible shared facade interface.

### Actual outcomes and lifetime

Add an optional `captureDiagnosticObserver` constructor callback to discovery-session-service, returning a bounded synchronous observer or null. Capture once per admitted inputPress/metadataRead before asynchronous work, after busy admission. The main callback captures the current window's collector; later window replacement cannot redirect old results. Existing actor results are projected into the closed DeviceDiagnosticInput DTO: registry UUID deviceId, existing command/correlation UUIDs, fixed operation/outcome/code, UNKNOWN health and null duration (no guessed timing/health). Save the projected DTO when actual actor settlement occurs; invoke observer once only after existing state, required audit and cleanup/finalization work. Catch observer exceptions, never await it, and never change the operation's result. No raw observation, serial, command argument, transport handle or source payload crosses this observer. No host/factory/actor implementation edits.

### Operator service and protocol

Create one main service and collector per admitted BrowserWindow. Closing/revoking the window closes the collector and aborts active export. The old collector and in-flight observer never attach to a new window. Service shutdown returns a drain promise for already-started owned export cleanup; do not quit ahead of an unsettled filesystem write.

A strict new view-session bridge uses three finite methods: diagnostics.get, diagnostics.export and diagnostics.cancel. Requests carry version1/requestId, plus expectedRevision for export and operationId for cancel. No renderer path/data/inventory argument. Requests are size-bounded strings parsed through exact-own-key JSON schemas; responses expose only finite state/code, revision, opaque operationId, counts/bytes/hash. No raw OS error or path. Export/cancel request IDs are deduplicated with a finite cap. Export CAS prevents stale/repeated-click starts.

Export immediately returns PENDING with a main-allocated UUID, while a captured parented native folder picker runs. Cancellation moves to CANCEL_PENDING and aborts the operation; it cannot falsely claim the native picker was closed. The service remains busy until the picker/owned cleanup actually settles. On selected directory, invoke the existing bounded engine with captured operationCurrent/view and owner predicates; cancellation/owner loss during picker causes no file creation. Final terminal states are EXPORTED, CANCELLED or FAILED; CLEANUP_FAILED remains explicit. Window revocation suppresses publication and drains already-started cleanup.

Preload exposes only get/export/cancel typed methods, with the shared invocation budget and bounded request timeout. A timed-out mutating RPC is not automatically retried; UI reads status to reconcile. Main's operation stays tracked until terminal even if renderer timeout/release occurs. A bounded status poll while PENDING/CANCEL_PENDING shows actual completion; no export on mount, no automatic re-export, no periodic background filesystem action.

Use the existing Help/settings diagnostic surface in renderer.tsx: read status, explicit export and cancel buttons, finite result/count status. Preserve V9 shell/navigation/layout; no new top-level surface or ui-shell edits. Actual screenshots/native dialog execution remain NOT_RUN in this Linux source task; UI source behavior and composed service/bridge tests must pass before claiming source integration.

### Files and tests

Add diagnostics-report-contract.ts, diagnostics-export-client.ts, diagnostics-export-bridge.ts and main/diagnostics-export-service.ts. Modify main.ts, preload.ts, renderer.tsx and discovery-session-service.ts only for this integration, plus exact module/test inventories and affected tests. Coordinate P3 forward merge for these shared files; do not overwrite its renderer accounting or current facade changes.

Test exact schema/hostile extra fields, budget/timeout/late-response behavior, duplicate IDs, export CAS, repeated clicks, dialog cancel/owner loss, cancel during pending picker/write, close/drain, old-window observer closure, real disposable-file export inventory, bridge sender/view fencing and actual finalized actor-result projection with observer exceptions/reentrancy unable to retarget or alter outcomes. Run targeted changed suites during iteration and one final integrated gate after review. P2-11 remains IN_PROGRESS until its full operator/native criteria are genuinely evidenced.

Continuation design review CLEAR 2026-11-03 02:37 UTC with the details below adopted. P3 interface direction CLEAR 2026-11-03 02:38 UTC: capture after request admission; emit after existing finalizers; exact forward-integration diff review remains required. No P3 source edits.


Review details adopted: shutdown revokes synchronously; a pending picker alone may detach with rejection handling and a permanent revoked fence, but every started filesystem export is drained, including old-window work. Ordinary cancel remains busy until picker settles. Mutation request IDs retain canonical request and original response; identical repeats return that response, conflicting reuse fails, and cap exhaustion rejects new mutations without eviction. Both observer capture and notification catch exceptions/reentrancy, capture after busy admission, and retain the originating collector rather than resolving a later current window. Composed tests cover delayed-write shutdown, late old picker after replacement and dedup conflicts/cap exhaustion.

Implementation review CLEAR, 2026-11-03 02:54 UTC. Adopted fixes latch CLEANUP_FAILED across later successful exports, capture the metadata observer before awaited admission audit, and prevent a pre-launch cancellation from opening the picker. The contract filename is diagnostics-report-contract.ts to remain compatible with the existing restricted renderer lexical build. The encoder now faithfully accepts actual OK/DISPATCHED_UNCONFIRMED input receipts without converting them into observed success.

Build provenance includes all six newly consumed diagnostics modules. Exact source inventory is 126 modules, 129 traversal entries and a 66,328-byte module map; bounded checker caps are 126 modules, 132 entries and 69,632 bytes. Quality traversal is 517 entries / 418 files, within a 520-entry cap and unchanged 512-file tool-target limit. These are source inventory bounds, not runtime safety or test-assertion relaxations. Independent mechanical review confirmed no removed checks or output changes.

Exact phase02 facade/encoder diff versus 9a6752db independently reviewed CLEAR, 2026-11-03 02:56 UTC. Capture, finite actual DTO projection, finalizer order, exception isolation and originating-window binding match the P3-approved interface direction. This clears the local source checkpoint only; review of the coordinated forward merge onto later P3 source remains separate.

## Phase2 return: lifecycle and elapsed diagnostic closure, 2026-11-03 15:14 UTC

User now prioritizes Phase1/2; this worker owns Phase2 only on verified canonical phase-02/c43620e11d96ea7488cd1bb2fad0a1349d648c2a. Later phase worktrees are clean and not modified. No device, native Windows invocation or push. Canonical P2-11 remains partial, with native operator/real-device trace and health production evidence open.

Reproduced source defects: an injected timer.set that synchronously disposes the diagnostics client still allows one invoke; a thrown timer.set leaks one shared lease. Repair pre-dispatch callback fences and exception cleanup without releasing actual outstanding invoke promises on timeout/dispose. Cancellation keeps the same reserved cleanup slot. No mutation retry or session replacement is added.

Actual facade currently emits durationMs:null for every actor outcome. Add source-owned captured monotonic clock sampling immediately before owned metadata.read/input.press and immediately after that promise settles. Record floored elapsed milliseconds only for finite nonnegative interval <=86400000; otherwise null. This is owned-operation elapsed time (including its queue/provider/retirement), not pure device/network latency and not pre-admission/result-audit duration. Clock failure remains optional diagnostic unavailability, never command failure; actor correlation/outcome and later observer ordering remain unchanged. Health remains UNKNOWN until a genuine captured producer exists; no inference from success/error codes. No actor result means no invented record.

Also port the reviewed same-repository retained-pipe test-only deterministic two-turn deadline fixture from4670b539, replacing accelerated15ms wall timing. Keep real helper source/deadlines unchanged and add explicit ordering/cancellation counterproof. This is CI reliability repair, not a phase acceptance increment or proof of earlier failed-run cause.

Expected files: diagnostics-export-client/test; discovery-session-service/test; module-map exact perf_hooks import; retained-pipe-startup test; this entry and existing evidence/criterion ledger. Focused lifecycle, actual-facade and deterministic fixture tests, source graph/type/quality, independent review, then one final desktop gate. Preserve all existing raw-failure chronology, source/native distinction and P2 technical1/13; no artificial completion percentage.
