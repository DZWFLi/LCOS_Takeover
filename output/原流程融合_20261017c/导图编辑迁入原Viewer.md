# 导图编辑迁入原 Viewer

2026-10-17，第三工作区 `E:/Codex 项目/LCOS夺舍计划_20261013`。

**当前补充（候选 PID40728）：14组真实原Hook严测和整页丢回包→关窗续稿→真实30秒0重发→原核对GET回执→原Undo/Redo各一次全部通过。原history索引1→0→1、size始终2；本测试浏览器只读捕获原始快照，saved/Undo/Redo正文和确切revision均与Core/live一致，pending=null，无新Artifact/Run或模型调用。完整状态与旧失败见 [Core文本重发独立验证](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/Core文本重发独立验证.md>)、[最终整页report](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-17T00-14-30-272Z/report.json>)。原56238未动。以下旧时点和失败保留为历史证据，不能当最新状态；标题rename、Stage等未闭环范围也未销账。**

不把复用了 GN1 树逻辑或局部通过当作全区融合完成。

最新回归时点：候选 `56239/PID31032` 已由根线程完整build/start，保留同一runtime。`2026-10-17 07:23:08 +08:00` 对既有合成节点再跑一轮 **normal PASS**，无新Artifact/Run、无模型或pageerror；2次batch为种子1次+实际编辑保存1次。确版正文与代码块回读、reload、原Back关闭后草稿续接、单原Viewer和无旧window class均通过。浏览器已关闭。

[最新PASS report](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-23-08-944Z/report.json>)、[最新编辑稳定态](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-23-08-944Z/01-original-viewer-map-edit.png>)、[最新保存阅读](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-23-08-944Z/03-real-confirmed-version-reading.png>)，三张新图已逐张打开。第二张草稿续接图拍在原动作栏内容过渡时，不能单用该帧证明按钮稳态；实际保存按钮在后续真实点击中就绪，首张明确等六按钮出现。

根线程已将“resolver之前，仅exact primary occurrence且有保留draft/exact pending允许取旧确版FileRecord”的修复并入本构建，18项source cases通过；本轮按指令没有再次做loss，所以恢复读只标**源码修复已加载/正常路径未退化**。原队列自动重发仍未修，下面的loss失败证据与缺口不撤销。

## 原来错在哪里，现在接到哪里

原 `LCOSNativeTextBodySlot` 点“编辑导图”就另挂 `MindMapEditor`，后者 `createPortal` 到 body，自己带 scrim/dialog、窗口键盘监听及 HUD。原 Viewer 之外又造一层编辑场景，用户关闭/返回和真实节点脱节。

现在生产路径为：

`原纯文本节点 → 原 JT 工具栏“导图 / 编辑导图” → 已挂载的统一材料入口 → 同一 wa/d2/c2 session mode=edit → 原 vZ 内容槽中的 GN1 导图内容 → 原 UX/XO 的 gm 按钮 → 原保存端口 → 同 Viewer 阅读确切保存版本 / 原 c2 返回节点`。

外层尺寸、动画、焦点回源、关闭与源节点显隐仍属于原 `wa/d2/c2/uZ`。按钮只 portal 到该 session 的原 `UX` 挂点，不增加外层窗口或另一条浮动工具栏。

| 原真实 owner | 采用方式和当前落点 |
|---|---|
| `MindMapEditor.tsx` 的树操作、布局、原位输入、分支剪贴板 | 原文件只读；[native-outline-transform.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-outline-transform.mjs:143>) 新增 `transformNativeMindMapContent`，先跑既有无损 source-map 变换，再只扩 embedded 内容模式 |
| 旧 node `saveMap → saveNativeCanvasText` | 从 node 外框移至 [native-mindmap-editing.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-mindmap-editing.tsx>) 的内容 owner；继续走同一原 `updateNodeData/history/batch` 保存端口、expectedRevision、确版回读、unknown只核对。不走原G7的厂商默认自动写，不直接Core PUT |
| 原 node 图面/折叠/正文模式与 density | 继续留在 [native-text-first-ui.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-text-first-ui.tsx>)；只把旧 `setEditor + <MindMapEditor/>` caller 换成原 Viewer request。未删图面、文字、折叠与节点尺寸机械 |
| 原 `vZ` 的 `mode===edit` / `G7` 编辑切换 | 根线程在同一个受控原 session 接内容槽，保留普通原 `G7` 路径；受控导图使用本内容，不错误显示一条无实际 editor 的G7格式栏 |
| 原 `UX/XO/gm` 动作栏 | 根线程给出 session 唯一 `data-native-mindmap-actions` 挂点。内容以原 `gm label/tooltipsEnabled/disabled/onClick` 填复制、剪切、删除、粘贴、取消、保存与核对按钮；没有自造 tooltip 或窗口 |

独立 `native-text-first-ui` bundle 的入口从 `/lcos/agent-ui.js` 引原已挂载的 request/available 导出，避免在两个 bundle 各生成一份 mountedOwners 导致入口永远不可用。

