# P1-05 canonical criterion audit — 2026-10-31

**Coordinator disposition:** TECHNICAL_PASS at 10:54 UTC. **Formal acceptance:**
DEPENDENCIES_PENDING through the unchanged original Phase 0 chain. This is one
canonical task, not a collection of new partial task IDs.

Canonical source: [Phase 1 P1-05](../phases/PHASE-01-desktop-foundation.md#p1-05--migrations-wal-foreign-keys-and-backup-tests).
Implementation authority/precise conventions: [ADR-0007](../decisions/ADR-0007-foundation-persistence-backup.md)
and [persistence contract](../phases/PHASE-01-P1-05-PERSISTENCE-CONTRACT.md).
Dated source reviews, failures and corrections remain in the
[chronological evidence](P1-05-persistence-source-2026-10-31.md).

## Exact accepted technical checkpoint

- Public head `2e8c08b7df8448c7db89438891da66bce7b8b715`; local `060864f2d1b19280313818edf837d81fd7b5576d`;
  exact tree `c83aa38ef36b62c4f285faea128d05e41ebf7696`.
- [Windows run 41194352059](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41194352059),
  job `124517397876`, SUCCESS. Named isolated Windows development environment,
  not certification of the user's Windows 10/device environment.
- [Sanitized native matrix](P1-05-matrix-sample-2026-10-31.json): 12,673 LF bytes,
  SHA256 `67101e46256ccaef14e8d1370f5f8d9d62e8db1109a98a093aedabaf47a42f77`.
- [Sanitized launcher report](P1-05-launcher-sample-2026-10-31.json): 515 bytes,
  SHA256 `9d168c036e599010fbe6fb71c74f18606c02d294c429a2acec163a1e69680dfc`.
  Hashes identify exact artifact/Git blob bytes, not an unconfigured checkout conversion.
- Independent review parsed original bytes duplicate-aware, reconstructed the exact
  committed schema and checked fixed-field privacy. It was not a second native run
  or artifact download. The final launcher bytes equal the independently reviewed
  successful launcher artifact.

## Criterion-by-criterion map

| Canonical requirement | Implementation and actual evidence | Disposition / qualification |
|---|---|---|
| Versioned migrations, transactional lock, WAL/FK, incompatible versions | `foundation-database.ts`; real SQLite schema/history/content-witness tests, actual FK rejection, corrupt/newer-schema refusal and native READY schema 2 | MET for approved two-migration/five-table foundation, not speculative domain tables |
| Empty install, repeated launch, prior fixture migration preserve constraints | Real initializer/control/main first launch and same-root reopen; launcher 14/14; prior-version-1 migration and repeated-open tests in `foundation-persistence.test.mjs` | MET; native dialog answers and quit-after-READY are instrumented, not genuine widget clicks or installed packaging |
| Backup before migration; failed backup blocks DDL and preserves good copies | Authenticated old-backup prerequisite plus fingerprint recheck inside BEGIN IMMEDIATE; key failure, tamper, intervening DML and partial-write ENOSPC tests | MET; ENOSPC is injected after a successful real owned container write, not physical disk exhaustion |
| Consistent encrypted online snapshot and separate restore with matching records | Real SQLite backup API, AEAD/header/receipt reauthentication and fingerprint checks; second-connection WAL commit test; native source/package maintenance and copied-profile restore | MET; unsettled snapshot-promise overlap does not prove native page-copy overlap; no plaintext fallback |
| Daily coalescing, manual trigger, chosen folder, seven validated ordinary copies, protected PRE copies | Persisted admission/fake-clock catalog tests; native READY/daily admission, maintenance 18/18 per mode, retained 7 ordinary + 1 protected + 1 released safety copy | MET; only validated copies count; no cloud upload. Bounded catalog/fixture limits are documented defensive limits, not product device capacity |
| Interrupted migration, concurrent writer and write denial fail safely | Actual before/after-COMMIT owned crashes and reopened DB witnesses; actual second SQLite writer BUSY; all four reopen groups 10/10 include actual ReadOnly errcode 8 at admitted migration write | MET; write observer delegates unchanged SQL/error and restores owned attribute after handles close. No host ACL/account/security-setting change |
| Corrupt/missing required state, unsafe live copy, unsupported schema do not reset data | Real SQLite corrupt/newer/FK tests, authenticated-container tamper/truncation tests, copied-profile missing/corrupt prerequisites, original-key backup reauthentication and exact restore provenance | MET compositionally for unsafe raw copies: only authenticated container + schema/fingerprint restore is accepted and no raw live-DB restore route exists; no dedicated WAL-stripped live-copy-loss experiment is claimed. Copied-profile corruption negatives are pre-native, not OS key revocation; wrong-key unit tests use synthetic providers |
| Restore quarantine and safe rollback to new location | Separate authenticated fresh-root restore, source DB/WAL/SHM witnesses, persisted schema 0/2 quarantine, native restore 11/11 per mode, auto admission denied in restored context | MET; no overwrite/downgrade of original DB. Future actual-effect reconciliation belongs to Phase 8; no claim an old NOT_DISPATCHED record proves absence of effects |
| Windows evidence, encryption/key portability constraints, no raw secret columns | Exact-head source/package native groups all PASS; current runtime/provider and old-key witness gates; fixed sanitized reports; approved schema stores references, no raw password/token fields | MET within same-user/machine profile scope; not cross-machine portability, arbitrary power-loss durability, generic vault or production-secret evidence |

All native process and directory cleanup predicates are true; aggregate failure is
null. Existing public IPC remains the two bounded public reads, not a persistence
or secret service. The historical navigation result remains `FAIL_RETAINED` in the
foundation evidence; no immutable-Document claim or genuine-human-intent proof is
inferred from this persistence task.

No P1-05-specific criterion remains pending within the approved qualified scope.
Formal Phase 0/task-chain acceptance and full Phase 1 remain pending. Technical
counts are **6/11 = 54.5%** and **6/154 = 3.9%**, equal canonical task counts—not
weighted feature/effort completion. Formal accepted count remains **0**.
