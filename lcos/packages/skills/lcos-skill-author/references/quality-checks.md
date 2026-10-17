# 质量检查（validate）

```text
[ ] frontmatter 完整：name / description / role / version / estimatedTokens / readOrder
[ ] description 能区分相邻 Skill，有 should-trigger / should-not-trigger 语义
[ ] 根 SKILL.md < 6KB，目标 ≤2K tokens
[ ] Simple / Indexed 选择有理由
[ ] 七段结构在包内齐全
[ ] references/routes/policies 按需读取，不在根文件复制全文
[ ] 不含不必要项目私有事实；示例脱敏
[ ] capability / 命令 / endpoint 真实存在，写能力有 Core owner
[ ] 高风险动作有 verifier / fallback / human confirmation
[ ] Indexed Skill 不同 intent 无模块污染
[ ] 重要 Skill 有 regression / Golden Case；一次失败不会自动改生产 Skill
[ ] managed 系统 Skill 与普通用户 Skill 的安装路径没有混用
```

任一失败 → 修正后重新 validate，不跳过。
