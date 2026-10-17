# Color Pin 原入口接线审查

结论：**保留 TapNow 原节点工具带的 Pin 弹层、原顶栏颜色组、原组菜单和小地图；替换它们的读写来源，不搬回 GN2 的独立 ColorPinHud。** 现有 Core 足够接“首次标记、多个颜色的增减、按组高亮、移除本画布标记”；原组命名确实缺 definition 更新 owner，导航也不能直接照抄旧 HUD。不能把 `color_pins` 放进 node DTO 白名单就报融合完成。

本轮只读原件及真实源码，增加两个独立 probe/test 和本报告。**未访问候选、未启动浏览器、未构建/重启、未写 Core、未调用模型。** 下述七项 PASS 是原代码的语义差异复现，不是 Color Pin 已完工。

## 1. 原入口到底做什么

原包不是一套单选“给节点换色”：一个节点可以同时有多种 Pin。点新的色点是增加关系，再点同一色点才移除；节点主色取最后一个 Pin。原顶栏所谓 filter 是“打开组菜单 + 高亮该组”，**没有删除、隐藏其他节点或另做一份过滤画布**。

| 操作 | 原 owner / 真实调用 | 应接的 LCOS owner 与最小改法 |
| --- | --- | --- |
| 打开节点 Pin | course `Dg → Hie → jie`；`Dg` 是原 image/video/audio/3D/text 工具带 item，`jie` 管原 Popover、焦点、键盘与六色布局 | 保留这些原组件和 item 所在分组；只给受控 `pins/choices/disabled/onToggle`。不要新增工具带、窗口或 HUD |
| 首次标记 | `Yie.togglePinOnNode → getNodes → pp → Ioe → updateNodeData(wM(...))` | 对准确 canonical target 调 `CoreColorPinClient.assign`。原首次点色可原子创建/reuse definition 和 membership，不必另造“先创建空组”的步骤 |
| 增色 / 移除一色 | `Ioe` 多选增减 `data.color_pins`；不是改共享 definition.color | 增色沿 assign；减色按确切 membership.id 调 removeMembership。不要暗中清除其余颜色，也不要把“选另一色”误作全项目改色 |
| 顶栏组 / 数量 | page `H7 → v7 → w7 → y7`；course `pBe → Foe(nodes)` 以当前节点集合算组及 count，原色板固定排序 | 同 Core snapshot 和当前原 API 的准确 target 投影，算**当前画布**的 nodeIds/count，保留原条的位置、尺寸、动效。不要把全项目 membership 数量塞成“本画布节点数” |
| 打开组 / 高亮 | `w7 → Mie.setGroupOpen(groupId,open)`；`KT` 被节点 `Pie/Die` 和小地图 `yBe` 消费 | 保留原 Mie 这个临时打开/高亮状态；groupId 只作显示键，不另存 membership。原 ring、重叠色点、缩放和小地图相机继续原 owner |
| 组成员列表 / 定位 | `m7 → p7(nodeIds) → h7/g7`；原 `p7` 查真实 node、原 highlight store、原 fitView | 当前画布的确切 node 保留原定位；跨画布须先由现有材料 context 验证确版位置，沿原 Surface 导航，再原 fitView。详见第 4 节 |
| 组命名 | `m7` 原行内输入、Enter/Escape/保存；`u7` GET CanvasConfig，PATCH `pin.color_groups[groupId].name`，失败回滚 | 保留原行内编辑；数据改接 definition.label。**当前没有更新 API，assign 的 label 只用于新 definition，不能当 rename**。需要窄补 existing definition owner，或明确记“命名未接”，不能继续写厂商 Config |
| 移除本组全部节点的 Pin | `m7` 原确认 → `Yie.removeAllNodesFromGroup → setNodes`，只删当前节点上的该颜色，**不删节点** | 保留确认和原菜单 item；删除本次已核对的当前画布 membership，保留 definition、其他颜色及其他画布关系。逐笔结果含 unknown/partial，不把一部分成功说全成功 |
| 刷新 / 切画布 | 原 `pBe` 从原节点 store 订阅，指纹缓存；原 `u7` 随 canvasId 重读 config，w7 失组/卸载清 filter | 读 Core snapshot 后只更新受控投影，当前 API/项目切换丢弃迟到结果；维护原 filter 清理。不能 reload 整页来掩盖写后未刷新 |
| 原“下载组内全部” | `w7` 的 `iw.downloadNodes(nodeIds)` 仍是厂商下载链 | 要接现有确版 FileRecord 下载，必须另核 local bytes 与原手势；当前不能以 Pin 主链通过顺带销账，也不要暗发厂商任务/模型 |

