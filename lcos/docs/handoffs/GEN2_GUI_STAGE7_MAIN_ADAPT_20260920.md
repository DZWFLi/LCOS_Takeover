# LCOS Gen2 · GUI Stage7 主线语义适配交付

日期：2026-09-20

状态：可 cherry-pick；未 push

主线父提交：`7ff59317f3d63bdf972488c582f85597b87a7ea8`

Stage7 来源：`18ea880cbb8d831f0c7f0bdbed47eb2dfd418723`（对应 GUI 线 `ef407e2`）

## 结果

Stage7 的 curtain、persistent presence、Workflow 搜索、Temporal width-profile 与 focus pose 已适配到当前主线。没有回退或重建主线已有的 Temporal canonical producer/binding subscription、Workflow canonical archive producer/drop caller、Portal caller、navigation owner。

## 唯一冲突与处理

`ContextCollectionView.tsx` 同时出现：

- 主线新增的 `legacyAtlasKind`、`data-lcos-family`、`data-lcos-rendition`、`data-lcos-variant`；
- Stage7 新增的 `onActivate`、`activationLabel`、统一 presentation motion。

最终保留两组合同。集合整块激活只调用现有 owner callback；没有新增导航 store 或猜测目标。其余 25 个文件由 Git 自动合并后逐项核对。

## 保留的主线边界

- `ContextWorksite` 继续把 `projectId + activeWorkspaceId` 交给现有 `TemporalRail` producer；
- `ContextAtlasStage` 继续按真实 `workspaceTargetsForItem` 与 `onEnterSurface(item, target)` 导航；
- `WorkflowCardPool` 继续从真实 Assembly/Skill producer 取卡，并调用既有草稿取用动作；
- `WorkflowTaskCardView` 保留主线 legacy selector 与当前可达状态；
- Portal、Canvas、Selection、Pointer、safeRect、LOD、Core identity 均未改 owner。

## 验证

- changed TS/TSX ESLint：通过，`--max-warnings 0`；
- `pnpm --filter @huabu/web typecheck`：通过；
- `pnpm --filter @huabu/web build`：通过；仅既有 `::highlight`、第三方 lottie `eval` 与大 chunk warning；
- 纯逻辑/源码合同：7 files / 35 tests passed；
- 另跑 2 个 DOM 文件时，隔离 worktree 复用主仓 `node_modules` junction 导致 React 与 renderer 从不同 realpath 装载，出现仓内已知 `Invalid hook call`；这 2 个文件不登记为通过，也没有修改生产代码迁就测试环境；
- 使用 Codex in-app browser 加载真实 React + `motion/react` + shipped Stage7 Views：
  - Atlas 光幕实际显示 6 个 248×244 集合体块，事情/时间图标与整块激活按钮均可见；
  - Workflow Hand 切到 24 张卡后进入可滚动网格卡池；
  - Temporal Rail 实际显示固定纵向节距；
  - 验证 fixture 明确标注“测试数据，不是生产工作现场”，没有冒充 Core 数据。

## 未声称完成

- 没有把 fixture 浏览器回归写成生产 Core/Canvas 整机 E2E；
- 没有补造 Temporal producer、Workflow producer、Portal owner；这些已由当前主线持有；
- 原 HTML 全量逐项对照、真实 provider 返回与整机 reload 仍由后续纵向验收负责。

## 回滚

单独 revert 本交付 commit 即可；不含 schema、Core 数据或外部状态迁移。
