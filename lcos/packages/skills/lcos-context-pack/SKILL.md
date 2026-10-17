---
name: lcos-context-pack
description: "搭/改 Context Pack（打包阅读范围）组件、块级 citation（chunkAnchor）链路、Saved Context 复用与上下文预算显示时用本 skill 施工。"
---

# lcos-context-pack：Context Pack 施工契约

## 何时不用（反边界）

- Pack 是「把当前选择准备成可读范围」，**不复制 Project Truth**（catalog `'context-pack'` 描述原文；组件 footer 同句硬编码）。
- 不做打包内容的副本存储：成员只存 viewId 引用；`scopedNodes` 未绑定时返回空列表，禁止回退全量节点冒充内容。
- 块级 citation 只在真实命中（chunkAnchor 有值）时显示，不得给文档级命中编造块锚点。
- 不在 Pack 内做检索执行——搜索入口在 `ProjectToolsDialog` / 项目工具链。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **组件**：`ContextPackComponent`（`frontend-focus/src/features/spatial/components/ContextComponentRenderers.tsx` L354-378）。`viewIds = bindingGroups(element).viewIds`；`nodes = scopedNodes(viewIds, context)`；折叠上限 `PACK_ITEM_LIMIT = 9`（`expanded` 状态 + `ExpandToggle`）；沉浸版 `renderBody(true)` 全量、`gridTemplateColumns: repeat(auto-fill, minmax(240px, 1fr))`。
- **来源数量**：`sourceNote(viewIds, otherIds)` = `` `${viewIds.length} 个视图引用` ``（有其他绑定时追加 `` ` · ${otherIds.length} 项其他绑定` ``）；footer 恒带「不复制 Project Truth」。
- **catalog 契约**：surfaces `['context']`、minSize `{w:320,h:180}`、**`requiresSelection: true`**（唯一要求先有 Selection 的组件）、capabilities `{bind, collapse, removeProjection}`、`createMode:'presentation'`。
- **块级 citation**：`frontend-focus/src/features/project/ProjectToolsDialog.tsx`——`SearchHitV0.chunkAnchor / chunkIndex / chunkCount`（契约在 `frontend-focus/packages/contracts/src/search.ts`，语义同 `ContextManifestOrderedItemV0.sourceAnchor`）；锚点形态 `'section:风险' / 'pdf:p3' / 'pdf:p3-p5' / 'chunk:2-4'`；`formatChunkAnchorLabel` 翻译成「§ XXX / 第 N 页 / 第 A-B 页」；徽标 `.lcos-search-chunk-badge`（`data-chunk-anchor`）。
- **快照/预算显示**：`ProjectToolsDialog.tsx` L246 项目连续性卡——`continuity.attentionRuntime.contextPack.items.length` 项 / 约 `estimatedTokens` tokens / `skillTarget.sideEffect`（READ_ONLY=只读判断、PREPARE=准备动作、其余=涉及修改）；数据源 `ContinuityResumeSnapshotV1`（contracts）。
- **Saved Context 复用**：`frontend-focus/src/App.tsx` L5200——`savedContextIdForRun = activeContextId && ['context-space','context-tree','context-flow','outline'].includes(activeSurface) ? activeContextId : undefined`；L5242 把 `savedContextId` 并入 Run 发起参数（同一份 Saved Context 直接作为 Run 上下文，不二次打包）。相关：`openSavedContextLens(contextId, 'space'|'structure'|'evolution')`（L2892）、`savedContextViews`（L2150，scopes 投影）、`addMembersToSavedContext(contextId, sourceIds)`（L3601）。

## 施工标准（分步骤）

1. **摆 Pack**：Context 面**先选中对象**再投放（`requiresSelection: true`；无选中时 Shelf 不给建）；binding `{projectViewIds}`；低于 320×180 的 create op 被 `validateSurfaceOps` 拒绝。
2. **折叠/展开**：卡内两列网格、默认渲染 9 项；overflow > 0 时行尾 `ExpandToggle`（「+N 项」↔「收起」）；展开后卡内 overflow 滚动，不撑破 bounds。
3. **成员渲染**：每项 button（`onClick → context?.onSelectNode?.(id)`，`onDoubleClick → context?.onOpenNode?.(id)`）；文案 `title` + `subtitle || fileType || '项目对象'`。
4. **footer**：绑定态 `${sourceNote(viewIds, otherIds)} · 不复制 Project Truth`；未绑定「未绑定——拖入对象后再打包」；绑定引用不在画布「绑定的引用未出现在当前画布，无法打包阅读范围」。
5. **block citation 链**：搜索命中渲染 `<span className="lcos-search-chunk-badge" data-chunk-anchor={result.chunkAnchor}>`，文案 `formatChunkAnchorLabel(anchor)` + 有 chunkIndex/chunkCount 时追加 `` ` · 块级 ${chunkIndex+1}/${chunkCount}` ``；点击定位成功/失败提示都带锚点文案；无可定位 View 时提示「已找到…的块级命中…但该文档没有可定位的画布 View」。
6. **Saved Context 复用**：从 Pack 发起 Run 时透传 `savedContextId`（四个 context 类 surface 之一激活时取 activeContextId）；新增成员走 `addMembersToSavedContext`，不新建平行容器。
7. **预算显示**：连续性/预算数字一律取 `attentionRuntime.contextPack` 实测值（items.length / estimatedTokens），不自行估算。

## 视觉词汇（复用，禁自带样式）

- 组件壳：`.lcos-context-component.lcos-context-pack`、列表 `.lcos-context-pack-items`、展开钮 `.lcos-context-expand`、空态 `.lcos-context-component-empty`、最大化钮 `.lcos-context-maximize`。
- citation 徽标：`.lcos-search-chunk-badge`（含 `data-chunk-anchor` 属性钩子）。
- 预算/连续性卡：`.project-session-card`；token 全走 `--lcos-*`，z-index 只准 `var(--lcos-z-*)`。

## 验收（数值断言）

- 12 个成员：默认渲染 9 项 + ExpandToggle「+3 项」；展开 12 项；沉浸版 12 项且无 toggle。
- footer 绑定态必含字符串「不复制 Project Truth」；`sourceNote([v1,v2], [])` === `'2 个视图引用'`。
- 无绑定 + 画布有节点 → 渲染 Empty（UNBOUND_HINT），items 为空。
- chunkAnchor `'pdf:p3-p5'` 的徽标文案含「第 3-5 页」；chunkIndex=2/chunkCount=4 显示「块级 3/4」。
- Run 发起时：激活 surface ∈ 四个 context 面且 activeContextId 非空 → 请求体含 `savedContextId`，否则该字段缺席（undefined 不序列化）。
- 低于 minSize（320×180）的 Pack create op 校验 `{ok:false}`。

## 已知边界（0.1 不做什么，不假装）

- Pack 不做内容快照持久化（「快照」显示的是 attentionRuntime 的实测预算，不是 Pack 自存副本）。
- 块级锚点只到「定位提示 + 徽标」粒度，不做块内高亮滚动（等 artifact revision/锚点 API）。
- token 预算不做逐项 breakdown 与手动裁剪；`estimatedTokens` 只读展示。
- 不做跨项目 Pack 复用。
