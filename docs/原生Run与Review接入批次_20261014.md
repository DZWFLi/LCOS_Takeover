# 原生 Run 与 Review 接入批次

## 短计划（Yellow）

- Goal：继续完整夺舍目标，从原画布会话/Work View的合法接收者进入原Composer，取用现有Workflow方法与精确材料引用，显式提交一次canonical Run journal，再打开已有RunWorkViewBody/Review核对。登记任务不等于执行任务；最终执行与产物回投仍属完整目标。
- Files：实验scripts新增一次Run登记/只读恢复浏览器验收；必要时lab做最小现有producer转译，Root管理组合入口、真实同项目所有权和登记。copied lcos/reference只读，不改原OS/安装/数据库/账户。
- Before / After：真实runtime为17881 / PID21128，Providers全offline，已有一个明确linked的人工导入会话，Runs为0；Workflow方法version0、SavedContext version2、三现场5/10/3节点。现有Core canDelegate明确允许登记Run；原ConversationWorkView已有“委托新任务”，不需要伪造Provider ready。
- Contract：沿用ConnectedConversation → 原ComposerTarget/orderedReferences → CoreCollaborationClient.delegate → 原POST /projects/:id/runs；Core拥有Run/manifest/recipe，原ProfessionalWindowStage拥有窗口。不开dispatch/sync/recover/Provider，不绕接收者绑定、Core CAS或既有Accept保护。
- 后续已有Review producer窄接：精确ArtifactReturn accept/reject/retry及Run cancel/input-request，仅同项目Return父Run/Run可达；accept原expectedBaseRevisionId、reject不改Current、retry只新建待派发任务均由原Core负责。此处只接路由，不改变上述语义、不新增数据库或自定义执行逻辑；临时人工fixture只验证真实Core协议，不能称模型结果。
- Tests：先读真实capability与原入口；原Glyth→原WorkView→委托→方法卡取用→单Composer→一次POST→查看任务→原Review/recipe；三现场/材料/Presentation不变，Run仅按Core原语义新增一次created/planned；关闭重开及刷新只读回验。遇到未知提交结果先读回，不重复提交。
- Risk：同一份Composer可能由原会话窗口与浮层竞争；原窗口owner应抑制重复浮层。Provider离线不意味着journal提交失败，不能清空旧草稿或新增fake receiver去点亮按钮。若真实执行需要新跨系统配置/权限，保持未执行，继续其他已授权接入；不把人工结果称模型产物。
- Rollback：撤回实验入口/变换或只重建UI；已提交Run、方法、材料和失败报告原样保留，不删数据迎合测试。后端部署前重新核health/CIM，只有已确认第三工作区PID可停。

## 本轮执行前证据

前一目标轮判定为progress：真实保存Workflow方法、修复成熟浮层误读第二XYFlow Context，并实测方法卡→唯一Composer→重开防重→跨现场→刷新再取用；没有Run或执行请求。

本轮再次读health：`original-tapnow-full-integration-in-progress`、Core已连、厂商云断开、fullScopeComplete=false。`/runtime/providers`两Provider及auto均offline；真实会话人工历史label不改。完整范围仍以 `docs/完整接入执行计划_20261014.md` 为准。

## 实际结果

本轮是 progress，不是完整接入完成。已由真实画布会话入口登记一次 Core Run，原 LCOS Review 可读，关闭重开与真实刷新补证通过；模型执行与产物回投仍未完成。

### 已实际走过的用户路径

TapNow Workflow 画布上的 LCOS 会话节点 → 原 LCOS Conversation Work View →「委托新任务」→ 原方法卡读取 Core 方法 → 唯一 inline Composer → 一次「提交」→ Core 201 回执 →「查看任务」→ 原 RunWorkViewBody / Review。

这里“原 Composer / Review / 方法卡”指复用 LCOS 已有组件，不是声称它们来自 TapNow。TapNow 提供现有画布与交互底座，LCOS 提供工作系统。

唯一新增任务：`run-0ee630d0-a744-4f60-8b5d-ce25aa720e14`。保持 `created / planned`、attemptCount 0、无 RuntimeBinding、无 Return；没有点击执行、派发、sync、recover 或 Provider。指令包含保存方法的 Presentation version 0，唯一文字引用精确绑定原 Artifact 与 Revision。任意 DAG 调度不在本轮通过范围内。

### 失败、修复和恢复证据

| 报告（均在 `.runtime/native-run-review/`） | 真实结果 |
| --- | --- |
| `2026-10-14T03-53-20-092Z.json` | 测试误把原 wire 省略的默认 full mode 当必填；传输侧在提交到 Core 前拒绝，0 笔准入写入。按原 parser/caller 修正测试，不改产品请求。 |
| `2026-10-14T03-55-31-059Z.json` | 唯一一次真实 POST 获 201；原 Review 及 Recipe 读取成功。随后重开任务按钮被专业窗口截获，整轮仍为失败。任务保留，不删除、不再次创建。 |
| `2026-10-14T04-00-30-287Z.json` | Agent 面板移到同一 React tree 的 body portal 后，只读打开同一任务、关闭重开、真实 reload 再打开均 PASS；0 笔业务写入。 |

层级修复没有另建 root 或 Canvas：原专业窗口在 z40，Agent 面板保留受控开关及关闭回调，body portal z50 让按钮能真实命中。没有 force click。

首次Run批次部署只停止了经health+CIM CommandLine共同确认的旧实验PID21128，当时服务为 `127.0.0.1:17881` / PID3280，profile `original-tapnow-full-integration-in-progress`，`fullScopeComplete=false`；最新PID见下方续批。该批次UI-only rebuild未重启Core或空间runtime；实际前后读取的Graph、全部Presentation、Run journal、三现场Canvas与10份去重当前FileRecord字节完全相同。

### 代码与后端验证

