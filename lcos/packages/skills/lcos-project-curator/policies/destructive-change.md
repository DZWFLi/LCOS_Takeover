# Policy: Destructive Change

两级删除：

| 操作 | 性质 | 确认 |
| --- | --- | --- |
| Remove from Presentation | Safe-ish（不删 Artifact） | 无 |
| Delete Artifact | Destructive（级联 views/revisions） | 必须单独清单 + 用户确认 |

- 删除前先出清单（id + 原因），用户确认后才 apply。
- apply 前快照自动存在；rollback 恢复 Presentation（已删 Artifact 不恢复）。
