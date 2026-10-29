# Saved Context 原界面接入批次

## 短计划（Yellow）

- Goal：原 Agent 入口打开既有 ContextAtlasStage，原画布图文选区加入真实 Saved Context，Core逐项回执、重复already-member与重新打开后成员可读；继续完整接入目标，不把本专项替代Workflow/真实执行回投。
- Files：lab新增SavedContext焦点摘要动作/精确source transform/Atlas宿主与局部身份判定，Root维护native-agent-ui挂载、统一source transforms、翻译索引；scripts新增target/浏览器测试。copied lcos/reference与原OS工作区只读。
- Before / After：已有窄引用port与Core测试，缺SavedContext GUI；新caller复用成熟Atlas与原Canvas实时选区，沿用现有Assembly写Presentation membership，不把Conversation关系或三现场Scope当同一对象。
- Contract：复用Warehouse context entityRef、Core graph Scope(kind=context)、AssemblyApply与Presentation成员；不新增领域schema、hash、冻结contract、baseline或gate。
- Tests：精确源路径/接缝漂移/幂等/原件不变，实际native React bundle，定向真实Core测试；原Agent按钮→Atlas卡片→一次apply→重复apply→关闭/重开/刷新→Core成员与原画布身份/正文/几何对照。
- Risk：只挂Atlas leaf，不挂含第二Canvas的ContextWorksite；保持原React/Router/Flow/presence。只承接已有canonical context，尚不声称新建/删除SavedContext或任意Workflow执行。错误/部分提交保留原回执，不自动重发、不猜ID。
- Rollback：移除实验注册并重建native UI；保留已加入成员和证据，不清理Core库。backend未改不重启服务；确需重启也先核health/PID/CommandLine。

## 原件与接缝

采用本地只读donor：`lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx`，只在其`lcos-atlas-focus-summary`追加已有选区→Core引用动作，保留卡片原44px `action` slot的拿取/进入/定位；使用`ui/context/ContextAtlasView.tsx`的原布局、动画、关闭和焦点。不新增列表picker或常驻HUD。

本批是用户明确授权的独立TapNow实验，使用既有LCOS leaf作donor，不执行copied LCOS旧Wave整机重构卡，也不修改该donor源文件。当前原Canvas/选区/相机/history owner保持。

## 执行前实况

原完整接入服务17881 / PID32340，launcher session50053，`.runtime/live-full-integration`；3现场、Core连接、云端断开、fullScopeComplete=false。上轮正文历史实测Core8个版本，同NodeID/Artifact/View和另8节点不动。本轮不能重建fixture或覆盖这些材料。

## 实际结果

已部署到17881，当前服务PID3232 / launcher session43333，保留`.runtime/live-full-integration`。只停止重新核验过的旧PID32340；部署前后Core graph、Presentation、三现场原DTO和第8版正文六项读取完全一致。随后UI-only重建没有重启Core。

### 已实跑的原界面链

原Workflow图片+文字真实鼠标选区 → 原Agent按钮 →「已保存上下文」→ 原Atlas卡片 →「加入当前选区」。第一笔Assembly两项`applied/presentation-membership`，各有Core ChangeSet；第二次明确点击两项`skipped/already-member`，Presentation版本仍为2，无新成员或ChangeSet。唯一写入的是现有Assembly路由，不复制文件、不创建材料或画布。

目标：`presentation:context:scope-surface-core-context`。精确成员为`view-c138001e-3ab0-4022-98d5-299909d2af8d`与`view-text-e1ed4f1b-3d3c-49c5-9ca9-07d774c55dd4`。

首次写入证据：`.runtime/native-saved-context/2026-10-14T02-29-10-697Z.json`。其中两次真实写入、逐项UI回执和三现场/材料核对通过，但整个报告保留false：脚本把原header与backdrop两个同名关闭按钮误认成重复控件。没有清库或重放写入。

