# P1-11 — Relationship, ownership and threat contracts

**2026-10-31 · development contract review; no DDL or live service.**
This matrix covers every logical entity/group in Data §1 and the named auxiliary records in
§2.4 of [Data §1–2](../03_DATA_AND_WORKFLOWS.md).
It defines required downstream invariants, not implemented business entities. The
[approved pure fixture schema](PHASE-01-P1-11-CONTRACT-COMPLETION-PROPOSAL.md)
selects only representative executable records. `VALID` means internal consistency
of supplied synthetic facts, never real identity, current authority or verified effect.

## Protocol and compatibility separation

| Contract | Identity/version/error convention | Current evidence and boundary |
|---|---|---|
| Foundation unavailable envelope | version 1; correlation 1–64 ASCII; fixed VALID/INVALID codes | Existing types/validate fixtures unchanged; already-parsed ordinary data only |
| Desktop public IPC | version 1; requestId 1–32; exact two methods, fixed error/result JSON | [ADR-0006](../decisions/ADR-0006-foundation-ipc-admission.md), real source/package round trips; no added method |
| `p1-domain-fixture` | version 1; correlation 1–64; lowercase UUID-shaped IDs; fixed snapshot/helper codes | New pure fixtures only, no wire handler or persisted schema |
| Future worker/service IPC | versioned allowlist, scoped IDs, deadline/cancellation, generation/fence/revision and outcome certainty | Must be concretely reviewed at owning task; not authorized by matching fixture shape |

Reject unsupported versions; do not coerce old data or silently broaden either
existing protocol. Keep historical fixtures and require explicit migration/rollback
review when a service adopts a contract. Request/correlation IDs do not authorize,
prove uniqueness, or sanitize logs. Entity ID, device-control generation, view-session
epoch, entity revision and ownership fence are different concepts even when numeric.
Never compare or reuse one as another. Device generation invalidates stale transport
work; view session only gates the current observed view; expected entity revision
controls mutation conflicts; fencing identifies the current owner. No TTL selected.

## Complete logical entity relationship/deletion matrix

“Hold” below means preserve required referential/recovery evidence; it is not a
blanket permanent retention policy. C-13/14/21/22 remain authoritative. Responsible
phases name the implementation/evidence gates, not completed services.

