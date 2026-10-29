# GEN2 `waiting_input` Production Caller 映射与 GAP

日期：2026-09-20

分支：`codex/waiting-input-prod-caller`

状态：`SOURCE_MAPPED / BLOCKED_BY_MISSING_EXECUTION_OWNER / NO SOURCE CHANGE`

## 结论

当前仓库不能诚实补出 `runCorrelation` 的 production caller。

原因不是少传了一个参数，而是正式源码里存在两条职责不同、刻意隔离的执行链：

```text
Run / Delegate
  RuntimeApplicationService.dispatch
  → RuntimeAdapterService.dispatch
  → RestBridgeRuntimeClient.createTask
  → POST Bridge /v1/tasks
  → RuntimeBinding(runId, externalTaskId, optional externalSessionId)

Conversation / Continue
  LcosComposerHost (intent=continue)
  → CoreCollaborationClient.send
  → POST /collaboration-send
  → ConversationContinuationService.sendPrompt
  → HuabuAgentletContinuationAdapterV1.send
  → HuabuAgentletHostTransportV1.sendPrompt
  → POST /api/acp/continuation/.../prompt
```

第一条拥有真实 `Run + externalTaskId`，但不调用 ACP prompt。第二条拥有 live ACP owner，但按产品契约明确不创建 Run，也没有真实 `externalTaskId`。把两条链在 Local Core 里用 ID 猜测粘起来，会把两个不同 provider side effect 错绑成同一个 Run。

因此本轮没有新增假 endpoint、没有把 `operationId` 冒充 `runId`、没有把 continuation prompt 冒充 Run dispatch，也没有提交代码。

## READ_SOURCE

- `README.md`
- `AGENTS.md`
- `docs/handoffs/GEN2_Provider_Agentlet_WaitingInput_Vertical_20260920.md`
- `packages/contracts/src/continuation-provider.ts`
- `packages/contracts/src/collaboration-contract.ts`
- `packages/contracts/src/receiver.ts`
- `packages/contracts/src/conversations.ts`
- `packages/contracts/src/conversation-identity.ts`
- `packages/domain/src/index.ts`
- `apps/local-core/src/runtime-application-service.ts`
- `apps/local-core/src/runtime-adapter.ts`
- `apps/local-core/src/bridge-rest-client.ts`
- `apps/local-core/src/runtime-result-ingestion.ts`
- `apps/local-core/src/conversation-continuation-service.ts`
- `apps/local-core/src/huabu-agentlet-continuation-adapter.ts`
- `apps/local-core/src/huabu-agentlet-host-transport.ts`
- `apps/local-core/src/routes/collaboration.ts`
- `apps/local-core/src/metadata-repository.ts`
- `huabu/apps/web/src/lcos/composer/composerSubmission.ts`
- `huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx`
- `huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts`
- `huabu/apps/server/src/modules/agent/acp/provider-run-event-sink.ts`
- `huabu/apps/server/src/modules/agent/acp/provider-run-input-registry.ts`
- `huabu/external/agenetes/packages/acp-driver/src/continuation-prompt.ts`

## Exact source census

### 1. Run 的正式 caller

| 层 | exact file / symbol | 事实 |
|---|---|---|
| Core application | `apps/local-core/src/runtime-application-service.ts` / `RuntimeApplicationService.dispatch()` | 只调用 `RuntimeAdapterService.dispatch(runId)` |
| Runtime adapter | `apps/local-core/src/runtime-adapter.ts` / `RuntimeAdapterService.dispatch()` | materialize input pack 后调用 `bridge.createTask()` |
| Bridge transport | `apps/local-core/src/bridge-rest-client.ts` / `RestBridgeRuntimeClient.createTask()` | 只向 loopback Bridge `POST /v1/tasks` |
| Canonical binding | `apps/local-core/src/runtime-adapter.ts` / `RuntimeAdapterService.bind()` | Bridge 回执后写 `RuntimeBinding.runId + externalTaskId + optional sessionId` |
| Run correlation consumer | `apps/local-core/src/runtime-result-ingestion.ts` / `ingestProviderEvent()` | 用 `lcosRunId + externalTaskId` 对已有 `RuntimeBinding` 做严格同一性校验 |

