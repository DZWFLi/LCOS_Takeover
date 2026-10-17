# Failure: Review Conflict

症状：用户在 Agent proposal 后又手改对象，旧 Revert/Apply 覆盖了新状态。

修正：version/CAS 冲突后重新读取；旧 ChangeSet 失效或只作用于仍匹配的对象。

验证：用户后续修改不被旧 Review 动作覆盖。