- `lab/pilot/native-run-list.tsx`：只读原 Core Run 列表；拒绝错项目、错 dispatch、重复身份和跨 Canvas/API 生命周期的旧回执；通过原 Shell 打开原 Review，不另建任务 store。
- `lab/pilot/native-agent-ui.tsx`：挂上述列表，并修正受控面板 portal 的真实点击层级；原 Work View / Composer owner 保留。
- `lab/pilot/core-protocol-router.ts`、`surface-core-facade.ts`：仅接精确 Return accept/reject/retry 和 Run cancel/input-request。Return 必须经父 Run 确认为当前项目；callback 缺失或异常 503、外项目/未知 404。原 Accept CAS、reject / retry 语义不改，不开放 dispatch/sync/recover。
- `scripts/native-run-review-protocol.test.mjs`：真实临时 Core，使用原 repository producer 手工构造 fixture。stale Accept 不改 Current、正确 Accept、Reject 保留 Draft、Retry 仅新建 created/planned、外项目拒绝均通过。它没有 RuntimeApplicationService，cancel/input/list 只比较原 unavailable 响应，不能算运行时动作成功；fixture 不是模型产物。
- `scripts/agent-node-transform.test.mjs`：统一 native UI 构建通过，单 ReactFlow、同 React runtime、原 Router / Work View / Composer 入口保留。
- `scripts/native-history-create-measurement-replay.test.mjs`：旧版无网络VM执行原O8、回执与debounce，但曾把wire measured人工写成node.width/height，因此只证明显式宽高变化会增加frame，不能证明自动测量是那次Undo原因。续批修正模型并执行原ReactFlow Ux/Fb：纯自动测量仅改measured，O8比较器忽略它，撤回此前“自动尺寸帧导致”的归因。旧报告无私有栈，尚未修复或重做live分支；修正证据见文末。

### 尚待选择和未完成边界

选中的 canonical 接收者属于 Codex，但原 Composer 未传 requestedProvider，Core 原默认执行 Provider 为 WorkBuddy；Recipe 保留 Codex 接收者，Run.provider 为 workbuddy。已向用户异步询问“跟随所选 Agent”或“会话归属与执行端独立选择”，尚无回答；未静默选择，也未修改已有任务。执行次数仍为 0。

Return 决策的后端协议通过，不等于接受产物后会投回画布。当前实验 RuntimeReviewService 构造尚未接齐正式 compose 中的 semantic / resultSlots / mutationSafety owner；应复用原组合，不另写真值。真实执行配置、WaitingInput、产物接收/采纳/回画布、复杂历史及完整目标清单继续保留。

### GUI QA（本批任务链）

环境：`http://127.0.0.1:17881/canvas/surface-core-workflow`，已安装 Chrome，fresh profile，1440×1000，service worker 禁用。Browser plugin not available，使用仓库现有 Playwright；不装依赖，外部 HTTP / 全部 WebSocket 阻断。

| 检查 | 证据 / 限制 |
| --- | --- |
| 页面身份 | 原 Workflow URL/title、canonical Canvas/API、单 ReactFlow 通过。 |
| 非空页面 | 原图文画布、真实方法指令与材料引用、RunWorkViewBody 可见。 |
| 错误覆盖层 | 截图未见框架错误覆盖层；pageErrors 0。 |
| 控制台 | config/plugins 的 501 与离线遥测阻断完整保留；该补证未见其他相关异常，不宣称全局零错。 |
| 视觉 | Root 查看窗口挡按钮的失败图与 reload 后 Review 图；实验 badge 与窗口重叠仍是视觉债务。 |
| 交互 | 原会话委托、方法取用、唯一提交、查看任务、原列表重开、真实刷新重开均有实际证据；没有执行按钮操作。 |

仍未测移动视口、其他浏览器、所有全局 modal 与复杂拖放组合。截图在现有 visualization 目录，未放厂商原件或账户数据。LCOS 技能约束唯一 Core owner 与真实回执；前端/React 技能要求原界面点击、同 runtime、源码接缝最小化，不以 build 替代 GUI。

```powershell
node scripts/native-run-review-protocol.test.mjs
node scripts/agent-node-transform.test.mjs
node scripts/native-history-create-measurement-replay.test.mjs
node scripts/start-full-integration.mjs --build-ui-only
node scripts/native-run-review-browser.mjs --deployed --existing-run-id=run-0ee630d0-a744-4f60-8b5d-ce25aa720e14
node scripts/native-workflow-browser.mjs --deployed
node scripts/native-saved-context-browser.mjs --deployed --read-only-existing-members
```

不要重跑 `--allow-one-run-create`；已提交任务保留，仅用 existing-run-id 只读恢复。需要更便捷的应用内调试可安装 Browser 插件，本批没有进行安装或扩权。

### 补充回归与最小修复范围

Run 列表重开通过后，增加 Saved Context / Workflow 只读回归。Saved Context 通过；Workflow 在首次取用、防重成功后，原浮动 Composer 截获“收回手牌”的点击，报告 `2026-10-14T04-05-44-430Z.json` 保留失败。Root 已查看失败截图。修复仅限实验构建接缝：利用现有 CanvasFloatingPopover 的 style 扩展口，把 Composer 接回原 overlayLayers.composer；Workflow 的现有 portal host 使用 overlayLayers.workView 堆叠上下文。保留原手牌、浮层定位、焦点、modal、拖放、草稿和所有权逻辑，不修改只读 donor、不强制点击或清空草稿。

实际修复与复验：`lab/native-ui-source-transforms.mjs` 只给原 Composer 添加现有 style prop（composer=40），`lab/pilot/native-workflow-host.tsx` 只在原 portal wrapper 使用 workView=50；内部手牌 stage34 不改。扩展后的 `agent-node-transform.test.mjs` 验证精确 diff、重复变换稳定、源码不匹配时拒绝部分改写、donor 文件仍逐字节不变，并完成统一构建。UI-only rebuild 未重启 PID3280。

| 修复后只读报告 | 真实通过路径 |
| --- | --- |
| `.runtime/native-workflow-browser/2026-10-14T04-11-40-609Z.json` | 原入口→方法预览→唯一草稿→重开防重→实际点击收回→原卡进入Workflow→真实刷新→Core方法再取用，6 case通过。草稿刷新仍实际清空，未伪称持久化。 |
| `.runtime/native-saved-context/2026-10-14T04-11-40-643Z.json` | 原Atlas关闭重开→真实刷新读回version2及原两成员→原卡进入Context；0 Assembly POST。 |
| `.runtime/native-run-review/2026-10-14T04-11-40-607Z.json` | 原Agent已有任务入口→同一原Review→关闭重开→真实刷新后重开；0准入写入，仍created/planned、attempts0。 |

