# Diagnostic: Verify Retrieval

检查：

- 每个引用都能定位（id/来源）
- 上下文最小（没拉全图）
- 未进入 write path
- 未创建 Managed Run
- related 1-hop ≤5，超出必须说明理由
- 检索到的内容与任务目标相关（不把无关节点塞进上下文）
- 未命名对象靠 body/source 检索，不因无标题而漏检

失败 → 记录 correctionRefs 并修正（补引用、收窄上下文、或重新 search）。
