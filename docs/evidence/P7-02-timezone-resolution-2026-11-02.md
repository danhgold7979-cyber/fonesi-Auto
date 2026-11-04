# P7-02 timezone resolution — source evidence, 2026-11-02

Status: draft evidence for parent integration; no task acceptance or percentage adoption. Canonical branch `phase-07`; source entry is [P7-TIMEZONE-SOURCE-ENTRY.md](../phases/P7-TIMEZONE-SOURCE-ENTRY.md), binding draft SHA-256 `0b2d12053869c17aa26368b8d2083d1e684b46068a8a798e1f860e50f797b673`.

## Implemented boundary

Actual Temporal-library composition with the existing civil model resolves supplied IANA civil occurrences: unique instant, earlier overlap once, or gap skip/notification without replacement. Immutable bounded descriptor snapshots, exact runtime metadata admission, explicit alias identity, numeric/local round-trip coherence, and stable civil ordinals are enforced. Node admission is the observed 24.22.1 / V8 13.6.233.17-node.58 / ICU 78.3 / CLDR 48.0 / tz 2026e / Unicode 17.0 tuple; Electron remains unobserved and unadmitted. Runtime metadata is not an ICU byte hash. Temporal uses runtime Intl data, not bundled tzdb; upstream resolver assumptions remain dependency limitations, not a custom inverse algorithm.

No main, IPC, UI, database, queue, job or device activation; no standalone runtime bundle added. Phase acceptance remains **0/13**; this is software evidence, not timezone behavior observed inside Electron or physical acceptance.

## Exact dependency review

Only `@js-temporal/polyfill@0.5.1` and transitive `jsbi@4.3.2` were added. All 78 prior lock entries were compared and preserved; installed dependency verification reports 80. Official registry distributions were acquired with scripts disabled; actual manifests, ESM/CJS runtimes, types and licenses were read before import. Eleven new reviewed-file hashes are retained in `desktop/dependency-review.json`. Temporal is champion-started, not an official TC39 implementation. Actual licenses are ISC and Apache-2.0 respectively. The exact two license files are copied and required by package inventory/admission; no new legal-clearance claim.

- Temporal tar SHA-256: `c99a4da5678a55a33dfd30c977852dfac9bbe7b8bac73999f1858c167be6b3e3`.
- JSBI tar SHA-256: `131d13488f0f400a0770eaca495749cddef34d315f7aeb248fc501f7538b378e`.
- Registry SHA-512 integrity also matched each actual tar (recorded in lock/review).
- Never executed: Temporal `prepare` / `prepublishOnly`, JSBI `prepublish`, or any lifecycle script. No full-icu/devtools dependency.
- Initial default npm cache ENOENT was repaired using an owned `/tmp` cache for the same registry requests. An initial wrong-working-directory `npm ci` EUSAGE was corrected to `desktop`; neither was a policy-denial retry. Private review records remain under `/tmp/auto-p702-dependency-review`.

## Checks and honest failure attribution

- New resolver cases: **14/14 PASS**, including actual library→civil composition, three actual host-TZ subprocesses, gaps/folds, 30-minute and whole-date changes, historical seconds, bounds, hostile inputs and refusal seams.
- First 10-case run: 9 PASS / 1 FAIL. Fixture expected HCM 1970 +7; corrected to +8 using independent IANA 2026e `asia` lines 3982–3991. Monrovia historical seconds independently match `africa` lines 415–418. Primary sources: https://data.iana.org/time-zones/tzdb-2026e/asia and https://data.iana.org/time-zones/tzdb-2026e/africa . These are source-derived expectations, not device captures.
- Initial affected run: 94 cases, 92 PASS / 2 integration-fixture failures (old dependency-count literal and unnecessary standalone output). Removed that output and corrected the measured count; two targeted graph/closure cases PASS. Four subsequently authored resolver cases make **98 distinct stitched affected cases**, not a sum of overlapping runs.
- Exact missing-license refusal case PASS. Reviewer-requested Windows-portable subprocess `fileURLToPath` correction: one affected case PASS; import URLs remain `href`.
- Strict TypeScript PASS; graph 125 PASS; map 65,442 bytes under unchanged 65,536-byte cap. Quality checked 428 files, 491 informational diagnostics, no warnings/errors. Initial wrong quality CLI argument failed, then corrected invocation passed.
- **One normal integrated run**: graph, quality, typecheck, build, demo type/build and manifest passed; batches 1–13 passed. Batch 14 stopped at **71 / 68 PASS / 3 FAIL** (ordinals 50–52). Detailed retained-pair-control rerun showed the shared package fixture's new raw `import.meta.url` spelling incompatible with its VM extraction.
- Narrow fixture correction uses existing `fileURLToPath(import.meta.url)` transformation and still reads actual reviewed license bytes. Exact failed three cases then **3/3 PASS**.
- Untouched remaining batches 15–23: **564/564 PASS**, respectively 69, 65, 73, 91, 68, 49, 58, 65, 26.
- No second full aggregate and no claim of an uninterrupted aggregate PASS. Successful-prefix counts were not printed by the runner; no invented total. All processes terminal.

