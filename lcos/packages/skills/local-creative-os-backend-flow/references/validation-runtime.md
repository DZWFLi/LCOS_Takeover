# Validation / Runtime

## Token-efficient validation

实现中优先精确检查，阶段完成后再扩大：

```text
continuous small edits
→ focused type/test
→ fix only failure
→ relevant integration
→ browser/runtime check when visible
→ final quality chain
→ diff audit
```

不要每改一个文件就跑全仓，也不要只因为 build PASS 就宣布交互/Runtime 正确。

## Dev runtime safety

优先使用 repo 当前正式 launcher（存在时例如 `dev:open / dev:status / dev:stop`），不要 ad-hoc kill 进程。

- 只停止当前 worktree 记录的受管进程。
- 未知端口 owner → 报冲突并停，不强杀。
- dirty / unexpected worktree → 不静默启动“最新版”。
- PID/log/browser profile 放忽略的 local runtime 目录。

## Evidence

最终至少记录：

```text
changed files
target tests
integration/runtime evidence
visible behavior（如有）
remaining debt
red condition（如有）
```
