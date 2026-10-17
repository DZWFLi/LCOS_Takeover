# LCOS Gen2 R1–R6 → Wave 3–10 执行地图

日期：2026-09-19
适用仓库：`E:\OS开发\LCOS_GEN2`
当前分支：`frontend-reconstruction-v2`
当前基线事实：Wave 2 B1/B3/B5 已在 `0e16017` 收口；GUI Stage 1 已按 `a2f6a76 → a5dbd46` 无冲突接入当前主线。本文件只做后续执行映射，不新增 hash、baseline 或 gate。

## 先定规则

`Wave 0–10` 是唯一施工顺序；`R1–R6` 是能力批次标签，不能拿来跳过 Wave 3–10。下面的“当前真相”以当前源码、功能控板和最新 GUI Readback 交叉核对为准；旧 handoff 中“已完成”的文字，如果没有当前 production caller、真实状态来源和浏览器证据，不自动升级为完成。

R5 有一个容易撞名的历史用法：Recovery Wave R5 原本指 Workflow / Hand / Cards；最新 GUI Readback 又把 Glyth / Conversation UX 叫作 R5。本文把前者落在 Wave 7，把后者作为 Wave 8 的交叉输入，避免两条线重复审计。

## 总览

| R | 当前能力标签 | 主 Wave | 当前真相 | Wave 2 后还缺的真实纵切 | GUI 并行 |
|---|---|---|---|---|---|
| R1 | 设计系统、共享 family、Presentation Junction、语义投放基础 | Wave 3（共享 family 可与 Wave 4/5 视觉线并行） | token、family、seam、物种注册表和 semantic-drop 纯逻辑已在仓；生产 caller 仍是 Partial，部分节点仍按 entityType 粗投影 | 用真实 artifact/mime/status/preview/Run/Decision/Collection/Workflow 数据把主流绑定实体接到唯一节点 Junction，并验证四档密度、fallback 原因、拖拽/resize 不回归 | 可以；GUI 只改 `lcos/ui/**`、body 视觉和状态映射，不碰 NodeWrapper、projection、geometry owner |
| R2 | Main、HUD、Railway、Navigator、Action Arc、相机/定位 | Wave 4（收口延伸到 Wave 9） | Main/HUD/Search/Focus/SurfaceDock/Railway caller 已有；搜索较实，Railway/在哪/颜色标记/画外定位仍 Partial，空间导航仍 Gap | 完整 Main 可用切片：真实三现场目的地、Railway Peek/Receive/More、高数量表现、ColorPin 对象路径、Arrival production consumer、Spatial Navigator、窗口安全区避让 | 有条件可以；GUI 可做 HUD/Railway/Navigator 视觉，真实 destination/arrival/safeRect 由基础设施串行收口 |
| R3 | Professional Window、Assembly、Reader、Composer | Wave 5（窗口动效/窄屏延伸 Wave 9） | Window/Assembly/Reader/Composer 都有 production path；窗口交互、Reader 内容、Assembly apply 已有部分真实实现，但状态覆盖和恢复证据不齐 | 从同一对象完成“打开窗口 → Assembly 取材 → Reader 读/切版本 → Drop/引用 → Composer 草稿/提交”，窗口拓扑、阅读位置、失败原因和 receipt 可恢复 | 有条件可以；视觉 chrome/body 可并行，必须消费稳定 props，不自己接管 topology、safeRect、Core identity 或 receipt |
| R4 | Context、Portal、Atlas、Temporal Rail | Wave 6（Portal/motion 收口延伸 Wave 9/10） | Context worksite、Atlas、Portal、Temporal 壳已存在；Context/Atlas/Portal Partial，Temporal 只有诚实空态，真实时间 producer Gap/Blocked | 同一 collection 从 Main 进入 Context/Atlas/child worksite，经 Temporal 定位，再 Portal 返回并恢复 camera/identity；时间分组、Portal 六态和跨现场 failure 要真实 | 有条件可以；GUI 可先落 family/状态/Reduced Motion，Temporal producer、Portal target/receipt、camera restore 不能靠视觉伪造 |
| R5 | Workflow、Hand、Task Card；另含 Glyth/Conversation UX 交叉面 | Wave 7；Conversation seam 接 Wave 8 | Workflow 入口、CardPool、TaskCard、Conversation Work View、Waiting/Recovery 已有；卡片真实数据/receipt Partial，live send、native full-history fork、完整 handoff Blocked | 真实卡片取用→Step/Conversation 草稿→Run/Waiting/Review；再由同一 Conversation 进入 Work View，send/fork/handoff 诚实可用或明确 unavailable | 可以做视觉和 disabled/unavailable 状态；真实 Run、send、fork、handoff 必须与 T6/T7/Run owner 串行 |
| R6 | 整机导航、Pin/Locator/Arrival、LOD、motion、responsive、失败/恢复、Golden Path | Wave 8–10，最终跨 Wave 3–7 收口 | locator/arrival/ColorPin API 与纯逻辑存在，部分 Navigator caller 已接；Spatial Navigator、Temporal producer、LOD owner、归档、重启/断线/完整 provider 路径仍未闭 | 完整 Golden Path 与失败路径：Project→Main→Context→Workflow→Glyth/Run→waiting_input→Review/Artifact Return→Accept/Retry→reload；窄屏、reduced-motion、密度降级和恢复要真实 | 仅适合在 owner 稳定后并行做视觉/motion/a11y；不可用 GUI 状态覆盖 provider、arrival、LOD 或恢复缺口 |