## Frozen authored paths

SHA-256 values rechecked against actual files before this evidence draft. Parent-owned adoption/ledger files are outside this 17-file source freeze.

| Path | SHA-256 |
|---|---|
| `desktop/dependency-review.json` | `7f69c3546a3db04efc0ca3dce963169426020ca6ec0d48bff6e426961099867a` |
| `desktop/launch/package-admission.cjs` | `69fecf78fbc69c52019ef15dd14563728c79fb2b2d0cbc323dcf586894459c35` |
| `desktop/module-map.json` | `af7f9312cbf2df082d4fa58075857c237ea00e1e83f71bd870705bfb10d5aeae` |
| `desktop/package-lock.json` | `8cc7e668b9d0a62848409061c35183140041470770d3ca1a494bf52f213ee321` |
| `desktop/package.json` | `ae56c9909232cd24623a471dd565dcd0c8e72ff765aaeae35820b912b9ac9393` |
| `desktop/scripts/build-manifest.mjs` | `53953b45fedfbef324847d3e868211af903b1f56051edc1e286eb4c993e86705` |
| `desktop/scripts/build-package.mjs` | `695ee978da70e1c4d1bd1b1a290606a7d68ad2202fa33741296054026ca6adf5` |
| `desktop/scripts/check-module-graph.mjs` | `d0392fb5961ce4bf9e495c3fd19a1a7f3b6ca0e4bac3b53ab1605652900b64b1` |
| `desktop/scripts/package-manifest.mjs` | `f9e3a6d160df655e0ebc9ffa7f927e5834124a20939b830da01bc271981c620f` |
| `desktop/scripts/quality-tool.mjs` | `8709bc1427ecffc80b0b51d18f0a37902421fcd8484df26528e06aa47ba6b042` |
| `desktop/scripts/test-batches.mjs` | `bc0c1533ea5ebdb039ee466344bb4266d918a3a99b77c2ed740abf373fa1dd8a` |
| `desktop/tests/module-graph.test.mjs` | `e2d3e33b0f80876ba2e2b3b4337bef71be4916b5dd683179805e68718633adb5` |
| `desktop/tests/package-build.test.mjs` | `c03a19a7ac1d561ecfdd69a868eb3fc78346cabab9454a5f0b802d7000507f3a` |
| `desktop/tests/quality-tool.test.mjs` | `6cf493c74ccb93d38107de51fabda7b000fab097e0743eab16a0d9a1379f182a` |
| `desktop/tests/schedule-civil-contract.test.mjs` | `89354123610e09833ee13751962911e8f6be1fd58f4de65539bb3b503c94ea3e` |
| `desktop/src/schedule-zone-contract.ts` | `a0222f16e0a7045e0a9196de0248957228036ab1dafa79b834b07c02841dfd6e` |
| `desktop/tests/schedule-zone-contract.test.mjs` | `9a476d21a4ccf272fd25c03a663d621b22d5f3d230a5fc7effbe4f0902e17bbe` |

## Retained local logs / evidence hashes

These are local evidence paths, not claims that logs have been published.

