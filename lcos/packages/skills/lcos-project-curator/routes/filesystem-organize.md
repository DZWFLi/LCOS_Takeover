# Route: filesystem_organize

目标：按当前 Context / Workflow 逻辑整理真实项目文件夹。

```text
read current Context / Workflow intent
→ inspect bounded real directory inventory（能力存在时）
→ detect protected / dependency-risk / ambiguous items
→ create FileOrganizationPlan
→ preview
→ user confirm
→ Local Core apply（只有正式 capability 存在时）
→ verify-filesystem-plan
```

判断原则：

- Context 不是文件夹树；结合项目阶段、现有命名、真实目录与依赖风险再组织。
- 尽量不制造物理重复；不为单个文件类别强行建层级。
- 默认不 delete、不 cross-volume、不改内容。
- File Organization Core capability 不存在时，本 Route **plan-only**。
