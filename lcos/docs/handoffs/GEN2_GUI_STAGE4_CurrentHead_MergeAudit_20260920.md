# GEN2 GUI Stage4 Current-HEAD 合并审计

## 结论

Stage4 donor commit `e908009` 可干净应用到 `frontend-reconstruction-v2@b77374e`。基线漂移 `45fde38 → b77374e` 只涉及 T7 Huabu server transport 与交接文档，和 Stage4 的 Huabu web 文件零重叠。

原 commit 有一个合并前阻断：新的 Collection / TaskCard / Portal presentation 绕过了 R1 共享族生产接线，并移除了当前 e2e 仍使用的 Atlas / Workflow identity selector。补丁已在隔离合并 worktree 修正：

- 新 presentation 保留 `data-lcos-family`、variant/organization/rendition；
- 恢复 `data-lcos-atlas-card` 与 `data-lcos-workflow-card` 兼容 selector；
- R1 wiring test 指向新的 production presentation caller；
- 新增 Stage4 presentation delegation tests，确认动作仍委托给原 caller。

## 语义核对

- Workflow 保留 task / material / receiver 三泳道。
- 取用仍写入 canonical draft 并打开统一 Composer。
- receiver 仍传 `receiverConversationId`；Conversation Work View 仍是 Run / Waiting / Review 的原 caller。
- Atlas 继续读取 Core warehouse；事情/时间字段缺失时明确显示“未指定”，未用 kind / updatedAt 伪造组织。
- 子现场进入、已有投影定位、Portal scene cache / viewport 均沿用原 owner。
- Temporal fisheye 只变换屏幕位置，不创建时间 truth。

## 验证

- `git cherry-pick e908009` on `b77374e`: PASS，零冲突。
- 定向 Vitest：6 files / 24 tests PASS。
- 目标 ESLint：PASS，0 error / 0 warning。
- Vite production build：PASS。
- `git diff --check`: PASS。
- 全量 `tsc --noEmit` 仍命中既有 `apps/web-gen2/src/integration/huabu/LcosCanvasAdapter.tsx` 的 React type resolution 问题；Stage4 目标文件无新增 TypeScript 错误。

## 并入顺序

1. cherry-pick `e908009`
2. cherry-pick 本审计补丁 commit
3. 重跑上述定向测试、ESLint、Vite build

## 回滚

按相反顺序 revert 两个 commit；无 Schema、Core truth 或持久化迁移。