## 功能没有靠删掉来“解决”

- 原双击全文改字、根节点文字输入、Tab 加子级、Enter 加同级、Shift+Tab 升级、Delete/Backspace 删除、Ctrl/Cmd+C/X/V 整分支复制剪切粘贴与按钮仍由原函数执行。
- 原 `createOutlineSourceSession` 保留 headings、内联标记、标签、空行、代码块和不透明内容。只做显示的树不是新文档真值。
- 草稿保存原 source session、树、选中、单点输入和分支剪贴板，以 Project/Canvas/Node/Artifact/View 区分；外层关闭不清草稿。明确取消仅清本次草稿，保存未确认时不允许把 pending 偷偷清掉。
- 内容层保存中关闭：未确认操作留在原端口；晚回执留到同一 occurrence 恢复。不会给新现场调用旧 onSaved，也不会把读回相同正文冒称 spatial/history 回执已确认。真实外部队列的重发及统一reader的重开缺口见下文，不能据内容层策略说整条恢复已通。
- 图面键盘只在内容获焦时处理。单点输入 Escape 取消该点，回图面焦点；图面 Escape 交原 c2 关闭并保留草稿。Tab/删除不会漏到背后的画布。
- 实测抓到“新建分支后 Escape 留空节点，序列化拒绝后续保存”的问题，现仅在 embedded 路径取消该未提交新分支；默认普通编辑器行为未被偷换。

## 验证状态

| 层级 | 实际证据 |
|---|---|
| 源/普通路径回归 | `node --test scripts/native-outline-transform.test.mjs scripts/native-outline-source.test.mjs` 16项通过；`native-text-first-policy/context` 2项通过。既有默认 source-map 变换保持原测试语义 |
| 内容/受控端口模拟 | `node scripts/native-mindmap-content.test.mjs` 6组通过。真实 transformed GN1 + production 内容leaf + Chrome；Core/read/save端口为模拟，不能冒称实际Core或整App验证 |
| 模拟覆盖 | 单外dialog；按钮进原槽；未发送草稿关闭续接；局部Tab/双层Escape；分支和剪贴板续接；源代码块保留；unknown仅verify；Core前进而node ref旧时不替换base；保存中关闭与晚回执；版本变化0写；明确取消仅清自己的稿 |
| 整页真实 Core normal | 候选 `56239/PID24428`，原节点工具栏进入原Viewer；无第二dialog、无旧fixed/shadow外框；原UX六按钮稳定出现；未确认编辑原Back关闭后恢复；编辑按钮只发一次真实nodes:batchActions；Core新revision/正文/代码块确版读回和reload通过；没有新Artifact/Run（复用首轮fixture），无pageerror/模型请求 |
| 整页真实 Core loss | 原真实batch在服务端200且Core/spatial已存，脚本将该回包丢弃。当前编辑内显示待核对、点核对时没有再发batch、未冒称成功；随后原Back关闭再由node编辑入口打开失败。等待期间原队列又自动发同body/旧ref写请求。整体FAIL，不以normal PASS抵账 |

模拟证据：[mindmap-content-fixture-result.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/mindmap-content-fixture-result.json>)。

真实normal证据：[PASS report](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-16-11-669Z/report.json>)、[同原Viewer编辑](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-16-11-669Z/01-original-viewer-map-edit.png>)、[未发送草稿恢复](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-16-11-669Z/02-unsaved-draft-resumed.png>)、[保存确版回阅读](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-16-11-669Z/03-real-confirmed-version-reading.png>)。三张均已逐张打开查看。normal报告共2个batch，其中1个是明确记录的人工大纲种子，只有1个来自实际保存按钮。

真实loss证据：[FAIL report及所有batch payload](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-17-16-897Z/report.json>)、[重开失败截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-17-16-897Z/failure.png>)。没有再次提交这个测试，也没有删除已确认Core文件或未确认记录。

### 首轮实屏确实抓到了硬搬

[首轮失败截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-16T23-10-26-115Z/failure.png>)已打开确认：虽然JS分支没有创建第二个dialog，但embedded仍带 `.mindmap-editor`，原 `text-faces.css` 对这个class施加 `position:fixed / inset:8vh 8vw / border / shadow`，结果又是一张白色编辑卡，图还被裁边。**去掉portal不等于融入原容器。**

当前源码已从embedded根节点彻底移除这个旧窗口class，只留内容class及必要SVG/link leaf样式；普通默认modal class保留，原树/快捷键/保存不删。模拟夹具现载入真实旧CSS并检查无旧class、relative定位和无box-shadow。根线程第二次UI-only加载后，normal整页也实测并查看确认该旧外框已退，不是用CSS遮住。

