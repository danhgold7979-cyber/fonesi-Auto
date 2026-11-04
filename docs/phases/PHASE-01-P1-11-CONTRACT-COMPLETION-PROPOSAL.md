# P1-11 contract, invariant and threat-review completion proposal

**Initial proposal: 2026-10-31 05:17 UTC. Scoped implementation approved; entry recorded 05:45 UTC.**
Coordinator approved the independently reviewed exact pure-contract scope under the
user's delegated authority. P1-01/P1-03 technical prerequisites are verified; formal
Phase 0/predecessor acceptance remains pending. This entry permits definitions,
pure validators, fixtures and relationship/ownership/threat documentation only.
No new IPC capability, service, DDL, task acceptance or Phase acceptance follows.
The author was assigned this proposal file only; concurrent source/status work is
outside this change. No test result is asserted by this proposal.

## 1. Canonical trace and bounded objective

- [Master P1-11](../04_MASTER_IMPLEMENTATION_PLAN.md), line 93: versioned domain/IPC
  contracts, schema invariants/deletion rules, compatibility checks and threat model
  before dependent services write durable state.
- [Phase 1 §3 and P1-11](PHASE-01-desktop-foundation.md), lines 30–32 and 108–113:
  define version/error/identity/generation/correlation conventions, ownership map,
  reviewed relationships, exact serial targeting, separate device/account/target
  IDs, desired/observed distinction, safe effect results and secret references.
  Positive/negative executable fixtures and signed-off review are required.
  Explicitly do not implement later-phase business logic or speculative migrations.
- [Data specification §§1–2.7](../03_DATA_AND_WORKFLOWS.md): logical entities and
  proposed mechanics, not accepted SQL DDL. Sections 2.1–2.3, lines 175–213, define
  identity/generation, ownership/fencing and effect/reconciliation obligations;
  §2.4 separates requested settings from observations; §2.7 governs retention and
  recovery references. Line 374 restricts referenced-media deletion while queued
  or uncertain jobs need it.
- [Architecture §§2–3.1](../02_TECHNICAL_ARCHITECTURE.md), especially lines 129–141:
  semantic runtime validation, typed errors, exact binding, cancellation and
  outcome certainty. Detailed wire mechanics remain reviewed choices.
- [Accepted C-03/C-04/C-05](../16_ACCEPTED_PRODUCT_DECISIONS.md), lines 15–17:
  unattended certified work; manual/workflow ownership and safe takeover;
  selected stack, V9 and ADB sole input owner. No new human-intent, immutable
  Document or permanent unavailable-only product requirement is introduced.
- [ADR-0004](../decisions/ADR-0004-runtime-data-contracts.md) remains proposed;
  accept only explicitly reviewed conventions, not its entire future implementation
  through implication. [ADR-0006](../decisions/ADR-0006-foundation-ipc-admission.md)
  governs the existing bounded public desktop bridge independently.

Objective: complete the missing **definitions, pure validation fixtures and review**
without deploying a device service, persistence service or additional bridge method.
Later implementation deferral must not become omission of required P1-11 definitions.

## 2. Existing evidence and exact gaps

| Obligation | Existing reusable coverage | Missing completion evidence |
|---|---|---|
| Protocol/version/error/correlation | Foundation unavailable envelope; desktop public read wire protocol | Explicit separate compatibility conventions and scope |
| Main/preload round trip | Actual P1-02 health/settings bridge | Reuse exact reviewed source/package evidence; no new transport needed |
| Device/account/target separation and targeting | Neither current public contract represents these | Pure reference/binding records and relationship fixtures |
| Entity/schema constraints and deletion | Logical docs03 proposals | Reviewed matrix and representative executable invariant fixtures |
| Desired versus observed | Public settings is revision-zero, not persisted | Separate contract semantics and negative fixtures |
| Safe effect results/secret references | UNAVAILABLE and public errors only | Pure certainty/evidence/reference conventions |
| Ownership/threat map | Current import graph and ADR-0006 | Cross-phase semantic ownership, trust boundaries and gate trace |

