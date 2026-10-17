# Policy: Surface Identity

- 同一个 Project Entity 在 Main / Saved Context / Workflow / Workspace / Presentation 中仍是同一个对象；Surface 只保存“这里如何使用/呈现它”。
- Drop 默认语义是“在这里使用同一对象”，不是复制一份新的 Truth。
- 局部文档摘取保留 `sourceRef + anchor/page/range`，不得变成断源便签。
- **Saved Context** 是项目长期可见、可编辑工作现场；**ActiveContext** 是当前 Agent Task 的冻结上下文。两者不要混写。
- Saved Context 的 Selection 可以成为 ActiveContext 输入；Curator 不通过 ActiveContext 命令偷偷改 Saved Context。
- Workflow 的材料节点继续引用原 Entity；Step 是轻量行动结构，不复制材料内容。
