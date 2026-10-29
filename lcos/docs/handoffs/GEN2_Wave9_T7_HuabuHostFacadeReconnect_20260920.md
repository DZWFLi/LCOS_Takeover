# GEN2 Wave 9 T7｜Huabu Host continuation facade reconnect

日期：2026-09-20
基线：`frontend-reconstruction-v2@45fde38`
范围：vendored Huabu Host facade；已本地提交，未 push。
状态：`SOURCE_AVAILABLE → CONTRACT → UNIT_PROVEN → WIRED → REAL_DAEMON_INTEGRATION`；真实 Host + bundled daemon + ACP fixture 已通过。

## 结论

已把 Huabu donor `E:\OS开发\Huabu@92844d2` 的 T7 continuation Host facade 适配回当前 vendored Huabu。Local Core 现有 `HuabuAgentletHostTransportV1` 请求的四个 HTTP 动作可以落到 Huabu 已挂载的同一个 `AgentletGateway`：

```text
Local Core Host HTTP
  → /api/acp/continuation/agentlets/:agentletId/sessions[/:sessionId]
  → Huabu continuationTransportRoutes
  → getAgentletGateway()（mountAgenetes 已挂载的唯一实例）
  → listOnAgentlet / spawnOnAgentlet / getSession / stopOnAgentlet
  → 既有 agentlet WebSocket / session registry
```

没有新增第二 Gateway、第二 WebSocket、第二 session store，也没有把 `sendResource` 冒充成 prompt/send。

## 变更前后

变更前：

```text
Local Core huabu-agentlet-host-transport
  → /api/acp/continuation/...
  → vendored Huabu 无 continuation route / 无注册
  → 404 / facade 缺失
```

变更后：

```text
Local Core
  → registered Huabu HTTP facade
  → mounted AgentletGateway
  → existing ACP agentlet transport owner
```

用户可见变化：T7 continuation 的 spawn/list/status/stop 已具备 Huabu Host HTTP 入口；本文件末尾记录的增量又接通了 canonical ACP owner 上的 prompt send。产品 UI caller 仍未落地，因此当前变化尚未形成前端可见的完整对话闭环。不改变 Canvas、Conversation 或 Run truth。

## 三方审查与采用

| 来源 / 契约 | 结论 |
|---|---|
| donor `E:\OS开发\Huabu@92844d2`：`apps/server/src/app.ts`、`modules/agent/acp/index.ts`、`continuation-transport.route.ts`、`continuation-transport.route.test.ts` | exact route shape、结构化错误、四个 gateway 委托和测试基线 |
| vendored Huabu：`huabu/apps/server/src/app.ts` | `mountAgenetes(app, ...)` 已返回唯一 gateway；仅补 import 与 `/api/acp` 注册 |
| vendored Huabu：`huabu/external/agenetes/packages/agentlet-host/src/gateway-mount.ts`、`agentlet-gateway/src/gateway.ts` | `getAgentletGateway()`、`getAgentlet`、`listOnAgentlet`、`spawnOnAgentlet`、`getSession`、`stopOnAgentlet` API 与 donor 一致 |
| Local Core：`apps/local-core/src/huabu-agentlet-host-transport.ts` + 既有 contract tests | 路径、payload、Bearer、404 lookup miss、timeout 与结构化 HTTP error 对齐 |

## 实际文件与符号

- `huabu/apps/server/src/app.ts`
  - 导入并注册 `acpContinuationTransportRoutes`，prefix=`/api/acp`。
- `huabu/apps/server/src/modules/agent/acp/index.ts`
  - 导出 `acpContinuationTransportRoutes`。
- `huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts`
  - `connectedGateway()`：只读取已挂载 gateway，并区分 `bridge_not_mounted` / `placement_unavailable`。
  - `asSpawnParams()`：校验 `appId`、`sessionSpec`、可选 `sessionId`。
  - `projectSession()`：投影现有 `AgentletConnection`。
  - `GET /continuation/agentlets/:agentletId/sessions` → `listOnAgentlet`。
  - `POST /continuation/agentlets/:agentletId/sessions` → `spawnOnAgentlet`。
  - `GET /continuation/agentlets/:agentletId/sessions/:sessionId` → `getSession`。
  - `POST /continuation/agentlets/:agentletId/sessions/:sessionId/stop` → `stopOnAgentlet`。
- `huabu/apps/server/src/modules/agent/acp/continuation-transport.route.test.ts`
  - mocked mounted gateway route test：委托、未挂载 503、非法 spawn 400、未知 session 404。
- `scripts/e2e/t7-acp-fixture-agent.cjs`
  - 可复用的 ACP stdio fixture，来自 `huabu/external/agentlet/packages/local/tests/daemon-integration.test.ts` 的合法 `initialize` + `session/new` 交互；只作为真实 agentlet spawn 的测试 agent，不替代 agentlet daemon。

