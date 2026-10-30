# Decisions, Open Questions and 10-Round Review

**Revision:** 0.1-draft · **Status:** Open decision register

## 1. Overall readiness

- **Ready to write a detailed plan:** YES.
- **Ready to start production implementation:** NO.
- **Reason:** several blockers concern platform-policy permission, real Android UI Automator behavior, account identity/session handling, stream concurrency and automatic-only Facebook requirements.

The product scope and V9 interface are sufficiently defined for planning. The technical stack is selected at the architectural level, but version pins and operational details require Phase 0 proof-of-concept.

## 2. Decisions already recorded

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

## 3. Blocking questions (must close before production code)

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

**Required decision:** Approve emergency throttling as an opt-in safeguard, enabled by default?

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
