# Workspace成员条件写入

2026-10-17。结论：源码接入完成，真实隔离Core专项24项PASS。原Workspace成员POST/DELETE可选择携带准确行/absence条件，旧历史动作不会误删字段已改变的后来成员；普通无头caller保留原行为。候选整页/跨节点生命周期由父任务统一验证，本报告不冒充已上线。

本轮按Local Creative OS Backend Flow的Yellow短计划继续，父任务已明确授权实现和隔离真实Core验证；不操作候选、不改原GN2/只读源、不改Schema或直接写用户SQLite。

- Files：新增`lab/native-core-workspace-membership-transform.mjs`与专项测试；精确变换原`routes/workspace-states.ts`和`mutation-safety-service.ts`。root负责Node-only构建option/注册，不动browser path边界。
- Before/After：当前仅route/helper preflight，await后重加同键成员可被旧DELETE移除；改为原`runCurationMutation`事务callback内比准确row/absence，之后沿原MutationSafety生成/提交ChangeSet。
- Optional input：原URL不改，头`x-lcos-expected-workspace-member`为encodeURIComponent(JSON.stringify(...))；DELETE `{workspaceId,viewId,addedAt,addedBy}`，POST `{workspaceId,viewId,absent:true}`且仅单一view。
- Tests：真实隔离Core/SQLite，正确row删除、条件不符0写入、absent添加、原无头行为、preflight后重加、事务入口前竞争、异常头/错地址与rollback。不用受控数组冒充Core。
- Risk：Git/类型不能保护运行时并发；复合主键仅保证同键一行，无法识别后来替换的行；原事务只保护原plan写入，没有携带旧row条件。现有事务builder能原子检查，无需新锁/表/hash/store/gate。
- Rollback：关闭root的可选Node transform，原文件未改；没有数据migration或新持久化数据。

边界：约定四字段若删除重加后仍完全相同，本身不能区分两次发生；不得声称覆盖该不可辨识情况，也不擅加新身份字段。

## 最终实现

- [精确source transform](../../lab/native-core-workspace-membership-transform.mjs)只变换原`mutation-safety-service.ts`和`routes/workspace-states.ts`。`createNativeCoreWorkspaceMembershipTransforms()`导出两文件map；父任务已接`buildPilotEntry(...,'node',{coreWorkspaceMembership:true})`，默认false，browser明确拒绝。
- 条件分支将原MutationSafety plan放入既有`runCurationMutation(() => plan)`；原repository先`BEGIN IMMEDIATE`，再执行row检查和原ChangeSet构造，之后沿原事务提交。失败走原rollback；成功后才沿原事件发布。无头分支的原statement序列逐条保持。
- 原URL/请求body不变。条件头格式错误、错地址、多View请求返回400；当前row/absence不符返回409。旧caller不加头时沿原增删及幂等行为。

## 实测证据

[真实Core专项脚本](../../scripts/native-core-workspace-membership.test.mjs)；[24项完整JSON](./Workspace成员条件真实Core/2026-10-17T13-14-52.465Z/report.json)。实际临时Core HTTP、原MutationSafety、真实一次性SQLite，无模型、无raw SQL、无候选读写；测试后已关闭临时服务并清理自己的临时runtime。

| 检查 | 结果 |
|---|---|
| 两份实际源parse、幂等、错路径/owner漂移拒变换；无头原method statement保持 | PASS |
| Node-only选项拒browser | PASS |
| 准确row DELETE、准确absence POST，各产生一份原ChangeSet | PASS |
| 已删row/重复absence/旧timestamp/错addedBy；graph、成员、ChangeSet、Presentation逐对象不变 | PASS |
| 10类异常头/错地址/多View/额外字段 | 400，0写入 |
| 无头原新增、移除、重复操作 | PASS |
| 原事务入口前由真实MutationSafety先remove+add；旧DELETE不删新row | 409，竞争提交之后目标0额外写入 |
| 原事务入口前真实producer先add；absence POST不覆盖先到成员 | 409，目标0写入 |
| 原ChangeSet持久化中途抛错 | 事务完整rollback，成员等对象与之前相同 |

竞争时序由测试在真实事务入口处控制，竞争写入走原producer与同一SQLite；不是多进程调度压力测试。24项为JSON中case数，包含两个source项及10个异常输入子项，不表示24条整页流程。

## 保留边界

约定的四字段是现有row事实，不是新的发生身份。若删除重加后`workspaceId/viewId/addedAt/addedBy`仍全部相同，仍无法区分；本轮没有擅加epoch、hash或表。实际删除重加验证刻意使用不同`addedBy`保证可辨识。

本专项验证原Core写入原子性，不替代父任务的旧节点恢复、unknown核对、原Undo/Redo与整页闭环结果。