后续改用只读恢复模式，准确选择原header关闭。最新`.runtime/native-saved-context/2026-10-14T02-39-51-098Z.json`为PASS：关闭重开、真实reload、同两成员读回，以及原卡片「进入」→原Router→Core canonical Context现场均成功；0业务写入、单ReactFlow、Atlas退出、pageErrors=0。三现场节点数仍5/9/3，16个材料投影的引用、正文、Revision列表和FileRecord原字节不变，Presentation保持版本2。

Gen1分支测试随后单独创建一个文本，当前三现场为5/10/3。新增后的只读回归`.runtime/native-saved-context/2026-10-14T02-46-41-284Z.json`再次PASS：现17个材料投影完整核对，SavedContext同两成员/版本2，原卡片导航、关闭重开/reload均保持，0业务写入、pageErrors=0。上述5/9/3是成员写入专项当时的计数，不是后续运行状态。

### 可读性修复与测量

实际截图暴露Atlas未接完整LCOS语义tokens、custom按钮无成熟face和选中文件夹展开时遮住成员。仅在LCOS局部host恢复现有tokens、复用原Oreo按钮与现有原生关闭动作；按RareFolder的`-180 * .65`展开幅度留出空间，不裁剪/缩放文件夹、不改全局主题或原Canvas。

真实读回测得按钮热区44px、成员行15px且不重叠；摘要底415px，文件夹最上视觉边459.34px，已不遮挡成员。1440×1000 Chrome截图已由Root查看，未测移动端与大批成员。

### 定向检查

- `node --experimental-strip-types scripts/native-saved-context-owner.test.mjs`：身份/代际实际纯函数用例通过。
- `node scripts/native-saved-context-workspaces.test.mjs`：canonical Workspace映射、同Scope多现场、缺Canvas/foreign拒绝通过。
- `node scripts/native-saved-context-transform.test.mjs`：原件字节不变、原卡片action不变、精确AST接缝/临时native React bundle通过。
- `node scripts/agent-node-transform.test.mjs`：实际统一source registry构建通过，仍原React/Router/Canvas root。
- `node scripts/native-canvas-presentation.test.mjs`：真实隔离Core/Huabu十四项通过；不作为GUI证据。
- 严格Huabu TS配置下action/owner两个改动文件无诊断；隔离依赖闭包另有144条非owned依赖/资产诊断，不声称全仓typecheck通过。
- `.runtime/native-gen1-text/2026-10-14T02-36-31-534Z-load.json`：UI重建后的原文本选择/编辑器打开/取消/reload只读回归通过，0目标batch，同233字节第8版正文。

Browser插件缺席，复用已安装playwright-core和fresh Chrome，未新增依赖。后台platform/config与canvas/plugins 501、Statsig/遥测/Agent suggestions阻断照实保留，不称全产品零网络错误。成员加入后发生的失败均切只读恢复，未自动重试写入。

### 安全复看

已有两成员，不能再跑要求空Presentation的首次写入模式。复看命令：

```powershell
node scripts/native-saved-context-browser.mjs --deployed --read-only-existing-members
```

截图：`E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-saved-context-2026-10-14T02-39-51-098Z-read-only-reload-confirmed.png`。

仍未完成：SavedContext新建/移除/复杂成员与更多现场；真实GUI延迟请求切现场竞态尚未专测（纯函数已测）；Workflow方法/Composer/Run/Review与真实产物回投。完整接入目标保持active。

## 本次继续施工

复核发现异步preview期间切换现场或更换原Canvas API，旧动作可能继续提交或显示在新现场。修复沿用现有action generation与点击时的project/canvasId/rfInstance精确身份；已提交的Core结果不撤回、不自动重试。只读成员刷新也不能覆盖较新的目标。

测试脚本同步遵守原DTO的`connections`字段；额外ArtifactView文本按Core graph→Revision→FileRecord读原字节，不借仅允许primary Artifact的canvas-text入口。部署前后比较三现场、Core graph、Presentation与当前第8版正文，不重建fixture。实际浏览器允许两次明确的成员加入点击，其它业务写入保持拦截。
