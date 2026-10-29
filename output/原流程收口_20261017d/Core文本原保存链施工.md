# Core 文本原保存链：施工与验证

结论：**已登记 Core 文本的原队列自动重发与准确回执历史已修住；PID 40728 整 App 丢回包恢复→原 Undo→Redo 完整通过。不能扩成全产品或全部文字保存验收。** 普通节点/links 的原重试保留；已登记文本的 unknown/conflict 保留原 ops、正文、blocked 和离场提示。原primary双击 Tiptap autosave 尚未登记，另见 [范围与计划](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/原Tiptap自动保存范围与改接计划.md>)。

## 改了哪里

| Owner | 变化 | 没有改变的事实边界 |
| --- | --- | --- |
| [history-intent-transform.mjs:688](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/history-intent-transform.mjs:688>) | 在真实 r6 的 node group、发送前、catch、200 后成功缓存前、finally 重排及原 registry 生命周期插入文本 policy。held 原组回到原 `g.current`，不走内层 retry/25 秒再 POST；原 flush/retry/cleanup 也经同一分流 | 原 `r6/g.current` 是唯一 node queue；原 `PC/b0/s6` 仍负责 DTO、去重、合并；原 links worker 未替换 |
| [native-text-save-port.js:30](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:30>) | 现有临时 operation 增加 queue policy 与原 closure 回调；已发出的 conflict 不可被 acknowledge 擦掉；未知状态可重复只读核对 | 不新增保存队列或正文事实库；Core 仍拥有正文，O8 仍拥有历史 |
| [startup-surface-core.js:46](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-surface-core.js:46>) | 仅被文本 port 认领的原 POST 附 `lcos_text_save_request=surface-native-batch-UUID`；verify 先 GET 真正原 HTTP 结果，验证 request/canvas/完整 wireBody，再走原 observe/history receipt 和 Core GET | 不重发 POST，不根据正文相同重造成功回执；原 Request body、headers 保持 |
| root 的 [native-text-response-cache.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-text-response-cache.ts>) / facade | 暂存真正原 HTTP promise/status/body/wireBody；GET 仅读；同 token 异 body 拒绝；有界内存缓存 | 不是 Project Truth 或持久 journal；重启/淘汰/未完成时，前端保持未知 |

短计划：[Core文本原队列_Yellow计划.md](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/Core文本原队列_Yellow计划.md>)。原失败保留：[旧 loss 报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-17-16-897Z/report.json>)，没有拿正常保存 PASS 覆盖它。

## 分组与返回流程

1. port 仍只调用一次原 `updateNodeData`，原 O8/r6 排队。role/session/lifecycle 分组继续保留，登记文本再按现有 operationId 分桶，普通节点不混进未知组。
2. 首次发送时，只在原 ops 顶层附临时 operation 关联；`PC` 不把该标记序列化。后来的同节点 geometry/data 编辑与已尝试原对象隔开，再调用原 `s6` 合并，避免恢复时吞掉后来编辑。
3. 网络未知或 CAS 冲突时，原组留在 `g.current`，blocked 与草稿不丢。node worker 用 held 结果让原 links worker继续处理；只剩 held 时原总 flush 返回 failed，不空转、不假 saved。
4. **正常 HTTP 200 也要原历史真实接受。** wrapper 传每节点 backfill 结果；Core/space 成功但 O8 拒收，返回 `history-receipt-rejected`，r6 在写 success cache 前持有原组。GET 一度失败后也不能借 `readback-failed` 绕回正文相同即确认。
5. 用户核对时，GET 真原响应 → 准确 wireBody → 原 observe/O8 接受 → Core 准确 revision/body 读回。随后回调原 r6，仅移出 DTO 完全相等的已尝试对象并更新原去重/状态；**不调用 flush，不提交后来编辑**。后来编辑仍由原队列处理。

`retrySent:false` 仍只描述 port 自己没二次 writer；本次另用实际 r6 网络计数证明该登记 operation 没被底层重放，不能把这个字段泛化成所有普通节点都不重试。

## 已跑的检查

