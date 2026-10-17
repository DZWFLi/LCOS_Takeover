# 原 Tiptap 自动保存：施工与验证

结论：原Tiptap的autosave已接原r6准确回执，不增加第二次编辑写入。原真实异步链及44908五个整页场景已过；最新43968长文、准确导图草稿重开和Undo/Redo自身loss也分别整页通过，完整证据见[最新独立与实屏归档](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Tiptap独立验证与实屏.md>)。**预检失败恢复、人工冲突选择、身份改变后的旧稿归属恢复仍未完成**，不能把保稿hold当功能闭环。

## 原流程怎么接

| 原入口/owner | 当前接法 | 边界 |
| --- | --- | --- |
| 原 primary 文本双击 → vZ/G7 → hl 300ms | 专用 `native-tiptap-autosave-transform.mjs` 只把原一次 `u(e,{text:S})` 的 patch 改为原 API 已支持的 data updater；hl/G7/原返回路径保留 | 不调用 `port.save`，不二次 updateNodeData，不锁输入 |
| 原 dr → Wb/Gb → Bf/Ub → Ff → onNodesChange | port 私有 Symbol 暂带准确调用来源，穿过原异步对象 spread；r6 生成真实 op 时消费 Symbol，再把来源放原 op 临时字段 | 仅调用来源，非发送队列或正文真值；PC/wire/history 持久 JSON 不含 Symbol。API 身份同样用私有 Symbol，不能把旧 op 绑到当前新 API |
| 原 r6/s6 → role/session/operation groups | `prepareQueuedText` 在原 s6 后、分组前登记已有准确原 ops，Core 只读核对 project/canvas/primary Artifact+View/observed CAS；原 queueKey 分桶 | 新输入继续在原 g；unknown/conflict hold 准确旧组。普通节点/links 保留原策略 |
| 正常/迟到/unknown 原响应 | 复用现有 wrapper、真实 HTTP receipt cache、Core readback 与原 O8 receipt；later body 不同须有该准确请求的原 queued DTO 证明，才推进 metadata | 只改 ref，不写旧 body，不伪造旧 body 历史帧；错误身份/正文/外来 proof 拒收 |
| 原 g 忙时 GET 确认 | 原 S/E promise 清 owner 后 `queueIdle` 再做准确回执 ack | 只释放已经确认的旧对象，GET 不发后来稿；不清整队列 |
| 原 UX 动作栏 | root 的 `NativeTiptapAutosaveStatus` 使用原 gm 按钮与 port subscribe；unknown 只读“核对保存”，若原 g 尚有新稿再显“继续保存” | 显式继续才唤醒原 retry；正常自动保存期间不闪手动按钮。没有新增窗口、poll 或全局状态库 |

主要源码：[专用原 vZ transform](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-tiptap-autosave-transform.mjs>)、[port](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-text-save-port.js:66>)、[原队列接缝](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/history-intent-transform.mjs:914>)、[wrapper](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-surface-core.js:133>)、[原 O8 metadata 回执](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:1324>)。

## 已跑的验证

| 层次 | 结果 |
| --- | --- |
| `native-text-save.test.mjs` | PASS。真实临时 Core + Huabu handler，新增“已有 queued autosave adopt”正常确版、unknown A→真 HTTP GET 回执只释放 A/保 C→用户显式 resume C，第二次 CAS 等于第一份真实回执。prepare 不调用第二次 updateNodeData；保留所有原显式保存回归。该 harness 没有运行 r6，独立声明 |
| `native-tiptap-autosave-port.test.mjs` | PASS。延后 updater 前 primary/API/project/canvas 改变：B 正文不被 A 覆盖，旧 A 草稿保留，原 op hold，无第二 writer/无越界 Core 读；Symbol 不进入 JSON |
| `native-tiptap-autosave-transform.test.mjs` | PASS。原 writer 一次、原 hl/G7 保留、UX 原 gm、media viewer slot 可组合、幂等/AST parse |
| `native-text-revision-receipt.test.mjs` | PASS。准确旧 A 原 queued DTO 可接受 metadata-only，later live body/原历史帧保持；foreign canvas/body/primary proof 拒收；原精确 ref 与生命周期回归保留 |
| `history-intent-transform.test.mjs` / `native-execution-history.test.mjs` | PASS。原 AST/队列/历史、execution/conversation receipt 无回归 |
| `native-text-retry.test.mjs` / `native-collection-arrange-history-replay.test.mjs` | 最终冻结源 PASS。14 项原保存链（含 raw O8 r2/r3/r4）与 Collection 原 O8/r6 回归；14 项证据本批归档 `原队列14项回归/report.json`，原脚本时间目录也保留 |
| `native-tiptap-autosave-repro.test.mjs` | e 目录已改为修复验证，d 的 POST4 原复现不覆盖。真实原 vZ/hl/G7 + dr/Gb/Wb/Bf/Ub/Ff + r6/request hook + wrapper 的 5 场景最终 PASS：快输、unknown POST1、后稿保留且 GET-only→显式继续仅 C 一次/准确 observed r2、迟到回执、关闭 flush。证据 `原Tiptap自动保存验证/2026-10-17T00-50-08-041Z/report.json` |
| Artigine 独立 `native-tiptap-save-independent.test.mjs` | 最终 10 场景 PASS/errors0：原 UX/root status + 真 G7 + 原异步 dr/r6/O8/wrapper；快输、慢 GET、unknown 后稿在原 1s 历史 debounce 前后、GET-only/原 UX 显式继续、关重开/关窗 flush、conflict、迟到、混合普通 node/link、同 canvas 更换 API。两种历史时点最终都只有 before/C 两帧，旧 A GET 不造帧；resume C 后原 Undo before/r4→Redo C/r5，index1→0→1、size2。证据 `原Tiptap独立Hook验证/2026-10-17T00-53-57-861Z/report.json`。HTTP peer/时钟受控，未冒充真实 Core/整 App |
| 整 App | root 已构建 PID 44908；Artigine 独占合成材料实测中。本 agent 不写候选、不启动或重启实例 |

