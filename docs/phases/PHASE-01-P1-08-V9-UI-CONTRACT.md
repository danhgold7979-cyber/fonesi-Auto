# P1-08 — complete V9 React interface contract

**APPROVED source entry 2026-10-31 13:18 UTC.** Proposed13:13; independently CLEAR
pre-entry SHA256`cc747be73b73fa899b37dec536ee502e496fb9692e4bd67dc08d69900c7f02fb`,
then explicitly approved by coordinator under delegated authority. One coherent six-tab
implementation/review/native-evidence checkpoint, not six separate approval loops.
Dependencies: bounded P1-02/P1-07 software contracts; formal hardware/Phase0 chain and
P1-06 cross-user UNMET remain explicit under the adopted
[software-first amendment](SOFTWARE-FIRST-HARDWARE-DEFERRED-AMENDMENT-02.md).

## Authority and exact visual reference

Preserve the complete [V9 HTML](../../ui-reference/Fonesi-Auto-V9-UI-Reference.html),
SHA256 `26519dda4d65f4712258b9f3c136b785126121260e6fae8d8ada1bbb84363efe`.
All1,295 lines/249,014 bytes were inspected across the coordinated read-only audit,
including the final cascaded CSS, markup, all rendering and event handlers. The
[accepted UI mapping](../06_UI_V9_MAPPING.md) controls product semantics where the
demo differs: comment count0–10, maximum20 visible media rows, warning-only gaps below
30minutes, explicit QUEUE/AUTO_SHIFT and timezone/freshness/capability semantics.
No V9 redesign, seventh tab, workflow node editor or new backend service is authorized.
The Impeccable planning guidance was read; its launcher is unavailable and no tool was
installed. Canonical product/V9 context is authoritative, not a newly invented visual world.

## Deliver all six screens and shared shell together

Navigation order/labels remain exactly:
1. Tổng quan (`overview`)
2. Tài khoản (`accounts`)
3. Theo dõi (`tracking`)
4. Thiết lập & nội dung (`setup`)
5. Quản lý lịch đăng (`calendar`)
6. Quy trình (`workflows`)

Interaction review is a workflow subview, not another navigation tab. The unused demo
history renderer does not authorize another tab. Preserve all page headings, section
hierarchies, table headers, controls, icon placements and dense layout, not only shell
silhouettes. The following is the implementation/parity checklist, not new task IDs:

| Surface | Required visible structure and local behavior |
|---|---|
| Overview | Captured scope selector/count, quick device/app/proxy/configuration/diagnostic actions, four stat cards, search and device table with selection/status/connection/battery/storage/setup columns |
| Accounts | Phone/platform/search filters, account/target distinction and counts, avatar/identity/status slots, login/scan/refresh controls, nested target disclosure |
| Tracking | Phone/platform/account filters, health table, progress/expiry slots, six-metric panel with provenance/freshness/unavailable, post metrics and snapshot-history structure |
| Setup/content | Step strip and ordered phone→network→account→target→fixed workflow→media source flow; four numbered sections; recursive/import/export/comment controls; horizontally scrollable media table with sticky first columns; local schedule fields/preview structure |
| Calendar | Day/week/month switch, date navigation, filters, legend,24h timeline/sticky lane labels, seven-day and42-cell month layouts, conflict/context surfaces with no fabricated jobs |
| Workflows | Nine network roots and reference fixed catalogue (21 entries), Facebook ĐĂNG/TƯƠNG TÁC hierarchy, expand/collapse/configuration and interaction-review subview; every effect capability explicitly unavailable |
| Shared dock | Compact searchable/collapsible device picker, selection/focus, grid/single/fit controls, tile zoom70–520, resizable separator, stream area, group scope, quick/app icons and compact performance controls |

