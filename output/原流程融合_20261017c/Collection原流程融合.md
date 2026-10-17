# Collection 原流程融合 · 2026-10-17

结论：**原鼠标拖入合并 → 原 O8 撤销/重做 → 刷新已经在新隔离实例跑通；丢失成功回包后的恢复也通过。** 没加“合并”按钮，没建新窗口/Canvas/history，没删除源 Collection 领域记录。根预览的加载状态另列，不能拿隔离成功冒充根实例已更新。

## 本次实际修掉的断点

| 断点 | 实际证据 | 修法 |
|---|---|---|
| 原落区命中了，bridge 却说位置变了 | 原 `Rm → L0 → LCOSNativePileOperation` 返回成功；前端位置 `599.304054/-51.444444`，原 `r6/DC(point,2)` 保存 `599.30/-51.44` | 只给合并比较使用原保存精度；GET 计划前后仍比较完整 raw JSON，迟到的小于 0.01 的真实编辑也会拒绝。未变位置保留原长小数。[bridge:366](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-node-bridge.js:366>) |
| 原保存回调拿展示节点核对真实节点 | `getNode(source)` 含扇形 `displayMembers`，展示 x≈544、宽360；原 O8 节点 x≈599、宽250。严格核对正确地拒绝了错误读取口 | 从**同一 O8 currentNodeRef**增加只读 Collection getter，r6 优先它；普通节点仍用原 ReactFlow getter，身份/正文/尺寸校验不减。[getter:692](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/history-intent-transform.mjs:692>)、[原 ref:854](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/history-intent-transform.mjs:854>) |
| pending 内部字段混进业务意图 | pending map 的 `canvasId/collectionMergePlan` 不属于 Core exact-key operation | 出口只取已有 `version/operationId/kind/phase/merge`；测试核对真实 port 输出，没有扩 contract。[intent:512](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:512>) |
| POST 到了 Core，但 update DTO 被拒绝 | 原 `PC` 更新 DTO 没有 `canvas_id`，Canvas 在请求 envelope；此前测试造的 update 多带了该字段 | create 仍必带准确 Canvas；update 允许省略，显式 foreign Canvas 仍拒绝。用真实 DTO 先跑红，再修绿。[helper:246](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-merge.ts:246>) |
| 清父级被遗留 wire 字段误判 | 已展开源集合夹具同时有旧 `parent_id` 和明确清空的 `parentId:undefined` | Flow 明确提供 `parentId` 时优先它，不能回退到旧 parent_id。[shape:422](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-history-intent.js:422>) |

失败没有覆盖：[首次原精度拒绝](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/2026-10-16T22-46-28-905Z.json>)、[真实 display getter 拒绝](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/2026-10-16T22-58-43-699Z.json>)、[原 POST 409](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/2026-10-16T23-05-37-425Z.json>)。上轮未定位的原失败仍在 `原流程施工_20261017b/Collection合并整页验证/2026-10-16T22-37-09-593Z.json`。

## 原入口 → 原容器 → 动作 → 回程

