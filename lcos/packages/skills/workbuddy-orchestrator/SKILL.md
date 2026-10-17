---
name: workbuddy-orchestrator
description: 只有用户明确要把任务交给 WorkBuddy / AI Bridge 执行时使用。负责预处理、选择正确项目、创建真实 Bridge Task、验证真实 executor 启动与 Result，再回到 Codex/LCOS Review。普通 LCOS Run 不用本 Skill。
role: orchestrator
version: 2.0.0
estimatedTokens: 920
readOrder: ["references/protocol.md"]
---

# WorkBuddy Orchestrator

## 何时用 / 何时不用

用：用户明确要求 WorkBuddy / AI Bridge 做重执行、办公文件处理、批量任务或既有 WorkBuddy 项目续跑。
不用：普通 LCOS Agent/Executor Run；只是想让当前 Codex 自己做；没有真实 Bridge 路径时不要把手工任务卡冒充 WorkBuddy execution。

## 最小流程

```text
1. 先判断 WorkBuddy 是否真是合适 executor
2. Codex 做高价值预处理：目标、边界、inputs、acceptance
3. 验证 current workspace / project_id / session / Bridge / watcher / executor route
4. 创建真实 Bridge task（assignee=workbuddy）
5. watcher 只证明 routed/assigned；只有真实 WorkBuddy executor start 才算 running
6. 等待 submit_result / real artifacts
7. Codex 按原 acceptance review；不满足则通过同一 Bridge 机制请求下一轮
```

## 章节目录

| 章节 | 文件 | 什么时候读 |
|---|---|---|
| 协议与证据 | references/protocol.md | 每次必读 |
| Bootstrap | references/bootstrap.md | 新项目/新会话/绑定不确定时 |
| 指令与 report mode | references/instruction-format.md | 创建任务前 |
| Feishu 边界 | references/feishu-wakeup.md | 需要 Feishu 唤醒/异常沟通时 |
| PASS8 机器兼容 | references/legacy-pass8-root.md | 只有追旧机器配置/迁移时 |

## 硬规则

1. WorkBuddy 不是 Codex thread/subagent；没有真实 Bridge + executor evidence 就不能声称 WorkBuddy 执行。
2. `project_id` 是真实路由，不是标签；任何 formal WorkBuddy task 都要验证项目映射。
3. watcher routing/claim 只代表 delivered/assigned；不得把它报告成 running。
4. Bridge 是 task/status/artifact authoritative layer；Feishu 只是轻量唤醒/异常通道，不复制完整结果。
5. 不把长聊天历史塞给 executor；同 session follow-up 只传变化、保持项和验收更新。
6. 机器绝对路径、App ID、chat_id、credential 等不常驻根 Skill；从当前 runtime/config 发现，旧值只作兼容证据。
7. Tool 被 provider 延迟加载时先做当前 Host 的 tool discovery；不能因为初始列表没显示就说 Bridge 不存在。
8. 不启用 headless/自动值守，除非用户明确启用且已验证。
9. 结果文本只是索引；正式代码/文件任务以 Bridge evidence + local artifacts/diff 为准。
