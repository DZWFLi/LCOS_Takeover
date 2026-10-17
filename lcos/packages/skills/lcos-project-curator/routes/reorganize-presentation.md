# Route: reorganize

目标：让 Agent 理解内容后整理当前 Presentation / Surface，用户直接看到候选变化并能安全审查。

## PASS8 已有主链

```text
read current Presentation（members/hierarchy/pins/emphasis）
→ read Selection / relevant nodes
→ analyze（重复、孤岛、密度、层级、语义分组）
→ ReorganizeProposal
→ ghost / candidate view
→ user accept
→ apply
→ verify / rollback
```

## V4.3 升级目标（能力存在时优先）

```text
Agent 形成受控 Presentation ChangeSet
→ 当前 Surface 直接显示 pending changes
→ 用户 Keep / Revert / Keep All / Revert All / 查看之前
→ Core finalize
→ verify
```

如果当前 Core 仍只有 PASS8 `proposal → ghost → accept → apply → snapshot/rollback`，继续使用该兼容路径；**不得声称 live pending review 已存在**。

## 硬规则

- `preservePinned=true` 默认；用户明确“全部重排”才允许覆盖 manual pins。
- Agent 决定分组/层级/关系重点，不手算每个节点像素坐标；客户端/Core 几何层处理真实尺寸、间距和防重叠。
- Presentation 移除 ≠ Artifact 删除；Artifact 删除必须单独列清单并确认。
- apply/finalize 前必须有可恢复 ChangeSet / snapshot。
- 用户后来已手改的对象不能被旧 Revert 覆盖；遇到 stale/version conflict 重新读取。
- 纯整理默认只改 Presentation，不改 Artifact 内容、Revision、Project membership 或用户已确认业务判断。

## 条件加载

- 涉及真实关系写入 → `policies/relation-density.md`
- 涉及 Artifact 删除 → `policies/destructive-change.md`
- 需要命名 → `policies/naming.md`
