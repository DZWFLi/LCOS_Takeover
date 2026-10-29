# GEN2 R4 · Temporal MID 多目标 Selection + Camera Focus · 施工交付

## 任务摘要

Temporal Rail 的 MID group 不再只取第一个投影节点。一次点击会把该 group 的 canonical targets 解析为当前 Context 画布上的全部 nodeIds，经既有 Shell locate receipt 交给唯一 Huabu canvas consumer，完成一次 replace selection 与一次 group camera fit。未投影 target 保留可见的 partial 数量说明。

## 实际范围

- `TemporalGroupV1.targets[]` → 当前 `nodeEntityRefs` 的多目标解析、去重与缺失统计。
- `LcosLocateRequest` 最小增加 `nodeIds[]`；`nodeId` 继续作为单一 arrival cue 主目标。
- `LcosCanvasCommands` 过滤当前画布真实节点，调用 Huabu `selectNodes()` 与同一 camera owner。
- 多目标使用 Huabu reliable bounds 计算一次 viewport；不放大超过用户当前 zoom。
- 单目标仍走原 `focusNodesOnCanvas()`。

## 变更流程

```text
MID group targets[]
→ current Context ProjectionBinding/nodeEntityRefs
→ projected nodeIds[] + missing target count
→ Shell locate receipt（nodeId + nodeIds）
→ Huabu canvas store replace selection
→ Huabu reliable bounds → one setViewport
→ primary arrival cue + Temporal partial reason
```

## 修改文件

- `huabu/apps/web/src/lcos/surfaces/context/temporalTargetProjection.ts`
- `huabu/apps/web/src/lcos/surfaces/context/temporalTargetProjection.test.ts`
- `huabu/apps/web/src/lcos/surfaces/context/TemporalRail.tsx`
- `huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.tsx`
- `huabu/apps/web/src/lcos/shell/lcosShellStore.ts`
- `huabu/apps/web/src/lcos/navigation/LcosCanvasCommands.tsx`
- `huabu/apps/web/src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.ts`
- `huabu/apps/web/src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.test.ts`

## 测试与证据

- Vitest：3 files / 30 tests passed。
- Huabu web typecheck：passed。
- changed-file ESLint errors：0（仓内既有 `lcosShellStore.ts` non-null warning 未扩散）。
- production build：passed；仅既有 CSS `::highlight`、lottie eval 与 chunk size warnings。
- 真实浏览器路径：`http://127.0.0.1:5173/projects/lcos-gen2-dev/context?workspaceId=workspace-real-context`。
- 真实数据：MID group 6 个 canonical targets，其中 3 个 artifact 已投影、3 个 revision 未投影。
- 实际点击结果：三个 artifact 节点同时出现 selection outline；相机一次取景后仍为 99%（没有从 99% 放大）；Rail 显示“已定位 3/6 个时间目标；3 个尚未投影到当前 Context”。

## 六字段追踪

```text
READ_SOURCE:
- E:\TRAE项目\LCOS0.1收口\_cabin\04_R系列与T5规划\前端冲刺\LCOS_Gen2_T5_ContextWorkflow交互专项_前端施工正本_V3_20260910.md §8.3–8.8
- E:\TRAE项目\LCOS0.1收口\_cabin\04_R系列与T5规划\前端冲刺\LCOS_三视图交互合同_RhineDonor统一裁决_20260910.md §6–8
- E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T2\LCOS_Gen2_T2_C2-3A_Locator_CameraRequest_Arrival_ExactSourceBlueprint_20260907.md §6/§8–10

ADOPTED:
- huabu/.../focusNodesOnCanvas.ts getReliableNodeBounds/focusNodesOnCanvas
  → focusNodeGroupOnCanvas
  → LcosCanvasCommands production locate consumer
- Huabu canvasStore.selectNodes
  → LcosCanvasCommands multi-target replace selection

VISUAL_SOURCE:
- Figma 07 / Gen2 · 信息层级与细节 / 5156:3249 “时间轨定位一组对象”
- Figma 5388:25701 / 5392:6043 局部时间轨主面与规格板

RETIRED:
- TemporalRail.projectedNodeId() 只返回第一命中节点的 caller 行为。

VERIFIED:
- production action：Context child worksite → 点击真实 MID tick → 3-node selection + one camera fit + 3/6 partial reason。
- UNIT_PROVEN / WIRED / BROWSER_PROVEN。

UNRESOLVED:
- 本卡未扩展 Hover preview 的多目标临时高亮；Click 的 committed Selection/Camera 语义已闭合。
```

## 回滚

回滚本提交即可恢复单节点 locate receipt；无 schema、Core truth 或持久化迁移。
