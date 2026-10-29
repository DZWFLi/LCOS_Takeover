# WorkBuddy Bootstrap

以下任一成立时重新验证绑定：

- 新 Codex project / conversation；
- working directory 变化；
- 目标 WorkBuddy project 变化；
- current project_id / session_id 未知；
- Bridge / watcher / inbox / executor 可用性不确定。

## 顺序

```text
resolve current workspace absolute path
→ discover Bridge tools / runtime
→ inspect current watcher mapping
→ resolve or safely provision project mapping（只有已有正式 helper/capability 时）
→ resolve/reuse matching session
→ choose executor route: UI+notification | verified headless | manual fallback
→ verify inbox + Bridge/session evidence
```

不要继承另一个会话的 binding；不要默认使用 generic `default` project。

## Deferred tool discovery

Provider 可能延迟 MCP tool schema。先使用当前 Host 支持的官方/内建 tool discovery 或 capability listing；运行时和 tool discovery 都失败后，才可报告 Bridge unavailable。

不要在 canonical Skill 硬编码某台机器的 Bridge 根目录、端口、chat id 或 credential；从当前 runtime/config 读取。PASS8 旧机器细节留在 `legacy-pass8-root.md` 仅用于迁移。
