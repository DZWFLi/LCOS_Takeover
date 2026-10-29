# Library 与 Collection：按完整流程复核

2026-10-17，只读审查。范围包括 Library、Assembly、Context、Workflow/方法、材料阅读、位置、Collection 和 Drop。

**结论：原库框架和部分预览已接回，但仍有原手势被截断、自制二级面板、旧整页分派和未完成生产链。Collection 也不豁免。** 不能拿“用了 Zp/TS/JT”代替入口、操作含义、返回和失败恢复都成立。

## 证据边界

- 原件依据：[TapNow page-Da_DfwiK.js](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js:1>) 的 `jF/CU/Zp/TS/IS`，及 [course-api-base-url-CifxI1ia.js](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js:1>) 的 `yFe/i3/h5/JT/wa/d2/c2`。原件未改。
- 当前业务源码有显式采用原 GN2 的依赖闭包；不是所有 `lcos/` 副本都等于实际采用版本，依据 [current-gen2-resources.mjs:7](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/current-gen2-resources.mjs:7>)。下文优先引用实验代码和实际采用源。
- 56238 的已运行 bundle 是此前版本。本轮正文变体、输入回程、统一 Viewer 与普通材料投放新增接线，**未构建进该实例，未做整页实测**。
- “源码可达”只说明存在 caller/分支；“旧残留”不等于当前默认入口会打开；单独 Core/模拟测试也不等于实屏流程通过。

## 原库、材料、Context 与方法

| 项 | 原 TapNow：入口 → 页面 → 操作 → 返回 | 当前状态与证据 | 正确接法及保留能力 |
|---|---|---|---|
| L1 主库框架 | 左下库入口 → jF 的搜索/空间/文件夹/列表 → 原行或更多菜单 → 原库 | **部分对齐。** 库标题下的自制检查器已移走；原列表仍由 sF 控制。[行承载:390](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:390>)、[sF 包装:69](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:69>)。这只能证明主容器连续。 | 保持原宽度、滚动、搜索与文件夹 owner；新增来源进原分类，不再挂一套管理器。 |
| L2 材料行/Apply | 原 Zp hover → TS 小预览；单击/Apply → 当前 viewport 创建节点 → 继续原画布/库 | **操作曾被截成只预览。** 当前 Core 行改 click Popover：[397](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:397>)。新主按钮虽已接 [place:171](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-assembly-ui.tsx:171>)，但 facade 尚未注册 `materials:place`，完整投放仍未完成。 | 普通浏览须完成准确版本→现有 Core/空间生产者→原 O8→原 Canvas；明确输入选材才引用。保留准确 Revision/View/FileRecord、原编辑、选区、相机和未知回执。不能 URL 伪导入或直接 addNodes。 |
| L3 输入选材/回程 | 原库行/预览的动作位 → 使用材料 → 关闭当前预览 → 回到原输入 | **新源码接线，未整页验证。** [来源身份:118](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:118>)、[回程:78](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:78>)、[材料使用:164](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-assembly-ui.tsx:164>)。不再仅凭 Composer 存在就假定选材。 | 原 Popover 关闭后打开已有右栏、回同 input key/message/continuation；不换 receiver、不覆盖草稿与新选区。现在只有函数/迟到发布模拟通过，不能算主实例完成。 |
| L4 原更多菜单/云空间 | 原 IS/空间切换 → 原改名、移动、复制、下载、删除 → 原列表更新/错误恢复 | **入口保留、生产者未接齐。** Core 原菜单仍在 [398](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:398>)；[Library 非 GET 明确 501:208](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/assembly-library-projection.ts:208>)，非私有空间 [215](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/assembly-library-projection.ts:215>)。 | 原菜单逐项接真实 Core owner；不适用语义重新定名并记录。不能仅删菜单或改 CSS 后说已完成。 |
| L5 Context/方法分类 | 原库树/搜索 → 原 Zp/TS 详情 → 当前动作 → 返回库或原导航 | **当前接法方向正确，但只是一部分能力。** [分类 producer:181](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:181>)、[原详情槽:74](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:74>)；未从此入口加载 GN2 Atlas/手牌。当前详情仍是自写正文与按钮，不能直接按“整类迁完”通过。 | 分类、搜索、详情和返回留原库；引用、选区加入、进入真实 Workspace 保留原 producer/Ke。创建、管理、整组携带等能力须另列，不能只迁浏览。 |
| L6 分类 Drag/菜单 | 原行拖拽/更多 → 原目标接收 → 原反馈和返回 | **未融合。** `lcos_library_entry` 禁 drag、隐藏 IS：[78](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:78>)。旧 Atlas 的拿取与 Workflow 携带不能因入口不用了就视作已迁移。 | 在原行/原菜单桥准确对象和唯一 Drop owner；虚拟固定分类不必假造文件夹编辑，但具体 Context/方法的用户能力不能一并消失。 |
| L7 正文/成员空间利用 | 原 TS 媒体封面与 footer → 读内容/按动作 → 关原 Popover | **原错位已写修复，未进主实例。** 原 225px 媒体盒曾裁方法、给短 Context 留白；[contentVariant:92](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:92>) 与 [详情:537](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:537>) 改为受剩余高度约束的正文。 | 保留原外框、名称、主次动作和返回；长内容在原预览内部滚动。Chrome TS/CSS 夹具通过，不等于整应用/全部动效通过。 |
| L8 方法内容表达 | 原详情内容区 → 读方法 → 加入同一未发送输入 → 原输入 | **有内部 ID 泄漏分支。** [方法格式化:319](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:319>) 在缺动作名时回退 actionId；[321](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:321>) 在无标记名称时直出 id/kind。 | 用用户名称、可理解的缺失状态和可导航定位；保留完整用户方法说明与准确引用，不能正则删用户正文以“清披露”。 |
| L9 来源完整度 | 原库分类/导入菜单 → 原来源列表与详情 → 取用 → 返回 | **Capture/Sources/Skills 没由当前新库路径接齐。** 这里新增类仅 context/workflow：[23](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:23>)；Artifact 查询也不是所有来源生产链。 | 各类分别接原分类、详情、导入/采用/错误恢复；保留 Capture staging、来源归属、Skill 版本和真实导入。不要把旧 Assembly 来源页重新当新增窗口搬回来。 |

