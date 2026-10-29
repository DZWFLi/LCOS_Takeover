# Core 文本原保存队列：Yellow 施工计划

结论：修原 `r6` 的重试分流，不另建保存队列。仅保护已由 native-text-save-port 登记的 Core 文本；普通节点与 links 的原重试不动。

- **Goal / before-after**：丢回包后首发已提交，原队列仍首发加 3 次并在 25 秒后重排；改为保留该组原 ops/pending/草稿/blocked 和离场提醒，禁止 unknown/conflict 再次 POST。其他组继续原策略。
- **Owner / files**：port 仍只拥有临时 operation/回执状态；Core 拥有正文，原 `r6/g.current` 拥有未保存 ops，O8 拥有历史。修改 `lab/native-text-save-port.js` 的窄 policy 查询、`lab/history-intent-transform.mjs` 的原 node 分组/发送/失败/重排接缝，必要补 fetchwrapper；不改厂商原件、Core、server、schema。
- **分组**：保留原 role/session/lifecycle 分组，再用现有 port operationId 区分登记文本和普通节点；unknown 只回到原 node queue。先前/后续普通节点和 links 不挂这个策略。
- **恢复边界**：GET body 相同不算已确认原空间/历史保存。精确回执不足时只保留 unknown；不调用原 retry 当核对，不清 pending 假成功。后续 root 的精确 Core + raw spatial + O8 核对只允许释放对应原组，不吞后续编辑。
- **Tests**：实际 transform 后的原 r6 + 当前 port/fetchwrapper，控制时间覆盖内层退避、25 秒回队、cleanup/原 retry、混合组、普通节点/links、冲突与迟到回执；artigine 独立复验，root 统一构建/实屏。
- **Risk / rollback**：可逆本地接缝；保留所有已有 CAS/路径/owner 检查，不触真实用户/模型/实例进程。回退仅这轮具体 diff；未完成恢复能力如实记账。

无需新 hash、冻结 contract、baseline 或 gate。CAS 已挡旧正文覆写，但挡不了客户端重复提交未知跨系统 POST，所以要在真实原队列执行处修。
