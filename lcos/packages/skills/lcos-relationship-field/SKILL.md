---
name: lcos-relationship-field
description: "搭/改 Context 关系场组件（局部关系 Lens）、接 fcose 力导布局与 pinned 约束、按五种语义渲染边、查询/回写 relations 表时用本 skill 施工。"
---

# lcos-relationship-field：局部关系场施工契约

## 何时不用（反边界）

- 关系场是「局部关系观察 Lens」，不把 Graph 升格为 Context 本体（catalog `'relationship-field'` 描述原文）。
- 不自动猜测因果：绑定对象之间无真实关系时空态如实说「暂无真实关系」，禁止生成建议边。
- 不在本组件内做关系 CRUD 回写：改关系走 `lcos-active-path` 的边 inspector 契约（onCreate/Update/DeleteDomainRelation）；关系场只读呈现。
- 不做全项目大图：范围由 binding 圈定（局部）。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **组件**：`RelationshipFieldComponent`（`frontend-focus/src/features/spatial/components/ContextComponentRenderers.tsx` L321-352）。`viewIds = bindingGroups(element).viewIds`；`nodes = scopedNodes(viewIds, context)`（只按视图成员过滤，未绑定返回空、不回退全量冒充）；`edges = (context?.edges ?? []).filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))`——**两端都在绑定内才渲染**。
- **边语义**：`EDGE_KIND_LABELS`（CanvasEdge 契约固定五种）：`reference 引用 / generate 生成 / modify 修改 / feedback 反馈 / hierarchy 层级`；渲染优先 `edge.label`，kind 中文作 small 注解。
- **截断**：`RELATIONSHIP_ROW_LIMIT = 10`，超出走 `ExpandToggle`（「+N 项」/「收起」）；沉浸版（maximize）全量不截断。
- **catalog 契约**：surfaces `['context']`、minSize `{w:380,h:250}`、capabilities `{bind, lens, collapse, removeProjection}`、`createMode:'presentation'`。
- **relations 表图查询**（Core）：`frontend-focus/src/runtime/localCoreClient.ts` L413-415——`relations(projectId)` 列表、`saveRelation(projectId, relation)`、`deleteRelation(projectId, relationId)`（REST `/projects/:id/relations`）。画布侧查询：`ProjectCanvas.tsx` 的 `relationById` Map + `relationTargetAt(clientX, clientY)`（命中 `[data-relation-target]` / `[data-node-id]`）+ `beginRelation(from, event, point)`；局部展开模型 `buildLocalRelationNodes(nodes, edges, focusIds, hops: 1|2)`（`frontend-focus/src/features/presentation/relationGraphModel.ts`，BFS 环号 ring 0/1/2）；平行边几何 `relationCurvePath(start, end, parallelIndex, parallelCount)`（bend = centered×18 + min(34, length×0.08)）。
- **fcose 力导布局**：`frontend-focus/src/features/layout/fcoseLayoutAdapter.ts` + `cytoscapeFcoseDriver.ts`（headless Cytoscape + cytoscape-fcose，懒加载）。`fcoseOptions`：`randomize:false`（增量稳定）、`animate:false`、`fit:false`、`packComponents:false`、`nodeSeparation: max(68, gap*2.2)`、`idealEdgeLength: max(120, gap*4)`、**pinned 约束 `fixedNodeConstraint`**（节点中心坐标）。后处理 `removeLayoutOverlaps` + `routeLayoutEdges`。
- **pinned 状态**：`usePresentationDraftPinnedIds(projectId, scopeId, surface)`（`frontend-focus/src/state/presentationDraftState.ts`）；调用方（如 WorkflowSurface.previewLayout）传 `pinned: pinnedIds.includes(node.id)`。

## 施工标准（分步骤）

1. **展开关系场**：Context 面选中对象后从 Shelf 投放（或 SurfaceIntent 组织类操作）；binding `{projectViewIds}` 圈局部范围；minSize 380×250 以下会被 `validateSurfaceOps` 拒绝。
2. **列表渲染**：每行 `[from 标题按钮] [label span] [to 标题按钮]`，两端按钮调 `context?.onSelectNode?.(id)`；空态用 `UNBOUND_HINT` / 「绑定的对象之间暂无真实关系」。
3. **footer 如实计数**：`${edges.length} 条真实关系 · ${sourceNote(viewIds, otherIds)}`（视图引用与其他绑定分开计数，不混算）。
4. **fcose 布局调用**：构造 `LayoutRequest`（nodes 带 `pinned` 标志与当前 x/y/w/h，edges 只留两端都在集合内的边）→ `chooseLayoutStrategy`（无层级且 directedRatio<0.6 → `relational`）→ `layoutPreview(request, engines)`；`fixedNodeConstraint` 只装 pinned 节点，引擎返回后 pinned 节点坐标原样保留（`if (!center || node.pinned) return 原位`）。
5. **引擎失败兜底**：`layoutPreview` 的 try/catch 回退 `builtinLayout`——外部引擎是加速器不是依赖，离线必须可用。
6. **沉浸版**：`.lcos-context-maximize` 开 `SurfaceComponentImmersive`，全量关系列表（无截断、maxWidth 1080），关闭回卡内原状。

## 视觉词汇（复用，禁自带样式）

- 组件壳：`.lcos-context-component.lcos-context-relationship`、行容器 `.lcos-context-relationship-rows`、展开钮 `.lcos-context-expand`、空态 `.lcos-context-component-empty`。
- 关系曲线（画布侧）：`relationCurvePath` 产出的 Q 贝塞尔 + 平行边 bend；`--branch-color` 不用于关系边——关系边用 `--lcos-signal` 系。
- 布局预览复用 `.lcos-spatial-layout-preview`；token 全走 `--lcos-*`，z-index 只准 `var(--lcos-z-*)`。

## 验收（数值断言）

- 绑定 3 个对象、edges 里只有 1 条两端都在内 → 渲染行数 === 1（一端在外不计）。
- 12 条边时卡内渲染 10 行 + `ExpandToggle`（overflow=2）；展开后 12 行；沉浸版直接 12 行无 toggle。
- `buildLocalRelationNodes`：hops=1 时 ring ∈ {0,1}；hops=2 时 ring ≤ 2；无 focus 且无节点返回 `[]`。
- `relationCurvePath`：parallelCount=1 时 bend = min(34, len*0.08)*0.28；parallelIndex 居中（(n-1)/2）的边 bend 不含 18×centered 分量。
- `fcoseOptions`：gap=40 → `nodeSeparation===88`、`idealEdgeLength===160`；pinned 0 个节点时 `fixedNodeConstraint` 为空数组。
- 布局结果中 pinned 节点坐标与输入逐像素相等；`movedIds` 不含 pinned id。

## 已知边界（0.1 不做什么，不假装）

- 关系场不做卡内拖节点/改布局——位置属于画布与布局引擎；卡内是只读列表。
- 不做边语义编辑（改 kind 走 Workflow/主画布边 inspector + Core 契约）。
- fcose 的 compound（父子包含）图能力未接线：0.1 传平铺 nodes/edges，compound-force 参数预留不启用。
- 不做关系推荐/自动补边。