Sources: [unavailable-validator evidence](../evidence/P1-11-S-unavailable-validator-2026-10-31.md),
`foundation/src/contracts/types.ts`, `foundation/src/contracts/validate.ts`,
`desktop/src/ipc-contract.ts`, and
[public-bridge evidence](../evidence/P1-02-public-bridge-source-2026-10-31.md).
Existing tests do not demonstrate domain relationships, real identity verification,
durable effect reconciliation or production device authorization.

## 3. Separate protocol conventions; no silent migration

1. Existing foundation envelope: version 1, UNAVAILABLE, three fixed reasons,
   correlationId of 1–64 ASCII alphanumeric/underscore/hyphen characters. It consumes
   already-parsed ordinary data and returns a fixed validation code; it is not IPC
   authorization, a hostile-JavaScript sandbox or a bounded wire parser.
2. Existing desktop protocol: version 1, requestId of 1–32 characters, only
   health.get/settings.get, bounded JSON transport and fixed response/error forms
   under ADR-0006. READY means the bridge can answer, not service readiness.
3. Different names/limits are separate existing contract scopes, not permission to
   widen either. IDs are correlation, not authority, uniqueness or safe logging.
4. New pure domain fixtures have an explicitly named/versioned contract namespace;
   they are not a third runtime protocol. Preserve old fixtures. Reject unsupported
   versions and unknown enum/extra fields; do not coerce or reinterpret stored data.
5. Choose exact new identifier representations and field bounds during contract
   review, anchored to docs03; no new product identity or numeric capacity requirement
   is implied here. No native secret-key format, lease TTL or benchmark is selected.

## 4. Minimal pure contract slice

Expected location, subject to P1-01 map review: additional pure modules under
`foundation/src/contracts/` and tests under `foundation/tests/`. No Node/DOM globals,
I/O, service imports, transport handler, secret access or dynamic loading. Extend
the reviewed module inventory explicitly if needed; do not bypass import policy.

Define only the fields needed for these validation responsibilities:

- Device/transport reference binding: registry device ID, exact synthetic serial or
  transport binding, device-control generation. A serial alone is not durable
  physical identity. Match binding against an explicit synthetic current-state
  fixture, not a renderer-selected display row.
- Per-device Account/session → Device; Target → Account; Account → optional global
  AccountIdentity. Global identity verification state/evidence reference is distinct
  from display name/avatar. Shape validation never performs real verification.
- Distinct generation/revision concepts: device-control epoch, view-session epoch,
  entity revision and ownership fence must not be conflated. No numeric TTL chosen.
- Separate desired configuration revision and observed state/source/freshness;
  absence remains unavailable/unknown, not zero or a fulfilled requested value.
- Scoped opaque secret and evidence references, no credential values. Reference
  syntax is neither proof of vault existence nor permission to read the secret.
- Safe effect certainty/result vocabulary consistent with docs03 §2.3 and
  architecture §7: undispatched, dispatch-possible/unknown, known failure and verified
  outcome evidence. An acknowledgement is not success; cancellation after possible
  dispatch cannot claim no effect. No actor, persistence or retry engine is added.

Review all docs03 §1 entity groups in a documentation matrix with relationships,
required uniqueness/reference/deletion invariants, responsible phase and evidence
gate. Do not implement complete future entity records just to populate the matrix.
For deletion fixtures, model referenced queued/uncertain work and recovery evidence
without performing deletion. Apply existing C-13/C-14/C-21/C-22 rules: preserve
necessary UNKNOWN/idempotency evidence, originals and unrelated files; only proven
tool-owned staged copies with verified completion are cleanup candidates; failed backup cannot replace a
known-good copy. No new retention period or broader deletion permission is added.

## 4.1 Exact reviewed development-validation schema

**Proposed 2026-10-31 05:33 UTC; now approved for development fixtures only, not selected production schema.**
The definitions below remove implementation guessing for this pure fixture slice.
Their numeric limits bound a development validation workload, not the number of
managed devices, accounts, jobs or streams. They cannot be promoted to production
capacity limits or a device-support claim. Future service contracts require their
own reviewed representation and compatibility decision.