原颜色：`F0606B/F4A14B/EDC63D/4FC978/4EA8FF/A55CF0`；持久化数组没有 `#`，显示 hex 才有 `#`。这只是原 UI 的色板键，**不是 Core colorPinId**。原 `Noe/_oe` 只接受这六个精确大写键；直接传 `color-pin-…`、`#4EA8FF` 或既有其他 Core hex 都会被丢掉。保留原六色作新标记默认选项，但已有 Core 非六色定义必须通过原 choices/marker 的受控扩展呈现，不能“加载时消失”。

原入口还受 `mergedPolicy.pin.enabled === true` 控制：course `Dg` 和 page `v7` 都读 index 的 `rb/u$l`。这不是 Core 权限。应沿原 policy 接入本地已接能力，不能另塞按钮，也不能只打开 flag 就宣布写入通了。原 Popover 自带键盘/焦点逻辑；本轮未发现 Pin 专用全局创建快捷键，不把相邻 reference-mode 的 Escape store 冒认成 Pin 模式。

原件精确位置：[course 第157行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js:157>)（数据/工具带/marker）、[course 第822行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js:822>)（分组和小地图）、[page 第81行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js:81>)（bar/menu/rename/locate）、[index 第510行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js:510>)（Config API）、[index 第5370行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js:5370>)（原 policy）。Minified 大行不便定位，逐 owner 原文、offset、依赖/调用者已保存在[原件摘录 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/ColorPin原件源码摘录.json>)。

## 2. Core 已有能力与缺口

| 原路由 / owner | 已有行为 | 不具备的行为 |
| --- | --- | --- |
| GET `/projects/:pid/color-pins` | definitions + memberships 真快照 | 不包含当前原 Canvas nodeIds / renderer filter 状态 |
| POST `/projects/:pid/color-pins/memberships` | `{targetRef,colorPinId? 或 color,label?}`；同项目验证；解析 canonical target；事务创建/reuse definition 与 membership，回 ChangeSet | 不能更新已有 definition 的 label/color；也不创建空 definition |
| DELETE `/projects/:pid/color-pins/memberships/:id` | 删除一条准确关系，原 ChangeSet/undo 纪律 | 不删 definition，不删节点，不替调用者“删除全项目此颜色” |
| POST `/projects/:pid/navigation/resolve` | canonical target 身份解析，跨项目拒绝、缺失诚实 unresolved | 不懂当前已接管的 Presentation/binding 对应哪个原 Canvas，详见第 4 节 |

具体源：[Core ColorPin 路由:16](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/routes/color-pins.ts:16>)、[assign:25](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/routes/color-pins.ts:25>)、[remove:62](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/routes/color-pins.ts:62>)；[MutationSafety assign:200](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/mutation-safety-service.ts:200>)，其中 label 只在[创建 definition:218](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/mutation-safety-service.ts:218>)使用；[remove:248](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/mutation-safety-service.ts:248>)。同时读了当前 GN2 原目录对应 ColorPin route，接口相同；没有根据旧文档臆造 PATCH。

数据库已有 `UNIQUE(project_id,color_value)` 和 `UNIQUE(project_id,color_pin_id,target_kind,target_id)`，identity/membership 放同一既有 curation transaction；这是可复用的正常去重和安全措施，不应移除或再搭第二份 Pin DB。definition 颜色是 canonical `#RRGGBB`，项目级共享；target 支持 **view / entity / surface**，本身不存坐标。[契约](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/packages/contracts/src/color-pin.ts:4>)、[原持久化约束:697](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/metadata-repository.ts:697>)。

当前接管层明确缺桥：[Core protocol router:3](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/core-protocol-router.ts:3>) 没注册这些 ColorPin/navigation 操作，未匹配路径在[97附近](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/core-protocol-router.ts:97>)返回 501。原 Canvas Config 是 GET/PATCH `/api/canvas/v1/canvases/:cid/config`，本地 facade 未见对应分派。即使绕过入口，`data.color_pins` 也不在[image:1175](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:1175>)、[text:1201](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:1201>)及其他投影的可写字段里；这是领域 owner 隔离，不能靠放宽字段解决。

## 3. 最小正确产品接法

