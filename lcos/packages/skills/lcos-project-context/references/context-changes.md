# 上下文指令

用户明确且可逆的命令（如“把第二张也加进参考”）→ `apply_lcos_context_command`
（带当前 `expectedVersion`）。

Agent 自己猜测需要更多上下文 → `propose_lcos_context_change`，由用户接受/拒绝。

运行中的 Run 永远使用冻结的 ContextManifest；画布实时变化只影响未来的 Plan/Run。

## 自然语言转原子命令

```text
“把第二张也加进来”
→ 重读 ActiveContext → 找到当前有序选择/视口中的第二项
→ apply_lcos_context_command(addViewIds=[...])

“别参考客户旧反馈”
→ apply_lcos_context_command(removeViewIds=[...])

“主要改脚本，另外三张只做参考”
→ 设置一个 Target，其余三个进 Context

“先看这些，不要改文件”
→ analyze + reply_only
```

更多例子：`references/natural-language-examples.md`（仅需要时读）。

绝不从过期 View ID 猜；遇到 `ACTIVE_CONTEXT_CONFLICT` → 读最新版本，重建命令一次。
