# SOURCE_ADOPTION_LEDGER — 现成轮子承接账本

初始化：2026-09-13（分支 frontend-reconstruction-v2，基线 main@63188c2）
依据：`09_T1-T7现成轮子承接补丁卡.md` + `appendices/A_Gen1_Donor_ExactAudit.md` + `appendices/B_Huabu旧壳退役与内核保留_ExactAudit.md`

采用级别：A=纯逻辑直接 import；B=机制/数据流复用、重写视觉壳；C=借算法/编排、Gen2 边界内重写；X=禁止迁移旧 runtime/store/产品壳。

每个用户可见能力一行：donor exact repo/commit/file/symbol → 级别 → Gen2 target → production caller → 替换的旧 UI → real owner → fallback → evidence。状态仅用 PLANNED/ADOPTED/ADAPTED/VERIFIED/GAP。

## 九面设计状态基准（禁合并为一句 READY）

| 面 | designStatus | designReadyScope | stateCoverage | sourceBindingStatus |
|---|---|---|---|---|
| launcher | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| main | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| context | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| workflow | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| atlas | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| temporal | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| window | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| reader | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |
| hud | DESIGN_READY | 1440 当前主构图 | PARTIAL_COMPOSITION | NEEDS_SOURCE_BINDING |

## T1–T7 源级轮子承接表（增量维护）