**先保原“给这个可见节点打标记”的含义：入口核对真实 node/ref/binding，明确写当前准确 ArtifactView 的 view target。** 不因为 `data.lcos_ref.entityType='artifact'` 就把“本次可见位置标记”偷偷扩大成“此 Artifact 所有位置都标记”；也不把既有 entity target 反向改写成 view。已有实体 Pin 与 Surface Pin 仍按各自身份保留；entity 的多个真实位置须列为多个位置，不能按标题、时间或第一张图猜一个。

推荐接缝，不创建新外壳：

1. **只增加同项目窄路由映射。** 注册现有 snapshot/assign/remove/navigation resolve，保原 Core envelope、opaque-ID/project/target 核对。不会为了方便开放任意 Core 或厂商 Config 透传。
2. **复用已有 typed client 和 headless projection。** [CoreColorPinClient:37](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/web-gen2/src/backend/colorPins.ts:37>)、[CoreNavigationClient:12](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/web-gen2/src/backend/navigation.ts:12>) 已由[createLcosCoreSession:74](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts:74>)组装。可复用 [LcosColorPinProvider refresh:191](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/pin/LcosColorPinProvider.tsx:191>)、[assign:231](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/pin/LcosColorPinProvider.tsx:231>)、[remove:268](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/pin/LcosColorPinProvider.tsx:268>)，只把控制状态传入原组件；不挂旧 ColorPinHud。Provider 原 message 含 ChangeSet 短 ID，不应直接显示；其 catch 也未区分未确认，需要小适配，不能称原样拿来即完成。
3. **沿原 Yie 改命令，沿 n5/pBe 改投影。** `Yie` 对本地受管节点停止写 nodeData；由确切 target 调原客户端。`n5` 从同一个 Pin 快照读节点 markers，`pBe` 用同快照 + 原节点集合派生 groups。原 `pp/Foe` 留普通 donor 路径可读，但不能给 LCOS 受管节点 fallback 到过期 `color_pins`。原 `Mie` 继续只管 UI 高亮，不复制 Core truth。
4. **色板键与 identity 分开。** UI 可由 canonical hex 派生原样色点键，但 mutation 始终用真实 definition.id / membership.id；六色默认选项与已有非六色定义合并作 choices。修改 `Noe/_oe/Roe/Toe` 的受控来源，不能只改一处 Hie 外观导致 bar/marker/minimap 丢色。标签取 definition.label，原未命名颜色名作显示 fallback。
5. **写入只跟随明确动作，迟到只核对。** 点击前后核同项目/Canvas/API/准确 target；原忙态禁当前色点重复提交。网络 unknown 保留该笔 target/颜色/动作，原弹层内给“核对”走 snapshot GET；assign 查准确 target+definition，remove 查准确 membership 已缺失。不要把“失败”toast当允许自动重发。原 HttpClient 没自动 retry；不必新建持久队列、hash 或 Pin 空间 store。
6. **全部移除限定当前已呈现的关系。** 原组菜单展示 count/nodeIds 与移除范围一致；开始前重读，逐 member 删除；每笔成功/拒绝/unknown 都留结果，核对 GET 不能顺手重删。不要因为一个 entity 关系在多处投影就偷偷把所有画布关系一起消掉；此类共享关系要在原确认中说明影响范围。

原 `ColorPinHud` 不能整块搬来：它有另一个固定 HUD/避让布局、独立 authoring 菜单，以及[conversation openWindow:273](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/pin/ColorPinHud.tsx:273>)旧恢复窗口。只复用 headless client/identity/分组 helper，不复用那层 UI 或旧导航分支。

## 4. 导航必须修的真实差异

[原 Core resolver:51](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/navigation-marker-service.ts:51>) 按 View.scopeId 的 ScopeKind 算 Surface，并在[65行](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/navigation-marker-service.ts:65>)直接读 ArtifactView.position。新接管 Main/Context/Workflow 的 additional Views 可同属 root Scope；实际页面和位置由既有 Presentation + Binding + 当前原 Canvas node 决定。

用**实际原 NavigationMarkerService** 和此前已归档的 23560 合成事实执行，得到：

- Main 同 View：旧 resolver 的点 `(542.4233409610985,-191.24673913043478)`；真实移动后 Presentation 点为 `(706.14,-243.65)`。旧解析器不会自动跟上新 geometry owner。
- Context、Workflow 的 additional View 均解析成 `surfaceKind:'main'`；不能拿这个返回直接调用 Main 三键跳转。
- Artifact entity 解析只有身份，没有唯一 occurrence/坐标；不能把缺坐标当 `(0,0)` 或“取第一条”。

