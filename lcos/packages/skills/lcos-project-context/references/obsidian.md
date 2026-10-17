# Obsidian 只读连接器

用户明确要求连接/导入 Obsidian Vault 时：

```text
scan_lcos_obsidian_vault → 展示只读扫描结果 → 用户挑选 → import_lcos_obsidian_notes
```

连接器只把选中的 Markdown 复制进 LCOS；绝不编辑、删除、重命名或同步 Vault 内文件。
用户未明确要求时不打开原生目录选择器。
