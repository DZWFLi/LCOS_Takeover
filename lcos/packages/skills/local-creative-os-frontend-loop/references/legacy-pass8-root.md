---
name: local-creative-os-frontend-loop
description: Develop, debug, review, or visually refine the Local Creative OS frontend. Use for Canvas, nodes, editable relations, pointer interactions, Workspace Dock, Mini-map, Inspector, Command creation, Make/Figma fidelity, motion, responsiveness, or frontend milestone acceptance in E:\Codex 项目\OS开发.
---

# Local Creative OS Frontend Loop

## Outcome

Make the frontend feel immediately responsive, spatially predictable, functionally complete, and visually faithful to the accepted Make prototype. Treat feedback such as “粘住”“迟滞”“不如 Make”“不丝滑” as a reproducible product defect, not deferred polish.

Call the current phase **Frontend Interaction Foundation** until the three rounds below pass. Do not label the current build Alpha merely because it renders.

## Read Before Editing

Read these sources in order and follow repository precedence rules:

1. `E:\Codex 项目\OS开发\CODEX_START_HERE.md`
2. `E:\Codex 项目\OS开发\README.md`
3. `E:\Codex 项目\OS开发\AGENTS.md`
4. The current Sprint and handoff documents
5. `E:\Codex 项目\OS开发\docs\design\CREATIVE_OS_MATERIAL_VISUAL_SYSTEM.md`
6. `E:\Codex 项目\OS开发\OS项目文档\Make原型\高保真原型设计.zip`
7. `E:\Codex 项目\OS开发\前端测试\Local_Creative_OS_CSS_Refined_v0.3.zip`

The Make source and frozen visual specification are direct implementation references. Preserve their successful material, spacing, hierarchy, and proportions. Do not replace them with generic white SaaS cards or an independently reimagined design.

Treat CSS v0.3 as the latest visual baseline, but do not inherit its automatic `max-width: 1400px` dot-only Workspace Dock. At 1366px, an expanded Dock must remain readable; compact mode is explicit user state, not an automatic disappearance of labels and actions.

## Use Supporting Skills

Use the smallest relevant set, in this order:

1. `build-web-apps:frontend-app-builder` for implementation fidelity and structure.
2. `build-web-apps:frontend-testing-debugging` for real browser interaction and diagnosis.
3. `build-web-apps:react-best-practices` after meaningful React edits.
4. `interactive-prototype` when validating that visible controls actually work.

Do not use build success as evidence of interaction quality.

## Work in Three Rounds

### Round 1 — Interaction Feel

Pass this round before expanding the feature surface:

- Middle mouse drag pans the Canvas.
- Left mouse selects, drags, box-selects, creates, and edits relations.
- Selection appears immediately; do not delay ordinary click feedback to wait for double-click.
- Double-click opens direct relations without producing a visible single-click overlay flash.
- `?` opens lightweight node detail; `Enter` may remain a keyboard equivalent.
- `Space + left click` on empty Canvas creates and edits a Command at the clicked Canvas coordinate.
- A dropped file creates its node at the release coordinate.
- Users can create at least Command, Note, and Context placeholder nodes.
- `Delete` / `Backspace` removes selected Artifact Views or Fixture nodes and their incident edges, never silently deleting the underlying Artifact; text input focus always wins.
- Left-drag on empty Canvas creates a marquee selection; `Shift + click` adds or removes nodes, and selected nodes can move or delete as a group.
- After marquee selection, derive and keep a persistent Canvas-world group selection boundary until selection is cleared or changed. The drag marquee itself remains transient.
- Edge handles create real relations. Relations can be selected, deleted, and reconnected.
- Dropping an edge handle on empty Canvas opens the same approved node-creation menu at the release coordinate; choosing a type creates the node and connects it to the source, while cancel leaves no temporary edge or node.
- Node movement updates connected edges continuously.
- A single selected node can be resized with a subtle handle. Resize updates edges and overlays continuously, clamps by node family, supports `Shift` aspect-ratio lock, and reveals more real metadata only as node size and LOD allow.
- Hover and press feedback exists on every actionable control.
- Clicking, dragging, and releasing never feels sticky, delayed, or captured unexpectedly.

### Round 2 — Organization Completeness

- Workspace Dock supports collapsed and expanded states, Overview, Active state, Add, counts/status, and camera focus.
- Node families are visually and behaviorally distinct: Source, Working, Generated Draft, Context, Process, and Decision.
- Mini-map is compact by default, resizable or collapsible, and its viewport can move the main camera.
- When the camera viewport intersects no nodes, Mini-map exposes a labeled locate-content action that fits actual current Workspace node bounds; never use a hard-coded camera reset.
- Inspector is a single overlay with a local back stack.
- Inspector uses one contextual vertical information stream, not four peer tabs. Order relevant sections as Preview → Relations → Context → Activity, omit empty sections, and use progressive disclosure; Compare is a temporary expansion within the same Inspector.
- Command clearly separates Target from Context.
- Relations, status overlays, and current selection remain understandable after rearrangement.
- Frontend state can be restored without pretending fixture data is runtime truth.