| ID | 用户能力 | donor exact | 级别 | target file/symbol | production caller | 替换旧 UI | real owner | status | evidence |
|---|---|---|---|---|---|---|---|---|---|
| T1-A01 | Canvas kernel boundary | Huabu `components/Panels/Canvas/Canvas.tsx::Canvas` + ReactFlow | C | `lcos/host/CanvasHostBoundary.tsx` | `LcosProjectShell → LcosWorksiteStage → CanvasHostBoundary` | LCOS mode 下旧 chrome 不挂（NodeToolbar/Controls/MiniMap） | Huabu kernel | ADOPTED | Wave 2 handoff + wave2-kernel/gestures/parity e2e |
| T1-A02 | Node body seam | Huabu `NodeWrapper.tsx::NodeWrapper` + `lcos-seam/nodeBodySlot.tsx` | B | `lcos/nodes/createLcosNodePresentationSeam.ts` + `lcos/nodes/useLcosDensity.ts` | `useLcosCanvasProps.resolveNodeBody` → `NodeWrapper` | native body 降 fallback | Huabu geometry | VERIFIED | Wave 3+9 handoff；`NodeWrapper` 发布呈现输入（Wave 9 补挂），wave9 e2e 证明密度按屏幕像素（zoom 0.29 → mark，旧 zoom 阶梯会判 summary） |
| T1-A03 | 相机纯函数 | GEN1 `canvasGeometry.ts::{zoomCameraAt,applyWheelGesture,fitBounds,revealNode,nodeDensity,nodeDimensions,placeNewNodesIncrementally}` | A | `apps/web-gen2/src/spatial/`（并入现有 geometry 或 gen1CanvasMath） | camera port | 不迁 GEN1 Canvas | Huabu camera | PLANNED | 待 Wave 9 |
| T1-A05 | 视觉 family/descriptor | GEN1 `CanvasNodeVisual.tsx::{nodeVisualFamily,displayNodeTitle,nodeSecondaryLine,detectFileIdentity}` | A/B | `apps/web-gen2/src/presentation/nodeSpecies.ts` | `createNodePresentationSeam` | 不按 note 猜语义 | Core metadata | ADAPTED(现有 visualFamily) | Wave 3 扩展 |
| T1-A06 | 物种 registry | GEN1 `nodeCardRegistry.tsx::{registerNodeCard,resolveNodeCard}` | B | `apps/web-gen2/src/presentation/rendererRegistry.ts` + `lcos/nodes/*Body.tsx` | `LcosNodePresentationProvider` | 禁止 silent fallback | Core + Huabu | PLANNED | 待 Wave 3 |
| T1-A09 | Portal/Surface | GEN1 `SurfaceComponentLayer.tsx`、`surfaceComponentRegistry.tsx`、`PortalComponent.tsx`、`SurfaceComponentImmersive.tsx` | B | `lcos/portal/WorksitePortalHost.tsx` | Main/Context/Workflow worksite | 不建第二 graph | Huabu kernel | PLANNED | 待 Wave 6 |
| T2-A01 | 三现场 canvasId | archive `workspace.canvasId` Core/client | A | `lcos/shell/LcosSurfaceDock.tsx` + `LcosProjectRoute.tsx` | `LcosProjectShell` | 旧 bottom capsule 视觉不救 | Core | VERIFIED | Main/Context/Workflow 仅在 Dock；真实 `switchCanvas` + workspace canvasId；UX runtime e2e |
| T2-A02 | Railway | GEN1 `WorkspaceRailVNext.tsx` + `workspaceRailOrder.ts::orderProjectRailViews`；T2 C2-1C | B/C | `lcos/shell/LcosRailway.tsx`、`navigation/railwayProjection.ts` | `LcosGlobalHud` | 旧 LayerPanel/sidebar 不挂；禁止第二套三 Surface | Core view order | ADAPTED | 已读 Core order、过滤旧 root seeds、按真实 item 数量 hug；具体 Worksite activation、Drop、reorder/CAS、preview 仍 GAP，见 2026-09-14 UX runtime handoff |
| T2-A03 | Project Search | GEN1 `ProjectSearchLens.tsx::{anchorLabel,humanKind,resultFromRemote,matchReasonLabel}` | A/B | `navigation/LcosNavigatorIsland.tsx` | Global HUD Cmd/Ctrl+F | 旧 search UI 退出 | Core search | VERIFIED | 真实 Core search + loading/empty/error + 同画布 Locate；跨现场具体 arrival 仍登记 GAP |
| T2-A04 | Spatial Navigator | Huabu `Canvas.tsx` 的唯一 ReactFlow context、viewport zoom、MiniMap、interactivity lock + `canvasStore` 的 MiniMap/UI preference；T2 C2-3B 卡 | B | `lcos-seam/types.ts::CanvasSpatialNavigatorRenderer` + `lcos/navigation/LcosSpatialNavigator.tsx` | `useLcosCanvasProps.spatialNavigator` → `CanvasSpatialNavigatorMount` | `LcosCameraControls` production caller 与 stock Controls/MiniMap 退出 | Huabu Canvas + `LcosCanvasCommands` camera consumer | VERIFIED | `spatial-navigator-production.mjs`：单一 navigator/minimap，zoom/fit/reset、lock、grid/minimap reload、MiniMap pan、Main↔Context，console/page error 0 |
| T2-A05 | Locator | archive `locatorGeometry.ts/locatorState.ts/arrivalState.ts/spatialFocusPort.ts` | A | `lcos/navigation/LcosLocatorOverlay.tsx` | shell overlay → 唯一 camera | 旧 MiniMap | Huabu camera | PLANNED | Wave 0 救回 |
| T3-A03 | commandDraft | GEN1 `commandDraft.ts::{orderedReferenceForNode,resolveComposerReceiver,referenceCandidates,explicitExecutionReferenceIds,mergeExecutionContextIds}` | A | `apps/web-gen2/src/composer/*` | `LcosActionArc` → canvas-local `LcosComposerHost` | 不迁旧 global state；不挂常驻底栏 | Core + Bridge | VERIFIED | 显式对象命令才打开、单实例、靠近目标、提交真实 Run；`scripts/e2e/gen2-ux-runtime-contract.mjs` |
| T4-A01 | Professional Stage | Huabu PreviewWorkspace mechanics + T4 window 规划 | B/C | `lcos/professional/ProfessionalWindowStage.tsx` | `LcosProjectShell` route-level sibling | 旧 PreviewWorkspacePanel 不挂 | T4 + Huabu preview | ADAPTED | 唯一 Stage + body registry + close/Esc 已接；浮动可达，停靠/分组拓扑仍 GAP |
| T4-A02 | Reader | GEN1 `artifactViewerRegistry.tsx::{resolveArtifactViewerKind,canPreviewArtifact,ArtifactViewerHost}` | A/B | `ArtifactReaderBody.tsx` + viewer registry | Professional Body Registry | 旧常驻 preview 右栏退出 | Core revision | ADAPTED | Reader 入口与元数据态可达；完整正文/媒体 viewer 接线仍 GAP |
| T6-A01 | projection/binding | archive + 现有 `ProjectToSpaceProjection`/`ProjectionBinding`/`reconciliationRunner` | A | `apps/web-gen2/src/spatial/*`（扩全 species） | `useLcosHostRuntime` | 不建 per-entity reconciler | Core | KEEP(main 已有) | Wave 0 核验 |
| T7-A01 | Glyth | GEN1 `ConversationGlyth.tsx`、`glythMotion.ts`、`glythBloub.ts`、`glythSemanticLod.ts` | A/B | `lcos/nodes/GlythNodeBody.tsx` + shared runtime | binding-aware node seam | 不做永久机器人按钮 | Core conversation | PLANNED | 待 Wave 8 |
| VOICE | voice 回填 | archive `7626ee2 voiceInput.ts` + tests | A | `apps/web-gen2/src/interaction/voiceTextMerge.ts` | Composer input | browser SpeechRecognition 不冒充 Core voice | Core voice route | PLANNED | Wave 0 救回 |
| W9-M01 | 相机移动暂停复杂动画 | Huabu（本仓）`@xyflow/react::useViewport` 变换流 | B | `lcos/host/LcosCameraMotionPolicy.tsx` + `lcos/ui/lcos.css` | `useLcosCanvasProps` overlays → 唯一 canvas | 不新建第二相机/不做逐帧 setState | Huabu camera | VERIFIED | wave9 e2e：`data-lcos-camera-moving` 滚轮期间出现、落定 140ms 后清除 |
| W9-A01 | Esc 关闭最上层专业窗口 | Huabu（本仓）`hooks/useCloseOnEscape.ts::useCloseOnEscape` | A（直接复用） | `lcos/professional/ProfessionalWindowStage.tsx` | route-level Professional Stage | 不新增第二套 Esc 栈 | Huabu hook | VERIFIED | wave9 e2e：窗口开→Esc→窗口关且画布存活；关闭按钮 `:focus-visible` 2px |
| W9-A02 | 44px 热区与焦点可见 | Huabu `--info` token + 本仓 lcos tokens | B | `lcos/ui/lcos.css`、`lcos/navigation/LcosSpatialNavigator.tsx`、`lcos/shell/LcosSurfaceDock.tsx` | 全部 LCOS HUD 控件 | 不覆盖 Huabu 原生控件样式 | LCOS UI | VERIFIED | wave9 e2e + Spatial Navigator production e2e：导航键 44×44、折叠壳 52×48、可见 focus ring |
| W10-R01 | Run 结果复核（Review / Artifact Return） | Core 既有 `GET /projects/:pid/runs`（returns + draftRevisions + capabilities）+ `POST /artifact-returns/:id/{accept,reject,retry}`（`routes/runtime-reviews.ts`）+ contracts `RunReview` | A（直接消费既有 route/契约，不建第二 review truth） | `web-gen2 CoreRunClient.{listRunReviews,acceptArtifactReturn,rejectArtifactReturn,retryArtifactReturn}` + `lcos/professional/ArtifactReturnSection.tsx` | `ConversationWorkViewBody` 复核段 | 无（此前该能力完全无入口） | Core `RuntimeReviewService` | ADOPTED | wave10 e2e 真实 capability 原因（`no_pending_artifact_return`）；web-gen2 3 tests + 组件 3 tests；启用路径因真实库无 pending return 未端到端触发 |
| W10-C01 | Run 提交（Composer → Core） | Core `POST /projects/:pid/runs` + 真实 workspace（`workspace-real-main`） | B（修真实缺陷：写死 `workspaceId:'main'` → 409 外键；conversation 冒充 contextArtifact） | `lcos/composer/LcosComposerHost.tsx`、`lcos/shell/LcosProjectShell.tsx` | route-level Composer | 无 | Core Run | VERIFIED | wave10 e2e：Cmd/Ctrl+Enter → 真实 `Run 已创建` 回执、输入清空、console 0 error；修复前为真实 409 |