### Input model and fixed results

Proposed API responsibility: validate an already-parsed, synthetic snapshot; return
one primitive code only. No returned input, mutation, normalization, logging, clock,
filesystem, secret lookup or executable callbacks. JSON serialization/parse for
round-trip tests belongs to the test harness, not a new wire endpoint.

Accepted records are ordinary objects with exactly Object.prototype, exact listed
own enumerable data properties and no symbols/accessors/extra properties. All fields
below are required; nullable means explicit null, not omission. Accepted arrays have
Array.prototype, contiguous own data indices, no holes, symbols or extra properties
besides length. Read descriptors rather than invoking ordinary getters. Frozen valid
inputs remain valid. Reject cycles/repeated object references: a fixture is JSON-tree
data, while relational links are scalar IDs. Preserve these guarantees in negative
fixtures rather than relying on TypeScript alone.

Proposed development limits: at most 32 records in each top-level collection; at most
32 entries in any reference list; maximum inspected container depth 8 and 2,048
container nodes. Stop traversal on the first structural/limit error. String limits
are specified below. These are accepted-input/validator-work limits; enumeration or
receipt of a huge already-parsed object can allocate before rejection. Proxy traps
may execute or impersonate records; catching them does not sandbox or undo effects.
Compromised globals, hostile same-process JavaScript, raw JSON input size and total
IPC/native allocation are outside this pure input model. No general CPU/peak-memory
or proxy-detection guarantee follows. Tests include throwing/revoked proxies only
for fixed error containment, never proof that all proxies can be identified.

Fixed codes, evaluated by stage: INVALID_SHAPE (including thrown inspection),
INVALID_FIELD, UNSUPPORTED_VERSION, LIMIT_EXCEEDED, DUPLICATE_ID,
INVALID_REFERENCE, INVARIANT_VIOLATION, VALID. Shape precedes version; version must
be a safe integer, with only 1 supported. Within each stage use fixed collection and
field order from the tables below; resource-limit rejection may short-circuit any
traversal. No failed field value or exception is returned. VALID certifies this
snapshot only, never authority or truth of supplied evidence.

### Shared scalar vocabulary

- `Id`: lowercase canonical UUID text, exactly 36 ASCII characters, matching
  `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`. No UUID version,
  random generation, secrecy or global-uniqueness proof is inferred. This follows
  docs03 Device UUID direction; extending this representation to fixture IDs is a
  proposed development convention. Entity kind is determined by its collection,
  never by coincident string spelling or a display name.
- `Revision`: integer 0 through Number.MAX_SAFE_INTEGER, explicitly rejecting numeric
  negative zero (`Object.is(value, -0)`), so JSON round trips preserve accepted
  numeric values; no increment operation in
  this slice. Overflow must reject in any future producer, never wrap. Device
  generation and entity revision use distinct typed fields despite the same numeric
  encoding. No lease timeout or generation-persistence mechanism is selected.
- `Correlation`: 1–64 ASCII `[A-Za-z0-9_-]`, specific to this fixture envelope;
  desktop requestId remains unchanged. No sanitization/authorization implication.
- `Platform`: 1–32 lowercase ASCII `[a-z][a-z0-9_-]*`, an opaque fixture namespace,
  not an enabled-platform list. No platform capability is inferred from this value.
- `Serial`: 1–256 printable ASCII characters U+0021–U+007E, exact equality only,
  never trim/case-fold/interpolate/execute. Fixtures use synthetic examples. This
  proposed test grammar is not an asserted accepted serial grammar for all Android
  devices; Phase 2 must select and prove its production transport representation.
- `Label`: 1–64 ASCII `[A-Za-z0-9_-]` synthetic diagnostic/source labels only; neither
  account display names nor real metric naming/Unicode restrictions are introduced.
- `Nullable<T>`: T or null. Reference lists are arrays of distinct Id values.

### Exact records and envelope

