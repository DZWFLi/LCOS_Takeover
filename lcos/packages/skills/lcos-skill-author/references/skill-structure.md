# Skill 结构规范（执行版 v2）

先读 `packages/skills/SKILL_SPEC.md`。

## Simple Skill

适合单一职责：

```text
<skill>/
  SKILL.md
  references/?
  scripts/?
  agents/?
```

## Indexed Skill

只有明显不同 intent 不应该同时加载时使用：

```text
<skill>/
  SKILL.md
  skill.index.yaml
  routes/
  policies/
  recipes/
  diagnostics/?
  failures/?
  evals/?
  cli/?
```

根 `SKILL.md` 只保留 discovery、最小路由、通用硬规则；细节按需读。

## 七段式方法结构

```text
ROUTE            输入走哪条路径
INPUT BUDGET     每次最大方法/证据读取范围
METHOD           可复现步骤
CONSTRAINT       不许做什么
DIAGNOSTIC       结果不对如何定位
FAILURE CATALOG  症状 → 根因 → 规则
FALLBACK         主路径失败的合法降级
```

七段可以分布在 Route/Policy/Diagnostic/Failure 文件中，但不能在包里实际缺失。
