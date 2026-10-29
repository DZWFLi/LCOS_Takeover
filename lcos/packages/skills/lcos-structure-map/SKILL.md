---
name: lcos-structure-map
description: "搭/改 Context 结构面（思维导图整页与结构岛组件）、接 fcose 布局、大纲树解析、键盘按视觉序导航时用本 skill 施工。"
---

# lcos-structure-map：结构岛与树渲染施工契约

## 何时不用（反边界）

- 结构是「阅读层级 Lens」不改写项目真相（结构卡 hint 原文「当前材料的阅读层级，不改写项目真相」）；`context.hierarchy` 是 Presentation 状态。
- 结构岛内部可重算，外框属于 Surface（catalog `'structure-map'` 描述原文）——组件内部布局自由，bounds 归 SurfaceElement 契约管。
- 不用 fcose 排导图：思维导图（mubu 式）走 `layoutMindMap` 专属布局；fcose 只服务关系场/主画布的网状布局（见 `lcos-relationship-field`）。
- 大纲文本是唯一真相（markmap 范式）：不建第二棵树数据结构，编辑文本即编辑导图。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **整页结构面**：`ContextTreeSurface.tsx`（`frontend-focus/src/features/surfaces/ContextTreeSurface.tsx`）。层级状态 `usePresentationHierarchyState(projectId, scopeId, 'context-hierarchy', seed, nodes)`，seed 来自 `buildHierarchySeed(props.nodes, props.edges)`（`features/presentation/presentationHierarchy.ts`）。布局 `layoutMindMap(props.nodes, state, WORLD_WIDTH=1320, WORLD_HEIGHT=820)`（`features/presentation/mindMapLayout.ts`）；连线 `mindMapEdgePath(from, to)`。重挂走 `reparentHierarchyNode` / `moveHierarchySubtreeAfter`，折叠 `toggleHierarchyCollapsed`，契约互转 `hierarchyToContract`（orderByParent）。
- **结构岛组件**：`StructureMapComponent`（`frontend-focus/src/features/spatial/components/ContextComponentRenderers.tsx` L125-200）。binding 取 `bindingGroups(element).viewIds`；层级优先用 `context.hierarchy`（`orderIds` 与绑定成员有交集才可用，否则退化平铺单层 depth 0）；卡内画布 `max(640, 实测宽) × max(400, 实测高)`（ResizeObserver），沉浸版固定 `STRUCTURE_IMMERSIVE_STAGE = {width:1320, height:820}`；缩放 `fitMindMapScale`（margin 8px、scale 上限 1、下限 0.02，transformOrigin 0 0）。
- **大纲树**：`frontend-focus/src/features/canvas/outlineTree.ts`——`parseOutline`（缩进 2/4 空格或 tab + `#` 标题层级共同定 depth）、`serializeOutline` round-trip、`outlineRows` / `outlineDepth` / `extractOutlineBranchText`（G-4 拖出分支，复制语义）、`parseOutlineLoose`（agent 输出容错降级为单行 roots）、`OUTLINE_HUES`（6 档低饱和分支色）+ `outlineHue`（tag/text 哈希确定色）。
- **fcose 引擎**：`frontend-focus/src/features/layout/fcoseLayoutAdapter.ts`——`fcoseOptions(request)`：`{name:'fcose', quality:'default', randomize:false, animate:false, fit:false, packComponents:false, nodeSeparation: max(68, gap*2.2), idealEdgeLength: max(120, gap*4), fixedNodeConstraint: pinned 节点中心}`；`createFcoseLayoutEngine(driver)`（driver = `cytoscapeFcoseDriver.ts`）输出前必过 `removeLayoutOverlaps` + `routeLayoutEdges`，并算 `componentCount` / `movedIds`。策略选择 `layoutService.chooseLayoutStrategy`；引擎经 `layoutEngines.loadPresentationLayoutEngines()` 动态加载，加载/执行失败回退 `builtinLayout`（离线可用红线）。
- **目录契约**：catalog `'structure-map'`——surfaces `['context']`、minSize `{w:360,h:240}`、capabilities `{bind, lens, collapse, removeProjection}`、`createMode:'presentation'`。

