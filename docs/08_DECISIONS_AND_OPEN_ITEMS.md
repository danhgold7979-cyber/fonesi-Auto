# Decisions, Open Questions and 10-Round Review

**Revision:** 0.2-review · **Updated:** 2026-10-30 · **Status:** Historical decisions plus current resolutions

## 1. Overall readiness

- **Ready to write a detailed plan:** YES.
- **Ready to start production implementation:** NO.
- **Reason:** several blockers concern platform-policy permission, real Android UI Automator behavior, account identity/session handling, stream concurrency and automatic-only Facebook requirements.

The product scope and V9 interface are sufficiently defined for planning. The desktop/database/OCR directions are selected under C-05/C-06; exact versions, models, bindings and operational details still require Phase 0 evidence and technical review.

## 2. Historical decisions already recorded

Current resolutions are in §8 and [accepted checklist C-01–C-22](16_ACCEPTED_PRODUCT_DECISIONS.md). Historical proposed states below do not reopen choices that the user subsequently accepted.

| ID | Decision | State |
|---|---|---|
| D-001 | New clean-slate repository: fonesi-Auto | CONFIRMED |
| D-002 | Do not reuse source code/architecture/contracts from fonesi-W | CONFIRMED |
| D-003 | V9 is the approved UI reference | CONFIRMED |
| D-004 | Windows desktop application | CONFIRMED at product level |
| D-005 | ADB is the device control plane; no Meta Graph API for phone operations | CONFIRMED |
| D-006 | UI Automator + OpenCV/OCR + Python Vision Worker | CONFIRMED at technology-family level |
| D-007 | Fixed workflows, not a drag-and-drop node editor | CONFIRMED |
| D-008 | Facebook first | CONFIRMED |
| D-009 | All enabled workflows must be unattended; no manual fallback in an enabled workflow | CONFIRMED |
| D-010 | Unsupported workflow must be disabled/deferred, not shown as successful | PROPOSED SAFETY RULE |
| D-011 | Unlimited device records, but bounded stream/worker concurrency | PROPOSED TECHNICAL RULE |
| D-012 | scrcpy for video-only screen wall, with ADB as sole input authority | RECOMMENDED; needs approval |
| D-013 | Electron + TypeScript desktop shell | RECOMMENDED; needs approval |
| D-014 | SQLite + Windows secret store | RECOMMENDED; needs approval |
| D-015 | PaddleOCR as OCR candidate | RECOMMENDED; benchmark required |
| D-016 | User-adjustable FPS/resolution/bitrate and live host resource warnings | CONFIRMED PRODUCT REQUIREMENT |
| D-017 | Auto and Manual stream modes with per-device overrides | CONFIRMED PRODUCT REQUIREMENT |
| D-018 | Emergency throttling of background preview streams | PROPOSED SAFETY DEFAULT; user may opt in/out |

## 3. Historical blocking questions and technical gates

Use the current disposition in §8. A historical “Required decision” sentence is not a fresh request where C-01–C-22 already resolves the choice; unresolved empirical evidence still gates implementation.

### B-001 — Permission to automate Facebook through its app UI
**Problem:** ADB can technically tap/type/scroll in Facebook, but this does not prove Meta permits automated access, collection or engagement. Meta publicly describes restrictions on automated data collection without permission and enforcement against spam/fake engagement.

**Recommendation:** Obtain a written policy/legal determination for each intended action and account/target scope. Do not build CAPTCHA/checkpoint/rate-limit/anti-abuse bypasses. If permission is absent or unclear, the workflow remains disabled.

**Required decision:** Is the intended use limited to Pages/accounts the user owns or administers, and can the project obtain/retain an appropriate authorization determination?

### B-002 — What does "no manual" include?
**Problem:** First-time login, 2FA, device RSA authorization, Wireless Debugging pairing, account challenge and password reset may require human action and must not be bypassed.

**Recommendation:** Treat initial device authorization and initial social-account login as provisioning prerequisites. Once an account is in a verified active session, scheduled workflows can run unattended. Any challenge/2FA/checkpoint pauses the account and requires legitimate recovery; the automation must not solve/bypass it.

**Required decision:** Does "no manual" apply to routine scheduled workflow execution, while allowing one-time device/account provisioning and security recovery?

### B-003 — Facebook target scope for first release
**Problem:** Page, Profile and Group have different UI and platform constraints. Group discovery and bulk publishing are especially high-risk.

