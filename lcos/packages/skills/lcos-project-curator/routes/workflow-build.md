# Route: workflow_build

目标：让已经成立的 Saved Context / 项目材料长成下一步行动结构。

```text
read selected Context/materials
→ identify start / target stage
→ distinguish materials from steps
→ build lightweight step sequence / branch
→ attach existing Entity as inputs
→ capability gate
→ proposal / apply
→ verify-workflow
```

硬规则：

- 材料仍是原 Project Entity；Step 只表达“这一步做什么”。
- 简单 A→B→C 用 Edge，不创建“Serial”运算符节点。
- 默认 **只搭，不自动执行**；Curator 绝不创建 Managed Run。
- 不因为方便把 Workflow 变成 n8n 式工程配置表。