> 规则：新增可见组件前先搜本表；已列 donor 优先 A/B/C 承接；确不能用时写清具体依赖冲突，禁止笼统写"旧代码不合适"。

## 2026-10-02 · R14 复用替换与原生文本接线（代码候选，非整机验收）

本段按用户最新要求记录实际来源，不沿用旧表中“重写视觉壳”作为默认方案。已有正确机械、G1 已认可集合主体、历史引用和发送保护继续保留。未安装或未运行的库不标 VERIFIED。

| 能力 | 实际采用来源／符号 | G2 生产入口 | 替换或新增的适配 | 保留内容／验证范围 | 状态 |
|---|---|---|---|---|---|
| 多选与 Arc 的嵌套弹层 | 项目已声明的 `@floating-ui/react`：`FloatingTree`、`FloatingNode`、`FloatingPortal`、`useDismiss`、`FloatingFocusManager`；官方 FloatingTree/useDismiss/FocusManager 组合方式 | `ToolbarPopover` → `FloatingToolbar.ColorPicker/AlignPicker` → `MultiSelectToolbar`；原 `CanvasFloatingPopover` → `LcosActionArc` | 移除父层手写 document 外侧监听；受控开关、现有锚点与命令接入，子 portal 继承原树 | 保留真实外侧关闭、右键、焦点、键盘及既有位置避让。新增 6 条真实组件测试，但依赖未取得，正式 Vitest/实际 Floating UI 运行尚未通过 | ADAPTED |
| 多选整理 | `DZWFLi/LCOS-local-creativeOS@3e99769bf106d68cecc54094662352bfaecf2bdd`：`apps/web/src/features/canvas/canvasVisualGeometry.ts::layoutVisualGrid/nodeVisualBounds`；`apps/web/src/features/layout/layoutGeometry.ts::removeLayoutOverlaps` | `LcosMultiSelectToolbar` → `selectionLayout` → `donor/gen1VisualLayout` → 现有 `setNodeGeometry` | 原函数保留，仅最小结构类型适配；实际实体种类、父坐标、锁定继承和无法完成的碰撞修复拒绝在接入端处理 | 不引入 G1 Canvas/相机/选择库；原生对齐、集合伴随移动与 Undo 留用；源码用例已运行 | ADAPTED |
| 编辑密度与临界稳定 | G2 既有 `resolvePresentationDensity`、Huabu `SEMANTIC_ZOOM_CONFIG.hysteresis`、React Flow 当前视口与节点快照 | `NodeWrapper` → `useLcosDensity` → 原有物种 body；原位编辑显式传 editing | 原节点数量封顶只作用背景；视口外/hidden 节点不计入；以原 resolver 和既有迟滞参数稳定临界 | 无第二 LOD/store/camera；编辑/拖动/缩放阶段优先；纯函数与实际几何输入测试通过，整机滚轮手感未验 | ADAPTED |
| 原生文本原位编辑与合法材料 | 项目既有 `MilkdownEditor`、`MilkdownFloatingToolbar`、`stripMarkdown`、`createTextArtifact`、`reviseManagedTextArtifact`、节点绑定与 metadata 事务 | `createLcosNodePresentationSeam` → `LcosCanvasTextBody` → `CoreArtifactClient` → `curation/canvas-text` → 既有文本服务 | 仅 current managed 文本/Markdown 或未绑定 native text；先保存 native 节点，再按该节点身份创建/修订。新正文/工作集/绑定同一事务，修订检查在事务内；原回执核对不重造材料 | 保留原节点/空间几何、旧正文、并发版本、草稿、引用模式、输入法、取消与迟到回执保护。SQLite/生产路由测试通过；浏览器文本保存流程用显式 Milkdown/画布替身，不能证明原生富文本或整机通过 | ADAPTED |
| 正式入口测试 | 仓库已有 `GlythStateActions.test.tsx`、`LcosComposerHost.references.test.tsx`；R12 原整理回归 | 真实右键 More 与＋引用入口；实际原整理函数 | 只调整已由用户明确更正的旧入口/网格预期，保留原失败日志，并新增边界测试 | 正式 React19/Vitest 因缺依赖未运行；另有 node:test 源码套件复跑，不能相互替代 | ADAPTED |

### 本批不改的东西

- R13 的 G1 CollectionFace、CSS、SVG 保持原文件字节；不增加集合管理流程。
- 不修改依赖清单、锁文件、数据库表结构；不推送 GitHub。
- 不替换整个专业窗口，不重写装配瀑布流，不重开 Context/Workflow 产品定义。
- 本批只补原生文本的合法材料通道，不宣称所有图片、影音或外部来源已接入。
- 不将旁路编辑直接写入历史版本、未受管导入材料、运行草稿或尚未明确身份的绑定。