**Recommendation:** First production pilot: one or more Pages owned/administered by the user. Keep Profile and Group visible but disabled until separate policy and device certification gates pass.

**Required decision:** Approve Page-only as the first enabled target type?

### B-004 — Comment and engagement scope
**Problem:** Commenting arbitrary links, Like/Love/Share on arbitrary posts and "fill to N latest posts" can become coordinated fake engagement or spam. Automated reading of arbitrary posts/metrics also raises data-access concerns.

**Recommendation:** Exclude bulk reaction/engagement farming. Any comment automation must be restricted to a clearly authorized, content-relevant, non-spam use case and pass policy review. Do not automate arbitrary third-party engagement.

**Required decision:** Should Phase 1 remove bulk Like/Love/Share and arbitrary-link comment workflows, keeping them disabled in the catalog?

### B-005 — Account provisioning and multiple accounts on one phone
**Problem:** A phone may have multiple logged-in accounts, but exact active identity must be verified before every job. Account switching can expose security challenges.

**Recommendation:** Initially require accounts to be already logged in and verifiable. Store account label/handle/target evidence, not credentials. Account switch is allowed only through a tested, stable app UI flow. Challenge state blocks jobs.

**Required decision:** Is pre-logged-in account provisioning acceptable for MVP?

### B-006 — Device test matrix
**Problem:** UI Automator, accessibility hierarchy and app UI differ by Android/OEM/version.

**Recommendation:** Start with two physical phones of different manufacturers, one common Android version and Vietnamese/English locale; expand only after stable baseline. Need exact models and Android versions from the user.

**Required decision:** Which two or three phones can be used as the first hardware test fleet?

### B-007 — Host computer capacity
**Problem:** Screen streaming, OCR and multiple device workers are resource-intensive.

**Recommendation:** Collect host CPU, RAM, GPU, storage and USB topology. Set an initial target of 4/8/16 simultaneous streams only after measured benchmark; do not promise unlimited live streams.

**Required decision:** What Windows PC specification will run Fonesi-Auto?

### B-008 — scrcpy inclusion
**Problem:** ADB screenshots are not enough for a responsive live wall at scale. scrcpy supports low-latency Android mirroring, but introduces binary packaging, licensing and resource considerations.

**Recommendation:** Include scrcpy as video-only stream; ADB Device Host remains sole input controller.

**Required decision:** Approve scrcpy as a supporting technology in addition to the four selected technology families?

### B-009 — UI Automator execution model
**Problem:** UI Automator is an Android testing/automation framework; it may require instrumentation runner/test APK. ADB uiautomator dump is simpler but may not expose all app UI states.

**Recommendation:** Phase 0 spike compares read-only hierarchy dump with an instrumentation runner. Choose stable version after measuring support, reliability and deployment overhead.

**Required decision:** Approve the spike before selecting the final model (recommended).

### B-010 — OCR model
**Problem:** OpenCV is confirmed as image-processing technology; OCR model is not locked.

**Recommendation:** Benchmark PaddleOCR PP-OCRv5/PP-OCRv6 candidate models for Vietnamese and English. Choose based on real screenshot accuracy, CPU speed, memory and package size.

**Required decision:** Approve PaddleOCR as the candidate model, subject to benchmark?

### B-011 — Unicode input
**Problem:** ADB shell input text is not a reliable universal path for Vietnamese accents, emoji and some special characters.

**Recommendation:** Run a proof-of-concept for text input and round-trip verification. Do not implement posting until caption/comment Unicode is exact.

**Required decision:** None; technical gate.

### B-012 — Proxy model
**Problem:** A host-side proxy test does not prove Android app traffic uses the proxy. System proxy may not be honored by every app; per-app routing may require a VPN-based method and user-granted Android permission.

**Recommendation:** Define supported proxy types (HTTP/HTTPS/SOCKS5), authentication, assignment scope (whole device vs app), test URL/egress verification and rollback before coding.

**Required decision:** Which proxy types and routing scope are required?

### B-013 — Recurrence and conflict policy
**Problem:** Previous requirements mention every N days, multiple posts/day, 30-minute warning, queue and automatic adjustment.

**Recommendation:** Default collision policy QUEUE; AUTO_SHIFT is optional and visible in the calendar. Store timezone as IANA. One device has one foreground job; one account has one publish lease.

