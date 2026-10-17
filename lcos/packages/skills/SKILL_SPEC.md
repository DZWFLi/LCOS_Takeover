# LCOS Skill 结构规范（v2）

本文件是 `packages/skills/` 下 LCOS 托管 Skill 的唯一结构标准。
`packages/skills/` 是 canonical source；`~/.codex/skills` 只是安装副本，禁止直接手改。

## 1. 两种合法形态

### 1.1 Simple Skill

适合单一职责、少量分支：

```text
packages/skills/<skill-name>/
  SKILL.md
  references/?
  scripts/?
  agents/?
```

### 1.2 Indexed Skill

只有当一个 Skill 内存在多个明显不同的 intent，且这些 intent 不应同时加载时才使用：

```text
packages/skills/<skill-name>/
  SKILL.md
  skill.index.yaml
  routes/
  policies/
  recipes/
  cli/?
  diagnostics/?
  failures/?
  evals/?
  scripts/?
  agents/?
```

`lcos-project-curator` 是当前 Indexed Skill 的 canonical 参考实现。
不要因为目录更“高级”就把所有 Skill 升级成 Indexed。

## 2. SKILL.md 只负责入口

`SKILL.md` 只放：

1. 何时用 / 何时不用；
2. 最小流程或 intent 路由；
3. 按需读取目录；
4. 全流程都不能违反的硬规则。

细节、历史兼容、失败案例、专项检查、机器相关环境信息必须放到按需文件。

目标：`SKILL.md` 本体 ≤ 2K tokens；工程 Gate 继续使用 `< 6KB UTF-8 文本` 作为保守静态上限，真实 token 由运行时 telemetry 校准。

## 3. Frontmatter

所有托管 Skill 的 `SKILL.md` 必须包含：

```yaml
---
name: <skill-name>
description: <清楚说明触发场景与边界>
role: agent | executor | dev-frontend | dev-backend | orchestrator
version: <semver>
estimatedTokens: <SKILL.md 本体估算，不含按需文件>
readOrder: [<默认必读或第一跳文件>]
---
```

规则：

- `description` 用于 discovery，不写宣传语；必须能区分相邻 Skill。
- `estimatedTokens` 只描述根 `SKILL.md`，不把整个包体积混进去。
- `readOrder` 只列默认下一跳；条件文件不要全部塞进这里。
- 真实运行应记录实际加载量；静态估算不能成为唯一依据。

## 4. Indexed Skill 规则

`skill.index.yaml` 当前 schema 继续兼容 PASS8 resolver，只使用已经被 `lcos skill resolve` 支持的结构：

```yaml
schema_version: 1
skill: <name>
version: <semver>
routes:
  <intent>:
    triggers: []
    entry: routes/<route>.md
    base_load: []
    conditional_load: {}
    budget:
      max_reference_files: <n>
      max_reference_chars: <n>
```

在 CLI resolver 未升级前，不得向 index 加入 resolver 不认识的复杂字段，再假装运行时会使用。

每次调用：

```text
先定 intent
→ lcos skill resolve
→ 只加载 entry + base_load + 当前 conditions
→ 执行
→ verifier
→ SkillTrace
```

禁止无 intent 时读取整个 Indexed Skill 包。

## 5. 5K 上下文纪律

普通 LCOS 修改任务的 **LCOS-owned 非业务上下文** 目标：

```text
P50 ≤ 3K tokens
P90 ≤ 4.5K tokens
Hard Cap ≤ 5K tokens
```

这里包括：

- Skill / Route / Policy 方法说明；
- Tool / MCP schema；
- Runtime 语义状态说明；
- 热 Tool Result / Receipt / Verifier。

不包括任务真正需要阅读的 Brief、脚本、客户反馈、PDF 页面等业务证据。

压缩顺序：

1. 先按 intent 少加载；
2. 先利用 GUI / Runtime 已知状态，不让模型重新猜；
3. 大工具结果返回摘要 + handle，不整包回灌；
4. 已完成的详细 Tool Result 留 Trace，只保留紧凑回执；
5. 绝对安全规则下沉 Core，不在每个 Route 重复长篇描述。

不得为了守 5K 而截断用户真正需要的业务证据。

## 6. 角色边界

- `agent`：项目理解、项目整理、方法提炼；不得冒充 executor。
- `executor`：只执行已派发 Run；不改项目组织面。
- `dev-backend`：LCOS 自身 Core / Runtime / Desktop / Integration 维护。
- `dev-frontend`：LCOS 自身 GUI / 交互 / 浏览器验收。
- `orchestrator`：外部执行器编排；不是 LCOS Project Truth owner。

触发必须互斥：

- `LCOS 接单提示` → `lcos-executor-run`；
- 普通项目任务 → `lcos-project-context`；
- 整理 / 沉淀 / Context / Workflow / Presentation 组织 → `lcos-project-curator`；
- 把经验炼成 Skill → `lcos-skill-author`；
- 改 LCOS 自己 → backend-flow / frontend-loop；
- 明确派 WorkBuddy → workbuddy-orchestrator。

## 7. Project Context 与 Curator 的边界

这是 v2 新增的硬边界：

```text
Saved Context ≠ ActiveContext

Saved Context / Workflow / Presentation
= 项目长期可见工作现场，由 Curator 组织

ActiveContext / ContextManifest
= 当前 Agent Task 的冻结上下文，由 lcos-project-context 管理
```

Saved Context 的 Selection 可以进入 ActiveContext；ActiveContext 不反向拥有或偷偷改写 Saved Context。

## 8. 能力存在性

任何 Skill 在写入前必须遵守：

```text
Contract → Core route → CLI/MCP/tool → Skill declaration → test
```

缺任何一层：

- 读操作可按现有降级路径处理；
- 写操作必须停止在 Proposal / blocked；
- 不得编造命令、Endpoint、MCP tool 或“已经应用”。

## 9. Managed 与 User-authored Skill

- `packages/skills/managed-skills.json` 定义 LCOS 系统托管 Skill 安装集合。
- 系统托管 Skill 跟 LCOS 版本更新。
- `lcos-skill-author` 生成的普通用户 Skill **不得默认写进 `packages/skills/`**，除非用户明确是在开发 LCOS 系统 Skill。
- 当前若没有正式 user-skill installer，Skill Author 必须停在“已验证包 + 待安装”，不得借 managed installer 覆盖系统目录。

## 10. 修改后的最低验证

修改托管 Skill 后至少：

1. 静态检查 frontmatter / 引用路径 / 根体积；
2. 运行相关 architecture contract tests；
3. `npm run lcos:install-skill` 同步 managed 副本；
4. 校验 `managed-by-lcos.json` sourceHash；
5. Indexed Skill 额外验证不同 intent 加载集合不互相污染；
6. 真实行为变化需要 Golden Case / regression evidence。

不能因为 Markdown 已写完就宣布 Skill 能力完成。
