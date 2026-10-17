# Current LCOS GUI Principles

这是当前前端默认产品真相；与旧 Make/PASS8 规则冲突时，以当前 repo + 最新冻结稿为准。

## 一套壳，三个工作现场

```text
Main Canvas   我有哪些东西、怎么摆
Saved Context 这次哪些东西需要一起理解
Workflow      接下来怎么做
```

共享：Entity identity、Selection、Drop、Focus、Reader、Agent Review。

## 同一个东西不换脸

- 同 Entity 跨 Surface 保持稳定身份与主要视觉 spine。
- Surface 个性主要体现在对象之间：Main 是自由空间；Context 是局部组合；Workflow 是方向/顺序/分支。
- Drop 表示“在这里使用同一个 Project 对象”，不是 clone。

## Context

- Drop 到 Context 即加入本次长期 Context Surface，不需要先点“添加上下文”。
- 支持 Source Fragment；Fragment 保持来源锚点。
- 轻区域、自由移动、Agent 语义整理；不强制业务 ontology。
- Saved Context 与 ActiveContext 不同；任务输入由 Project Context Skill 冻结。

## Workflow

- Material 与 Step 分开；Material 仍是原 Entity。
- 简单顺序用 Edge，不造 Serial operator。
- Context → Workflow 默认只搭结构，不自动执行。
- 已有材料 Drop 到 Step = 作为输入，不弹工程配置表。

## Agent organize

目标行为：

```text
select / instruction
→ Agent 直接形成当前 Surface 的候选变化
→ Keep / Revert / Keep All / Revert All
```

当前 Core 若仍是 proposal/ghost/apply/rollback，前端按真实 capability 映射，不伪装不存在的状态。

## Search / Focus

- `Ctrl/Cmd+F`：Search，不知道对象在哪/叫什么时使用。
- `F`：当前 Selection 的 Focus/“在哪”，只读定位同一对象在哪些 Surface 出现。
- 不暴露 FTS / vector / database 等底层模式开关。

## Reader / Companion

- Reader 临时从节点长出，Canvas 边缘仍可见；Esc 返回。
- 文档局部摘取保留 source identity。
- Companion 只做轻量当前项目/最近变化/失败提示；不常驻 Agent 列表、Prompt Composer、第二聊天窗。
