# Saved Context / Workflow 与 ActiveContext 边界

LCOS 现在有两类名字相近但职责不同的“上下文”。

```text
Saved Context / Workflow / Presentation
= 项目长期可见、可编辑、可摆放的工作现场
= 由 lcos-project-curator 组织

ActiveContext / ContextManifest
= 当前 Agent Task 正在使用、带 version 的冻结输入
= 由 lcos-project-context 管理
```

## 从 Surface 到任务

用户在 Main / Saved Context / Workflow 里选中对象并要求“参考这些改一下”时：

```text
当前 Selection / Target
→ bind Project
→ get latest ActiveContext
→ apply/propose context command（仅任务输入）
→ validate Agent Plan
→ freeze ContextManifest
→ Run
```

同一 Entity 不复制；Selection 只是把已有 Entity 投影到本轮 ActiveContext。

## 绝对不要

- 不把 Saved Context membership 当成 ActiveContext CAS version。
- 不用 `apply_lcos_context_command` 偷偷重排/删除 Saved Context Surface。
- 不因为 Run 冻结了 ContextManifest 就锁死长期 Saved Context；长期 Surface 的后续变化只影响未来任务。
- 用户要“整理 Context / 做成 Workflow”时，转 `lcos-project-curator`，不是创建 Run。
