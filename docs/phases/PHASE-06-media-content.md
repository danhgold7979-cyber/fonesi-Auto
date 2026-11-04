# PHASE-06 — Media and content library

**Revision:** 0.2-draft · **Date:** 2026-10-30
**Plan status:** DRAFT — NOT AUTHORIZED FOR IMPLEMENTATION
**Task status:** All tasks NOT_STARTED; no application, Windows or Android tests executed by this revision.
**Proposed execution branch:** `phase-06` — not created by this plan
**Execution base:** Future accepted `main` SHA, recorded at approval
**Owner / approver:** Implementing AI/developer / user, recorded at approval

Phase 0 remains unfinished. This plan describes future execution; it does not authorize scanning private directories, importing actual campaigns, transferring media to phones or publishing content.

## 1. Outcome and source mapping

Produce a deterministic, validated media/content library whose row-to-file mapping survives nested folders, duplicate filenames, imports, edits and device staging. A selected row must identify the intended bytes, not whichever file currently occupies a filename. Preserve V9 setup/content layout and its 20-visible-row limit.

Traceability: [master P6-01..16](../04_MASTER_IMPLEMENTATION_PLAN.md), [product §2.5](../01_PRODUCT_SCOPE.md), [data entities and Excel schema](../03_DATA_AND_WORKFLOWS.md), [architecture](../02_TECHNICAL_ARCHITECTURE.md), [AC-06](../05_ACCEPTANCE_AND_RISKS.md), [V9 setup/content](../06_UI_V9_MAPPING.md), [decisions](../08_DECISIONS_AND_OPEN_ITEMS.md), [execution](../11_PHASE_EXECUTION_PLAYBOOK.md), [document policy](../13_DOCUMENTATION_CHANGE_POLICY.md).

## 2. Scope and readiness

**In scope:** selected folder registry, controlled recursion, stable sorting, hash dedupe/file stability, media probing, captions/hashtags/comments, Excel/TXT imports, schema-versioned exports, assignment/reuse, watcher refresh and exact Android staging.

**Out of scope:** publishing, schedule runtime, implicit media reuse, arbitrary filesystem crawling, cloud sync, installing new account credentials, new UI navigation, platform limits guessed from examples or fonesi-W source reuse. Phase 8/9 own publish behavior; Phase 6 prepares verified inputs only.

Entry criteria:
- [ ] Phase 5 ACCEPTED and merged, earlier foundation/device/recognition contracts still valid; no parallel phase development inferred from technical independence.
- [ ] This revision and its actual file/module paths approved; one current phase/task authorized.
- [ ] Media format/profile constraints and tool license/pins accepted through Phase 0/architecture decisions; ffprobe/FFmpeg remains a dependency subject to that decision, not newly selected by this plan.
- [ ] Schema decisions for assignments/reuse, import merge/replace, duration limits, metadata retention and Android staging/cleanup approved before affected code.
- [ ] Approved local fixture roots and disposable test-device media directory are identified; production/private folders are not assumed test data.
- [ ] Repository/remote/branch/base/worktree verified at execution.

### Accepted behavior and remaining implementation decisions

The [accepted checklist C-01..C-22](../16_ACCEPTED_PRODUCT_DECISIONS.md), especially C-13/14 and C-19..22, requires explicit album group key plus ordered asset references: one album post per target, never infer an album from a folder. A complete row date/time/IANA-zone override visibly supersedes the profile; partial overrides are invalid and never create two dispatch paths. Reuse stays disabled unless explicitly allowed. Only tool-owned staged copies may be removed after verified completion; originals are never deleted, and UNKNOWN/unresolved evidence is retained. Captures/UI/OCR retain 7 days and logs 30 days otherwise; job/metric history persists until user cleanup. Encrypted backups stay in a user-selected local folder, no cloud. These are accepted directions, not executed tests or schema approval.

