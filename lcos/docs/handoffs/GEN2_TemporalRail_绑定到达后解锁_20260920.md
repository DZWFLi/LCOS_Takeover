# GEN2 Temporal Rail 节点绑定到达后解锁

- 问题：Temporal Index 比画布 reconcile 更早返回时，Rail 首次把 Episode 判为 disabled；后续 `nodeEntityRefs` 到达不会触发重算，真实时间组一直点不了。
- 修正：`TemporalRail` 订阅既有 `useLcosReferenceStore.nodeEntityRefs`，不新增 Store；绑定注册后重新解析 canonical target → Huabu nodeId。
- 真实验证：隔离 Context 先返回 `MID 16 条记录`，随后真实绑定注册，按钮从 disabled 自动解锁；4 个 LCOS 物种节点可见，console/page/http error 均为 0。
- 证据：`.e2e-data/shots/temporal-durable-index-context.png`
- 未扩范围：仍不做 Agent 语义 Episode、多目标 camera fit 或 wheel 时间窗口。
- 回滚：还原 `TemporalRail.tsx` 对 reference map 的订阅即可。
