# GUI Stage5 deep donor provenance — 2026-09-20

This patch deepens Stage4 only. It does not create a new Canvas, pointer owner, selection owner, runtime or canonical store.

- Context Collection exact body: Figma `5333:96`, exact variants `5333:4/20/35/50/66/81`; exact `thing/time` SVG bytes exported from the current Figma file.
- Workflow Collection exact body: Figma `5334:46`, exact variants `5334:4/18/32`; exact flow SVG exported from current Figma.
- Workflow retrieval card: Figma `5335:110`; seven-state matrix re-read directly. Exact flow/paperclip/chevron SVG bytes exported from Figma.
- Hand rise/card motion: thin-adapted from GEN1 `features/ui/ObjectOrbit.tsx` spring channel (`stiffness:400`, `damping:25`) and the proven transient fan-in/fan-out discipline; Hand keeps Workflow/Card truth outside the motion layer.
- Temporal fisheye: Stage4 direct algorithm port from `d3/d3-plugins/fisheye/fisheye.js`, BSD-3-Clause, commit `12e043221743810510a3e95f46a1b723896accf6`; Stage5 adds Figma-exact 11px tick cadence and keyboard/preview lifecycle.
- Portal: current Huabu `SpacePreviewViewport` + `spacePreviewSceneCache` remain the renderer/data mechanism. Figma `5348:1151` supplies the exact six-state shell/action matrix.
- GEN1 `ContextFlowSurface` was re-read but its vertical order spine is explicit context order, not time truth; it is intentionally not reused as a fake Temporal producer.
- GEN1 `WorkflowSurface`/Spatial component mechanisms remain behavior/mechanics donors only; no second graph or store is copied.