| 流程 | 当前施工结果 | 通过范围 / 仍未完成 |
|---|---|---|
| 原 Pile 单击 → yFe 原 Gallery → Escape → 原节点 | 原 Gallery、RareFolder、键鼠回调保留 | 本轮 3 份真实 Core 图文夹具通过；未说所有媒体/触屏都通过 |
| 原 h5 标题 → 原 inline 输入 → Core PATCH → 原节点 | 上轮晚到的 p=false 修复保留；无新命名 form | 同 input DOM/focus、刷新后的名称通过 |
| 原 hover/selected → gFe/i3 的 JT/Hde → 成员加入/移出 → 原节点 | 额外绝对工具条/黑色二级 panel 已退出当前渲染；成员动作在原更多菜单 | 真实菜单 remove/add 和刷新通过；这**不等于**所有成员动作已搬进 Gallery 逐项菜单 |
| 原 sourcePile 拖进 targetPile → 原 Rm 落区 → Core+空间 → 原画布 | source/target 精确身份；完整成员并集；源只退出当前 Canvas 载体/绑定 | **真实鼠标通过**。当前成功夹具是源3成员、目标空的两个 root Core Collection |
| 原 Ctrl+Z → 同 O8 → 原画布；Ctrl+Shift+Z → 原画布 | 源恢复同 NodeID/同 binding，目标成员回退；Redo 再合并 | 真实快捷键通过。原拖动本身有一个移动 entry，merge 再占一个原 O8 entry，**不是整次手势只有一项历史** |
| 成功回包丢失 → 原保存器恢复 → 原画布 | 同一 operationId；helper 先读事实，已提交侧幂等返回 | 两次 apply POST 尝试：首个提交后丢回包，第二个同意图核对恢复；relationId/addedAt不变，无重复成员。随后 Undo/Redo/reload 通过 |
| Collection 首次从普通库放到画布 | 仍需真实原生首次投放 producer | native pilot 的 `collections:project` 首次绑定仍501；测试先在真实 Core/Assembly/Gen2Host bootstrap 建夹具，关闭 bootstrap 后才进原整页。**不能据此给首次投放销账** |

正常整页：[23:07 成功 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/2026-10-16T23-07-53-013Z.json>)。加强后的丢包整页：[23:09 成功 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/2026-10-16T23-09-37-983Z.json>)。

[原鼠标合并](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/tapnow-native-pile-collection-2026-10-16T23-09-37-983Z-07-original-mouse-merge.png>) · [原 Undo 恢复](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/tapnow-native-pile-collection-2026-10-16T23-09-37-983Z-08-original-merge-undo.png>) · [Redo 后刷新](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/Collection合并整页验证/tapnow-native-pile-collection-2026-10-16T23-09-37-983Z-09-original-merge-redo-reload.png>)。

## 仍偏离原流程，逐项保留

| 项 | 当前 caller / 容器 | 应接哪里 / 本轮边界 |
|---|---|---|
| 原多选材料 drag/add | [原 Operation:335](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:335>) 已接完整选中 NodeIDs → Core membership/readback | 原落区→原 Gallery/节点反馈。函数测试过多节点、多 View、丢回包；**尚未真实鼠标多选拖入**，不能用菜单 add 成功替代 |
| 普通堆与 Core 集合混合 merge | [Operation:336](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:336>) 只有双方准确 Core 才合并，混合拒绝 | 先接普通堆进入 Core 的原创建 owner；保留双方，不假造 Collection/删源 |
| parented/connected/locked/nested source frame | [Core carrier:76](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-merge.ts:76>) 及 prepare 保护 | 原关系与嵌套空间 owner 要先给准确语义；目前明确拒绝，不吞连线、材料、父级 |
| 多 View 移出含义 | 当前按 Artifact 成员移出，所有 View 都受其实体关系影响 | Core schema没有 view 成员。原 Gallery 应区分“移出材料”和“只移走眼前 View”，不是猜一个 view member schema |
| unpile 含义 | 当前 Core unpile 接 toggleSpace，仍保留集合 | “展开/收纳集合”与原普通堆“解散”不是同义；原动作名称/领域语义仍需逐项校正 |
| 原 Group workflowManagement / Pile save、download | 原位置尚在，未逐项业务验证 | 原菜单逐项接真实 owner，不能因用了原菜单就销账 |
| 旧 Collection 新窗 | [native-collection-ui:423](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:423>) → [openWindow:431](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:431>) → 旧 GN2 WorkView；[旧模式按钮:568](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:568>) | 当前 Pile 主入口不用它；旧模式 caller 仍在，不能标“源码已删除”。剩余能力迁原 Gallery 后才能退出旧分派 |
| Library 云更多菜单 | [原 IS:398](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:398>) 保留；[非GET:208](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/assembly-library-projection.ts:208>)、非私有空间仍501 | 原 IS→真实改名/移动/下载/删除 owner→原列表读回与失败恢复。本轮未改/未测，不能用原 TS 外框抵账 |
| 普通材料 Apply/原 drag | [TS place:171](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-assembly-ui.tsx:171>) 已接 producer 和 readOnly 恢复，root另行验证 | 普通浏览→确版放画布；明确从输入选材才引用。**原 drag MIME** 仍须独立接收方核查；本分项不重复给材料 owner 的整页结果下结论 |
| Context/方法分类的手势 | [原 Zp/TS:74](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:74>)；[隐藏IS/禁drag:80](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:80>) | 原分类→原预览与footer→原输入/现场；具体对象的管理/拖拽能力尚未齐。正文变体存在，不再沿用旧225px截图称当前仍裁 |
| Context 非 View 与方法披露 | [非View整组引用拒绝:289](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:289>)；[方法 actionId 回退:319](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:319>) | 展示/定位/取用分别接真实 owner；非View不悄悄省略，用户原文不删。成员点击与多实体采用范围交独立实测，不等于本轮已完成 |
| Capture/Sources/Skills | [当前分类仅 context/workflow:24](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:24>) | 应补原库分类/列表/详情/导入采用，不把旧 GN2 Assembly 来源整页再当新窗搬回 |
| 旧 Assembly/Atlas/Workflow body 与 Drop overlay | 当前原库替换部分主入口；旧恢复/host caller 详见[分项审查](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/Library与Collection审查.md>)，root维护全区31个caller/8个残留表 | 本轮不改共享 body/Drop。旧残留不自动等于默认可达，也不能因隐藏了披露就算原流程完成 |

