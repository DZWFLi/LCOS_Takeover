---
name: workbuddy-orchestrator
description: Orchestrate real WorkBuddy execution through AI Bridge tasks. Use when the user wants Codex to preprocess a task, create a bridge task for WorkBuddy, wait for verifiable execution, and then review the result.
---

# WorkBuddy Orchestrator

This skill is for real task orchestration, not for drafting a handoff card only.

Use it when the user wants:

- Codex to understand and refine the request
- WorkBuddy to do the heavy execution
- AI Bridge to hold task state
- watcher to route tasks into the correct project inbox
- Codex to review the returned result

## Core Rule

WorkBuddy is not a Codex thread.

The following do not count as WorkBuddy execution:

- creating a new Codex thread
- using a Codex sub-agent
- doing the work in the current model
- writing a task card for the user to forward
- claiming success without bridge evidence

Only claim that WorkBuddy executed the task when all required bridge evidence exists.

## Required Evidence

Before saying the task was handed to WorkBuddy or completed by WorkBuddy, verify:

1. `create_task()` returned a real `task_id`
2. `assignee` is `workbuddy`
3. the task was created with the correct `project_id`
4. watcher routed it into the mapped project inbox
5. watcher may reserve delivery with `claim_task`, leaving the task in `assigned`; this is routing evidence, not execution evidence
6. the real WorkBuddy UI/headless executor calls `start_task`, after an actual wake-up or verified dispatch, and the task enters `running`
7. WorkBuddy eventually `submit_result(...)`

If any item is missing, say that the task is not yet a verified WorkBuddy run.

## When To Use WorkBuddy

Good fits:

- document drafting or formatting
- Word, Excel, PPT, and file processing
- desktop or local file organization
- office-style automation
- batch cleanup and structured output work

Codex should still do the high-value preprocessing first:

- clarify the goal
- tighten constraints
- inspect visuals when needed
- define acceptance criteria
- decide whether the task is appropriate for WorkBuddy

## Channel Selection: Feishu First, Bridge For Project Execution

Choose the channel before bootstrapping Bridge.

Use the designated WorkBuddy Feishu assistant as the default channel when the request is ad hoc and does not require formal project execution. Examples:

- asking Buddy a question or requesting an opinion
- temporary lookup, comparison, or lightweight research
- small formatting, summarization, or organizational chores
- conversational clarification and back-and-forth
- a disposable result that does not need project files, lifecycle state, artifacts, or formal acceptance

Feishu may carry the complete natural-language request and response for these chores. Do not create a Bridge task merely to make a casual exchange look formal.

Use Bridge when any of the following applies:

- a concrete project or absolute project workspace is in scope
- Buddy will write or modify project files
- the task has explicit deliverables, artifacts, acceptance criteria, dependencies, retry responsibility, or a meaningful timeout
- execution must continue independently and be auditable
- the result will be used as a formal project decision or handoff

For Bridge tasks, Feishu becomes a supporting communication channel only. Task identity, status, files, artifacts, and acceptance remain authoritative in Bridge.

When uncertain, ask: “If Buddy replies with useful text but no durable task record, is the job still complete?” If yes, prefer Feishu. If no, use Bridge.

## Orchestration Flow

1. Read the user request and extract the true objective.
2. Determine whether WorkBuddy is the right executor.
3. Do Codex-side preprocessing first:
   - visual judgment
   - structure judgment
   - task boundaries
   - output and acceptance requirements
4. Pick the correct `project_id` for the destination WorkBuddy project.
5. Convert the request into a bridge-ready instruction.
6. Create the task through AI Bridge with `assignee = workbuddy`.
7. Let watcher reserve delivery and route the task into the mapped `.workbuddy` inbox; the expected state is `assigned`, not `running`.
8. Wake or dispatch the selected executor. Only the real executor may call `start_task`; then track status until there is real execution evidence.
9. Read the returned result and artifacts.
10. Review the result against the original goal.
11. If needed, request another pass through the bridge flow instead of silently fixing the definition of success.

## Mandatory Bootstrap For A New Codex Project Or Conversation

Run this bootstrap before the first real task whenever any of the following is true:

- this is a new Codex project or conversation
- the working directory changed
- the intended WorkBuddy project changed
- the current `project_id` or `session_id` is unknown
- Bridge, watcher, inbox routing, or executor availability is uncertain