### Round 3 — Product Maturity

- Complete the approved frontend state loop, including waiting input, review, return, compare, accept current, retry, and checkpoint surfaces.
- Cover empty, loading, error, disconnected, and conflict states.
- Validate shortcuts, reduced motion, and 1366×768 plus one larger desktop size.
- Restore Make-level material fidelity across nodes, Dock, Mini-map, Inspector, and Command.
- Prove the interface can be used continuously, not only demonstrated once.

Only after these rounds should the project redefine the true Frontend Alpha gate.

## Pointer and Render Rules

- Use a drag threshold of roughly 3–5 screen pixels.
- Do not capture the pointer before crossing the drag threshold.
- Suppress the trailing click after a completed drag.
- Disable geometry transitions and hover translation while dragging.
- Keep high-frequency pointer and viewport updates in transient refs or animation-frame scheduling; do not write global business state on every pointer move.
- Re-render only the affected node, connected edges, and necessary overlays.
- Keep Canvas pan, node drag, edge drag, click, double-click, and Space gestures in one explicit interaction state machine.
- Text input always wins over Canvas shortcuts.

## Visual Fidelity Rules

- Port accepted values and patterns directly from Make before inventing replacements.
- Base palette: app `#ECEDEA`, Canvas `#F5F5F2`, text `#192837`, accent `#7342E2`.
- Use porcelain-white and cool-gray molded surfaces, subtle inner highlights, recessed preview wells, fine borders, and diffuse shadows.
- Use low-saturation category color only for icons, fine edges, labels, and ambient light.
- Never use a full-height colored stripe on nodes. Category color belongs in a 2px top light, icon, small label, or ambient glow.
- Reserve liquid chrome for rare primary controls and active hardware-like details.
- Keep at most one visually primary action per row. Secondary buttons, filters, menus, and disclosure controls remain porcelain/cool-gray; iridescence is a small anchor, not a repeated button treatment.
- Nodes, Dock, Mini-map, Inspector, and Command must look like one industrial design family.
- Compare screenshots against Make at actual viewport size after each meaningful visual slice.

## Tight Browser Loop

For each small slice:

1. Implement one interaction or component family.
2. Run the app.
3. Exercise it in a real browser with realistic pointer sequences.
4. Inspect Console errors and take an actual-size screenshot.
5. Compare behavior and material with Make and the frozen specification.
6. Fix the largest felt discrepancy before starting another feature.

Do not batch many interaction changes before browser verification.

## Mandatory Feel Checks

Perform relevant checks after interaction changes:

- Rapidly select nodes 20 times.
- Drag a node 10 times in different directions.
- Click then immediately drag; drag then immediately click another node.
- Double-click nodes near and far from the Inspector edge.
- Pan repeatedly with the middle mouse button.
- Create a Command with `Space + click` and verify exact placement.
- Drop a file and verify release-coordinate placement.
- Create, select, delete, and reconnect a custom relation.
- Marquee-select multiple nodes, extend/toggle the selection, group-drag it, and delete it with both supported delete keys.
- Verify the persistent group boundary follows camera movement and selection changes, and clears on blank click or `Esc`.
- Resize each node family, including `Shift` aspect-ratio lock, edge/overlay following, size clamping, and compact/standard/expanded information disclosure.
- Pan until no nodes are visible, use Mini-map locate-content, and verify a real fit-to-bounds result.
- Drag an anchor to empty Canvas, create each approved node type at the release point, and verify automatic connection plus clean cancellation.
- Move the camera from the Mini-map and verify bidirectional synchronization.

Record any visible lag, jump, accidental click, stale edge, coordinate error, or hover flicker as a failed check.

## Proportionate Validation

For daily Alpha iteration, prioritize usable evidence:

- app starts;
- changed interaction works in a browser;
- no blocking Console error;
- relevant typecheck, unit, or smoke check passes.

Run the full lint → typecheck → unit → build → smoke → browser Golden Path chain only for integration, a stable commit, a milestone review, or final handoff.

Never compromise these bottom lines: no file loss, no silent overwrite of Current, no secret leakage, and no fixture/mock presented as runtime capability.

## Coordination and Reporting

- Keep file ownership boundaries from the current handoff.
- Do not send a small local defect or report through Buddy merely to satisfy process ceremony.
- Use Buddy only for peripheral research, screenshot inventories, compatibility checks, or independent evidence when it saves time and cannot conflict with core code.
- After each round report only: what is now usable, the single largest blocker, and the next concrete slice.
- Preserve user changes and existing Make materials. Do not reset or overwrite unrelated work.