## READ_SOURCE / ADOPTED / VISUAL_SOURCE / RETIRED / VERIFIED / UNRESOLVED

`READ_SOURCE`：

- `E:\OS开发\LCOS_GEN2\docs\handoffs\GEN2_P1C_T7_HuabuHostTransport_20260915.md`：P1-C T7 Host transport 结论、route contract、REAL_DAEMON_INTEGRATION 边界。
- `E:\OS开发\Huabu` commit `92844d2`：上述四个 exact donor 文件与符号。
- `E:\OS开发\LCOS_GEN2\huabu\apps\server\src\app.ts`、`modules\agent\acp\index.ts`、`external\agenetes\packages\agentlet-{host,gateway}`：当前 vendored composition 与 gateway API。
- `E:\OS开发\LCOS_GEN2\apps\local-core\src\huabu-agentlet-host-transport.ts`、`tests\huabu-agentlet-host-transport.test.ts`、`tests\continuation-provider-contract.test.ts`：Local Core caller/contract。

`ADOPTED`：`Huabu@92844d2/apps/server/src/modules/agent/acp/continuation-transport.route.ts` 的 `continuationTransportRoutes`、`connectedGateway`、`asSpawnParams`、`projectSession` → `huabu/.../continuation-transport.route.ts` → `apps/local-core/src/huabu-agentlet-host-transport.ts`。

`VISUAL_SOURCE`：无；本批为 Host/transport 非视觉纵切。

`RETIRED`：无旧 UI caller；移除的是“Local Core 请求无 Huabu route”这一断链，不退役 Huabu ACP WebSocket owner。

`VERIFIED`：Huabu route mocked Gateway HTTP exercise 3/3；Huabu server typecheck PASS；Local Core host transport/provider contract 17/17；Local Core typecheck PASS；targeted Prettier check PASS；`git diff --check` PASS。

`UNRESOLVED`：真实生产 Codex/Claude ACP adapter 未运行；本机只有 `codex.exe`，没有 PATH 上的 `codex-acp` / `claude-agent-acp`。本批已用仓库合法 ACP fixture 完成真实 daemon/session 链路，生产 harness 只影响 agent 内容能力，不影响 Host facade 的 route/gateway 委托结论。

## 测试与命令

Huabu：

```text
pnpm --filter @huabu/server exec vitest run src/modules/agent/acp/continuation-transport.route.test.ts
  1 file / 3 tests PASS

tsc -p apps/server/tsconfig.json --noEmit
  HUABU_SERVER_TYPECHECK_PASS

pnpm exec prettier --check <four changed Huabu files>
  PASS
```

Local Core：

```text
vitest run tests/huabu-agentlet-host-transport.test.ts tests/continuation-provider-contract.test.ts --maxWorkers=1
  2 files / 17 tests PASS

tsc -p tsconfig.json --noEmit --pretty false
  LOCAL_CORE_TYPECHECK_PASS
```

说明：Local Core 的 `pnpm exec vitest` 入口被 workspace 的 ignored `esbuild` build-script install 检查拦截；使用仓库现有 `E:\OS开发\LCOS_GEN2\node_modules\.bin\vitest.cmd` 与 `.bin\tsc.cmd` 直接执行了同一命令，结果如上。未改动两个根目录未跟踪 patch。

真实 Host HTTP smoke（bundled daemon + repo ACP fixture）：

```text
临时环境：HUABU_WORKSPACE / HUABU_DATA_DIR 独立临时目录，HUABU_BIND_HOST=127.0.0.1，SERVER_PORT=38127
真实 agentletId：LAPTOP-U3TJP352（由 supervised host hostname 解析）
ACP fixture：`scripts/e2e/t7-acp-fixture-agent.cjs`

server log：Server listening at http://127.0.0.1:38127
server log：[acp/supervisor] agentlet daemon forked
daemon log：event=ws_connected, server=ws://127.0.0.1:38127/api/acp/agent
host log：agentlet connection established, agentletId=LAPTOP-U3TJP352, role=agentlet
daemon log：event=daemon_ready, agents=0

POST /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions
  HTTP 200
  {"agentletId":"LAPTOP-U3TJP352","sessionId":"t7-fixture-session","pid":26128}

GET /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions
  HTTP 200
  {"agentletId":"LAPTOP-U3TJP352","agents":[{"sessionId":"t7-fixture-session","command":"node \"E:\\OS开发\\LCOS_GEN2\\scripts\\e2e\\t7-acp-fixture-agent.cjs\"","pid":26128,"status":"running"}]}

GET /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions/t7-fixture-session
  HTTP 200
  {"agentletId":"LAPTOP-U3TJP352","sessionId":"t7-fixture-session","pid":26128,"status":"connected"}

POST /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions/t7-fixture-session/stop
  HTTP 200
  {"agentletId":"LAPTOP-U3TJP352","sessionId":"t7-fixture-session","stopped":true}

GET /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions（stop 后）
  HTTP 200
  {"agentletId":"LAPTOP-U3TJP352","agents":[]}

daemon log：event=session_bootstrap_initialize
daemon log：event=session_bootstrap_initialized, agentInfo.name=t7-acp-fixture-agent
daemon log：event=session_bootstrap_session_new, sessionId=t7-fixture-session
daemon log：event=session_bootstrap_complete, sessionId=t7-fixture-session
daemon log：event=agent_ws_connected / agent_bridge_ready
daemon log：event=stopping_agent / agent_exited, code=0

GET /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions/missing
  HTTP 404
  {"error":{"code":"session_not_found","message":"Agentlet session was not found."}}

shutdown：SIGINT → daemon event=shutting_down；agent PID 26128 不再存在；端口 38127 已确认释放；临时 workspace/data 已删除。
```

