# Route: handoff_continue

目标：给下一会话 / Agent 一个最小充分交接，而不是 Project Dump。

```text
resolve current task goal
→ read current Selection / Saved Context / Workflow step
→ read only essential source refs
→ build compact handoff pack
→ verify-handoff
```

输出只保留：

```text
goal
must-know
must-follow
current-materials
current-progress
next-step
source refs
```

不复制完整聊天历史；历史保持可按来源回查。
