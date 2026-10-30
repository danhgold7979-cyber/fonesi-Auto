# PHASE-00 — Amendment 01: Gate Mapping, Evidence and Execution Clarification

**Status:** PROPOSED / NOT ACCEPTED
**Created:** 2026-10-30
**Baseline:** [Approved Phase 0 plan](PHASE-00-feasibility.md), execution snapshot `34b9649`
**Review branch:** `plan`
**Repository:** `danhgold7979-cyber/fonesi-Auto`

> This is a proposal for review, not a new approval or evidence of a completed test. The original Phase 0 file is preserved byte-for-byte. No collector changes, device actions, new task starts, production implementation or Phase acceptance are authorized by this amendment's existence.

## 1. Original baseline and reason

The original plan records user approval on 2026-10-30 for feasibility, diagnostics, an Android Emulator lab and a **mandatory physical-device smoke test before acceptance**. Production application code is explicitly not authorized. Its detailed tasks are **P0-01..P0-10**.

The master plan previously reused P0 IDs for different gate meanings and duplicated some resource items. The normalized master uses **G0-01..G0-19** for feasibility gates; these are not new names for the ten existing execution tasks. This amendment proposes an explicit crosswalk without renaming task evidence, changing past commits or erasing history.

The baseline also retains a “Draft only” paragraph and LAB-02 “Proposed” row alongside the later explicit APPROVED record and mandatory physical-test statement. Interpret those older fragments as historical inconsistencies, not revocation of the recorded approval or permission to replace physical testing with emulator evidence. Any future change to the mandatory physical gate needs a separate explicit decision; none is recorded here.

Current snapshot remains **4 IN_PROGRESS (P0-01/03/04/05), 6 NOT_STARTED; all 12 baseline exit checkboxes unaccepted**. Multiple IN_PROGRESS rows do not prove a parallel-work exception was approved.

## 2. Proposed master-gate → detailed-task crosswalk

P0-10 audits every row and the original §11 exit criteria. Gate coverage is not a passing result. Evidence must show actual outcomes or an explicit approved deferral with scope consequences; untested capability stays unsupported/disabled.

| Master gate | Meaning / minimum evidence to review | Detailed task owner(s) |
|---|---|---|
| G0-01 | Windows support/build/privileges and host inventory; actual acceleration indicators reconciled | P0-01; P0-09 records support decision |
| G0-02 | Approved physical Android/OEM/version/screen/locale/USB matrix; sanitized profile identities | P0-03; P0-09 records supported scope |
| G0-03 | Initial lab/fleet size and stream target; one/two-AVD measurements and stated limits | P0-02, P0-03, P0-05; P0-09 records target |
| G0-04 | Wireless Debugging first-release decision, pairing/security and USB/Wi-Fi scope or approved deferral | P0-03; P0-09 records decision |
| G0-05 | Dated authoritative policy/permission review of each intended Facebook action/data source | P0-08 |
| G0-06 | Per-action ALLOWED/BLOCKED/DEFERRED/NEEDS_REVIEW matrix with permission evidence | P0-08; P0-09 records decisions |
| G0-07 | Approved first-release scope by target/media/action; explicit exclusions, not implicit full V9 enablement | P0-08; P0-09 records release scope |
| G0-08 | Owned/administered account/Page scope and legitimate authorization; login is not ownership proof | P0-08; P0-09 records boundary |
| G0-09 | UI Automator dump vs instrumentation; version/deployment evidence, selector-driven action/read-back | P0-04; relevant P0-02/03 fixtures |
| G0-10 | scrcpy version/license/packaging, video-only input boundary, codec/firmware failures and resources | P0-05 |
| G0-11 | Labeled Vietnamese/English OCR fixtures, accuracy/latency/memory/package and confidence thresholds | P0-07; P0-02 fixture dependency; physical fixture from P0-03 |
| G0-12 | Desktop/renderer/database/runtime choices with evidence and compatibility rationale | P0-09 |
| G0-13 | Privacy/threat boundaries, secret storage, backup/restore, retention/deletion and redaction decisions | P0-09 |
| G0-14 | Evidence-linked ADRs with PROPOSED/ACCEPTED status, approver/date and schema/IPC review | P0-09 |
| G0-15 | Multiple-host minimum/recommended/high profiles; no extrapolation from the user's first PC | P0-01, P0-06; P0-09 records support limits |
| G0-16 | Timestamped CPU/RAM/GPU/disk/network source/unit/availability/freshness and missing sensors | P0-06 |
| G0-17 | Increasing stream counts, FPS/resolution/bitrate/codec, focus/background and vision load envelope | P0-05, P0-06 |
| G0-18 | Auto/Manual, scope/override precedence, ranges, thresholds/hysteresis/cooldown and restoration; DEC-019 fixes Manual emergency OFF/opt-in, not all numeric thresholds | P0-05, P0-06; P0-09 records remaining policy decisions |
| G0-19 | Monitoring overhead/input latency under stream/vision load; no competing input or workflow interruption | P0-03, P0-05, P0-06 |

