# Policy: Naming

规则：短、可区分、贴合当前内容、不虚构业务阶段、不重复父级已有信息。

例子：父级 `PortaSplit` → 子 Context 叫 `EP05 客户反馈`，不叫 `PortaSplit EP05 客户反馈 Context`。

边界：
- auto 模式可直接更新标题；manual 只建议；locked 拒绝。
- 命名按需发生：不每个结构创建都调 LLM；Curator 顺手命名 / 批量 rename。