### 来源与验证入口

原布局取源路径见上表；Floating UI 的具体 API 来自项目既有依赖和官方文档：`https://floating-ui.com/docs/floatingtree`、`https://floating-ui.com/docs/usedismiss`、`https://floating-ui.com/docs/floatingfocusmanager`。

新增生产源码测试：`apps/web-gen2/test/r14-reuse-restoration.test.ts`、`scripts/tests/r14-canvas-text-core.test.ts`；新增真实 Floating UI 组件测试：`huabu/apps/web/src/components/Common/ToolbarPopover.test.tsx`。完整执行日志、实际命令、未通过的正式检查与浏览器替身清单随 R14 交付包保存，不用旧表历史 VERIFIED 状态代替本批事实。


## R15 · 既有正文组件复用与异步读写连续性（2026-10-02）

本轮输入为原上传工作区实际叠加 R1–R14 的副本，不代表用户桌面另有改动的版本。没有换正文引擎、没有新增依赖、没有重画集合或窗口。以下是代码接线及隔离验证，不是整机验收状态。

| 工作项 | 原实现 → 实际调用者 | 本轮适配／退役范围 | 状态与证据 |
|---|---|---|---|
| Markdown Reader | 当前 Huabu `components/Milkdown/{MilkdownPreview,createMilkdown}` → `ReaderContentView` → `ArtifactReaderBody` | 正式 Markdown 读面停止调用弱逐行 `Gen1TextDocument`；旧 donor 文件保留。沿用现有 schema、parser、serializer、只读和安全链接处理，不另写解析器 | ADAPTED；生产 import 已接。真实 Milkdown/React19 测试因缺依赖未运行；控制工厂的 Reader 浏览器 16 场景通过 |
| 共享正文异步生命周期 | 同一 `MilkdownEditor` / `MilkdownPreview` 原组件 | 初始化完成前的最新正文／只读／标注、取消的实例 DOM 隔离、订阅清理、格式化不冒充用户编辑、显式错误回调；不改引擎工厂和既有块拖动 | ADAPTED；15 个真实 wrapper＋控制工厂浏览器场景通过；不是 parser 渲染证明 |
| 原位编辑续写 | R14 `LcosCanvasTextBody` + 原 Core 文本服务 | 元数据刷新保留输入实例；从当前未提交草稿读取，而非请求起点快照；旧读取不能覆盖新保存；编辑器重载不重新发送正文 | ADAPTED；21 个浏览器场景调用生产组件/客户端和真实 Core/SQLite，Milkdown 输入、画布状态为测试端口 |
| 版本阅读位置 | 已有 `readerPositions` → `ArtifactReaderBody` → `readerScrollRestore` | 渲染就绪后才消费原位置；单个内容区域的测量／图片完成／手动操作取消属于 DOM 适配，不新增位置数据库、相机或滚动引擎 | ADAPTED；含隐藏重显、切版本、晚到渲染、图片尺寸和用户输入优先的浏览器验证 |

READ_SOURCE：本仓共享 Milkdown 组件、createMilkdown、markdownUtils、blockDrag、现有安全链接逻辑；当前 `DocumentSourceView` 的 MilkdownPreview 调用；R14 原位编辑与 Reader 原调用；《R13 后复用替换与主流程施工安排》“原位编辑／Markdown阅读／版本位置”；《自写实现及 donor 偏离审计》05、07、09。用户最新口径为成熟实现优先、只做必要适配。

VISUAL_SOURCE：沿用 ReaderContentView 已标记的 Figma 5388:27484 与现有 professional-reading.css；本轮只作用于 Reader 正文内容范围。未重新取 Figma，未进行全页视觉保真验收。

RETIRED：Reader 主路径中的 Gen1TextDocument 调用、共享 wrapper 过期 pendingMarkdown 队列、正文未渲染时抢先恢复 scrollTop 的时序。没有删除历史 donor 文件、正确领域逻辑或安全措施。

VERIFIED：本轮重新执行既有 989 项源码/Core 测试；wrapper 生命周期 15、Reader 16、文本保存 21 个浏览器隔离场景；完整差分及应用/反向验证见随 R15 交付的 verification。计数分开，不将隔离测试升级为整机。

UNRESOLVED：正式依赖下载 EAI_AGAIN；正式 Vitest 不存在，实际 React19/Floating UI/Milkdown/Huabu 全应用未验。装配虚拟化、专业窗口采用路线、全部主画布组合动作和持久草稿恢复不计本轮完成。原有 MIT 版权声明保留；createMilkdown 引擎原文件和依赖清单保持不变。
# 2026-10-06：真实 G2 SurfaceDock 直接采用 Rare UI

