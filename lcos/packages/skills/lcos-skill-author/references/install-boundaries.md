# Skill 安装边界

## LCOS 系统托管 Skill

canonical source：

```text
packages/skills/<managed-skill>/
```

修改后通过正式 managed installer 同步到 `~/.codex/skills`。禁止直接改安装副本。

## 普通用户 Skill

默认不是 LCOS 源码的一部分。

- 不把用户方法包直接写进 `packages/skills/`。
- 不借 managed installer 覆盖或冒充系统 Skill。
- 如果当前 full-stack 已有正式 user-skill library / installer，使用它。
- 如果还没有：输出 validated package + provenance，明确 `installation pending`，不要发明安装路径。

只有用户明确正在开发 LCOS 系统 Skill 时，才允许进入 managed canonical source。
