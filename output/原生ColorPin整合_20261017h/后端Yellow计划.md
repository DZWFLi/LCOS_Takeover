# Color Pin 后端 Yellow 计划

- 目标：保 TapNow 原入口，接已有 Core snapshot/assign/remove/navigation；补项目共享 definition.label 的正式更新 owner。
- 实际源码：metadata-repository 采用只读 currentGen2Root 原件，经 lab build transform 使用；MutationSafety、color-pins route、ColorPin typed client、ChangeItem 类型采用第三工作区副本。原件不改，候选不写/不重启。
- 变更：新 lab 窄 transform 对原 curation transaction 加 definition label update（主键、color、createdAt、membership 不变）；MutationSafety 记原 ChangeSet before/after，并支持准确状态核对后的 revert/redo。新增同项目 PATCH，旧 label+updatedAt 作正常 CAS。
- Wire：PATCH `/projects/:pid/color-pins/definitions/:id` `{label,expectedUpdatedAt,expectedLabel:string|null}`；label trim 后 1–500 字符。原 envelope value `{definition}`，真实变更才有 meta.changeSetId。
- 测试：真实临时 Core 原 assign/remove、多色、foreign target/project；rename ID/关系保持、并发冲突、不变、GET 核对丢回包、事务失败不留半写、原撤回/重做与后续变更拒旧撤回。0 模型/Run/候选写。
- 风险：跨前后端接口与已存 ChangeSet 的一项增量；不改 schema/table，不新增 hash/ledger/gate，不删除重建定义。builder/start 由根线程串行接线后才进候选，未实屏不能称完整融合。
- 回退：停用新 transform / 路由映射；旧 assign/remove 与持久关系不改。已有新 rename ChangeSet 需要保留对应 inverse/forward 支持，不能在带新数据的运行库里剥除 undo handler。