## Collection：主体和每条手势都重查

| 项 | 原 TapNow 完整流程 | 当前状态与证据 | 应接位置、不能丢的能力 |
|---|---|---|---|
| C1 主体/Gallery/Group | 原 Pile → 原单击/Enter/Space Gallery → 查看/操作成员 → 回 Pile；原 Group 在原画布展开 | 原 renderer 连续，仅 face 换 RareFolder：[wrapper:17](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:17>)、[face:353](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:353>)。**这项不能替整个 Collection 免检。** 本轮没有运行实例 Collection 夹具。 | 保留用户认可 face、原 Gallery/Group、Core 成员与原历史；仍须逐项验键鼠、触屏、成员操作、多层/多版本及返回。 |
| C2 标题编辑被改道 | 原 h5 标题编辑 → 原 inline 输入 → 保存/取消 → 原节点 | **原入口被禁，再新造表单。** [readonly:158](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:158>)、[原 h5 测试改写:564](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:564>)。虽然 wrapper 传 NativeTitle，但 shell 未用它，转 [自制 form:395](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:395>)。 | 把 Core rename 与回执接原 inline 编辑，不新增“命名面板”；保存/取消/Escape/焦点归还照原流程，保留手工标题保护和不重放。 |
| C3 第二工具条/黑面板 | 原节点 hover/选中 → 原 toolbar/menu → Gallery/原操作位 → 回节点 | **另搭 GUI，P1。** 原 renderer 外又挂绝对定位 JT：[384](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:384>)；wrapper 没有 selected/hover 显隐；[390](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:390>) 自写 #222 面板、rename/member 两种 body。用了 JT 也不是原流程融合。 | 动作合入原 toolbar/更多菜单，成员查看/加入/移出进原 Gallery；统一显隐、缩放、层级和关闭返回，保留现有互斥、历史确认和未知结果。 |
| C4 原合并/拖入手势 | 原成员拖到 Pile/两堆合并 → 原落区反馈 → 成员改变 → 原 Gallery/画布 | **确认源码缺口，P1。** 原 merge/addMember 在 [610](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:610>)、[613](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:613>) 被消费；[Operation:244](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:244>) 仅实现 unpile/remove，其他拒绝。保留了样子与手势入口，却没桥真实成员写入。 | 在这两个原 gesture seam 接准确 Collection membership/合并语义及回执；失败原处恢复。不能用另一个“加入”列表按钮代替原拖入流程完成度。 |
| C5 解堆/展开与移出语义 | 原 unpile/拖出眼前成员 → 原几何/成员变化 → 原画布 | Core unpile 被改为 toggleSpace：[249](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:249>)；移出按 Artifact ID，候选也按 Artifact 去重：[79](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:79>)、[250](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:250>)。**这是原 View 手势与实体成员语义的差异，不能默认为一致。** | 明确“展开仍保留集合”与“解散集合”的区别；多 View 同 Artifact 时，说明移出的是整份材料还是眼前投影，并实测准确版本与几何。不能靠猜测增加成员类型。 |
| C6 成员列表/失败恢复 | 原 Gallery 成员 → 预览/选中/移出 → 原 Gallery 或返回节点 | 自写列表有“Core 成员”、ID fallback、原错误直出：[419](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:419>)、[427](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:427>)、[437](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:437>)；首次 read 失败工具 disabled，缺明确重读动作。 | 原 Gallery 行展示名称/缩略图/明确失败与重试，保留所有实际成员、嵌套与未投影项，内部诊断留日志。不要删失败项冒充完整。 |