| Topic | Choice/evidence required | Dependency |
|---|---|---|
| Assignment model | Review physical schema for accepted explicit album key/ordered assets and per-target job; reuse requires explicit campaign permission; define safe reservation release | P6-13; schema review remains required |
| File traversal | Windows reparse-point/symlink/network-share treatment, case/Unicode normalization, accessible-root boundaries | P6-01..04; default no traversal outside selected approved root |
| Media capabilities | Supported image/video containers/codecs, album ordering and target-specific validation sources | P6-05/06/16; unsupported profiles remain invalid/unverified |
| Import/export contract | Exact template version, locale/date representation, merge/replace conflict policy and spreadsheet safety | P6-11/15; user confirms destructive replace |
| Staging mechanism | Prove Android folder, MediaStore/selection mapping and storage headroom; implement accepted tool-owned-only cleanup after verification with UNKNOWN retention | P6-16; no assumption an ADB transfer appears instantly in app picker |
| Scale budgets | Representative file counts/sizes/roots, benchmark method and owner-approved latency/memory budget | Acceptance gate; no universal scan-speed promise |

## 3. Proposed architecture and V9 contract

Paths are proposed logical locations; map to accepted Phase 1 architecture before approval:
- `src/domain/media/` and `src/domain/content/`: MediaSource, MediaAsset, ContentCampaign, ContentRow, assignment and staging-record schemas.
- `src/application/media/`, `src/application/content/`: scan, validation, import/export, assignment and refresh orchestration.
- `src/infrastructure/media-probe/`, `src/infrastructure/content-files/`: approved bounded subprocess and workbook/text adapters.
- `src/device-host/media/`: serial-scoped staged transfer/read-back and cleanup through Device Actor; no direct renderer/Python ADB.
- `src/renderer/content/`: existing V9 source/table/import-preview surface; `src/persistence/migrations/` for approved additive schema.
- `tests/media/`, `tests/content/`, `tests/media-staging/`: deterministic filesystem/workbook fixtures and separately labeled Windows/device suites.

Contracts:
- Media identity combines stable internal ID, selected root, normalized relative path, observed size/mtime and SHA-256. Hash is content identity; identical hashes may have multiple source-path occurrences. Same basename alone never identifies bytes.
- Scan results contain scan revision, root, start/end time, complete/partial/cancelled/error state and individual errors. Cancellation cannot make a partial scan appear complete or delete unobserved assets.
- File state is explicit: AVAILABLE, ASSIGNED, USED, MISSING, CHANGED, INVALID; changing bytes revokes prior validation/assignment eligibility and prevents stale staging.
- Import produces a non-mutating preview with mapping/errors/conflicts first. Confirmed commit uses expected campaign revision and batch ID, then atomically applies the approved mode; any row excluded must be visible, not silently dropped. Album group keys and asset ordering are explicit. A complete row date/time/zone overrides profile visibly; an incomplete override is a row error, never a guessed date/time.
- Staging ties device generation + job/content revision + asset hash + remote location to verification evidence. A transferred filename is not proof that the phone/app selected the correct media.

| V9 component | Required behavior and parity checks |
|---|---|
| Phone → platform → account → target → workflow selection | Respect order and clear incompatible dependent selections; Phase 5 unknown identity stays blocked |
| Folder/recursive toggle | Scan only explicit source; show loading, empty, partial/error, cancel and refresh states |
| Content table | At most 20 visible rows before scrolling; caption default, separate hashtags, 0–10 dynamic comment columns; schedule fields retain V9 order |
| Import/export tools | Template download, current-content export, preview/mapping/errors and explicit merge/replace/new-campaign choices |

Same-viewport Dark/Light screenshots compare against the complete V9 artifact. No navigation, layout, density, right monitor or workflow-tree redesign.

## 4. Task contracts

Proposed sequential order: P6-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16. Tests for future effects use fixtures; no live publishing in this phase. All tasks NOT_STARTED.

### P6-01 — Source/folder registry
- **Depends / deliver:** Phase 5 accepted; selected-root registry with canonical/display paths, recursion/watch settings, permissions, source revision and scan state. Root authorization enforced in service/IPC.
- **Positive tests:** add two distinct approved roots, edit settings, reopen persistent source; Unicode/spaces/long paths follow supported Windows behavior.
- **Negative tests:** inaccessible/deleted root, malformed path, duplicate alias, path traversal and renderer-supplied unauthorized path do not broaden filesystem access.
- **Evidence / pass:** schema/repository/IPC tests plus Windows directory-picker/path cases; root visibility and errors accurately rendered.
- **Rollback:** disable source/watch and preserve existing referenced asset history; never delete the user source directory.

