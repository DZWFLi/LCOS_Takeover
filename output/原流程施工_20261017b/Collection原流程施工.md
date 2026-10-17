# Collection 原流程施工 · 2026-10-17

结论：额外命名表单、第二条工具栏和黑色成员面板已退出当前 Pile/Group 渲染。改名与成员动作回到原 `h5`、`gFe/i3 → JT → Hde`；独立真实 Core 整页已经通过 Gallery、原位改名、成员菜单与刷新。原拖入/合并已接真实 owner；合并整页鼠标测试刚暴露仍未触发真实 merge 提交，不能把底层通过当完成。

## 本轮状态与证据

| 原流程 | 修正 | 代码 | 验证 |
|---|---|---|---|
| Pile 单击 → 原 Gallery → Escape 返回 | 保留原 yFe/ae/ke、原 Gallery 与 RareFolder；只用原可选 face/tools 槽 | [transform](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:195>) | 整页 exact 3 材料通过；原回调字节连续测试通过 |
| 原标题 → inline 输入 → 保存 | 原 kie 的 1000ms hl 防抖接 Core PATCH 和原 O8 canonical receipt；捕获原 API/Project/Canvas/Workspace，不接走晚到提交 | [commit](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:194>)、[原 editor seam](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:606>) | 第一轮实屏发现 Pile 类型 p=false 导致只读，保留失败证据并修复；第二轮同 input DOM/focus、Core 名称与刷新通过 |
| 原 hover/selected → 原 JT 工具 → 更多菜单 | 删除第二 absolute toolbar 的渲染；状态/核对/成员加入移出进原 Hde menu；不直出成员 ID | [原工具数组](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:454>) | 原更多菜单移出/加入真实 Core 成员、同节点和文件保留、刷新通过；原 Hde 深色/白字交主题 agent 后，新独立整页已看到浅底深字；dFe unwrapped chat/save 图标仍偏浅，视觉未全部完成 |
| 原 selected NodeIDs 拖入 Pile | 先核对整组选区；Artifact 关系只提交一次，同 Artifact 多个 View 的所有准确投影保留；逐项 Core 读回后原 carrier receipt | [addMembers](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:146>) | 生产函数 synthetic runtime 通过：多节点、两 View、幂等、错节点、丢回包只读恢复；真实鼠标 drag/add 尚未验 |
| 原 sourcePileId → targetPileId 合并 | 原 Rm 一次携带源/目标完整身份；既有 O8 queue/tag/partition 和同 NodeID Undo/Redo；既有 Collection space-history 分派 | [UI](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:174>)、[bridge](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-node-bridge.js:718>)、[intent](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:430>) | 真实 Core + 原 Huabu + intent/bridge 测试通过；整页源 Pile 拖向空目标 Pile 仅位置保存，没有 merge POST，实屏失败且原因未定位 |
| 合并持久化/撤销 | 目标完整成员去重并集；源 Collection 本体和完整成员保留；源当前 Canvas 载体/绑定退出；Undo/Redo 恢复同 ID。Core 用已有 runCurationMutation + ChangeSet，空间用原 locked executor | [原 owner helper](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-merge.ts:20>)、[apply](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-merge.ts:259>) | 默认、源已有 frame、两边已有 frame 三种独立测试通过；错误身份、伪造 native 标题、部分批次、后来成员改动、晚到用户编辑拒绝；丢 spatial 回包前/后不自动重放，同意图只读后显式恢复不多记 Core mutation |

整页成功：[完整 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/Collection整页验证/2026-10-16T22-31-06-831Z.json>)。失败旧图/JSON仍在同目录，未覆盖。

运行条件：真实 Core / Assembly / Gen2Host projector 在专属新 runtime 中建合成夹具，关 bootstrap 后由正式 full-integration launcher 运行原页面；不 SQL，不造业务 handler，不读用户数据库，不发模型。成功实例 `http://127.0.0.1:64242` 已按 PID 核对后关闭，runtime 已清理。0 pageerror、0 blocked write、0 新 Run、材料文件字节未变。

普通检查：`native-pile-actions`、`native-pile-ui`、`native-pile-receipt`、`native-pile-collection-transform`、`native-collection-space-history`、`native-collection-merge` 已过。Core/intent 的三种 frame 夹具与 GUI 是分开验证，不能互相冒充。

## 仍偏离原流程，不能勾完