Do not inherit a project binding merely because another Codex conversation previously completed a Bridge run. Bindings are local to the current project and conversation unless verified again.

### Deferred MCP tool discovery (mandatory)

Codex Desktop may defer remote MCP tools, so `mcp__ai_bridge__create_task` and related tools may be absent from the initially displayed tool list even though the server is globally registered and healthy. Absence from the upfront list is not evidence that Bridge tools are unavailable.

Before reporting that AI Bridge tools are missing:

1. Search deferred tools with `tool_search` using a precise query such as `AI Bridge create_task get_task_status create_session`.
2. If `tool_search` is unavailable but `functions.exec` is available, inspect `ALL_TOOLS` for names beginning with `mcp__ai_bridge__` and call the discovered nested tool through `tools.<name>(...)`.
3. Confirm `C:\Users\1\.codex\config.toml` contains `[mcp_servers.ai_bridge]` with `url = "http://127.0.0.1:8920/mcp"`.
4. Confirm port `127.0.0.1:8920` is listening or start the canonical runtime as described below.

Only after deferred discovery and runtime verification both fail may the orchestrator say that `create_task` or `get_task_status` is unavailable. Never tell the user that the tools are “not exposed” merely because they were deferred.

Canonical Bridge runtime root on this machine:

```text
E:\Buddy项目\ai-bridge
```

When the user explicitly asks to involve Buddy, dispatch through Bridge, or enable Bridge duty, that request authorizes the normal reversible bootstrap steps: starting Bridge/watcher if stopped, creating the current project's `.workbuddy` directory, adding a non-conflicting watcher mapping, and creating a Bridge Session. It does not authorize a headless worker or destructive project changes.

### Bootstrap sequence

1. Identify the current Codex workspace by its resolved absolute path.
2. Discover deferred AI Bridge tools as described above. Inspect Bridge runtime health and watcher state. When the user has requested Buddy/Bridge execution, start missing runtime components through `E:\Buddy项目\ai-bridge\scripts\start_runtime.py`; verify them after startup. Do not stop at a status report while a safe bootstrap action remains.
3. Resolve the destination WorkBuddy project:
   - inspect `watcher_config.json`
   - find a `project_id` whose mapped `.workbuddy` directory belongs to the intended project
   - never silently use `default` for a new project
4. If no correct mapping exists and the user requested Buddy/Bridge execution, provision it automatically:
   - create `<current Codex workspace>/.workbuddy` if absent
   - derive a stable readable `project_id` from the workspace folder name; normalize to lowercase ASCII letters/digits/hyphens when possible, and add a short deterministic path hash if the name is empty, non-ASCII-only, or collides
   - update `E:\Buddy项目\ai-bridge\watcher_config.json` without changing existing mappings or `default`
   - map the new id to the resolved absolute `<workspace>/.workbuddy` path
   - validate the JSON and re-read the exact mapping
   Report a blocker only if safe provisioning fails or a collision cannot be resolved. Do not require the user to edit the mapping manually.

   Prefer the canonical helper instead of hand-editing JSON:

   ```text
   E:\Buddy项目\ai-bridge\venv\Scripts\python.exe E:\Buddy项目\ai-bridge\scripts\bootstrap_project.py "<absolute current Codex workspace>"
   ```

   Use `--dry-run` only for diagnosis. A real Buddy/Bridge execution request authorizes the normal non-destructive registration without `--dry-run`.
5. Resolve the Bridge session:
   - reuse an active session only when its `project_id` matches and it represents the same continuing project context
   - otherwise create a new session and record the returned `session_id`
6. Choose the execution route explicitly:
   - WorkBuddy project UI + user/Feishu wake-up
   - project headless worker, only when explicitly enabled and verified
   - manual handoff, when Bridge execution is unavailable
7. Verify the mapped inbox exists or can be safely created. Confirm watcher writes only to that project's `.workbuddy` directory.
8. For a newly registered project, perform the cheapest safe verification first: Bridge health, watcher process, exact watcher mapping, writable project inbox, and Session retrieval. A separate Bridge probe task is optional when these checks pass; do not create a disposable task merely to satisfy ceremony. A headless executor still requires its own no-write connectivity probe before first use.
9. Keep the verified `project_id`, `session_id`, execution route, and inbox path as the binding for the current conversation. Re-run bootstrap after a project switch.

### Bootstrap result

Before dispatch, the orchestrator must be able to state internally:

