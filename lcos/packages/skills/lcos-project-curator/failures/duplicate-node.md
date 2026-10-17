# Failure: Duplicate Node

症状：同一内容出现多个节点。

原因：create 前没 search。

修正：保留信息最全的节点，合并其余（更新摘要 + 关系），从 Presentation 移除重复成员。

防复发：任何 create 前 `lcos search`；条件加载 dedupe policy。
