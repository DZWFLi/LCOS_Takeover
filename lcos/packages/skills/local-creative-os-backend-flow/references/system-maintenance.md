# System Maintenance Routes

先按问题选择一条主路线，不同时把整个仓库当上下文。

```text
runtime_diagnose
  Desktop/Core/Bridge/MCP/Skill 启动、连接、状态异常

runtime_repair
  只使用已有安全 repair：重装 managed Skill、修受管配置、重启受管服务、重建可重建 cache

backend_change
  Core / contracts / domain / server 行为修改

integration_repair
  Codex / MCP / managed Skills / stable userData integration / old session / Bridge wiring

schema_migrate
  SQLite/schema/local persistence migration；高风险，单独 Gate

capability_sync
  Core/CLI/MCP/Skill/GUI 能力新增、删减、重命名后的全链同步

release_verify
  clean/upgrade install、restart、runtime、managed Skills、MCP、project reopen、persistence

upgrade_maintain
  Electron/Node/SDK/MCP/依赖升级；先查上游官方变化，再核当前 LCOS 用法
```

## Diagnose first

优先稳定入口（当前 repo 真正存在什么就用什么）：

```text
repo README / AGENTS / current handoff
→ lcos doctor / desktop doctor / dev status（存在时）
→ relevant logs / generated runtime info
→ rg / exact source
→ target test
```

不存在的 doctor/command 不得发明。
