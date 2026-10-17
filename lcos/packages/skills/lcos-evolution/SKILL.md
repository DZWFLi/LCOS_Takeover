---
name: lcos-evolution
description: "搭/改 Context 演进面（Signal Track 段落带 + 演进时间带组件）、检查点灯段、历史回源 citation、接 conversation semantic index 数据源时用本 skill 施工。"
---

# lcos-evolution：演进面与时间带施工契约

## 何时不用（反边界）

- 纵向 spine 表达的是**显式 Context 顺序，不是时间**（ContextFlowSurface.tsx 头注原文「The vertical spine expresses explicit context order, not time」）；只有段时间锚与演进时间带才用真实 createdAt。
- 演进是 Context 级快照历史，不是项目时间线（catalog `'evolution'` 描述「理解顺序与变化的 Lens，不等于项目时间线」）。
- 不伪造精度：无 createdAt 的条目排带尾、时间全缺时按索引等距铺开；解析失败原样展示字符串。
- 不做对象级裁剪：Core 快照不携带对象级关联（objectIds 恒空），按绑定过滤会把真实历史滤光（2R 实测修，代码注释在案）。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **演进面（Signal Track）**：`frontend-focus/src/features/surfaces/ContextFlowSurface.tsx`。段落状态 `useContextTrackState(projectId, scopeId, mechanicalSeed)`（`state/presentationTrackState.ts`）；纯函数集在 `frontend-focus/src/context/trackSegments.ts`：`createSegmentsFromStrands / ensureTrackSegmentsCoverMembers / addTrackSegmentMembers / insertTrackSegment / mergeTrackSegments / removeTrackSegmentMember / reorderTrackSegment / splitTrackSegment / toggleTrackSegmentCollapsed / trackSegmentDensity`。自动收容段 id 集合 `AUTO_SHELTER_SEGMENT_IDS = {'segment:unassigned','segment:auto'}`——「未编排」只按用户编排段判定。几何常量：`WORLD_WIDTH=1480 / SPINE_X=188 / SEGMENT_X=226 / SEGMENT_WIDTH=232 / CHILD_X=510 / CHILD_WIDTH=190 / CHILD_HEIGHT=68 / CHILD_GAP_X=28 / CHILD_GAP_Y=22 / TOP=112 / SEGMENT_GAP=34`；`segmentHeight(count, collapsed)`：折叠 84，展开 `max(128, 58 + rows*(CHILD_HEIGHT+CHILD_GAP_Y))`，列数 `count>6?3:2`。
- **时间带组件**：`EvolutionComponent` + `EvolutionTimelineBody`（`frontend-focus/src/features/spatial/components/ContextComponentRenderers.tsx` L204-319）。数据 `history = context?.history`（`ContextHistoryEntry[]`，契约在 `features/surfaces/surfaceContracts.ts`）；标记上限 `EVOLUTION_MARK_LIMIT = 24`（超限按索引等距抽样、保留首尾）；布局：时间在 `[minTs, maxTs]` 线性分布，同比例组内铺开步长 `step = min(0.09, 1/(n-1))`。
- **密度灯段**：`DENSITY_LAMP_COUNT = 12`；`densityLampHeights(trackSegmentDensity(segment))` 把真实密度（1-12）映射点亮格数，`heights: 100 | 22`；density ≤0 返回空数组整段不渲染。
- **时间锚**：`segmentLatestCreatedAt(nodes)` 取段内成员**最新 createdAt**（CanvasNode 无 updatedAt，锚「最新创建时间」，无有效时间返回 null 不强造）。
- **citation 回源**：标记点 `onClick → context?.onOpenHistorySource?.(entry)`；hover 预览卡展示 `title / summary || label / createdAt（relativeTime 四档） / objectIds.length 个对象`；整页侧 `ContextHistoryRail` 提供 `onBranchHistory / onCompareHistory / onOpenHistorySource`。
- **conversation semantic index**：`frontend-focus/src/runtime/localCoreClient.ts` L1119-1120——`conversationSemanticStatus(projectId)` / `buildConversationSemanticIndex(projectId, {sessionId?})`（POST，timeout 120s，返回 `ConversationSemanticIndexStatusV1`）；消费方 `features/conversations/ConversationContextDialog.tsx`：`searchConversations(projectId, query, {semantic, limit:50})`，构建后轮询 status；索引不可用时降级文案「本地语义索引暂时不可用。全文搜索和原始时间线仍然可用」。
- **catalog 契约**：`'evolution'`——surfaces `['context']`、minSize `{w:380,h:190}`、capabilities `{bind, lens, collapse, removeProjection}`、`createMode:'presentation'`。