- READ_SOURCE：`E:/TRAE项目/LCOS0.1收口/rareui-reference/components/ui/gooey-nav.tsx` 全文、`registry.json`、当前 `LcosSurfaceDock` / `LcosSurfaceDockView` / HUD 尺寸测量与真实导航调用。
- ADOPTED：`swamimalode07/rare-ui@b4de46efe4eb2613e22bb8134b482ed4e0c7736a/components/ui/gooey-nav.tsx::GooeyNav/Segment/NavLabel/neckPath` → `huabu/apps/web/src/lcos/ui/vendor/rareui/gooey-nav.tsx` → `LcosSurfaceDockView` → `LcosSurfaceDock` → 原 `useLcosWorksiteNav.switchWorksite`。原春簧、拼接形状、受控选中与 reduced-motion 实现直接保留；仅 Next 路由转 React Router、cn 路径和现有 busy/disabled/aria 属性连接。未新增导航、相机或 truth owner。
- VISUAL_SOURCE：用户 2026-10-06 指定 RareUI 与 G1/G2/Figma 同优先级；保留 Figma Shell `5386:256` 的三现场归属、底部位置、原图标和 safeRect 避让，颜色/间距接现有 tokens。宽度由原 HUD 测量适应可读标签。
- RETIRED：`LcosSurfaceDockView` 中原三个 `LcosIconButton` 拼装及其旧 tile CSS；导航结果/错误反馈和切换等待约束保留。
- VERIFIED：原组件受控选中/原目标 identity/busy 禁用回归及原导航测试 6/6；typecheck 通过（后续平行合并需独立复核）；真实浏览器 Main→Context→Workflow URL 切换成立，绑定对象连线端口 8 个而 native quick-create 入口 0；截图 `E:/TRAE项目/LCOS0.1收口/output/playwright/g2-main-rareui-20261006.png`。Browser 插件当前未提供，按已读 testing/playwright skill 使用正常 Playwright CLI；未绕过权限服务。
- UNRESOLVED：这是一个生产组件采用，不代表 RareUI 已大幅覆盖整个 G2，不代表 Context/Workflow 整页成熟或核心用户旅程完成。当前项目 Atlas/Workflow 库没有真实卡片，带卡片链路仅组件/回调测试验证；未制造数据补画。
- 来源署名与原许可证保留在 vendor/rareui/LICENSE 和仓库 README，组件信用链接 [Rare UI](https://rareui.com)。

## 2026-10-11 · 创建工具、Glyth 待放置槽与 TapNow / M2 材质

- READ_SOURCE：桌面 `C:/Users/1/Desktop/LCOS_GUI_W1_to_O1_All_Patches_20261010.zip` 的 `02_ready_to_use/W3/preview-source/reference/m2/src/huabu/apps/web/src/lcos/ui/materials/`；`E:/tapnow/resources/web/assets/use-chat-attachment-file-input-ajTygSPP.js` 的 `M0 / Bl / Ui / pr`；`course-api-base-url-CifxI1ia.js::yBe` 和 `page-Da_DfwiK.js::jF`；本仓 `questionCompose.ts / QuestionNode.tsx / LcosCanvasCreationMenu.tsx / LcosRailway.tsx`。官方 Huabu main `ef481056f090f9065c2456ad13a461204a956b51` 只读核查；该版本没有找到独立的待放置槽。
- ADOPTED：Huabu MIT `components/Nodes/question/questionCompose.ts::createQuestionNodeAndCompose` → `lcos/nodes/creation/glythCreation.ts::createGlythAtPoint` → `GlythCreationSlot` → 原生 Canvas `addNode`、新 thread、原 `enterQuestionCompose`。原 Glyth replica 的形状 / 颜色目录直接暴露给 staging；18 种形状 × 11 色 × idle / curious = 396 个组合，不随机伪造工作状态。原研究来源及限制仍见 `ui/glyth/vendor/grok-replica/UPSTREAM_PROVENANCE.md`，不将其标为 MIT。
- ADOPTED：TapNow desktop 0.4.95 编译后原件 `M0 / Bl` 的函数 body 和 slow / medium / default 三个 WEBP → `ui/nearfield/donor/tapnow-collapsed-chat.mjs` 与同目录资产 → `TapnowChatEntry` → `LcosCanvasCapabilities` 原会话开启回调。仅注入 React / JSX / classNames / 原 Common Button / 本地资产路径；150px 邻近感应和 600ms 交接原样保留。安装包没有单独 GUI 许可声明；不将 Electron 或依赖的 MIT 标签套给业务 GUI。
- ADOPTED：桌面 M2 的 `spectralRipple.ts / spectral-ripple.css / vendor/siriwave` 原件 → 同名生产文件；SiriWave 原 MIT 许可证一起保留。`SpectralMaterial` 只适配 React 生命周期；`glythThoughtView` 合并 M2 调用时保留现有 O1 文案和密度。生产调用者为待放置槽、折叠会话入口、三视图 Dock 及既有 Glyth Thought。静息面绘制静态轮廓，真实 Thought 状态才驱动动态，不伪造语音能量或进度。
- ADOPTED：`yBe` 原 200×150、深底、白色视口框 / 暗遮罩参数 → `LcosSpatialNavigator` 克隆的既有唯一 React Flow MiniMap。只完成该呈现参数采用，没有宣称把其完整弹簧手势 / Color Pin 联动搬完。`jF` 的 .5px 边框、inset highlight、40px blur 和阴影 → `tapnow-chat-entry.css / tapnow-dock-material.css`；三现场的 Rare UI 按钮、位置、切换和等待约束保留。
- VISUAL_SOURCE：用户本轮明确以本地 TapNow 和自有彩色光波为主。导航仍保留，只有添加 / 创建工具收进左侧 ＋；不是整个 Rail 折成一个按钮。新待放置槽属于 LCOS 编排，不声称是官方 Huabu 原槽。
- RETIRED：独立底部创建按钮、静态 Bot 会话入口；带形象的 Question 不再挂黄便签壳、原文字自动高度 / 缩略替身 / 字号工具条。原 Question 创建、会话、agent 选择、权限、运行 / 停止与画布机制保留；没有形象的旧 Question 继续原路径。
- VERIFIED：正式依赖下 typecheck、生产 build、18 个套件 / 86 项测试通过。真实本地浏览器验证了刷新不创建、画布外放弃、拖放新线程、键盘创建、精确形象保存重载、重开不复制、唯一原生会话工作台、390px 面板、小地图与原相机交互。M2 动态通过生产 presenter 的独立视觉样例验到绘制 / reduced-motion 停帧 / 清理，不冒充实际 Run。证据：`E:/TRAE项目/LCOS0.1收口/output/glyth-creation_20261011/`。
- UNRESOLVED：链接 Chat 无可用 `read_thread` 工具，采用的是已找到的桌面 M2 原件，不宣称读到了云端最新内容。新 agent 是原生 Huabu thread，并非自动归档的 Core ConnectedConversation / Managed Run；未发送 AI 消息。整套 Color Pin、右侧会话栏内部组件、完整小地图弹簧机制和新版内容组件仍按修订清单继续。当前只在本地工作区，未提交本轮到 GitHub。

## 2026-10-13 · GUI 与用户目的首轮整改

- READ_SOURCE：既有本地 TapNow `M0/Bl/jF`、`QM/BMe/LMe/RW`、`Lie/Gie/m7/y7` 的已归档采用源，LCOS 自有 W3/window-surfaces、桌面 M2/spectral-ripple，以及当前 Stage/visibility、Review/Reader、共享项目 SSE 和 Core RuntimeAutoSyncService。原件出处沿用下方原采用条目，本轮没有新增编译包复制。
- ADOPTED：成熟密度及独立命中区域，接原预览、确切候选版本 Reader、自动项目事件更新；保留原会话与窗口 owner。正常任务/集合页收回人工同步负担，异常恢复保留。
- VISUAL_SOURCE：用户最新要求为浅色 LCOS W3/M2 材质，TapNow 的布局/动效机制。下方旧条目曾采用的深色 `jF` 参数被本轮明确纠正；导航、Pin、助手入口不再以黑色底为采用目标。
- RETIRED：硬编码深底、40px 覆盖原 M2 模糊、43px 光波裁短、正常刷新按钮、无外部文件的无用文件按钮、常驻版本按钮排。导航材质移到共享样式入口，避免依赖小地图加载。原命令、CAS、身份检查及异常恢复继续使用。
- VERIFIED：147 个不同相关用例、两处类型检查、diff check；生产组件的桌面/触屏点击、窄屏助手、浅色材质及原 Reader 只读版本切换通过。证据 `E:/TRAE项目/LCOS0.1收口/output/GEN2_首轮整改_20261013/`。不等同真实项目/模型/跨系统验收。
- UNRESOLVED：Core 启动此前被自动审批拒绝，未绕过；真实后端联调、窗口组默认策略、助手重复壳、会话身份桥接和其余审查项仍未完成。完整进度和 to-do 见该目录 `GEN2_首轮整改与后续施工清单_20261013.md`。

## 2026-10-13 · Drop 文件与 Reader 摘录承接

- READ_SOURCE：GEN1 `LCOS-local-creativeOS@3e99769` 的 `apps/web/src/state/materialTransfer.ts`、`features/canvas/ProjectCanvas.tsx` 和 `App.tsx` 材料导入；材料舱 `08_MD原件包与单件/LCOS_Gen2_T3_TO_T5_全范围_Exact_Interaction_Blueprint_20260907.md` §16/§17 Content→Composer、T4 Round6 Assembly FullChain 原卡；本仓 ImportCopy/WorkspaceMembership、当前 Assembly、Reader、Composer、pointer/Drop owners。并只读核对 `E:/OS开发/LCOS_GEN2`、`Huabu_Upstream_20261008` 的真实源码、启动入口及数据目录。
- ADOPTED：GEN1 MIME/source/locator/parser → 共享 `Gen1TextTransfer` → Canvas 文件/文字入口及 `composerMaterialIngress` → 原 Composer 草稿与引用；既有 `objects` payload → `assemblySelectionCarry` → `AssemblyBody` → 原 `railwayPointerDrop`/Drop resolver。文件使用原 Import Copy 与既有 Workspace members 路由，没有新库或第二份真值。
- VISUAL_SOURCE：保持用户要求的 LCOS 浅色 W3/M2 和已有 TapNow 布局机制；本批不新造壳。普通引用文字缩减到材料标题，版本 identity 留在原 structured reference/来源详情；明确的带来源复制仍保留版本地址。
- RETIRED：项目库多选只携带单件；外部普通文字落成 unbound Note；文件导入后不登记当前现场；Reader 摘录在输入框退化为普通文字；普通输入正文的原始 ID 长串。原指针运输、Core 事务/去重/身份校验及历史引用保留。
- VERIFIED：18 个实际前端文件 247 项、10 项 Core/真实文件/SQLite 重开验证，Web/Core 类型检查。原 AssemblyBody/Composer 的鼠标整组预览、Esc、松手，以及原 Reader HTML5 摘录拖入通过。Capture／来源按原 sourceRef 整组携带，Composer 不支持时整组拒绝。原库相同数据比较：文本卡片 222px→183px，文本 13px/19px；阅读主入口和触屏替代保留。证据 `E:/TRAE项目/LCOS0.1收口/output/GEN2_Drop持续整改_20261013/`。真实成员响应字段为 `artifactViewId`，域类型及 HTTP 实测确认。
- UNRESOLVED：用户完整 Core/Huabu 后端仍未运行，先前自动审批拒绝启动，未绕路重试；原工程与当前工程数据目录不同，未覆盖或迁移原用户库。Collection 整体实体路径、来源的 Composer／Run 引用、首次未登记内容点取、非纯文本 Run 和用户整页持久化/模型答复继续施工。原生图片永久绑定的后续实现与局部验证见本页下一条，不再称为源码缺席。浏览器隔离样例与临时测试 Core 明确区别于用户整页验收。最新要求：不靠删除披露冒充完善，缺口逐项见 `GEN2_未解决功能登记_20261013.md`。

## 2026-10-13 · 原生图片认领与同图多处展示

- READ_SOURCE：材料舱 T3–T5 Exact Interaction Blueprint §15–§18、T4 Round6 Assembly FullChain §3/§6 与 C1-3 原 Source Plan；本仓 `ImportCopyService`／imports、`WorkspaceMembership`、`ProjectionBinding`、`claimWorkspacePortalBinding` 事务模式、`additionalArtifactViews`／原 `ProjectToSpaceProjection`／`Gen2Host`、原 Native text claim、Source snapshot／reference owner。
- ADOPTED：原 Import Copy → `claimImportedImageCarrier` → 同一个 imports 路由／CoreArtifactClient → `resolveNativeMaterialSources` → `LcosHostOverlay.prepareMaterials`；原追加 View／view binding 承接第二只同图原载体；确认的描述 → `registerNativeMaterialSources` → 原引用 owner／下一次 Source snapshot。原 reconciliation／Host facts 保留已绑定追加 View 的固定版本，没有新数据库表、hash、冻结 contract 或第二套真值。
- VISUAL_SOURCE：继续原浅色 W3/M2 媒体形态与原 Canvas node seam；本轮为交互承接，不新造皮肤。浏览器 SVG 是明确的本地验证素材。
- RETIRED：图片只登记字节却永不绑定原节点的分支；已认领原图仍按 unbound 来源重复导入的路径；已选中追加 View 的独立 facts 被跳过的路径。原节点、像素、几何、选择、文件反馈与恢复保留。
- VERIFIED：5 个前端文件 31 项；4 个 Core 文件 10 项（新图片 HTTP 5 项）；4 个 Node 文件 35 项，Web／Core／web-gen2 类型检查。原 Canvas／seam 中登记两个原节点、真实 Shift 选择／右键整组携带至原 Composer preview、Esc，0 JS 异常；字节／MIME、Main／Context、同图两处、重试、SQLite 重开、既有冲突及文件提交后竞争由真实临时 Core 验证。各组不与旧回归结果重复累计。证据及明确边界见 `GEN2_原生图片承接续轮_20261013.md`。
- UNRESOLVED：浏览器首次准备通过原函数执行，用户整页 commit writer／后端未挂载，不算整页验收。首次 Ctrl 点取未登记图片／文本仍需同一 producer 桥接；集合／来源引用、非文本 Run 和原总审查清单继续施工。源码路径已补不代表删掉披露就完工。

## 2026-10-13 · 连续阅读、窗口操作与助手保存流程

- READ_SOURCE：本仓原 `windowRegionTopology`、`lcosShellStore`、`ProfessionalWindowStage`、`LcosWindowChrome`；Huabu 原 `DropdownMenu`／`Popover`／`useCloseOnEscape`；原 `nativeConversationArchive`／`nativeHistoryJsonl`、CoreConversationClient 分片导入／identity／linkSession，及原助手入口。仍沿用材料舱 ProfessionalWindow 与单一 owner 规划。
- ADOPTED：普通 openReader → `readerOpeningGroup` → 既有组追加页签，不改主动拆窗／分屏；原 split／merge／detach 命令 → Chrome 原 overflowTrigger → Common DropdownMenu；原历史读取／导入／关联 → NativeConversationProjectEntry 一次保存；原 listSessions／originMeta.nativeThread → 明确选择待关联历史并恢复。没有另建窗口、草稿、线程、恢复表或身份真值。
- VISUAL_SOURCE：原浅色 W3/M2 窗口材质和既有菜单层；借用成熟 UX 的操作分层，不覆盖为另一套 App。缺失文件仍有用户可理解的真实提示。
- RETIRED：普通新材料追加独立 region；在菜单接通并验证后删除的分屏 footer JSX；原用户须自行串联的归档／关联按钮；正常态手动重读会话按钮。原独立保存历史、主动布局、错误重新加载、已保存记录重试、历史引用及源文件失败反馈均保留。
- VERIFIED：上述 247 项包含窗口与 Reader 验证；助手另 2 个文件 11 项通过。真实浏览器原 Stage 三页签、原分屏、菜单分屏／合并／拆第一组、390px 合并恢复、Esc 与焦点；原助手第一次关联 503 后重试，只导入一次；整页重载后选择待关联原历史，不重新导入。临时 Core 的生产 CoreConversationClient 分片导入／listSessions 及 SQLite 重开，确认原线程／画布 originMeta 实际保留。浏览器响应是明确样例，不宣称用户库或模型已验收。
- UNRESOLVED：普通续聊层级、双右停靠与紧凑任务返回、嵌套预览工作台仍在册；Core／Huabu 用户服务和实际历史关联尚未联调。重载恢复已从原来源接通，不再登记为源码缺口。移按钮、换文案与缩空间不单独计作功能完成。

## 2026-10-11 · 续轮：原画布助手、完整小地图与 Color Pin

- READ_SOURCE：`E:/tapnow/resources/web/assets/course-api-base-url-CifxI1ia.js::{yBe,bBe,vBe,Jc,Lie,kM,Bie,Gie,m7,g7,y7,x7}`；`page-Da_DfwiK.js::jF`；逐符号镜像为 `E:/TRAE项目/LCOS0.1收口/output/tapnow-desktop-review_20261011/GUI原件/{01_ColorPin,02_小地图}`。安装版本 0.4.95，无可用原 TSX / sourcemap；GUI 未找到单独许可证，沿用上一轮记录，不标为 MIT。本仓 `PreviewWorkspacePanel / PreviewRenderer / ChatPanel / useAgentStream / agentApi`、Agent 工具 `canvas-query.ts / canvas-write.ts`、`acp/daemon-entry.ts` 与现有 Color Pin provider / HUD / navigation caller 实读。
- ADOPTED（B）：`yBe / bBe / vBe` 原函数体、200×150 尺寸、视口框、遮罩、选择色、拖动 spring 120/18/1 → `lcos/ui/donor/tapnow-minimap.mjs`；`course-api-base-url-qS4rKGhC.css::{minimap-node-transition,minimap-node-highlight,minimapNodePulse}` 原300ms变色 / 1.5s选中脉冲 → 同目录 `tapnow-minimap.css` → `navigation/TapnowMiniMap` → `LcosSpatialNavigator` → 原 Huabu React Flow context。绝对坐标读既有 canvas-engine helper；外侧快速点击适配至同一 `setViewport` 的 300ms 原生动画，避免原活动标志提前关闭；指针未捕获时不调用 release。没有第二相机、节点数据或 selection owner。
- ADOPTED（B）：`Jc / Lie / kM / Bie / Gie / m7 / g7 / y7 / x7` 原 body → `ui/donor/tapnow-pin-parts.mjs` → `pin/TapnowPinPresentation` → `ColorPinHud / NodeColorPinMarkers / LcosNavigatorIslandView`。六色、24px hit / 18px 色点、26px 多色 Pin、320ms 原 WAAPI 弹跳、28×20 group chip 与原成员菜单均进生产调用。旧实际颜色通过 palette 读取保留；成员行传 canonical membership id 给原移除接口；原 Common Tooltip / DropdownMenu / Modal 承担机械与焦点归还。
- ADOPTED（B）：`jF` 原 rgba(22,22,22,.82) / .5px border / 40px blur / inset highlight / shadow → `tapnow-navigation.css / tapnow-pin.css / tapnow-assistant.css` → 原 Rail / Navigator / Pin / NativeWorkspace window；三现场按钮仍为原 Rare UI 与 M2 材质。
- ADOPTED（A/B）：原 `PreviewWorkspacePanel` 通过 `NativeWorkspaceBody` 挂进既有 `ProfessionalWindowStage`，继续原 session / thread / 模型选择 / Agent / 输入 / 工具 / stream / Stop / 权限链。补齐原 `external/agentlet/packages/local/dist/index.js` 构建并给现有 server resolver 指定实际入口，daemon 已在线。
- VISUAL_SOURCE：用户指定本地 TapNow 原 GUI + 自有 M2 光波；本轮不改用 Figma 推断。编排适配只连接 Huabu runtime、Core memberships 与现有 HUD/window owner。
- RETIRED：生产 Navigator 中原 MiniMap 克隆呈现；原三个 Figma Pin 色点、旧 flag marker、旧 HUD 大成员列表、旧更多组 flag 行。移除 JSX 后接原组件，没有用遮罩 / display:none 伪造退役。原相机命令、canonical assign/remove、Focus/Where、跨现场定位、Core-bound 编辑限制保留。
- VERIFIED：17 suites / 117 tests、最终生产 build 通过。真实开发入口 Main（e2e 材料，真实 Core/Huabu 服务）验证了小地图外侧点击 / 视口拖动、原多色 Pin + 旧色、六色真实 POST/DELETE、reload 持久、overflow 原组菜单、原组成员移出、小地图 canonical 颜色高亮、390px 与 Esc 焦点归还。验证新增的两项 membership 已通过原接口清理，旧成员与内容保留；未发生成任务。证据在 `E:/TRAE项目/LCOS0.1收口/output/gui-native-adoption_20261011/`。
- UNRESOLVED：真实 native Agent 只读请求已到服务，但当前 e2e 模型凭据包含无效请求头字符，原 SDK 报 ByteString；没有取得模型答复或模型工具调用 receipt。组名更改与整组下载呈现保留但 disabled，现有 Core 缺对应 action；不能算功能接通。云端 Chat 原件仍未读取，整套 LCOS/内容阅读/库组件的总验收不在本条完成声明内。本轮本地源码与证据打包，没有自动推送。

## 2026-10-13 · 首次原生材料点取与输入生命周期

- READ_SOURCE：原 lcosRecognizers／snapshotCanvasDropNodes、resolveNativeMaterialSources／registerNativeMaterialSources、claimProjectText、snapshotDraftReference／referenceController、原 lcosReferenceState、LcosComposerHost／lcosShellStore、referencePickOwnerKey。
- ADOPTED：有效 Ctrl／Cmd／显式点取 pointerup → prepareNativeReferencePick → 已有文本／图片源认领 → 原精确 View／revision 引用 owner；临时 input operations → 原 canSubmit／即时 submit／原 finally；按同一输入点取次序交付，不同输入分别排队，无占位材料和新持久身份。
- VISUAL_SOURCE：现有浅色界面，准备阶段短提示与原发送 disabled；不新增内部机制按钮，不隐藏真实不支持和失败。
- RETIRED：未登记原生材料必须先拖一次的缺口；准备引用时抢先发送、按网络速度乱序、取消后文本焦点回抢。原选择／Ctrl拖动／Shift／编辑控件／不支持类型反馈／保存结果均保留。
- VERIFIED：8 前端文件 90 项通过；新增点取13项、文本owner4项、Host输入owner7项包含其中。原 Canvas 实际 Ctrl 手势到生产认领controller、原 SDK、原 Composer，3来源3写请求，第二次Ctrl撤销无重导入，原节点／选择／目标不变、0 JS运行异常。HTTP回执与结构保存为明确样例；完整前端类型检查通过；新改代码规范检查通过；未挂整页writer／用户服务。
- UNRESOLVED：用户整页第一次松手／刷新／三个现场仍在 D01-C／D01-V；D02Collection误查Scope与发送聚合、D03来源引用、D04非文本读取、模型／语音与总 GUI 审查继续施工。不因撤披露、改文字或本轮局部验证宣称完善。