三链执行前后及UI构建前后的只读精确比较通过：Graph、全部Presentation、唯一Run、三Canvas（5/10/3节点）和10份当前去重FileRecord字节完全一致。三份报告pageErrors均为0；Workflow保留8次501、SavedContext5次、Review4次；控制台其余记录为已保留的离线阻断/Statsig/CSP，额外相关错误未见，不删失败记录或声称全局无错。Root已亲看修复后手牌与刷新后Review截图。

子代理静态复核确认原Assembly carry的pointer-through和Composer全局modal隐藏逻辑未改；本批没有动态验收所有modal/复杂拖放。额外发现既有KeyboardShortcuts modal与hand同时打开时Escape监听顺序可能竞争，未复现/修复，不算本diff已解决。

### 截图

修复后手牌重开与原方法卡防重；随后真实点击收回成功。第二张是刷新后重新打开唯一待派发任务，没有模型产物。

![方法卡与唯一草稿重开](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-workflow-2026-10-14T04-11-40-609Z-duplicate-prevention.png)
![刷新后原Review](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-run-2026-10-14T04-11-40-607Z-reload-core-run.png)

## 续批短计划：让正式 Core Review 组合接手

- 前轮分类：progress，已修复实际层级问题并完成三条只读 GUI 回归；完整目标不缩减。
- Goal：沿用原 Accept 事务和结果身份，查明实验 Review 覆盖是否漏掉正式组合的索引/ResultSlot 变更记账，并在隔离临时 Core 中真实验证。
- Files：lab/pilot/runtime-composition.ts、原协议router/facade的结果位窄入口、隔离启动器与对应scripts测试/本批文档。lcos/reference及旧工作区只读。
- Before / After：续批开始时17881/PID3280，唯一任务created/planned未执行。新读源码确认 repository.acceptArtifactReturn 已在同一事务内 materialize ResultSlot（5745—5895），不能把“缺可选Review依赖”误述为槽位完全不会物化。候选改动仅不再向server覆盖裸Review，让原compose创建带semantic/resultSlots/mutationSafety的Review；Application内部只读取同repository的RunReview，不另建真值或重写Accept。
- Contract：HTTP envelope、Accept CAS/事务、原ResultSlot/View/Workspace规则不变。Run接收者与执行Provider选择继续待用户决定，不自动派发。
- Tests：先用实际实验组合＋临时Core量出人工Return接受后的槽位与ChangeSet；修复后原HTTP stale/合法/重复Accept、精确版本/位置、其他材料不变和关闭重开。只允许人工fixture，明确不算模型执行或原GUI回投通过。
- Risk：不能预先再compose一套服务形成第二event hub/owner；不能为补测试直接写SQLite、偷补Current、伪造binding或改既有任务。原Registry/provider隔离、路径与CAS保护保持。
- Rollback：可撤回实验组合接线；所有已存在live材料、任务、失败报告保留。部署前后只读精确比较，停止服务前重新核health与CIM CommandLine；若没有部署，不把临时测试称live通过。

新增窄入口仅接原 ResultSlot list/create/read 与 execution-projection，使用原 scope/精确 workspace-scope/slot ownership 核对，不开放删除或派发；给后续原结果位 consumer 使用。原索引器会延迟调用默认 Ollama `/api/embed`，所以隔离启动器在子进程显式设 `LCOS_OLLAMA_URL=http://127.0.0.1:1`，阻止触达用户11434模型服务；本地FTS可用不等于向量/模型可用。临时测试只准它自己的动态Core origin，其他fetch均明确拒绝，保留尝试证据。

### 修改前实测

`node scripts/native-review-result-slot.test.mjs --expect-unwired` 已在原实验组合通过，报告 `.runtime/native-review-result-slot/2026-10-14T04-28-22-002Z.json`。原HTTP创建slot/Run各201，人工Return的旧CAS409/合法Accept200/重复Accept409；slot、accepted View/Revision、精确位置318.25/227.75与321×207尺寸、唯一目标Workspace聚焦和关闭重开同身份均通过；Accept没有新增ChangeSet（0），不是槽位没有物化。第一轮材料断言误把人工Artifact的合法Current/birthRunId变化当成意外，失败报告保留，未据此改Core。

Root随后仅移除coreServerOptions.runtimeReviewService覆盖，让正式compose负责HTTP Review writer；Application仍持同repository的无状态读者，实验返回面只暴露runtimeReviewReader.getRunReview，没有另建DB、真值、event hub或factory。

### 修改后与部署证据

`node scripts/native-review-result-slot.test.mjs` 默认模式已通过7条真实临时Core场景，最终报告 `.runtime/native-review-result-slot/2026-10-14T04-30-07-578Z.json`：旧CAS409、合法接受200、重复接受409；精确一笔原`result_slot_materialize` ChangeSet；原本地FTS实际搜索命中人工Markdown正文，并读到2个chunk；关闭重开仍同Run/slot/Artifact/View/Revision/Workspace。Root补上FTS未出现必须失败的断言，未把超时状态当PASS。唯一embedding尝试为`127.0.0.1:1/api/embed`，在测试fetch层拒绝，没有向量或模型产出；无dispatch/RuntimeBinding或任务Provider执行。

`native-result-slot-protocol.test.mjs`由Root复跑通过：真实Core原DTO/envelope/JSON状态保留，错scope、错workspace-scope、错slot、缺失/异常owner均在转发前拒绝；DELETE与spatial写入仍未注册。`runtime-composition.test.mjs`与`full-core-facade.test.mjs`（16项）由Root复跑通过。后者只在独立合成库；runtime旧回归中的显式offline dispatch仍只记录被拒的桥尝试，不能当live执行。

实际部署只停止重新核health及CIM完整CommandLine的旧PID3280，使用现有启动器`--reuse-native-ui`重建后端并保留同一UI。最新服务PID49552，launcher session65975；只绑定127.0.0.1:17881、Core已连、厂商云断开、fullScopeComplete=false。live原ResultSlots列表为空，execution-projection恰好仍为唯一原Run、零slot；没有把人工fixture放进live。部署前后及以下三GUI测试之后，Graph/全部Presentation/Run/三Canvas/10份当前FileRecord字节精确一致，三现场节点5/10/3，原待执行Run保持attempts0。