## 保留失败与修正

- d 目录原未登记 autosave POST4 的原始复现保留；它是本次真实问题证据。
- e 自有 `00-37-52` / `00-39-43`：正常 confirmed 比原 queueSuccess 清 pending 早一瞬，捕获失败后 immediately 已空；加自然 settled 等待，未放宽“最终为空”。
- e 自有 `00-40-35`：迟到后稿取样早于原下一调度；补推进完整原 timer，不改产品来迎合测试。
- e 独立 `00-40-37`：GET 成功时原 g 忙，旧 A 没移出、C 无继续入口，是真问题。已以原 S/E idle 准确 ack 修复，最新独立 9 项通过；没有手工 ack/fixture retry 掩盖。
- e 独立 `00-50-18` 把 GET 后受控时钟完全不推进当成必须同步清 pending，原 500ms worker 尚未结束；改为立即读取 raw 正文/帧后再推进原时钟验自然退休。`00-52-20` 的同 Canvas 换 API 案例安全断言已过，但测试把状态标签预期写成 context-changed；实际明确为 core-preflight-failed，按真实预检分支修正预期，未改产品状态迎合测试。最终 10 项通过。
- e 自有 `00-46-57`：新增续稿断言的 logger 环境每 render 更换 warn/error，触发原 r6 effect cleanup；仅稳定 fixture callback 与原 clock，随后显式续稿通过。`00-48-39` 的迟到断言也早于旧 A 原 queue retired；改为先等原 A retired，再推进原后组 timer，最终 `00-50-08` 通过，未修改产品来迎合该断言。

## 仍未完成

- Core 预检失败、准确 CAS conflict：草稿与原 g 保留、不会自动重发；“读新版本对照→明确选择新意图继续保存”的完整原处产品流程尚未完成。
- deferred updater 前 primary A 已换成 B：B 内容保持，A 旧稿仍保存在原 held op/pending；“把 A 稿恢复到哪份材料”尚无完整用户选择流程，不允许对 B 偷写。
- 同 canvas 换 API、换现场都受原来源身份保护；跨原 owner 的旧稿归属/恢复不能仅凭 block 就宣称完成。
- 原 queued 恢复按钮的 busy 仅读原 v/S/E，尚未计入原 y/w 已 scheduled timer；恢复后用户再输入时可能短暂多显示“继续保存”。未造成第二 writer；已报 root，冻结期间不改产品，需后续把原 timer 纳入派生状态。
- 独立 hook 与真实临时 Core 分层通过后，仍须整 App 精准 CAS、unknown/恢复、原 Undo/Redo、关闭/重开与页面回程实际验收；不把 9 个原组件用例当全流程完成。
- **另已实际复现原 Undo/Redo 自身丢回包缺口**：它们的普通正文 DTO 不经过 vZ 来源登记，inner 重发到 4 次，显式原 retry/cleanup 后到 7 次，仍旧 CAS/无 token/pending 空；raw/live ref 落后于实际 peer。见 [准确结果与范围](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原UndoRedo丢回包_实际复现.md>)。不把 autosave loss+正常 Undo/Redo 通过扩成历史请求自身的 loss 已保护。