该轮脚本最先失败的是在原phase opening阶段过早断言动作数0，700ms后的失败截图已经能看到原UX六按钮；这是测试等待条件问题，不是靠增加新UI挂点去补。脚本现等真实原槽按钮出现。原加号创建及真实native save port种大纲已确认，合成node `text-a34ae67c-c735-4b2f-9d1a-e6b5caff5cb9`保留复测；不会为每次选择器修正再造一份材料。

第二轮 `23-14-53` 的正文保存/reload已过，脚本尾部把Run列表误当graph字段导致整体FAIL；该失败报告也保留。修正为真实 `/projects/:id/runs` 读取后才得出上述最终normal PASS，未回写旧report。

## 尚未退场与明确缺口

1. **这是 primary 文本节点的新主路径迁移，不是所有旧窗口已退。** 原 `LcosTextFaces.tsx:158` 仍有默认 `MindMapEditor` caller；历史 Stage/旧 Reader 的可编辑路径未逐一翻译完。`native-execution-ui.tsx:465` 的结果文本只读，未给 `onSaveText`，因此该处不触发默认编辑 dialog。普通非LCOS原文本节点继续用原G7，不能为了称统一就删它。
2. **根标题保存尚未接齐 GN1。** GN1 的 `LcosTextFaces` 在正文保存后会 `renameCanvasNode`；旧 native-first wrapper 却早已拒绝 root title 变化。本内容暂保留该限制和明确说明，没有删除根文字编辑来掩盖缺口。下一步应复用同一 canonical `renameCanvasNode` owner，在真实正文回执确认后改标题；分别处理正文成功/标题失败与丢回包，不重发正文。不再另建“命名设置窗”。
3. **无草稿的外来 pending**：原端口操作仍保留，允许进入原内容槽看到诚实状态；本轮不伪造缺失的旧 snapshot/source session，也不宣称这种恢复已完成。
4. 草稿是浏览器会话内临时编辑状态，不是磁盘恢复。原编辑器本来也没有该层 reload 持久化；真实保存结果必须由Core验证/reload，不能把会话内草稿说成永久保存。
5. 当前材料/节点仍存在其他布局与旧 Stage 侧路问题；本内容迁移不等于整工作区成熟度合格。晚到 Collection Hde/Vde 浅色修复仍按根线程统一加载边界单独记录。
6. **真实loss重新进入失败（旧失败证据保留）。** 现象在原Viewer统一读链，发生于恢复policy之前：旧revision+动态primary View已随Core推进，解析确版地址时先被拦，内容层根本未挂上。根线程该恢复读源码修复现已并入PID31032，限同primary occurrence且有retained draft/exact pending，普通历史仍只读；18source cases过。本轮仅回归normal，未把它假称loss实屏重验已过。
7. **原队列自动重发。** loss刚点核对时只有1次编辑写；关闭/重开等待期追加3次相同body和旧ref写（总batch5=种子1+编辑4），不是本leaf再次调用save。CAS防止重复版本，但不能把它写成“没有重复发请求”。根线程已委派原HTTP/queue owner审查，不由本内容另造一套保存队列掩盖。
8. 节点导图正面仍是既有 `NativeMapFace` 叶子，不是本地TapNow原生导图组件；其全量浅色、密度与可及性未被本轮编辑槽验证覆盖。

## 六字段回传

- **READ_SOURCE**：第三工作区 `lcos/huabu/apps/web/src/lcos/nodes/text/{MindMapEditor,MatureMindMapLayout,outlineTree,LcosTextFaces}.tsx/ts`；`nodes/nodeRename.ts`；`lab/pilot/{native-text-first-ui,native-text-save,native-text-first-policy,native-text-policy,native-outline-source}`；原本地 `course-api-base-url-CifxI1ia.js` 的 `vZ/G7/uZ/UX/XO/gm/wa/d2/c2`；根/lcos AGENTS与React实践指南。
- **ADOPTED**：项目自有 Gen1 derived editor 文件头 `@3e99769` 的实际函数 → `transformNativeMindMapContent` → `NativeMindMapEditing` → 原vZ内容槽与原UX动作槽；当前 native save port为真实写owner。原件只读，无厂商再分发。
- **VISUAL_SOURCE**：本地TapNow原文本Viewer布局/尺寸/动作位置，不猜Figma新窗。图内部用既有GN1导图结构，不新增外层产品壳。
- **RETIRED**：primary node `LCOSNativeTextBodySlot` 的独立MindMapEditor dialog caller；原默认函数/旧Stage条件caller保留并记账，未用CSS隐藏称退役。
- **VERIFIED**：上述源回归18项、内容模拟6组；候选56239真实normal保存/dirty关闭回源/reload/单原Viewer外框。loss当次编辑里原verify不重发且不假报成功，但整个恢复链FAIL。
- **UNRESOLVED**：真实loss旧primary View解析与原队列重发；旧Stage/default LcosTextFaces恢复入口；GN1根标题真保存；无source draft外来pending；会话草稿reload；节点导图正面的全量视觉审查。