### P6-02 — Recursive and non-recursive scans
- **Depends / deliver:** P6-01; cancellable enumeration with extension filters and explicit traversal policy, bounded work and per-entry errors.
- **Positive tests:** root-only scan excludes nested files; recursion includes approved nested files exactly once; partial permissions produce visible errors.
- **Negative tests:** reparse loop, link escaping root, removed folder, network interruption, unreadable subtree and cancellation cannot hang, traverse outside root or report complete success.
- **Evidence / pass:** fixture tree with expected set and Windows traversal cases; count total/discovered/skipped/error independently.
- **Rollback:** stop workers and retain prior complete scan; cancelled scan cannot mark remaining prior files MISSING without reconciliation.

### P6-03 — Deterministic normalized path sorting
- **Depends / deliver:** P6-02; documented versioned path/filename sort and normalization rules used by scanner, UI and imports.
- **Positive tests:** repeated shuffled enumeration yields identical order; nested same-basename files remain distinct; Vietnamese/case/numeric-name fixtures have documented results.
- **Negative tests:** case/Unicode normalization collisions and inconsistent separators generate visible ambiguity rather than merging distinct Windows paths.
- **Evidence / pass:** golden-order fixtures and Windows cross-check; sort is not an asset identity or import positional mapping.
- **Rollback:** preserve stored relative paths and content IDs; a sort revision changes display order only, never silently remaps rows.

### P6-04 — SHA-256 dedupe and file stability
- **Depends / deliver:** P6-03; stability observation and bounded hashing record hash only after confirming unchanged file metadata/bytes during read. Duplicate relation preserves individual source occurrences.
- **Positive tests:** identical content with different names shares content fingerprint; same filename/different content remains distinct; stable file validates after completed write.
- **Negative tests:** file modified/truncated/deleted during hash, exclusive lock, temporary file and interrupted hash never produce AVAILABLE with a trusted stale hash.
- **Evidence / pass:** mutation-during-read fixtures, known hash vectors and Windows locks; changing bytes transitions CHANGED and invalidates dependent validation.
- **Rollback:** cancel hashing and invalidate incomplete fingerprints; do not delete duplicates from user folders.

### P6-05 — Video metadata validation
- **Depends / deliver:** P6-04; approved ffprobe adapter outputs duration, dimensions, container/codec/orientation and structured probe errors, then validates against explicit workflow profile.
- **Positive tests:** supported videos in approved orientations yield expected metadata; rotation metadata and duration units are normalized consistently.
- **Negative tests:** corrupt/truncated media, misleading extension, unsupported codec, malicious filename, oversized output, hung process and tool absence fail safely with timeout/cancellation; no shell interpolation.
- **Evidence / pass:** labeled video corpus and exact helper version/license; packaged Windows probe tests. Unknown platform limits remain unverified, not invented.
- **Rollback:** disable affected profile/probe adapter and invalidate validation cache, preserving original media and content text.

### P6-06 — Image format/dimension validation
- **Depends / deliver:** P6-04/05; bounded decode/metadata validation for approved formats with orientation and per-workflow constraints.
- **Positive tests:** supported image dimensions/orientation and album ordering metadata are accurate; extension-independent format detection works.
- **Negative tests:** malformed file, decompression bomb/oversized dimensions, mismatched extension, unsupported format and changed bytes cannot pass on filename alone.
- **Evidence / pass:** approved fixture corpus and memory/error observations; owner-approved format profile controls acceptance, not assumed platform limits.
- **Rollback:** invalidate image-validation revision; no rewrite, resize or destructive conversion of user originals in this task.

### P6-07 — V9 media table, 20 visible rows
- **Depends / deliver:** P6-05/06; table bound to real validated records, scroll after maximum 20 visible rows, row-level error/availability state and explicit selection.
- **Positive tests:** 0/1/20/21/many rows, sort/scroll/selection preservation, resize and Dark/Light at approved V9 viewport.
- **Negative tests:** scan refresh while selected row disappears, stale selection, partial scan and repeated reload cannot display another row's caption/media or fabricate successful data.
- **Evidence / pass:** same-viewport V9 parity screenshots and UI integration tests; simulated rows must be labeled test data, never production metrics.
- **Rollback:** revert view change behind disabled feature if needed; retain library records and approved V9 shell.