**Required decision:** Confirm QUEUE default and AUTO_SHIFT opt-in?

### B-014 — Tracking and recommendation metrics
**Problem:** ADB/OCR can read visible UI but does not guarantee access to historical/current-user interaction state or recommendation-source metrics. Automated collection itself may be restricted.

**Recommendation:** Track only permitted and verifiable values. Distinguish unknown/unavailable from zero. Do not infer "viral" without source-specific reach/impression data.

**Required decision:** Accept unavailable metrics rather than guessing?

### B-015 — Data retention and backup
**Problem:** Screenshots, UI trees, OCR text, account metadata and logs can contain personal data.

**Recommendation:** Set retention periods, local encryption/backup policy and redaction rules before release.

**Required decision:** Choose retention window and whether backups are encrypted with a user-held password or Windows account protection.

### B-016 — Stream control ranges and profiles
**Problem:** A universal FPS/bitrate/resolution range may not be supported by every phone, scrcpy build, decoder or PC.

**Recommendation:** Expose user sliders, but derive available ranges and recommended values from device capability plus the current host benchmark. Initial UI may show common presets; exact numeric ranges are pinned after Phase 0/3 tests.

**Required decision:** Approve dynamic ranges rather than promising identical maximum settings on every PC?

### B-017 — Manual mode during critical overload
**Problem:** A manually selected stream profile may overload the host. Silently changing it violates user intent; refusing to protect the app may destabilize previews.

**Recommendation:** Keep requested settings unchanged. If emergency-throttle is enabled, temporarily reduce/pause background preview streams, show a warning and log requested/effective values. Never interrupt ADB workflow commands. Restore after a stable recovery window if enabled.

**Historical question:** Approve emergency throttling as an opt-in safeguard, enabled by default?

**Resolution (2026-10-30):** Superseded by accepted DEC-019 below. Manual emergency throttling defaults OFF and requires explicit opt-in. The contradictory historical question is retained for traceability.

### B-018 — Windows telemetry availability
**Problem:** GPU utilization/memory, temperature and USB bandwidth are not exposed uniformly by every driver/adapter.

**Recommendation:** Use Windows-supported counters/APIs as baseline, optional vendor adapters where available, and explicit UNKNOWN/Not available states for unsupported sensors. Never treat missing metrics as zero.

**Required decision:** Accept that some host metrics may show Not available on some PCs?

## 4. Ten-round review programme

| Round | Scope | Current status | Exit artifact |
|---|---|---|---|
| 1 | Product scope and V9 UI baseline | DRAFT COMPLETE | Product requirements + UI mapping |
| 2 | Facebook platform policy and automation boundaries | PARTIAL / BLOCKED | Per-workflow capability/policy matrix |
| 3 | Android, ADB, UI Automator, scrcpy, multi-device scale | NOT COMPLETE | Physical-device feasibility report |
| 4 | Account identity, target discovery, app sessions | NOT COMPLETE | Account/target state model + proof |
| 5 | Media library, Excel, Unicode, caption/comment rules | DRAFT ONLY | Content schema + import test fixtures |
| 6 | Fixed workflow state machines and recovery | DRAFT ONLY | Workflow specifications and effect model |
| 7 | Scheduler, recurrence, collision, queue and leases | DRAFT ONLY | Schedule schema + deterministic test cases |
| 8 | Tracking, analytics, metrics provenance and reports | DRAFT ONLY | Metric capability matrix |
| 9 | Architecture, security, privacy, packaging and performance | DRAFT ONLY | ADR set + threat/resource model |
| 10 | Acceptance, test matrix, rollout and final implementation plan | NOT COMPLETE | Approved execution backlog |

A round is not complete until its open items are resolved or explicitly marked deferred with user approval.

## 5. Final readiness verdict

**CLEAR TO PLAN:** YES.
**CLEAR TO START PRODUCTION CODE:** NO.

The plan may be refined and stored now. The first code implementation should begin only after B-001 through B-010 are either resolved or formally deferred with an agreed product consequence. B-011 through B-015 must be resolved before their dependent modules are implemented.

If a requested automatic Facebook action cannot be shown to be permitted and reliable, the correct result is disabled/unavailable. The no-manual requirement does not justify bypassing platform safeguards.


## 6. Plan normalization resolutions — 2026-10-30

