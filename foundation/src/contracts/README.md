# Pure unavailable-status contracts

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