这里的 `externalTaskId` 属于 Bridge Task。当前 Gen2 仓库只有 Bridge REST client/proxy 和 fake fixture，没有执行该 task 并调用 Huabu ACP prompt 的 production Bridge executor/provider adapter。

### 2. ACP continuation 的正式 caller

| 层 | exact file / symbol | 事实 |
|---|---|---|
| UI split | `huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx` / `submit()` | `intent=continue` 走 collaboration send；普通 delegate 才创建 Run |
| UI contract | `huabu/apps/web/src/lcos/composer/composerSubmission.ts` | continuation input 只有 conversation / operation / message / text / refs；Run input 是另一种 payload |
| Core route | `apps/local-core/src/routes/collaboration.ts` / `handleCollaborationRoute()` | reserve conversation prompt 后调用 `ConversationContinuationService.sendPrompt()`；不创建 Run |
| T6 owner | `apps/local-core/src/conversation-continuation-service.ts` / `sendPrompt()` | 用 continuation journal 的 external evidence 发送到同一 provider session |
| T7 adapter | `apps/local-core/src/huabu-agentlet-continuation-adapter.ts` / `send()` | 调用 transport `sendPrompt()`，当前 `SendInputV1` 没有 Run correlation |
| Host transport | `apps/local-core/src/huabu-agentlet-host-transport.ts` / `sendPrompt()` | 已能序列化可选 `runCorrelation`，但正式上层从未提供 |
| ACP owner | `huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts` / prompt route | 只有 body 带 exact correlation 才注册 permission owner 并 forward provider event |

`packages/contracts/src/continuation-provider.ts` 的所有权说明进一步明确：Continuation Provider Adapter 只由 T6 `ConversationContinuationService` 调用；`RuntimeAdapterService` 和 Bridge generic `/v1/tasks` 不能绕过该 seam。

### 3. 现有身份为何不足以拼接

已有真实数据：

- Run 可持久化 `receiverConversationId`；
- ConnectedConversation 可链接 `conversationSessionId`；
- canonical ConversationSession `originMeta` 可保存 continuation external / transport / thread identity；
- continuation journal 可保存 `connectedConversationId + externalEvidence`；
- RuntimeBinding 可保存 `runId + Bridge externalTaskId + optional Bridge sessionId`。

缺失的关键关系：

```text
Run / Bridge Task
  ↛ continuationOperationId
  ↛ exact ACP owner used to execute this Run
```

同一个 ConnectedConversation 可以存在多条 continuation operation；`receiverConversationId` 只能说明用户选了哪个承接会话，不能证明哪条 operation、哪个 live ACP prompt 正在执行该 Run。Bridge 返回的 `sessionId` 也属于 Bridge task receipt，不能假定等于 ACP native session。

## 已确认的现有能力

以下能力本身成立，但当前只到 `CONTRACT / ROUTE / UNIT_PROVEN`，不能写成 production Run 闭环：

- Host prompt route 可同时接收 `contextAttachment` 与 `runCorrelation`；
- `promptExistingAcpSession()` 参数顺序保持 `contextAttachment, signal, permissionNotifier`；
- 有 correlation 时，permission request 可 forward 到 Core；
- Core `RuntimeResultIngestionService` 会校验同一 `Run + externalTaskId`；
- 普通 conversation continuation 未携带 correlation 时，不会伪造 Run event；
- Core 回答可通过 Huabu input-response route 命中原 suspended ACP request。

断口只有一个，但它是 owner 级断口：没有 production Run executor 调用 correlated ACP prompt。

## 最小真实下一刀

下一刀必须落在“真正执行 Bridge Task 的 executor/provider adapter”，而不是 Local Core 的 conversation route。

