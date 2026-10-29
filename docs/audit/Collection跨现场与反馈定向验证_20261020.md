# Collection 跨现场与反馈定向验证

日期：2026-10-20

结论：本轮 35 项检查通过，六个目标模块 strict ownDiagnostics 为 0。Collection 保持整体，原画布/成员不展开、不挪动；未知结果只通过 GET 核对，并落回原 Drop store。

## 实际范围

- 实际 Collection dispatcher、Collection projection client、生产 source transform 后的 Zustand Drop store、实际 Toast feedback controller。
- actual Library producer 注入成熟 railwayAggregatePayload，验证冻结 aggregate 的来源捕获与投递。
- 受控 HTTP/Canvas API，不连接真实 Core，不写用户数据；真实页面由 Root 验证。
- 类型检查仅计算六个目标模块自身的 syntactic/semantic diagnostics，使用真实 TypeScript、React/Vite 类型及生产 store 注入。不是全仓 tsc。

## 调用链

`原节点 objects / 原 Library aggregate → 原 Drop Router 中的 Collection dispatcher → Dock 或原 Canvas 地址核对 → 原 collections:project → canonical receipt → 原 store settle`

未知结果：`原反馈“核对放置结果” → 同目标 GET → 原 store confirmNativeLibraryPlacementReceipt`，不重发 POST。

## 检查结果

- Main / Context / Workflow 三 Dock；一个 Collection 一次整体 producer，成员与源坐标保留。
- 已有目标 carrier：零 POST，保留目标原位置；多 Collection：各一份整体，第二个落点读取最新目标快照。
- 混合多选整组拒绝；错误 scope、canvas、workspace、Collection 身份/项目、源 origin，以及读取期间源变化均零 POST。
- 响应丢失自动 GET 恢复；仍未知保持原反馈，显式核对只 GET，不 flush、不重放。
- Generic capture 没有伪造 Artifact / View / Revision / FileRecord 字段；原 store 成功 settle 与 Toast 恢复实际执行。
- 冻结 aggregate 不被修改；已捕获可投递，未捕获/旧现场拒绝；payload 克隆不继承原 capture/receipt 证明。

## 文件与命令

- 新增 `scripts/native-surface-collection-drop.test.mjs`。
- 最小类型修正 `lab/pilot/native-library-contexts.tsx`：删除两个抽取 parser 后未使用的声明；按 `message` 属性缩窄 placement result。无行为变化。
- 命令：`node scripts/native-surface-collection-drop.test.mjs`。
- 实证：`output/原生Collection跨现场投递_20261020/helper-test-2026-10-19T20-41-11-929Z.json`。
- 目标类型：`native-surface-collection-drop.ts`、`native-library-drop.ts`、`native-library-drop-feedback.tsx`、`native-library-material-owner.ts`、`native-library-entry.ts`、`native-library-contexts.tsx`。

## 发现与处理

成熟 railwayAggregatePayload 是冻结对象，原先在其上 defineProperty capture 会失败。Root 已改为按原 payload 身份保存非序列化 WeakMap metadata，并让无原来源的 assembly 拒绝；本测试验证修复。

直接把成熟 aggregate 模块引入纯 helper 会连入编辑器 side effects。Root 已把真实函数的注入放在原 UI composition，纯 helper 保留 type import；Node 定向测试可正常执行。

## 未完成与回滚

- 当前画布空白目标新增接线已完成定向复跑：Main / Context / Workflow 均使用实际释放点与原同步链；不依赖 Dock rootCanvas 或自动找空位。缺失/无效落点、错目标/Workspace 拒绝；已有位置保持且零 POST，响应丢失仍只提交一次。
- 补验两个当前 Canvas 已有 Collection：各自 carrier 和位置保持，原同步各一次，零 POST。
- 本轮定向验证无未完成项。
- 不把受控测试当成实屏证据；生产 bundle、实际鼠标与 reload 由 Root 负责。
- 回滚本轮：移除新增测试/本报告，恢复 contexts 的三处小类型修正。未改 Runtime、数据、Dock 或 backend。
