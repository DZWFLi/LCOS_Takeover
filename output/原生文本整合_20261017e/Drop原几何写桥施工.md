# Drop 原几何写桥施工

结论：源码已就绪并冻结。普通材料在原画布移动后，原 `nodes:batchActions` 会把位置同步到既有 Core Presentation；原测量保存的两位小数不会额外推进 Presentation 版本。没有删位置核对，也没有另造布局 owner。本轮未操作候选实例；实际鼠标移动及原 O8 Undo/Redo 等根线程统一构建后验证。

## 接法

| 位置 | 做了什么 |
| --- | --- |
| `lab/pilot/native-material-geometry.ts:18` | 只认现有三个根 Canvas→唯一 Workspace 的真实映射，核 Scope、preferredSurface、原 Presentation；同 Scope 的 child Canvas 不自动当根现场。 |
| `lab/pilot/native-material-geometry.ts:29` | 只处理已有 Presentation 成员和真实 position；核 Canvas binding、View、Artifact、确版 Revision、Scope，不按 View ID 前缀猜归属，不新增 membership。 |
| `lab/pilot/native-material-geometry.ts:47` | 每次异步读取原节点 ref 后重核身份；组内最后一个异步读取结束后再同步重核全部 item。已识别成员失配会明确失败，不静默跳过。 |
| `lab/pilot/native-material-geometry.ts:56` | 准备只读计划；仅原 DC/PC 已知的 `incoming === canonical` 或 `incoming === round2(canonical)` 作为测量回声。prepare/commit 方向一致，`100 → 100.004` 这种合法 finite move 不会被吞。 |
| `lab/pilot/surface-core-facade.ts:710` | 用既有根映射初始化桥；写入走原 Presentation HTTP PUT + `expectedVersion` CAS，只改 positions。 |
| `lab/pilot/surface-core-facade.ts:1243` | 纯 prepare 在正文/标题等 Core 写入之前；不让前置校验出错后把已写数据伪报成整批未执行。 |
| `lab/pilot/surface-core-facade.ts:1280` | 先保存原 Huabu geometry，再提交原 Presentation CAS；空间失败不写布局，布局失败不假 rollback。 |

CAS 后还会重读 binding/View/ref 和 Presentation 位置。已获 Core 接收、随后身份改变时，回执保留真实 `savedPresentationIds`，不会把已经发生的写入抹掉。

## 本轮验证

以下全部是临时隔离真实 Core/原空间 producer；0 Run、0 模型、0 候选写入。

| 命令 | 结果 / 证据 |
| --- | --- |
| `node scripts/native-material-geometry.test.mjs` | PASS。真实并发 Presentation PUT 先胜，原空间仍保存，后续旧 CAS 409，回 `PARTIAL_COMMIT` 和 `spatialSaved:true`；并发 Core 位置不被回滚。prepare/commit/readback 的真实 View Scope 异步变更均不假成功；无根映射/仅 Workspace membership 不写根 Presentation。[报告](./Drop原几何写桥验证/2026-10-17T04-38-30-745Z/report.json) |
| `node scripts/native-material-move-owner-probe.test.mjs` | PASS。正常原 batch move→GET present→repeat already-present 不挪回；反向/正向 geometry body 均同步；同位重试不增版本，旧 CAS 仍 409。[报告](./Drop正常移动owner探针/2026-10-17T04-43-20-260Z/report.json) |
| `node scripts/native-material-receive-precision.test.mjs` | PASS。原 round2 measurement 保持精确 Presentation position **且版本不变**；真实客户端 GET-only 核对；合法原 batch +0.01 同步后 present。故意绕桥的 spatial-only +0.01 不一致仍 partial。[报告](./Drop原序列化精度验证/2026-10-17T04-43-20-266Z/report.json) |
| `node scripts/native-material-receive.test.mjs` | PASS。三根目标、确版历史材料、来源 View 前进后只 GET 恢复、Glyth durable relation、foreign/partial 拒收等九组原功能回归。[报告](./Drop语义目标真实Core验证/2026-10-17T04-40-34-476Z/report.json) |
| `node scripts/native-material-receive-client.test.mjs` | PASS。受控 HTTP peer 的十二组客户端合同验证；不冒充原 O8/浏览器。[报告](./Drop语义客户端验证/2026-10-17T04-40-34-468Z/report.json) |
| 独立 helper review | native_library_flow 六项 PASS：await binding/revision 变化零保存、同 Scope child 排除、测量零计划、100.004 微移确实保存一次、move/back/redo CAS 2/3/4。[报告](../原生Drop整合_20261017f/材料位置helper只读复核_修后.json) |

原移动/反向 geometry 测试只证明真实 HTTP 路径与两个 owner 对齐，**不等同于原浏览器 O8 历史实测**。

## 保留的失败证据

- 无几何桥时，原空间 move HTTP200、Core position 不变，GET partial/repeat409：[原正常移动失败](./Drop正常移动owner探针/2026-10-17T03-57-09-921Z/report.json)。
- 原 measurement round2 导致 partial：[原精度失败](./Drop原序列化精度验证/2026-10-17T03-29-49-877Z/report.json)；真实 GUI 同问题由根线程/Artigine 在 f 目录保留。
- 独立审查先复现 await binding 洞和反向精度比较；旧探针 JSON 保留，修后 JSON 单独存档。
- `04-28-16-875Z` 的几何测试第一次失败属于夹具：三个根 Workspace 都在 root Scope，“切到 Context Workspace Scope”实际没有切身份。已改成使用真实 distinct Scope 重跑通过，未据此放宽产品保护。

## 仍有边界

1. 两个系统没有原子事务。空间已保存而 Presentation CAS 失败时，明确保留 partial 及两边实际事实；本轮没有自动跨系统修复或覆盖并发位置。
2. 普通原 r6 的旧几何重试策略未改：`native-text-save-port.js:174` 对无登记文本 operation 返回 `ordinary`，`history-intent-transform.mjs:767` 只让已登记文本退出原 retry，普通节点/links 维持原策略。这是源码范围事实。**本轮没有运行“几何 partial 后原 r6 自动重发”整链实验**；若原队列另发新请求，桥会重新读取新版本，后续请求如何处理此前并发位置仍未验证。已证明的是单笔 CAS 不覆盖并发，不能把它扩大成全队列冲突恢复完成。
3. 仅现有三个根现场；不宣称动态 child Workspace 导航/布局已经支持。
4. 原材料投放自身与 Core membership 的统一 Undo 仍是另一个功能缺口；这里补的是已有材料原 geometry move/Undo/Redo 的保存路径，不宣称完整 Drop Undo 全量拉齐。

未新增 ledger、hash、schema、contract 或另一份保存队列；原件与候选实例均未修改/启动。
