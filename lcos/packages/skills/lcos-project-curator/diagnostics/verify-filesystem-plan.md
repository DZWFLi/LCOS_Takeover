# Diagnostic: Verify File Organization

Plan-only：

- 每项都有 from/to/action/reason/risk；
- 高风险工程、歧义、删除、跨盘没有被静默自动化；
- 没有 shell move/rename。

Apply capability 存在并实际执行后，再额外验证：

- 新位置存在；旧位置状态符合计划；
- 内容 hash 未因纯移动改变；
- FileRecord locator 已同步；
- Artifact/Revision identity 不因路径变化而改变；
- Context / Workflow refs 仍指同一 Entity；
- dependency-risk 项没有被破坏。
