# GEN2 GUI Stage6 适配验收回执

日期：2026-09-20
状态：**PARTIAL（可移植，需保留一项真实生产接线缺口）**

## 基线与范围

- 目标基线：`de6bc84`（Stage4 family/caller 契约、Stage5 适配、Wave10 Composer/Conversation 链）
- 来源提交：`af82f41`（Stage6 runtime presentation）
- 处理位置：独立 worktree `E:\OS开发\LCOS_GEN2_STAGE6_ADAPT_FINAL_20260920`
- 主工作区：未修改；未 push。

## 冲突适配

1. `TemporalRailView.tsx`
   - 保留 Stage6 的原生 wheel、键盘 roving focus、preview 清理和空态 ref。
   - 将 `railRef` 统一为 `HTMLElement` callback ref，使空态 `<aside>` 与有数据 `<div>` 都能接同一监听生命周期。
   - 不回退 Stage5 的 TemporalRail ref 修复。
2. `WorkflowTaskCardView.tsx`
   - 保留 Stage4/Stage5 的草稿取用 caller 契约：`草稿中` 仍允许既有 `onUse`，不由 Card 自行创建 Run。
   - 采用 Stage6 的 `disabledReason` 展示；不可用时呈现真实原因。
   - Stage6 donor 测试原本把草稿取用断言为不存在，与已冻结 caller 契约冲突；测试已改为验证按钮保留且文案为“已加入草稿 · 未发送”。

## 验证

| 检查 | 结果 |
|---|---|
| 定向 Vitest | **8 files / 34 tests passed** |
| 改动面 ESLint（TS/TSX） | **PASS，0 errors/warnings** |
| `pnpm run typecheck` | **PASS** |
| `pnpm run build` | **PASS**；保留仓库既有 CSS highlight、lottie eval、chunk size warnings |
| `git diff --check` | **PASS** |
| CUA 浏览器 Context/Workflow/390 抽查 | **未执行：当前 CUA 浏览器清单不可用（inventory fetch failed）** |

本轮没有把 Stage6 handoff 中的离线 fixture / Playwright 组件证据冒充真实生产浏览器验收。Stage6 donor handoff 已记录其 77/77 离线组件检查，但它不能证明 Local Core、真实 registry、reload 或 Motion 生产链全部接通。

## 未关闭语义

- `TEMPORAL_GROUPING_PRODUCER` 仍没有生产时间分组事实源；本轮只接收 rail 的呈现和交互生命周期。
- `WORKFLOW_COLLECTION_PRODUCTION_CALLER` 仍由本地整合线绑定；本轮不新建第二 registry。
- Portal 的 open/zoom owner 未传入时继续不画假动作；本轮不伪造能力。
- 真实 Motion 帧、跨实例性能、深色主题及完整 Figma 九面验收仍待生产环境走查。

## 移植方式

当前适配提交完成后，从主线执行：

```bash
git cherry-pick <ADAPTED_STAGE6_COMMIT>
```

不要直接 cherry-pick 原始 `af82f41`，因为它会重新引入上面两处冲突及草稿 caller 回退。
