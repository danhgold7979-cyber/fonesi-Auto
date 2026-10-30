# Approved V9 UI reference — complete source

The file [Fonesi-Auto-V9-UI-Reference.html](Fonesi-Auto-V9-UI-Reference.html) is the **complete V9 HTML/CSS/JavaScript source plus the newly approved Stream / Performance control addendum**. It is not a simplified redraw or summary mock.

The original V9 source was imported in full. The only intentional additive UI change in this revision is a compact performance button in the existing right-side monitor header, opening a dialog with Auto/Manual mode, FPS, resolution/scale, bitrate, concurrent stream controls and clearly labeled demo telemetry. Existing V9 page renderers, layout, workflow tree, device wall and interactions are retained.

## Open it
1. Open [Fonesi-Auto-V9-UI-Reference.html](Fonesi-Auto-V9-UI-Reference.html) in this repository.
2. Select **Download raw file**.
3. Save it locally.
4. Open the downloaded HTML in Chrome or Microsoft Edge.

GitHub's source viewer does not execute local HTML/JavaScript. Download and open the file in a browser to inspect the actual interface.


## Source and revision check
- Full source was read from the original uploaded `Fonesi-Auto-V9-UI-Source.html` before the additive stream-controls update.
- Current repository HTML contains 1,296 lines and approximately 240 KB of Unicode text.
- The original V9 source remains in Git history; the current file adds only the approved Stream / Performance UI control and its demo interactions.
- The current source must be syntax-checked and visually reviewed in Chrome/Edge before a production renderer is implemented.
- Demo telemetry is explicitly labeled DEMO; it is not a live hardware reading.

## Implementation rules
- Treat this full HTML as the canonical V9 reference.
- Do not replace it with a hand-written approximation, screenshot-only reference or reduced mockup.
- Preserve DOM structure, CSS tokens, component dimensions, navigation order, page renderers and interaction handlers when implementing the production UI.
- The production app may replace demo data and mock handlers with typed IPC/service calls, but must not change the visible behavior/layout without explicit approval.
- Keep an explicit UI parity checklist and compare the production renderer against this file at the same viewport sizes.
- This HTML is a UI artifact only. The new Fonesi-Auto application architecture, runtime, database and source code are designed independently.