正确最小落点：原 m7 的成员行仍留在原菜单；当前画布点击核准确 node/ref 后保留原 p7 highlight/fitView。跨画布或 entity 多位置，复用[readNativeMaterialContext:258](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-context-client.ts:258>)取得确版材料位置与拒绝原因，选择确切 location 后复用[navigateNativeMaterialLocation:42](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-navigation.ts:42>)：原 Ke/Surface 切换、到达后二读、同 API 精确引用，再[原 fitView:142](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-navigation.ts:142>)。菜单内可扩一层“位置”成员行，**不用新窗**。Core resolve 继续负责 canonical 存在、跨项目和非材料身份；不能当当前 occurrence 的唯一位置真值。

现有 native navigation 主要覆盖材料位置。Conversation/Collection/Run/Surface 的导航仍要各接当前既有原路径，不能复制旧 HUD 的 ensureCanvas/openWindow 来补齐；未接者保留原菜单诚实不可达状态并入册，不造节点、不新建 Canvas、不补写 Pin 坐标。

## 5. 命名与“改色/删除定义”的边界

原 `CanvasConfig.pin.color_groups` 名称是**画布局部别名**；Core definition.label 是**项目共享名称**。不能把原每画布命名静默变成全项目更名，还继续用原无范围提示。建议原行内编辑明确写“颜色组名称（本项目）”，沿已有 definition id 进行 label 更新；若决定保留局部别名，则必须另选已有真实 UI-preference owner，当前没有证据能直接复用该 Config 写链。

当前 Core metadata 的 definition 写入仅[INSERT:5271](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/metadata-repository.ts:5271>)，MutationSafety 没有 label update；POST assign 即使带新 label，对已有 definition 也不会改名。施工须窄补原 definition 的 label-update 方法、原 curation transaction/ChangeSet 的 before/after 与撤回检查、同项目 PATCH 和 typed client，再替换 u7 数据 hook。可用现有主键/事务/updatedAt 或旧值做并发核对，不需新表、hash、冻结 contract 或新增独立 gate。**不能先删除旧 definition 再建同色来假改名**，那会破坏 membership 身份和历史。

原 UI 没有“修改共享 definition.color”或“删除 definition”菜单，只有多色 toggle 与移除当前组标记。最小移植不应凭空加这两个全项目破坏性动作；如果后续产品确实要它们，再单独处理同色唯一约束、引用范围和原 MutationSafety。保留现有关系删除和撤回纪律，不用删按钮掩盖本轮真实缺的命名。

## 6. 可直接施工的顺序与验收

| 顺序 | 最小交付 | 必须实际验证 |
| --- | --- | --- |
| P0-1 | 窄 Core 路由 + 原 client + headless snapshot；原 Hie/Yie/n5/pBe 受控接入 | 原 JT 色点手势只一次 assign/remove，刷新和重开仍真关系；Node/正文/Revision/几何/Run 不变；错误/cross-owner/unknown 不自动重放 |
| P0-2 | 原 w7/m7/Mie/markers/minimap 联动 | 同一准确 View、多色、已有非六色、同 Artifact 两个 View、当前/别的画布；原 count/filter/全部移除范围一致；其他画布关系保留 |
| P0-3 | 原成员行准确定位 | 先真移动再定位、Context/Workflow additional View、多个 occurrence、目标删除、切项目/API/慢 GET；原相机且无位置写入，不能只断言 resolve resolved |
| P0-4 | 原行内重命名 + existing definition owner 窄扩 | 项目范围明确；成功/刷新/空名/取消/并发冲突/丢回包核对；definition/membership ID 不换，既有安全与撤回保留 |
| P1 | 原组下载、实体/Surface/Conversation/Collection 等额外入口 | 逐真实当前 owner 接原容器；缺口列清，不拿材料 Pin 局部通过覆盖它们 |

本轮独立验证：[源码 probe](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-colorpin-source-probe.mjs>)；[真实原 helper/resolver 测试](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-colorpin-semantics.test.mjs>)；[7 项结果 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/ColorPin语义差异验证.json>)。命令为 `node scripts/native-colorpin-source-probe.mjs`，随后 `node --experimental-strip-types scripts/native-colorpin-semantics.test.mjs`。原纯函数真实执行、Core resolver 真实执行，metadata 仅从既有合成事实提供；没有构造第二套导航算法来证明自己，也没有触碰正在跑的实例。