Envelope fields, in order: `contract: 'p1-domain-fixture'`, `version: 1`,
`correlationId: Correlation`, then the arrays `devices`, `bindings`, `identities`,
`accounts`, `targets`, `evidence`, `secrets`, `desired`, `observed`, `effects`,
`holds`. Empty collections are valid. This is a development fixture namespace,
not an application method or persisted database version.

| Collection | Exact record fields and values |
|---|---|
| devices | deviceId: Id; generation: Revision |
| bindings | bindingId: Id; deviceId: Id; generation: Revision; serial: Serial |
| identities | identityId: Id; platform: Platform; state: VERIFIED / UNVERIFIED / CONFLICT / RETIRED; evidenceId: Nullable<Id> |
| accounts | accountId: Id; deviceId: Id; platform: Platform; identityId: Nullable<Id> |
| targets | targetId: Id; accountId: Id; platform: Platform |
| evidence | evidenceId: Id; kind: IDENTITY / EFFECT / RECOVERY; subjectId: Id |
| secrets | secretRefId: Id; deviceId: Id; purpose: PROXY_CREDENTIAL |
| desired | desiredId: Id; deviceId: Id; revision: Revision; enabled: boolean |
| observed | observationId: Id; deviceId: Id; desiredRevision: Revision; availability: AVAILABLE / UNAVAILABLE / UNKNOWN / ERROR; effectiveEnabled: Nullable<boolean>; source: Label; freshness: CURRENT / STALE |
| effects | effectId: Id; accountId: Id; targetId: Id; bindingId: Id; state: NOT_DISPATCHED / DISPATCH_POSSIBLE / VERIFIED / FAILED_KNOWN / UNKNOWN; evidenceId: Nullable<Id> |
| holds | holdId: Id; reason: QUEUED_WORK / UNKNOWN_RECOVERY; subjectIds: nonempty Id list |

These records intentionally omit real identity evidence bytes, credentials, owner
leases, commands, file paths, schedule generation and complete effect attempt/history
fields. `desired.enabled`/`observed.effectiveEnabled` are abstract fixture controls,
not a new UI setting or substitute for Phase 3/7 functionality. Freshness is supplied
fixture state, not a tested real-time timestamp calculation.

### Referential and semantic rules

1. IDs must be unique across this snapshot's entity collections. References resolve
   to the specified collection; a same-spelled ID of another kind does not satisfy
   a reference. This is a synthetic snapshot convention, not a cross-PC identity
   or production database uniqueness claim.
2. Binding.deviceId resolves to devices and binding.generation equals that device's
   current generation. Bindings and device epochs are supplied current-state fixture
   facts: this proves internal consistency, not serial truth against an independent
   live oracle. Multiple historical/stale bindings are not modeled here;
   this is a current-binding fixture. More than one binding per device is rejected
   in this fixture slice only, not a restriction on docs03's transport history.
3. Account.deviceId resolves to devices. A nonnull identityId resolves to identities
   and its platform equals account.platform. Multiple accounts/devices may reference
   one identity. Target.accountId resolves to accounts and platforms match.
4. VERIFIED identity requires an IDENTITY evidence record whose subjectId is exactly
   identityId. Other identity states may have null evidence or correctly scoped
   IDENTITY evidence; evidence presence alone never upgrades their state. No display
   name/avatar field can replace this reference. No fixture verifies a real account.
5. Evidence.subjectId resolves to identity for IDENTITY and effect for EFFECT;
   RECOVERY resolves to any defined non-evidence/non-hold entity. Evidence relations
   may be cyclic by IDs, never by JavaScript object references. Secret.deviceId
   resolves to devices; secretRefId is an opaque test handle, not a vault key format.
6. At most one desired record per device in this slice. Observation.deviceId resolves
   to devices, with a desired record whose revision equals desiredRevision. AVAILABLE
   requires boolean effectiveEnabled; every other availability requires null.
   CURRENT/STALE is independent of availability. Neither effectiveEnabled equality
   nor an AVAILABLE value proves the setting was successfully applied by a service.
