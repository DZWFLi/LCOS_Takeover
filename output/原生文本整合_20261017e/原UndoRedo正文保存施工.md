# 原 Undo/Redo 正文保存：施工与验证

结论：原Undo/Redo的普通primary文本更新已接同一保存port，原O8/r6/wrapper仍是唯一写者。**43968候选整页的Undo与Redo自身丢回包均通过：原键盘触发、30秒各仅1次目标POST、原节点更多只GET核对、下一反向操作使用真实新版本，原历史不增假帧。** 这覆盖已登记正文更新；冲突选择、换主后原稿重新领回和跨重启恢复仍未完成。

## 原缺口保留

原负向证据：[00-56 原报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原历史正文丢回包复现/2026-10-17T00-56-48-398Z/report.json>)、[实际复现说明](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原UndoRedo丢回包_实际复现.md>)。

Undo 首次 CAS r2→r3 / Redo r3→r4 提交后丢回包，原 inner POST 1→4；原显式 retry 后 6，cleanup 后 7。后续重复请求均旧 CAS 409，没有冒充多次提交成功。本 fixture 跨 30/60 秒仍 4 次，不能写成观察到 25 秒额外自动 POST。原 index 看似正常，但 raw/live ref 仍旧版本；保存正确不能只看历史索引。

## 原流程接入

| 原入口 → 原容器 → 操作 → 返回 | 本次接法 | 源码 |
| --- | --- | --- |
| 原画布 Undo/Redo → O8 当前原帧 → P8/M8 原 change/DTO → 同画布原索引 | 只标记普通 primary 文本 update；逐项校准原 replace 的 ID、类型、正文、Artifact/View。生命周期、Collection、普通节点和 links 留原策略 | [startup-history-intent.js](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:822>)、[port capture](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:70>) |
| 原 r6 g → 原 s6/coalescer → 原 HTTP writer | 同次历史调用带临时方向意图；原 pending 与相反方向分桶。每组发送前再做只读 prepare，后继方向使用前笔真实确认版本；不二次 updateNodeData | [port 分桶](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:163>)、[transform](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/history-intent-transform.mjs:762>) |
| Core 只读预检 → 原串行发送 → 原回执 | 预检 GET 后再次校准 API/primary；串行 send 真正 POST 前再校原 project/canvas/API/primary/CAS，防等待旧请求期间换现场后降成普通无 token POST | [prepare](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:582>)、[send 校准](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:531>)、[wrapper](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-surface-core.js:174>) |
| 未知 → 原节点更多/原正文动作栏 → 核对撤销/重做 → 同节点/同历史 | 沿原 port 的 GET receipt 和原 O8 metadata-only backfill；精确请求 proof 允许旧回执校准后来草稿 base，不把旧正文写回 live，不凭正文相同确认 | [原 receipt seam](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:1328>) |
| 相反方向已留原 g → GET 核对旧操作 → 用户明确继续 → 原 r6 | GET 不暗送后来方向；既有 readQueuedAutosave/resumeAutosave 只读原 g/唤醒原 owner。原 UX 核对/继续由 root 已有原槽接线 | [port](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js>) |

相同正文但含几何/标题的原 DTO 不会等待不存在的新正文 Revision：只退休临时正文握手，原 DTO 继续走原空间保存。没有删原操作来假装完成。

另给原导图草稿重开提供只读 `canResumeExplicitSave(operationId,{projectId,canvasId,nodeId,artifactId,artifactViewId,revisionId,api})`。只允许同原 explicit pending、原 API 和确切 primary/expected 版本；不 GET、不改队列，autosave/history/外来场景均拒绝。UI 由另一 agent 保留原草稿 owner 后接入。

## 验证分层

