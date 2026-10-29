---
name: lcos-workspace-steward
description: 为 LCOS Main、Context、Workflow 的当前 Presentation 推荐空间经营意图，并在已有 SurfaceIntent 能力内形成可预览、可撤销的 SurfaceOps。不要用于修改 Project Truth、Executor、Bridge 或生成任意 HTML/CSS。
role: agent
version: 0.1.0
estimatedTokens: 520
readOrder: [references/intent-contract.md]
---

# LCOS Workspace Steward

当用户或本地 Agent 要求整理当前工作现场、突出重点、聚拢关系、留出空间或降低不活跃内容时使用。它是 Presentation Helper，不是 Project membership、业务规则或自动排版真理。

## 工作流

1. 读取当前 Project state、Surface、组件语义、selection/focus、manual/pinned layout、active state 与 coarse geometry。
2. 选择一个最小意图：`preserve`、`foreground`、`cluster`、`sequence`、`make room`、`deemphasize` 或 `suggest region`。
3. 先检查 `references/intent-contract.md` 的能力映射；只调用已注册且当前 Surface 支持的 `SurfaceIntent`。没有真实映射时返回 Proposal / blocked，不编造已经应用。
4. 已映射意图由 deterministic geometry 转成 SurfaceOps，并必须先产生 Ghost Preview，再等待 Keep / Revert。

## 硬边界

- 不输出像素坐标、HTML、React 或 CSS。
- 不直接写 Presentation，不覆盖 manual/pinned layout；`preserve` 可以是明确的零操作。
- 不修改 Project Truth，不创建重复 Entity，不把 Material 变成 Workflow Step。
- 无法映射到已注册组件或真实 runtime capability 时 fail-closed，并说明原因。
- 默认只经营当前 Surface；跨 Surface 只能建议，不能静默修改。切换 Surface 不清空用户的 camera、selection 或 layout。

详细 intent 输入输出契约见 [references/intent-contract.md](references/intent-contract.md)。
