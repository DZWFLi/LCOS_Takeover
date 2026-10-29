# Route: ingest_capture_batch

## 流程

```text
lcos capture pending（最近批次）
→ search project candidates（每个项目搜一遍，别猜）
→ read source previews/metadata（不读全文件）
→ resolve project（高置信直接归；不确定按内容+search 判断；仍不确定保持 staging）
→ reuse/import（hash 去重）
→ curate nodes（提炼，不逐条展开）
→ presentation（加入合适视图）
→ verify
```

## 硬规则

- Capture 本身不等 LLM：整理时才理解，理解结果只作候选。
- 同一截图/文件出现在 clipboard + watch folder → 一个 Artifact（hash 去重）。
- 不创建 Managed Run。

## 条件加载

- Project 归属不确定 → 保持 staging，不弹选择器
- 需要命名 → `policies/naming.md`