**No task-ID migration:** source/evidence named P0-01 remains P0-01. References to obsolete master P0-11..P0-19 mean legacy master gates, not authorized new detailed tasks. Use the G0 crosswalk in new reports.

If a gate reveals work outside the approved detailed scope, pause that dependent work and record impact and approval before execution. This crosswalk must not be used to silently expand scope, authorize hardware actions or relax existing tests.

## 3. Proposed evidence and acceptance record

For every gate/task/check capture:
- Requirement and G0/P0/Test IDs; exact expected criterion and measured actual outcome.
- Commit/script version, timestamp/timezone, host OS/runtime/tool versions and sanitized device/app/profile matrix.
- Exact command/procedure, exit code where applicable, case counts and reproducible fixture/run identity.
- Result **PASS / FAIL / NOT_RUN / NOT_APPLICABLE**, evidence location, reviewer, limitations and any rerun linked to the original failure.
- For NOT_RUN: blocker, owner and exact next action. For NOT_APPLICABLE: approved scope reason. Neither means PASS.
- For DEFERRED: explicit user approval, date/source, disabled capability or restricted support, owner, consequences and revisit gate. A proposed deferral does not close a requirement.

Task/gate status BLOCKED is separate from a test result. Static review, syntax check, mocked process test, emulator run and physical-device acceptance are distinct evidence layers. A single successful reversible ADB toggle does not establish selector-driven UI Automator + Vision, multi-device isolation, stream stability, or production workflow readiness.

Report feature coverage as requirement/capability → task → test → evidence → supported profile/outcome. Do not invent a percentage complete. State numerator/denominator and exclusions for any meaningful count.

**Public evidence hygiene:** raw host ZIPs, paths/usernames, device serials, local IPs, sensitive screenshots/UI hierarchy/OCR data, credentials, tokens and OTPs must not enter the public repo. Keep raw artifacts private only where separately authorized; publish reviewed sanitized summaries/fixtures with run identifiers and an evidence manifest. Do not label an artifact sanitized merely because its filename says so.

## 4. Proposed P0-01 collector hardening acceptance

### Observed source-review context — not a runtime verdict

`tools/phase-00/Collect-HostEnvironment.ps1` at `e1dc7a7` separates native stdout/stderr capture. It still reads the streams sequentially, has no explicit native-process deadline, uses the resolved command Source directly, and reuses/removes a same-named ZIP. The source also writes SDK/runtime paths to local reports. These observations justify tests; they are **not** claims that the updated script has failed or passed on the user's Windows host.

The Windows rerun is still outstanding. This documentation review does not modify or execute the collector. Proposed hardening must remain read-only regarding host settings and personal data; local report creation is a bounded output write, not permission to install software, elevate silently, alter features/BIOS/SDK, change devices or delete unrelated files.

| Test ID | Proposed check and acceptance | Current result |
|---|---|---|
| HC-01 | Parse the exact script on supported Windows PowerShell 5.1; run syntax/runtime checks in the documented host environment; record shell/OS version and all parse errors | NOT_RUN for this amendment |
| HC-02 | Native executable version output on stdout, stderr (including Java `-version`) and both streams is captured without NativeCommandError pollution; preserve real exit code | NOT_RUN |
| HC-03 | Large simultaneous stdout/stderr output does not deadlock; both streams drain concurrently or via another demonstrably safe bounded method; output is bounded/redacted | NOT_RUN |
| HC-04 | Hung child has an explicit documented timeout, bounded termination/cleanup and TIMEOUT result; no orphan collector-owned child, no killing unrelated processes | NOT_RUN |
| HC-05 | Resolve executable, `.cmd`/`.bat`, `.ps1` shim and unsupported alias/function cases safely; test npm resolution on Windows, spaces/Unicode in executable paths, argument handling; no arbitrary shell evaluation | NOT_RUN |
| HC-06 | Missing command, launch failure, nonzero exit, empty output and access denial are distinguished from a successful version; installed/present does not imply executable/supported | NOT_RUN |
| HC-07 | Dispose process/streams on success, failure and timeout; repeated runs do not leak handles/children | NOT_RUN |
| HC-08 | CIM/cmdlet missing, terminating and nonterminating errors, unavailable sensor and non-elevated feature query produce explicit availability/reason, not fabricated zero/success | NOT_RUN |
| HC-09 | Elevated optional-feature **read-only query** and `emulator -accel-check` are separately approved/run where needed; record backend and reconcile conflicting indicators without changing host configuration | NOT_RUN; acceptance blocked on actual host evidence |
| HC-10 | Output directory exists/collides/is unwritable, ZIP already exists, JSON write fails or ZIP creation fails: fail clearly or choose a non-destructive unique output; never delete/overwrite unrelated prior evidence; verify JSON round-trip and ZIP contents | NOT_RUN |
| HC-11 | Local/private report and public sanitized artifact boundaries are explicit; scan JSON, README, errors, stdout/stderr and archive entries for usernames/paths, IPs, serials and secrets before public publication | NOT_RUN |
| HC-12 | Report contains schema/run/time/source/availability metadata and unit-correct fields; partial collection is labeled PARTIAL, not misleading overall success; no raw private content in summary | NOT_RUN |
| HC-13 | Re-run the approved version on the target Windows host; retain sanitized output and verify non-mutating scope, runtime results, virtualization/acceleration conclusion and remaining limitations | NOT_RUN |

