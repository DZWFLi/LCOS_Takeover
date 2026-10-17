# Route: context_edit

用于裁剪、补充、比较、分支已有 **Saved Context**。

```text
read current Saved Context
→ identify explicit keep/remove/add/branch intent
→ read only affected sources
→ capability gate
→ proposal / branch / compare
→ user review
→ verify-context
```

硬规则：

- 大范围修改优先 branch/proposal，不静默覆盖已确认 Context。
- “移出 Context”只改变该 Surface membership，不删 Artifact。
- 用户说“只保留这些”时也要保留被引用 Fragment 的 provenance。
- 不把 ActiveContext version 当 Saved Context version。