7. Effect.accountId/targetId/bindingId resolve; target belongs to that account and
   binding belongs to that account's device. VERIFIED or FAILED_KNOWN requires EFFECT
   evidence scoped to effectId; other states may use null or correctly scoped EFFECT
   evidence. A shape-valid effect does not authorize dispatch or demonstrate success.
8. All holds.subjectIds resolve to non-hold records. UNKNOWN_RECOVERY references at
   least one UNKNOWN or DISPATCH_POSSIBLE effect. A hold describes why references
   must be preserved, not a lease or an implemented queue. Queued holds are supplied
   fixture facts, not scheduling admission.

The snapshot validator does not implement runtime transitions. A separate **pure
transition fixture check** accepts two valid snapshots and one existing effectId.
Its complete fixed result set is INVALID_SNAPSHOT, INVALID_CANDIDATE,
CHANGED_CONTEXT, ACCEPTED_FIXTURE_TRANSITION, FORBIDDEN_REGRESSION,
UNSUPPORTED_CASE, evaluated in that order except that the final three are mutually
exclusive classifications after context checks. Both snapshots must pass validation;
candidate must resolve to an effect in each. Compare envelope contract/version/
correlationId and every collection in its given order: lengths and record values
must match, with only the selected effect.state permitted to differ. Compare scalar
values exactly, nullable values explicitly, reference-list order exactly and record
fields by schema field order, not JavaScript insertion order. All other selected
effect fields, including account/target/binding/evidence, must remain identical.
A mismatch returns CHANGED_CONTEXT; no sorting, coercion, ignored metadata or input
mutation. Reordered equivalent graphs are CHANGED_CONTEXT for this helper, not
invalid snapshots.

After those checks: unchanged state, NOT_DISPATCHED → DISPATCH_POSSIBLE and
DISPATCH_POSSIBLE → UNKNOWN return ACCEPTED_FIXTURE_TRANSITION. UNKNOWN or
DISPATCH_POSSIBLE → NOT_DISPATCHED return FORBIDDEN_REGRESSION. Every other state
pair returns UNSUPPORTED_CASE, not a claim that canonical verified/reconciliation
transitions are forbidden. Future full transition/reconciliation design remains
Phase 8. This minimal check proves the requested no-false-undispatched negative
without implementing a workflow.

A separate **claimed-binding comparison fixture** accepts one valid snapshot and
an exact claim record `{deviceId: Id, bindingId: Id, generation: Revision,
serial: Serial}` under the same plain-data/scalar rules. Fixed results in order:
INVALID_SNAPSHOT, INVALID_CLAIM, BINDING_MISMATCH, MATCH_IN_FIXTURE. Resolve the
bindingId in snapshot.bindings; require exact deviceId/generation/serial equality
with that record and the referenced current device epoch. Missing binding or any
comparison mismatch returns BINDING_MISMATCH. MATCH_IN_FIXTURE compares two supplied
synthetic facts; it is not independent serial/physical-identity verification or a
dispatch authorization. No live adapter, lookup or clock exists in this helper.

### Pure deletion and cleanup fixtures

Deletion check takes a valid snapshot and one candidate Id; computes incoming
references including holds and rejects candidate removal if any surviving record
references it. It never cascades/deletes or rewrites a graph. Fixed results:
UNREFERENCED_IN_FIXTURE, REFERENCED, INVALID_CANDIDATE, INVALID_SNAPSHOT.
UNREFERENCED_IN_FIXTURE means only this graph has no incoming reference, not permission
to delete a real entity/file/history. Retention/cleanup rules still apply independently.

C-21 cleanup check is a separate pure policy fixture with exact fields:
`toolOwned: boolean`, `completion: VERIFIED / UNKNOWN / NOT_VERIFIED`,
`neededForRecovery: boolean`. Return CANDIDATE only for true/VERIFIED/false; otherwise
PRESERVE. Extra/missing/invalid fields return INVALID_SHAPE. These booleans are
synthetic assertions, not real ownership/manifest verification. CANDIDATE is not an
execution permission. Tests must prove ownership alone never suffices, verified
completion alone never suffices, and recovery need always preserves the copy.
No actual cleanup, new retention window or backup deletion policy is implemented.