Reference geometry/cascade is preserved: sidebar184px/main min380/right510; topbar57px;
≤1500 sidebar168/right400; ≤1120 sidebar158/right350/main min300; ≤880 dock below main;
≤600 compact horizontal navigation. Preserve final tile gap2px/aspect9:19.5/radius5px,
active outline, CSS typography/spacing/colors and all Light/Dark overrides. Use current
P1-07 requested dock/tile values and viewport-derived clamps; do not replace persistence
with demo localStorage. Preserve observed reference fallback icons rather than silently
inventing visual corrections (gauge/send/messages-square fall back to info).

## Typed, nonprivileged UI boundary

Production entry constructs a fixed unavailable provider; it has no device/account/
media/job/metric fixture imports and no URL/environment/global selector for demo data.
Each data surface is a typed discriminated state: `LOADING`, `UNAVAILABLE` with fixed
`NOT_IMPLEMENTED` reason, or `ERROR` with fixed UI error code; an explicit `READY` state carries immutable
typed rows plus provenance `SYNTHETIC_TEST` for isolated fixture rendering. Production
provider returns only UNAVAILABLE with empty immutable items; it cannot select READY
or manufacture an observed-device provenance. Tests inject deterministic states through
component/controller parameters in a separate verification entry only, never label
fixture rows as UNAVAILABLE or live observations. A zero *loaded row count* is truthful;
unknown connected devices, battery, metrics, progress or health are not zero/healthy.

Domain actions are an exhaustive fixed UI action union mapped to
`{ok:false,code:'UNAVAILABLE'}` with a visible reason. No raw action string is sent to
main and no new privileged IPC is added. Visible unavailable controls are disabled with
an accessible reason, or open an informational dialog whose Apply/Run remains disabled.
Never silently no-op, fabricate success, detect accounts, mutate proxy/apps, schedule jobs,
operate Android, save business data or import/export files. No native file picker,
clipboard, download, external window or reference prototype backend handler is ported.

Local navigation, search/filter, disclosure, dependent selectors, draft-only form edits,
calendar navigation, modal Close/Cancel, dock drag and tile visual zoom remain interactive.
Draft-only values are clearly unsaved/unavailable for execution. Static workflow names/
descriptions are UI catalogue labels, not runnable workflow definitions. Existing
preferences API is the sole real persisted behavior: theme/dock/tile, with current CAS,
confirmation/error/timeout semantics. Dock drag previews locally and submits once on
completion; no mutation retry. Unknown outcome requires explicit reconciliation/read.
No automatic external action is introduced during mount, navigation or restore.

## Files, asset policy and parser boundaries

Use reviewed React/TypeScript/esbuild only. Split pure UI types/controller, static icon/
workflow-label data, shared shell/dock/modal and six screen components into bounded
renderer-only modules with exact graph bindings. Main/preload capabilities do not expand.
Keep data/text as React values; no `dangerouslySetInnerHTML`, dynamic loader, template
execution, remote asset fetch or copied demo script. The limited TSX import scanner is
not weakened: ordinary labels can live in pure typed text data when required by its
explicit unsupported lexical forms.

Extract the final approved reference CSS into one local reviewed stylesheet asset;
retain source hash/provenance and document only necessary empty/error/accessibility
additions without changing reference geometry. Serve only its exact GET URL through
the existing owned scheme with `text/css`, nosniff, exact build hash and manifest entry.
CSP changes only `style-src 'none'` to `style-src 'self'`; no unsafe-inline, network,
remote font/image or arbitrary-file permission. Static reviewed inline SVG React
paths provide icons; no image-network expansion. Existing sender/origin/frame/asset
query/method denials remain. Keep the entry URL stable for existing v1/v2/preferences.

## Failure, focus and asynchronous state

One UI controller owns current page/selection/modal and a monotonic local request
sequence; stale or disposed replies cannot change a later page/selection. This is UI
state management, not a new Document/human-identity proof. Repeated navigation never
accumulates hidden overlays/listeners. Modal close/Escape/Cancel restores trigger focus;
background controls are not left inert after close. Dropdown keyboard navigation,
labels, visible focus and disabled reasons remain reachable. Resize derives layout
without persistence writes; normal wheel/Control+wheel dispatch is distinguished,
but actual Android input stays unavailable. Empty/error/loading panels retain structure
and actionable explanations, not invented phone cards/screens.

