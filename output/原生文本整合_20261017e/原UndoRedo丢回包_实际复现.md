# 原 Undo/Redo 自身丢回包：实际缺口

结论：**原正文 Undo/Redo 的写请求还没登记到文本 hold/recovery。** autosave loss 后“正常 Undo/Redo”已通过；这次进一步证明 Undo/Redo 自己丢回包时，原内层仍会重复 POST。原历史索引看起来正常，也不能代表准确版本引用正常。

运行：`node scripts/native-history-text-loss-repro.test.mjs`

证据：`output/原生文本整合_20261017e/原历史正文丢回包复现/2026-10-17T00-56-48-398Z/report.json`。**PASS 是成功复现缺口，不是产品修好。** 产品源码冻结未改，候选未写，Chrome/临时静态 fixture 服务均已关闭。

| 实际动作 | Undo | Redo |
| --- | --- | --- |
| 先决条件 | 正常保存 final body，退掉显式保存握手 | 正常保存，再正常 Undo 到 before，退掉握手 |
| 本次首请求 | 原 O8 undo → 原 r6，CAS r2 | 原 O8 redo → 原 r6，CAS r3 |
| 首次真实 peer 提交后丢回包 | before / r3 | final body / r4 |
| 原 inner retry | POST 1→2→3→4，均为旧 CAS r2 | POST 1→2→3→4，均为旧 CAS r3 |
| 后续跨 30/60 秒 | 仍 4 次；本次没观察到 25s 额外 POST | 同左 |
| 显式原 retry 后 | 6 次 | 6 次 |
| 原 cleanup 再等 60 秒 | 7 次 | 7 次 |
| port/token | pending 空、无 token | pending 空、无 token |
| 最终 raw 目标帧 / live ref | 正文 before，ref 仍 r1；Core 已 r3 | 正文 final body，ref 仍 r2；Core 已 r4 |
| 原 O8 index / size | 0 / 2，canRedo true | 1 / 2，canUndo true |

严格 HTTP peer 仅首请求正确 CAS 能提交；后续旧 CAS 返回 409，Core revision 不再增长。这里证明的是重发请求及回执缺口，没有假造连续多次成功保存。两个正文 history DTO 都没有 `lcos_operation`，raw entry `operations` 为空；这是普通正文历史写，不能误报成已受生命周期 intent 保护的 create/delete/duplicate 组。

## 原 owner 与测试边界

新脚本只读取并复用 `native-text-retry.test.mjs` 的实际源执行 fixture setup，未修改该文件、没有执行它的旧测试驱动。生成独立临时 module 后执行新的 Undo/Redo loss 驱动：原 O8/raw x.current、原 r6/coalescer/原 request hook、当前 wrapper/port 都真实运行。没有重写队列或 Undo。

非保存的 Flow/router/logger 环境、HTTP peer 与时钟受控；调用的是原 O8 owner action，不冒充整页键盘输入。这不是候选整 App、真实 Core 或物理 Ctrl+Z/Y 验收；新结论只来自这个明确范围。

## 下一窄接缝

原 `history-intent-transform.mjs` 已在 O8 的原 `onBatchOperations` 前调用 `tagHistoryBatchOperations`；这里实际拿得到 canvas、原 phase、原 entry、原 remap 和实际 node DTO。下一轮应在该既有接缝识别**普通 primary 正文 update**，登记现有准确历史 DTO，复用现有 prepare/receipt/hold；不能重调 updateNodeData、伪造用户编辑帧或再建历史 owner。生命周期 intent 与普通节点/links 保留原策略。

恢复入口也要补真实用户语义：Undo/Redo 常从画布发生，不能只在打开 Tiptap 时才看得到“核对保存”。应接既有原画布保存状态/原节点动作，明确这次是撤销或重做尚待确认；真 GET 回执核对后只退休准确已尝试对象，其他后来输入仍在原 g。当前没有施工，不用移除按钮或隐藏 pending 来销账。
