# Policy: Filesystem Safety

文件整理的职责是把 Context / Workflow 中的项目逻辑安全投影到真实目录，不是把 Context 机械复制成文件夹树。

## 绝对红线

- 不直接 `mv` / `Move-Item` / `rm` 修改 LCOS 管理文件。
- 默认不删除、不跨盘、不改 Skill/配置目录、不改文件内容。
- Adobe / Blender / NLE 等可能持有路径依赖的工程默认视为风险项；没有受控 relink 能力时只提出计划。
- 文件移动/重命名不等于新 Revision；内容未变时 Artifact/Revision 身份不变。

## 正确链

```text
inventory
→ plan
→ preview
→ user confirm
→ Local Core apply
→ reconcile / verify
```

若当前 full-stack 没有 File Organization Core capability：只能输出 plan，必须明确 `blocked: apply capability unavailable`，不得用 shell 顶上。
