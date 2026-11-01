# Phase 2 durable registry and capture — implementation checkpoint

Status: IN_PROGRESS; source implementation under the [approved finite proposal](../phases/P2-DURABLE-REGISTRY-CAPTURE-PROPOSAL.md).
No new canonical task PASS or native/hardware evidence is claimed.

Migration4 appends six bounded STRICT tables; migrations1–3 remain byte/hash frozen.
Actual SQLite tests exercise schema validation, fixed prepared deltas/CAS, rollback,
unknown commit fencing, authenticated-prerequisite composition with a synthetic
backup provider, startup generation advancement and retirement of all old bindings.
Reopened records are DISCONNECTED/PROVISIONAL, never stored VERIFIED authority.

A single private main coordinator serializes RegistryStore and CaptureStore work.
Actual schema5 audit flush precedes mutation; final owner admission precedes COMMIT.
Confirmed persistence remains COMMITTED with DEGRADED audit health if its result
notice fails. Unknown database/filesystem completion fences subsequent work until
reopen. No queued retries or renderer capture API is introduced.

Capture tests use real exclusively owned local files and actual PNG/XML validators,
with synthetic display/transport facts. They cover interrupted partial/promoted
files, single-link custody, immutable byte snapshots, missing DB-only-backup payloads,
retention/holds, clock rollback and injected ENOSPC/sync/close/link failures. These
are filesystem/source composition, not actual Android acquisition or native Windows
validation. Capture payloads are not silently added to database backups.

Normal production startup now obtains the existing owned persistence adapter,
commits startup retirement before publishing its registry, and classifies retained
capture residues under the same lane. No current display provider exists, so main
supplies disconnected/no-display facts; it cannot expose an old artifact as CURRENT.
The durable lane drains before SQLite close/lease release under the existing bounded
shutdown coordinator. Restored maintenance quarantine remains separate; no restore
recreates live device authority. The fleet binary remains BINARY_UNAVAILABLE.

Focused source slices are undergoing independent review. Final aggregate counts,
exact commit/hosted evidence and any remaining limitations will be recorded at freeze.
The prior schema3 fleet UI smoke and its capture-diagnostic retry remain distinct
committed checkpoints; they cannot establish current schema4 native UI/migration
success. P1-06 cross-user UNMET, physical phone/AVD qualification and formal phase
acceptance remain unchanged.

## Frozen source validation — 04:29 UTC

The sole author pipeline passed closed module graph71, quality268-file inventory,
strict application/demo typecheck, application/demo builds and manifest verification.
Its first five test batches passed. Batch6 then exposed an old test expecting three
migrations/six tables; the exact assertion was updated to four/twelve, retaining the
explicit six new names, and its three affected tests passed. Continuation batches6–8
passed54/79/73 tests. Batch9 passed58 of59 before finding the old static shutdown
sequence assertion; inserting the actual required durable drain before cleanup/DB
shutdown repaired that exact causal test (1/1 PASS). Remaining batches10–13 passed
64/61/35/30 tests. Every closed-inventory test therefore has passing evidence across
this stitched checkpoint, not one uninterrupted aggregate. No unchanged passing
batches were repeated to manufacture a fresh aggregate marker. Final affected quality,
diff and current build-manifest verification pass; the next Windows source job will
report its complete exact total. Unchanged foundation109 and Python203 evidence is
reused; no fresh native campaign is implied.

Focused author/worker evidence includes actual durable DB10, RegistryStore8,
coordinator8, actual schema5 log5, owned capture20, and actual FoundationPersistence
composition10 (including schema4 backup/restore and capture+SQLite). These overlap the
pipeline and must not be summed as independent test totals. Independent review covered
causal subsets and exact source, not a duplicate full aggregate.

Final main SHA256 `4d1f9179da115f0b2030a644b31c346d56abb78fcbdde92e770397a4bcc4968f`;
coordinator `73d26e021ad6024a218d8ab5ff7de5265e8214d03c85ca109ea4d90e051ff53b`;
RegistryStore `c4d4b1ff61a4db4dd70157e58852692c532c7ff7597f2cc5d9579e128beb94a1`;
CaptureStore `2f2a7f4abc1b4c973e21368ad72c0a2624f911c92b4aa8d55068624a7e0168f0`.

Actual source composition uses a synthetic encryption provider, synthetic display and
registry facts, and an audit callback; separate tests cover actual owned log failures.
It is not one combined real Windows/DPAPI/device/logger capture run. Authenticated
native schema3→4 migration, current schema4 UI launch and actual process-crash capture
campaigns remain NOT_RUN and need an updated exact execution envelope. Historical
schema3 native validators remain deliberately unchanged, not silently promoted to4.

### Historical native runner isolation

The schema3 capture-framing fix was committed separately as local098961e3 with its
own6 affected tests and unchanged application. This durable checkpoint explicitly
suspends the old fleet UI job with a literal false condition around its retained exact
manual/branch/marker predicate. Even a manual request or `[fleet-ui]` commit cannot run
that schema3 envelope on schema4 until an explicit reviewed runner update removes the
suspension. One affected workflow test (including LF/CRLF and removal-of-suspension
negative) and YAML parsing PASS. ADB/version/server gates and all artifact publication
predicates remain unchanged. The suspension is not a native PASS or an acceptance
waiver; current schema4 native evidence remains required and NOT_RUN.


### Later bounded native closure — 05:19 UTC

The [versioned schema4 smoke](P2-schema4-fleet-native-2026-11-01.md) now establishes actual
fresh-install authenticated3→4 migration and empty durable startup/current UI at exact
public25811557/CI41276065327. It replaces the prior NOT_RUN for that bounded scope only.
The old schema3 artifact remains distinct; existing-user upgrades, device acquisition and
capture process-crash recovery remain unproved. No canonical task acceptance is added.
