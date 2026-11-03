# P10-07 bounded in-app fleet CSV preview source entry

Proposed 2026-11-03 22:52 UTC. Independent design CLEAR and coordinator adoption at 22:55 UTC before production edits
(reviewed proposal SHA256 63d9c25ebde2b0872476a649f2d55af8caa09bad971c291cf6950ba9bbd6f006).
This supplements the historical Phase10 plan under Amendment02, not full task or
Phase acceptance. Base: clean local `52748fb20cbc5efc383ee50e45842fc4b21d220c`, reviewed tree
`d12c5119f5c6340b355cec43b68fc896716a689d` matching published `766a675ff6aaa13bcf131fe1f697738ed2e53381` on
phase-10. Main, predecessor gates and existing history remain untouched.

## Contract and privacy

Only explicit Tracking clicks capture the current privately bound FleetHealth through
readFleetHealth(snapshot). A copied/forged object, arbitrary source label, synthetic,
pending, revoked, errored or unavailable snapshot cannot produce a preview. No new
IPC, permissions, dependencies, collection or mutation. The existing table and CSV
both cover ALL loaded captured registry records, independent of phone/network/account
filters. These filters are not report scope. No complete physical census is claimed.

Extend the existing pure fleet-health module, retaining its private identity binding;
no new production module is needed. A deterministic cell-escaping primitive can be
exported for focused tests, but only capture accepts a report source.
The immutable result has CSV text, captured source/scope/revisions and record count.
CSV v1 header order: schema_version,source,scope,registry_revision,selection_revision,
record_count,device_id,generation,label,state,device_verification,
observation_time_availability,verification_time_availability.
Each admitted device gives one row, in the validated snapshot order; an observed
empty registry gives only the header with zero record count in preview metadata.
Revisions/generation/count are actual integers, not metrics. Their decimal lexical
values are preserved in CSV; spreadsheet auto-typing/large-integer precision is not
certified and no native spreadsheet reopening is claimed. Missing times are
explicit NOT_PROVIDED_BY_SOURCE flags, with no invented timestamp/value column.
Accounts, raw serials, paths, IPs, secrets, media, jobs, transport, battery, storage,
stream and platform metrics are omitted and explained in preview. No freshness,
account login or physical identity guarantee follows from record verification.

CSV uses comma delimiters, double-quoted cells with doubled embedded quotes and CRLF
record separators, including final CRLF; no BOM. String cells that begin with
spreadsheet formula markers =,+,-,@ after whitespace, or begin tab/CR/LF, get a leading
apostrophe. This deliberately changes their textual representation, not original
byte preservation. Malformed UTF-16 and disallowed controls are refused. No silent
truncation. Fixed limits: 256 records (existing admitted snapshot bound), 256 UTF-16
code units per raw input cell (before formula prefix/CSV escaping), 262144 UTF-8 bytes overall. Reject whole preview
on limit/encoding violation. Current admitted labels remain Device NNNN only; helper
escaping tests with Unicode/commas/quotes/newlines are synthetic tests, not expanded
production field acceptance or arbitrary CSV/data ingestion. Public capture API takes
only an admitted UI snapshot, never file paths/URLs or arbitrary rows/source labels.

## UI lifetime

Replace Tracking's export action with clearly labeled in-app fleet CSV preview.
Unavailable snapshots retain an explicit unavailable action/reason. Reuse UiModal,
with read-only labeled textarea, source/revisions/count/all-loaded scope and missing
facts. Say nothing was saved; no download, Blob/object URL, clipboard, sharing,
network or native filesystem path. Preserve V9 header/cards/table/navigation/monitor.

Click captures once, repeated click while open is idempotent. Cancel/Escape/backdrop
close and restore focus via existing UiModal. Meaningful captured record/selection content, source,
revision or filter context change removes preview synchronously from render and
clears its stored state; no background regeneration. Navigation/unmount discards it.
Equivalent fresh projection identities alone do not invalidate. A bounded semantic
key compares only privately admitted frozen health; it is consistency, not independent
authentication or revocation. Stale UI handlers cannot reopen/close a later intent.
Reopening requires an explicit click and captures the then-current snapshot. Do not
alter existing shell pending READY-row/monitor behavior.

## Tests and evidence

Test actual FleetService → parsed validated snapshot → bound health → CSV preview;
header/order/count/scope/revisions, immutable capture, actual zero count versus
unknown source, unavailable flags and absence of private data. Refuse forged copies,
malformed/hostile descriptors and synthetic inputs. Exercise cell Unicode/CRLF/quote
escaping, formula defense, malformed Unicode, boundary limits and whole-payload bounds.
Effectful UI tests cover pending/revoked/error/source/selection/filter changes, late
context, repeated clicks/cancel/reopen/unmount and focus restoration. Retain existing
renderer sequencing tests. Update exact closed graph/build/demo/quality/test inventories.

After final edits freeze hashes; serialize full aggregate with coordinator. Run strict
product/demo compile, both builds, graph/manifest/quality and full desktop aggregate
under pinned Node24.22.1/npm11.9.0 with NODE_PATH/NODE_OPTIONS/ESBUILD_BINARY_PATH unset.
Independent implementation review precedes commit/publication; exact-head source CI
must reach terminal. No native/visual/device run; these remain NOT_RUN, P1-06 UNMET.
Rollback is this reviewed source delta only, no migration or history rewrite. Native
save/overwrite/XLSX/export acceptance, metric collection and full P10-07 remain open.

## Admitted payload bound clarification — 23:01 UTC

The maximal current admitted schema is64731 UTF8 bytes:219-byte header plus256
252-byte rows using DISCONNECTED/PROVISIONAL and maximal safe registry/selection/
generation integers. The full-capacity test asserts this exact bound and257-record
refusal. The262144-byte final ceiling is defense-in-depth and unreachable under the
current schema; its over-ceiling refusal is not directly exercised. No binding forge
or expanded report-input API is introduced to manufacture such an input.