### P6-08 — Filename-derived caption default
- **Depends / deliver:** P6-07; default caption removes only final extension from filename and records default-versus-user/import provenance. Refresh does not overwrite deliberate edits.
- **Positive tests:** Unicode/multi-dot/no-extension filename cases and explicit empty/user caption; default applied only at intended creation/reset boundary.
- **Negative tests:** rename/rescan/import refresh cannot silently replace edited caption or include directory path as caption.
- **Evidence / pass:** default/provenance tests and UI edit/refresh cases; accepted rule documented for explicit reset.
- **Rollback:** restore previous content revision if authorized; do not regenerate all captions on rollback.

### P6-09 — Hashtags and 0–10 comments
- **Depends / deliver:** P6-08; separate hashtags and comment slots; count selector controls visible columns exactly; validation aligns non-empty slots and selected count.
- **Positive tests:** 0/1/10 counts, Unicode/emoji content, reducing then restoring count follows approved preservation rule, empty slots excluded from executable comments.
- **Negative tests:** negative/11/noninteger count, hidden non-empty slots, imported count mismatch and unsupported text cannot be silently truncated or executed.
- **Evidence / pass:** model/round-trip/UI tests; saved intent preview shows exact comments. No posting/comment execution in this task.
- **Rollback:** retain prior row revision and hidden content according to approved schema; never discard comments merely by hiding columns.

### P6-10 — Comment delay and interval semantics
- **Depends / deliver:** P6-09; validated duration fields and runtime-facing contract: delay starts only after verified publish; interval follows successive verified comment attempts as approved in workflow contract.
- **Positive tests:** duration units/round trip and schedule preview from a synthetic verified-publish timestamp; no comments means no comment timers.
- **Negative tests:** invalid/overflow durations, unverified/UNKNOWN publish, device clock shift and ambiguous comment outcome cannot produce dispatchable next-comment time.
- **Evidence / pass:** pure timing-contract fixtures cross-linked to P8-08; the future runtime must recheck permission/identity and unknown effects, not rely on UI fields alone.
- **Rollback:** disable comment scheduling metadata use while preserving content; do not convert missing delay into immediate automatic posting.

### P6-11 — Excel template/import preview/mapping/errors
- **Depends / deliver:** P6-03/09/10; approved schema version, blank template, parser, preview and transactional application of explicit new/merge/replace mode. Match normalized relative path plus optional hash, not row index.
- **Positive tests:** nested duplicate basenames map correctly; valid captions/hashtags/10 comments/timing/target/workflow/album-key/ordered-asset fields preview and commit as shown; complete row time/zone override is displayed; repeat batch handling deterministic.
- **Negative tests:** missing/unknown path, hash mismatch, ambiguous album membership/order, partial row time override, duplicate/conflicting rows, wrong schema, malformed workbook, formula cells, oversized files, stale campaign revision and cancel leave no silent partial overwrite or duplicate schedule.
- **Evidence / pass:** fixtures with expected preview/error rows and commit diff; workbook untrusted content never evaluates code or imports secrets automatically.
- **Rollback:** use recorded batch/campaign revision with an audited reversal when no dependent job has consumed it; otherwise preserve history and create a new revision. Never remove externally published content as an import rollback.

### P6-12 — TXT comment matching
- **Depends / deliver:** P6-11; encoding-aware TXT import with preview, deterministic path/filename match rules and explicit ambiguity errors.
- **Positive tests:** approved relative-path mapping, Vietnamese/emoji text and documented line/slot semantics map to intended row.
- **Negative tests:** duplicate basename across directories, undecodable bytes, excess comments, blank lines/count mismatch and unexpected naming convention cannot choose the first file silently.
- **Evidence / pass:** positive/ambiguous fixture pairs and non-mutating preview before confirmation; no positional matching fallback.
- **Rollback:** same content revision/batch reversal as P6-11; preserve original TXT file and user edits made after import.

