# GEN2 ACP Existing-Session Analyze Run Target

日期：2026-09-20  
分支：`codex/acp-execution-target`  
基线：`8cde594`  
状态：`GEN2 WIRED / TARGETED TEST PROVEN / NO PUSH`

## 任务摘要

把用户在 Composer 中显式选择的 `receiverConversationId` 解析为一个冻结的 Huabu ACP existing-session execution target，并按固定顺序交给 Light Bridge：

```text
createTask
→ persist RuntimeBinding(runId, taskId)
→ POST /v1/tasks/{taskId}/execute
```

普通 Run 不调用 `/execute`。带 Receiver 的 `create/revise` fail-close；当前仅允许 `analyze`。

## READ_SOURCE

- `docs/handoffs/GEN2_WaitingInput_ProductionCaller_GAP_20260920.md`
- `apps/local-core/src/runtime-application-service.ts` / `RuntimeApplicationService.create|dispatch`
- `apps/local-core/src/runtime-adapter.ts` / `RuntimeAdapterService.dispatch|recover|materialize|bind`
- `apps/local-core/src/bridge-rest-client.ts` / `RestBridgeRuntimeClient`
- `apps/local-core/src/metadata-repository.ts` / Run receiver + continuation core bind + canonical conversation session
- `packages/contracts/src/conversation-continuation.ts` / `ContinuationExternalEvidenceV1`
- `packages/contracts/src/continuation-provider.ts` / provider receipt + evidence mapper
- `apps/local-core/src/huabu-agentlet-continuation-adapter.ts` / create/continue/recover receipts
- Bridge donor/peer repo `E:\OS开发\LCOS_LIGHT_BRIDGE_ACP_RUN_20260920` @ `e61b8b3`
  - `tools/light-bridge-kernel/src/lcos_bridge/canonical/models.py`
  - `tools/light-bridge-kernel/src/lcos_bridge/transport/http_api.py`
  - `tools/light-bridge-kernel/tests/test_huabu_acp_execution.py`

## 实际变更

1. `BridgeTaskEnvelopeV1.executionTarget?` 增加 `huabu-acp-existing-session-v1`。
2. provider receipt 的 `agentletId/runtimeScope` 经唯一 mapper 写入 `ContinuationExternalEvidenceV1`。
3. continuation core bind 把 provider/external/transport/thread/agentlet/runtimeScope 写入 canonical `ConversationSession.originMeta`。
4. Runtime 只沿：

```text
Run.receiverConversationId
→ ConnectedConversation.conversationSessionId
→ canonical ConversationSession.originMeta
→ executionTarget
```

   不按最近 operation、provider、标题、时间推断，也不把 `executorId` 当 `agentletId`、不把 `projectId` 临时当 `runtimeScope`。
5. project/provider/external identity/owner identity 任一缺失或不一致，在 `createTask` 前 fail-close。
6. Gen2 Bridge client 新增窄 `executeTask(taskId, runId)`，校验返回 Task/Run identity 和 execution status。
7. 首次 execute 超时或 503 后保留既有 RuntimeBinding。再次 dispatch 只重放同一个幂等 `/execute`，不创建第二个 Task；Bridge 决定 completed replay、scheduled replay 或 outcome_unknown 409。

## 两项关键证据

### 1. owner identity 全程 roundtrip

定点测试真实调用：

```text
HuabuAgentletContinuationAdapterV1.createSession receipt
  agentletId=machine-a
  runtimeScope=<projectId>
→ continuationExternalEvidenceFromReceiptV1
→ confirmContinuationCoreBind
→ ConversationSession.originMeta
  continuationAgentletId=machine-a
  continuationRuntimeScope=<projectId>
→ RuntimeAdapterService.resolveExecutionTarget
→ BridgeTaskEnvelopeV1.executionTarget
```

测试同时证明旧 canonical session 缺 `agentletId/runtimeScope` 时不会回退到 `ConnectedConversation.executorId/projectId`；它会在 Bridge create 前拒绝。已有 session 与新 provider receipt 的 owner 字段不一致也会拒绝。

### 2. execute 失败后复用同一 Task

定点测试结果：

```text
createCalls      = 1
executeCalls     = 2
executeTaskIds   = [task-one, task-one]
RuntimeBinding   = task-one（首次 execute 抛错后仍持久存在）
```

第二次 dispatch 不执行 `POST /v1/tasks`，只对同一 taskId 重放 Bridge 的幂等 execute endpoint。普通已有 binding 的 Run 仍为 `executeCalls=0`。

## 修改文件

- `packages/contracts/src/conversation-continuation.ts`
- `packages/contracts/src/continuation-provider.ts`
- `apps/local-core/src/huabu-agentlet-continuation-adapter.ts`
- `apps/local-core/src/conversation-continuation-service.ts`
- `apps/local-core/src/metadata-repository.ts`
- `apps/local-core/src/runtime-adapter.ts`
- `apps/local-core/src/bridge-rest-client.ts`
- `apps/local-core/src/index.ts`
- `apps/local-core/tests/runtime-adapter.test.ts`
- `apps/local-core/tests/bridge-rest-client.test.ts`
- `apps/local-core/tests/continuation-provider-contract.test.ts`
- `apps/local-core/tests/continuation-recovery-action.test.ts`

## VERIFIED

- contracts typecheck：PASS
- contracts tests：`47/47` PASS
- local-core typecheck：PASS
- local-core build：PASS
- targeted local-core tests：`76/76` PASS
  - runtime adapter
  - Bridge REST client
  - provider receipt/evidence
  - continuation recovery/core bind
  - continuation service
- changed-file lint：PASS（`metadata-repository.ts` 全文件仍有 2 条未触碰行的既有 warning）
- `git diff --check`：PASS

## 边界与未完成

- 本次没有启动真实 Huabu + Bridge + Core 三进程做整机调用；Gen2 caller 和 Light Bridge endpoint 已按双方 exact contract 对齐，整机 smoke 仍需在两边 commit 合并后执行。
- 旧 canonical session 没有 exact `continuationAgentletId/continuationRuntimeScope` 时保持不可作为 ACP Run target；不做猜测迁移。
- Huabu ACP target 暂只接 `analyze`，没有结构化 changedFiles 前不开放 `create/revise`。

## 回滚

revert 本提交即可；没有 schema migration，已有普通 Bridge Task 路径不变。

