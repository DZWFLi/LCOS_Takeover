---
name: lcos-project-context
description: Read one LCOS Project + ActiveContext, turn the user's natural-language task into AgentExecutionPlanV1, and execute through Local Core/Light Bridge without bypassing Draft Review. Use for ordinary project task sessions; project curation/Saved Context/Workflow organization uses lcos-project-curator, executor turns use lcos-executor-run.
role: agent
version: 1.1.0
estimatedTokens: 760
readOrder: ["references/agent-plan.md", "references/context-changes.md"]
---

# LCOS Project Context

## 何时用 / 何时不用

用：普通 Agent 会话里用户要基于 LCOS 项目材料分析、修改、创建交付物或发正式 Run。
不用：项目整理 / Saved Context / Workflow / Presentation 组织走 `lcos-project-curator`；消息以 `LCOS 接单提示` 开头走 `lcos-executor-run`。

## 最小流程

```text
1. bind_lcos_project(projectId, workspaceId?)
2. get_lcos_active_context(projectId, workspaceId?)
   用户还在动时，每回合 watch_lcos_active_context(afterVersion) 一次
3. 只读任务需要的 Artifact/Revision 内容
4. 生成 AgentExecutionPlanV1（references/agent-plan.md）
5. validate_lcos_agent_plan(projectId, plan)
   结构化错误按 references/structured-error-repair.md 自动修复一次
6. create_lcos_run → dispatch_lcos_run → 等待 Review
   结果由用户 Accept/Reject/Retry，绝不自动 Accept
```

## 章节目录

| 章节 | 文件 | 什么时候读 |
|---|---|---|
| 所有权边界 | references/ownership-boundaries.md | 任何变更前确认“谁拥有什么” |
| Saved Context 边界 | references/saved-context-boundary.md | 当前任务来自 Main/Context/Workflow Selection 时 |
| 读画布上下文 | references/visual-context.md | 解读选择/视口/节点/预览时 |
| 生成 Agent Plan | references/agent-plan.md | 每次发 Run 前（必读） |
| 画布产出规范 | references/canvas-output.md | Run 结果要落成画布节点时（必读） |
| 上下文指令 | references/context-changes.md | 用户说“把X加进参考 / 别参考X”时 |
| 结构化错误修复 | references/structured-error-repair.md | validate 失败时 |
| waiting_input | references/waiting-input.md | 任务需要用户回答时 |
| 对话导入/检索 | references/conversation-import.md | 导入或搜索历史对话时 |
| 最近导入批次 | references/import-batches.md | 用户说“刚导入这一批/刚导入的文件”时 |
| Obsidian | references/obsidian.md | 用户要求连接 Obsidian 时 |
| 结果生命周期/输出安全 | references/output-and-lifecycle.md | 提交/接受/回滚相关 |

## 硬规则

1. Core 是唯一事实源；Web/CLI/MCP 只是适配器，绝不直接写 SQLite。
2. Accept 是唯一改变 Current 的路径；AI 结果在确认前永远是 Draft/Pending。
3. 只写 outputRoot；不覆盖源文件；取消后迟到结果只留审计。
4. 自然语言只用来理解意图，不重写契约；意图/目标/参考由 Agent Plan 显式表达。
5. ActiveContext 命令基于最新 version CAS；冲突时重读一次重建，不猜 stale ID。
6. **Saved Context ≠ ActiveContext。** Saved Context 是长期项目工作现场；ActiveContext/ContextManifest 是本次任务冻结输入。本 Skill 不负责重排 Saved Context。
7. 用户指代“刚导入这一批”时，必须通过持久化 ImportBatchRef 解析，不得按文件时间戳或画布位置猜。
8. 工具不存在就说不可用，不发明工作流；Mock/Fixture 必须如实标注。
9. 执行器回合（接单提示）不读本 Skill。
