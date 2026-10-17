# Ownership / Risk

## Ownership

- Local Core：Project / Artifact / Revision / Current / canonical write。
- Bridge：provider task / claim / lease / heartbeat / result transport。
- Desktop Runtime：进程托管、稳定 runtime path、installer/upgrade integration。
- CLI/MCP：adapter，不拥有第二份 Truth。
- Frontend：交互与投影，不直接成为 canonical DB owner。

## Green

可逆、无产品语义变化、无真实用户文件/Schema/基础设施风险：局部修复、测试、只读 diagnostics、timeout、source badge、runbook。

## Yellow

跨前后端 contract、API version、轻量 contract extension、dev-stack choice、测试报告生成。先写：Goal / Files / Before-After / Contract / Tests / Risk / Rollback，然后同任务继续。

## Red

先停并要求明确批准：

- SQLite/schema/migration；
- watcher/import/preview/真实用户文件写；
- Bridge canonical Run/waiting_input/retry/recovery 语义；
- Project/Workspace/Artifact/Revision/Current/Accept semantics；
- 非 loopback/CORS/shell/credential/network；
- path containment/hash/write lease/overwrite/move/delete。