### P6-13 — Asset assignment and reuse policy
- **Depends / deliver:** P6-04/11/12 plus reviewed assignment schema; transactional reservation and AVAILABLE/ASSIGNED/USED transitions with explicit campaign-level reuse permission, consumption provenance and release rules. Explicit album group key and ordered asset IDs produce one intended post per target, not one post per image or inferred folder group.
- **Positive tests:** first eligible assignment succeeds; explicit approved reuse records separate intended target/job associations; cancelled undispatched assignment releases safely.
- **Negative tests:** concurrent assignment race, default-reuse attempt, missing/changed/invalid asset, duplicate/missing album order and UNKNOWN external effect cannot make media eligible again as if unused or split an album into unintended posts.
- **Evidence / pass:** transactional concurrency tests and state transition table; P7/P8 must consume immutable revision/hash rather than mutable table position.
- **Rollback:** stop new reservations; reconcile outstanding jobs before release. Never reset USED/UNKNOWN history solely because local configuration was reverted.

### P6-14 — Watcher/polling and refresh
- **Depends / deliver:** P6-13; approved watch/poll fallback, coalesced changes, revision-aware refresh and explicit stale/unavailable watcher state.
- **Positive tests:** create/rename/change/delete bursts converge to correct scan state; restart resumes deterministic rescan; changing file revokes previous validation.
- **Negative tests:** duplicate/lost events, inaccessible source, infinite event storm, source removal and active edit/import race cannot duplicate assets, overwrite captions or use changed bytes.
- **Evidence / pass:** fixture event replay plus Windows watcher behavior; measure work/memory under bursts, approve budgets before claiming performance PASS.
- **Rollback:** stop watcher and expose manual refresh/polling only if approved; full reconciliation before trusting cached availability.

### P6-15 — Current-content export and schema round trip
- **Depends / deliver:** P6-11/14; blank template and current-content export use documented schema/version, stable media mapping, explicit album grouping/order, content/timing/timezone-override/target/workflow/reuse fields and source revision metadata.
- **Positive tests:** export → preview → import into a new campaign preserves intended values, row identity mapping, empty versus explicit content and 0–10 comments without accidental execution.
- **Negative tests:** unsupported schema migration, locale-dependent dates, formula-like captions, encoding loss, duplicate exports and failed destination write cannot corrupt original campaign or turn data into spreadsheet formulas.
- **Evidence / pass:** golden round-trip workbooks and safe literal-cell handling, Windows save/cancel/permission tests. Export excludes credentials and unnecessary private absolute paths.
- **Rollback:** atomic output to authorized new path; cancelled/failed export leaves source unchanged and does not overwrite an unrelated existing file.

### P6-16 — Exact Android media staging
- **Depends / deliver:** P6-04/05/06/13/15 and P2 actor; storage preflight, authorized per-job staging location, exact hash/size and device-generation binding, transfer/read-back and app-picker-visible ordered album mapping evidence. Remove only tool-owned staged copies after verified completion; never originals. UNKNOWN/unresolved copies remain retained. Safe undispatched partial-transfer cancellation may clean only its own verified partial files.
- **Positive tests:** stage intended image/video/ordered album to two approved devices independently; verify transferred bytes and selected media mapping; safe undispatched cancellation cleans only its own files.
- **Negative tests:** insufficient storage, file changed after scan, duplicate filename in phone library, interrupted transfer, reconnect/new generation, missing MediaStore indexing and cleanup failure block readiness. ADB copy exit success alone is insufficient.
- **Evidence / pass:** physical-device transfer/hash/read-back/picker tests, per-device manifest and cleanup record. Emulator/Linux fixtures validate logic only; profile-specific Android visibility must be proven.
- **Rollback:** stop pending transfer, reconcile in-flight state, remove only verified app-owned partial/staged objects authorized for cleanup; preserve evidence and any asset tied to UNKNOWN workflow outcome. Never wipe general DCIM/downloads or user media to recover space.

## 5. Failure, privacy and migration strategy

