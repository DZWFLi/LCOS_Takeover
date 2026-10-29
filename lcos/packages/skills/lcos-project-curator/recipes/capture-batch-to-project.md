# Recipe: Capture Batch → Project

```text
lcos capture pending → items
→ 每个 item：search existing（项目内 + 全局）
→ 已存在 → reuse
→ 未存在 → 按 kind 导入（url→resource，file→import，text→createText）
→ 建立来源关系（captured source → node）
→ 加入 Presentation
```

同一截图多来源（clipboard + watch）→ hash 去重。
