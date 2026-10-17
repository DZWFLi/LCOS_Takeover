# Instruction / Report Mode

## Full Work Order

新目标、新项目/session、研究、独立交付需要：

```text
title / objective
project + session binding
essential inputs
hard constraints / non-goals
expected outputs
acceptance criteria
report mode
```

不要粘贴长聊天历史；压成短 background/context refs。

## Incremental Follow-up

同 project/session 续跑只传：

```text
previous task ref
what changes now
what must remain unchanged
updated acceptance
report mode
```

## Report modes

- `silent`：窄代码修复/调试；结果至少保留 status + changed files/artifacts。
- `short`：普通文件工作；status + short summary + changed files/artifacts。
- `full`：研究/创意/独立文档；完整交付与 artifacts。

代码/文件任务由 Codex 检查 diff、tests、artifacts；executor 文本汇报不是事实源。
