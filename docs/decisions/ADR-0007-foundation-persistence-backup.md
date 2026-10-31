# ADR-0007 — Foundation SQLite and encrypted local backup

**Scoped technical approval: 2026-10-31 07:05 UTC.** Coordinator approval under the
user's delegated Auto implementation authority; development-only cross-phase
exception, not original Phase 0 or full Phase/task acceptance.

The [P1-05 persistence contract](../phases/PHASE-01-P1-05-PERSISTENCE-CONTRACT.md)
is the exact implementation specification: pinned node:sqlite API, two migrations
and five foundation tables, owned exclusive roots/locks, AES-256-GCM container,
Windows safeStorage backup-key wrapping, selected backup-location identity,
24-hour automatic admission, seven ordinary copies plus protected migration copies,
restore provenance/quarantine, and five exact trusted maintenance arguments.
Existing v1/v2 public-read IPC is unchanged. No generic vault, domain tables, device
service, plaintext fallback, new dependency or V9 redesign is authorized.

Selected key initialization is conservative: provision, observed orderly shutdown
and whole-owned-tree retirement, reopen and authenticate the OLD bootstrap backup;
then mandatory abrupt-exit/reopen evidence before migrations rely on that profile.
First-process encrypt/decrypt or availability=true is not durable key custody.
If the selected mechanism fails actual pinned Windows tests, dependent migration
remains blocked; fix within scope or return the exact failed requirement, never
waive encryption/backup prerequisites. Profile/OS-provider writes are not claimed
absent; preserve owned original material before corruption testing/native reuse.

Record entry before code, then coherent source/negative-test checkpoints,
independent review and exact-head Windows verification. The original 12 Phase 0
exits, navigation FAIL_RETAINED, C-03/C-04/C-05 and full V9 remain unchanged.
