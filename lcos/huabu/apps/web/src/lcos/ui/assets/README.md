# LCOS Figma shell glyph assets

Source file: `nFUdroLvI5qJZuYTW8h2rF`.

These SVG files are presentation assets exported from the current Figma design and stored locally so production code does not depend on short-lived MCP asset URLs. The SVG path geometry is not authored by the implementation layer.

Current adoption anchors:

- Navigator `5384:367`: `search.svg`, `pin-body.svg`, `pin-highlight.svg`, `plus.svg`
- Railway `5385:283`: `root.svg`, `collection.svg`, `context.svg`, `workflow.svg` (only when the real destination kind maps to that exact glyph; otherwise the production destination icon remains in use)
- ProjectShell `5386:436`: `project.svg`, `root.svg`, `context.svg`, `workflow.svg`, `grid.svg`, `bench.svg`, `plus.svg`
- SurfaceFeedback `5391:357`: `loading.svg`, `empty.svg`, `normal.svg`, `focus.svg`, `disabled.svg`, `error.svg`, `recovery.svg`

Rules:

1. These assets express presentation only. They do not infer destination/entity semantics.
2. If a production caller cannot prove the semantic mapping to an exact Figma glyph, it must retain its existing real icon rather than guess.
3. Any future replacement must be re-exported from the current Figma source and keep this provenance file updated.
