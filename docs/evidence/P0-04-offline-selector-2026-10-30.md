# P0-04 — Offline selector-analysis checkpoint

- Session: 2026-10-30 17:08:41–17:13:30 UTC (4m49s to this checkpoint).
- Repository: `danhgold7979-cyber/fonesi-Auto`; verified HTTPS origin.
- Branch/base: `phase/00-feasibility` at `c2f4034def885bdd7f952861ba9f41aa6a0bdcfd`.
- Source state: local uncommitted delta, no commit/push/merge performed. Local
  tracking ref for the Phase branch is absent; this session makes no independent
  remote-head verification claim. Publication remains coordinated separately.
- Authority: DEC-022 and playbook §6, recorded before implementation.
- Owner/self-reviewer: assigned Auto engineering task. Independent reviewer `review_auto_collector_safety` found the declaration mismatch below and confirmed its fix at 17:17:28 UTC: 28/28 rerun PASS (0.015s), diff check PASS, no remaining blocker for this isolated offline spike.
- Environment actually run: Linux, Python 3.12.14, Expat 2.8.3. No installation.

## Working increment and evidence

`tools/phase-00/ui_hierarchy_probe.py` parses bounded synthetic UTF-8 hierarchy
input and returns exact-match selector analysis. It has no filesystem, network,
process, ADB, device-input or publication interface. No real account or private
hierarchy was consumed. Results carry fixed states and aggregate counts only.

Source SHA-256:

| File | SHA-256 |
|---|---|
| `tools/phase-00/ui_hierarchy_probe.py` | `d9d01f76f803dfd72761a9cc3e5c60ff858d6939a3b17131a1347c9521af1401` |
| `tests/phase-00/test_ui_hierarchy_probe.py` | `c1b6d273340df0b9faeb2a369e607680d6a3b8cacd781f13029574b427f335b3` |

Exact behavioral command:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/phase-00 -p 'test_ui_hierarchy_probe.py' -v
```

Observed initial checkpoint run at 17:12:31 UTC: `Ran 25 tests in 0.015s`, `OK`, exit 0.
Initial implementation: 21/21 PASS; self-review added oversized numeric bounds,
non-ASCII coordinate digits, processing-instruction and BOM/XML-escape cases.
Independent review then found UTF-8 bytes with an alternate/unknown encoding
or XML version declaration could pass because the Unicode parser ignored the
declaration. Follow-up started 17:15:54 UTC. The regression-first run at 17:16:24
UTC ran 28 test methods and reported 7 failing subcases across 2 methods (exit 1),
reproducing the defect. The fix explicitly validates the declaration before parsing.
At 17:16:37 UTC the same command returned `Ran 28 tests in 0.013s`, `OK`, exit 0:
**28/28 PASS**. Valid absent declarations, XML 1.0, UTF-8 case/quote/whitespace
variants and optional standalone remain covered. Unknown/alternate encodings,
duplicate fields and non-1.0 versions reject. No failing run is hidden.
Timings are runner observations, not performance budgets.

| Verification | Result | Coverage / limitation |
|---|---|---|
| Offline synthetic unit suite | PASS 28/28 | Exact ID/text/description/class/package conjunction, Unicode, duplicate ambiguity, no fallback, wrong-device/generation/display/rotation, age boundary/stale/future capture, invalid metadata/selectors, malformed/oversized/deep/unsafe XML, password/disabled state, bounds, privacy-safe output |
| Python AST parse + in-memory `compile` | PASS 2/2 files | Standard-library Python syntax; no app typecheck or Windows claim |
| `git diff --check` | PASS | Whitespace only, not runtime evidence |
| Source review | PASS for this isolated spike | No imports for subprocess/network/device access; no secrets or raw device data in source/results; byte limit before parsing, depth/count validated after parsing (not a peak-memory guarantee), unsafe declarations refused, explicit XML 1.0/UTF-8 declaration whitelist, bounded ASCII integer conversion |
| Windows collector regression | NOT_RUN in this session | PowerShell absent; collector source unchanged; prior 18/18 Windows synthetic evidence remains separate |
| Real XML capture/profile evaluation | NOT_RUN | No reviewed representative hierarchy corpus used; synthetic success does not establish app compatibility |
| Physical selector-driven action + read-back | NOT_RUN | No device actions authorized/performed here; required P0-04 gate remains open |
| Dump versus instrumentation comparison | NOT_RUN | Actual deployment/version choice still unresolved; not chosen by this script |
| UI, DB, packaging, app type/lint checks | NOT_APPLICABLE to offline spike | No renderer, database, TypeScript application or package changed |

## Sources checked, not dependency pins

Checked 2026-10-30:
- [Android official UI Automator guide](https://developer.android.com/training/testing/other-components/ui-automator): semantic predicates and stability checks motivate explicit selector/context experiments. The guide's current example uses a development API; this review does not install it or select a production version.
- [Python official XML security guidance](https://docs.python.org/3/library/xml.html#xml-security): untrusted XML warrants resource and entity defenses and a known parser runtime. Recorded Expat above is the runtime actually tested, not a promise for every Python installation.

## Acceptance and handoff

**Offline slice: tested, ready for independent review. Full P0-04: IN_PROGRESS /
BLOCKED on empirical acceptance. Phase 0: not accepted. Phase 1: NOT_STARTED.**

`UNIQUE_CANDIDATE` cannot authorize a click, prove visibility/clickability,
identity, permission, trustworthy timestamps or stable UI. No coordinates are
returned for action dispatch. Missing empirical evidence must never be replaced
by synthetic test results. Limits are defensive offline ceilings, not accepted
capacity/accuracy/freshness thresholds. Rollback consists of reverting only this
spike/tests/documentation delta. Approved Phase 0 plan, UI baseline, P0-01
collector, user files and historical evidence are preserved.

Next independent review: inspect code/diff and rerun the command, then coordinate
publication to the authorized Phase branch. P0-08 source/capability research can
be separately scoped without hardware; it cannot infer platform permission from
Page ownership or enable any action. Phase 1 needs actual stack/Windows evidence,
not a guessed package or secret-storage choice.
