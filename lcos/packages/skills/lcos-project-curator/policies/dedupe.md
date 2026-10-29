# Policy: Dedupe

- 先 hash 后标题：文件按内容 hash；文本按正文归一。
- 同一来源重复捕获 → reuse，不新建。
- 语义重复：标题/摘要高度重合 → 更新旧节点，不新开。
- 无法确认 → 宁可 update 也不 duplicate。
