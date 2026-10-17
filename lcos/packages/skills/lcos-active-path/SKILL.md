---
name: lcos-active-path
description: "搭/改 Workflow 面活动路径组件、边交互（临时边/项目关系边/条件边 label）、Delete 语义、运行态灯条与点阵 verb-flow 流动时用本 skill 施工。"
---

# lcos-active-path：活动路径与边交互施工契约

## 何时不用（反边界）

- 活动路径是「路径投影」不是执行引擎：灯条流向只表达顺序（catalog 描述原文「当前行动骨架的路径投影；灯条流向即执行顺序」）。
- 不旁路 Core 改 domain 关系：domain edge 的增删改必须走 `onCreateDomainRelation / onUpdateDomainRelation / onDeleteDomainRelation` 契约，禁止直接改本地边数组。
- 不做 edge 双选：`selectedEdge`（材料边）与 `selectedActionEdge`（步骤边）互斥，选中其一时另一方清空。
- 动画不进共享 rAF 时钟：点阵是纯 CSS animation（MatrixActivity.tsx 头注冻结）。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **活动路径组件**：`ActivePathComponent`（`frontend-focus/src/features/spatial/components/MainComponentRenderers.tsx` L78-96）。成员 = `boundNodes(element, context)`（binding.projectViewIds 过滤 context.nodes）；渲染 `members.slice(0, 8)`；信号 `resolveSpatialSignal({selected, semantic: presentation?.variant, runtime: members.length ? 'active' : 'idle'})`。
- **目录契约**：`surfaceComponentCatalog.ts` 的 `'active-path'`——surfaces `['workflow']`、minSize `{w:320,h:120}`、capabilities `{bind, collapse, removeProjection}`、`createMode:'presentation'`；由 `SurfaceIntent kind:'trace-active-path'` 经 `resolveSurfaceIntent` 产出 create-component op。
- **边数据**：`presentationEdges`（`usePresentationDraftEdges(..., 'workflow', props.edges)`）分两桶——domain（Core 真相）与 presentation（`scope==='presentation'` 或 id 前缀 `presentation:` 临时边）；`actionEdges` 在 `workflowActionState.edges`。边几何：材料边 `x1 = from.x + from.width, y1 = from.y + height/2 → x2 = to.x, y2 = to.y + height/2`；步骤边 `x1 = from.x + ACTION_WIDTH, y1 = from.y + ACTION_HEIGHT/2`。
- **domain 关系契约**：App.tsx L7020-7054——create 走 `saveRelation(projectId, relation)`（kind 缺省 `'reference'`，origin `'user'`，createdBy `'workflow-canvas'`）；update 先 `relations(projectId)` 列表再整对象回写；delete 走 `deleteRelation(projectId, relationId)`（`frontend-focus/src/runtime/localCoreClient.ts` L413-415）。
- **运行态覆盖**：`props.runOverlay {activeNodeIds, completedNodeIds, failedNodeIds}`（App.tsx L7055 由 activeRun 投影）；Step 信号优先级 failed > processing > complete > idle。

## 施工标准（分步骤）

1. **搭路径**：选中对象后经 `AgentSurfaceComposer` 的「连成活动路径」（`trace-active-path`）或从 Shelf 投放；组件绑定 `{projectViewIds: [...]}`，op 必须过 `validateSurfaceOps`。
2. **路径渲染**：每步 `<li style={{'--step-index': index}}>` 内 `LightSegment axis="horizontal" length={26} segments={4} mode={index === 0 ? 'checkpoint' : 'flow'}`——首步 checkpoint 常亮、后续 flow 流动即方向；点条目调 `context?.onSelectNode?.(node.id)`。
3. **边点击与 inspector**：材料边/步骤边 onClick stopPropagation 后置选中；inspector `.lcos-workflow-edge-inspector`（material-edge / action-edge 两态）。材料边 label：presentation 边可就地编辑（`updateSelectedEdgeLabel`）；domain 边编辑后必须「保存关系」（`saveDomainEdge` → onUpdateDomainRelation，label trim 非空才启用）。
4. **条件边带类型 label**：步骤边 inspector 输入「条件 / 分支 / handoff」，`updateActionEdgeLabel` 写入 `edges[].label`，渲染在中点 `<text x={m} y={(y1+y2)/2 - 9}>`；材料边 label 渲染 `y - 8`。
5. **Delete 覆盖**（WorkflowSurface.tsx L263-293 keydown）：
   - Delete + `selectedActionId`：删 Step 及其两端边（材料不动）；
   - Delete + `selectedEdge`：仅当 `edge.scope === 'presentation' || edge.id.startsWith('presentation:')` 才本地删临时边；**domain edge 不吃键盘 Delete**，必须走 inspector「删除项目关系」按钮（`deleteDomainEdge` → onDeleteDomainRelation → deleteRelation API），删后 `reloadRuntimeProject()`；
   - 焦点在 input/textarea 时 Delete 一律跳过。
6. **临时边升级**：「保存为项目关系」（`promoteSelectedEdge`）= onCreateDomainRelation(from, to, label || 'reference')，成功后本地临时边移除。
7. **运行态接线**：有 runOverlay 时材料节点加 `run-active / run-failed / run-completed` class；Step 用 `resolveSpatialSignal` 出 glyph + `GlythAvatar`。

## 视觉词汇（复用，禁自带样式）

- 路径卡：`.lcos-active-path-component`（is-selected）、步骤列 `.lcos-active-path-steps`（li `--step-index`）、空态 `.lcos-active-path-empty`。
- 灯条：`LightSegment mode="flow"`；点阵流动：`MatrixActivity verb="flow"` → `.lcos-matrix-activity.verb-flow i`（`animation: lcos-mx-flow 1.4s linear infinite; delay: calc(var(--matrix-index) * 110ms)`，spatial-components.css L456）；token `--lcos-matrix-dot`。
- 边：`.lcos-workflow-action-edge` / `.lcos-workflow-edge-group.material-relation`（`.active` / `.selected` / `.presentation`）；拖拽临时边 `.edge.temporary.workflow-link`。
- 运行态：`.run-active / .run-failed / .run-completed`；禁用态禁用 blur/新色，只用 `--lcos-signal-error` 表错误。

## 验收（数值断言）

- 8 个成员时渲染 li 恰好 8 个；9 个成员仍是 8（`slice(0, 8)`）且 header 计数如实显示 `members.length`。
- 首步 LightSegment `mode==='checkpoint'`，其余 `mode==='flow'`；reduced-motion 下两者均带 `is-reduced-motion`。
- 键盘 Delete 对 domain 边零效果（presentationEdges 不变）；对 presentation 边删除后该 id 不在数组中。
- `promoteSelectedEdge` 成功后临时边数量 -1 且 Core 侧 relation.kind 等于 trim 后 label 或 `'reference'`。
- `.verb-flow` 每个点 animation-delay = index × 110ms（css 变量 `--matrix-index` 驱动，不得内联改 delay）。
- validateSurfaceOps 对 minSize 低于 320×120 的 active-path create op 返回 `{ok:false}`。

## 已知边界（0.1 不做什么，不假装）

- 路径不驱动执行顺序——它只是投影；执行顺序由 Run 派发决定。
- 边不做曲线类型选择（固定三次贝塞尔）；不做边权重/条件求值。
- `--matrix-direction` 方向参数已留（MatrixActivity props），0.1 不做每边独立方向编辑。
