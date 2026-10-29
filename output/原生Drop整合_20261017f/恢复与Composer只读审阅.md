# Drop 恢复与 Composer 复核

结论：查到的两个真实接缝已由 root 源修，隔离对照测试通过。**这是原 Router/store、实际 dispatcher/client 与原 Overlay 回调的 controlled peer 证明，不是候选实屏或真实 Core/O8 证明。** 本分项候选访问/写入、Core 写入、模型均为 0。

| 原动作链 | 原缺口与修后结果 | 代码位置 |
| --- | --- | --- |
| 原 Toast“核对放置结果”→原 receipt closure→原 store 采用 | 原目标暂时卸载、Graph 期间目标变化、API 暂换，或 ordinary 查询期间用户改稿导致 client rejected 时，旧逻辑返回无 closure 的 failed；被同反馈采用后，“核对”入口永久消失。修后保持 partial 与原 GET closure；回原 owner/目标可继续 GET 确认同准确 carrier。所有这类测试首 POST 始终 1，核对不加 POST/flush | [pending/unavailable](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-material-dispatch.ts:102>) |
| 原 Composer drop→准确来源 Graph→原 draft 写入 | 旧 admit 只在 GET 前核 reference；GET 期间同 ref 版本或 references 列表变化仍被放行。修后 GET 后再次核准确版本和整组引用，变化即拒绝 | [exactReferences](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-material-dispatch.ts:142>) |
| 原 Overlay addComposerReference→异步准入→同一原输入 | 旧调用在 await 前读 shell/refs，await 后直接使用；同视觉 inputKey 的 message 已换，或 refs 项目已换，仍会把引用写进当前另一份 draft。修后 await 后同步重读 shell/refs，核 inputIsCurrent、项目、inputKey、intent，再调用原 addEntitiesToDraft；无新窗口/store | [最后同步写入](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-material-overlay-transform.mjs:14>) |

临时 Graph 查询失败原先已有保留 closure，本次是回归对照，**不算新发现的缺陷**。API 暂换测试证明恢复 owner 的合约；真实 Toast 的同 API 检查还会阻止跨 API 采用，不能把这个 controlled case 称为真实页面串写。

`node scripts/native-library-drop-review.test.mjs`：[20 例报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/恢复与Composer只读复核_peer/2026-10-17T03-24-06-487Z/report.json>)。其中 10 例为旧分支对照，8 个旧缺陷被复现、2 个正常对照；另 10 例为当前修后源码，全部通过。报告 `passed` 表示预期被验证，**不表示旧版缺陷通过产品验收**。

Overlay 测试源抽取实际 addComposerReference 函数，执行实际原 referenceStore 的 draft owner；异步准入和 Shell 变化是受控叶子。修后两个换输入场景实际 draft 0 引用；未换输入仍正常加入 r1，没有靠停用功能通过。

旧文件复制未赶上 root 立即修复；[受测旧分支重建与新源码](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/恢复与Composer只读复核/2026-10-17T03-24-06-245Z>) 根据本轮已读的旧片段重建。它不是 Git 旧快照，也不宣称旧整文件字节证明。原始首次试跑仍保留，最终以本页链接报告为准。

候选 UI 是否已加载修复、真实 mouse→原 Toast→GET 回填、默认自动退场与所有目标/MIME 的最终范围，由 root/Arti 整页证据单独记账；本分项不代签。
