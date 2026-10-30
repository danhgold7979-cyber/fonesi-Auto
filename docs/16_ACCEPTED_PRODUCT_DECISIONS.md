# Accepted Product Decisions — Plan Normalization

Date: 2026-10-30. Status: ACCEPTED PRODUCT DIRECTIONS, not implementation results.

The user approved checklist items 1–17 at 15:22 UTC and items 18–22 at 15:30 UTC. DEC-019 (Manual protection OFF/opt-in) and DEC-020 (30-minute advisory) were accepted earlier in the same review. This record is the current resolution of conflicting historical proposals. Keep historical text qualified and cross-linked rather than inventing earlier acceptance.

Approval authorizes updating the documentation and the already requested separate documentation branch/draft PR. It does not certify software, approve an implementation phase, merge main, delete branches, grant credentials, install software, change system security, or publish to real social accounts.

## 1. Accepted checklist

| ID | Accepted direction | Limits / implementation gate |
|---|---|---|
| C-01 | Complete device, screen wall, account, content, schedule, queue and reporting foundations; Facebook first. Other networks explicitly unsupported. | Mock data never represents working capability. |
| C-02 | Initial pilot on owned/administered Pages: photo, album, video and Reels. Story is separately certified; Profile/Group/reactions/shares remain off. Relevant comments only in permitted scope. | Per-action policy/permission and feasibility still required; account ownership alone is insufficient. |
| C-03 | User performs initial device authorization/login. Routine certified work runs unattended; expired login, 2FA/checkpoint/security challenge stops and reports. | No bypass, silent account substitution or silent manual fallback. |
| C-04 | Manual taps/Home/Back, APK mutation and proxy changes cannot interleave with owned workflows. Explicit safe pause/takeover requires drain/reconciliation. | UNKNOWN effects remain quarantined; revalidate UI/identity before resume. |
| C-05 | Selected implementation direction: Electron + strict TypeScript + React, preserve V9 layout/CSS; SQLite; isolated Python worker; ADB sole input owner. | Exact versions, bindings, package tree and compatibility require recorded tests; incompatible choice returns for a decision, not a silent stack swap. |
| C-06 | scrcpy video-only; UI Automator semantic recognition first; OpenCV + PaddleOCR CPU-first fallback. | Dump versus instrumentation, versions/models, licenses and thresholds selected through measured feasibility. |
| C-07 | Validate current Windows host first, publish only tested host/Android support. At least two physical devices test isolation; two AVDs for repeatability, initially one running. | No universal Windows support or maximum stream claim. AVD evidence does not replace physical-device acceptance. |
| C-08 | Exact Vietnamese/English/emoji round-trip before posting. Unsupported/corrupted input blocks the job. | Any helper installation/permissions need separate approval; no uncontrolled clipboard/keyboard access. |
| C-09 | Initial proxy scope: HTTP/HTTPS at device level with real Android route verification and rollback. | SOCKS5/per-app deferred unless a separately accepted tested requirement; host reachability is not proof of app routing. |
| C-10 | Collision policy defaults QUEUE. AUTO_SHIFT explicit. Occurrences missed during downtime enter REVIEW, not an automatic catch-up flood. | Distinguish already admitted queue work from missed/unadmitted occurrences. |
| C-11 | Default IANA timezone Asia/Ho_Chi_Minh, selectable per schedule. Nonexistent DST local time skips that occurrence with notification; overlap uses the earlier occurrence exactly once. | Snapshot timezone/rule version; edits must not generate duplicate publication. |
| C-12 | Verified global account identity with cross-device publication lease within one local-PC coordinator. | Never merge by display name/avatar; unknown identity blocks; no cross-PC lock guarantee. |
| C-13 | Capture/UI/OCR diagnostics: 7 days. Technical logs: 30 days. Job history retained until explicit user cleanup. Encrypted local backups: 7 normal copies in user-chosen folder; no automatic cloud upload. | Retain unresolved UNKNOWN recovery evidence; cleanup cannot orphan necessary reconciliation/idempotency information. |
| C-14 | SQLite stores secret references; Windows-backed secret storage holds proxy secrets. Restore quarantines dispatch until effects after the snapshot are reconciled. | Same-machine and transfer-to-other-machine restore need separate key/portability proof; no untested portability promise. |
| C-15 | Stream FPS/resolution/concurrency depend on backend/device capability and measured host budgets. Missing sensors/social metrics are unavailable, not zero or inferred viral status. | Numeric budgets require recorded benchmark approval; no arbitrary universal thresholds. |
| C-16 | Each phase has deliverables, failure tests, evidence and acceptance. Release requires Windows installer, install/upgrade/recovery tests and verified support matrix. | UI launch alone is not completion; disabled capabilities require visible reasons. |
| C-17 | USB acceptance first. Wireless Debugging disabled until dedicated authenticated pairing/reconnect tests pass. | Never expose unauthenticated ADB ports; deferral is explicit. |
| C-18 | Every-N-day recurrence anchors to selected start date in schedule timezone. End date inclusive. Maximum occurrences counts planned occurrences, not successful posts. Retries do not add occurrences or create unlimited replacements. AUTO_SHIFT stays within configured window and same local day; otherwise REVIEW. | If both end date and max occurrences exist, stop at the first reached constraint. Skips retain audit and do not auto-create replacement occurrences. Validate slots/counts before saving. |
| C-19 | A row with complete valid date/time/timezone explicitly overrides schedule profile and is visibly labeled. Absent row override follows profile; partial/invalid override is an error. | Never generate both a row and profile job for the same content occurrence. Admitted queue jobs remain QUEUE; downtime-missed occurrences remain REVIEW. |
| C-20 | Explicit album/group key and ordered assets represent one post per target. Never infer a folder is an album. | Check exact count/order and certified composer constraints before publish and in outcome evidence. |
| C-21 | Clean only tool-owned staged media copies after verified completion, never original user files. UNKNOWN retains recovery data. Derived metrics/history remain until user chooses cleanup, not the technical-log retention window. | Track ownership/manifests; do not delete unrelated phone files or unresolved evidence. |
| C-22 | Encrypted backup before data migration and at most once daily while app runs; manual backup available. Keep seven validated ordinary copies. Pre-migration safety copy retained until upgrade accepted. | Backup failure is visible and never replaces/deletes a known-good copy. Migration must not proceed without its verified prerequisite backup. |

