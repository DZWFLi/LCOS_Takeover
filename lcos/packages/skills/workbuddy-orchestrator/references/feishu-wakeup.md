# Feishu / Notification Boundary

Feishu 只用于：

- 唤醒已存在的正式 Bridge Task；
- Bridge 不能表达的 blocker / 人工授权。

不用于：

- 替代 `create_task`；
- 承载第二份完整结果；
- 从聊天历史猜 project/task/session。

正式流程：

```text
real Bridge task + verified project/session
→ minimal wake-up containing project_id/task_id/session_id
→ WorkBuddy checks mapped inbox + live task status
→ execute + submit_result through Bridge
→ notification at most reports compact final status
```

App/profile/chat addressing 必须从当前受管配置发现并验证同一 App scope；不要把 credential 放在命令行或输出里。旧 PASS8 机器 profile/chat id 只在 legacy reference 中查兼容问题。
