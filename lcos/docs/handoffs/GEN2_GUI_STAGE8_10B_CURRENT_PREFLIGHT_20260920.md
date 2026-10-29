# GEN2 GUI Stage 8 / 10B current-head preflight

日期：2026-09-20
状态：PARTIAL（适配已落地；Context Atlas 已有真实浏览器证据，Workflow 手动场景受隔离 fixture 阻塞）

## 来源与基线

- donor：`89ac91ffd80ddc6fcfe2715e06dfcd57033ed07d`，父基线 `18ea880cbb8d831f0c7f0bdbed47eb2dfd418723`。
- 当前基线：`frontend-reconstruction-v2@cafae5b`。
- 隔离分支：`codex/gui-stage8-10b-preflight`。
- 主仓 `E:\OS开发\LCOS_GEN2` 未修改、未 push；其原有两个未跟踪 patch 保持不动。

## 三方 diff 与适用性

直接 merge donor tip 会把旧父线的大量回退一起带入当前主线，拒绝直接 merge/cherry-pick。按 donor 单提交自身的 27 个 GUI 文件做 3-way apply：25 个文件 clean，2 个文件冲突：

- `huabu/apps/web/src/lcos/ui/context/ContextCollectionView.tsx`
- `huabu/apps/web/src/lcos/ui/workflow/WorkflowTaskCardView.tsx`

冲突处理保留当前主线的生产 caller、激活/预览/进入动作与 selector，只迁移 donor 的 `ContextCollectionFace`、`WorkflowTaskCardFace`、Oreo controls 与相关视觉 CSS/SVG。Workflow 草稿“取用”语义按当前 caller 保留。

## Owner 审计

- Railway：当前 `cafae5b` owner 保留；donor 未触碰 Railway。
- LOD：当前 `NodeWrapper` / `useNodeLOD` 单一 owner 保留；donor 未触碰 LOD。
- Locator：当前 `locatorGeometry` / Arrival → Huabu camera owner 保留；donor 未触碰 Locator。
- Spatial Navigator：当前 Navigator → Canvas owner 保留；donor 未触碰 Navigator。
- Context Atlas：当前 Context stage/collection caller 保留，Face 层承接视觉。
- Workflow TaskCard：当前 card pool 的 preview/entry/canonical caller 保留，Face 层承接卡面。
- Composer：当前唯一 Composer host/submit owner 保留；donor 只改 nearfield presentation。

## 修改文件

仅涉及 donor 27 个 GUI 文件，新增 Context/Workflow Face、Atlas layout、Oreo controls token/CSS、controls test 和 SVG，更新 Context/Workflow/Composer/PreviewMedia 视觉组合。

## 验证

- `git diff --cached --check`：PASS。
- `pnpm --filter @huabu/web typecheck`：PASS。
- 定向 Vitest：PASS，10 files / 68 tests，覆盖 Controls、Context Atlas、Temporal window、Workflow pool/archive、Composer 与 Stage 6/7 presentation。
- `pnpm --filter @huabu/web build`：PASS；保留既有 CSS pseudo-element、chunk size、第三方 annotation/eval warnings。
- Context Atlas：真实浏览器打开成功，`data-atlas-open=true`，无 console/page error；截图：`E:\OS开发\LCOS_GEN2_GUI_STAGE8_10B_PREFLIGHT_20260920\.e2e-data\stage8-10b-context-atlas.png`。
- `wave6-context-portal.mjs`：现脚本仍直接查找已退役的外露“放大”按钮，而当前 Spatial Navigator 默认收起；该旧 selector 超时，不记为本 patch 通过。
- Workflow 手动场景：混合隔离栈中 `建立Workflow画布` 未发出 Canvas POST，无法生成本轮手牌截图；本 patch 未修改 `ensureCanvas` caller，故登记 fixture/runtime 阻塞，不把单元测试冒充真实动作证据。

## 未落地语义与风险

- 未移植 donor 父线中的 backend、Core contract、Railway、LOD、Locator、Navigator 或生产 owner 变更；这些属于旧基线回退风险。
- 未产生 schema、数据库、Core truth、Canvas truth 或新增 gate。
- 合并后需在统一当前主树隔离栈更新 `wave6-context-portal.mjs` 的 Spatial Navigator 打开动作，并补 Workflow Card / Composer 截图与真实动作证据。

## 回滚

回滚本次单一 commit 即可移除 Stage 8 / 10B 视觉适配；无 schema 或持久化迁移。
