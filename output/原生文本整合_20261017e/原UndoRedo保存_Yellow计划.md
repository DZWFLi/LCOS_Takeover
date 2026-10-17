# 原 Undo/Redo 正文：保存接缝

结论：给原历史 DTO 登记，不发第二次编辑。此前实际负向报告保留；本轮先源码与独立原 owner 测试，候选由 root/Artigine 管理，本 agent 不操作。

- **原入口**：O8 原 apply 产生 P8 changes/M8 ops，既有 `tagHistoryBatchOperations` 已收到 canvas/phase/entry/remap/真正 DTO。只标记 plain primary text update，与同 ID/type/body/primary 的原 replace change 校准；不混 create/delete/Collection 生命周期组。
- **方向身份**：每次原 O8 调用一个临时 intentId，source native-history + undo/redo。原 s6 按既有 pending 及该 intent 分桶，快 Undo/Redo 不互相合并；每组发送前再 prepare，顺序取得前一个真实回执 observed CAS。
- **写与恢复**：原 r6/wrapper 是唯一 writer；prepare 不 updateNodeData。未知只 hold 原准确对象，真 HTTP GET receipt 后原 O8 metadata-only 确认，原 index/帧正文保持。用户后继 direction 留原 g，GET 不暗发；同原节点 more/原 Viewer 的核对与明确继续恢复。
- **API**：沿 port 既有 capture/prepare/verify/subscribe，public pending 增 source native-history / historyPhase。准确请求 proof 可推进后来草稿 base，不能把旧 body 写回 live；API/primary/project/canvas 严格原来源。
- **验证**：Undo、Redo 各自身 loss 后 POST1 跨 inner/25s/cleanup/显式原 retry；GET-only、raw ref/index、下一 direction 真版本、相反 direction 快速切换、普通 node/link、跨 API/primary。真实临时 Core 与原 O8/r6 source-executed 分层，最后 root 统一候选整页。