| Entity/group | Relationship, uniqueness and required invariant | Deletion/retention dependency | Owner / evidence gate |
|---|---|---|---|
| Workspace | Local authoritative root; no cross-PC lease claim | No implicit cascade into user files or unresolved history | Main persistence; P1-05, Phase 11 restore |
| Device | Registry UUID; fingerprint conflict blocks, serial alone not durable identity; monotonic control epoch | Preserve referenced sessions/jobs/evidence and generation history | Device registry/Actor; P2-03/05/07/12 |
| DeviceTransport | Device-owned transport history, exact current binding/generation | Retire stale binding; never replay pending command against replacement | Device Host; Phase 2 reconnect/conflict tests |
| InstalledApp | Device/package-specific observed installation/version | Referenced workflow/certification must revalidate changes | App inventory; Phase 5 APK tests |
| ProxyAssignment | Device-scoped assignment with secret reference only | Safe whole-workflow ownership before changes; no credential cascade | Main + Device Actor; Phase 5 proxy tests |
| AccountIdentity | Platform + independently verified stable account reference; no name/avatar merge | No unlink while unresolved effects; retain lease/evidence history | Identity coordinator; P5-06/07/08/13 |
| Account | Per-device/platform session → Device and optional AccountIdentity | Target/jobs revalidate on relink; no credential values | Account registry; Phase 5 two-device identity tests |
| Target | Account-owned platform-specific target; observed/authorized capability | Referenced jobs cannot inherit stale permission after change | Target registry; Phase 5/9 capability tests |
| PublishLease / history | One active verified global identity owner locally; CAS owner/fence/revision | Never erase last fence; expiry cannot prove old effect stopped | Scheduler + Device Host; P5-13/P7-06/07/P8-05/10 |
| HostCapabilityProfile | Versioned measured host/device/codec profile with evidence/invalidation | Invalidate stale bounds, preserve evidence needed by decisions | Resource manager; Phase 0/3 real host tests |
| StreamSettings | Global/default versus device override, desired revision | Do not restore persisted observations as effective state | Main configuration; P1-07/Phase 3 |
| StreamApplyOperation | Captured target set + expected revisions + per-device results | Preserve partial/failed operation audit, no out-of-scope mutation | Resource manager/actors; Phase 3 scope/conflict tests |
| StreamObservation | Device/generation/settings revision, availability/freshness | Stale after restart; absent measurement is not zero | Telemetry observer; Phase 3 provider tests |
| StreamRecommendation | Profile/settings revision, measured window, confidence and expiry | Recommendation never overwrites desired settings; stale proposals are not applied truth | Resource manager; Phase 3 measured recommendation tests |
| HostMetricSample | Nullable value/unit/source, sampled time and freshness; retain source/window in aggregates | Absent/error/stale values never become zero or automatically GREEN | Telemetry observer; Phase 3 provider/freshness tests |
| ResourcePolicyEvent | Policy revision/reason, observed trigger and applied action | Retain relevant audit; manual opt-in/default rules unchanged | Resource manager; Phase 3 DEC-019 tests |
| MediaSource | Explicit owned reference to user-selected source, scan policy | Never interpret removal of reference as permission to delete originals | Media library; Phase 6 ownership/Unicode tests |
| MediaAsset | Source-relative identity/content hash/stability; duplicate relationship explicit | Hold while queued/uncertain jobs need content; preserve originals | Media library; Phase 6 changed/missing asset tests |
| ContentCampaign | Device/account/target/workflow scope | Referenced rows/jobs must not orphan or change admitted snapshots | Content service; Phase 6/7 |
| ContentRow | One logical post; explicit complete override when used; C-19/C-20 | Preserve admitted occurrence and referenced assets | Content service; Phase 6/7 validation |
| ContentRowAsset | Explicit ordered membership + expected hash; unique row/order | No album inference from folders, no drop of held member | Content service; Phase 6 album/order tests |
| ScheduleProfile | Versioned recurrence/timezone/rule snapshot and exact scope | Revision edits cannot duplicate occurrence; retain admitted snapshot | Scheduler; P7-01/02/03/04/05/09/10/11/12 |
| WorkflowDefinition | Versioned certified workflow, not renderer-supplied generic commands | Referenced job keeps immutable reviewed version/certification | Runtime catalog; Phase 8/9 certification |
| Job | Exact occurrence + content/identity/workflow snapshot + generation/fence | Retain history until explicit cleanup; UNKNOWN/idempotency holds survive | Scheduler/runtime; Phase 7/8 |
| JobStep | Job-owned ordered step, bounded timeout/cancellation | Preserve uncertainty/evidence; cancellation is not retroactive undo | Runtime; Phase 8 fault injection |
| EffectIntent | Unique logical business action, immutable intent before dispatch | No blind replay; preserve business key and recovery references | Runtime journal; P8-03/04/05/06/07 |
| EffectAttempt | Specific dispatch possibility with owner/fence/generation | Append attempts, never reset UNKNOWN to force retry | Actor/runtime; P8-05/09/10/11 |
| ReconciliationRecord | Exact effect/attempt/account/target + permitted readback/evidence | STILL_UNKNOWN/BLOCKED_READBACK remain quarantined; no invented resolution | Runtime recovery; Phase 8/11 |
| JobEvidence | Scoped capture/result with identity/generation/display revision/hash | 7-day diagnostics exception for required UNKNOWN recovery holds | Evidence owner; Phase 4/8/11 |
| MetricSnapshot | Scoped source/definition/availability/freshness; nullable values | Derived history until explicit cleanup; no inferred zero/viral metric | Tracking; Phase 10 source verification |
| AuditEvent | Scoped event/correlation, redacted structured payload | Technical logs 30 days; preserve necessary recovery/idempotency records | Main logging; P1-04/Phase 11 privacy |
| Notification | Explicit observed event/status, not fabricated success | Dismissal does not resolve underlying effect/quarantine | Main/UI; P1-08/Phase 10 |
| StagedMediaCopy | Manifest-proven tool ownership + exact source/destination/hash | Only verified completion and no recovery need permits candidate cleanup; never originals/unrelated files | Media/runtime; Phase 6/8 C-21 tests |
| BackupRecord | Validated encrypted local snapshot/schema/ledger/key reference | Seven validated ordinary copies; protected pre-migration copy; failed backup cannot replace known-good | Persistence/secrets; P1-05/06, Phase 11 restore |

All map entities are represented above; auxiliary StreamApplyOperation/StreamRecommendation/HostMetricSample/ResourcePolicyEvent
from Data §2.4 are included explicitly. This is not speculative SQL implementation.
Relationship/deletion fixtures exercise device/account/target, shared identity,
evidence, desired/observed, opaque secrets, effects and queued/UNKNOWN holds.
They do not purport to execute the full future matrix. Proposed deletion returns
REFERENCED if a surviving record points to the candidate; no cascade/delete occurs.
An unreferenced graph node is not real deletion permission. C-21's separate truth
table requires ownership AND verified completion AND no recovery need, but still
requires a later real manifest/provenance check before any filesystem operation.