Authority: the user requested whole-plan normalization, then accepted the assistant's stated recommendations on 2026-10-30. Approval covers the two behavioral choices below and publishing documentation to a separate branch with a draft PR. It does not accept Phase 0 results, enable Facebook actions, approve a production implementation phase or authorize merging main.

### DEC-019 — Manual emergency throttle default
- Status: **ACCEPTED**, user decision 2026-10-30.
- Manual mode preserves requested settings. Emergency throttling defaults **OFF**; only explicit user opt-in permits temporary preview reduction/pause under critical pressure.
- Always display warnings and effective/requested values. Do not silently turn the toggle on, cancel an ADB job, or overwrite requested settings during recovery.
- Unsupported input values may be rejected with a reason; this is not permission to silently change an existing profile. Hardware/OS failure can make a stream unavailable and must be reported as such.
- Supersedes the default-on proposal in B-017. D-018 remains historical; its unresolved default is settled by this resolution.
- Acceptance: Manual/OFF leaves requested preview policy unchanged under simulated pressure and reports warnings; Manual/ON applies only bounded preview protection, logs/restores according to explicitly configured policy, and leaves device input ownership intact.
- Related: [stream policy ADR](decisions/ADR-0002-stream-resource-policy.md), G0-18, Phase 3.

### DEC-020 — 30-minute spacing is advisory
- Status: **ACCEPTED**, user decision 2026-10-30.
- A gap below 30 minutes emits a visible warning; it does not by itself reject a schedule, shift a timestamp, or cancel a job.
- Device serialization, account leases, platform capability limits and queue conflict handling remain mandatory and separate from this advisory rule.
- DEC-020 originally resolved only the gap advisory. Later accepted C-10/C-11/C-18/C-19 select QUEUE, explicit AUTO_SHIFT, missed-run REVIEW and exact recurrence/DST/override rules; technical validation remains pending.
- Acceptance: a 29-minute gap remains schedulable with warning; 30 minutes has no below-gap warning; jobs that collide on a device/account are still serialized.
- Related: [scheduler ADR](decisions/ADR-0003-schedule-gap-policy.md), Phase 7.

### DEC-021 — Documentation reconciliation scope
- Status: **AUTHORIZED DOCUMENTATION WORK**, not product-code authorization.
- Update living documents in place with Git history. Preserve the accepted Phase 0 execution baseline and add a numbered proposed amendment for changed execution/acceptance requirements.
- Master feasibility gates use G0-*; approved execution tasks retain P0-*; traceability records aliases, consolidations and outstanding coverage. Do not count an ID migration as completed implementation.
- Default execution remains one accepted/merged phase at a time. Preparing draft future-phase plans is allowed documentation work, not starting those implementation phases.
- Publish the reviewed document changes on a separate documentation branch and open a draft PR. Main merge and production coding are outside this grant.

## 7. Historical decision-closure checklist (superseded by §8)

This table predates acceptance of C-01–C-22. Its requests to confirm product preferences are historical, not current blockers; use §8 for resolved choices and remaining evidence.

| Item | What closes it | Owner / timing |
|---|---|---|
| B-001, B-003, B-004 | Per-action permission/capability matrix with sources, scope and explicit enable/disable decision; ownership alone is not platform permission | Product owner + competent policy reviewer; Phase 0 and again before Phase 9 |
| B-002, B-005 | Confirm routine unattended execution versus legitimate provisioning/security-recovery boundaries | Product owner before account/runtime implementation |
| B-006, B-007 | Sanitized physical fleet matrix and host/AVD/stream benchmark; one host sample is not universal capacity | Windows/device test operator during Phase 0 |
| B-008, B-009, B-010, B-011 | Reproducible stream, hierarchy/instrumentation, OCR and Unicode evidence, pinned versions/licenses and failure tests | Engineering/test operator during Phase 0; dependent phases blocked until passed |
| B-012 | Supported proxy types, routing mechanism, permission prompts, device egress and rollback proof | Product owner + device test operator before Phase 5 |
| B-013 | Collision/overdue/DST policies and deterministic fixtures; DEC-020 resolves advisory gap only | Product owner + engineering before Phase 7 |
| B-014 | Metric source/availability contract; no inferred zero or invented viral data | Product owner + policy reviewer before tracking |
| B-015 | Retention, backup encryption/key recovery and deletion policy approved | Product owner before persistence/evidence implementation |
| B-016 | Capability-derived ranges and measured resource profiles | Device/Windows test operator during Phase 0/3 |
| B-017 | Default choice closed by DEC-019; thresholds/recovery profile still require benchmark approval | Product owner decision recorded; engineering evidence pending |
| B-018 | Telemetry source/availability tests; UNKNOWN behavior retained | Windows test operator during Phase 0/3 |
| Stack/schema/IPC choices | Approved ADRs and contract tests; recommendation is not acceptance | Product owner + engineering before relevant production phase |