这个 owner 必须同时持有：

```text
lcosRunId
externalTaskId          # Bridge 创建的真实 task id
explicit ACP owner      # externalSessionId + transportSessionId + threadId
runtime input pack
```

然后由它在选择 Huabu ACP 作为该 Run 的执行 transport 时调用：

```text
POST /api/acp/continuation/.../prompt
body.runCorrelation = {
  lcosRunId,
  externalTaskId
}
```

所需最小合同补充不是“随便多传两个字符串”，而是一个显式 execution target/binding：

1. Composer/Run 创建必须明确声明“此 Run 在哪个 continuation owner 上执行”；普通 delegate 保持 Bridge 默认路径。
2. Core 把该显式 binding 随 Bridge Task 投递；不得按 provider、title、最近时间或 receiver 猜。
3. Bridge executor claim 该 task 后，使用 task 自己的真实 `taskId` 作为 `externalTaskId` 调 ACP prompt。
4. Bridge 与 Core 都校验 `task.lcosRunId === correlation.lcosRunId`，ACP event 回 Core 后继续复用现有 RuntimeBinding 校验。
5. continuation owner 不存在、session mismatch、task correlation mismatch 时 fail-close；不得回退为无 correlation prompt。

当前 Gen2 repo 内不存在步骤 3 的 production implementation，因此不能在本 worktree 完成这条纵切。需要提供/定位运行在 `127.0.0.1:43122` 的 Light Bridge 及其 executor/provider adapter 源码，或先正式决定由哪个现有 executor 承担 Huabu ACP Run transport。

## 为什么不在 Local Core 直接补

以下“捷径”都会制造错误真相：

- 在 collaboration send 里临时创建 Run：破坏“Continue 不创建 Run”的现有产品合同。
- 用 `continuationOperationId` 当 `runId` 或 `externalTaskId`：无法通过 RuntimeBinding 同一性校验，也不是 provider task identity。
- Run 创建 Bridge Task 后再由 Core 同时发 ACP prompt：Bridge executor仍可能 claim 同一 task，形成重复 provider side effect。
- 按 `receiverConversationId` 找最新 continuation op：同一会话多 operation 时会错绑，重启/并发下不可恢复。
- 仅给 `SendInputV1` 加 optional correlation：上层依然拿不到真实 Bridge Task owner，只会把测试参数搬到生产类型里。

## Verification

执行了全仓 production source census：

- `runCorrelation` 的唯一正式序列化点是 `HuabuAgentletHostTransportV1.sendPrompt()`；
- 唯一传入样本来自测试直接调用；
- `RuntimeApplicationService` / `RuntimeAdapterService` 不调用 continuation adapter；
- collaboration send 不创建 Run；
- 当前 repo 不包含 `POST /v1/tasks` 背后的 Light Bridge server/executor implementation。

本轮没有源码变更，因此没有伪造“production caller test PASS”。未运行与变更无关的全量测试。

## Files changed

- `docs/handoffs/GEN2_WaitingInput_ProductionCaller_GAP_20260920.md`

## Risk

- 现有 ACP waiting_input 下半链若继续被描述为“整机闭环”，会形成 F2：接口存在、route 测试存在，但 production caller 不存在。
- 直接在 Local Core 侧硬接会造成双重执行、错绑或无法恢复，风险高于保持当前诚实 GAP。

## Rollback

删除本 handoff 即可；没有 production code、schema 或 runtime 状态变化。

## UNRESOLVED

- Light Bridge `127.0.0.1:43122` 的 server/executor/provider adapter exact repo + commit 尚未提供。
- “普通 Bridge Run”与“在既有 ACP 会话中执行的 Run”是否为两个显式 execution target，尚缺正式产品/合同落点。
- 在上述 owner 确定前，ACP permission → Core waiting_input 只能标为 `UNIT_PROVEN / ROUTE_PROVEN`，不能标 `WIRED` 或 `PRODUCT_COMPLETE`。