## Ownership and threat matrix

| Boundary / threat | Required semantic owner and check | Present evidence / remaining gate |
|---|---|---|
| Renderer requests arbitrary commands, paths or secrets | Main allowlisted method-specific semantic admission; renderer cannot choose native commands | Existing public bridge only; new fixtures are never exposed by IPC |
| Stale view or forged renderer identity | Main-owned observed session revocation + sender/frame/origin + payload checks at admission/dispatch | ADR-0006 tests; not Document incarnation, human-intent or pre-observation proof |
| Wrong physical device / stale serial or epoch | Device Host resolves exact registry/binding/current epoch, then single serialized Actor | Pure supplied-fact comparison only now; Phase 2 real reconnect/identity tests required |
| Two owners or manual input during workflow | Whole-workflow ownership, CAS fence, drain/reconcile before safe takeover; no competing scrcpy/Python input | C-04 retained; Phase 3/5/7/8 actual contention tests required |
| Cross-device same account / same display names | Verified AccountIdentity shared by sessions; global local-PC publish lease | Two-session fixture and wrong-reference negatives; Phase 5 independent real identity evidence required |
| Renderer modifies desired state or treats stale observation as fact | Main validates expected entity revision; observer publishes separate source/freshness/availability | Pure desired/observed fixtures; P1-07/Phase 3 application/revision tests remain |
| Worker returns stale capture or fabricated detection | Vision recognition only; bind capture/generation/display/ROI/model; Actor decides input | Definitions only, Phase 4 real worker failure/recognition tests remain |
| Cancellation/timeout after possible dispatch causes duplicate | Persist intent/dispatch possibility before effect; UNKNOWN quarantine and append-only reconciliation | Pure transition forbids false-undispatched regression; Phase 8 durable fault-injection remains |
| Secret or evidence handle is forged | Main secret/evidence owner checks scope, existence, integrity and capability; no raw values in UI/logs | Opaque reference shape only; P1-06 and evidence services must independently verify |
| Restore rolls back fencing/effect history | Quarantine all dispatch until later effects reconciled; never auto-resume old owners | Definitions only; P1-05/Phase 8/11 restore/key tests remain |
| Cleanup destroys originals or recovery evidence | Owning service checks manifest, completion, holds; user originals untouched | Pure references/C-21 truth table; later file/backup deletion tests mandatory |
| Malicious already-parsed objects | Reject ordinary getters/symbols/prototypes/repeated references; fixed outputs | Pure descriptor fixtures; proxies/globals/hostile JS are not sandboxed |

`SUCCESS_VERIFIED`, `FAILED_KNOWN`, `BLOCKED_PRECONDITION`, `RETRYABLE`,
`UNKNOWN_EXTERNAL_EFFECT`, `CANCELLED`, `NEEDS_RECONCILIATION` remain the architecture's
step-result vocabulary. The fixture's NOT_DISPATCHED/DISPATCH_POSSIBLE/VERIFIED/
FAILED_KNOWN/UNKNOWN are **effect certainty facts**, not replacements for those
step results. A timeout or CANCELLED result after dispatch may still carry UNKNOWN;
RETRYABLE never overrides quarantine or grants blind replay. Evidence reference
presence is only consistency, not evidence content validation or external success.

## Scope, limits and review obligations

Accepted records have exact Object.prototype, own enumerable data fields, no symbols
or accessors; arrays exact Array.prototype, contiguous data indices and only length.
Frozen data is accepted; cycles/shared object references are rejected. Relational
cycles use scalar IDs, not object cycles. Inspection copies through descriptors,
then shape/version/fields/duplicate IDs/references/invariants are checked in order.
Private failure sentinels prevent thrown inspection strings impersonating validator
classifications. Proxy traps can run and impersonate data: no proxy detection proof.

At most32 records per collection/list, depth 8,2048 containers. These bound accepted
synthetic workloads, not production capacity or arbitrary-object peak allocation.
Field-name enumeration may allocate before rejection. No I/O, clock, callbacks,
services, secret lookup, mutation, normalization or input echo. UUID grammar proves
neither generation nor real uniqueness; serial grammar is not all-device support.

All current public/unavailable protocols and fixtures remain unchanged. No native
service, schema migration, SQL DDL, production vault format or lease TTL is selected.
Full V9/C-03/C-04/C-05 and remaining Phase 0/host/device gates are preserved. Review
this matrix alongside executable fixtures and exact reused bridge evidence before
claiming P1-11-specific technical completion; formal phase acceptance is separate.
