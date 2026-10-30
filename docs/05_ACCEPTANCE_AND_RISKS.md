# Acceptance Criteria and Risk Register

**Revision:** 0.1-draft  
**Purpose:** Prevent mock UI, optimistic assumptions or unverified automation from being treated as production-ready.

## 1. Global release gates

### G0 — Product and policy
- Scope, supported platforms and no-manual expectation documented.
- Each automated platform action has a policy/permission outcome.
- No anti-detection, CAPTCHA/checkpoint bypass or unauthorized data collection.
- Unsupported actions are disabled and clearly labeled.

### G1 — Desktop foundation
- V9 navigation/layout and Dark/Light work.
- Secure IPC; renderer cannot execute shell commands.
- DB migration, backup and restore tested.
- Structured logs redact secrets.

### G2 — Device control
- At least two physical Android devices can connect simultaneously.
- Commands are always serial-scoped.
- Per-device command queue prevents input races.
- USB disconnect/reconnect and ADB server restart recover safely.
- Wrong-device command test passes (must never control another phone).

### G3 — Screen wall
- Stream process is video-only.
- Ctrl+wheel zooms tile dimensions; normal wheel semantics match V9.
- Single/all/selected modes work.
- Stream backpressure and overload behavior are measured.
- Device record count is not hard-capped; active stream count is resource-bounded.

### G4 — UI recognition
- Labeled screenshots and UI trees cover supported app versions/locales.
- UI Automator selector success rate meets agreed target.
- OCR precision/recall and latency meet benchmark.
- Unknown state/low confidence blocks action.
- Python worker crash cannot issue or corrupt device commands.

### G5 — Identity and account
- Device identity, account identity and target identity are separate.
- A job is blocked when identity confidence is insufficient.
- No credentials, OTPs or raw cookies are stored.
- Account lease prevents simultaneous publish jobs across phones.

### G6 — Media/content
- Recursive folder scan, hash dedupe and file-stability checks pass.
- Excel import preview and row error reporting pass.
- Media is matched by relative path/hash, not row order or basename alone.
- Caption, hashtag and 0–10 comment fields round-trip correctly.

### G7 — Scheduler
- Every-N-days, weekdays and one-time schedules pass tests.
- IANA timezone and DST gap/overlap tests pass.
- 30-minute minimum gap is enforced.
- Collision policy is deterministic.
- Device and account leases prevent conflicting jobs.
- Schedule edits are audited and reversible.

### G8 — Workflow runtime
- Every external action has a durable intent record.
- Success requires verification evidence.
- Unknown external effect is not blindly retried.
- Retry only known-safe actions.
- Crash/restart recovery does not duplicate a post.
- Workflow version/profile certification is enforced.

### G9 — Platform workflow
- Exact account, target, app package/version and locale verified.
- Policy gate is passed for each action.
- Each enabled flow passes positive and negative cases.
- No unsupported flow can be started.
- Volume/throughput is limited to tested operating envelope.

### G10 — Release
- Installer, upgrade, backup/restore, rollback and uninstall tested.
- Security review passed.
- Hardware/support matrix published.
- Logs and support bundle contain no secrets.

## 2. Device test matrix

Initial matrix proposal (must be replaced with actual user-owned devices):
- Android 11, 12, 13, 14, 15 and 16 where available.
- At least two manufacturers (Google/AOSP-like and one heavily customized OEM).
- Low/mid/high screen resolutions and density buckets.
- English and Vietnamese locale.
- USB connection, Wireless Debugging pairing and Wi-Fi reconnect.
- Battery saver, screen lock, rotation, low storage, poor USB cable and unstable Wi-Fi.
- Facebook app stable release and one prior supported version.
- App update during a queued job.

Do not claim support for an Android version or OEM until the corresponding test suite passes.

## 3. Required failure-injection tests

1. Disconnect USB while a tap command is queued.
2. Disconnect after a publish button may have been pressed.
3. Restart ADB server while two phones are active.
4. Kill scrcpy while the device actor remains healthy.
5. Kill Python Vision Worker during OCR.
6. Return malformed/empty UI hierarchy.
7. Return low-confidence OCR.
8. Change orientation between screenshot and action.
9. Change logged-in account before a job starts.
10. Switch Page/target unexpectedly.
11. Trigger unexpected dialog/checkpoint/permission prompt.
12. Fill storage during media staging.
13. Modify a media file after scan.
14. Expire proxy or lose device-side route.
15. Crash desktop process after effect intent but before outcome record.
16. Restart after a job reaches UNKNOWN.
17. Re-run schedule generation and ensure no duplicate jobs.
18. Import Excel with duplicate filenames in different folders.
19. Change app version and invalidate UI certification.
20. Change timezone/DST and ensure schedules remain deterministic.

## 4. Risk register

| ID | Risk | Impact | Mitigation / decision |
|---|---|---|---|
| R-001 | Meta policy restricts automated UI access/data collection | Account restriction / product unusable | Written policy gate; disable unsupported actions; no evasion |
| R-002 | Facebook UI changes frequently | Workflow failures | Versioned UI profiles, screenshot fixtures, certification |
| R-003 | Profile/Group flows are not stable or supported | Cannot meet all-auto requirement | Keep disabled until verified and permitted |
| R-004 | ADB commands race across phones | Wrong device action | Exact serial + per-device actor + negative tests |
| R-005 | UI tree missing/inaccessible | Recognition failures | OpenCV/OCR fallback; safe stop on low confidence |
| R-006 | OCR mistakes Vietnamese/English | Wrong action | Labeled benchmark, confidence threshold, semantic selector first |
| R-007 | scrcpy stream overload | UI freezes / high CPU | Adaptive stream profiles and resource budget |
| R-008 | Python runtime/model too large | Slow install / high memory | CPU-first benchmark, lazy model load, package-size gate |
| R-009 | Account identity not provable | Post to wrong Page/Profile | Identity confidence and preflight block |
| R-010 | ADB text input corrupts Unicode | Broken captions/comments | Dedicated Unicode input proof; round-trip test |
| R-011 | Publish timeout after server accepts | Duplicate post | Durable intent + read-back reconciliation; no blind retry |
| R-012 | Account session changes mid-job | Wrong account action | Account lock and foreground identity recheck |
| R-013 | Proxy check only proves host reachability | Device traffic leaks | Device-side egress verification |
| R-014 | APK uninstall removes critical app | Device unusable | System app protection and batch confirmation policy |
| R-015 | Analytics metric unavailable/stale | False growth alerts | Provenance/freshness; unavailable is not zero |
| R-016 | Unlimited phones misunderstood as unlimited streams | Resource exhaustion | Unbounded registry, bounded concurrent streams |
| R-017 | Media basename collisions | Wrong content mapped | Relative path + hash mapping |
| R-018 | Schedule DST/timezone ambiguity | Wrong execution time | IANA timezone and explicit DST tests |
| R-019 | Desktop/ADB/worker crash | Lost or duplicate work | Persistent queue, leases, effect journal, recovery |
| R-020 | User expects fully automatic unsupported flows | Scope conflict | Capability registry and explicit unavailable state |

## 5. Definition of done for a workflow

A workflow is DONE only when:
- It has a versioned definition and supported-profile declaration.
- Preconditions and required permissions/policy state are explicit.
- It passes UI Automator/OCR fixtures.
- It passes physical-device integration tests.
- It writes durable job/step/effect records.
- It verifies the actual resulting state.
- It has failure, timeout, cancellation and recovery tests.
- It is visible as READY only for certified combinations.