| 层 | 实际结果 | 证据 |
| --- | --- | --- |
| 实际转换后的原 O8/r6/request hook + 当前 wrapper/port，受控 HTTP peer/clock | Undo、Redo 各自身 loss 只 POST1；跨原 backoff/显式 retry不重放；真 GET 后 raw ref/index 保留，下一相反方向用真实版本；普通节点/links和cleanup另测 | [修复验证](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原历史正文丢回包修复验证/2026-10-17T01-37-21-130Z/report.json>) |
| 独立实际 O8/r6 | 最终11项通过：两向loss、GET核对与后来相反方向继续通过原port执行；actual pendingWrite被普通HTTP阻塞后晚换API/primary均0文本POST，原g/pending/B正文保留，同owner正常token POST。**本层不证明点击了产品按钮；实际原UX/gm点击在下行12项另证** | [最终 11 项](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原历史正文独立验证/2026-10-17T01-41-09-666Z/report.json>) |
| 独立真 G7/UX + 实际 dr/Gb/Wb/Bf/Ub/Ff/r6/O8 | 最终 12 项通过：原 debounce/单 writer、慢预检 A/C、unknown 后 later C 的原 UX 核对/继续、raw history/Undo/Redo、close flush、conflict、普通节点/links与换 API 安全边界 | [最终 12 项](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原Tiptap独立Hook验证/2026-10-17T01-41-09-664Z/report.json>) |
| 临时真实 Core/Huabu/facade | `native-text-save.test.mjs` PASS：history loss→GETonly→next direction 真 CAS；相同正文原空间写保留；真实 wrapper 被前笔 ordinary response 阻塞后换 API/primary 均 0 文本 POST、原 g/pending 保留，primary B 正文不变；同 owner 正常对照通过 | [测试](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-text-save.test.mjs:356>) |
| 原队列/O8旧链 | 14 项 PASS，包含普通 node/link 原 retry、late receipt、HTTP200/O8拒收、raw r2/r3/r4 和 metadata-only 不吞后来编辑 | [14 项](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/原队列重试验证/2026-10-17T01-39-38-905Z/report.json>) |
| 真 Tiptap/hl/G7输入旧链 | 5 项 PASS：原 debounce、unknown 不重发、后来原草稿、明确继续、原 close flush | [5 项](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原Tiptap自动保存验证/2026-10-17T01-39-38-921Z/report.json>) |
| AST/回填/其他原历史 | history transform、exact text receipt、autosave port、execution/conversation history、Collection space/replay/arrange replay 全部 PASS | 下列命令 |
| 候选整App：Undo自身loss | 新声明编辑准备1POST；原键盘Undo的首次200真提交后丢回包，30秒仅1Undo POST；原节点更多“核对原保存”只GET退场，再原Redo以真实Undo revision提交1次。raw/ref/索引准确，size2不增，Artifact17／Run1不增、0模型及JS错 | [43968 Undo-loss](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/导图整页回归/2026-10-17T01-46-47-532Z/report.json>) |
| 候选整App：Redo自身loss | 新编辑、正常Undo、目标Redo首次200真提交后丢回包；30秒仅1Redo POST，原更多只GET核对，再明确反向Undo按真实Redo revision提交1次。共4笔声明意图，raw/ref/索引准确，size2不增，17／1与0模型及JS错 | [43968 Redo-loss](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/导图整页回归/2026-10-17T01-48-42-218Z/report.json>) |

重启前后Core graph／Runs／三Canvas全对象一致另见[本次重启](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/历史接线重启事实核对.json>)。以上两场才是history请求自身loss，未拿此前autosave-loss后正常Undo/Redo替代。

本轮还实际发现并修复了预检途中同 API primary A→B 的发送遗漏；原失败保留：[01-29 独立失败](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原历史正文独立验证/2026-10-17T01-29-07-250Z/report.json>)。原 B 正文没有被覆盖；修复后不再发送 A 旧操作。测试里曾把普通新增节点合法截断 Redo 误当保存问题、或把观察超时的真实 no-receipt-yet 误写固定 response-lost，失败报告也保留，断言已按真实流程拆开。

## 跑过的命令

```powershell
node scripts/native-history-text-loss-repro.test.mjs --protected
node scripts/native-text-save.test.mjs
node scripts/native-text-retry.test.mjs
node scripts/native-tiptap-autosave-repro.test.mjs
node scripts/native-tiptap-autosave-port.test.mjs
node scripts/history-intent-transform.test.mjs
node scripts/native-text-revision-receipt.test.mjs
node scripts/native-execution-history.test.mjs
node scripts/native-collection-space-history.test.mjs
node scripts/native-collection-space-history-replay.test.mjs
node scripts/native-collection-arrange-history-replay.test.mjs
```

独立 agent 另跑 `node scripts/native-history-text-loss-independent.test.mjs` 和 `node scripts/native-tiptap-save-independent.test.mjs`，最终 11/12 项全部通过；这些脚本未由本 agent 修改。双方自有 Chrome 和临时 fixture 均已关闭，无候选写入。

## 仍留册

- 真 CAS conflict 的原处阅读/对照新版本与明确选稿恢复，尚不能把 hold 当完整冲突解决。
- 场景 API 或 primary 已替换时，旧操作严格保留且禁止误投；旧归属草稿跨现场重新领回的完整 UX 未完成。
- 临时真实响应缓存缺失/淘汰或进程重启后，只能保未知，不靠正文相同伪造回执。
- 本次只覆盖已准确登记的普通 primary 文本 Undo/Redo update；不宣称所有原媒体编辑、所有历史类型或整个工作区已融合。

没有新 schema、持久 journal、第二队列或第二历史。临时意图/来源只服务原操作身份，PC/wire/body truth 仍由原协议和 Core 承担。
