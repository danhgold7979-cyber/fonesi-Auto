# Provisional pure-source foundation

Authorized subsets **P1-01-S/P1-03-S**, not the application or full Phase1. See the
[approved scoped amendment](../docs/phases/PHASE-01-PROVISIONAL-SOURCE-AMENDMENT-01.md).
No entry point, Electron/React runtime, IPC, I/O service, DB/vault, devices or accounts.

## Module map / ownership

| Path | Responsibility | Allowed dependency direction |
|---|---|---|
| `src/contracts/` | Reserved pure status/error schema module; implementation pending P1-11-S | Other pure contract modules only; no tooling/tests or Node/DOM globals |
| `scripts/` | Development metadata checks; owned repository reads, fixed-code output | Node builtins and reviewed metadata; never imported by contracts |
| `tests/` | Development-only metadata positive/negative fixtures | Node test/assert, check functions and reviewed metadata |
| `build/`, `.test-output/` | Future owned generated output, ignored | Not a source or runtime authority |

P1-03-S now checks the restricted source/import grammar and strict compilation;
this is development enforcement, not a runtime sandbox or full semantic linter. No renderer is introduced to
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
actual compiler7.0.2; source compilation is now included in the P1-03-S command below. Wrong/missing
package/runtime reports fixed failure codes and nonzero exit, not fallback installs.

No automatic cleanup command is provided. Remove only identified generated outputs
under this workspace if needed; never user/global SDK files or other lab caches.
Windows bootstrap is NOT_RUN for this subset. Linux bootstrap is not target-host
support or Windows acceptance. No new CI workflow or published executable exists.

## P1-03-S checks

From this directory: `node scripts/check.mjs "$(npm --version)"`. The ordered stages
verify bootstrap, source boundary, strict compile, limited hygiene and the exact
listed Node test files. Any failed stage stops with nonzero status/fixed code; raw
compiler errors remain available only through an explicit developer command. Test
summary requires nonzero test count and zero failures/cancellations/skips/todos.
Run twice to check fixture isolation; fresh test directories are removed afterward.
No package script, dependency, hosted workflow or application entry was added.

Source scope is exactly flat `src/contracts/*.ts`; no alternate source directory,
symlink, declaration file or non-TypeScript source is accepted. The only allowed
module edge is `import type { Name[, Other] } from './sibling.js';` to a present
sibling `.ts`, with no cycle. Runtime/default/namespace imports, aliases, re-exports,
dynamic imports, require/import-equals/import-meta, type-query imports, encoded
paths, traversal and unknown import forms fail closed. Expanding this grammar needs
review/tests. Even valid TypeScript may be deliberately unsupported.

The scanner comes from the already integrity-locked TypeScript7.0.2
`typescript/unstable/ast` export. Its installed declarations/source were inspected;
this unstable API is version-specific and not a stable production parser choice.
Compiler validation remains separate. Templates/regex/division/decorators/hash tokens
and suppression/reference/ambient directives are conservatively refused. A direct
global/loader/reflection-name denylist adds limited hygiene, **not proof against all
JavaScript reflection tricks or hostile same-process execution**. There is no
privileged service to protect here; real security remains gated. Source files are
capped64KiB and64directory entries; these are defensive development limits, not
a hard peak-memory or hostile-filesystem-race guarantee.

Strict compiler: ES2022, no Node/DOM ambient scope, strict/noUncheckedIndexedAccess/
exactOptionalPropertyTypes/noUnusedLocals/noUnusedParameters/noImplicitReturns/
noFallthroughCasesInSwitch, no emit, no skipped library checking. Current source is
only an empty module marker; P1-11-S validators are still unimplemented. Test/tooling
Node builtins are separate from source. Hygiene only checks LF, final newline, no
tabs/trailing whitespace, selected bounded files and no symlinks: no full formatter
or general-purpose lint claim.

Development child tools use a30s requested timeout and64KiB capture cap, no shell.
These are trusted compiler/test processes, not the Windows Job containment mechanism
or a guarantee that arbitrary child trees can be killed. Test subprocesses remove
only inherited NODE_TEST_CONTEXT to create an independent runner. No user/global
environment setting is changed. Windows execution remains NOT_RUN.