## R1 → Wave 3：先把节点变成 LCOS

**Current truth。** `apps/web-gen2/src/presentation/` 已有 `nodePresentation.ts`、`rendererRegistry.ts`、`nodeSpecies.ts`、`visualFamily.ts`、`figmaStateMap.ts`；Huabu 有 `CanvasNodePresentationSeam`、`LcosSpeciesBodies` 和 `lcosNodeCardRegistry`。`semanticDropMachine`、drop target/commit router 也已有纯逻辑和 production seam。当前真实链路能把部分 conversation 投影为 Glyth；未绑定节点保持 native fallback。功能控板把语义投放记为“部分完成”，节点信息密度也仍是“部分完成”。

**尚缺的真实纵切。** 不能停在 title/entityType 级别。至少要让真实图片、PDF、长文本、普通文件、conversation、waiting Run、draft result、decision、collection、workflow 都经同一 Junction 选择物种，并让 zoom/selected/working/reading 状态只由一个 owner 决定。native 只在 unbound、unsupported、stale 或 runtime unavailable 时出现，并显示原因。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/useLcosCanvasProps.tsx::useLcosCanvasProps`
- `huabu/apps/web/src/lcos/host/CanvasHostBoundary.tsx::CanvasHostBoundary`
- `huabu/apps/web/src/lcos/nodes/createLcosNodePresentationSeam.ts`
- `huabu/apps/web/src/lcos/nodes/LcosSpeciesBodies.tsx::LcosSpeciesBodyContent`
- `huabu/apps/web/src/lcos/nodes/lcosNodeCardRegistry.ts`
- `apps/web-gen2/src/presentation/{nodePresentation,rendererRegistry,nodeSpecies,visualFamily}.ts`
- `apps/web-gen2/src/spatial/projectToSpaceProjection.ts::ProjectToSpaceProjection`
- `huabu/apps/web/src/components/Nodes/NodeWrapper.tsx::NodeWrapper`（只消费 host seam，保持 Huabu geometry owner）

**完成定义。** 真实绑定节点经唯一 Junction 进入正确 body；四档 density 与 selected/drag/reading 状态可从浏览器看到；fallback 可解释；拖动、resize、edge、reload 不改变 identity 或 geometry。单测或 gallery 单独通过不算完成。

**与 GUI 并行。** 可以。GUI 线可做 `huabu/apps/web/src/lcos/ui/**`、species body 的视觉层、token、marker 和状态文案；不得改 `NodeWrapper`、projection、binding、geometry 或把 gallery 当 production evidence。

## R2 → Wave 4：Main 第一条可用主线

**Current truth。** `LcosProjectShell → LcosGlobalHud → LcosNavigatorIsland/LcosRailway/LcosSurfaceDock/LcosFocusWhere/LcosCameraControls` 已是生产树。Search→focus、三现场切换和相机命令已有真实 Core/Huabu 路径；功能控板把项目搜索标为“已验证”，Railway、在哪、颜色标记、画外定位标为“部分完成”，空间导航标为“未开始”。

**尚缺的真实纵切。** Main 必须完成“打开真实项目→识别节点→Search/Focus/Where→切具体目的地→Receive/Peek/More→刷新恢复”。当前缺口集中在 Railway 的 Peek/Receive/More 与高数量展示、ColorPin 对象级/跨现场路径、Arrival production consumer、完整 Spatial Navigator，以及所有 HUD/窗口共同消费的 safeRect/occupiedRects。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/shell/LcosProjectShell.tsx::LcosProjectShell`
- `huabu/apps/web/src/lcos/shell/LcosGlobalHud.tsx::LcosGlobalHud`
- `huabu/apps/web/src/lcos/shell/LcosRailway.tsx::LcosRailway`
- `huabu/apps/web/src/lcos/shell/LcosSurfaceDock.tsx::LcosSurfaceDock`
- `huabu/apps/web/src/lcos/navigation/LcosNavigatorIsland.tsx::LcosNavigatorIsland`
- `huabu/apps/web/src/lcos/navigation/LcosFocusWhere.tsx::LcosFocusWhere`
- `huabu/apps/web/src/lcos/navigation/LcosCameraControls.tsx::LcosCameraControls`
- `apps/web-gen2/src/backend/{search,railway,colorPins}.ts`
- `apps/web-gen2/src/navigation/{canonicalTargetResolver,focusOccurrence,railwayOrder}.ts`
- `apps/web-gen2/src/spatial/{spatialFocusPort,locatorGeometry}.ts` 与 `interaction/{locatorState,arrivalState}.ts`

**完成定义。** Railway item 全部来自 Core destination ref，Receive/Peek/More 走真实 action/receipt；Search 与 Where 不混用；画外目标有真实 Locator→Arrival→camera settle；ColorPin 不用 label 猜 identity；窗口打开时 HUD 和 camera 使用同一安全区；刷新后目的地、相机和选择仍可解释恢复。

**与 GUI 并行。** 有条件可以。GUI 可改 Navigator/Railway/SurfaceFeedback 的 geometry、variant、focus-visible、reduced-motion；基础设施线必须保留 `LcosRailway`、`LcosNavigatorIsland` 的 action owner，不把“视觉上有按钮”当成动作完成。

## R3 → Wave 5：Professional Window / Assembly / Reader / Composer

**Current truth。** `ProfessionalWindowStage` 已挂在 `LcosProjectShell`，`AssemblyBody`、`ArtifactReaderBody`、`ConversationWorkViewBody`、`LcosComposerHost` 都有生产入口。Reader 已能读取部分真实文本/图片内容，Assembly 已有 source kind / preview / apply 映射，Composer 已有 draft/receiver/submit 投影；功能控板将专业窗口、阅读器、装配面、紧凑编辑器均记为“部分完成”。

**尚缺的真实纵切。** 要完成一次可追踪链：对象近场打开 Window→Assembly 按 canonical kind 取材→Reader 绑定 artifact/revision 并保存阅读位置→Drop/引用保留 identity→Composer 草稿提交→失败显示真实原因。窗口 topology/safeRect/occupiedRects、窄宽 action mapping、Reader revision/scroll continuity、Assembly 项目归属与 partial receipt 仍需实测。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx::ProfessionalWindowStage`
- `huabu/apps/web/src/lcos/professional/ArtifactReaderBody.tsx::ArtifactReaderBody`
- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx::AssemblyBody`
- `huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx::LcosComposerHost`
- `apps/web-gen2/src/windows/professionalWindowLayout.ts`
- `apps/web-gen2/src/backend/{assembly,artifacts,drafts}.ts`
- `huabu/apps/web/src/lcos/ui/families/LcosWindowChrome.tsx`
- `huabu/apps/web/src/lcos/shell/lcosShellStore.ts`（只存 UI intent 与 Stage 发布的环境）

**完成定义。** 窗口可拖、resize、关闭、恢复且不遮住 HUD；真实文本/媒体至少各有一条可回到来源的 Reader 路径；Assembly 不把 conversation/scene/collection 伪装成 artifactView；Drop/submit 的 receipt、partial failure 和草稿保留可见；reload 后 target、revision、阅读位置和 draft 语义不丢。

**与 GUI 并行。** 有条件可以。GUI 负责 `LcosWindowChrome`、Reader/Assembly family 的视觉层和状态呈现；窗口拓扑、Core artifact/revision、safeRect、receipt 只能由已有 owner 串行决定。GUI Stage 1 已在 Wave 2 形成可回滚提交后无冲突接入，生产页视觉验收仍须独立完成。

## R4 → Wave 6：Context / Portal / Atlas / Temporal

**Current truth。** `ContextWorksite`、`ContextAtlasStage`、`LcosCollectionSurface`、`PortalPreviewBody`、`LcosPortalPreview` 和 `TemporalRail` 已在 production tree；Context/Atlas 有 loading/empty/error 等诚实状态，Temporal 当前仍是空态壳。功能控板把上下文总览记为“部分完成”，时间轨记为“受阻”。

**尚缺的真实纵切。** 同一 collection 必须从 Main 进入 Context/Atlas/child worksite，经 Temporal 按真实 episode/time group 定位，再 Portal 返回并恢复来源相机与 identity。不能用第二 ReactFlow、固定弹窗或 2/3 列普通卡代替；Temporal 需要真实 producer，Portal 需要 target/receipt 和全状态，跨现场失败要可回退。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.tsx::ContextWorksite`
- `huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx::ContextAtlasStage`
- `huabu/apps/web/src/lcos/surfaces/context/contextAtlasSemantics.ts`
- `huabu/apps/web/src/lcos/surfaces/context/TemporalRail.tsx::TemporalRail`
- `huabu/apps/web/src/lcos/professional/PortalPreviewBody.tsx::PortalPreviewBody`
- `huabu/apps/web/src/lcos/ui/families/{LcosCollectionSurface,LcosPortalPreview}.tsx`
- `apps/web-gen2/src/spatial/{surfacePort,spatialFocusPort}.ts`
- `huabu/apps/web/src/lcos/lcosReferenceState.ts` 与 `lcos/app/useLcosWorksiteNav.ts`

**完成定义。** Context 复用唯一 Huabu Canvas kernel；Atlas、Main、Assembly 共用 canonical identity；child worksite 的 camera/selection/history 可恢复；Temporal 使用真实时间分组且不再显示“未接入”；Portal 六态都有真实 target/receipt 或明确 unavailable；返回后来源路径、identity、状态和相机正确。

**与 GUI 并行。** 有条件可以。GUI 可先做 Atlas/Portal/Temporal 的 family、状态、motion 和 reduced-motion 视觉；Core episode producer、Portal transport/receipt、camera restore 仍由基础设施 owner 串行。

## R5 → Wave 7；Conversation 交叉到 Wave 8

**Current truth。** Workflow 侧已有 `WorkflowWorksite`、`WorkflowCardPool`、`workflowCardSemantics` 和 `LcosTaskCard`；Conversation 侧已有 `ConversationWorkViewBody`、`WaitingInputSection`、`RecoverySection`、`CoreCollaborationClient`。卡片、工作流、会话工作视图均有生产入口，但功能控板仍是 Partial；`send`、native full-history `fork`、完整 handoff/receiver 仍明确 Blocked 或 fail-closed。

**尚缺的真实纵切。** Wave 7 要完成“Card Pool 取真实材料→投放到 Step/Conversation→明确只是草稿→创建 Run→来自 Core 的 Run/Waiting/Review”。Wave 8 再完成“同一 Conversation→Work View→真实 send/continue/fork/recovery/handoff”，不能用 create new session 冒充 native fork，也不能把 delegate 当成 send。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/surfaces/workflow/WorkflowWorksite.tsx::WorkflowWorksite`
- `huabu/apps/web/src/lcos/surfaces/workflow/WorkflowCardPool.tsx::WorkflowCardPool`
- `huabu/apps/web/src/lcos/ui/families/LcosTaskCard.tsx`
- `apps/web-gen2/src/backend/{runs,drafts,collaboration,continuation}.ts`
- `apps/web-gen2/src/composer/{composerController,composerSubmitMapper}.ts`
- `huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.tsx::ConversationWorkViewBody`
- `huabu/apps/web/src/lcos/professional/{WaitingInputSection,RecoverySection}.tsx`
- `huabu/apps/web/src/lcos/shell/lcosShellStore.ts`（composer/window intent，不存 Run truth）

**完成定义。** Workflow card 的 identity、Step、Run、Waiting、Review、Checkpoint 来自真实 owner；取用/打开/续接三动作分开；草稿未发送时有明确提示；Conversation Work View 的 send/fork/handoff 能力按 provider 实际能力显示，成功有 receipt，失败保留草稿并说明原因；retry 不重复建 session；Waiting/Recovery 从真实节点/会话入口可达。

**与 GUI 并行。** 可以并行做卡片、Work View、disabled/unavailable/error 状态的视觉实现；真实 Run、transport、fork、handoff、recovery 必须与 T6/T7/Local Core 串行对账。

## R6 → Wave 8–10：整机收口

**Current truth。** `locatorState`、`arrivalState`、`locatorGeometry`、`CoreColorPinClient`、Navigator Pin 读取/assign/remove、HUD placement 和多种 E2E 脚手架已在仓。当前功能控板仍将画外定位、颜色标记、铁路、重启恢复列为 Partial，将空间导航、时间轨、归档列为未开始/受阻；GUI Readback 也把 Arrival consumer、Spatial Navigator、Temporal producer、LOD owner 列为 Gap。

**尚缺的真实纵切。** R6 不是再造一个页面，而是把前五批串成整机：真实 provider→Run→waiting_input→result/review→Artifact Return→Accept/Retry→Checkpoint→reload；补 Locator→Arrival production consumer、Spatial Navigator、ColorPin 多现场对象路径、Railway reorder/Receive、Temporal producer、LOD 单一 owner、390/768/1440 responsive、reduced-motion、offline/stale/timeout/cancel/reconcile/archive。

**Exact caller / files。**

- `huabu/apps/web/src/lcos/navigation/LcosNavigatorIsland.tsx::LcosNavigatorIsland`
- `huabu/apps/web/src/lcos/navigation/{LcosFocusWhere,LcosCameraControls}.tsx`
- `huabu/apps/web/src/lcos/navigation/lcosSurfaceMarkerTarget.ts`
- `apps/web-gen2/src/interaction/{locatorState,arrivalState}.ts`
- `apps/web-gen2/src/spatial/{locatorGeometry,spatialFocusPort}.ts`
- `apps/web-gen2/src/backend/colorPins.ts`、`collaboration.ts`、`continuation.ts`
- `huabu/apps/web/src/lcos/shell/{LcosRailway,LcosGlobalHud,lcosHudPlacement}.tsx/ts`
- `huabu/apps/web/src/lcos/nodes/useLcosDensity.ts`
- `scripts/e2e/{wave8-answer-recovery,wave9-responsive-a11y,wave10-golden-path}.mjs`

**完成定义。** Golden Path 和主要失败路径都从 production route 走通并能 reload；所有能力有真实 Core/Provider owner，Unavailable/unknown 不被视觉盖掉；LOD、motion、responsive、keyboard/focus、reduced-motion 满足当前 Figma/UX 合同；最终证据是用户路径、持久化恢复和整页浏览器证据，而不是接口或组件存在。

**与 GUI 并行。** 仅在 owner 稳定后并行。GUI 可以做视觉精修、motion、responsive、a11y；一旦涉及 Arrival、ColorPin topology、safeRect、Temporal producer、LOD owner 或恢复语义，必须回到对应基础设施纵切，不能双写。

## Wave 2 后的下一刀

下一刀是 **Wave 3：统一 `CanvasNodePresentationSeam` 的真实节点纵切**，优先顺序如下：

1. 以当前 Wave 2 的 CanvasHostBoundary、projection binding、history/CAS 结果为底，确认 `useLcosCanvasProps → createLcosNodePresentationSeam → NodeWrapper` 仍是唯一 presentation junction。
2. 先接真实 Main fixture 的 Source/Working/Draft/Context/Run/Decision/Glyth；每种都走真实 binding/read model，不用 title-only fake。
3. 校准 LCOS body 与 Huabu binary LOD 的 owner 关系，避免外层二档再次覆盖 LCOS 四档密度。
4. 只在 production route 验证 native fallback 原因、拖拽/resize/edge 跟随和 reload；GUI Stage 1 可同时做 shared family 视觉，但不改上述 kernel/owner 文件。

Wave 3 收到真实节点证据后，才进入 Wave 4 的 Main/HUD/Railway/Navigator 完整切片；R1–R6 的其余工作按本表挂回对应 Wave，不再另开一套平行“R 波次”施工顺序。

## 依据与诚实边界

- `README.md`、`AGENTS.md`
- `docs/construction/GEN2_FRONTEND_UX_RUNTIME_CONTRACT.md`
- `docs/construction/PROJECT_READBACK.md`
- `docs/construction/SOURCE_ADOPTION_LEDGER.md`
- `docs/construction/FIGMA_SOURCE_LEDGER.md`
- `docs/construction/HUABU_RETIREMENT_LEDGER.md`
- `docs/handoffs/GEN2_Wave2_CanvasKernel_B1_B3_B5_施工交付_20260919.md`
- `E:\OS开发\LCOS_Gen2_GUI_Presentation\docs\handoffs\GEN2_GUI_Presentation_Readback_R1-R6_20260919.md`
- `E:\OS开发\LCOS_Gen2_GUI_Presentation\docs\handoffs\GEN2_GUI_STAGE1_to_Wave2_MergePreflight_20260919.md`
- `E:\Codex 项目\OS开发\deliverables\GEN2_新前端重新总装正本_20260913\04_逐Wave施工卡与验收.md`
- `E:\Codex 项目\OS开发\deliverables\GEN2_新前端重新总装正本_20260913\14_685e02a保留重写矩阵与Recovery_Waves.md`
- 桌面交接包：`C:\Users\1\Desktop\前端冲刺\LCOS_Gen2_功能控板_交接包_20260919.zip`（只读核对；控板状态不被本文件改写）

本文件是执行地图，不是完成声明。每一项仍要回到对应 Wave 的真实 caller、真实状态来源、浏览器动作和恢复证据；没有这些证据，状态保持 Partial/Gap/Blocked。
