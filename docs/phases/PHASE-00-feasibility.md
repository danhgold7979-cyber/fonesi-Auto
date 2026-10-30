# PHASE-00 — Product, Policy & Feasibility

Status: APPROVED / IN_PROGRESS  
Branch: `phase/00-feasibility`  
Base: `main` @ `e85d2c0c67a3aefa11dc390739243653d2b1bbf0`  
Created: 2026-10-30  
Repository: `danhgold7979-cyber/fonesi-Auto`

> Draft only. This Phase does not authorize production application coding. It permits documentation, read-only diagnostics, disposable feasibility scripts and test-lab setup after this plan is approved.

## 1. Objective and source mapping

Close the Phase 0 gates in `docs/04_MASTER_IMPLEMENTATION_PLAN.md` using evidence. Read and follow `AGENTS.md`, `README.md`, `docs/00_MASTER_PLAN.md`, `docs/01_PRODUCT_SCOPE.md`, `docs/02_TECHNICAL_ARCHITECTURE.md`, `docs/03_DATA_AND_WORKFLOWS.md`, `docs/05_ACCEPTANCE_AND_RISKS.md`, `docs/06_UI_V9_MAPPING.md`, `docs/08_DECISIONS_AND_OPEN_ITEMS.md`, `docs/09_GIT_WORKFLOW.md`, `docs/11_PHASE_EXECUTION_PLAYBOOK.md`, `docs/12_HARDWARE_RESOURCE_AND_STREAM_CONTROLS.md`, `docs/13_DOCUMENTATION_CHANGE_POLICY.md` and the complete V9 HTML for any UI-related analysis.

## 2. Scope

### In scope
- Verify Windows version/build, virtualization, install permissions, CPU/RAM/GPU/storage and drivers.
- Build an Android Studio Emulator lab with two initial AVDs (API 33 and 34 if images are available and compatible).
- Validate serial-scoped ADB, screenshots, reconnect and parallel AVD behavior.
- Compare UI Automator hierarchy dump vs instrumentation runner.
- Spike scrcpy as video-only, including version/license/resource review.
- Measure Windows CPU/RAM/GPU/disk/network telemetry availability, freshness and sampling overhead.
- Benchmark OpenCV/OCR candidates using labeled Vietnamese/English fixtures.
- Record a per-workflow Facebook policy/capability matrix; unsupported actions remain disabled.
- Decide Electron/TypeScript renderer framework, SQLite, secret storage, backup, retention and supported Windows matrix.
- Create ADRs and update canonical documents after decisions are approved.

### Out of scope
- Production application code or V9 renderer integration.
- Facebook login/post/comment/reaction automation.
- Real user accounts or sensitive personal data in emulator.
- CAPTCHA/checkpoint/2FA/rate-limit/anti-abuse bypass.
- Guaranteed stream concurrency before benchmark.
- Automatic changes to BIOS, Windows optional features or existing SDK installations.
- Any copying/porting/dependency on source code, packages, schemas, tests or runtime from `fonesi-W`.

## 3. Hardware baseline received

From user-provided `Fonesi-Auto-Report-20261030-204902.zip`:
- Intel Core i7-10750H, 6 cores / 12 threads.
- 16 GB DDR4-2667 RAM.
- NVIDIA GTX 1650 Ti 4 GB + Intel UHD Graphics.
- Approximately 512 GB SSD + 2 TB HDD.
- Windows 10 build 19044.
- Node.js 24.21.0, npm 11.19.0, Python 3.12.10 and 3.14.2, Git 2.55.0.
- ADB 34.0.5 was found under another application's directory. Fonesi-Auto must evaluate and pin its own Android Platform Tools; do not depend on that external app path.
- No Android devices were detected in the report.
- GPU decode, thermal behavior, actual network throughput and multi-stream performance remain unmeasured.

Windows build 19044 requires a compatibility/support assessment; do not infer support from its version string alone.

## 4. Android Emulator Lab

