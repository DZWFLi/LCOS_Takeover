# Diagnostic: Verify Saved Context

检查：

- membership 引用的是已有 Entity / Source Fragment，而不是无来源复制；
- Fragment 的 sourceRef / anchor 可回读；
- 没有把整个 Project 无差别倾倒进去；
- 移出 Context 没有误删 Artifact；
- 写能力存在时，reload/read-back 后 Context 仍成立；
- 没有创建 Managed Run。

当前写能力不存在时：明确记录 `proposal-only / blocked`，不得报告 persisted。