| 新部署只读GUI报告 | 结果 |
| --- | --- |
| `.runtime/native-workflow-browser/2026-10-14T04-31-24-185Z.json` | 方法预览/取用/重开防重/实际收回/跨现场/真实刷新后再取用，6 case PASS。 |
| `.runtime/native-saved-context/2026-10-14T04-31-24-198Z.json` | 原两成员、version2、关闭重开/真实刷新/原卡进入Context PASS，0业务写入。 |
| `.runtime/native-run-review/2026-10-14T04-31-24-209Z.json` | 原列表打开同任务/关闭重开/刷新再打开 PASS，0业务写入、无binding/returns。 |

GUI环境仍为已安装Chrome、1440×1000、fresh profile、service worker与外网/WS阻断。Browser plugin not available，按前端测试技能用现有Playwright，npx已确认，无依赖安装。

| QA检查 | 本续批证据 |
| --- | --- |
| 页面身份 | 原Context/Workflow URL/title和canonical Canvas/API通过，单ReactFlow。 |
| 非空 | 原图文、方法指令/精确引用、Review正文正常显示。 |
| 错误覆盖层 | 三测试pageErrors0，截图无框架错误覆盖层。 |
| 控制台 | Workflow8次501、SavedContext5次、Review4次仍留证；其他为离线阻断/Statsig/CSP，额外相关error未见，不称全局零错。 |
| 截图 | Root亲看新部署方法再取用与刷新后Review；后者显示等待派发，不是执行结果。 |
| 交互与数据 | 上述原DOM点击、真实reload和精确前后读回通过；未点击执行或GUI接受产物。 |

### 历史重放纠正

Root已复跑修正后的`native-history-create-measurement-replay.test.mjs`：实际提取执行原ReactFlow Ux/Fb，纯自动测量只更新measured，原O8仍index1/history2，Undo指向原create operationId；原NodeResizer jE onChange/onEnd带显式宽高，O8增独立frame至index2/history3，Undo只恢复尺寸并保留节点。旧wire measured→width/height模型保留但明确标成counterfactual，不能拿它证明历史失败由自动测量导致。旧浏览器页无私有frame快照，真实失败仍需在受控复现中观察原entry，不加推测性合并。

### 下一执行项与界限

Core接受、结果位绑定、记账、FTS已在人工临时fixture中通过；本次没有模型执行或原GUI产物采纳证据。下一段要复用原`reconcileExecutionProjection`、Core的`materializeResultSlotBinding`和原Huabu executor，使同一slot carrier提升为Artifact，而不是复制新节点。还须适配native Run/Slot呈现、接受后精确explicit_additional View/Revision回读，以及现有生命周期只认唯一primary View的接缝；这些不能靠backend PASS抹掉。没有slot的create Run自动落哪里仍是产品选择，不擅自补槽或默认位置。执行Provider选择、WaitingInput和完整工作清单保持未完成。

```powershell
node scripts/native-review-result-slot.test.mjs
node scripts/native-result-slot-protocol.test.mjs
node scripts/runtime-composition.test.mjs
node scripts/full-core-facade.test.mjs
node scripts/native-history-create-measurement-replay.test.mjs
```

`--expect-unwired`只记录修改前诊断，不再是当前通过命令；当前组合必须有正式记账/FTS。临时新测试目录已在关闭Core/库后按绝对包含关系清理，JSON与旧失败报告保留；live runtime未清理。移动端、所有modal/复杂拖放与GUI接受回投仍未测。后续可安装Browser插件方便应用内调试，本轮未安装或扩权。

### 新部署截图

![新部署刷新后Review：仍等待派发](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-run-2026-10-14T04-31-24-209Z-reload-core-run.png)

## 续批短计划：同一结果位接成材料，不复制另一套画布

- Goal：复用原 reconcileExecutionProjection、Core 接受事务和 Huabu executor，将 Run / ResultSlot 显示到所属现场；接受后同一 spatialId 读取精确 accepted View / Revision。沿用成熟交互，新增 LCOS 能力，不重建画布。
- Files：实验 facade、原 nodeTypes 构建接缝、新 execution UI / result-material 只读适配器及隔离测试；donor lcos/reference 和原工作区不改。
- Before / After：现有 live Run 未执行、没有 slot，现场5/10/3节点。本批先在独立临时 Core + Huabu 验证；GET 不偷偷创建投影，不为既有 Run 擅自补槽，不自动派发。
- Contract：新增空体 execution:reconcile 实验入口；任务与结果状态继续由原 Core owner 提供，普通几何继续原 executor。接受材料保留 explicit_additional 身份和精确历史版本，不能冒充可写 primary。
- Tests：真实 Core HTTP 手工 fixture → 原接受 → 同节点身份提升 → 精确正文/位置/尺寸/重复收敛/关闭重开/跨现场隔离；UI 构建、实际浏览器按证据单列，不能互相顶替。
- Risk：部分投影提交必须明确回报；不借 renderer 回传修改 Core facts / binding；不新增 DB、模型执行、云请求、复制节点、默认位置或历史合并。
- Rollback：仅撤回实验适配层和构建注册。保留已有 live 材料、任务与失败报告；不修改既有运行数据作为“回滚”。完整接入目标保持进行中。

### 同节点接入实现与真实后端证据

实验 facade 已复用原 `reconcileExecutionProjection`，显式空体 `POST /api/lcos/canvases/:canvasId/execution:reconcile` 负责调用原 Core binding + Huabu projector/executor；Canvas GET 不隐式写入。目标必须是唯一 Core Workspace，部分失败明确返回409与已完成计数，不要求重提 Run。投影请求和原节点 batch 共用原串行写队列。

Run / ResultSlot 的 DTO 由原 `runPresentation` / `resultSlotPresentation` 读取真实状态；接受结果由新增只读 `native-result-material.ts` 精确解析 slot→selected ArtifactView→View.revisionId→FileRecord，已有 primary 保留旧生命周期，不能用 Current 替换历史 View。普通几何仍只写 Huabu；renderer 伪造 facts / ref / 正文返回409，整批未通过不落几何。

原 nodeTypes map 只增加 `lcos-execution` 和 `lcos-result-material` 两个叶子，没有第二 ReactFlow / Router / React root。任务复用原 ExecutionNodeBody；结果材料复用原 DocumentSourceView / ImageSourceView 与精确 revision Reader。additional View 的正文暂只读，不冒充 primary writer。TextFaces 原自动折叠清理漏查 disabled；实验构建只给该 effect 补 disabled 判断及依赖，保持真实 nodeId。实际提取 effect 的测试证明只读零写入、可编辑 primary 仍保留原清理行为；donor 不改。

