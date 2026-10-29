---
name: local-creative-os-frontend-loop
description: 开发、排障、评审或视觉打磨 LCOS 自身前端。用于 Main/Context/Workflow/Capture/Reader、节点与关系、拖拽/选择/Focus/Search、Agent Review、响应式与真实浏览器验收。Core/Runtime/Schema 问题走 local-creative-os-backend-flow。
role: dev-frontend
version: 2.0.0
estimatedTokens: 980
readOrder: ["references/current-product-principles.md", "references/interaction-browser-loop.md"]
---

# LCOS Frontend Loop

## 何时用 / 何时不用

用：LCOS GUI、Canvas/Surface、节点、拖拽、Reader、Capture、Search/Focus、Context/Workflow 交互、视觉/响应式和浏览器回归。
不用：Core/Bridge/Desktop Runtime/Schema/MCP wiring 的主故障，转 backend-flow；用户项目内容整理走 Curator。

## 最小流程

```text
1. 先读当前 repo + 最新冻结 GUI 规则；旧 Make/PASS8 视觉稿只作历史兼容，不自动当当前真相
2. 复现一个具体交互/视觉缺陷，确认 owner 与当前数据路径
3. 一次只改一个可感知 slice，保留 Entity / Core truth / user state
4. 真实浏览器执行鼠标/键盘/拖拽序列，不用 build PASS 代替手感
5. 检查 Console、坐标、选择、边、reload 与 conflict/review 状态
6. 视觉 slice 按当前 design system / actual viewport 比较
7. 跑相关 type/test/smoke；里程碑再跑完整 Golden Path
8. 汇报真实可用变化、最大 blocker、下一 slice
```

## 章节目录

| 章节 | 文件 | 什么时候读 |
|---|---|---|
| 当前产品原则 | references/current-product-principles.md | 每次改 GUI 前（必读） |
| 交互/浏览器循环 | references/interaction-browser-loop.md | pointer、拖拽、布局、review、回归 |
| 视觉系统 | references/visual-system.md | 样式、层级、响应式、设计一致性 |
| PASS8 历史根稿 | references/legacy-pass8-root.md | 只追旧 Make-era 行为/兼容时 |

## 硬规则

1. **Entity First, Surface Second。** Main/Context/Workflow 的同一对象保持同一身份，不为 Surface 复制 Truth。
2. 用户直接操作优先：拖、选、写、连、Drop 到哪就表示在那使用；不要用额外表单重新询问已经通过动作表达的意图。
3. Main Canvas 始终自由移动；不存在永久“自由/整理”双模式。Agent 整理走可审查 ChangeSet，不抢用户手工位置。
4. Search 与 Focus 分离：Search 找未知对象；Focus 只回答当前已选对象“在哪”，不混成多个搜索模式。
5. Reader 是临时阅读层，不重新变成永久 Inspector；Sidecar/Companion 不变第二个 Chat/Agent 管理台。
6. Context 解决“这次一起理解什么”；Workflow 解决“接下来怎么做”。Material 与 Step 必须区分。
7. 高频 pointer/viewport 更新不写全局业务状态；text input 永远优先于 Canvas shortcut。
8. fixture/mock 不得冒充 runtime；reload/persistence 与真实 Core 状态是验收的一部分。
9. 真实浏览器证据优先；“能渲染”不等于交互通过。
10. 前端 Skill 自身保持薄入口，过时产品规则放历史 reference，不常驻本轮上下文。
