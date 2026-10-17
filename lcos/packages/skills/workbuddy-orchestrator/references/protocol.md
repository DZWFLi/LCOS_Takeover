# WorkBuddy Protocol

## Mission

```text
Codex / LCOS = orchestrator + review
WorkBuddy     = external executor
AI Bridge     = task/state/result layer
watcher       = project routing / delivery reservation
```

## Verified loop

```text
preprocess request
→ verify project/session binding
→ create_task(assignee=workbuddy)
→ watcher routes to mapped project inbox
→ real WorkBuddy executor starts task
→ WorkBuddy executes
→ submit_result
→ Codex/LCOS reviews artifacts against acceptance
```

## Required evidence

在说“已交给 WorkBuddy / WorkBuddy 已完成”前至少确认：

1. real `task_id`；
2. assignee = workbuddy；
3. verified `project_id`；
4. watcher 路由到正确项目 inbox；
5. routing/claim 只算 assigned；
6. real executor `start_task` 后才算 running；
7. real `submit_result` / artifacts。

缺任一关键证据 → 如实报告未完成验证。

## Bridge vs Feishu

formal project execution 使用 Bridge：有项目文件、deliverable、acceptance、retry、audit、独立持续执行。

轻量一次性问答可以使用已配置沟通渠道，但不要为了仪式感创建 Bridge Task。

Bridge formal task 中，Feishu 不拥有 task truth。

## State honesty

只报告当前 Bridge 代码真实支持的状态，不从旧 Skill/记忆发明 richer lifecycle。