| 层 | 结果与范围 |
| --- | --- |
| `node scripts/native-text-save.test.mjs` | **PASS**。隔离真实 Core + Huabu handler，实际 factory/fetchwrapper。覆盖准确 CAS/Revision/FileRecord、批次归属、Request body/header/UUID token、真回执只读恢复、404/异 wire/O8 拒收、回执后来可用、正常 200/O8 拒收、GET 临时失败不绕过 O8、场景切换与无回执。该 harness 没运行原 r6，单独声明范围 |
| `node scripts/history-intent-transform.test.mjs` | **PASS**。真实原包 AST、分组/队列注入、原 hooks/回执关联、幂等 parse |
| `node scripts/native-text-retry.test.mjs`（artigine 独立） | **8 组 PASS**。真实 transform 后原 r6 + 原 request hook + 当前 wrapper/port，真实 Chrome；HTTP 对端与时钟受控，不冒充整 App/真实 Core。见 [完整报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/原队列重试验证/report.json>) |
| r6 实际 8 组细节 | 首发 smoke；unknown 跨 2.5/5/10/25/60 秒和 flush/retry/cleanup；普通 node 原重试；普通 links 原重试；exact conflict 及拒绝擦除；16 秒迟到回执；多次 GET 的 404/错 wire/O8 拒收/真回执与 later position；正常 200/O8 拒收后真回执恢复。unknown/conflict 文本均 POST 1 次，普通原策略仍可多次重试 |
| `native-text-body-transform.test.mjs` | **PASS**。正文保存/核对 helper 与实际 bundle 编译 |
| `native-text-revision-receipt.test.mjs` / `native-history-diagnostics.test.mjs` | **PASS**。原 O8 精准文字回执、读取与身份边界 |
| `native-execution-history.test.mjs` | **PASS**。execution/conversation 原 O8 投影、待保存编辑、Undo/Redo 与相机/选区不被覆盖 |
| `native-collection-space-history-replay.test.mjs` / `native-collection-arrange-history-replay.test.mjs` / `native-collection-arrange-nested-history-replay.test.mjs` | **PASS**。既有 Collection 原 O8/r6 apply/undo/redo 分组与原几何语义未回归 |

root 另已报告 facade/cache 的目标集成测试通过；这些测试文件归 root。没有用 source/组件 PASS 代替整 App loss。

## 仍有边界，不能抹掉

- 缓存缺失、淘汰、进程重启、回执不匹配、O8 拒收或当前 canvas/API 已更换，继续保留未知/原稿；不会造回执，也不会自动重放。
- 真实 CAS conflict 保留原 held queue，拒绝通用 acknowledge 擦除。完整“人工对照、明确采用哪份稿、形成新意图”产品流程仍需继续收口，不能靠清 pending 宣称完成。
- 本次安全释放依赖真响应和原精确 DTO；后续编辑若不匹配，保留原队列，不能当成那次已保存。
- 后续 artigine 已在 PID 38756 两轮跑通 loss恢复主链（30秒POST1、GET200、pendingnull），但一次原Ctrl+Z后等15秒历史index仍1/size2/canRedofalse，不能用该主链PASS盖掉Undo失败；证据见 `output/原流程融合_20261017c/导图整页验证/2026-10-16T23-54-06-936Z/report.json`。本agent没有启动、重启或停止服务，没有运行模型或dispatch。

## 整 App 收口与下一范围

root 统一 full build/精确重启后，artigine 已用已有合成材料跑通整 App loss：实际编辑→POST 1 次→首 200 丢回包→跨原 retry 时间仍无同操作 POST→界面保稿→核对原保存 GET→原 Undo/Redo。材料/Run 计数检查保持串行，避免其他合成 fixture 写入污染断言。下一 P0 是原 primary Tiptap autosave；已另做真实原编辑器/队列的可执行复现，不把它算入本路径已修范围。

后续 PID 40728 已加载一次性精确 metadata 提交识别及原 React 延后 append 内的已验收 ref 投影，整 App loss→Undo→Redo 完整通过：30015ms POST1、真缓存 GET200/pendingnull、原 index `1→0→1`/size2，raw saved/Undo/Redo 正文及 UUID ref 均与 Core/live 一致。证据 `output/原流程融合_20261017c/导图整页验证/2026-10-17T00-14-30-272Z/report.json`；见 [文字回执与原Undo计划及证据](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/文字回执与原Undo_Yellow计划.md>)。PID 38756 的真实 Undo 失败与 marker-only r1 失败仍保留，未覆盖。
