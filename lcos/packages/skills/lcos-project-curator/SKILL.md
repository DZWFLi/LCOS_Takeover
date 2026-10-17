---
name: lcos-project-curator
description: 把真实项目材料整理进 LCOS，并组织 Saved Context、Workflow 与 Presentation。触发：整理进 LCOS / 沉淀到 LCOS / 整理这张画布 / 做成上下文 / 做成工作流 / 整理本地项目文件 / 给下一轮继续。绝不创建 Managed Run；普通任务执行走 lcos-project-context。
role: agent
version: 2.1.0
estimatedTokens: 900
readOrder: ["skill.index.yaml"]
---

# LCOS Project Curator V2.1

## 何时用 / 何时不用

用：用户要整理、沉淀、归组、建立/修改 **Saved Context / Workflow / Presentation**，或从现有项目材料形成可复用项目现场。
不用：普通项目任务要分析/改文件/发 Run（`lcos-project-context`）；`LCOS 接单提示`（`lcos-executor-run`）；把方法炼成 Skill（`lcos-skill-author`）。

## Intent 路由

先读 `skill.index.yaml`，再用：

```text
lcos skill resolve lcos-project-curator --intent <intent> [--condition <name>...]
```

只加载 resolver 返回的 entry + modules；禁止无 intent 读完整包。

| 用户意图 | Intent |
|---|---|
| 整理这些对话 / 沉淀讨论 | `ingest_conversation` |
| 整理刚才收的 / Capture 批次 | `ingest_capture_batch` |
| 整理这张画布 / 归组重排 | `reorganize` |
| 根据当前 Selection 继续 / 为任务找材料 | `retrieve_for_task` |
| 把文档/文件补进现有项目 | `update_existing_project` |
| 把这些做成上下文 / 整理当前 Context | `context_build` / `context_edit` |
| 把这个 Context 做成工作流 / 调整流程 | `workflow_build` / `workflow_edit` |
| 按 Context 整理本地项目文件 | `filesystem_organize` |
| 给下一会话/Agent 继续 | `handoff_continue` |

## 通用流程

```text
preflight
→ resolve intent
→ Search before create
→ bounded read
→ capability gate
→ route action / proposal
→ verifier
→ lcos skill trace
```

## Hard Redlines

1. **Core 是事实与安全 owner。** 工具存在性按 `Contract → Core route → CLI/MCP → Skill → test` 判断；缺写能力就停在 Proposal/blocked，绝不编造命令。
2. **绝不创建 Managed Run。** Curator 只整理项目；要执行任务交给 `lcos-project-context`。
3. **Search before create：没搜过就建节点 = 违规。** 同内容优先更新/reuse；对话不逐条消息爆节点。
4. **同一 Entity 不因换 Surface 复制身份。** Saved Context / Workflow / Presentation 只组织同一批真实 Project Entity 与来源片段。
5. **Saved Context ≠ ActiveContext。** Curator 管长期项目现场；ActiveContext 是当前 Agent Task 的冻结上下文，不能用 Curator 偷改。
6. **广泛语义/空间修改要可审查。** reorganize 保留 pins；Presentation 移除 ≠ Artifact 删除；Artifact 删除必须单独确认。
7. **用户确认过的内容优先。** 不覆盖 manual/locked 标题，不把 Agent 推断冒充用户事实。
8. **文件整理不得直接 shell move/rename。** 没有 Local Core 正式文件整理能力时只能分析和出计划。
9. **每次都验证。** 未读回、未确认 provenance/identity/rollback 或对应 verifier 不通过，不宣布完成。
10. **控制系统税。** Route 只加载当前需要模块；LCOS-owned 非业务上下文 Hard Cap 5K tokens，真实业务证据另算；超预算必须说明为什么。

## 结束

记录 `route / loadedModules / cliCalls / createdIds / proposalIds / verifier / outcome / correctionRefs` 到 SkillTrace。Trace 属于 Learning Store，不是 Project Truth，也不自动改 Skill。