**类型核实：** 实际采用的 [CollectionMemberType:81](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/packages/domain/src/index.ts:81>) 不含 `view`，Core route 和 SQLite 也拒绝该类型。因此不把“不可能的 view 成员不发 DELETE”列为真实 bug；C5 只列实体成员与可见 View 操作的语义差异。

## 旧 body、阅读、位置与 Drop

| 项 | 原入口/页面/操作/返回 | 当前 caller 与判定 | 正确接入与保留 |
|---|---|---|---|
| R1 旧 Assembly 与串出的窗口 | 原库 → 原预览/菜单 → 原 Viewer/原画布 → 回原处 | 全局 [Stage 挂载:170](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-professional-host.tsx:170>)；[shell 旧窗口恢复:377](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts:377>)；[AssemblyBody 分派:924](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx:924>)。旧 Assembly 又能 [portal-preview:896](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:896>)、[任意 destination body:911](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:911>)、[archive:971](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:971>)。**旧分派/恢复条件可达，不能说当前普通库必开它，也不能说清完了。** | 把每个真实操作导向原库、原 Viewer、原 Gallery/原导航；保留窗口未完成输入和来源归属，迁完后再处理旧分派，不直接清空状态。 |
| R2 旧 Collection WorkView | 原 Pile/Gallery → 成员操作 → 原 Gallery/节点 | [LCOSCollectionNode:431](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:431>) 仍 openWindow('collection')；旧 Stage [951](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx:951>) 渲染整张 GN2 CollectionWorkViewBody。当前 native-pile producer 通常不用该旧节点，所以属旧模式/旧状态条件路径。 | 逐项迁到原 Gallery，不以删除旧数据收尾。不能把隐藏旧入口算功能完整。 |
| R3 旧 Context Atlas/Workflow Hand | 原库分类/搜索 → 原详情/原现场选择 → 原 Ke/输入 → 返回库/输入 | [Context Atlas portal:106](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-saved-context-host.tsx:106>) 与 [Workflow Hand portal:162](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-workflow-host.tsx:162>) 都是 GN2 body。**当前 lab 搜索只找到定义，没有找到生产 UI caller；属残留，不能误报当前按钮正在弹它。** 若复接就又绕原库。 | 保留它们的真实浏览/拿取/方法/进入能力，迁到原分类/详情/菜单；不能直接恢复两张 GN2 总览当融合。 |
| R4 统一媒体查看 | 原 TS/画布媒体 → 原 wa/d2/c2 Viewer → 原图片/视频/文本模式、操作 → 关 Viewer 回原处 | 新 [查看 caller:229](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-assembly-ui.tsx:229>) → [原 Viewer session:155](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-viewer.tsx:155>)；[transform:29](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-material-viewer-transform.mjs:29>) 扩原槽，不另建 window owner。方向较对。仍有自写阅读选项菜单 [94](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-viewer.tsx:94>)、[阅读工具 details:57](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-reading.tsx:57>)；PDF/PPT 等继续采用 GN2 内容叶子。**仅源码，未进运行 bundle/逐格式实测。** | 验证原 Viewer 的打开/关闭、锚点、缩放、主次动作和返回；逐项接原动作位置，检查新菜单是否重复/过载。保留准确版本、搜索/大纲/摘录/字号、PDF/PPT/音视频、来源/对照，不因采用内容叶子就判整页硬搬，也不因在原框里就自动判融合。 |
| R5 位置/场景 Peek | 原材料预览 → 同 Popover 位置列表 → 场景 Peek/返回或原画布定位 | [同容器位置/Peek:129](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-rail-ui.tsx:129>)、[RailwayPeek 叶子:86](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-rail-ui.tsx:86>)、[原 select/fitView:114](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-navigation.ts:114>)。旧专用夹具实际走过。没有新“位置窗口”，但场景视觉仍采用 GN2 SVG 叶子，未验证 TapNow 动效一致性。 | 保留准确版本/文件/位置双读与离场取消；场景与小地图按原视觉和手势逐项核对，不靠一个 SVG 宣称已学完。 |
| D1 原库拖放协议 | 原 Zp drag → 原画布/目标 → 原落点/反馈 → 原现场 | 原库仍是 `application/x-library-asset`；GN2 semantic drop 是 `application/x-lcos-assembly`；当前 [行 transform:390](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:390>) 没桥原 dragstart。新按钮投放也不等于拖放已完成。 | 原源手势接准确 Core 引用与唯一 DropCommitRouter，保留版本/源归属/unknown；系统文件、URL、PDF、ZIP 另实拖验。 |
| D2 GN2 全局 Drop UI | 原拖动幽灵/目标反馈 → 原局部确认 → 原现场 | 当前 [Host:155](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-conversation-drop.tsx:155>) 直接挂 LcosHostOverlay；其 [539](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/LcosHostOverlay.tsx:539>)、[540](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/LcosHostOverlay.tsx:540>) 仍显示旧 DropPreview/Receipt。**业务 owner 可保留，整套视觉仍未原生融合。** | 业务 resolver/commit/unknown/撤销保持；视觉接原拖影、落区、原局部菜单/反馈与恢复，不是简单换浅色。 |
| D3 文件/Workflow 归档边界 | 文件拖到原真实 Canvas → 原导入/归档动作 → 原落点或明确失败返回 | 实际采用 overlay [142](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/LcosHostOverlay.tsx:142>) 仍查 `[data-lcos-workflow-worksite]`/`[data-canvas-root]`；TapNow 是 `[data-canvas-container]`。现 [transform:137](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-ui-source-transforms.mjs:137>) 改集合目标，未见这组归档选择器适配。**源码风险，未实拖证实。** | 捕获边界接真实原 Canvas DOM，继续走原导入 producer；失败消费原手势，避免落成无关普通节点；完整验取消/未知/重复。 |

