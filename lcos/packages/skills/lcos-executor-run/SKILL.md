---
name: lcos-executor-run
description: Claim and execute one dispatched LCOS Run through the lcos-executor MCP tools, handle waiting_input, and submit the result envelope back to Bridge. Use when a message begins with LCOS 接单提示 or when an executor session receives a dispatched run.
role: executor
version: 1.0.0
estimatedTokens: 650
readOrder: []
---

# LCOS Executor Run

## 何时用 / 何时不用

用：执行器会话收到 `LCOS 接单提示`，被看门狗拉起去认领一个已派发的 Run。
不用：普通项目对话、画布编辑、上下文管理——那些走 `lcos-project-context`。

## 最小流程

```text
收到 LCOS 接单提示（runId 已在提示里）
→ claim_lcos_run(runId, workerId=本会话 ID)
→ get_lcos_task(task_id) / get_lcos_run_context(runId) 读取冻结上下文
→ start_lcos_run(runId, workerId)
→ 只读 runtime-input-pack.json 与 outputRoot，执行任务
→ 长时间任务用 heartbeat 续租
→ submit_lcos_result 提交 review 结果；失败用 fail_lcos_run
```

## 执行工具（lcos-executor MCP）

```text
claim_lcos_run / start_lcos_run / heartbeat_lcos_run / fail_lcos_run
get_lcos_task / get_lcos_run_context / request_lcos_user_input / submit_lcos_result
```

禁止使用 local-creative-os 的管理面工具（画布、提案、导入等）。
取消任务由 Core/Agent 侧的 `cancel_lcos_run` 处理；执行器收到取消信号即停止。

## waiting_input

任务需要用户决定时，调用 `request_lcos_user_input`（question/options/allowFreeText），
然后**结束本回合**。任务会保留在同一会话；用户回答后同会话续跑，读取
`inputResponse` 后继续执行并提交。等待不会自动取消。

## 取消与迟到结果

- 收到取消（cancelled / 进程被终止）立即停止，结果不再提交；
- 取消后到达的结果只留审计，绝不允许变成 Draft；
- 不要自己无限轮询，只处理本回合派发的这一个 Run。

## 提交信封（submit_lcos_result）

```json
{
  "contractVersion": "bridge-result-v1",
  "taskId": "<task_id>",
  "lcosRunId": "<run_id>",
  "providerStatus": "review",
  "summary": "人话结果",
  "changedFiles": [],
  "warnings": [],
  "suggestedNextActions": ["review_analysis"]
}
```

## 硬规则

1. 只写 `TaskEnvelope.outputRoot` 内，绝不覆盖源文件；SHA-256 contentHash 必须带上。
2. 永不自动 Accept；结果只到 `review`，由用户决定使用/放弃/重试。
3. 不修改任何画布/上下文/提案状态。
4. 工具不可用时允许 REST/CLI 兜底，但必须在 Diagnostics 里如实标注，不得冒充 MCP 成功。
5. 会话轮换：本 Skill 设计为轻量执行面；不要让项目历史上下文混入执行回合。
6. 会话绑定只认 Core 返回的 provider session；Never guess the newest JSONL file
   or use an unrelated --last session as the binding。