## 5. Required fixture matrix

| Case | Expected observation |
|---|---|
| Supported pure contract JSON round trip | Valid values preserved; no mutation/coercion |
| Valid Device → Account/session → Target graph | References resolve to the correct entity kind/owner |
| Two device sessions, one verified global identity | Valid relationship, not a live cross-device lease proof |
| Desired and observed values differ | Both preserved; requested value never overwrites observation |
| Opaque secret/evidence references | Shape accepted without reading secret/files |
| Unknown version/enum; missing correlation; extra privilege fields | Fixed rejection, no input echo or effect |
| Missing/duplicate/conflicting IDs or foreign references | Reject wrong account/device/target relationship |
| Display name/avatar without verification evidence/state | Cannot satisfy verified-identity record |
| Stale device generation or mismatched exact binding | Reject against supplied current-state fixture |
| Dispatch-possible timeout/cancel without known result | UNKNOWN/reconciliation semantics, not NOT_DISPATCHED |
| Claimed VERIFIED with missing required evidence reference | Reject; evidence reference presence still does not prove real success |
| Proposed deletion or graph removal orphans queued/UNKNOWN references | Reject unsafe candidate; no actual file/DB deletion |
| Unsupported previous/new contract version | Explicit incompatibility; old fixtures retained, not reinterpreted |

Existing P1-02 tests supply actual main/preload serialization evidence. New pure
records round-trip in tests only; do not expose them through production IPC for
coverage. Explicitly state the two evidence scopes. All raw fixtures are synthetic;
no real serials, account data, paths, screenshots or credentials enter public Git.
Pure tests prove validation, not actual dispatch fencing, durable transactions,
recovery, physical identity or safe external execution.

## 6. Ownership and threat review

Document main-owned semantic admission and persistence/secret boundaries; Device
Host/Actor sole input and current-binding/fence checks; scheduler occurrence and
ownership coordination; Python recognition-only outputs; renderer typed requests
without generic commands, raw paths or secrets. Map each proposed service to its
canonical task and review before its implementation.

Keep C-03 unattended operation and stop/report challenges; C-04 whole-workflow
ownership and explicit safe takeover/drain/reconciliation; C-05 stack/V9/input
ownership. A view-session check is not a Document identity or human-gesture proof.
An already-sent external effect cannot be recalled. Neither pure validation nor
import policy is a hostile-code sandbox or end-to-end authorization proof.

## 7. Deferred implementations, review decisions and acceptance

Explicitly deferred to their canonical phases/tasks: P1-05 SQL DDL/migrations and
real encrypted backup/restore; P1-06 vault mechanism; P1-07 durable settings;
Phase 2 device registry/ADB actors; Phase 3 stream application/telemetry;
Phase 5 identity verification; Phases 7–8 scheduling/leases/effect journal/recovery;
later platform operations and release hardening. This preserves their requirements,
not an approved product deferral or permanent disabled capability.

Historical pre-entry decisions (resolved by the scoped approval recorded above):
1. Approve this pure-contract scope and exact new field/schema conventions, with
   cross-links to docs03 and no added public bridge method.
2. Approve the relationship/deletion matrix and representative fixture coverage;
   identify any required definition not yet covered rather than declaring it future.
3. Confirm P1-01/P1-03 dependency disposition and explicit module-map changes.
4. Name independent contract/schema/threat reviewer and actual test commands from
   current harness; retain all existing regressions and exact evidence references.

Completion requires a criterion-by-criterion P1-11 audit, executable fixtures,
review sign-off and truthful evidence for reused desktop serialization versus new
pure validation. Green unit tests alone do not accept the task or Phase. Preserve
original G0-12 failure and all unaccepted Phase 0/host/device gates. Rollback versions
contracts rather than changing meaning in place; retain prior fixture compatibility
evidence. Historical proposal required approval before code. That bounded approval is now
recorded above; new implementation/tests remain NOT_RUN at entry.