A decision record must include status, approver, date, affected task IDs, source evidence and consequences. Do not infer acceptance from this document being merged. Any proposed deferral must state affected features, disabled UI behavior, replacement coverage and a return gate; no blanket gate bypass.

## Change history
- 2026-10-30: Added accepted DEC-019/020 from the user's explicit confirmation; preserved historical proposals. Added documentation-only scope and evidence ownership. All other open decisions remain unapproved.


## 8. Current resolutions after checklist acceptance

The user accepted C-01–C-17 at 2026-10-30 15:22 UTC and C-18–C-22 at 15:30 UTC. See the exact bounded choices in [Accepted Product Decisions](16_ACCEPTED_PRODUCT_DECISIONS.md). These supersede contradictory historical proposals, not physical evidence or Phase acceptance.

| Historical item | Current choice | Still required, without asking the same choice again |
|---|---|---|
| D-009 / B-002 / B-005 | C-03: initial legitimate provisioning/login and security recovery are operator prerequisites; routine certified jobs unattended | Identity/session/challenge tests and permissions for actual operations |
| B-001 | C-02 limits permitted pilot scope; no automatic permission claim | Per-action policy/permission evidence and explicit pilot details |
| D-008 / B-003 / B-004 | C-01/C-02: Facebook first, owned/admin Page media pilot; other targets/actions disabled as specified | Separate Story/profile/action certification before enabling anything outside initial pilot |
| B-006 / B-007 | C-07: current host, two physical devices plus repeatable AVD tests; only measured support claims | Exact test profiles, host acceleration, hardware availability, measured envelopes |
| D-012 / B-008 | C-06 selects video-only scrcpy direction | Version/codec/license/integration/Windows packaging evidence |
| B-009 | C-06 approves comparing semantic deployment approaches | Dump vs instrumentation choice with real fixtures, deployment permissions and pinned version |
| D-015 / B-010 | C-06 selects CPU-first OpenCV/PaddleOCR candidate direction | Labeled holdout accuracy/latency/confidence, model/runtime compatibility |
| B-011 | C-08 exact Unicode round-trip required | Tested input method; approval for any helper installation/permissions |
| D-013 / D-014 | C-05: Electron + strict TypeScript + React, SQLite and Windows-backed secret direction selected | Exact bindings/version pins, compatibility, migrations, security tests and ADR review |
| B-012 | C-09: HTTP/HTTPS device proxy first; SOCKS5/per-app deferred | Working Android route/egress and rollback; no host-only false LIVE |
| B-013 | C-10/C-11/C-18/C-19: QUEUE, explicit bounded AUTO_SHIFT, missed REVIEW, timezone/DST/count/override semantics | Deterministic clock/queue/occurrence tests and performance limits |
| B-014 | C-15: unavailable metrics explicit; no invented growth/viral result | Permitted metric source, provenance/freshness and device tests |
| B-015 | C-13/C-14/C-21/C-22: explicit retention classes, encrypted local backup cadence/copies, staged cleanup and restore quarantine | Backup folder, key/portability mechanism and validated restore/migration/privacy implementation |
| B-016 / B-018 | C-15: dynamic capability/budget-derived ranges and UNKNOWN sensors | Measured limits, telemetry source/interval/overhead and hard envelope |
| D-018 / B-017 | DEC-019: Manual emergency OFF, explicit opt-in | Measured thresholds/recovery settings, ownership-preserving overload tests |
| Wireless first release | C-17: USB first; wireless gated | Authenticated pairing/reconnect and security tests before enablement |
| Album/import shape | C-20: explicit ordered album assets, one post per target | Schema, staging/composer/read-back count/order test coverage |
| Operation arbitration | C-04: safe pause/takeover, no input/APK/proxy interleaving | Whole-workflow ownership, draining/fencing/reconciliation and negative tests |