## 当前施工与验证状态，不能混算

1. **以前真正实测过的局部**：原库准确版本小预览、单 Popover 的位置/场景/返回、原导航与 fitView；合成会话无 reload 放置/点 Glyth 开原右栏/刷新持久化。不能外推为整个库、Collection、方法或 Drop 已完成。
2. **本次单独测试通过，但没进主实例**：正文 TS/CSS 桌面与窄屏夹具；输入回程真实函数、迟到 textarea 模拟、错消息/操作/Canvas/API 拒绝；准确材料 producer/client/history 独立测试。
3. **准确材料投放仍未完成**：UI、client、O8 helper 已写；facade 未注册 `materials:place`，原 O8 只 `setTimeout(0)` 尚未等待原 React 发布。56238 bundle 不含这套新代码。不能说主按钮可用，更不能说无 reload 实测通过。
4. **只写好、没跑的整页回归**：`native-library-placement-browser.mjs`（含丢成功回包→unknown→只读恢复）、更新后的 Context/方法取用回焦点脚本；停止施工后未启动或构建去跑。
5. **明确没验**：Collection 原标题/Gallery/合并/拖入/多版本移出全流程，全部菜单写入、完整来源能力、原库和系统文件拖放、所有阅读格式、动效/触屏/缩放密度。

