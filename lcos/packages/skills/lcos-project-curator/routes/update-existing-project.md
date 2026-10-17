# Route: update_existing_project

## 流程

```text
search existing（标题/正文/来源）
→ 定位目标节点/关系
→ decide update/reuse/skip
→ apply（只改需要改的）
→ verify
```

## 硬规则

- 命中已有节点 → 更新摘要/关系，不新开重复节点。
- 用户手工改过标题（manual）→ 不覆盖，只建议。
- 不扩大来源范围：用户给什么整理什么。
