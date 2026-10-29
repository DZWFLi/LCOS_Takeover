# GEN2 Wave 4 · Locator → Arrival 生产消费接通

日期：2026-09-19
范围：画外目标“在哪 → 抵达 → camera settle → 提示收口”
仓库：`E:\OS开发\LCOS_Gen2`
分支：`frontend-reconstruction-v2`
状态：代码已接入并通过定向静态/单元验证；真实 Locator→Arrival 动作因隔离 fixture 的 projection binding 缺失暂未完成浏览器证明。未 commit、未 push。

## 结论

现有 `LcosCanvasCommands` 现在消费唯一 Huabu camera owner 的 `setCenter` settled Promise：

```text
existing canonical nodeId
→ existing shell locateRequest
→ LcosCanvasCommands
→ focusNodesOnCanvas / Huabu RF setCenter
→ camera settled
→ target-local Arrival cue
→ 720ms transient close + consumeLocate
```

用户在 travel 中进行 pointer / wheel / touch 手势时，当前代被取消，旧 Arrival 不再落地。没有新增 navigator、store、event bus、camera owner 或 Core 坐标。

## 变更流程

Before：

```text
FocusWhere/Search
→ shell locateRequest
→ LcosCanvasCommands focusNodesOnCanvas（fire-and-forget）
→ 固定 900ms consumeLocate
```

After：

```text
FocusWhere/Search
→ shell locateRequest（Search 与 Where 仍分离）
→ LcosCanvasCommands
→ Huabu setCenter Promise
→ reducer camera-settled
→ target-local Arrival outline
→ reducer completion
→ consumeLocate
```

## READ_SOURCE

- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\04_逐Wave施工卡与验收.md`：Wave 4「Main + HUD + Railway + Navigator」、行为与退出条件。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\09_T1-T7现成轮子承接补丁卡.md`：T2-A04/T2-A05，Search/Focus 分离、唯一 Huabu camera、画外标记/arrival/safeRect/interrupt/reduced motion。
- `E:\TRAE项目\LCOS0.1收口\_cabin\02_施工卡\222\LCOS_Gen2_T2_C2-3A_Locator_CameraRequest_Arrival_ExactSourceBlueprint_20260907.md`：§1、§3、§16–§18、§25–§39、§47–§49、§55–§74。
- `E:\OS开发\LCOS_Gen2\docs\construction\GEN2_R1-R6_to_Wave3-10_ExecutionMap_20260919.md`：R2→Wave 4 与 R6 Locator/Arrival 完成定义。
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\src\lcos\navigation\LcosFocusWhere.tsx`：当前“在哪” production caller。
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\src\lcos\navigation\LcosCanvasCommands.tsx`：当前唯一 camera/locate consumer。
- `E:\OS开发\LCOS_Gen2\apps\web-gen2\src\interaction\{locatorState,arrivalState}.ts`、`spatial\{locatorGeometry,spatialFocusPort}.ts`：既有纯逻辑与端口。

## ADOPTED

| donor / symbol | target | production caller |
|---|---|---|
| `apps/web-gen2/src/interaction/locatorState.ts::reduceLocatorState` | `LcosCanvasCommands` canvas-local transient state | `LcosCanvasCommands` |
| `apps/web-gen2/src/interaction/arrivalState.ts::reduceArrivalState` | `LcosCanvasCommands` canvas-local transient state | `LcosCanvasCommands` |
| `apps/web-gen2/src/spatial/locatorGeometry.ts::computeLocatorGeometry` | existing `LcosLocatorCue` screen-space cue | `LcosCanvasCommands` |
| Huabu `focusNodesOnCanvas` / `ReactFlowInstance.setCenter` | helper now returns `Promise<boolean>` after camera settle | `LcosCanvasCommands` → unique Huabu RF camera |
| existing `LcosFocusWhere` `requestLocate({surface, canvasId, nodeId})` | unchanged request seam; no new identity path | `LcosFocusWhere` → shell store → `LcosCanvasCommands` |

## VISUAL_SOURCE

- Figma HUD `5388:27696`、Navigator `5384:367`、Locator/Arrival source frame `5164:831`，按原卡约束采用 screen-space edge cue + target-local arrival。
- reduced-motion 复用既有 `.lcos-static-pulse` CSS 降级：去除呼吸/位移，保留 outline/color 状态。

## RETIRED

- `LcosCanvasCommands` 原先固定 900ms `consumeLocate` 的 fire-and-forget 收口逻辑已由真实 `setCenter` settled 驱动取代。
- 未触碰旧 MiniMap/Controls；LCOS production route 继续保持其退役状态，Huabu dev mode 不变。

## 修改文件

- `huabu/apps/web/src/lcos/navigation/LcosCanvasCommands.tsx`
- `huabu/apps/web/src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.ts`
- `huabu/apps/web/src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.test.ts`
- 本 handoff

## 验证

- `npm run typecheck:web-gen2`：PASS。
- `npm run test:web-gen2`：325/325 PASS。
- `pnpm --filter @huabu/web typecheck`：PASS。
- `pnpm --filter @huabu/web exec eslint src/lcos/navigation/LcosCanvasCommands.tsx src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.ts src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.test.ts --report-unused-disable-directives --max-warnings 0`：PASS。
- `pnpm --filter @huabu/web exec vitest run src/components/Panels/CanvasLayerPanel/focusNodesOnCanvas.test.ts`：8/8 PASS。
- `pnpm --filter @huabu/web build`：PASS；仅保留既有 CSS `::highlight`、lottie eval 与大 chunk warning。
- 隔离真实 production route：`http://localhost:5273/projects/lcos-gen2-dev/main`；真实 Canvas/HUD/Camera 挂载，旧 Controls/MiniMap 缺位，节点实际加载，console error 为 0。证据截图：`C:\Users\1\AppData\Local\Temp\lcos-wave4-real.png`。

## UNRESOLVED

- 隔离 fixture 的 Search 返回 artifact `位置未知`，而当前页面的可见节点未形成可消费的 Core `ProjectionBinding`，因此本轮没有伪造“已抵达”证据。真实 Locator→Arrival 浏览器动作仍需一个带合法 binding 的 fixture/production project，再验证 edge cue → camera settle → target-local cue → consumeLocate。
- 既有 FocusWhere/Navigator 组件定向测试在当前 Vitest 调用方式下仍受仓库已有测试环境问题影响（`act`/router mock 与 `windowEnvironment` 缺失）；本轮未把该基线问题算到 Locator 代码通过里。
- Huabu 的真实 `onMoveEnd` 仍由 Canvas owner 持有；本轮通过既有 `setCenter` Promise 作为 settle seam，没有改 Canvas composition root。

## 回滚

逐文件 revert 本 handoff 对应的 3 个代码 diff即可；不动两份历史 patch，不需要迁移、数据回滚或 commit/push。
