# Technology and Policy References

**Revision:** 0.2-review · **Inventory updated:** 2026-10-30

These are source pointers retained from the planning baseline, not proof that every linked page or version claim was independently revalidated during this documentation edit. Verify exact current versions, licenses and policy text at the corresponding feasibility gate and record retrieval date/evidence.

These references support the proposed technology direction and identify constraints. They do not replace compatibility tests or a formal platform-policy review.

## 1. Android Debug Bridge

- Android Developers — Android Debug Bridge (ADB): https://developer.android.com/tools/adb
- Use ADB for transport discovery, device-specific shell commands, screenshots, package inventory, input primitives and file transfer.
- USB debugging requires the user to enable Developer Options/USB debugging and authorize the host RSA key. Wireless Debugging uses pairing and authenticated transport.
- Keep exact device serial/transport scope on every command. Do not use unscoped ADB shell when multiple devices are connected.

## 2. UI Automator

- Android Developers — Write automated tests with UI Automator: https://developer.android.com/training/testing/other-components/ui-automator
- Android Developers — UI Automator legacy API: https://developer.android.com/training/testing/other-components/ui-automator-legacy
- UI Automator is a cross-app UI testing/automation framework, not simply a remote ADB command. Its instrumentation runner and deployment requirements must be evaluated.
- The earlier planning baseline described a UI Automator 2.4 candidate as alpha. Revalidate its current release status in the official source; do not treat the historical label as a current version determination or pin an untested build.

## 3. scrcpy (supporting screen stream)

- Official repository: https://github.com/Genymobile/scrcpy
- Official README: https://github.com/Genymobile/scrcpy/blob/master/README.md
- Official FAQ: https://github.com/Genymobile/scrcpy/blob/master/FAQ.md
- scrcpy mirrors Android devices over USB or TCP/IP and supports Windows, keyboard and mouse control. For Fonesi-Auto, use it as a video-only screen-wall stream initially; keep all input in the serialized Device Host to avoid competing control paths.
- Download only from the official Genymobile repository and verify release signatures/checksums as documented there.
- Review Apache-2.0 license and notices before bundling.

## 4. OpenCV

- OpenCV-Python tutorials: https://docs.opencv.org/4.x/d6/d00/tutorial_py_root.html
- Image processing tutorials: https://docs.opencv.org/4.x/d2/d96/tutorial_py_table_of_contents_imgproc.html
- Candidate operations: resizing, color conversion, thresholding, morphology, contours, template matching and ROI extraction.
- Use OpenCV for image preprocessing and visual fallback, not as the sole authority for a UI action.

## 5. PaddleOCR

- PaddleOCR documentation: https://www.paddleocr.ai/
- OCR usage and supported languages: https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
- Check the exact candidate model's Vietnamese/English support in its current model documentation and benchmark it on authorized, sanitized target-app fixtures before choosing it.
- Record model version, language, confidence, bounding boxes and elapsed time for every OCR result.
- Check PaddlePaddle/PaddleOCR runtime compatibility, wheel availability, model license and packaged runtime size before selection.

## 6. Python

- Python documentation: https://docs.python.org/3/
- Python is an isolated vision worker only. It receives image input and returns structured recognition results.
- It does not own ADB connections, device input or workflow state.
- Use a version-pinned runtime and locked dependencies. The production bundle must be reproducible and include license notices.

## 7. Meta / Facebook policy risk

- Meta Newsroom — How We Combat Scraping: https://about.fb.com/news/2021/04/how-we-combat-scraping/
- Meta Newsroom — Cracking Down on Spammy Content on Facebook (2025): https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/
- Meta Newsroom — How We Respond to Inauthentic Behavior: https://about.fb.com/news/2019/10/inauthentic-behavior-policy-update/
- Meta Automated Data Collection Terms: https://www.facebook.com/legal/automated_data_collection_terms
- Meta's public statements say automated access/collection without permission violates terms and describe enforcement against spammy content and fake engagement.
- ADB control of a logged-in mobile app does not by itself grant permission to automate data collection or engagement.
- Before enabling Facebook workflows, obtain an appropriate policy/legal determination. Do not build bypasses for CAPTCHA, checkpoints, rate limits or anti-abuse controls.
- Coordinated fake engagement, repetitive spam comments, bulk reactions or artificial amplification are excluded from the product scope.

## 8. Reference freshness

- Re-check Android/ADB, UI Automator, scrcpy and PaddleOCR versions at Phase 0.
- Re-check Meta terms and platform rules immediately before enabling each Facebook workflow.
- Every implementation decision records the checked version/date and evidence.

## Change history
- 2026-10-30: Distinguished historical source inventory from current compatibility/policy validation; no new dependency version approved.

## Dated P0-08 verification — 2026-10-30

[Review and source register](evidence/P0-08-policy-review-2026-10-30.md) records
three official newsroom pages actually read, with displayed publication dates,
and three current policy/terms URLs whose content was unavailable behind
login/temporary-block or HTTP 429 responses. Unavailable text is not verified;
no login/bypass was attempted. The disabled-only capability snapshot grants no
platform permission and does not close the policy gate.
