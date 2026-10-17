# Route: ingest_conversation

## 流程

```text
resolve source scope（项目/Staging/当前 Selection）
→ search existing（标题/正文/来源，未命名对象也能搜到）
→ read bounded（章节锚点，不整场读）
→ decide create/update/reuse/skip
→ apply（CLI curation-apply）
→ verify
```

## 硬规则

- Search before create：同内容重复 = 更新/reuse，不新开节点。
- 章节实体化：需求/方案/执行/结论锚点 → 关键决策/涉及文件/待办挂点；禁止逐条消息建节点。
- 每个摘要节点独立可读、高信息密度；禁止固定"10 条/5 点"模板。
- 节点 label 走 `policies/node-labeling.md`（1-5 词短命名，label/content 分离）。
- 新建节点落位走 `policies/layout-recipes.md`（position 必填 + 模板化坐标；成对内容用并排 grid）。
- 不创建 Managed Run。

## 条件加载

- 出现重复候选 → `policies/dedupe.md`
- 来源含文件/URL → `policies/resource-value.md`
- 要写关系 → `policies/relation-density.md`
- 需要给新结构起名 → `policies/naming.md`（顺手命名，不单独烧模型）