## 2. Previously accepted controls

- **DEC-019:** Manual emergency protection OFF by default, explicit opt-in; preserve requested settings and input ownership. Numerical thresholds/recovery profiles require tests.
- **DEC-020:** Below-30-minute gaps warn only; no save rejection or hidden time shift solely for this advisory. Account/device mutual exclusion and certified platform limits remain separate.

## 3. Items that remain empirical or phase-specific

Not unresolved product preferences: exact dependency/runtime versions, UI Automator deployment model, OCR confidence/latency budget, stream envelope, telemetry source/interval, proxy mechanism, Unicode helper, SQLite binding/indexes, lease heartbeat/TTL and installer signing identity/channel. The responsible phase must define its experiment/inputs, measure, record the chosen values and obtain required approval before implementation depending on them. No blanket authorization to fill these with guesses.

Actual device/profile selection, authorized pilot Page/account/content/audience/test volume/stop conditions, backup folder, signing identity and release destination are supplied at their named gates. Do not demand credentials in chat or publish device/private data merely to complete a plan.

## 4. Baseline synchronization

[Decision register](08_DECISIONS_AND_OPEN_ITEMS.md) links historical B/D entries to these resolutions. The master, acceptance, data/architecture and phase drafts must consistently distinguish these accepted directions from untested implementation details. Approved historical Phase 0 scope is preserved; the proposed numbered amendment still needs its own acceptance before changing that execution baseline. No task or Phase is PASS solely because this decision register is accepted.
