# Route: workflow_edit

用于修改已有 Workflow 的步骤、顺序、分支、并行、材料挂载和注意点。

```text
read affected workflow slice
→ identify minimal change
→ preserve referenced Entity identity
→ capability gate
→ reviewable proposal / apply
→ verify-workflow
```

硬规则：

- 只改用户要求的 slice，不重排整条 Workflow。
- 分支语义简单时直接用 Edge label，不发明条件 DSL。
- “删一步”默认删 Workflow Step/Presentation member，不删输入 Artifact。
- 不自动执行流程。
