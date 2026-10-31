# Provisional pure-source foundation

Authorized subset **P1-01-S**, not the application or full Phase1. See the
[approved scoped amendment](../docs/phases/PHASE-01-PROVISIONAL-SOURCE-AMENDMENT-01.md).
No entry point, Electron/React runtime, IPC, I/O service, DB/vault, devices or accounts.

## Module map / ownership

| Path | Responsibility | Allowed dependency direction |
|---|---|---|
| `src/contracts/` | Reserved pure status/error schema module; implementation pending P1-11-S | Other pure contract modules only; no tooling/tests or Node/DOM globals |
| `scripts/` | Development metadata checks; owned repository reads, fixed-code output | Node builtins and reviewed metadata; never imported by contracts |
| `tests/` | Development-only metadata positive/negative fixtures | Node test/assert, check functions and reviewed metadata |
| `build/`, `.test-output/` | Future owned generated output, ignored | Not a source or runtime authority |

No import-boundary enforcement or compiler harness is claimed yet: those are the
next **P1-03-S** entry, requiring parent approval. No renderer is introduced to
justify a fake renderer-to-main test. No package structure is inherited from another
application. Source fixtures must never become production data. Root/private package
has no `main`, `exports`, runtime dependency or lifecycle script.

## Exact candidate toolchain

Node24.22.1, npm11.9.0, TypeScript7.0.2, @types/node24.19.2. Node typings belong only
to development tests/tooling; future contract compiler configuration excludes them.
`undici-types`7.24.6 is the existing resolved type-package dependency;20 optional
TypeScript platform packages7.0.2 plus TypeScript/types/undici total23 locked entries.
Apache-2.0/MIT metadata labels and trusted npm registry URL/SHA512 integrities are
preserved in `dependency-review.json`/`package-lock.json`. This is a candidate,
not production support selection or general-purpose lint/formatter equivalence.

The minimal lock is the recursive dependency/optionalDependency closure of the
previously reviewed desktop-lab lock, not a fresh range resolution. The snapshot
records both prior files' SHA256 and exact manifest/lock contents. Checks compare
all entries; changed/missing metadata fails. Review the diff and original provenance
before trusting an edited snapshot—this is not protection against a malicious editor
who changes both policy and code. npm integrity validates package tarballs on restore;
installed-manifest checks alone are not a subsequent whole-install tamper detector.

## Bootstrap (repository root, reviewed tools already available)

First confirm `node --version` is v24.22.1 and `npm --version` is11.9.0. Missing/wrong
runtime means STOP; no script downloads an alternate runtime. From `foundation/`:

```sh
node scripts/verify-bootstrap.mjs "$(npm --version)"
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --cache=.npm-cache
node scripts/verify-bootstrap.mjs --installed "$(npm --version)"
node --test tests/bootstrap.test.mjs
```

Commands above use POSIX substitution; PowerShell equivalent is `(npm --version)`.
Do not execute compiler or package binaries until installed metadata/hook checks
pass. All dependency lifecycle hooks are disabled on restore; unexpected hooks fail
verification and are never automatically enabled. `tsc --version` may then verify
actual compiler7.0.2; source compilation belongs to the next subset. Wrong/missing
package/runtime reports fixed failure codes and nonzero exit, not fallback installs.

No automatic cleanup command is provided. Remove only identified generated outputs
under this workspace if needed; never user/global SDK files or other lab caches.
Windows bootstrap is NOT_RUN for this subset. Linux bootstrap is not target-host
support or Windows acceptance. No new CI workflow or published executable exists.