- Host path access is constrained to selected sources and approved output/cache roots. No arbitrary shell string building; media probe arguments are typed and bounded. Untrusted workbooks/TXT/media are data, not instructions.
- Logs redact private absolute paths where possible; evidence screenshots/workbooks use synthetic or user-authorized content. Retention and backups follow Phase 0/P1 decisions.
- Review migrations and FK/delete policies before applying. Backup, crash-mid-import/migration, missing file and restore-with-moved-root tests must pass. A restored DB is reconciled against current files before anything becomes AVAILABLE.
- Rollback sequence: stop watcher/import/assignment → preserve current DB/content revision and staging manifest → disable failing adapter/profile → restore only approved compatible data → rescan/rehash and reconcile device staging. Reverting local state must not clear consumed/UNKNOWN media history.
- An older backup puts dispatch into quarantine until all potentially post-backup effects are reconciled; restored NOT_DISPATCHED is not proof no effect occurred. Backup before migrations, at most daily automatically while running, plus manual backup; retain seven validated normal copies and pre-migration snapshots until accepted upgrade. Failed backup cannot delete good copies.
- App-side file transfer is a device mutation even without publishing; test only approved devices/directories. No post/comment/metric collection is authorized here.

## 6. Test and evidence matrix

| Layer | Planned test procedure | Evidence / boundary |
|---|---|---|
| Static/unit | Accepted Phase 1 commands plus file/sort/hash/validator/import/reuse contract suites | Record actual commands once manifests exist; no fictitious package command now |
| Filesystem integration | Fixture roots, metadata changes, concurrent imports, cancellation, permission failure, migration/restore | Explicit fixture OS; Linux cannot certify Windows path/lock/watcher behavior |
| Workbook/TXT | Golden input → preview → commit → export → import comparisons, malicious formula/oversize/malformed cases | Versioned synthetic fixtures and cell-level expected results |
| UI/V9 | 0/20/21/many row cases, 0–10 comments, errors, cancel/repeat clicks, refreshed selections, Dark/Light | Full-V9 same-viewport parity screenshots |
| Windows | Long/Unicode paths, locks, reparse points, drive loss, actual media helper packaging, export permissions | Windows build/helper versions and actual procedure |
| Physical Android | Staging, free storage, interrupted copy, duplicate phone filenames, app-picker visibility, scoped cleanup | Device/app/locale/transport profile plus manifest/evidence; physical required for advertised staging |
| Scale/resource | Representative corpus counts, sizes, nesting, cold/warm scans, hashing/probing alongside streams; latency distributions, RAM and cancellation responsiveness | Approve corpus and budgets before acceptance; unknown sensor metrics remain unavailable |

Evidence record: task/case/commit, environment class, exact command/procedure, expected/actual result, timestamp, host/device/tool versions, sanitized link/hash, owner/reviewer and limitations. No runtime benchmark threshold is invented by this plan. Tests not executable due to missing Windows/devices remain BLOCKED, not passed by source review.

## 7. Exit criteria and approval

- [ ] Every P6-01..16 is PASS or explicitly user-deferred with dependent capabilities disabled.
- [ ] Recursive/deterministic scans, content-hash dedupe and file-change invalidation proven; user originals are never modified/deleted by scanning.
- [ ] Caption/hashtag/0–10 comments/timing and exact path/hash mapping round-trip through approved template/current export; errors never silently select wrong media.
- [ ] Assignment/reuse transitions and concurrent import/watcher behavior preserve identity and consumed/unknown history.
- [ ] Android staging proves exact bytes and picker mapping for supported profiles; unsafe cleanup and low-storage behavior fail closed.
- [ ] V9 parity, Windows filesystem/helper, migration/restore and Phase 1–5 regression evidence complete.
- [ ] Approved benchmark corpus/budgets, actual results and unsupported formats/profiles published in acceptance report.
- [ ] User accepts Phase 6 and explicitly approves merge before Phase 7 begins.

**Phase execution approval:** Not recorded. **Production coding authorized: NO.** Accepted checklist behavior is incorporated; exact schema, tool pins, benchmark limits and physical proof remain pending. No Phase 0 completion implied.

## 8. Execution and change history

| Date | Task/commit | Actual tests/evidence | Result/approval |
|---|---|---|---|
| — | — | No implementation tests run by this draft | NOT_STARTED |

| Date | Revision | Change |
|---|---|---|
| 2026-10-30 | 0.1-draft | Initial detailed P6-01..16 plan, including current-content export and exact Android staging; no execution authorization. |
| 2026-10-30 | 0.2-draft | Incorporated accepted explicit album grouping, row-time override, retention/cleanup and backup rules without claiming runtime validation. |
