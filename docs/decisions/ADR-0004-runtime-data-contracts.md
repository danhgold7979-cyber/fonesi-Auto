# ADR-0004 — Identity, durable effects and typed runtime contracts

Status: PROPOSED. Date: 2026-10-30. Requires schema/contract review before migrations or implementation.

## Context
Per-device account rows alone cannot enforce a cross-device account publication lease. Process restarts, device reconnects and ambiguous external effects must not produce duplicate actions or falsely verified results.

## Proposed contract
- Distinguish global platform AccountIdentity from per-device Account/session records, with observed identity evidence. Unknown identity cannot acquire a publish lease.
- Hold whole-workflow device ownership, not only command-level serialization. Conflicting manual inputs, APK mutation and proxy changes refuse or require explicit pause/takeover; drain and reconcile possible effects before transfer, then invalidate captured UI/account state. Read-only diagnostics require a proven noninterfering path.
- Persist account/device ownership and fencing generation; stale owners cannot dispatch. Lease expiry alone cannot prove an uncertain external action failed.
- Persist effect intent before dispatch; distinguish not-dispatched, known failure, verified success and unknown outcome. Reconcile unknown effects against permitted evidence before any requeue.
- Restore from an older backup quarantines all dispatch until post-snapshot effects are reconciled. Restored NOT_DISPATCHED is not proof of no external effect; never replay forgotten post-backup work blindly.
- Device generation and capture timestamps bind screenshots/UI/OCR results to the transport/session that produced them. Reject stale evidence.
- Typed bounded IPC includes schema version, request/correlation ID, explicit device/session, timeout/cancel, validated payloads and bounded response sizes. Renderer cannot execute arbitrary commands or access secret values.
- Stream settings persist requested/effective values and revision, while telemetry includes unit/source/availability/freshness.
- Import/media contracts enforce path containment, exact mapping, stable hashes and atomic preview/commit. Export must address spreadsheet formula injection.
- Schedule occurrences use stable logical local date, slot identity and approved DST-overlap choice for deduplication across schedule revisions. Snapshot revision/timezone on each job and reconcile edits; a new revision alone must not generate another occurrence or duplicate effect. C-10/C-11/C-18/C-19 now select DST gap SKIP with notification, overlap earlier once, missed-run REVIEW, bounded AUTO_SHIFT and exact recurrence/row-override semantics; deterministic fixtures must prove them.

## Alternatives and consequences
Pure in-memory locks and per-device account IDs are simpler but insufficient across crashes/multiple devices. Durable leases and effect journals require transactions, migrations, recovery fixtures and clear ownership; they do not promise exactly-once behavior from an external UI.

## Acceptance before implementation
Review schema uniqueness/foreign keys/indexes and migration rollback. Test stale fencing, duplicate identity across devices, restart between dispatch/readback, cancellation after possible side effect, clock/transport changes, unauthorized IPC/path access and imported formula strings. Accepted C-13/C-14/C-21/C-22 define retention, secret-store direction, staged cleanup and backup cadence. Exact key portability, schema and restore implementation still require proof. No production or physical-device PASS is asserted here.

Trace: P1-02/P1-05, P5-13, P7-07, P8-05/P8-07/P8-10; [data specification](../03_DATA_AND_WORKFLOWS.md); [open decisions](../08_DECISIONS_AND_OPEN_ITEMS.md).

## Accepted product-direction update
C-04/C-12/C-18–C-22 in the [accepted checklist](../16_ACCEPTED_PRODUCT_DECISIONS.md) constrain these proposed technical contracts. Ordered album membership, tool-owned staging, retained metric history and backup manifests must implement those choices; technical schema/index/fencing values remain reviewed implementation details, not arbitrary defaults.