fixture 不是裸 Node idle process：它实现 ACP stdio `initialize` 与 `session/new`，因此 daemon 日志和 `agent/hello` session registry 都是真实执行结果；没有伪造 Gateway response 或绕过 Host facade。

## 风险、回滚、下一步

风险：route 的真实成功态依赖 Huabu Host 内已有 connected agentlet；未连接时返回结构化 503，不自动创建 fallback session。prompt 只允许访问 registry 中已存在且 identity 匹配的 canonical ACP owner。

## Prompt 接线完成增量（2026-09-20）

上一版审查识别的 identity GAP 已按最小纵切补齐。当前真实链路为：

```text
Core continuation journal.runtimeThreadId
  → Local Core ContinuationProviderAdapter.send
  → Huabu continuation Host facade
  → acpSessionRegistry(agentletId, threadId)
  → existing shared AcpAgentClient
  → ACP native session/prompt
```

实现没有创建第二 Gateway、第二 ACP client 或第二 Conversation truth：

- `ConversationContinuationService` 在首次 submit 时生成并持久化稳定 `runtimeThreadId`；重复 submit 复用同一 identity。
- provider contract 分开保存 `externalSessionId`（ACP native session）、`transportSessionId`（Gateway transport）和 `threadId`（Core runtime identity），即便当前 fixture 下两个 session id 相同也不合并字段。
- Huabu create/continue 通过现有 `ensureAcpSession()` 建立 canonical owner；重复 create 使用相同 `(agentletId, threadId)`，不重复 spawn。
- `promptExistingAcpSession()` 只接收 registry 中已有 `AcpSessionEntry`，等待 selections replay、聚合 agent text、沿现有持久化/report path 更新 owner；不允许 raw frame send。
- continuation 没有交互式 permission UI，因此 permission request 明确 cancel，绝不自动授权。
- timeout 由 Local Core 投影为 `outcome_unknown + reconcile`；resource send 继续返回 unsupported，没有伪装成 prompt。
- 独立复核后补齐了 identity 分离路径：`status/cancel/recover` 使用 `transportSessionId` 寻址 Gateway，同时保留 ACP `externalSessionId`；测试显式让两者取不同值。
- “外部创建成功、Core 回执丢失”时，reconcile hints 会携带持久化 `runtimeThreadId`、transport/native session、correlation 和 operation id，查回原 owner，绝不再次 create。

### 真实 daemon / session / prompt smoke

临时 Huabu Host 运行在 `127.0.0.1:38127`，使用仓库内合法 ACP fixture 与 bundled agentlet daemon：

```text
agentletId: LAPTOP-U3TJP352
threadId: core-continuation-smoke
externalSessionId: t7-fixture-session
transportSessionId: t7-fixture-session
pid: 25764

prompt response text: fixture continued
stopReason: end_turn
duplicate create: same pid/session, list count remains 1
stop: true, agent exited code 0
```

服务已停止，端口、进程和临时 workspace/data 均已清理。

### 验证

```text
contracts typecheck: PASS
local-core typecheck: PASS
ACP driver build: PASS
Huabu server typecheck: PASS

Local Core continuation targeted suite: 4 files / 56 tests PASS
ACP continuation prompt helper: 1 file / 2 tests PASS
Huabu continuation route: 1 file / 5 tests PASS
git diff --check: PASS
```

### 仍未完成

基础设施已能真实发送并返回 assistant text，但产品层还没有公开的 Local Core HTTP/UI caller 去调用 `ConversationContinuationService.sendPrompt()`，也没有 caller 把 `responseText` 写入 Core Conversation。当前因此是 **transport/runtime closed，product-visible conversation loop pending**，不能宣称用户已经能在前端完成整轮续工对话。

回滚：回退本批 prompt/identity commit；不恢复旧 Local Core WebSocket 假 peer，也不删除此前已验证的 spawn/list/status/stop Host facade。
