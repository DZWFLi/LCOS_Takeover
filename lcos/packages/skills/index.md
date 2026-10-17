# LCOS Skill 索引

> `packages/skills/` 是 canonical source。托管安装集合以 `managed-skills.json` 为准；
> `~/.codex/skills` 只是安装副本。PASS8 旧版“backend/frontend/workbuddy 未托管”已在本次升级收敛。

| Skill | 角色 | 根 SKILL 目标 | 触发 | 托管状态 |
|---|---|---:|---|---|
| `lcos-project-context` | agent | ≤2K | 普通 Agent 项目任务：读取 ActiveContext、形成 Agent Plan、创建 Run | 已托管 |
| `lcos-project-curator` | agent | ≤2K | 整理/沉淀/Context/Workflow/Presentation/项目结构 | 已托管 · Indexed |
| `lcos-skill-author` | agent | ≤2K | 把已验证的方法炼成 Skill | 已托管 |
| `lcos-executor-run` | executor | ≤2K | `LCOS 接单提示` / 已派发 Run | 已托管 |
| `local-creative-os-backend-flow` | dev-backend | ≤2K | LCOS 自身 Core/Runtime/Desktop/Integration 维护与排障 | 已托管 |
| `local-creative-os-frontend-loop` | dev-frontend | ≤2K | LCOS 自身 GUI/交互/浏览器验收 | 已托管 |
| `workbuddy-orchestrator` | orchestrator | ≤2K | 明确要求派 WorkBuddy / AI Bridge 执行 | 已托管 |
| `lcos-workspace-steward` | agent | ≤2K | 经营三张 Surface 与 Web Workbench 的可撤销空间意图 | 已托管 |

另有：`opendesign/design-systems/lcos-product/SKILL.md`。它是 PASS8 的 Design System Skill，**不属于**上述 canonical runtime managed skills，不进入 `managed-skills.json`。

## 路由边界

```text
普通项目任务
→ lcos-project-context

项目整理 / 沉淀 / Saved Context / Workflow / Presentation
→ lcos-project-curator

把稳定方法炼成 Skill
→ lcos-skill-author

LCOS 接单提示 / executor session
→ lcos-executor-run

改 LCOS 自己：Core / Runtime / Desktop / Integration
→ local-creative-os-backend-flow

改 LCOS 自己：GUI / interaction / browser validation
→ local-creative-os-frontend-loop

明确派 WorkBuddy
→ workbuddy-orchestrator
```

## `lcos-project-context` 与 Curator 的关键区别

```text
Saved Context / Workflow / Presentation
= 项目长期工作现场，由 Curator 组织

ActiveContext / ContextManifest
= 当前 Agent Task 的冻结上下文，由 Project Context 管理
```

Saved Context 的 Selection 可以成为 ActiveContext 输入；Project Context 不负责重排 Saved Surface。

## 读取纪律

- 执行器回合：只读 `lcos-executor-run`，不读 `lcos-project-context`。
- Curator：先读根 `SKILL.md` + `skill.index.yaml`，然后通过 `lcos skill resolve` 只加载当前 intent。
- Dev Skill：根入口只做 owner / route / hard rule；专项规则按 references 读取。
- WorkBuddy：只有真正选择 WorkBuddy 路线时加载，不把机器相关兼容信息常驻普通 LCOS 会话。
- 普通 LCOS 修改任务的 LCOS-owned 非业务上下文目标：P50 ≤3K、P90 ≤4.5K、Hard Cap ≤5K tokens。
