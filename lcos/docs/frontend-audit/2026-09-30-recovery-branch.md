# LCOS Gen2 前端恢复分支说明

日期：2026-09-30
分支：`codex/gui-figma-recovery-20260926`

## 这条分支是什么

这条分支集中保存 Gen1 交互恢复、T1–T7 后续裁决适配、Figma 视觉落地，以及本轮源码级 UX/GUI 修复。它不代表已经合入 `main`，也不把“有组件”视为“功能已经闭环”。

## 本轮主要范围

- 主画布节点物种、远中近层级、Collection 与成员排布。
- Action Arc、框选/多选、Color Pin、浮游标、Railway 与空间导航。
- Drop 的预览、目标解析、提交回执与 Collection / Glyth / Composer / Portal 接入。
- Context Atlas、Temporal Rail、Workflow 手牌及跨现场回程。
- Glyth 会话、续工、持久上下文、等待输入和恢复反馈。
- Reader、Assembly、Archive、Professional Window、窗口拖拽与吸附。
- Local Core 中为 Collection 和会话上下文闭环所需的最小接口修复。

## 验证快照

- `huabu/apps/web`: TypeScript 类型检查通过。
- `apps/web-gen2`: TypeScript 类型检查通过。
- `apps/web-gen2`: 351 项测试通过，0 失败。
- Huabu 定向测试中 Context Atlas、Drop 与 Action Arc 相关测试通过；Professional Window 的单独 Vitest 调用受 monorepo alias 解析限制，需在正式 workspace 测试入口复跑。

## 设计与裁决归档

完整 T1–T7 原始裁决、HTML 原型、Donor 采用记录、Figma 设计回顾与本轮审计证据存放在私有仓库 `DZWFLi/LCOS-Frontend-Handoff` 的独立归档分支。外部 Donor 原始压缩包和第三方完整源码不进入本公开仓库；归档分支保存来源、采用位置、文件指纹和可公开状态。

## 当前仍需人工验收

- Railway 添加、排序、移除与重载的真实鼠标链。
- 六类 Drop Receiver 的统一高亮、取消、失败和成功反馈。
- Context / Workflow 根现场与完整 read model 的最终一致性。
- Run / Result 节点是否具有真实 producer，而非只存在 renderer。
- Glyth provider、等待输入、恢复与多模态持久上下文的整链。
- 窄屏、长文本、多节点拥挤、浮层碰撞和多窗口恢复。
