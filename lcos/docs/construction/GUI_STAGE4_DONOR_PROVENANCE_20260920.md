# STAGE4 donor provenance

- Temporal fisheye math: adapted from `d3/d3-plugins/fisheye/fisheye.js`, BSD-3-Clause, commit `12e043221743810510a3e95f46a1b723896accf6`.
- Context/Workflow host: existing Huabu `LcosWorksiteStage`, Canvas/camera/selection owners unchanged.
- Portal preview: existing Huabu `SpacePreviewViewport` + `spacePreviewSceneCache` remains the renderer/data mechanism exactly as Figma 5348:1151 requests.
- Context/Workflow presentation grammar: Figma 5388:24294 / 5388:22998 / 5333:96 / 5334:46 / 5335:110, with `motion/react` spring used only as presentation supplier.
- GEN1 references reviewed: `ContextHistoryRail`, `ContextFlowSurface`, `ContextSpaceSurface`, `WorkflowSurface`, `trackSegments`, `CenteredSpatialIndex`, `SpatialBeaconLayer`. No second canvas/store/runtime copied.