| 项 | 当前偏差/边界 | 应接位置 |
|---|---|---|
| 原拖入与合并实屏 | addMember 源码和底层已接但未实拖；merge 已实拖一轮：源 3 成员、目标为空，源正常移动但没有 merge 请求，因此原合并动效/Undo/Redo/刷新均不能勾过 | 原 bB.Rm / N3 / 原 Gallery，继续受原空间与成员保护 |
| 非 Core Pile ↔ Core Pile 合并 | 当前精确 Core↔Core 才走完整 canonical merge；混合普通堆拒绝并保留双方，未假造新 Collection 或删除源业务实体 | 先定义普通堆进入 Core 的原创建生产者，再接同原 merge 流程 |
| 连接线与父级保护 | 带 source carrier/frame 连线、parented carrier、锁定/正在拖动或 source frame 含嵌套 frame 仍明确拒绝，未丢线/偷父级 | 需要原关系与嵌套空间 owner 的准确合并语义 |
| 多 View 移出语义 | Core CollectionMemberType 不含 view，移出仍是整份 Artifact 成员，会影响其所有投影；这不是“不支持 view schema”的 bug | 原 Gallery 对眼前 View 的操作须区分“从集合移出材料”与“仅移走当前视图”；尚未改语义 |
| 额外工具中的 donor 云功能 | 原 Group workflowManagement、原 Pile save/download 等原位置保留，其领域接线未逐条验 | 逐项接真实 Core；不能只用已有原菜单当已完整融合 |
| 旧 Collection WorkView | native-collection-ui 旧模式仍可 openWindow('collection') → GN2 WorkView；当前 native-pile producer 通常不用它 | 保留旧状态/未完成输入，能力迁原 Gallery 后再移走旧分派 |
| 普通 Collection 从库放画布 | native pilot 的 /collections:project 仍拒绝新绑定；本轮不能靠假绑定造成功 | 接真实现有 Collection producer 和原 O8，不删除保护冒充完成 |
| 后续编辑/未知恢复 | 保护用户后来成员/空间编辑，冲突拒绝；原 Save unknown 重试和改名后的 merge history 组合未整页验 | 原保存错误恢复/同一 O8，不能自动重发 |

## Library / Assembly / Context / 方法 / Drop：本轮未抢改

| 项 | 已有方向 | 仍要列册的偏差 |
|---|---|---|
| jF/CU/Zp/TS/IS 主库 | 原搜索、原树、原行和预览槽已在；自制库顶检查器已退出 | 原更多菜单云写入/非私有空间仍 501；不能据框架复用说功能齐了 |
| 普通材料/引用/输入返回 | 已接精确版本、原 TS 主动作、同 input key 和统一原 Viewer；本轮 runtime/root 负责整页验证 | 原 drag MIME 尚未桥，按钮放置不等于 drag/drop；PDF/音视频/导入须逐格式验证 |
| Context/方法原库分类 | 原分类、搜索、TS 正文变体保留原 footer/返回 | 分类拖拽/原更多菜单未接齐；非 View Context 整组引用被当前 adapter 拒绝；成员点击阅读与非 View 展示须独立验 |
| Capture/Sources/Skills | 旧来源能力有原业务 owner 可用 | 还没接齐原库的分类、详情与导入/采用，不恢复整张 GN2 Assembly 来源页冒充融合 |
| 旧 Assembly / Atlas / Workflow Hand | 默认新分类入口走原库 | 旧 Stage 恢复/分派及旧 host 定义仍在；有的仅残留、没有当前生产 caller，不能误报默认入口正在弹它 |
| Drop overlay | 原业务 resolver/commit/unknown 保留 | LcosHostOverlay + 旧 DropPreview/Receipt 仍是 GN2 视觉/流程；系统文件和归档边界须实拖，不能删披露遮住缺口 |

详细旧/残留 caller 证据延续 [全区分项审查](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/Library与Collection审查.md>)。该旧文档的“未构建”等时间性结论不替代本轮 root 新总表；本文件不覆盖其他 agent 后续验证结果。

56238 主实例由 root 统一构建/重启。隔离 GUI 使用了 p=false 修正版，成功不能自动算当前 56238 已加载；合并 owner 执行顺序的最新 unknown 保护也在后续磁盘源码，待 root 下一次统一加载。

## 收口追加：已经启动的 merge 整页结果

[合并整页 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/Collection合并整页验证/2026-10-16T22-37-09-593Z.json>) · [失败截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/Collection合并整页验证/tapnow-native-pile-collection-2026-10-16T22-37-09-593Z-failure.png>) · [更新后的原浅色菜单](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/Collection合并整页验证/tapnow-native-pile-collection-2026-10-16T22-37-09-593Z-04-native-collection-menu.png>)。

这次两集合都来自真实 Core/Assembly/ProjectToSpaceProjection，源有 3 材料，目标为空。真实鼠标拖动后只记录普通 source position update（x≈599.3、y≈-51.44），等不到 `collection-merge` 提交，测试在 merge 阶段失败。现有证据还不能确定是原落区判定、drag-stop 时序还是 bridge 拒绝；没有把猜测写成原因。两 Collection 和成员保留，0 pageerror、0 blocked write；专属 65244 runtime 已按 PID 清理。此轮前面的原 Gallery、inline、更多菜单、成员往返和 reload 同样通过。

浅色主题的 Hde/Vde 原 paint 补丁已进入这个独立实例，菜单截图确认浅底深字。主 56238 PID43972 仍不因此自动算已加载。按 root 收口要求不再新增产品修改、构建或测试；保留当前失败证据供后续从真实原手势入口继续定位。