Root 已亲自复跑：

| 命令 / 报告 | 已验证边界 |
| --- | --- |
| `native-execution-projection.test.mjs`，`.runtime/native-execution-projection/2026-10-14T04-55-42-267Z.json` | 18项真实临时 Core+Huabu 场景PASS。Slot→Run→手工Return→原CAS Accept→同spatialId转材料；精确View/Revision/正文；用户先前拖动/改尺寸不被旧slot位置覆盖；重复收敛与关闭重开；其他两现场/旧材料不变；GET零投影、错现场/请求拒绝、伪造数据409且无几何提交。 |
| `native-result-material.test.mjs` | 9项只读解析场景PASS：历史View不随Current漂移、跨项目/跨现场/多slot歧义拒绝、唯一Main、primary交回旧生命周期，调用前后Core不变。 |
| `agent-node-transform.test.mjs` | 两叶子精确注册、重复构建稳定、缺失注册拒绝、原ReactFlow仍1个；统一native UI构建与只读effect实测PASS。 |
| `full-core-facade.test.mjs` | 原16项隔离回归PASS，不等于16个完整GUI模块。 |
| `runtime-composition.test.mjs` / 两启动文件 `node --check` | 原组合与启动语法通过；该旧隔离Runtime测试自身会显式触发一次被拒离线dispatch，不是live或模型执行。 |

临时投影测试的fetch仅放行本进程真实监听的Core origin；固定Ollama :1只记录并直接拒绝，不发请求。所有人工材料明确不算模型产出，无RuntimeBinding。测试新runtime在关闭后按绝对包含关系清理，旧失败报告保留。

官方启动器新增受限 `--runtime-label=isolated-*`，仅创建本工作区 `.runtime` 子目录，拒绝路径/其他保留标签，已有目标还检查realpath。供GUI独立实例验证；默认17881/live-full-integration不变。本批尚未部署live，17881/PID49552仍前批版本。Root只读回读与前批部署后快照逐项完全一致：三Canvas5/10/3、唯一Run created/attempts0、10份当前文件字节未变。

GUI目标流为：隔离Workflow原画布→原任务/结果位→双击原Run Review→手工测试产物采纳→同位材料与精确版本Reader。真实界面验证单列补充；上述后端/构建结果不能替代它。自动事件刷新、原画布无硬刷新地重新读取投影、真实执行/WaitingInput、图片结果回读、additional View后续编辑与完整历史仍未完成。

### 代码审查补出的真实版本问题

最初只读解析测试把“同scope有Primary就交回旧生命周期”当成正确预期，审查找出反例：该Primary尚未绑定本Canvas，但接受已让本slot carrier提升成Artifact并精确聚焦additional View。原early-return会把结果误投成Current-following文本。测试已先真实复现失败，再修helper：以Core保留的result-slot binding识别existing-artifact路径；提升路径尊重Workspace精确selected View；同scope Primary不再足以覆盖accepted View。若两者均未选择则409，只有明确选择唯一Primary才走旧Current路径。初版9案例不代表覆盖此反例；新增真实Core HTTP Accept、promotion、保留primary与选择歧义验证另列最新结果。

投影18项在修复后由Root再次实跑PASS，报告更新为 `.runtime/native-execution-projection/2026-10-14T05-10-57-554Z.json`。真实UI已运行到slot可用态、双击原Review、Enter重开（`2026-10-14T05-06-33-303Z.json`）；该轮最后截图是异步重开中的加载态，下一轮已补等正文就绪，不把加载图当完整阅读器展示。

### 外部对话适配方向已由用户确认

用户回复：历史遗留默认执行器问题按最容易适配不同外部对话的方向处理。不再等待“跟随所选Agent／独立选择”二选一；采用会话身份与执行端解耦、按能力注册适配、未知明确unsupported的方向。既有live Run不修改、不重提、不派发。

只读源码核查确认：当前Run/Bridge具体执行端仍只有codex/workbuddy，auto是选择模式；现有RuntimeAdapterRegistry选择的是intent×格式，不是通用provider注册表。Conversation Receiver也限两种；已有ContinuationProviderAdapterV1可作续接能力边界，但当前装配只有一个可选Huabu adapter，不是所有外部对话已通用接入。后续要分别扩展会话续接adapter解析和Run执行选择，先接真实provider再扩有限类型，不让UI用万能字符串或把未知provider偷映成Codex/WorkBuddy。

发现的旧默认回退点列为后续修复：composerController把未知draft provider落Codex；Core auto在无ready候选时仍落WorkBuddy。当前批不改变Core执行语义或启用外部执行。下一批应以精确匹配/不支持不调用/会话与operation provider不匹配拒绝/恢复仍使用同adapter为普通测试场景，不新增冻结contract或发布门禁。

### 自动刷新仍缺的真实接缝

RunWorkView的Accept成功目前只refresh本窗口；Core RunEvent sink又被旧active-context SSE listener存在性提前return，不能假定ProjectEventHub一定发出run.changed。现有同项目共享SSE可复用，但先要修真实发布owner。空间投影目前publish:false，不会自动推送原画布。

当前宿主是TapNow，不能调用被native-canvas-port替换掉的旧Huabu canvasStore.loadCanvas。已核原安装bundle：主页面bW私有getCanvas/send回调负责加载，非React Query；现有NodeBridge无服务端reload/refetch口。后续应在该原callback做窄接缝并保护待写入队列，不借另一个素材预览画布、不自己addNodes复制、不把page.reload称自动同步。

### 同节点原生 GUI 验收：8步通过，仍是显式投影

最终命令：`node scripts/native-execution-browser.mjs --run-isolated --phase=material`。Root亲自运行并查看采纳后同位材料与精确版本Reader截图；最终报告 `.runtime/native-execution-browser/2026-10-14T05-12-32-046Z.json`。环境为官方启动器新建 `isolated-execution-1791954752046`、`http://127.0.0.1:60209/canvas/surface-core-workflow`，fresh Chrome 1440×1000、service worker禁用、外部HTTP与全部WS阻断；Browser plugin not available，沿用现有Playwright，无安装。