No further product preference is left to code by guesswork within this checklist. Concrete test inputs and engineering parameters above remain named evidence gates, not automatically accepted values. If testing disproves the chosen direction, report the conflict and options before changing the product or declaring the gate passed.

### Current authorization boundary

Documentation normalization and a separate documentation branch/draft PR are approved. All application phases remain NOT_STARTED until their entry/acceptance/authorization rules are met. The proposed Phase 0 amendment remains proposed; the accepted checklist does not retroactively validate test results or change the approved Phase 0 execution record. No branch deletion or main merge is authorized here.

### Change history addition
- 2026-10-30: Recorded accepted C-01–C-22, mapped historical B/D questions to selected directions versus remaining empirical gates, and retained the original decision history.

## 9. DEC-022 — Continue independent work without inventing gate acceptance

Recorded 2026-10-30 17:10 UTC; authority: latest owner instructions in the project conversation (exact message timestamps unavailable; this is the recording time):

> Auto cứ tiến hành code đi. đã đủ điều kiện để code chưa, code phase 1 cho đến phase cuối cùng hoàn thiện luôn đi nha

The assistant explicitly limited execution: “Hiện chưa đủ bằng chứng để xác nhận Phase 0 đạt... Mình sẽ tiếp tục những phần code độc lập có đủ đặc tả, đồng thời ghi rõ phần nào còn bị chặn bởi kiểm tra Windows/ảo hóa/thiết bị.” The owner subsequently directed:

> Giờ tao đi ngủ, đợi mày hoàn thiện 3 công việc vào sáng mai t chekc lại, tao trao toàn quyền làm liên tục, ko được ngưng nghe chưa.

**Decision: authorized independent coding, not empirical acceptance.** Supersedes DEC-021's documentation-only restriction and the requirement to stop all work on the first blocked task, only for independent fully specified scaffolding/contracts/tests with unresolved external gates explicitly open. It does not approve Phase 0, merge main, accept the full draft Phase 1–11 plans, choose unresolved implementations, enable capabilities or waive Windows/device/policy tests. Provisional implementation may require rework after actual Windows/physical testing; the owner’s continuation instruction is recorded with that consequence, not a fabricated PASS.

**Dependency audit / selected work:** P1-01 needs exact approved stack/version/compatibility ADRs; P1-03 needs P1-01; P1-11 needs both, and P1-02/04–10 transitively depend on them. Those dependencies remain unresolved, so production Phase 1 stays NOT_STARTED. Do not invent a SQLite binding, secret mechanism, package layout, wire schema, benchmark or supported Windows claim. Execute the genuinely independent **P0-04 offline hierarchy selector-analysis spike** on the existing Phase 0 branch instead (playbook §6 exception below). It consumes synthetic XML, not a device or P0-01 host result. No production component is created.

**Open gates / consequence:** P0-01 source is frozen. HC-09 partial historical evidence reports HypervisorPresent=true alongside contradictory CPU flags, without current optional-feature/boot/emulator acceleration proof. HC-13 historical collection predates hardened candidate f53c975 and cannot certify it. Existing 18/18 synthetic Windows tests remain synthetic. P0-04 still needs real selector-driven action/read-back, deployment comparison and broader supported profiles; offline parsing cannot pass those gates. Engineering owns the spike; owner/test operator supplies authorized empirical evidence. Revisit Phase 1 once the actual stack ADR/host proof is available. No authentication, installation, device command, proxy/security change, live posting, private artifact publication or automatic acceptance is included.

## Pending security decision — ADR-0005 (2026-10-30)

[Renderer navigation containment proposal](decisions/ADR-0005-renderer-navigation-containment-PROPOSED.md)
is documentation-only and NOT APPROVED. Option A preserves the current immutable-
document blocker; option B would require an explicitly separate, reviewed experiment
for per-document privilege revocation and availability loss. Original G0-12 source
and package20/21 failures remain FAIL; no test, accepted requirement, Phase baseline
or execution authority is superseded by this proposal. Decision owner: product
owner/delegated plan reviewer; implementation remains pending review/authorization.

2026-10-30 19:34 UTC coordinator review authorizes only ADR-0005 option B design/
primary-source feasibility research. The ADR remains PROPOSED, old failure/current
blocker remains, and implementation/experiment/acceptance amendment is not approved.
