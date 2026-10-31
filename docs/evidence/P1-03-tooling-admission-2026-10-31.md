# P1-03 linter/formatter admission and verification

Entry approved by coordinator 2026-10-31 04:39 UTC under delegated Auto authority;
recorded in playbook/status before implementation. Phase-01 only; no main merge.
Exact candidate **@biomejs/biome 2.6.4**, retaining TypeScript 7.0.2 semantic checking.
Official metadata: [wrapper](https://registry.npmjs.org/@biomejs%2fbiome/2.6.4),
[Linux glibc x64](https://registry.npmjs.org/@biomejs%2fcli-linux-x64/2.6.4),
[Windows x64](https://registry.npmjs.org/@biomejs%2fcli-win32-x64/2.6.4).

Independent source research inspected wrapper/two platform tarballs in memory,
verified SHA512 integrity and native SHA256, and found no lifecycle hooks/ordinary
dependencies. License is exactly MIT OR Apache-2.0; ten optional native packages
are pinned 2.6.4. Full public metadata/integrity/signature/provenance fields are
recorded separately in desktop/biome-review.json before restore. Research decoded
provenance linking upstream commit 56538746c00fcd8e3ef8bad0a9bc59f024dc422d and
release workflow 40779053647; decoding alone is not cryptographic verification.

## Required admission sequence

1. Exact metadata/license/hooks/native hashes and preserved original dependency
   closure reviewed before scripts-disabled lock generation/restore.
2. Use pinned existing npm; npm audit signatures verifies registry signatures and
   provenance when supported, with honest failures/limitations recorded. Separate
   advisory audit, no automatic audit fix/update. No Biome execution before results.
3. Shipped JSON schema validates reviewed config. Direct shell:false native launcher
   selects only Linux glibc x64 or Windows x64, verifies expected hash and rejects
   BIOME_BINARY, NODE_OPTIONS, NODE_PATH and unreviewed config overrides. Never run
   wrapper shell/ldd/PATH lookup, fallback platform, daemon or unreviewed executable.
4. Check-only inventory of active foundation/desktop TS/TSX/MJS/CJS first. Explicit
   formatter-only edits are authorized afterward; no unsafe lint fixes, import
   sorting/assist, historical Phase0/UI/evidence/generated formatting.
5. Good/bad parse/lint/format fixtures, exact nonzero diagnostic checks, idempotent
   formatter proof and full existing suites before independent review/publication.

Official [language support](https://biomejs.dev/introduction/language-support/)
currently promises TypeScript syntax 5.9, not blanket TS7 grammar. Actual active
corpus/representative fixtures must pass; strict tsc7 remains independently required.
Unsupported future syntax blocks this tool choice rather than skipping files.
[Configuration](https://biomejs.dev/reference/configuration/) and
[CLI semantics](https://biomejs.dev/reference/cli/) are implementation references;
shipped 2.6.4 schema is authoritative for accepted configuration keys.

## Execution status

Scripts-disabled restore PASS: 78 reviewed entries; the original 67 entries are
unchanged. npm 11.9.0 audit signatures exited 0 with invalid=[] and missing=[] for
the restored Linux tree, verifying registry signatures and available provenance.
Separate npm advisory audit reported 0 known vulnerabilities; this is not an
exhaustive native/Rust vulnerability assessment. Windows verification is pending.
The installed 2.6.4 JSON schema validated biome.json with 0 errors using existing
Python jsonschema 4.26.0. Native execution/corpus formatting were NOT_RUN at the initial admission
checkpoint; measured local results follow below. Windows adoption remains NOT_RUN.
No new production service/security setting/device/account action. Full canonical
P1-03 local Windows host acceptance remains distinct from hosted tooling evidence;
no silent substitution or accepted-task increment. P1-02 remains TECHNICAL_PASS /
DEPENDENCIES_PENDING, not reopened for new features.

## Local adoption results — 2026-10-31 04:53 UTC

- Shipped schema SHA256: `77b0b52415172200e3a9f1d603b990b5289e645777c7e5201c605ecf039d0893`.
  Python jsonschema 4.26.0 validated the exact root configuration: 0 errors.
- First check-only inventory: 34 active files, 35 errors, 4 warnings, 11 infos;
  no fixes. Initial capture exceeded 64 KiB and failed closed; display limit was
  reduced to three diagnostics, not an increased capture bound or ignored error.
- Explicit formatter-only pass formatted 33/34 initial files. Subsequent tooling
  test addition brings the corpus to 35 files. No assist/import sorting/unsafe
  fixes; two diagnostic buttons gained explicit type=button to resolve actual
  recommended accessibility lint errors (no form or product behavior added).
- Exactly two security source-text assertions were made whitespace/trailing-comma
  tolerant while retaining identical constructor tokens/quit guard and execution
  checks. An esbuild minified-transform comparison found 28 existing changed files
  byte-identical in compiled output; the four intentional differences were the
  checker, dependency verifier, button attributes and those test expressions.
  This comparison is corroboration, not a formal semantic-equivalence proof.
- Check-only corpus: exit 0, 0 errors, 4 warnings and 9 infos (non-null assertion
  and style advice), no fixes. They are not suppressed or claimed absent.
- Foundation five-stage suite: 85/85 PASS. Python raw-schema suite: 43/43 PASS.
  Desktop strict compiler/build and integrated tooling suite: 61/61 PASS
  (52 existing + 9 native quality/boundary fixtures). Full reviewer rerun and
  Windows adoption remain pending.
- Native fixture processes use 30-second termination and 64 KiB output caps;
  input/source 1 MiB, active inventory 512 entries/depth 12. Limits are validation
  bounds, not a hostile concurrent-editor or native-process peak-memory sandbox.
  Owned temporary fixture files are removed nonrecursively after each process.

Fresh Windows restore must repeat signature/provenance and advisory verification
before the native quality gate. No prior Linux result is substituted for that step.
Official [npm audit signatures semantics](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
verify signatures and available provenance; registry advisory results are time-bound.

## Approved Windows development method — 2026-10-31 04:55 UTC

Coordinator approved the named isolated windows-2022 runner as the development
verification machine, explicitly clarifying the draft's local-machine method.
Fresh checkout, actual image/head/Node/npm and all positive/negative fixture suites
remain required. This is not user-PC/Windows 10/C-07/support acceptance or P1-10
completion. Foundation's previously Linux-only npm 11.9.0 gate will explicitly add
observed runner npm 11.19.1 with rejection tests, never a fake version argument.
Windows execution is still pending this checkpoint's publication.

### Windows foundation preparation

The approved method now has an explicit workflow step reporting image/head/Node and
actual npm version, validating metadata before scripts-disabled foundation restore,
then running the complete foundation suite. Engines allow exactly 11.9.0/11.19.1;
packageManager retains the Linux default. Only root package engine metadata changes
in the foundation lock/review; all 23 dependency entries remain identical. One
positive/adjacent-version rejection regression raises that suite to 86 cases.
Foundation text checkout is explicitly LF so its existing hygiene rules are tested
rather than silently bypassed on Windows. Actual Windows outcomes remain NOT_RUN.

### Strict warning gate correction and final local result — 2026-10-31 04:58 UTC

Coordinator caught that the initial check omitted the approved warning-fail flag;
that 61-test milestone was not final quality-gate proof. Check/lint now explicitly
use `--error-on-warnings`, with a warning-only named/nonzero regression. Four actual
warnings were fixed manually: verify the regex capture exists before JSON.parse;
verify the bridge exists before constructing a window; use an arrow for the probe's
observer that does not use dynamic this; and initialize the orderly-close observed
Boolean to false before the existing undefined guard. No automatic/unsafe fix,
nullable-success substitution or warning suppression was used.

Final local strict quality: 35 files, exit 0, **0 errors, 0 warnings, 9 infos**.
Desktop strict compiler/build + **62/62** tests PASS; foundation **86/86** PASS;
Python **43/43** PASS. The earlier 85/60/61 counts above are dated intermediate
runs. Independent final review is pending; Windows remains NOT_RUN for this head.

### Sole-config closure — 2026-10-31 05:00 UTC

Coordinator approved rejecting any biome.json/jsonc in active source ancestors and
subdirectories, plus an alternative root biome.jsonc. Before every native call the
bounded inventory rejects these entries by lstat without interpreting their content;
only exact hash-bound root biome.json is accepted. No historical/node_modules tree
is scanned. One owned negative fixture tests both extensions and pre-execution
rejection. This removes reliance on undocumented nested-config suppression by
--config-path and is not a concurrent hostile-filesystem guarantee.

Final local desktop suite now **63/63 PASS** (52 original + 11 quality fixtures).
Foundation 86/86 and Python 43/43 retain their last passing runs. Independent final
review/Windows adoption remain pending; original Phase 0 baseline is unchanged.

## Independent final review — 2026-10-31 05:01 UTC

Read-only safety review CLEAR for publication/Windows verification. Independent
current desktop strict build/test run **63/63 PASS**, with the preceding unchanged
foundation **86/86** and Python **43/43** runs PASS. Exact native/config/schema
bindings, warning-fail and sole-config guards, empty owned fixture directories,
old dependency preservation and original Phase 0 baseline were checked. Reviewer
performed no restore or Electron runtime. Launcher SHA256:
`4b2aba798a684ba918f8329f5cf5487785100d6cb45f1e679de1d9817e0fd575`;
workflow SHA256:
`c7496f86c0cfc88539fab636d55c6fcb05945497538d6e84ef1e49a26c536010`.
Earlier pending-review statements are dated intermediate milestones. Actual Windows
adoption remains NOT_RUN until the published exact-head workflow completes.

### Windows checkout-byte regression — 2026-10-31 05:02 UTC

Existing explicit LF attributes cover root biome.json and active foundation text.
The actual checkout-index regression now forces core.autocrlf=true/core.eol=crlf
and additionally verifies the root config against its reviewed SHA256 plus seven
foundation source/script/manifest/lock/review/compiler-config/README byte hashes.
All remain LF and byte-identical; no normalization or expected-hash replacement.
The existing test was extended (suite remains 43/43 PASS), not a fabricated new test.
Independent follow-up review CLEAR: Python43/43 and diff check PASS; test SHA256
`2fcd815683d2c0876aa2066d4a6c907fddbb3713035dd207e8c9fe7026fd20da`.
