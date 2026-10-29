---
name: lcos-skill-author
description: 把项目里反复成立的方法炼成可复用 LCOS Skill。触发：把这些炼成 Skill / 把经验做成 Skill / skill author / 沉淀成方法论。普通项目整理走 Curator；修改 LCOS 系统 Skill 时必须写 canonical source，普通用户 Skill 不得默认写进 packages/skills。
role: agent
version: 1.1.0
estimatedTokens: 1000
readOrder: ["references/skill-structure.md", "references/method-vs-fact.md"]
---

# LCOS Skill Author

## 何时用 / 何时不用

用：用户选定执行标准、踩坑经验、检查规则、交付规范，要求炼成可复用方法。
不用：普通文档/Context/Workflow 整理（Curator）、一次性脚本、没有跨项目复用价值的项目事实。

## 最小流程

```text
1. 只读用户明确 Selection / SkillTrace / correction evidence
2. 分 Method vs Fact：换项目还能成立的才进 Skill
3. 决定 Simple Skill 还是 Indexed Skill
4. 形成 ROUTE / INPUT BUDGET / METHOD / CONSTRAINT / DIAGNOSTIC / FAILURE CATALOG / FALLBACK
5. 按 SKILL_SPEC v2 写包；根 SKILL.md ≤2K tokens，细节按需拆分
6. validate：触发互斥 / 引用路径 / 体积 / capability 不虚构 / eval or quality checks
7. 安装边界：系统托管 Skill 写 canonical source 后走 managed installer；普通用户 Skill 若无正式 user installer，停在 validated package，不借 managed installer 覆盖系统 Skill
8. 登记 provenance：derived from → 源 Selection / Trace / evidence
```

## 章节目录

| 章节 | 文件 | 什么时候读 |
|---|---|---|
| Skill 结构规范 | references/skill-structure.md | 写任何 Skill 前（必读） |
| 方法与事实判断 | references/method-vs-fact.md | 判断哪些进 Skill 时 |
| Indexed Skill | references/indexed-skill.md | 多个互斥 intent 时 |
| 安装边界 | references/install-boundaries.md | validate 后准备安装时 |
| 质量检查 | references/quality-checks.md | validate 前 |

## 硬规则

1. 不新建 Skill Domain Runtime；Skill 是文件化程序性知识，真实 Project/Core 仍由现有系统拥有。
2. 不把项目事实写成通用方法；示例必须脱敏并标明只是例子。
3. 只有多个明显互斥 intent 才用 Indexed Skill；不要把所有 Skill 做成 Router 工程。
4. 必须包含七段方法结构；脆弱/高风险动作写得更确定，可变创意判断保留必要自由度。
5. 工具/命令只写真实存在且验证过的 capability；不存在就写 blocked/fallback，不发明。
6. 生成后必须 validate；重要 Skill 要有 should-trigger / should-not-trigger 与真实 regression case。
7. 不能因为一次失败自动改生产 Skill；Trace/Badcase 先形成候选，再验证、再晋升。
8. 普通用户 Skill 不得默认写进 `packages/skills/` 或覆盖 managed Skill。
