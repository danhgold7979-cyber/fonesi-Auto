# P0-08 — Dated policy/capability review, disabled-only checkpoint

Session started 2026-10-30 17:20:13 UTC. Repository/origin verified as
`danhgold7979-cyber/fonesi-Auto`; branch `phase/00-feasibility`, local base
`f7b2e2a` (published P0-04 increment). Authority: DEC-022, playbook §6 P0-08
continuation. Scope: public primary-source research and offline artifact tests.
No login, device access, account inventory, platform action or permission request
was performed. Existing unrelated Python caches were left untouched.

**Outcome: all 18 capability review entries remain disabled.** There is no
ALLOWED action. The machine-readable canonical review snapshot is
[P0-08-capability-matrix.json](P0-08-capability-matrix.json). This Markdown explains
its rationale; neither file is an operational permission registry. This is an
engineering risk review, not a legal opinion or final platform authorization.

## 1. Source register — checked 2026-10-30, 17:20 UTC

| ID | Official source / displayed date | Retrieval and supported finding |
|---|---|---|
| S1 | [Meta: How We Combat Scraping](https://about.fb.com/news/2021/04/how-we-combat-scraping/), April 15, 2021 | READ. Describes automated collection from websites/apps and says automated Facebook data collection without prior permission violates its terms. Historical official explanation, not the current complete terms or authorization for this project. |
| S2 | [Meta: Cracking Down on Spammy Content on Facebook](https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/), displayed April 24, 2025 and October 22, 2025 | READ. Describes distribution/monetization consequences for spam and enforcement against coordinated fake engagement/impersonation. Does not grant an ADB posting/commenting exemption or a safe numeric volume. |
| S3 | [Meta: Inauthentic Behavior Policy Update](https://about.fb.com/news/2019/10/inauthentic-behavior-policy-update/), displayed October 21, 2019 and March 24, 2021 | READ. Historical enforcement context for deceptive amplification, fake engagement and evasion. Does not establish present per-action permission or equate ordinary authorized Page management with an inauthentic campaign. |
| S4 | [Facebook Terms](https://www.facebook.com/terms.php), effective date UNKNOWN | UNAVAILABLE: redirect to login / temporary-block page, not terms text. Current contractual clauses were **not verified**. No authentication or route workaround attempted. |
| S5 | [Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms), effective date UNKNOWN | UNAVAILABLE: redirect to login / temporary-block page, not terms text. No claim to have read current agreement or obtained permission. |
| S6 | [Meta Community Standard: Spam](https://transparency.meta.com/policies/community-standards/spam/), effective date UNKNOWN | UNAVAILABLE: HTTP 429. No repeated requests, alternate-route bypass or inferred policy text. |

Retrieval dates are not publication/effective dates. Official historical newsroom
statements are relevant risk evidence, but cannot replace inaccessible current
terms, an appropriate per-action determination or actual authorization. No
secondary search snippets are substituted for unavailable policy text.

**Project inference (not a quoted Meta ruling):** Page ownership, a logged-in
session, manual UI availability, ADB transport and successful local tests do not
by themselves establish permission to automate posting, collection or engagement.
Read-back/metrics deserve their own collection review; a permitted publish does
not automatically permit harvesting comments, profile lists or metrics. No API
substitution is proposed: the approved product's ADB direction remains unchanged.

## 2. Capability dispositions

These are current **project review** dispositions, not statements that Meta has
issued a prohibition or permission for a particular user's account. C-01/C-02
settle product scope; unprovided policy/target/test evidence remains separate.
All rows have `enabled=false`, `technical_state=UNVERIFIED`.

| Capability | Disposition | Current reason / additional condition |
|---|---|---|
| FB-PAGE-PHOTO | NEEDS_REVIEW | Owned/administered candidate only; action permission, exact target and physical proof missing |
| FB-PAGE-ALBUM | NEEDS_REVIEW | Same gates; ordered asset count/read-back separately required (C-20) |
| FB-PAGE-VIDEO | NEEDS_REVIEW | Same gates; video-specific composer/outcome certification missing |
| FB-PAGE-REELS | NEEDS_REVIEW | Separate Reel flow, not inherited feed-video certification |
| FB-PAGE-STORY | DEFERRED | Separately certified under C-02; no pilot enablement |
| FB-PROFILE-PHOTO | DEFERRED | Outside initial Page pilot |
| FB-PROFILE-VIDEO | DEFERRED | Outside initial Page pilot |
| FB-PROFILE-REELS | DEFERRED | Outside initial Page pilot |
| FB-GROUP-PHOTO | DEFERRED | Outside initial Page pilot; no group discovery/scraping permission |
| FB-GROUP-VIDEO | DEFERRED | Outside initial Page pilot; no group discovery/scraping permission |
| FB-COMMENT-OWN-CONTENT | NEEDS_REVIEW | Relevant non-spam comments only; explicit permitted scope and separate effect verification |
| FB-COMMENT-ARBITRARY | BLOCKED | No authorization for arbitrary third-party interaction; excluded from this snapshot |
| FB-REACTION | DEFERRED | C-02 keeps reactions off; no bulk engagement enablement |
| FB-SHARE | DEFERRED | C-02 keeps shares off |
| FB-READBACK | NEEDS_REVIEW | Exact authorized post/account/target and permitted collection method missing |
| FB-METRICS | NEEDS_REVIEW | Permitted source, subject, fields, collection/retention scope missing; unavailable is not zero |
| OTHER-NETWORKS | DEFERRED | C-01 explicitly unsupported initial scope |
| BULK-FAKE-ENGAGEMENT | BLOCKED | Excluded product behavior; no evasion or artificial amplification implementation |

Counts: 7 NEEDS_REVIEW, 9 DEFERRED, 2 BLOCKED, **0 ALLOWED / 0 enabled**.
The extra read-back/metrics rows make implicit collection dependencies explicit;
they do not expand the product. New capabilities cannot inherit a default allow.

## 3. Required closure package — not yet supplied

For each candidate action, the owner and competent policy reviewer need to
establish the applicable current terms and an evidence-backed action-specific
permission determination, including any platform permission required. Retain
private evidence under approved access/retention; public Git gets sanitized
references only, never raw account IDs, personal data, credentials or screenshots.

The review must bind the exact authorized account/Page role and target; content
ownership, audience, purpose, bounded volume and stop conditions; automated
UI-access/read-back/collection method; permitted fields and retention; and who
reviewed which source versions when. A URL alone is not permission. Scope or
source changes require re-review; do not invent an expiry interval or numeric
safe posting rate. The user already chose the Page-only pilot—do not re-ask that
settled preference as a blocker.

Technical engineering must separately provide physical app/device/version/locale
certification, exact identity/target validation, Unicode/media/read-back proof,
durable effect/reconciliation and negative tests. Login expiry, challenge,
checkpoint, rate limit, identity drift, policy withdrawal or UNKNOWN outcome
must stop/report; never bypass or blindly retry. Passing offline artifacts does
not prove any of these. Only the appropriate later approved Phase can implement
an operational capability registry; this linter has no promotion/enable pathway.

## 4. Offline implementation and verification

`tools/phase-00/capability_review_lint.py` validates only the supplied disabled
review JSON. It rejects missing/duplicate/unknown coverage, ALLOWED/READY or
truthy enablement, omitted evidence gates, privilege-bearing extra fields,
malformed/duplicate JSON keys and unknown source references. Fixed result codes
do not echo private values. The 64 KiB byte bound is an offline defensive limit,
not a production policy schema or platform capacity. Source references are
cross-references to §1, **not cryptographic or substantive permission proof**.
The linter accepts reviewer prose structurally; it does not certify that prose.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/phase-00 -p 'test_*.py' -v
```

Run 2026-10-30 17:22:07 UTC on Linux/Python 3.12.14: **41/41 PASS**, 0.041s,
exit 0 = 13 P0-08 artifact tests plus 28 unchanged P0-04 tests. The enablement
negative test also checks each of 18 entries against five non-false values.
No Windows/device/policy-permission tests ran. Timing is observed, not a budget.

Full P0-08 remains **IN_PROGRESS / BLOCKED for final permission acceptance**.
Phase 0 remains unaccepted, Phase 1 NOT_STARTED, Phase 9 blocked. This increment
may be reviewed/published separately without accepting any phase. No commit,
push or merge was performed by this task. Rollback reverts only this offline
review/linter delta, not approved plans, collector, prior evidence or user files.

## 5. CI coverage repair and checkpoint freeze — 2026-10-30 17:39 UTC

Work resumed after an interruption at 17:38:18 UTC; existing changes were
preserved and rechecked. Wall elapsed from session start to this checkpoint is
18m47s, including interruption, not uninterrupted coding time.

The jobs API for [run 41097867227](https://github.com/danhgold7979-cyber/fonesi-Auto/actions/runs/41097867227)
reported exactly one successful job: `Synthetic collector checks / Windows
PowerShell 5.1`. That run did **not** execute the Python selector or review tests.
The earlier collector success must not be reported as new Python CI evidence.

The workflow now adds a separate `offline-python` matrix for `ubuntu-24.04` and
`windows-2022`, with Python 3.12 patch/runtime/Expat logged at execution. This is
a CI test runtime line, not a production Python pin. Existing pinned checkout is
retained; [official setup-python v6.2.0](https://github.com/actions/setup-python/releases/tag/v6.2.0)
was verified at [commit a309ff8b426b58ec0e2a45f0f869d46889d02405](https://github.com/actions/setup-python/commit/a309ff8b426b58ec0e2a45f0f869d46889d02405)
and pinned by full SHA. No third-party Python package installation or new artifact
upload is configured. Triggers include the review JSON; permissions stay read-only
and checkout does not persist credentials. The existing collector job body is
unchanged (programmatically compared against HEAD).

Final local rerun 17:38:54 UTC: **41/41 PASS**, 0.049s; Python AST/compile **2/2
PASS**; workflow YAML parse and two-OS matrix check **PASS**; existing collector
job comparison **PASS**; `git diff --check` **PASS**. New hosted CI jobs remain
**NOT_RUN until publication/execution**. Target host/physical/policy-permission
acceptance remains blocked. Independent review requested; publication stays with
the coordinating owner task. No new feature scope starts before integration.

| Artifact | SHA-256 |
|---|---|
| `tools/phase-00/capability_review_lint.py` | `9567e44bb5a31e37ce3d0e4f3b1eb142163fcf394c065bcd07b16ebcb8feb786` |
| `tests/phase-00/test_capability_review_lint.py` | `b87772b7bf5e37107e7cd68c6e6d1052bc52666a84e7b69610387dbe48d7f192` |
| `docs/evidence/P0-08-capability-matrix.json` | `1a1082227a48a0ba6a90b42252e70af1b3c2f5c7b31b9c77fb904c135a02db9c` |


Independent-review correction, 17:40:28 UTC: the original checked-in-artifact
test normalized JSON before validation, which could hide duplicate keys in an
edited artifact. The validator already rejected duplicate raw keys; the CI
caller now validates `MATRIX.read_bytes()` directly before mutation fixtures.
A new regression demonstrates the masking risk. Final combined result is
**42/42 PASS** (14 review-artifact methods + 28 selector methods), 0.050s, exit 0.
Earlier 41-test runs above remain historical results, not rewritten passes.
The updated test hash is recorded in the artifact table. No capability was enabled.

Independent reviewer `review_auto_collector_safety` confirmed closure at
17:40:58 UTC: raw artifact assertion and duplicate-normalization regression
present; **42/42 PASS**, 0.046s; diff check, YAML/two-OS matrix and unchanged
collector-job comparison PASS. No remaining blocker identified for this bounded
disabled-only artifact/CI increment. Hosted CI remains NOT_RUN pending coordinated
publication; existing caches must stay uncommitted. No reviewer edits/publication.
