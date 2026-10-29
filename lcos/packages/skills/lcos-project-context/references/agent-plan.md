# 生成 Agent Plan

把用户自然语言转成 `AgentExecutionPlanV1`：

```json
{
  "schemaVersion": 1,
  "prompt": "用户原始要求",
  "intent": "create | revise | analyze",
  "requestedProvider": "codex | workbuddy | auto",
  "contextItems": [],
  "editTargets": [{ "artifactId": "...", "baseRevisionId": "..." }],
  "resultPolicy": { "type": "..." },
  "humanSummary": "将修改《脚本.md》，并参考另外 3 项内容。",
  "risks": [],
  "requiresConfirmation": false
}
```

先 `validate_lcos_agent_plan(projectId, plan)` 再建 Run。Core 不重新解释创意意图，
只拒绝非法或不安全组合。

## 意图判定

- 一个明确可编辑目标、且用户没说要“新节点”：`revise`
- 用户要新交付物或“新节点”：`create`
- 只要判断/总结/建议、无文件交付：`analyze`
- 多个同等目标 / 删除 / 覆盖 / 扩权 / 不可逆：`requiresConfirmation: true`，问一次

## 结果策略

- revise：`draft_revision_per_target`
- create：`create_artifact` 或 `create_collection`
- analyze：`reply_only`（除非用户明确要存成分析文件）

## 校验失败：只自动修复一次

仅限这些可逆的结构化条件：

```text
ACTIVE_CONTEXT_CONFLICT / STALE_GRAPH_VERSION
TARGET_NOT_FOUND / REVISION_NOT_FOUND / TARGET_REQUIRED / TARGET_FORBIDDEN
CONTEXT_ITEM_NOT_FOUND / PROVIDER_SESSION_STALE
```

流程：重读最新 ActiveContext → 用当前 ID/版本重建同一意图 → 再校验一次。

绝不静默修复：删除/覆盖/扩权、歧义同等目标、路径逃逸、未批准的可执行 Skill、
外部文件冲突。第二次仍失败 → 问一个直白问题或走 waiting_input，不要循环。