## One bounded verification campaign

During implementation run focused tests; then one complete strict quality/type/graph/
build/unit/integration aggregate and independent review at the coherent checkpoint.
Repair findings in a batch; do not introduce additional requirements/approval cycles.
Existing persistence/security suites remain in scope and must not be weakened.

- Pure/component tests: exact six-tab order, every screen/header/control catalogue,
  unknown versus zero, no fixture/provider activation from environment/URL, exhaustive
  unavailable effects, local dependent selection,20-row table viewport/scroll using
  test-only rows, dropdown/focus, tree, modal Close/Cancel/Escape, narrow dock/resize,
  stale/late response and repeated navigation/disposal.
- Asset tests: only exact CSS GET accepted, query/nonGET/unknown URL denied, exact MIME/
  nosniff/hash, no remote resources or new privileged imports/IPC.
- Actual Windows compiled source/unpacked-package renderer: all six pages in both
  themes at the same **1440×900 CSS viewport and100% zoom**, plus bounded responsive
  smoke at880×768 and600×768. Record actual dimensions/zoom; mismatch fails rather
  than claiming matched parity. Existing settings persistence remains real.
- Reference comparison: capture the unchanged hash-verified V9 at the same viewport/
  theme in a verification-only isolated window with no Node/network/effect permission.
  The reference window uses a distinct ephemeral partition/origin and exact GET-only
  hash-verified reference URL, sandbox/contextIsolation on, Node/preload off, permission/
  network/download/window-open denied. Its unchanged inline script is admitted by its
  exact SHA256 CSP hash, no eval; the exact style block is hash-admitted. Reference-only
  style attributes may use `style-src-attr 'unsafe-inline'` because the unchanged
  prototype renders inline style attributes; this never changes production CSP and
  connect/img/font/object/frame remain none. Fixed verification navigation/theme calls
  are bound to that exact reference hash, not arbitrary input or page-supplied code.
  No reference browser handlers for external effects are exercised. Reference demo
  content versus production empty/unavailable is explicitly annotated, not omitted
  structure or a claim of pixel identity. Test-injected rows are not production data
  or native visual evidence unless separately captured/labeled.
- Retain a page-by-page parity checklist and bounded hash-bound PNG manifest:12 source
  page/theme images,12 matching reference images,4 package representative images
  (overview/setup in both themes), and4 source responsive overview images (two widths,
  both themes). All package pages/themes still receive native behavior/geometry checks.
  At most32 images, each≤4MiB, total≤64MiB, exact approved names/dimensions; no raw logs/private
  identifiers. Screenshots supplement, never replace, behavior tests. Reference images
  are labelled reference/demo; production screenshots must show no invented data.

Inspect one complete batched visual pass, fix all observed defects together and confirm
once. Remaining discrepancies require explicit recorded UI disposition, not quiet
redesign or an endless polish loop. P1-09's explicit demo/build boundary is a subsequent
canonical task; test-only injection here does not claim that task accepted.

## Disposition and next entry

P1-07 bounded recovery native result and this scope's independent review precede source
entry. Root owns publication and exact hosted execution approval. No acceptance/count
increase or main merge follows from this proposal. The P1-10 failed-launch retained-lease
recovery requirement and P1-08 recovery guidance remain visible; do not invent a working
stopped-owner command. Hardware/device/identity gates stay as separately recorded.

Native verification will navigate genuine visible V9 help/settings surfaces rather
than preserve a hidden diagnostic page/fake controls for old test selectors. Automatic
one-shot preference hydration remains independent of opening that modal; existing
wire/admission/error assertions remain exact. Reference Fonesi-W branding/DEMO labels
are replaced with actual Fonesi-Auto identity and truthful unavailable status, not
misrepresented as another product or production demo; geometry remains preserved.
