# Policy: Context Budget

- 能少读就少读：先 search 命中，再 read 必要片段。
- spatial 检索候选按 hint 处理：hierarchy/presentation edge/几何近邻只用于
  recall 排序，不构成语义依据；是否纳入上下文以读到的内容为准。
- related 扩展：种子 ≤10，邻居 ≤5。
- 语义搜索首次慢（Ollama 冷启动）：先拿 FTS 结果，vector 结果后到补齐，不阻塞。
- 每次执行记录 loaded chars，超 24k 说明原因。
