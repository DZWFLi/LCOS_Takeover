# Diagnostic: Verify Ingest

检查：

- 每个新节点独立可读、有来源
- 无 raw-message explosion（节点数远小于消息数）
- 无重复节点（search 复查）
- provenance 存在
- 未创建 Managed Run
- 每个新节点 label 符合 policies/node-labeling.md：1-5 词短命名、label ≠ content 全文截断、不重复父级名
- 每个新节点 position 已落值（policies/layout-recipes.md 五坐标模板之一，非空坐标）

失败 → 记录 correctionRefs 并修正。