建议下一步顺序：先补原手势和生产 caller 的断链（L2/L4/C2/C4/D1），再移走二级自制容器并迁旧条件入口（C3/R1/R2），然后逐格式/逐返回路径验阅读与分类能力。每项必须有真实用户动作结果；不是再多挂一个按钮。

## 追加：本轮方法与 Context 的只读实屏测量

这是对当前 56238 页面的新测量，**不沿用旧图的裁切结论，也没有注入更长正文**。现有 `13-method-preview.png` 短内容大体能看到，不能单凭它断言所有长方法都失败；以下结论来自同一现存合成方法的 DOM/文字 Range 与新截图。

[完整测量 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/方法布局测量.json>)。仅新开一个自有 Chrome 只读测量；所有非 GET/HEAD/OPTIONS 请求均拦截，未点取用/提交按钮。测量前后 Core graph、presentations、runs 完全相同，0 pageerror；没有 build/restart。

| 实际测量对象 | 当前运行页 | 可以得出的结论 |
|---|---|---|
| 方法正文 div | clientHeight=312，scrollHeight=312，overflowY=auto | 正文自己没有纵向滚动余量；有 `overflow-auto` 不代表用户能滚到被外层挡住的文字。 |
| 正文直接祖先 | clientHeight=225，scrollHeight=269，overflowY=hidden，flexBasis=225px | 仍走原媒体盒。它是 flex basis，并非任何场景下都不可变化的硬 height；**这次实际高度就是 225px**。 |
| 文字 Range 与裁切祖先 | 文字顶部越界约29.4px，底部越界约28.4px | 本次现存方法已经有上下裁切：新图顶部缺“工作流方法”行，末条连接文字被挡。没有推断所有长度或新源码也必裁。 |
| 磁盘源码与运行 DOM | 源码已有 contentVariant/content-body；运行 DOM 对应 class 数为0，仍是 `basis-[225px]` | L7 的修复只在源码/单独夹具通过；当前产品运行页尚未应用，不能填“已实屏修好”。 |
| Context 一条成员正文 | 正文高48px，媒体祖先高225px | 本次空媒体高度差177px，当前留白确实存在。 |
| Context 成员点击 | 一个普通 li，无 link/button/焦点入口；点击前后 URL、dialog 数、Viewer 数、正文均不变 | 当前“成员列表→点开材料→回列表”的点击链未接。这里只实测这一名成员，没有替所有类型做结论。 |

Context 的限制要准确写成“当前库适配器限制”，不能扩大成 Core 或全产品都不支持：

- [Presentation 契约:47](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/packages/contracts/src/presentations.ts:47>) 允许 `view/scope/workspace/conversation/note/collection` 实体成员。
- [库引用适配器:290](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:290>) 遇到任何非 View 的 `memberEntityRefs`，拒绝**整组取用**，保留原输入；没有悄悄略过这些成员，也没有从这个入口采用它们。
- View 成员按 [291](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:291>) 合并 `memberViewIds` 与 View entityRefs 后去重，核对 Artifact/View/Revision/FileRecord。明确 pinned View 保留原 Revision；未 pinned View 才按其 Current 语义解析，缺少明确历史版本不会换新版本补齐。
- 随后的 [引用 admission:468](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:468>) 还受输入意图、MIME、发送中状态限制。此适配器对非续聊材料的已知 MIME 作注册文本格式检查；续聊用自己的能力路径，不能据此宣称图片/PDF已经能读。
- [显示列表:528](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:528>) 只把 `memberViewIds` 渲染成纯文字 li；`memberEntityRefs`（含 View）只显示“另有 N 项关联内容”。“进入现场”是独立的 Workspace 导航，不等于点开这些成员。

本次 Context 夹具恰好只有一个 memberViewId、没有 memberEntityRefs；非 View 拒绝行为是源码核查，没有创建新数据或点击取用来演练。

[当前方法新截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/screenshots/15-method-measured.png>) · [当前 Context 新截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/screenshots/16-context-members-measured.png>)
