# Pure foundation contracts

P1-11-S implements `types.ts` and `validate.ts` under the scoped amendment.
The earlier empty module marker has been replaced by these pure source modules.
Only the approved four-field unavailable envelope is recognized; output is a fixed
validation code, never the original input or a capability grant.

Import only other pure contract modules. No Node/DOM globals, platform libraries,
I/O, transport, privileged service, tests/tooling imports or dynamic loaders.
P1-03-S enforces the reviewed restricted import grammar and strict compilation;
lexical checks are hygiene, not complete runtime capability detection.

Input is already-parsed ordinary data with exactly Object.prototype. Own accessors,
symbols, extra keys and other prototypes are rejected. Proxies can execute traps
and may impersonate ordinary objects; detecting or sandboxing them is not promised.
Property-name enumeration allocates based on the supplied object: accepted field
bounds are not an input-size or peak-memory guarantee. Correlation format validation
is not secret detection, sanitization or permission to log accepted identifiers.

## Reviewed P1-11 domain fixture addition

`domain-types.ts` and `domain-fixtures.ts` are separate development-only v1
contracts; they do not broaden the unavailable envelope or desktop public protocol.
See [exact schema](../../../docs/phases/PHASE-01-P1-11-CONTRACT-COMPLETION-PROPOSAL.md).
The snapshot tree uses enumerable own data descriptors and exact ordinary record/array
prototypes; getters, symbols, cycles and shared object containers are rejected.
Accepted snapshots permit at most 32 collection/list entries, depth 8 and 2,048 containers.
These are fixture-work limits, not product limits or arbitrary-input memory guarantees.
Only synthetic values belong in checked-in fixtures. A fixed VALID result does not
provide type narrowing, logging permission, real evidence verification or authority.