## 施工标准（分步骤）

1. **摆结构岛**：Context 面选中对象 → Shelf/AgentSurfaceComposer「拉出结构」（`SurfaceIntent kind:'show-structure'`，仅 context 面有效）；bounds 由 `placeSurfaceComponent` 避让既有元素；binding `{projectViewIds: ids}`。
2. **渲染树（保 Glaze 样式）**：节点用 `.lcos-mind-topic`（含 wrap `side-left/side-right` + `--branch-color`），根用 `.lcos-mind-map-root`，连线 `.lcos-mind-map-edges` path；分支色 `MINDMAP_BRANCH_COLORS[branch % 6]`——与整页 `COLORS` 同一数组，不得另造色板。depth-0 节点连线从 `rootCenter` 出发。
3. **卡内自适应**：容器挂 ResizeObserver，实测尺寸喂 `layoutMindMap` 与 `fitMindMapScale`；舞台 transform `translate(offsetX, offsetY) scale(scale)`，不改 transformOrigin。
4. **最大化**：`.lcos-context-maximize` 钮（Maximize2 图标）开 `SurfaceComponentImmersive`；沉浸版按 1320×820 重排（同一渲染函数 `renderStage`），关闭只卸载浮层、卡内 state 不变。
5. **fcose 调用**：需要网状整理时构造 `LayoutRequest {nodes(含 pinned), edges, gap}` → `chooseLayoutStrategy` → `layoutPreview(request, engines)`；pinned 节点必须带 `pinned: true` 才进 `fixedNodeConstraint`；结果先预览后应用。
6. **键盘导航（视觉序）**：`navigate(event, index)`（ContextTreeSurface.tsx L97-113）——ArrowUp/Down 沿 `layout.placements` 的渲染序 ±1；towardRoot/awayFromRoot 按 `item.side`：右侧（side>0）Left 向根、Right 离根，左侧相反；目标聚焦用 `document.querySelector('[data-mind-topic="…"]')?.focus()`。
7. **拖拽重挂**：drop zone before/inside/after 三态（`.lcos-mind-drop-zone` / `drop-inside` 等 class）；循环层级被拒并 toast「该操作会形成循环层级，已拒绝」。

## 视觉词汇（复用，禁自带样式）

- 整页：`.lcos-dedicated-surface.lcos-context-tree.lcos-mind-map`、舞台 `.lcos-mind-map-stage.lcos-presentation-spatial`、世界 `.lcos-mind-map-world`、hover 卡 `.lcos-surface-hover-card.lcos-mind-hover-card`。
- 结构岛：`.lcos-context-component.lcos-context-structure`、舞台 `.lcos-context-mindmap(-stage)`、空态 `.lcos-context-component-empty`（统一文案 `UNBOUND_HINT`）。
- 分支色走 `--branch-color` CSS 变量（六色数组），z-index 只用 `var(--lcos-z-*)`。

## 验收（数值断言）

- `parseOutline(serializeOutline(roots))` 深度与文本 round-trip 一致（outlineRows 行数不变）。
- `fitMindMapScale`：内容小于容器时 scale === 1；空布局返回 `{scale:1, offsetX:0, offsetY:0}`。
- `fcoseOptions`：gap=30 时 `nodeSeparation===68`（max(68,66)）、`idealEdgeLength===120`；pinned 2 个节点时 `fixedNodeConstraint.length===2`。
- 键盘导航：side>0 节点按 ArrowLeft 选中的是 `parentId` 对应节点（向根）。
- 绑定引用全部不在当前画布时渲染 Empty（「绑定引用未出现在当前画布」），footer 不显示对象计数。
- 结构岛 create op 低于 360×240 被 `validateSurfaceOps` 拒绝。

## 已知边界（0.1 不做什么，不假装）

- fcose 不支持层级树排序——树形层级走 layoutMindMap / elk（layered）。
- 结构岛不做卡内节点拖拽重挂（重挂只在整页 ContextTreeSurface）；卡内点击仅 onSelectNode/onOpenNode。
- 大纲拖出（extractOutlineBranchText）是复制语义，不做移动语义。