## 施工标准（分步骤）

1. **摆时间带**：演进卡渲染 `<EvolutionTimelineBody history context/>`；空历史用 Empty「该 Context 暂无快照——保存 Context 或建立现场后会出现在这里」；footer `${history.length} 条演进 · ${sourceNote(viewIds, otherIds)}`。
2. **标记点**：`sorted`（createdAt 升序、无时间排尾）→ 超限抽样 → `ratios`（组内防重叠铺开）→ `<button className="lcos-context-timeline-node" style={{left: ratio*100 + '%'}} aria-label={title}>`；当前条目加 `is-current`。
3. **hover 交互**：pointermove 测带宽（`bandRef`），半径 24px 吸附最近标记；命中弹 `motion.div.lcos-context-timeline-card`（`initial {y:6, opacity:0, scale:0.96} → animate {y:0, opacity:1, scale:1}`，`transition {duration:0.18, ease:'easeOut'}`，`AnimatePresence` 管理 exit）；卡水平位置夹回带内（cardHalf=116）。空带只出 `motion.span.lcos-context-timeline-hint`——有真实时间跨度时反解指针位置时间，否则最近条目标题。
4. **Signal Track 段落**：段卡 `.lcos-signal-segment`（draggable，dataTransfer `application/x-lcos-context-segment`）；折叠钮切换 `toggleTrackSegmentCollapsed`；上/下移 `reorderTrackSegment`；选中拆段 `splitTrackSegment`；合并 `mergeTrackSegments`；插入空隙 `.lcos-signal-insert-gap`「放到这里建立新段」；成员双列/三列网格 + 局部拖拽位置 `usePresentationDraftPositions(..., 'context-flow-local')`。
5. **未编排定位**：`focusUnassigned()` 复用 `onMarqueeSelect` 选中未编排项并 `fitSpatialBounds` 对准（padding 38、inset 84）。
6. **沉浸版**：`.lcos-context-maximize` 开 `SurfaceComponentImmersive`，同一渲染逻辑独立 hover 状态、拉满宽。
7. **semantic index 接线**：需要语义检索时先 `buildConversationSemanticIndex`（可选 sessionId）再轮询 `conversationSemanticStatus`；检索 `searchConversations(..., {semantic:true, limit:50})`；失败降级全文搜索，不阻塞时间线。

## 视觉词汇（复用，禁自带样式）

- 演进卡：`.lcos-context-component.lcos-context-evolution`、时间带 `.lcos-context-timeline`（base 线 `.lcos-context-timeline-base`、标记 `.lcos-context-timeline-node`、卡 `.lcos-context-timeline-card`、提示 `.lcos-context-timeline-hint`、meta `.lcos-context-timeline-meta`）。
- Signal Track：`.lcos-signal-segment / -main / -order / -copy / -wave / -tools / -grip`、spine `.lcos-signal-spine`、支线 `.lcos-signal-spur`、成员 `.lcos-signal-member`、空隙 `.lcos-signal-insert-gap`。
- 动效只用 motion/react 现有入场参数与 CSS `--lcos-*` token；reduced-motion 全量尊重（`useReducedSpatialMotion`）。

## 验收（数值断言）

- 25 条历史渲染标记 24 个（EVOLUTION_MARK_LIMIT 抽样且含首尾）；24 条以内渲染全量。
- `densityLampHeights(5)` → 前 5 格 height 100%、其余 22%；`densityLampHeights(0)` → `[]`（整段无 wave）。
- `segmentHeight(7, false)`：columns=3、rows=3、height=58+3×90=328；`segmentHeight(any, true)` === 84。
- hover 距最近标记 24px 内命中，≥25px 视为空带只出 hint。
- 时间带动画 duration === 0.18s（motion transition 常量，不得内联改值）。
- semantic index 构建调用 timeout === 120_000ms；搜索 limit === 50。

## 已知边界（0.1 不做什么，不假装）

- 未接 `useScroll` 滚动联动动画（motion 仅用于 hover 卡入场/退出）；滚动驱动的演进回放留后续。
- 快照不做对象级关联过滤（Core objectIds 恒空）；条目级 diff 视图不做。
- semantic index 只服务会话检索，不直接驱动演进面渲染；本地索引不可用时静默降级，不重试刷屏。
- 段落顺序 ≠ 时间顺序：重排是用户编排语义。
