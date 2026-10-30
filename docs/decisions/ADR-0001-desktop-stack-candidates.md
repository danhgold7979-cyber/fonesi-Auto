# ADR-0001 — Desktop stack and version selection

Status: ACCEPTED STACK DIRECTION under C-05/C-06; exact versions and compatibility PENDING. Date: 2026-10-30. No production implementation approval.

## Context
The approved product is a clean-slate Windows desktop application retaining the full V9 visual reference. Technology-family choices do not prove version compatibility, binary licensing or target-host support.

## Recommendation and alternatives
The user selected Electron + strict TypeScript + React, SQLite persistence, Windows secret storage, an isolated Python CPU-first vision worker, ADB as input authority and scrcpy as video-only support. SQLite binding, exact Python/OCR model and dependency versions still require tested selection. Plain TypeScript/Vue/Tauri were prior alternatives, not current choices; a feasibility problem must be reported before proposing a stack change.

## Evidence required before acceptance
- Record exact Windows edition/build/support policy, runtimes, dependency lock strategy, binary sources, checksums/signature verification method and licenses.
- Compare startup, memory, IPC isolation, clean install and V9 fidelity on the target Windows host; publish measured results, not invented thresholds.
- Select stable UI Automator deployment approach and validate Python/OCR wheel/model compatibility and Unicode text round-trip.
- Choose minimum supported host/device matrix and document unsupported combinations and upgrade implications.
- Engineering proposes exact version pins and compatibility evidence for phase review. The accepted technology direction is not permission to substitute a different stack. Until verified, any version in a reference/prototype is a candidate only.

## Consequences and rollback
No app skeleton should pre-commit an unresolved choice. Keep adapters explicit so version changes do not transfer device-input ownership. Record the prior accepted version and migration/rollback evidence when any dependency changes.

Trace: G0-01, G0-09..G0-14; Phase 1 foundation; [decision register](../08_DECISIONS_AND_OPEN_ITEMS.md).

## Acceptance update
- 2026-10-30: User accepted selected direction in [C-05/C-06](../16_ACCEPTED_PRODUCT_DECISIONS.md); this supersedes the earlier framework-choice proposal, not compatibility/test gates.
