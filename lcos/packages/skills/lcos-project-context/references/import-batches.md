# 最近导入批次

当用户说“刚导入这一批”“刚导入的文件”或 `latest import batch` 时，不要根据时间戳、画布位置、文件名或最近修改时间猜。

```text
get_lcos_latest_import_batch(projectId)
→ 读取 ImportBatchRefV1
→ 使用返回的 artifactIds / revisionIds / viewIds 作为这一轮输入
```

若用户明确给出 batch ID：

```text
get_lcos_import_batch(projectId, batchId)
```

`ImportBatchRefV1` 只表示一次用户可见的导入动作的 provenance，不等于 Collection、Context、分类或业务关系。

如果返回为空，明确告诉用户当前项目没有可解析的持久化导入批次；不要退回到“猜最近文件”。