| Path | SHA-256 |
|---|---|
| `/tmp/auto-p702-affected.log` | `61cf253f94b1c53852464d1331406aab5651be3b2206fe1977c76da0d070afda` |
| `/tmp/auto-p702-control-failure-detail.log` | `915862383928bf00dff749ce6a052dac3a3b646862a66ae66a0865c2c47f4767` |
| `/tmp/auto-p702-first-tests.log` | `ededb62e929926cc801ae112da4557f7844835e34576c1127bd6b35dfa644d81` |
| `/tmp/auto-p702-format.log` | `96227111c47c3fb705da61a80022b76c69e82fda1f6488adc2dd4ec6be287089` |
| `/tmp/auto-p702-format2.log` | `daf1e7e509b376864158af305c147a0260580314e990787fd56df8cc2baab0fb` |
| `/tmp/auto-p702-format3.log` | `93834b66c1db61f01f131cba9ebdc31b5ce0270c74c54bb1c4284d61487854a0` |
| `/tmp/auto-p702-graph-correction.log` | `fc1923495476a54bd7c3fb652e9f58539681381686f96d358e5dd2e0baf1ffca` |
| `/tmp/auto-p702-integrated-source-check.log` | `53c5a140664ded6d491903ac3843e5983ebb3453175ea479e9d0d2ed756968a9` |
| `/tmp/auto-p702-notice-refusal.log` | `d07ff4e979f418ad74f69915480a1e6b7296623cf93d0ba16208c8c7a55a99b1` |
| `/tmp/auto-p702-portable-format.log` | `a3c559e980d3eca818bcc93d4caacfc777ca09b01691cbbb6fcaa81ffa6ea7aa` |
| `/tmp/auto-p702-portable-subprocess.log` | `37ecbf589f83394bfd4b907a7d0cfa0a944b74679a8a3703bdee3a12da834e12` |
| `/tmp/auto-p702-quality-corrected.log` | `5617bd53a200091e91d2bddacb5cb6379ef61f9e5cc537d5cc0efa8786dc01cf` |
| `/tmp/auto-p702-quality-final.log` | `474dde30ac2a5e118a28185c44bb48fc2dca131c1f2ded8f61854aa2391ab0bc` |
| `/tmp/auto-p702-remaining-batches.log` | `fa77349dddadbfdd72cc36ad155007d24ac18d2392e35785b12fdf464ebf36eb` |
| `/tmp/auto-p702-tsc-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/auto-p702-tsc.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/auto-p702-vm-fixture-correction.log` | `79cc53f56fdba01b7cbeb37fbc7ddc7c472e4260fca13fab9086e3c67dcbaa07` |
| `/tmp/auto-p702-vm-fixture-format.log` | `6a55b3380e0fed7dcaf28ae4d71347a8a7a960c308b072baefd4a1c89be32dfc` |
| `/tmp/auto-p702-zone-final.log` | `f1b347a06a786e11c163219c68f75d1f195423f92720ceb5de22bd627d7e852d` |
| `/tmp/auto-p702-source-freeze-final.json` | `5cf78a44d0b27391bc6a161bbf2766093142d2520030c72db5c7bcd1c5b6c0b3` |
| `/tmp/auto-p702-dependency-review/initial-cache-failure.json` | `63668dde9e1716753ccb28ffd0ccc490079888df80ea2287e56d3f263d592f14` |
| `/tmp/auto-p702-dependency-review/initial-restore-cwd.log` | `c3e0959cb684bf19e16fb3ee0090a54e448ff66877333e99331957f125ec41bc` |
| `/tmp/auto-p702-dependency-review/review-summary.json` | `fa4d28217de05096945dabda94a1978065de69afdd489015f984844c35a4c55f` |

## Fixed-ledger disposition

Independent final source/dependency/stitched-integration review is CLEAR. Exactly P7-02.A/B move N→I: N42/S0/I5 of47, source10.6% and integrated10.6%, each +2/47 (+4.26 percentage points) against the preserved6.4% baseline. No P7-02.C/D or P7-12 credit; persistence/generation/packaged restart remain absent. Acceptance remains0/13.
