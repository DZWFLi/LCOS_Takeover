# View / Rail 完整链路本轮交付

2026-10-10。没有提交、没有推送。保留其它会话的未提交文件。

## 结论

上轮确实修偏：把新 View 接收区做成了只固定已有聚合空间的收藏入口。Gen1 的普通材料/选中组创建内容现场被漏掉了。本轮已在真实 Gen1 页面操作后补回，并在 Gen2 真实页面拖放、点击、编辑、返回和刷新验证。

## 用户现在能做什么

| 操作 | 本轮实际结果 |
| --- | --- |
| 普通左键拖动 | 仍然是 Huabu 移动；拖到 Rail 不创建现场、不投递；原生 Undo 可恢复 |
| 右键拖材料/笔记/选中组到 Rail 留白或加号接收区 | 直接生成含这些内容的长期现场，Rail 多一项；没有目的地选择窗 |
| 点击新入口 | 进入这批内容，继承创建时的原生位置、尺寸和镜头 |
| 拖到已有现场图标/已打开 Peek | 加入该现场；不会创建另一个现场、不会移动来源 |
| 已有 Collection/Context/Workflow 拖入 Rail | 保留原对象的入口，沿用用户 T2 裁决，不复制其定义 |
| 点击加号 | 新建空白现场，留在原画布；右键加号管理收起的入口 |
| 旧原生 note/text 没有材料绑定 | 真正取用时通过既有 canvas-text producer 登记原 carrier 的真实正文，包括真实空文本；不按名字猜旧材料、不新造 carrier |
| 在共享现场编辑当前文本 | 复用现有编辑器，通过已核实的原文 carrier 地址保存同一 Artifact；可见节点和几何仍在当前现场 |
| Esc 取消 | 不写成员、不建现场、不改原位置 |
| 刷新/返回 | 现场身份、成员、位置、镜头保持；刷新不再自动重置镜头 |
| 明确移除自己新建的现场 | 同时收起对应 Rail 引用，原材料与源文件保留 |

共享原文地址由现有 Core graph + binding 推导，不能根据标题猜。历史、Draft、额外引用仍保留既有阅读/版本保护；不通过缺失地址另建替代材料。

## Gen1 实际对照

原件 SHA：3e99769bf106d68cecc54094662352bfaecf2bdd。独立运行在 5173，原件源码没有改动。

`App.tsx` 的 buildWorkspaceScene / createWorkspaceSceneFromDropPayload / directDropToProjectRailView / openWorkspaceScene，`WorkspaceRailVNext.tsx` 的 workspace:new-scene 接收区与点击入口都已核。单材料 Brief 实拖新增 Scene 5，点击只显示 view-brief；Reference Image + Feedback Notes 两项选中组进入 Scene 6，两项原位置保持。Gen1 独立样例存在既有 presentation 404，不把这个参考运行宣称零错误。

## Gen2 真实证据

- PNG 普通材料：Rail 3→4；success；原画布 ID、全部原节点 position/parent/style 未变。点击现场 5 图片的 139.5/-1010、410×273 和镜头 449.176660/476.745279/0.246333 保持。
- 两项真实材料：Rail 4→5；success；现场 6 为图片+决策文档；原位置、尺寸保持。真实项目承接会话仍由既有 owner 投影，不计作本次拖入的材料。
- 拖文档到已有现场 5：Rail 数不变，真实 railway-receive 回执 success，源坐标不变；进入后新增文档。
- 空白现场 7：无材料成员，仅保留项目原有会话入口。用于验证后通过既有管理动作移除。
- 原生空 note + PNG：现场 8 真实创建；note 原地址 node-fb99adee-6dec-4c4f-a9df-603710a436c8 登记为新的 artifact-text-ab9e0d32-db25-4885-bba5-eb5017259772。没有冒充原 artifact-decision。进入后 note 的 241.5/-618、206×154 和图片的原布局保持。
- 共享文本实际编辑：在现场 8 的现有 Milkdown 编辑器写入测试句，Ctrl+Enter 保存；Core 原 carrier 地址 GET 200，返回同一 Artifact/View 和测试正文。随后用已确认 revision 的既有保存 API 恢复原空正文；没有覆盖别人的后续正文。
- 新 View 刷新：原镜头保持，内容正常恢复。
- 普通左拖入新 View 区域：Drop state 全程 idle，Rail 数不变，Undo 精确恢复 PNG 原位置。
- Esc：preview→idle，Rail 数不变，原几何不变。
- 最终浏览器：0 console error；1 条既有 React Flow attribution warning。

截图本目录 03–14 PNG；完整分区源码/接口说明见 01–05 MD。截图 14 会在清理本轮初期错误样例后重新拍摄。

## 现有 owner 与源码落点

现有 CoreProjectClient graph mutation → Scope/Workspace；CoreAssemblyClient.apply → working set；useLcosWorksite.ensureWorkspaceCanvas → 唯一 Huabu 画布；CoreRailwayClient.snapshot/save → 正式导航顺序。

`createRailwayWorksiteFromDrop.ts` 仅薄编排这些 owner。Main 子现场用非 root Scope，避免污染 Main/Context/Workflow 三个根。产品没有新增“交付模式”。

`initializeRailwayWorksiteFromDrop.ts` 用既有 ReconciliationRunner、ProjectToSpaceProjection、RelationProjection、shared bindings、RFS geometry 和 Native version PUT 初始化目标。没有新 runtime、renderer、layout truth。

`resolveRailwayNativeTextSources.ts` 用既有 claimProjectText/register 原 carrier。Drop resolver/router、LcosHostOverlay、PortalDropWorkspaceContext、LcosRailway 承接同一操作。

`ProjectionFacade` + `projectedNodeDescriptor` + `canvasTextPresentationPolicy` 只补当前 scope/原文地址的呈现事实；`LcosCanvasTextBody` 仍是原编辑器，发送地址与可见几何分离，保存核对仍按原 immutable 请求进行。

`LcosCanvasCommands` 初始取景不覆盖已保存 Native viewport。

本轮没有施工后端、没有新增 Core schema/contract、没有新平台或 gate。

## 验证及边界

最终相关 19 文件 141 项测试通过；Huabu 与 web-gen2 类型检查通过；生产 build 通过。目标产品文件 lint 通过。旧测试文件里仍有非空断言 warning，未把警告伪报成全仓 lint 清零。构建的依赖注释/CSS highlight/大 chunk 警告保留记录，不扩展成另一个优化工程。

这是本轮 View/Rail 体验的交付，不宣称整个 Gen2、全部触屏/外部文件/原生 shape/image 的取用都已齐平。未绑定图片和任意 shape 没有文字登记通道，本轮不通过空文本冒充它们；外部原始文件继续现有材料导入入口。

跨现有 owner 写失败保留真实部分结果，不把创建/登记部分成功说成全部完成，不盲目重新发送。API 原有版本、主键和回执检查沿用。

## 留给用户手测

页面：http://127.0.0.1:5175/projects/lcos-gen2-dev/main

保留现场 5、6、8 作为本轮真实演示；删除本轮最初镜头错误的现场 4 和空白测试现场 7，并清理它们自己的 Rail 引用。原有 collection、其它会话的数据、原画布位置不清理、不重排。

回滚只撤本轮源码增量。用户数据和真实材料不 reset；已登记文本继续保留正常材料身份。
