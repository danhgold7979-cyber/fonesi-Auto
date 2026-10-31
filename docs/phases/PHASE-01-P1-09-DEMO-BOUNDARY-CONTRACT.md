# P1-09 — explicit demo build/runtime/storage boundary

**Status: SOURCE ENTRY APPROVED — 2026-10-31 14:52 UTC.**
Coordinator approved exact independently reviewed pre-entry SHA256
`a738ddbe63e7fafb38bd4704962eda6fb3cad45533eb755c335f66020fb7affc`.
Hosted execution remains pending exact source/schema/runner review; no task acceptance.
P1-08 bounded technical scope passed at14:46 UTC. This proposal implements only
[canonical P1-09](PHASE-01-desktop-foundation.md#p1-09--explicit-mock-data-boundary),
not platform services, P1-06 cross-user proof or P1-10 installed packaging. Formal
Phase0/dependency gates and the adopted software-first amendment remain unchanged.

## 1. Minimal architecture and user-visible behavior

Provide a distinct developer demo entry/build, never an environment switch in the
production executable. Reuse the exact six-page React shell/CSS/static icons. A separate
`desktop/demo/` source set supplies a fixed readonly synthetic snapshot; production
`desktop/src/renderer.tsx` continues to supply only its empty/unavailable provider.
No dynamic fixture import, URL query activation, global window injection, production
source toggle or fallback-to-demo on service failure is allowed.

The demo renderer always displays **DEMO — DỮ LIỆU GIẢ LẬP / KHÔNG ĐIỀU KHIỂN THIẾT BỊ**
in a non-dismissible reserved banner and a DEMO window title. It remains visible on all
six pages, in both themes, with dialogs open, and at narrow viewport widths. Existing
SYNTHETIC_TEST provenance remains explicit; all phone/account/media/job identifiers and
labels use a fixed `DEMO-` namespace and one unique fixture-bundle canary. Device rows
are OFFLINE/UNAVAILABLE, never actual connected devices. Metrics remain unavailable;
fixture counts are labeled synthetic. No fabricated publish/login/scan success.

Fixture inventory is fixed and small:3 devices,3 accounts with distinct targets,
25 media rows (to exercise the20-visible-row viewport), and3 explicitly synthetic
UNAVAILABLE planned jobs. No credentials, real phone identifiers, network addresses,
private paths or real user content. All domain actions retain typed unavailable results;
selection, filters, tree navigation, local draft and modal interactions are demonstrable.
Demo theme/dimensions are local demo preferences, not production preferences IPC.

## 2. Build and package separation

- Production build remains the current exact module map/inputs/output manifest. It must
  reject any edge to demo sources before bundling, even type-only/dead-code edges.
- A separate reviewed demo map admits only its main/renderer/provider and the exact
  shared UI/type/static-artwork closure. No production main, preload, persistence,
  vault, settings bridge, process/device service or generic filesystem export is allowed
  in the demo renderer. No new package or external service is needed.
- Demo output lives only in `desktop/demo-build/`, with its own exact manifest and fixed
  `mode: DEMO` metadata. Production manifests/output directories never contain it.
  Both builds use the already reviewed pinned tools, quality/type/graph checks and
  source hashes. Explicitly include `desktop/demo/` and its launcher/build scripts in
  the quality corpus and checked-in test inventory; use a dedicated strict demo TS
  project and bounded exact shared-UI graph closure. Production graph restrictions
  are not broadened to accommodate the separate demo map. A missing/stale/unknown output or mode mismatch fails closed.
- Scan the actual production source and unpacked-runtime package application payload
  for the unique fixture canary/fixture IDs and forbidden demo filenames/graph inputs.
  Scan both plain text and actual manifest-declared bundles; exact inventory prevents
  hiding unlisted files. Tests deliberately inject an illegal fixture import and canary
  into owned copies and require rejection, not a silent build omission.
- The production runtime never consults DEMO/MOCK environment values or query parameters.
  Tests inject such values/arguments and prove production stays empty or refuses unknown
  arguments. The demo runtime requires both a verified DEMO manifest and its exact
  explicit launcher argument; an environment value alone is not admission.

## 3. Dedicated runtime and isolated storage

A separate `Invoke-Demo.ps1` developer launcher verifies the existing pinned native
runtime/build provenance, then reserves an exclusive canonical child beneath a dedicated
`.demo-runtime/` root. It accepts no production root, profile, DB, backup or vault path.
Use the existing reviewed whole-Job supervisor: normal interactive demo has no arbitrary
UI lifetime deadline; verification uses the existing bounded120s run/10s cleanup.
No identity helper, account creation, ACL/privilege change or runtime download.

The explicit application argument is exactly `--demo` (case-sensitive); only this
one literal is added to the existing child argument allowlist, with all Chromium/Node
override denials retained. The process argv must be exactly the verified demo entry
and this literal after the pinned executable. Reuse the existing narrowed environment
admission/restoration and `FONESI_BOOTSTRAP_ROOT` solely for the fresh demo profile; no
new arbitrary environment passthrough. Production entry still refuses this argument.

The owned child has a fixed `.demo-owner.json` marker
`{version:1,kind:"FONESI_DEMO",ownerToken:<canonical lowercase UUID>}`,
exact bounded inventory, nonlink canonical paths and separate userData/sessionData.
Main checks marker/build/argument admission before native readiness. An existing marker
of another kind, symlink/reparse, absent ownership or uncertain prior process refuses
rather than adopting or deleting it. Initially each invocation creates a fresh child;
no production/demo in-process source switch or old-profile import is exposed.

Before `app.whenReady`, bind userData/sessionData/crashDumps to the admitted fresh
`profile` child beneath this marked owner root; reject prior initialization or a different
path. Reuse existing cleanup bounds: maximum256 entries, depth16, profile8MiB, top-level
control/capture evidence1MiB, packaged runtime512MiB, app output8MiB. Exceeding a cap
retains the owned evidence and fails; no widening to force success. Native captures
retain32768 UTF-16 code-unit stdout/stderr caps and the existing10s retirement deadline.

Demo uses exact `fonesi-demo://app/index.html` and a fresh nonpersistent
`demo-<ownerToken>` partition. Only hash-bound
HTML/CSS/renderer assets are served, GET-only, with production-equivalent CSP,
contextIsolation/sandbox on and Node integration/preload off. Network, permissions,
external navigation, popups and downloads are denied. The demo renderer has no IPC
capability and cannot open SQLite/vault files. Theme/dimension preferences may use only
its own origin's localStorage key `fonesi.demo.preferences.v1`, maximum512 UTF-8 bytes,
with exact record `{version:1,theme,dockWidth,tileWidth}`. Defaults are LIGHT/null/150;
theme is LIGHT|DARK, dockWidth null or safe integer300–16384, tileWidth safe integer70–520
(no -0). Validate exact keys/version/ranges. Malformed or oversized values restore only
in-memory demo defaults and attempt removal of this exact key, never `storage.clear()`.
Read/write/remove denial leaves a visible **DEMO · CHƯA LƯU** state and continues only
in memory; it cannot claim persistence. The normal label is **DEMO · CHỈ TRONG PHIÊN**: this
nonpersistent partition promises no cross-launch retention. A session write is reported
stored only after exact readback of its canonical value, never as durable disk storage. No failure clears any other key/profile or reads a
production preference. Fixtures remain immutable bundled
values, not imported/exported into a database. No fixture DB is created or needed.

This is isolated test storage through the dedicated owned browser profile, not a claim
that mocked identities safely merge into a real database. Switching means closing the
entire demo Job and separately launching production; there is no merge/import adapter.
After verified whole-tree retirement, remove only the exact owned temporary child if
all marker/inventory bounds still match. On uncertainty retain private evidence and
report fixed failure; never delete a guessed production directory.

## 4. Tests and finite native evidence

Focused source tests while coding, one coherent full aggregate/review before publication:

1. Exact fixed fixture shape/provenance/namespace/counts; persistent DEMO banner across
   six tabs/themes/modals; local walkthrough25-row scrolling and dependent selection.
2. Production import rejection before resolution, injected fixture-canary/package-copy
   rejection, DEMO/MOCK environment/query/argument tampering cannot activate production.
3. Demo manifest/argument mismatch, unknown assets/network/permissions, wrong marker,
   linked/foreign paths and oversized/malformed localStorage fail within their boundary.
4. Real production SQLite/vault fixtures remain byte-identical before/after demo launch;
   demo origin/storage is distinct and no production service module is loaded. Known
   synthetic canaries never enter production DB/backup/log application payloads.
5. Actual pinned Windows source and unpacked-package demo walkthrough under owned Job,
   all six tabs, banner in both themes/while modal open, native close/retirement. Actual
   production fresh launch with tampered demo flags remains empty/unavailable; production
   payload scan and original source/package smoke remain required.

Use one scoped no-identity verification job and strict fixed sanitized report, not the
unresolved P1-06 context retry. A small fixed screenshot set (source/demo Overview Light,
Dark and Setup with25 synthetic rows; packaged Overview; production empty Overview)
proves banner/data separation; existing P1-08 all32 visual evidence remains authoritative
for layout, not repeated as new scope. Exact final filenames/counts and report predicates
must be declared and independently reviewed before hosted execution. No real phone,
account, hardware performance or installed-package success is inferred.

## 5. Acceptance and rollback

P1-09 is technically ready only when persistent demo labeling, production emptiness,
explicit build/runtime entry, actual owned storage isolation and all leakage/tamper
negatives pass on the exact candidate. Mere mock screenshots/component injection are
insufficient. Root determines disposition; technical counts remain8/11 and formal0 until
then. Rollback disables/removes the demo-only entry/build/provider; production remains
unchanged. Delete only positively owned temporary demo storage after retirement, never
assume a user's profile/database is disposable. P1-10 launcher/reentry and P1-06 UNMET
remain separate obligations, with no waiver from this proposal.