真实路径：挂起实际surface map请求时结果位明确unavailable，双击/Enter不能打开旧任务 → 放行真实请求后原ExecutionNodeBody显示Core review状态 → 用原按钮关闭遮挡的Agent面板 → 双击打开原RunWorkViewBody并等本次指令正文 → 关闭后Enter重开并再次等正文 → 原“采纳”按钮仅一次POST、精确expectedBaseRevisionId、200 adopted → 显式execution:reconcile和真实page.reload → 同spatialId变为exact additional View材料 → 双击原ArtifactReaderBody，实际版本badge含精确revisionId，实际GET对应FileRecord并显示原正文。

| QA检查 | 最终真实结果 |
| --- | --- |
| 页面身份 | Workflow URL/title和canonical Canvas/API通过，单ReactFlow。 |
| 非空 / 错误覆盖层 | 原图片、文字、任务/结果位、材料和Reader可见，无框架错误覆盖层；pageErrors0。 |
| 控制台 | 保留reload前后config/plugins共4次501；其余为已记录的离线Statsig/CSP/ERR_BLOCKED。额外相关console error未见，不能称全局零错。 |
| 准入写入 | GUI仅准入1次确切人工Return Accept；显式投影是测试单独调用的真实端点，不冒充自动事件刷新。Run dispatch attempts仍0、无执行器/模型产物。 |
| 阻断记录 | 42次实验/api/events、2次原图片初始化metadata/几何batch、2次建议接口POST被阻断并留证。不是“页面完全无写请求”；没有准入正文或位置写入。 |
| 版本与位置 | carrier spatialId/位置/尺寸保持；材料为只读additional View，DOM无contenteditable/textarea。Reader读canonical revisions列表再按选定revision选择FileRecord，不存在单独revision GET。badge+精确文件出口与正文联合验证，不能以URL必须含revisionId的错误断言替代。 |
| 视觉 | 亲看发现结果leaf中间wrapper未继承高度，正文溢出原节点；只在实验leaf补100%高度/minHeight/overflow，复用原TextFaces内部滚动。复测外框与TextFaces同为442×273屏幕像素，内容留在原框内；不改Core材料或原空间尺寸。 |
| 交互 | 双击/Enter开原任务、原关闭、一次采纳、真实reload、双击原Reader均通过；没有force click、替换响应、假App state或第二画布。 |

失败报告完整保留：04-58启动谓词未规范Windows斜杠；05-01 bootstrap allowlist过早收紧；05-02测试未等Review异步正文且失败捕获误把同步page.url当Promise；05-05 Agent面板遮挡关闭按钮，改测试走其正常关闭操作，不乱加层级；05-09 Reader已正确显示，但测试误以为会请求单revision URL。05-10版本已8步通过；Root亲看后发现正文溢框，05-12版本加最小高度约束再次通过。未把这些测试错误归因于Core或偷偷删失败记录。

采纳的是手工fixture：Core Run保持未派发/attempts0，经人工Return接受后状态completed是原Review生命周期记账，不代表运行了模型。GUI本轮材料是current版本；历史View在Artifact Current后续变化时的稳定性由独立真实Core helper测试覆盖，未声称历史版本切换GUI全套通过。

最终验收版本仅在停止前重新核对health PID和CIM完整路径/label/port后逐PID停止，官方launcher随后自行退出；新合成runtime关闭后按绝对包含关系清理，JSON与截图保留。04-58首版脚本曾对已核launcher使用其进程树结束；Root审查后已改掉，后续版本不使用kill all/by-port/tree清理。17881/PID49552没有重启或部署本批。最终live读回与本批前完全一致：Graph/全部Presentation/唯一Run/三Canvas及10份当前文件字节保持，5/10/3节点、原任务created/attempts0。

当前不交付声明：自动刷新仍缺；provider扩展待接；真实执行/WaitingInput、图片产物GUI、additional View继续编辑、复杂历史/全套节点动作仍在清单。实验badge遮挡标题、材料透明背景与长标题等仍是视觉债务，移动端/其他浏览器/全部modal/复杂拖放未测。前端技能让本批补真实输入与截图，React技能保留同runtime/稳定叶子；LCOS技能约束精确owner、真实失败与隔离。后续可选装Browser插件便于应用内调试，本轮无安装或扩权。

材料helper最终由Root再次实跑12案例PASS；9次原HTTP Accept均真实FTS正文读回，并观察到9次固定`:1/api/embed`尝试在fetch层直接拒绝，其他网络只准本进程唯一Core listener，关库前异步链已收尾，无database-not-open/reindex警告。中间由repository直接Accept改为HTTP Accept时，初次测试没有同步补上Ollama固定与网络拦截，出现过关库后的索引警告；该旧轮不能证明未尝试默认本地embedding，不作“全程严格隔离”的证据。修正后最新复跑明确无默认11434访问，未将embedding失败伪装成向量可用。临时测试数据已清理，保留代码、命令与本MD记录。

本批实际改动归属：`lab/pilot/surface-core-facade.ts`（原投影组合/DTO/几何echo）；`native-result-material.ts`（只读精确材料）；`native-execution-ui.tsx`、`native-agent-ui.tsx`（原组件leaf/导出）；`lab/agent-node-transform.mjs`、`native-ui-source-transforms.mjs`（单画布注册/只读effect）；`lab/server.mjs`、`scripts/start-full-integration.mjs`（受限隔离label）；对应目标测试、GUI脚本及本批索引文档。donor `lcos/`、`reference/`、原工作区未编辑；未安装依赖、commit/push、公开厂商代码或执行付费/外部任务。目标构建与真实执行通过，不称完整静态tsc全仓通过；现有Git全未跟踪，diff --check只作格式检查，不把空diff当内容已审查。

```powershell
node scripts/native-execution-projection.test.mjs
node scripts/native-result-material.test.mjs
node scripts/agent-node-transform.test.mjs
node scripts/native-execution-browser.mjs --run-isolated --phase=execution
node scripts/native-execution-browser.mjs --run-isolated --phase=material
```

本批截图（人工fixture，不是模型产出）：

## 续批短计划：采纳后的同画布自动同步

