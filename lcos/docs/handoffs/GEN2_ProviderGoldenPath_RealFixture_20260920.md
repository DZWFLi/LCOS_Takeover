# GEN2 Provider Golden Path · Real Fixture Handoff

日期：2026-09-20  
基线：`b3dcbb6`（detached worktree）  
Worktree：`E:\Codex 项目\OS开发\.worktrees\provider-golden-path`

## 结论

本次在独立 worktree 跑通了隔离 Core、Huabu Host/ACP fixture、浏览器 Project/Canvas/Workflow/Composer 入口，以及 Core continuation journal 的真实 provider owner 创建和 bind。真实 assistant turn 没有落进 conversation timeline，原因是 baseline 的 `recover_bind` 只回写 `connected_conversations.conversation_ref`，不创建或链接 canonical `conversation_sessions`；发送接口因此诚实返回 409。

## 范围与流程

本次只改测试 harness 的运行参数，不改 continuation attachments 业务文件：

```text
Project → Main Canvas → Workflow hand / Composer
       → Core continuation submit
       → Huabu Host / embedded ACP fixture
       → recover_external → recover_bind
       → canSend=true
       → collaboration-send 409（缺 canonical conversation session）
```

reload 主画布恢复已由 Wave10 harness 验证；waiting_input、review、artifact return 未触发。

## 隔离运行

服务启动时使用：

```powershell
# Core：绕过 b3dc 的既有 TS 编译错误，仅用于运行时验证
$env:LOCAL_CORE_E2E_FIXTURE='1'
$env:LOCAL_CORE_TEST_PORT='43141'
$env:LOCAL_CORE_DB_PATH='E:\Codex 项目\OS开发\.worktrees\provider-golden-path\.e2e-data\core\e2e-core-43141.sqlite'
$env:LOCAL_CORE_DEV_WORKSPACE_ROOT='E:\Codex 项目\OS开发\.worktrees\provider-golden-path\.e2e-data\core\workspace-43141'
$env:HUABU_HOST_URL='http://127.0.0.1:3021'
$env:HUABU_CONNECTION_TOKEN='dev-token'
$env:HUABU_AGENTLET_ID='LAPTOP-U3TJP352'
$env:HUABU_AGENTLET_SPAWN_COMMAND='node scripts/e2e/t7-acp-fixture-agent.cjs'
$env:HUABU_AGENTLET_SPAWN_CWD='E:\Codex 项目\OS开发\.worktrees\provider-golden-path'
node --import tsx apps/local-core/src/index.ts
```

真实 PID/cwd 校验过：Core 43141、Huabu 3021、Web 5284/5285 均来自该 worktree；此前的 43131 进程没有计入证据。完成后隔离进程已停止。

## 真实 receipt

1. `POST /api/acp/continuation/agentlets/LAPTOP-U3TJP352/sessions` 返回：
   - `sessionId=transportSessionId=t7-fixture-session`
   - `threadId=conversation-e2e-fixture`
   - `pid=16352`
   - cwd 为 provider-golden-path worktree。
2. Core continuation：
   - `POST /projects/lcos-gen2-dev/conversation-continuations` → `201`，revision `0`。
   - `recover_external` → `200`，`external_create=confirmed`，revision `2`，写入 provider receipt。
   - `recover_bind` → `200`，`core_bind=confirmed`，status `attaching`，revision `4`。
   - collaboration session 投影显示 `canSend=true`、`canRecover=true`。
3. 真实发送：
   - `POST /projects/lcos-gen2-dev/connected-conversations/conversation-e2e-fixture/collaboration-send`
   - 返回 `409 Connected conversation has no explicit canonical conversation session.`
   - 因此没有伪造 assistant message，也没有把 fixture 结果冒充 timeline。

## 浏览器证据

命令：

```powershell
$env:LCOS_E2E_BASE='http://127.0.0.1:5284'
$env:LCOS_E2E_SHOTS='E:\Codex 项目\OS开发\.worktrees\provider-golden-path\output\playwright'
node scripts/e2e/wave10-golden-path.mjs
```

结果：主画布 9 个真实 fixture species body、5 条边、workflow hand、Composer 入口、Core offline 失败态和 reload 恢复均有截图；旧 Assembly selector 与当前 UI 不匹配，Composer 提交因未选择会话接收者保持 disabled。

截图目录：`E:\Codex 项目\OS开发\.worktrees\provider-golden-path\output\playwright`

workflow-card 生产 harness：

```powershell
$env:LCOS_E2E_BASE='http://127.0.0.1:5285'
$env:LCOS_E2E_CORE='http://127.0.0.1:43141'
$env:LCOS_E2E_HUABU='http://127.0.0.1:3021'
node scripts/e2e/workflow-card-preview-enter.mjs
```

真实结果：`ok=false`，唯一关键失败为 `Workflow production route did not load a Huabu canvas`；console/page error 均为空，HTTP 也无 4xx/5xx。该脚本已创建 workflow fixture、workspace 和 Huabu canvas，说明数据 import seam 可达；当前 web workflow route 与 canvas proxy/绑定 seam 仍未闭合。

## 精确 blocker

- **生产 provider**：未配置 Codex/Claude adapter；本次 provider 是仓库内明确标记的 ACP stdio fixture，不代表生产 provider。
- **assistant reply / timeline**：`recover_bind` 没有 canonical `conversation_session_id`；collaboration-send 在进入 provider 前被 409 拦截。需要正式的 provider session import/link seam，不能在 harness 里直写 SQLite。
- **waiting_input**：当前 fixture 只实现 initialize、session/new、session/prompt 并返回固定 assistant 文本，没有 waiting-input event；Core 也没有可注入 provider result 的 HTTP seam。
- **review / artifact return**：没有 provider result ingestion，也没有可消费的 pending return/review row；能力无法真实触发，不能用手写 pending 数据替代。
- **baseline build**：`npm run dev:local-core` 在 b3dcbb6 被既有 local-core TypeScript contract 错误阻断，因此运行验证使用 `node --import tsx`。该 workaround 未修产品类型错误。

## 修改与提交

- `scripts/e2e/wave10-golden-path.mjs`：允许 `LCOS_E2E_BASE`、`LCOS_E2E_SHOTS`、`LCOS_E2E_CHROMIUM` 注入，便于独立端口和证据目录复现。
- `scripts/e2e/wave7-workflow.mjs`：工作区已有的外部未提交修改，未纳入本次提交。
- `scripts/e2e/workflow-card-preview-enter.mjs`、`output/`、`huabu/node_modules.shared-link/`：外部/生成文件，未纳入提交。

验证：`git diff --check` 通过；Wave10 与 workflow-card harness 均已真实浏览器执行并记录上述结果。

回滚：删除本 handoff，并 `git revert` 本次 harness 小提交即可；无数据库 schema、业务流程或 provider contract 改动。

状态标签：

```text
SOURCE_AVAILABLE    ✅
HOST_ACP_WIRED      ✅ fixture
JOURNAL_EXTERNAL    ✅
JOURNAL_CORE_BIND   ✅
BROWSER_PROVEN      ✅ 部分入口与 reload
ASSISTANT_TIMELINE  ❌ canonical conversation session blocker
WAITING_REVIEW_RETURN ❌ 未接通真实 provider/result ingestion
```