User-approved direction: Android Studio Emulator, start with two virtual devices.
- AVD-01: API 33, Pixel-like profile, 720p class.
- AVD-02: API 34, Pixel-like profile, 1080p class.
- These are targets, subject to SDK image availability and host compatibility.
- Start with one AVD at a time. Run both concurrently only after measuring memory, CPU, GPU decode and stability; 16 GB RAM is not assumed sufficient.
- Emulator supports repeatable ADB, hierarchy, screenshot, OCR and basic reconnect tests. It does not replace physical USB/OEM/real-device acceptance.
- Deliver read-only preflight, explicit create/start/stop scripts, ADB health checks, sanitized logs/screenshots and cleanup instructions.
- Do not enable virtualization features or change BIOS/Windows settings automatically.

## 5. Task breakdown

| Task ID | Objective | Dependencies | Expected files/evidence | Acceptance | Status |
|---|---|---|---|---|---|
| P0-01 | Verify host Windows, virtualization, permissions and hardware | Hardware ZIP | `tools/phase-00/Collect-HostEnvironment.ps1` + host report | Actual values, sources and unavailable sensors recorded | BLOCKED — awaiting Windows execution |
| P0-02 | Verify Android SDK and provision two AVDs | P0-01 | `tools/android-lab/*`, lab guide | Both AVDs reproducibly create/start/stop without changing host settings | NOT_STARTED |
| P0-03 | Validate multi-AVD ADB isolation | P0-02 | ADB test script + evidence | Each command targets explicit serial; screenshot/reconnect pass | NOT_STARTED |
| P0-04 | UI Automator feasibility | P0-02/03 | Spike report + fixtures | Select hierarchy/instrumentation approach with evidence | NOT_STARTED |
| P0-05 | scrcpy video-only feasibility and licensing | P0-03 | Spike report + license inventory | Version, license, video-only boundary and resource impact documented | NOT_STARTED |
| P0-06 | Windows telemetry feasibility | P0-01 | Telemetry matrix + script | CPU/RAM/GPU/disk/network availability and timestamps validated; missing != zero | NOT_STARTED |
| P0-07 | OCR candidate benchmark | P0-02 | Labeled fixtures + results | Vietnamese/English accuracy, latency, memory and packaging measured | NOT_STARTED |
| P0-08 | Facebook policy/capability review | Product scope | Decision matrix | Each capability ALLOWED/BLOCKED/DEFERRED/NEEDS_REVIEW; no bypass | NOT_STARTED |
| P0-09 | Architecture/privacy/backup decisions | P0-01..08 | ADRs + canonical doc updates | Stack, secrets, retention, backup and Windows support decisions recorded | NOT_STARTED |
| P0-10 | Phase 0 acceptance | P0-01..09 | Updated `docs/PHASE_STATUS.md` + acceptance report | Every gate passed or explicitly deferred by user with consequences | NOT_STARTED |

## 6. Open decisions

| ID | Question | Recommendation | State |
|---|---|---|---|
| LAB-01 | Run two AVDs simultaneously? | Create two, start one first; concurrent mode only after benchmark | Direction approved |
| LAB-02 | Physical device in Phase 0? | Emulator-first development; physical smoke test remains required before claiming real-device support unless user explicitly defers | Proposed |
| B-001..005 | Facebook permissions and action scope | Only capabilities with documented permission may be enabled; others stay disabled | OPEN |
| B-006 | Physical Android matrix | Identify at least one physical device for real-device acceptance | OPEN |
| B-007 | Host minimum/recommended profiles | Treat this PC as one benchmark sample, not universal minimum | OPEN |
| B-008..018 | scrcpy, UI Automator, OCR, Unicode, proxy, scheduler, retention and stream policy | Resolve with evidence or user-approved deferral | OPEN |

## 7. ChatGPT-first development and Git rules

- ChatGPT is the primary authoring/review environment; GitHub is the source of truth.
- Windows is the build/emulator/hardware-test host. Do not assume ChatGPT can run Windows builds, AVDs, GPU or USB tests.
- Mark tests PASS only with actual execution output/evidence.
- One Phase branch at a time; sequential task commits after PASS; Conventional Commits.
- Never commit directly to `main`, force-push, or merge without user approval.
- Do not code on the planning branch.
- No `fonesi-W` source reuse.

