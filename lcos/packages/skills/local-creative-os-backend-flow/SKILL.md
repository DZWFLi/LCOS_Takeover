---
name: local-creative-os-backend-flow
description: 维护、排障、升级或验证 LCOS 自身的 Local Core、Bridge、Desktop Runtime、CLI/MCP、Schema、Integration 与发布链。普通用户项目整理不用本 Skill；纯 GUI/交互问题优先 local-creative-os-frontend-loop。
role: dev-backend
version: 2.0.0
estimatedTokens: 1050
readOrder: ["references/system-maintenance.md", "references/ownership-risk.md"]
---

# LCOS System / Backend Flow

## 何时用 / 何时不用

用：LCOS 自己坏了、要改 Core/Runtime/Desktop/Integration、追真实 owner、做 migration/capability sync/release verify。
不用：用户项目内容整理（Curator/Project Context）；纯前端交互与视觉回归（frontend-loop）。

## 最小流程

```text
1. 先读当前 repo / runtime 真实状态，不根据旧聊天猜实现
2. 判断 owner：Core / Bridge / Desktop / CLI-MCP / Schema / Integration / Frontend
3. 选择风险：Green 直接；Yellow 写短 plan 后继续；Red 先停并要求明确批准
4. 先 reproduce / doctor / exact source read，定位最小修改面
5. 实现最小 diff，保持 canonical truth / user data / ownership 不变
6. 先跑目标检查，再跑需要的集成/Runtime/Desktop Gate
7. 读回证据、检查 git diff、更新 capability/docs/tests
8. 只按真实状态 handoff，不把 Fixture/Mock/未验证写成完成
```

## 章节目录

| 章节 | 文件 | 什么时候读 |
|---|---|---|
| 系统维护路由 | references/system-maintenance.md | 每次先判断任务类型 |
| Ownership / 风险 | references/ownership-risk.md | 任何写入前 |
| 验证 / Runtime | references/validation-runtime.md | 调试、测试、Desktop 验收 |
| Release / Upgrade | references/release-upgrade.md | 打包、依赖、Migration、正式发布 |
| PASS8 历史根稿 | references/legacy-pass8-root.md | 只有追旧行为/兼容时 |

## 硬规则

1. **Repository / Runtime 是 LCOS 自身事实源。** 当前 code > schema/migration > tests/generated map > handoff/ADR > 旧文档/记忆。
2. 不直接写 SQLite，不绕 Core 改 canonical Project Truth；用户数据、Skill Learning、真实项目文件属于高保护区。
3. 不 kill all `node.exe`，不抢未知端口，不从脏/错误 worktree 假装测试“最新版本”。
4. Schema/Migration、真实文件写、Run/Bridge 语义、path/hash/overwrite/delete 等 Red 变更必须先明确批准。
5. 修 bug 必须 `reproduce → localize → fix → target verify → regression`；dev PASS 不等于 Desktop Release PASS。
6. CLI/MCP/Skill/GUI capability 有变化时必须同步检查 `Contract → Core → CLI/MCP → Skill → test`，缺一层不宣布完成。
7. 不把运行时环境信息、机器绝对路径、密钥写进根 Skill；从 repo/runtime config 读取。
8. 修改保持小、可逆、保留用户/他人改动；未知 worktree change 先停。
9. 维护任务也遵守 5K LCOS-owned overhead：先 manifest/doctor/rg 精确读取，不 dump 整仓。
