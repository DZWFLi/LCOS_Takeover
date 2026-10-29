# Policy: Reviewable Change

适用于广泛语义修改、空间整理、Context/Workflow 重构。

优先路径：

```text
Agent 形成受控 Change / Proposal
→ 当前 Surface 显示候选变化
→ 用户 Keep / Modify / Revert
→ Core finalize
→ verifier
```

PASS8 兼容：如果当前 Core 只有 `proposal → ghost → accept → apply → snapshot/rollback`，继续走该路径；不得伪装成已经具备 live pending review。

规则：

- 旧 Revert 不得覆盖用户后来已经手改的新状态；遇到 stale/version conflict 必须重新读取。
- Presentation 级 Revert 不应恢复已明确删除的 Artifact。
- 用户确认的变更才成为最终状态；Agent 不以视觉预览代替 canonical write。