```text
Codex workspace: <absolute path>
project_id: <verified id>
session_id: <verified active id>
WorkBuddy project inbox: <absolute .workbuddy path>
execution route: <ui+feishu | headless | manual>
Bridge: <running>
watcher: <running>
probe: <passed | previously verified and unchanged>
```

If any required field is unknown, do not create a real task and do not claim WorkBuddy has been engaged.

## Instruction Format

Choose one dispatch mode before creating a task.

### Full Work Order

Use for a new objective, a new project/session, research, document delivery, or when the executor needs context not already present in the active session. Include only the information required to execute:

- task title and executor objective
- project id and session id
- task type / capability
- essential background and input paths
- hard constraints and explicit non-goals
- expected outputs and acceptance criteria
- report mode

Do not paste a long chat history. Convert it into a compact `context` object or a short background section.

### Incremental Follow-up

Use when continuing a task in the same project and session. Reference the previous `task_id` in `context`, then include only:

- what changes now
- what must remain unchanged
- the updated acceptance check
- report mode

Reuse the existing `project_id` and `session_id`. Do not repeat stable project background unless it has changed or WorkBuddy needs it to make the next decision.

### Report Mode Defaults

- `silent`: sequential code fixes, debugging, and narrow refactors. Require `status` plus absolute `changed_files` or artifacts; do not request an execution narrative.
- `short`: ordinary file work and bounded execution. Require `status`, `short_summary`, absolute `changed_files`, and artifacts when produced.
- `full`: research, creative deliverables, or standalone documents. Require summary, artifacts, and the requested detailed content.

For code work, Codex reviews the file diff and test result first. WorkBuddy's text return is an index, not the source of truth.

### Feishu Notification Boundary

Feishu is a wake-up and exception channel, not a second result channel.

- Submit the complete result only through Bridge, following the task `report_mode`.
- After a Bridge submission, send at most one Feishu line: `[BRIDGE] task_id=<id> status=<review|failed|timeout>; 请以 Bridge 为准`.
- Do not repeat summaries, changed files, artifacts, logs, or reasoning in Feishu.
- Send a detailed Feishu message only for a blocker that Bridge cannot express, such as unavailable worker, expired local credential, or a required human decision.
- Codex validates Bridge and local files. It reads Feishu details only for wake-up, an explicit blocker, or Bridge unavailability.

### Feishu Wake-up End-to-End Flow

Feishu wake-up is allowed only after a real Bridge task has been created and routed. It is not a substitute for `create_task`, watcher routing, or WorkBuddy claim.

The designated target is the Feishu intelligent agent `WorkBuddy Bridge 助理`, not a normal employee contact or group chat. Do not resolve it with contact search, and do not send to its bot `open_id` through an unrelated Lark app: Feishu IDs are app-scoped and that path fails with `open_id cross app`.

Use this delivery order:

1. Use a dedicated `lark-cli` profile bound to the intelligent agent's own Feishu App. On this machine the profile name is `workbuddy-bridge-assistant`; obtain the App ID and secret from WorkBuddy's existing Feishu channel configuration without printing the secret or placing it on the command line.
2. Send as the authorized user, never as the bot itself, to the verified P2P `chat_id` belonging to the same App. The currently verified conversation is `oc_e4392f46f1408083fd431e2cd54eca6b`.
3. If that profile has no user token, request one one-time OAuth authorization for the intelligent agent App, then keep using the profile. Do not reauthorize the unrelated default `lark-cli` App.
4. Use the Feishu desktop conversation only as a fallback when the dedicated CLI profile or verified P2P chat is unavailable.

Switching accounts in the Feishu desktop client does not switch `lark-cli` authorization. Before delivery, verify the selected CLI profile, App ID, user identity, and P2P chat belong to the same App. Treat `99992361 open_id cross app` as an addressing failure, not as missing user authorization. Do not retry it by searching contacts, changing desktop accounts, or sending with the bot identity.

Use this sequence:

1. Codex creates the task with the verified `project_id`, `session_id`, and `assignee=workbuddy`.
2. Confirm the task has a real `task_id` and watcher routed it to the expected project inbox.
3. Send one minimal wake-up message to the designated WorkBuddy Feishu assistant:

```text
[BRIDGE] action=check_inbox project_id=<project_id> task_id=<task_id> session_id=<session_id>
```

