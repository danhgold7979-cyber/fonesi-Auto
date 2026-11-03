# P1-11-S unavailable-only validators — 2026-10-31

Entry approved by coordinator at 01:51 UTC after reviewed P1-03-S publication
`d32bc77222027f5a043f9e4dc2608236870bb3b9`. Entry was recorded in amendment/status
before code. Current branch: `phase-01`; no old-branch revival or new scope.

## Implemented exact subset

`foundation/src/contracts/types.ts` and `validate.ts` replace the empty marker with
pure types and a validator for the already-approved four-field unavailable envelope.
`foundation/tests/validators.test.mjs` compiles actual source into a fresh owned,
ignored directory, imports the compiled validator and removes output afterward.
The existing check command includes this test file; no dependency/lock/workflow,
transport, runtime service, business entity/schema or platform adapter was added.

Exact fields: version 1; status UNAVAILABLE; reason NOT_IMPLEMENTED,
DEPENDENCY_BLOCKED or UNSUPPORTED; ASCII alphanumeric/underscore/hyphen correlation
identifier of 1–64 characters. Only exact own data properties on an ordinary object
whose prototype equals Object.prototype are accepted. Nonenumerable data properties
are allowed; arrays, missing/extra/symbol keys, exotic prototypes and accessors fail.

Return value is a fixed primitive code only: VALID, INVALID_SHAPE, INVALID_FIELD or
UNSUPPORTED_VERSION. Shape is checked first; non-safe-integer version representations
are invalid fields, other safe integer versions are unsupported. No input is echoed,
normalized or returned. VALID means an **unavailable envelope conforms**, never that
an operation is allowed, a service works, or a caller has authority. No type-predicate
narrowing or success/activation state is supplied.

## Actual test evidence

Linux x64, Node 24.22.1, npm 11.9.0, TypeScript 7.0.2, unchanged reviewed dependencies.
Command: `node foundation/scripts/check.mjs 11.9.0`.
All five stages PASS; **85/85 tests PASS**, 0 failures/skips/cancellations/todos.
This includes the previous 54 regressions and 31 validator cases/groups.

Coverage: all three reasons; 1/64-character positive bounds; missing/extra/privilege
fields; inherited/null/exotic prototypes; symbols; accessor rejection with zero
getter/setter calls; frozen valid/invalid input descriptor immutability; boolean,
string, fractional, nonfinite and unsupported integer versions; no success state;
empty/65-character/non-ASCII/path/control-character identifiers; no field coercion;
fixed output; and revoked/throwing proxies returning a fixed code without raw errors.
An ASCII synthetic secret-shaped identifier is intentionally format-valid: the test
proves formatting is not sanitization or logging authorization, not secret detection.

## Limits and unchanged gates

Input is already-parsed ordinary data, not hostile same-process JavaScript. Proxy
getPrototypeOf/getOwnPropertyDescriptor/ownKeys traps may execute and may impersonate
ordinary records. Catching a trap error does not sandbox or undo effects. Compromised
globals are outside the model. Tests of thrown/revoked proxies do not establish that
all proxies can be detected or rejected. Ordinary getter/coercion non-execution is
separately tested.

Property-name enumeration allocates according to supplied input. The accepted
four-field/64-character format does **not** impose a general input-size, CPU or
peak-memory bound on arbitrary already-parsed objects. No parser/wire transport,
IPC sender security, runtime capability, user/device identity or secret access is
implemented. Correlation formatting cannot identify secrets/PII; accepted values
must not be assumed safe to log or publish.

No Windows/target-host or new hosted CI run. Phase 0 baseline SHA256 remains
`3882e2112129fdc0dcdc69104195cc95d8f90c933a210c9002cd16642873316c`; all 12 exits
unchecked. Original navigation source/package 20/21 FAIL, ADR B/C limits and
C-03/C-05/V9 remain unchanged. This completes only the authorized pure-source slice,
not full P1-11 or Phase 1 acceptance. No further source task may start without new explicit scoped approval.

Independent review CLEAR at 01:55 UTC: all five stages passed twice with 85/85
cases each; final owned test output empty. Root independently reran the same checks
with 85/85 PASS. Checks also passed for 71 local documentation links, whitespace,
diff and unchanged Phase 0 baseline/12 exits. No source blocker or privacy overclaim
identified. Review did not confer further implementation authority; checkpoint
publication belongs to root.
