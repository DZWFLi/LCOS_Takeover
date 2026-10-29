# 读画布上下文

当项目已知：

1. `bind_lcos_project(projectId, workspaceId?)`
2. `get_lcos_active_context(projectId, workspaceId?)`
3. 用户还在选择/移动时，每回合 `watch_lcos_active_context(afterVersion)` 一次
4. 只读任务需要的 Artifact/Revision 内容

ActiveContext 是带版本的 CanvasContextSnapshot，可能包含：

```text
ordered selection / Target / Pinned & Excluded Context / viewport 与可见 View /
节点身份、位置与受控摘要 / 一跳关系 / version / updatedAt / updatedBy
```

不要抓取 React 状态或 DOM。画布快照的 `screenshotRef` 只作视觉证据，
结构化 CanvasContextSnapshot 才是唯一上下文真相（SVG 观察已并入快照，
MCP 精简后不再单独暴露 observation 工具）。

## Obsidian（仅用户明确要求时）

```text
scan_lcos_obsidian_vault → 展示只读扫描结果 → 用户挑选 → import_lcos_obsidian_notes
```

连接器只把选中的 Markdown 复制进 LCOS；绝不编辑、删除、重命名或同步 Vault 内文件。
用户未明确要求时不打开原生目录选择器。