Any implementation proposal must specify timeout/output-limit values and fixture behavior before coding. Where a test cannot be reproduced safely on the real host, use controlled fixtures first and keep the corresponding real-host gate NOT_RUN/BLOCKED. Fixture success cannot substitute for HC-09/13. Additional shell support is not promised unless separately tested and included in the supported matrix.

## 5. Clarification procedure for historical concurrent tasks

1. Preserve the existing P0-01/03/04/05 IN_PROGRESS statuses and evidence, including the scrcpy failure. Do not claim all are actively authorized to run in parallel.
2. Before resuming execution, present the next proposed **single** Task ID, exact action/device or host target, dependencies, intended files and tests; state which other tasks are waiting.
3. If independent work is needed while a task is blocked, use the explicit same-Phase exception in [playbook §6](../11_PHASE_EXECUTION_PLAYBOOK.md#6-branch-strategy--đơn-giản-tuần-tự-không-rối): task IDs, dependency proof, isolated files/resources/side effects, owners, evidence, integration order, rollback and stop conditions.
4. Wait for the user's explicit decision; record a new timestamp/source. Do not infer prior approval, backdate an exception, or treat a general documentation-review request as production authorization.
5. Keep all Phase 0 exit obligations open until evidence or a permitted, explicitly approved deferral closes them. No exception authorizes Phase 1 before Phase 0 acceptance/merge.

Independent agents reviewing disjoint documentation in this authorized normalization do not constitute parallel implementation Phases or collector execution approval.

## 6. Impact, unchanged constraints and rollback

- **Affected documents:** master gate list/traceability, execution playbook, status and future P0-10 evidence report. Original Phase 0 task IDs/commit history remain unchanged.
- **Proposed execution impact:** clearer coverage and additional collector robustness/privacy tests; possible extra feasibility work must be estimated and approved, not hidden in a documentation task.
- **No product implementation:** no source/script/UI-reference change, install, device manipulation, benchmark, dependency pin, architecture acceptance or Phase advancement in this amendment.
- **Unchanged safety:** ADB per-device input owner; Python vision never sends competing input; scrcpy candidate video-only; physical smoke remains mandatory; unsupported/policy-unclear actions remain disabled; no bypass.
- **Separately accepted decisions:** DEC-019 and DEC-020 in the decision register have their own current user approval. They do not approve this amendment, the collector hardening or Phase 0 acceptance.
- **If rejected:** retain this proposal with the rejection/revision decision; continue only the original approved baseline and explicit current task authorization. Do not delete historical evidence or amend past approvals.

## 7. Approval record — pending

| Field | Value |
|---|---|
| User decision on this amendment | **PENDING — NOT APPROVED** |
| Approver / decision timestamp / source | Not recorded |
| Proposed crosswalk/evidence requirements | Awaiting review |
| Proposed collector hardening/test scope | Awaiting approval; no source edits authorized here |
| Next active Phase 0 task / concurrency exception | Requires explicit clarification; no new decision recorded here |
| Phase 0 acceptance | **NOT ACCEPTED** |
| Production application authorization | **NO** |

Acceptance of a documentation PR alone must not fill these approval fields automatically. Record the exact approved revision and any partial approval/rejection explicitly.

## 8. Change history

- 2026-10-30: Created PROPOSED Amendment 01 for distinct G0/P0 mapping, evidence/coverage/privacy, collector hardening acceptance and clarification of historical concurrent task status. Original baseline preserved; no tests or Phase acceptance claimed.
