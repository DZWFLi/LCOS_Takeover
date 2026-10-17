# 文字回执与原 Undo：Yellow 修复计划

结论：整页 loss 恢复后一次原 Undo 已正确写回正文，但原 O8 新增帧截掉 Redo；这是新的真实失败，不能用保存恢复或组件 PASS 掩盖。

- **Owner / files**：只改 `history-intent-transform.mjs` 的原 O8 接缝、`startup-history-intent.js` 的 text-revision backfill 和相关目标测试。O8/index/Undo/Redo仍为原 owner；厂商原件只读，不新增历史栈。
- **Before / after**：已实屏观测原 O8 新增帧。独立实际 O8 的旧接法对照已抓到原 R8 前 candidate/prior 唯一差异为 `lcos_ref.revisionId`。原 `S.flush()` 调用的 React updater 可延后执行；回执扫描时真正用户帧尚未进入 `x.current`。非 applying 先 flush 原 pending 用户帧并重取 history；applying 中不 flush 中间状态。
- **精确范围**：原 O8 用一次性receipt-state引用记录计划后的nodes+edges，原effect用原R8比较；第一次effect无论匹配/不匹配都消费标记。仅完全相等的metadata提交不排S，后来正文、其他节点或edge不同仍走原记录，不开全时段suppression。
- **延后帧版本**：在原 `f(P=>{const L=...})` updater 内、原 R8 比较/append 之前，复用既有回执 metadata，给同 canvas/node/primary Artifact+View+完整正文的候选投影已验收 ref。proof 还须等于当前 remembered ref；后来 canonical ref 改变即失效。只改 `lcos_ref`，不改正文/几何/edges/栈/索引，不根据 Current 猜版本。
- **Tests**：早于/晚于1000ms回执、flush替换history数组、applying Undo/Redo不flush、后续用户state不覆盖；实际O8+r6 Chrome正常save→undo→redo与精确回执；同次合并正文/edge及后续新edit；原execution/conversation/Collection/measurement回归。最后原候选整页loss→Undo→Redo稳定核对，必要浏览器响应副本采原R8差异。
- **Risk / rollback**：本地可逆接缝；不清原队列/索引/Redo，不把metadata回填当用户动作，不压掉真正编辑。source与实屏分别记录。root统一build/重启，本agent不操作实例进程。

实屏失败原件：`output/原流程融合_20261017c/导图整页验证/2026-10-16T23-54-06-936Z/report.json`；原报告仍保留失败，新增证据不覆盖它。

## 当前证据

- 目标单位测试与原 AST 执行检查通过：早/晚回执、React 延后候选、setter 拒收、错误正文/身份/Canvas/重复 ID、旧 proof 失效、applying 不 flush、后来的用户编辑保留。
- 本次补丁后真实临时 Core/Huabu 保存链、原 execution/conversation、Collection Arrange 和原自动测量/手动 Resize 历史回归通过。
- **独立实际原 O8 + r6 共 14 场景通过，errors 0**：严格 raw history 引用 `saved r2 / Undo r3 / Redo r4`、16 秒迟到回执的 raw r2/索引/帧数均正确；测试内禁 marker+投影的旧路径重现 ref-only 多帧；同次 body/edge 合并不同仍记录、metadata 标记消费后后来的真实编辑仍记录。前 8 组 unknown/conflict/普通节点与 links 原重试检查仍通过。证据：`output/原流程收口_20261017d/原队列重试验证/2026-10-17T00-11-42-998Z/report.json`。该测试运行真实原 hook 与当前 wrapper/port，HTTP/时钟受控，不是整 App。
- **候选 PID 40728 整 App 已通过该登记路径**：30015ms 丢回包期间正文 POST1 → 真 HTTP 缓存 GET200/pendingnull → 原 Undo/Redo 各一次，index `1→0→1`、size2。测试只在响应内存副本读取真实原 `x.current`，saved/Undo/Redo 的帧正文和 UUID revision ref 逐项等于 Core/live。证据：`output/原流程融合_20261017c/导图整页验证/2026-10-17T00-14-30-272Z/report.json`。浏览器已关闭，未靠额外 setter/刷新修复状态。
- 这次整 App 通过只覆盖已登记导图/受控保存及其原 Undo/Redo；原 primary 双击 Tiptap autosave 未登记仍单列 P0。
- marker-only 版本的 raw saved ref 仍为 r1 的失败证据保留：`output/原流程收口_20261017d/原队列重试验证/2026-10-17T00-07-20-803Z/report.json`。本次延后帧投影专门修这个差异。
