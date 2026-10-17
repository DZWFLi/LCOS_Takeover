# Route: context_build

目标：从用户当前选择、来源片段、已有 Project Entity 建立 **Saved Context**。

```text
resolve explicit selection / source scope
→ search existing
→ read bounded source + direct relations
→ decide membership / grouping
→ capability gate
→ create/reuse Saved Context proposal
→ user review / apply（能力存在时）
→ verify-context
```

硬规则：

- Selection first，不默认读整个 Project。
- 同一 Entity 只建立 Surface membership，不复制 Artifact。
- 文档局部必须保留来源锚点。
- Saved Context 不等于 ActiveContext；本 Route 不创建 Run。
- 当前 Core 没有 Saved Context 写能力时，只输出结构化 proposal，不编造工具。
