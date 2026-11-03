# P1-01-S provisional module/bootstrap checkpoint — 2026-10-31

Started01:23 UTC after coordinator approval of proposal `b7d0e11`, recorded in
amendment/decision/playbook/status BEFORE source creation. Branchphase/00-feasibility;
no fullPhase1 opening, Phase0 acceptance, runtime activation or main merge.

## Implemented subset

`foundation/` is a private development workspace without application entry point:
module map, package manifest/minimal lock and inherited review snapshot, metadata
verification script,8 regression tests and a reserved pure-contract directory README.
No contract implementation, TS compiler/import harness or P1-03-S/P1-11-S execution.
Module/import rules are documented, **not yet mechanically enforced**. No renderer,
Electron/IPC, runtime filesystem/settings/DB/vault/device/account/process service.
Normal owned development tooling reads manifests and writes npm-owned build/cache
outputs; it is not exposed as an application API. No new hosted workflow.

The closure contains23 locked package entries: TypeScript7.0.2,20 optional compiler
platform packages, @types/node24.19.2 and undici-types7.24.6. Every entry equals the
existing reviewed lab-lock entry in full, including official registry URLs, SHA512,
license and dependency metadata. Prior lock/review SHA256 are pinned in the new
snapshot. No fresh version selection or lab-source edits. Root manifest has no
runtime dependencies or lifecycle scripts. TypeScript Apache-2.0 and types MIT labels
are inherited metadata, not a complete legal or production support certification.

## Actual checks

Environment: Linux x64, Node24.22.1, npm11.9.0; owned `foundation/` restore.

| Check / command | Result |
|---|---|
| `node foundation/scripts/verify-bootstrap.mjs 11.9.0` | PASS METADATA_VERIFIED |
| From foundation: `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=.npm-cache` | PASS;4 applicable packages installed; lifecycle scripts disabled |
| `node scripts/verify-bootstrap.mjs --installed "$(npm --version)"` | PASS BOOTSTRAP_VERIFIED; required installed manifests have expected versions and no checked lifecycle hooks |
| `./node_modules/.bin/tsc --version` after verification | PASS Version7.0.2; no application compilation claimed |
| `node --test foundation/tests/bootstrap.test.mjs` | PASS8/8,0fail,0skip: exact metadata, wrongNode/npm, added dependency, lock version/integrity/origin/deletion, installed version/hooks and valid installed metadata |
| CLI wrongnpm and missingargs, actual exit-code assertions | PASS; fixed RUNTIME_MISMATCH/ARGUMENTS_REJECTED, each exit1 |
| Node syntax, inherited23-entry equality, baseline SHA and diff check | PASS |
| node_modules/cache ignore checks | PASS; generated packages/logs excluded |
| Windows/target-host bootstrap and full import-boundary suite | NOT_RUN; former requires Windows evidence, latter belongs to next subset |

npm emitted an existing environment http-proxy-config deprecation warning and an
update notice. Neither was acted upon; no proxy/global/npm version change. Installed
metadata checks alone are not whole-directory tamper verification; package tarball
integrity was checked by npm during restore. The inherited review snapshot is a
reviewed repository policy artifact, not protection against a malicious editor
changing both checker and policy. No raw install logs are retained publicly.

## Boundary and next entry

Original Phase0 baseline SHA256 remains
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`, all12 exits unchecked.
Collector/lab/tests/workflow sources unchanged. Original navigation source/package
20/21 FAIL, ADR B BLOCKED/C proposed, C-03/C-05/V9 and all acceptance gates retained.
Full P1-01 is not accepted. P1-01-S independent review CLEAR01:27 UTC; root must approve next P1-03-S
entry before any strict/compiler/import harness work. Provisional files may be
reworked after real host/security/contract decisions. Rollback removes only this
reviewed workspace delta and identified generated output, not existing caches.

Independent reviewer reran8/8 metadata tests and installed verification;76 local
links, whitespace/diff, ignores and original baseline checks PASS. Reviewer did not
restore packages, execute compiler or launch any application. Subset checkpoint
complete01:27 UTC (about4 minutes since approval), not full-task acceptance.
