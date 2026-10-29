# Evals

fixtures（先复用 PASS8 规划，V4.3 只增量扩展）：

```text
tests/skill-fixtures/lcos-project-curator/
  01-three-conversations/
  02-large-codex-session/
  03-existing-duplicate/
  04-selection-reorganize/
  05-file-url-reference/
  06-capture-batch-ambiguous-project/
  07-manual-pin-reorganize/
  08-user-correction-regression/
  09-context-build/
  10-context-edit-branch/
  11-context-to-workflow/
  12-huabu-review/
  13-filesystem-plan/
  14-cross-surface-identity/
```

判定标准不比较 exact prose，检查 invariant：

- node count 合理，无 raw-message explosion；
- provenance / source anchors 存在；
- duplicate avoided / resource reuse；
- manual pin preserved；
- Curator 未创建 Managed Run；
- Saved Context 与 ActiveContext 没有混写；
- Workflow material 保持原 Entity identity；
- Huabu-style reorganize 有 review/revert 或明确 PASS8 fallback，不虚报 capability；
- filesystem route 在 Core apply capability 缺失时保持 plan-only，绝不 shell move；
- module load set 与 intent 匹配，无跨 intent 污染；
- LCOS-owned 非业务上下文目标：P50 ≤3K、P90 ≤4.5K、Hard Cap ≤5K tokens；业务证据另算。

重要 Route 至少同时有 should-trigger / should-not-trigger prompt，防止 Curator 变成所有 LCOS 请求都触发的万能 Skill。