## 8. Test strategy

| Layer | Procedure | Required |
|---|---|---|
| Static review | Script safety, scope and secret review | Yes |
| PowerShell | Parse scripts on Windows | Yes |
| Host preflight | CIM/Windows telemetry collection | Yes |
| AVD lifecycle | Create/start/stop/snapshot | Yes |
| ADB isolation | Explicit serial, screenshot, reconnect | Yes |
| UI hierarchy | Dump vs instrumentation comparison | Yes |
| Stream | FPS, latency, dropped frames, CPU/RAM/GPU | Yes |
| OCR | Labeled Vietnamese/English fixtures | Yes |
| Policy | Per-workflow review | Yes |
| Physical device | ADB/UI Automator/Vision smoke test | Required before Phase 0 acceptance unless user approves deferral |

## 9. Security, privacy and rollback

- Synthetic test data only; no passwords, OTPs, cookies, tokens or personal file collection.
- No external ADB port exposure.
- Sanitize serials, local IPs, usernames and machine identifiers from public evidence.
- Lab scripts are separate from production packages.
- Record AVD names and storage paths; never delete AVDs automatically.
- Provide explicit cleanup commands.
- Do not overwrite existing SDKs or change BIOS/Windows features automatically.

## 10. Risks

| Risk | Mitigation |
|---|---|
| 16 GB RAM cannot sustain two AVDs plus IDE/stream | Start one AVD, measure, then test two |
| Windows build 19044 compatibility/support | Assess upgrade path before support decision |
| GPU counters missing/driver-specific | Report UNKNOWN with source and availability |
| Emulator differs from physical Android | Keep physical-device acceptance gate |
| System images unavailable | Pin available image IDs and document alternative |
| Facebook automation permission unclear | Keep affected capabilities disabled |
| scrcpy resource/license mismatch | Complete spike before pinning |

## 11. Phase exit criteria

- [ ] Windows compatibility/support decision recorded.
- [ ] Two AVDs reproducibly provisioned and tested within measured host envelope.
- [ ] ADB serial isolation tests pass.
- [ ] UI Automator model selected with evidence.
- [ ] scrcpy feasibility/license/video-only boundary proven or deferred.
- [ ] Host telemetry availability and limitations documented.
- [ ] OCR candidate benchmark completed.
- [ ] Facebook capability/policy matrix recorded.
- [ ] ADRs and canonical documents updated.
- [ ] Privacy, backup, retention and secret-storage decisions recorded.
- [ ] Physical-device smoke test passed or explicitly deferred by user.
- [ ] Acceptance report reviewed and user-approved.

## 12. Approval

User decision: APPROVED  
Approved scope: Phase 0 feasibility, diagnostics, Emulator lab and required physical-device smoke test  
Production application coding authorized: NO (Phase 0 is feasibility-only)  
Phase 0 diagnostics / disposable feasibility scripts authorized: YES

## 13. Execution log

| Date | Task | Commit | Tests | Result |
|---|---|---|---|---|
| 2026-10-30 | User approved Phase 0 plan; physical-device smoke test mandatory before acceptance | `6578b53` | Plan/entry-gate review | APPROVED |\n| 2026-10-30 | P0-01 host preflight collector authored | `41dc021` | Static source review only; Windows PowerShell execution not available in ChatGPT environment | BLOCKED pending user run |

Approval recorded from user on 2026-10-30. Physical-device smoke test is mandatory before Phase 0 acceptance; Emulator-only evidence is insufficient.

P0-01 script is authored at `tools/phase-00/Collect-HostEnvironment.ps1`. It is read-only and packages host prerequisites into a ZIP. It has not been executed on the target Windows host; do not treat P0-01 as PASS until the user runs it and the report is reviewed.

## 14. Phase acceptance report

To be completed after execution and evidence review.
