# P1-07 canonical criterion audit — 2026-10-31 13:14 UTC

Coordinator disposition: **TECHNICAL_PASS / DEPENDENCIES_PENDING** on exact public
`7568f727bf00727b35b20ac5af459e3967f6f9b3`, tree
`44cf87e3a39fcaa86ee5056d18968a56b6d2202e`, run41204195482 SUCCESS.
[Detailed evidence/artifact hashes](P1-07-settings-source-2026-10-31.md),
[approved contract/amendments](../phases/PHASE-01-P1-07-SETTINGS-CONTRACT.md),
[canonical task](../phases/PHASE-01-desktop-foundation.md#p1-07--app-settings-theme-persistence-and-crash-recovery).
This maps the task, not an effort estimate or formal phase acceptance.

| Canonical criterion | Evidence and disposition |
|---|---|
| P1-05/P1-06 dependencies | P1-05 technical scope passed; P1-06 cross-user remains UNMET. Explicit development-only entry permitted independent nonsecret settings; no dependency PASS invented |
| Versioned validated theme/window preferences | Migration3 exact CURRENT/PREVIOUS schema, revision/CAS/row bounds, realSQLite tests and native schema3 persistence; original migration1/2 unchanged |
| Startup defaults and recovery; atomic saves | Approved LIGHT/null dock/tile150 and native geometry defaults; real BEGINIMMEDIATE/CAS/COMMIT; before/after native process crash→retired reopen yields whole old/new state, no mixed settings |
| Dark/Light/layout survive normal close/restart | Actual compiled main/preload/React hydration, saved dock/tile, normal bounds and maximized reopen in both source/unpacked-package modes; no manual read required for initial hydration |
| Malformed/out-of-range settings | Strict parser/schema/realSQLite negatives refuse; startup fixed BOOTSTRAP_FAILED versus already-open RECOVERY_REQUIRED accurately distinguished. Native CURRENT/PREVIOUS corruption→Cancel/Confirm recovery validates new quarantined roots without opening/repairing rejected sourceDB |
| Simultaneous/stale edits | Shared bounded lane and exact CAS negatives; native stale-revision denial plus actual dispatcher/realSQLite composition |
| Reset cancellation and prior version | Native injected Cancel/Confirm, no write onCancel, valid restorePrevious creates new revision retaining oldCURRENT; reset does not overwrite geometry or vault |
| Crash during save / truthful recoverable state | Actual owned COMMIT crashes before/after and native reopen; strict outcome uncertainty/source tests; corrupted rows have explicit authenticated restore under valid supervisor lease, never guessed row repair |
| No external startup replay | Production has no device/account/jobs execution route; local geometry/settings persistence only. Static/module/handler tests and native source/package startup retain disabled service boundaries |
| Windows open/close/relaunch and screenshots | Exact-head jobs PASS; source/package matrices, bound1024×768 Light/Dark images initially visually inspected. Later V2/V3 metadata matches that set, not a new image inspection claim |
| Sender/frame/revocation/late response security | V2 native foreign/child-frame objects against captured actual handler, realreload while confirmationheld→denial/unchangedDB; actual preload timeout/heldreply150ms UI observation composed with direct client late-discard tests. No forged-nativeIPC, genuine-human or immutableDocument claim |
| Rollback/recovery without overwriting database/secrets | Prior revision retained; user-confirmed reset/restorePrevious for valid state; selected owned authenticated backup to NEW quarantine for invalid state. Native sourceDB/WAL/SHM/vault and backup byte witnesses unchanged; ROOT_A/B genuine newroots, not copiedliveleases |
| Settings included in backups | Actual schema3 SQLite + synthetic-key-provider backup/restore tests, composed with P1-05 native encrypted mechanism; final recovery matrix additionally creates/authenticates schema3 MANUAL backup and natively restores it into new quarantined roots |

## Required qualifications / future obligations

- Native answers are verification injections, not genuine widget-click or human-intent proof.
- Recovery corruption is classified by actual SQLite preparation + immutable witnesses;
  the native production path intentionally never opens the corrupt active DB.
- Recovery is established under a legitimate supervisor-held lease. Current developer
  launcher has no stopped-owner command after failed normal launch, and does not admit
  arbitrary RESTORED layouts. P1-10 must close that usability gap with P1-08 UI handoff;
  no lock deletion, silent unlock or full end-user recovery claim is permitted.
- Key-profile/checkpoint/staging writes occur; source-byte witnesses do not mean zero
  filesystem writes, secure erasure, power-loss proof or cross-user portability.
- P1-06 UNMET and formal Phase0/hardware gates remain open. The adopted software-first
  amendment changes development entry only. Full V9 is P1-08, demo boundary P1-09,
  packaging/supervision P1-10; none is inferred from this diagnostic UI.

No further P1-07-specific criterion is unmet within the explicitly approved bounded
technical scope. Technical counts **7/11=63.6%,7/154=4.5%**; formal accepted zero.