4. The assistant must interpret `check_inbox` as the AI Bridge project inbox, never as Feishu Mail. It reads the mapped project's `.workbuddy/active_task.json` and `.workbuddy/incoming_tasks.json`, then verifies the live task with `get_task_status` before execution.
5. WorkBuddy claims or confirms the task, executes it, and returns the complete result only through `submit_result`.
6. After submission, Feishu may send at most:

```text
[BRIDGE] task_id=<task_id> status=<review|failed|timeout>; 请以 Bridge 为准
```

7. Codex reads Bridge status and local artifacts, then performs review.

Do not send a wake-up message without `project_id`, `task_id`, and `session_id`. Do not ask the Feishu assistant to infer the destination project from chat history. If the assistant cannot access the mapped inbox, Bridge MCP is unavailable, credentials expired, or human authorization is required, it may send one detailed blocker message; otherwise Feishu stays minimal.

## Project Routing

Treat `project_id` as required for any real WorkBuddy run.

Watcher reads `watcher_config.json` and routes claimed tasks by `project_id` into the correct `.workbuddy` directory. The orchestrator should therefore:

- choose the intended WorkBuddy project before task creation
- set `project_id` explicitly instead of relying on a generic default
- expect the task to appear in that project's local inbox files

Current watcher-style inbox files may include:

- `incoming_tasks.json`
- `active_task.json`
- `completed_tasks.json`
- `status_board.json`

These files are routing and handoff evidence. They do not replace bridge task status.

## Current Bridge Reality

Current bridge supports these task tools:

- `create_task`
- `get_pending_tasks`
- `claim_task`
- `submit_result`
- `get_task_status`

Current task state is only partially upgraded. Treat the live authoritative states as whatever the bridge currently supports in code. Do not invent unsupported states in status claims.

Current automation boundary:

- automated: create task, watcher delivery reservation (`assigned`), project inbox routing, result submission
- not yet fully automated: guaranteed zero-click wake-up of an already-open WorkBuddy chat

Watcher must never call `start_task`. `running` means an actual WorkBuddy UI/headless executor has accepted execution. A task that is merely present in an inbox stays `assigned`; do not treat routing as work started.

Do not describe the system as fully autonomous if the final execution still depends on a product-level chat wake-up limitation.

## Project Headless Worker Mode

Use this only for an explicitly activated, long-running project. It is distinct from both a WorkBuddy UI conversation and the Feishu dispatcher.

Route C headless worker is retired and must not be selected for new work. Historical details below are retained only as failure context until archived.

- A project worker is a named `codebuddy --serve --bg` instance running in that project's directory.
- Bridge remains the source of truth; watcher claims and routes tasks. An executor adapter may then deliver the task to the matching live worker.
- Before enabling delivery, verify the instance identity, loopback binding, project directory, registry entry, request contract, and a safe no-write probe.
- Start workers only when Dz explicitly enables project background duty. Stop them explicitly at project close; never create a fleet by default.
- Do not claim project automation until a real Bridge task reaches the worker and it submits a result through Bridge.

## WorkBuddy Automation Executor

WorkBuddy minute-level Automation is the intended replacement for Route C, but it becomes authoritative only after a real E2E proves all of the following:

1. Codex calls the Bridge automation creation tool and receives an `automation_id`.
2. WorkBuddy's scheduler records a non-empty next-run value.
3. The Automation actually triggers at the scheduled Beijing time.
4. The triggered WorkBuddy session calls `start_task`.
5. WorkBuddy submits the result through Bridge.

A database row alone is not execution evidence. If `next_run_at` and `last_run_at` remain empty, treat automation creation as failed and do not claim background dispatch.

## Review Standard

After WorkBuddy submits a result, check:

1. Did the result come from a real bridge task?
2. Did the task route through the correct project inbox?
3. Are the returned artifacts present?
4. Does the output meet the acceptance criteria?
5. Is another WorkBuddy pass needed?

If the answer is uncertain, say so explicitly and keep the task in review instead of overstating completion.

## Automatic Exchange Limit

One collaboration chain may have at most four direction changes:

1. Codex dispatches the task.
2. WorkBuddy submits the result.
3. Codex issues one compact retry/follow-up only if required.
4. WorkBuddy submits the retry result.

After the second review, either finalize or stop the automatic loop and report the unresolved decision to Dz. Do not create a third automatic WorkBuddy pass, broaden scope, or keep conversationally acknowledging each other. Polling and status checks do not count as exchanges.