- 前轮分类：progress；已改实际代码并完成18项投影/12项精确材料/8步原GUI证据，不以此缩减完整目标。
- Goal：Run/Review成功后自动重读同一原Canvas，保留未保存编辑、节点身份、空间几何和原历史，不让用户手工调用endpoint或page.reload。
- Files：lab构建接缝/原NodeBridge/原UI成功回调与小型同步适配、原facade投影入口、相应目标测试和本MD。copied lcos/reference仍不落盘修改。
- Before / After：现有live17881/PID49552仍前批部署、5/10/3节点、原Run attempts0。本批先在全新隔离runtime；不自动为既有Run补槽/派发。
- Contract：优先复用原持久化flush与GET/apply owner、原HostLifecycleReconciler和canonical Core事件；数据事件只作失效通知，不另存Truth。原Accept/CAS/provider语义不变。
- Tests：原源接缝精确/幂等、真实保存先于刷新、保存失败保留草稿、同Canvas/API复核、单原Flow自动显示同slot材料、无page.reload、无重复Accept/Run、窗口与相机/选择/历史保留；跨现场和关闭重开据实际结果单列。
- Risk：原私有GET props未必会更新同Canvas的controlled state；不能用第二store/addNodes克隆补救。SSE RunEvent门控需先修正确owner，不能伪装旧订阅/另建业务bus。
- Rollback：撤回实验构建与同步适配即可；既有live数据、原件和失败报告保留。不删除安全措施、不新增hash/冻结contract/baseline/gate。

![同一结果位采纳后变成只读材料，空间身份保持](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-execution-2026-10-14T05-12-32-046Z-accepted-same-carrier.png)
![原阅读器显示精确接受版本和真实FileRecord正文](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-execution-2026-10-14T05-12-32-046Z-exact-revision-reader.png)

## 续批结果：同一原画布自动回投，保存失败可显式恢复

结论：正常采纳后不再需要手工调用投影端点或刷新整页；故意让原节点保存失败时，先保留原编辑并停止同步，用户点一次“重试同步”后恢复原保存队列。它不是第二画布，也没有再造一套任务/历史真值。完整接入目标仍为 active，本节仅交付这一纵切。

### 实际接法与归属

`原 Core RunEvent → 原 ProjectEventHub / 共享项目 SSE → 原 HostLifecycleReconciler → 当前 NodeBridge → 原持久化 flush → 原执行投影 + Canvas GET → 原 O8 回填`

- Core 的旧 sink 在没有 active-context listener 时提前 return，连 canonical run.changed 也没发布。只在实验 Node 构建中对复制的 server.ts 做精确内存变换：旧 listener 可选，原 ProjectEventHub 仍发布一次。不伪造旧订阅、不预装第二套服务，lcos 源文件不落盘修改。
- TapNow 的 bW/getCanvas 更新 props，并不会重置同 Canvas bB 中由 useState 初始化的 controlled graph；因此没把重新请求假称成画面已刷新。Bridge 使用原 Unlimited chunk 的 bs→dI 转换链，把两种 canonical execution/material 节点送入已有 O8 回执，不替换普通图片/文本、不调用 addNodes 克隆、不另建 store。
- 自动同步只用原 index `ru / NUl` 的 Canvas flush。保存未确认就不发下一笔 reconcile，更不拿服务端节点覆盖原编辑。读回途中 Canvas/API/Project/Workspace 或编辑数据发生变化也拒绝回填；相机/选择由原 owner 保持。
- 只有用户明确点击“重试同步”，这一次才映到原 `rs / DUl` retry，解除原队列的失败/退避状态；后续自动事件恢复普通 flush。没有自动 retry Accept、Run 或执行器。临时传输错误没有后续事件时会保持 blocked，用户有明确恢复入口，不声称后台会无限自愈。
- O8 回填先 flush 原 1000ms history debounce，再通过 getHistory 取真正最新 x.current。已有每帧及 operation snapshot 只补同 ID 的引用/展示事实，几何/选择仍逐帧保留；新 canonical Run/Slot 进入原各帧，不生成一笔用户编辑。普通文本草稿与图片不改，接受的额外 View/Revision 不回退 Current。
- 全部空间写仍走原 Gen2Host/projector/Core binding/Huabu executor，publish:false，不写新的 RunEvent；共享 watcher 不会被自身投影自激。

实际变动：`lab/native-core-runtime-source-transform.mjs`、`lab/pilot/build-pilot.mjs`；`lab/startup-node-bridge.js`；`lab/startup-history-intent.js`、`lab/history-intent-transform.mjs`；`lab/pilot/native-execution-sync.tsx`、`native-professional-host.tsx`、`native-canvas-port.ts`；四个新目标测试与原 GUI 脚本，及本 MD/索引。没有改厂商原件或旧工作区。

### 分层验证，别把单测当 GUI

| 层级 | Root 实际复跑结果 |
| --- | --- |
| 原事件发布 | `native-core-run-events.test.mjs` PASS，报告 `.runtime/native-core-run-events/2026-10-14T05-32-36-713Z.json`。只订 canonical SSE 时真实创建未派发 Run，每笔 durable RunEvent 恰一条 run.changed；增加旧订阅后仍各一次。原 sink 无旧订阅不发布的旧行为也实际执行重现。 |
| 同步 controller | `native-execution-sync.test.mjs` 7组 PASS，fake API/listener：初次、事件合并、旧 owner/late result、失败不循环、显式恢复只携带一次 retryPendingSave、dispose。不是 GUI。 |
| Bridge 顺序与冲突 | `native-execution-bridge-sync.test.mjs` 15组 PASS，实际 factory + fake ports：先 saved 再 HTTP、失败零回填、各阶段 owner 失效、错误 Workspace/ref、在途新正文/几何、同 target 去重/异 target 拒绝、只显式 retry 原失败队列。不是实际队列或 Core。 |
| 原 O8 | `native-execution-history.test.mjs` 提取真实 O8/debounce 在 VM 执行 PASS：pending 用户帧不丢、flush 后取新 history 数组、same-ID promotion/新 canonical 节点、逐帧几何/选择/operation snapshot、普通草稿、幂等、冲突、原 Undo/Redo。零网络/零 Core 写入；不称完整历史 GUI 通过。原 history transform/diagnostics 也再次 PASS。 |
| 原生产者回归 | 18项真实 Core+Huabu projection PASS（报告 `2026-10-14T05-42-13-619Z`），12项 exact material/真实 HTTP Accept PASS，原 full facade16项、runtime composition5项、单 Flow transform/统一 UI build PASS。runtime composition自己的显式 offline dispatch仅记录临时失败尝试，未触碰live或启动provider。 |
| 正常 GUI | `--phase=automatic` 10步 PASS，最新报告 `.runtime/native-execution-browser/2026-10-14T05-46-16-501Z.json`。真实鼠标拖动→原 Review 双击/Enter→一次精确 CAS Accept→真实 SSE 自动同 ID material→原 Reader 真实文件出口/版本badge/正文。 |
| 故障恢复 GUI | `--phase=save-blocked` 12步 PASS，报告 `.runtime/native-execution-browser/2026-10-14T05-43-20-834Z.json`。原位置 batch 在测试浏览器传输层真实 abort，4次失败留证；Core Accept 仍真实200/adopted，未确认保存时无后续 projection POST、原 pending Node 全量相同。恢复传输后点原恢复按钮，经原 retry 真正保存 retained placement，再同节点 material/Reader。没有替换成功响应。 |

