# Approved V9 UI reference — complete source

The file [Fonesi-Auto-V9-UI-Reference.html](Fonesi-Auto-V9-UI-Reference.html) is the **complete approved V9 HTML source**, not a simplified redraw or summary mock.

It preserves the original V9 document's full HTML structure, CSS, JavaScript, page renderers, controls, event handlers, workflow tree, screen-wall behavior and interaction logic. This is the visual/behavioral baseline that future implementation must follow.

## Open it
1. Open [Fonesi-Auto-V9-UI-Reference.html](Fonesi-Auto-V9-UI-Reference.html) in this repository.
2. Select **Download raw file**.
3. Save it locally.
4. Open the downloaded HTML in Chrome or Microsoft Edge.

GitHub's source viewer does not execute local HTML/JavaScript. Download and open the file in a browser to inspect the actual interface.


## Source integrity check
- Full source was read from the original uploaded `Fonesi-Auto-V9-UI-Source.html`.
- Repository copy contains 1,249 lines and 234,631 Unicode characters.
- Text content was compared against the original upload and matched exactly.
- The inline JavaScript passed `node --check`.
- Git blob SHA: `135da3bf7bb3d89a54520952c28341cc68d54064`.

## Implementation rules
- Treat this full HTML as the canonical V9 reference.
- Do not replace it with a hand-written approximation, screenshot-only reference or reduced mockup.
- Preserve DOM structure, CSS tokens, component dimensions, navigation order, page renderers and interaction handlers when implementing the production UI.
- The production app may replace demo data and mock handlers with typed IPC/service calls, but must not change the visible behavior/layout without explicit approval.
- Keep an explicit UI parity checklist and compare the production renderer against this file at the same viewport sizes.
- This HTML is a UI artifact only. The new Fonesi-Auto application architecture, runtime, database and source code are designed independently.