## 验证边界与运行状态

- 本轮跑过 **8 个相关脚本**：`history-intent-transform`、`native-collection-merge`、`native-pile-collection-transform`、`native-pile-ui`、`native-pile-actions`、`native-collection-space-history-replay`、`native-collection-arrange-history-replay`、`native-collection-arrange-bridge`。没有声称整个 LCOS 全 suite 已跑。
- merge 独立真实 Core 测试：默认、源已有 frame、双方已有 frame 三类通过；错误 Canvas、伪造内容、部分 action、后来成员改变拒绝；同保存精度接受、0.01位置差异拒绝、迟到 sub-cent 编辑拒绝、原节点几何保留。证据：[default](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/merge-unit-final.json>)、[source frame final](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/merge-unit-source-frame-final.json>)、[both frames](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/merge-unit-both-frames.json>)。展开 frame 组合仍是底层验证，**未说实屏已测这两类**。
- 整页用专属 `.runtime/isolated-native-collection-merge-*`：真实 Core/Assembly/Gen2Host 造合成夹具，关闭 bootstrap，再由正式 full-integration launcher 打开原整页；本轮成功实例52612/52942均按精确PID关闭，runtime清理。未碰根56238/56239、原GN2、vendor或用户数据库；不SQL、不发模型。原脚本的 callback/port观测不改参数/返回/业务回复；丢包测试只在真实提交后丢首个浏览器回复。
- 成功整页 `pageErrors=0`、`blockedWrites=0`，图文FileRecord字节和Runs未变；相机在merge/Undo/Redo前后均核对。平台配置、插件、语音能力的已知501及被阻断远端telemetry仍记录，不能把它们写成全功能成功。
- 使用已有 Chrome + cached Playwright Core；本会话没有 web-dev/browser 插件能力，按 frontend-testing-debugging 的可用工具回退。没有安装新依赖。
- **历史加载边界已更新：** 本分项整页完成时根56239尚未加载raw getter；随后root完成完整build和精确重启 `24428 → 31032`，本次变换已加载。前后Core graph、Runs和三Canvas全对象不变，见[候选重启事实核对](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/候选重启事实核对.json>)。没有在根实例重造Collection夹具重复操作：原手势与丢包的整页证明仍来自前述独立新实例，根实例只追加了加载/数据不变证明。无需新增gate/hash/冻结或另造history。