正常 GUI 的原 DOM document 与 ReactFlow ElementHandle 在采纳前后均保持 connected；frame-navigation计数2→2（初始原Router有一次same-document操作，不能武断总数必须1）。空间位置按各自 owner 精确比较：原 Flow 浮点坐标前后不变；真实持久化传输原本保留2位小数，canonical DTO 则与采纳前的实际 saved DTO 一致。原 O8 historySize3/currentIndex2不变，已有帧的 slot type 都回填为材料；原图片/文本 nodes 全量不变。Run 自身的 pendingReturnCount/status 正常变 completed，不把这类预期任务事实更新当成“普通文本被覆盖”。

GUI 为 fresh installed Chrome 1440×1000、service worker禁止、外部 HTTP 和全部 WS 阻断，沿用已有 Playwright，Browser plugin not available。正常链准入7笔：图片原初始化2、原几何1、原 lifecycle reconcile3、精确 Accept1；阻断24笔。故障恢复链准入6笔，阻断28笔并另记4笔明确注入的原保存网络故障。两链 pageErrors0；仍保留 config/plugins 两次501、离线Statsig/CSP等失败，不能写“控制台全零错”。材料与原 TextFaces 同为442×273屏幕像素，未溢框；透明背景、与其他节点重叠、长标题、badge和窗口头布局仍属已列视觉债务，不为了截图擅改用户空间排版。

失败记录未删除：05-34脚本误把初始same-document导航计数写死1；05-35比较“普通节点”时错把必须更新的Run事实纳入；05-36拿RF原始浮点坐标直接比原传输两位小数。history VM曾因跨realm prototype 的 deepStrictEqual失败，已只修测试归一。05-40恢复按钮测试名未对齐真实aria-label；05-41发现按钮确实被原Flow pane遮挡，Root亲看后将错误反馈放到有边界的原画布overlay位置，正常点击才通过，没有force click。故障画面曾出现截图合成瞬态，继续补真实节点/Review可见及layout观测复核，不把单张空画面宣称数据丢失或已解释清楚。

### 隔离、回滚与剩余

每次 GUI 用官方 launcher 新建 `isolated-execution-*`，启动前后记录health/CIM完整路径/label/port，只逐PID停止已验证的新服务，再让launcher退出；合成runtime关闭后在确认绝对目录包含关系后清理。清理只删除本轮可重建测试数据，JSON与截图均留存，不删原材料或失败证据。

本批没有部署或重启17881/PID49552，health和完整命令行再次核实为原实验进程。live前后 Graph/全部Presentation/唯一Run/三Canvas及10份当前引用文件字节逐项相同，节点5/10/3，原Run created/planned、attempts0；没补槽、重提、派发、删除或重试原任务。没有读取旧账号profile/密钥、安装依赖、付费或模型生成、commit/push/外发厂商代码；没有新增hash、冻结contract、baseline或gate。复制原件与copied lcos保持只读，目标构建通过不等于全仓tsc。

外部对话按用户确认的可扩展方向：会话身份/上下文引用与执行Provider分离，具体adapter按能力匹配，不把未知类型默默映为WorkBuddy/Codex。本批并未实现“所有外部Provider”；原Core联合类型及历史fallback仍在后续工作，当前live Run不改。还需继续真实执行/WaitingInput、图片产物GUI、additional View编辑、复杂历史、跨现场/关闭重开全回归与原create-Undo失败的真实观测。不得因这10/12步通过缩小完整目标。

```powershell
node scripts/native-core-run-events.test.mjs
node scripts/native-execution-sync.test.mjs
node scripts/native-execution-bridge-sync.test.mjs
node scripts/native-execution-history.test.mjs
node scripts/native-execution-browser.mjs --run-isolated --phase=automatic
node scripts/native-execution-browser.mjs --run-isolated --phase=save-blocked
```

LCOS后端技能让原owner/CAS/空间写归属不漂移；React技能保持同runtime、稳定组件和共享订阅；前端测试与Playwright技能要求真实操作、错误分层和亲看截图。本批最终是 progress，不是夺舍全量完成。

最后一轮故障 GUI 再次12步 PASS：`.runtime/native-execution-browser/2026-10-14T05-47-09-325Z.json`。补等原 execution node 与原 Review 真正可见，记录 bounding boxes，再等一帧后截图；Root亲看图中原图片/文本/任务/Review与可点击错误overlay均在。node为442×273，Review为520×486.53，viewport为(57,142.5,1.3)，4次原保存abort、一次Accept、一次显式retry仍成立。这补证此前单张空白截图不是足够的丢失证据；没有据此声称所有瞬态渲染问题都已根治。最终正常10步/故障12步均为当前代码，临时runtime均已关闭清理、证据保留。

原 Undo/Redo 键盘也已只读核对：外层 bB offset810072 注册 qp，Ctrl/Meta+Z 与 Ctrl/Meta+Shift+Z；INPUT/TEXTAREA/contentEditable与原菜单/设置门控保留。B8关闭了内层O8快捷键，因此不能直接从O8有handler推断GUI已测。这里只为后续隔离GUI测试定位；本批不对live那个失败create branch执行Undo/Redo。

![故障时保留原节点与Review，显式恢复入口可正常点击](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-execution-2026-10-14T05-47-09-325Z-save-blocked-pending-preserved.png)
![同节点恢复为精确接受材料后打开原Reader](E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-execution-2026-10-14T05-47-09-325Z-exact-revision-reader.png)
