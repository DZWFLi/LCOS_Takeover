# 原生 Collection 首版

## 结论与预览

首版已完成，真实浏览器最终一轮通过。不是搬 GN2 Collection：卡面、堆叠、画廊、Group 与图文节点仍是 TapNow 原组件；只补 Core 名称、成员管理，以及调用原分组逻辑的主画布展开。未增加第二个 ReactFlow、历史栈或 Collection 真值。

- 预览：[打开原生 Collection 首版](http://127.0.0.1:53861/canvas/surface-core-main)。仅合成项目，不是原 17881 实验。
- 全新浏览器默认打开已保存的 Group，右侧 Agent 面板可能遮挡集合工具栏：先点原「关闭 Agent 面板」。选中集合后，使用上方「命名」「成员 3」「展开集合／收起集合」；点「收起集合」可看原 Pile，原堆叠的画廊入口继续保留。
- 命名、移出／加回成员、主画布展开／收起、真实拖动、原 Ctrl+Z／Ctrl+Shift+Z、真实刷新均通过。刷新前后完整 Core Canvas（含版本和几何）一致。
- 当前保留 runtime：`.runtime/isolated-native-pile-collection-1792029536252`。独立隐藏后台 launcher PID 52972、server PID 41148；2026-10-15 10:04 后多次独立调用核实 health、CIM 完整命令与 53861 listener 一致。PID 仅是当时记录，后续操作须重新核实归属。
- 原 17881 的 PID 49552、三画布 5/10/3、唯一 created/planned Run（attempts 0）、领域数据和 10 份文件完整字节，施工前后只读快照精确一致。没有 Provider／模型执行。

先停在这一版让用户看，暂不扩展其他功能。拖入合并、复杂嵌套与完整空间成员编辑不冒称完成。

## 目标和实施边界

用户已授权按原生框架优先的方向做可看的首版。保留 TapNow PILE 卡面、菜单、画廊与原 GROUP 主画布容器，只补命名、Core 成员管理和主画布展开；不再挂 GN2/Gen1 Collection 文件夹 body。

- Goal：合成 Core Collection → 原 PILE → 命名/成员操作 → 原 GROUP 主画布展开 → 保存、重开和可看预览。
- Files：lab 下原生 PILE 内存 AST 接缝、小型 UI/controller、Collection projection/Core router/空间接缝，正式 launcher 的隔离预览选项，定向测试与本文。原安装、reference、copied lcos、当前 donor 只读。
- Before/After：旧完整实验不变；新模式仅在 bounded isolated runtime 启用，运行时可见原 PILE/GROUP，而不是 LCOSCollectionNode。现成 Core/空间接口继续唯一持久化 owner，不增加数据库、Canvas、历史栈或集合真值。
- Interface：沿 Core 已有 Collection/member producer、原 Canvas/O8/保存口。先查实命名 producer，再选最窄适配；不修改 Schema/Run/Bridge/Provider/文件管理语义。原 pile 的 nodeIds 仅为当前画布投影，不替代完整 Core 成员。
- Tests：原件接缝可恢复/幂等与源码来源；真实临时 Core 的精确身份、命名、成员及空间保存；隔离 Chrome 原卡面/画廊、原控件操作、主画布展开、拖动/历史、刷新、截图及 console。原页面和新模式做同流程对照，不用编译成功代替 GUI。
- Risk：原 PILE 的两项下限、50项默认上限、不能嵌套及自动解堆不等于 Core Collection 语义；未投影/不支持成员保留在 Core。主画布展开不调用会删载体的 unpile，也不误删材料。未知/锁定/错误绑定继续拒绝。
- Rollback：仅撤新模式挂载与接缝，不迁移旧数据。官方 launcher、新随机 loopback 端口、全新 profile、模型死端口、transport none；只按完整 health+CIM 核实的自有 PID 清理测试。最终另留一个已核实的独立预览给用户看。

本轮使用后端维护流程核 owner 和隔离，React 规则保留稳定原组件，前端验证/Playwright检查实际交互。Browser 插件未提供，使用仓库已有 playwright-core 和安装 Chrome，不装依赖。最终结果及中间失败均保留如下。

## 已落地的接法

| 部分 | 复用与补充 |
| --- | --- |
| 收起卡面、堆叠、预览画廊 | 原 `yFe` / 原 Gallery；只在 registry 外包稳定薄壳，不替换 body |
| 名称、成员入口 | 原 `h5` 只读标题、原 `JT` 工具栏；补最小表单与完整 Core 成员面板 |
| 主画布展开 | 原 `i3` GROUP renderer；抽取原 `createNewGroup` 的 bounds/父子坐标 helper，不走 GN2 Collection 布局 |
| 领域与保存 | 同一个 Core Collection、成员与绑定；原 Huabu executor、O8 历史及 Canvas 保存，不新建空间真值 |

命名补的是 Core Collection 专属 `PATCH {title}` producer，按项目/集合校验，只更新 title/updatedAt，不冒充 Artifact、不改成员/Schema。适配只在独立原生 Collection 模式的构建启用；原安装、参考包、copied lcos 源码不写入。

首版明确不承诺：原生拖入/堆叠合并、再次自动排列、嵌套集合、完整任意成员类型的原 Pile 卡面。原生拖入和原标题编辑等“只改前端”的路径会被窄拦截，普通 TapNow 节点/堆叠仍走原处理。新增/移出先走已接 Core 的成员面板。Core 中未投影成员不会因 Pile 的展示限制被删掉。

主画布 Group 是空间呈现；已有 Group 中的成员变更不自动重排或移走物理节点。本版先验证 Core 成员增删 → 首次展开这条路径，不冒称完整空间成员编辑矩阵。另已补同一 Core 名称在现存 Group/O8 历史中的只读 title 回填，避免展开后改名导致下一次几何保存带旧名字；不插入 Group、不改空间操作或坐标。

## 验证记录（分层，不混算）

- `native-pile-collection-transform.test.mjs`：已通过。执行实际 server 变换顺序，原 PILE/GROUP renderer 保留，普通原生动作原 fallback，Core-bound add/merge 不做本地假写；抽取原分组 helper 的布局结果通过。此项没有启动 GUI 或 Core。
- `native-pile-ui.test.mjs`：已通过。真实浏览器 bundle 可构建；原 renderer/toolbar 仍使用，无 GN2/Gen1 Collection body、第二 Canvas 或历史 owner；display modifier 不写几何/成员。
- `native-pile-receipt.test.mjs`、`history-intent-transform.test.mjs`：已通过。元数据回执在原 O8 回填，保留几何/选区/历史大小，外来身份和缺失标记拒绝。
- `native-core-collection-title.test.mjs`：真实临时 Core 与 pilot proxy 已通过；仅变更 Collection title/updatedAt，保留成员/材料/修订/graphVersion。非法、跨项目、多余字段和未知集合拒绝；默认构建不注册该 producer，旧模式仍 501。两次 bootstrap embedding 探测固定在 `127.0.0.1:1` 并在联网前拒绝，没有 Provider/模型执行。
- `native-pile-first-open-diagnostic.test.mjs`：真实临时 Core 的既有 Collection/Assembly/ProjectionBinding producer → 原生首开 prepare → facade/O8 apply、undo、redo 已通过，外框精确保持 TapNow 的 `(100,80), 820×330`，undo 恢复自由成员，redo 保留同一 Group 与 manual sizing。这是后端真实执行测试，不冒称浏览器快捷键测试。旧 `native-collection-space-history-replay.test.mjs` 也已回归通过。
- 旧 `native-collection-display.test.mjs`、`native-collection-frame-projection.test.mjs`：已通过默认模式回归。旧 placement 测试通过，但其中浏览器是记录 API 的 adapter 验证，存在预期的未挂原 App React #299，不当作本版 GUI 通过。

上述为分层验证，不等于 GUI；最终真实 Core／原生浏览器结果见第九轮记录。

### 第一轮真实 GUI（未通过，保留失败）

报告：`.runtime/native-pile-collection-browser/2026-10-15T01-10-56-705Z.json`。原 PILE 卡面与原 Gallery 三个真实 Core 材料均已打开；在命名入口前失败，尚无标题 PATCH。

- 产品问题：Shell 首次读取先于原 Flow sibling bridge 的 effect 连接，错误地当成“已离开画布”，且未订阅已有连接生命周期事件，导致一直禁用。已改为等待 owner，并订阅原有 `lcos-native-bridge-changed`，不加轮询或第二套连接状态。
- 测试问题：runner 拒绝了原 ReactFlow 的精确 Pile measurement-only 回写（360×249），造成 pending-save；二轮只放行已确认 owner 的有限尺寸回写并记账，不放宽数据/位置/成员写入。
- 定位问题：原 `JT → Hde` 虽传 `data-testid`，原 `Ra/br` Button 丢弃未知 props。二轮按精确 Collection 壳内原 button 的 accessible name 点击，仍自动等待 enabled，不用 JS 强点或业务 API 代操作。
- 顺带修正成员预览字段：原 Core 返回的是顶层 `type/id/label`，不是 `memberRef/title`；未投影成员现在能显示 Core label。
- 清理：server 51128、launcher 50128 按 health/CIM 精确身份退出，64892 无 listener，合成 runtime 已删除；失败报告/截图保留可追溯。原 17881 未动。

### 第二、三轮真实 GUI（继续保留失败）

- 第二轮 `2026-10-15T01-16-16-346Z.json`：原按钮改名 → Core PATCH 200 → 卡面新名已成立；随后 runner 误把成员集合当有序数组，排序不同触发断言。已改用精确成员 refs 的集合比较，不降低 ID/数量/绑定检查。零 pageError、零被拒业务写；server/launcher 退出、端口无 listener、合成 runtime 删除已核实。
- 第三轮 `2026-10-15T01-17-40-052Z.json`：名称、成员移出/加入与原 Pile 回执均已成立；主画布展开的 prepare 409，原文为 `Huabu simulation did not preserve the exact TapNow original Group bounds and Core identity.` 这是空间接缝实错，仍在定位，未改成成功或回退 GN2。该轮 server 40588/launcher 57748 已退出，49264 无 listener，合成 runtime 删除；报告/截图保留。

第三轮根因已由真实临时 Core 复现：TapNow 计划外框 `(100,80), 820×330` 被 Huabu 默认 hug 改成 `(88,68), 844×354`，四边多 12px；身份未变。修复限定在原生模式，使用 Huabu 已有 `data.sizing='manual'` 保留原 TapNow bounds，原 O8 撤销/重做的 frame 重建同样带此模式；旧默认 Gen2 分支不变。精确几何比较继续保留，没有拿容差或旧 planner 遮掉错误。

### 第四、五轮真实 GUI（接口已继续接通，仍保留失败）

- 第四轮 `2026-10-15T01-27-59-458Z.json`：prepare 200，但原 `jVe` 把 Pile 成员的 replace 强制保留旧 parent/position，导致只出现本地空 Group；完整 O8 space intent 不匹配，R6 在请求前拒绝，零空间 POST。没有放宽精确空间校验。改法只给原 `Ri` 保护映射一个派生输入：精确 Core Pile／Group 中的材料（含本批合法新增 Group）可携带原父级/坐标；原真值 memberIds 与普通 Pile 保护都不改。真实 donor `Ri/jVe` 执行测试通过。
- 第五轮 `2026-10-15T01-37-49-620Z.json`：原空间 POST 200，原 Group 与三个原图文节点已真实保存，Core binding 仍为原 Pile。随后 runner 误拦同 Pile 的完整事实/原位几何 echo，保存仍 pending；新 Group 壳本地 busy 又误认为空闲，过早允许点“收起”。修正为接纳精确只读 Core 数据、持久原位的原生尺寸 echo；UI 的同一 pending promise 状态跨 Pile/Group 壳显示，确认完成前按钮禁用。原 Flow `fitView` 在保存后聚焦目标，只动相机，不挪材料。
- 两轮失败测试均已按 health/CIM 身份清理自有 server/launcher，端口释放、合成 runtime 删除；报告与截图保留。没有部署或操作旧 17881。

### 第六、七轮真实 GUI（历史已过，保留刷新失败）

- 第六轮 `2026-10-15T01-42-36-527Z.json`：展开/收起与真实拖动都已响应成功；runner 自己漏初始化 `historyObservations` 数组，已修报告记账。没有因此改产品断言。
- 第七轮 `2026-10-15T01-50-02-368Z.json`：名称、成员增删、原 Gallery、原 Group 展开/收起、真实拖动、原 Ctrl+Z/Redo 均过。位置 `0,0 → 72.5,46 → Undo 0,0 → Redo 72.5,46`，6 次历史观测稳定。全画布 Group rect 为 `120,335,1200×330`，完整在 `1440×1000` viewport 内。零 pageError、零拒绝的业务写。
- 第七轮唯一失败：刷新时原 `wFe → Xh` 将虚拟 Pile box `250×146` 呈现为可视堆叠 `375×250`；ResizeObserver 又把这层显示尺寸回写 Core，画布版本 +1。成员、身份、位置均没变。没有放宽重载一致性断言。
- 修复限定在原生 Core Pile 的被动 `dimensions` 观察：不让显示投影尺寸冒充作者几何；普通 Pile、明确的 `setAttributes`/`resizing`、材料节点、未知字段和无效尺寸仍走原路径。真实 donor `jVe` + 实 helper 的执行测试通过；两处映射/测量接缝逆替后，`jVe` 其余源码逐字等于原件。
- 两轮自有服务/launcher 均已核身退出，端口释放、合成 runtime 删除，报告/截图保留；旧 17881 未操作。

### 第八、九轮真实 GUI（最终通过）

- 第八轮 `2026-10-15T01-56-43-192Z.json`：全部交互与严格刷新已过；最终 binding 数组一端排序、另一端未排序，runner 再次误将无序集合当有序数组。修正仅为双方按 spatialId 排序后比较完整对象，不删除字段或放宽身份检查。该轮自有进程/端口已核身清理，报告保留。
- 第九轮 [最终 GUI 报告](</E:/Codex 项目/LCOS夺舍计划_20261013/.runtime/native-pile-collection-browser/2026-10-15T01-58-56-252Z.json>)：`passed=true`、进程退出码 0，`pageErrors=[]`、`blockedWrites=[]`。

| 真实操作 | 结果 |
| --- | --- |
| 原 Pile 卡面／原 Gallery | 三个精确 Core 图文成员可见；始终一个原 ReactFlow |
| UI 命名 | Core PATCH 200；同一 Collection，成员不变 |
| UI 移出／加入 | 原 Core DELETE／POST 各 200；3→2→3，原成员 refs 精确恢复 |
| 主画布展开 | 原 O8 batch 200；原 Group 与三个原材料节点保存，Collection binding 仍指向同一个 Pile |
| 收起 | 原 collapsed-view preference；不发 Canvas batch，同一个 Pile 恢复，Group 隐藏 |
| 鼠标拖动／原撤销重做 | `(0,0)→(72.5,46)→Undo (0,0)→Redo (72.5,46)`；6 次历史观测稳定 |
| 真实 reload | 完整 Canvas JSON、同一 Pile／成员／名称／bindings 精确一致，无测量偷写 |
| 不相关数据 | 材料 Artifacts／Views／Revisions／FileRecords 及文件完整字节不变；Context／Workflow Canvas、Presentations、Runs 不变 |

离线平台配置、插件和动态建议仍有预期 501，Statsig 远端尝试被阻止。这里的零 pageError／零拒绝业务写不等于零 consoleError，更不代表全部云端接口已接通。

### 预览进程生命周期更正

第九轮报告内 `preview.retainedForUser=true` 只核实了 runner 退出前状态。Root 随后独立复查，发现 server 54660／launcher 36884 和端口均已消失，故不能把该字段作为长期存活证据。未改报告掩盖此问题。

已用 `Start-Process -WindowStyle Hidden`、独立 stdout/stderr 文件，通过官方 launcher 重启同一已通过的合成 runtime；复用本轮已验收的 UI bundle，没有重新造数据或重新提交任务。跨启动命令结束后的多次独立工具调用，确认新 server 41148、launcher 52972、完整 runtime 参数、53861 listener、`nativeCollectionPilot=true`／`realCoreConnected=true`／`cloudBackendConnected=false`。日志位于该 runtime 的 `preview.stdout.log` 和 `preview.stderr.log`。

另用全新浏览器上下文做只读落地复查：原 Group 和三个原材料节点全部 DOM-visible，只有一个 ReactFlow；原 Agent 面板默认打开，确实挡住工具栏，因此上方入口说明已提示先关闭。该 probe 禁止全部非 GET/HEAD，导致事件／空 execution:reconcile 的 POST 被拦并显示同步失败提示；这是 probe 限制，不能与第九轮允许既有正确读写的完整业务验收混算。首个 probe 等内部 owner 返回数组的假设超时，随后改为直接 DOM／截图观察，未改产品或服务。

落地复查截图：[默认面板状态](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-entry-readonly-2026-10-15T02-08-28-304Z.png>)、[仅关闭 Agent 面板后的全景](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-entry-presented-readonly-2026-10-15T02-09-26-681Z.png>)。1440×1000，1 Flow／4 visible nodes，0 pageError；自有浏览器已关闭，结束后独立预览 health／CIM／listener 仍核实存活。

### 截图与复跑

- [主画布原生 Group 展开全景](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-collection-2026-10-15T01-58-56-252Z-05-main-canvas-original-group-expanded.png>)：1440×1000 viewport，Group rect `120,335,1200×330`，收起按钮可用。
- [原生画廊](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-collection-2026-10-15T01-58-56-252Z-02-original-pile-gallery.png>)。
- [Core 成员面板](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-collection-2026-10-15T01-58-56-252Z-03a-original-collection-members-panel.png>)。
- [刷新后的原 Pile 卡面](</E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/tapnow-native-pile-collection-2026-10-15T01-58-56-252Z-07-reloaded-original-pile.png>)。

图中长时间戳标题是合成测试材料，不是正式文案；没有为截图改写原文本节点的正文组件。

在本工作区重新跑全套隔离 GUI（会创建新的合成 runtime，不覆盖现预览）：

```powershell
node scripts/native-pile-collection-browser.mjs --run-isolated --native-collection-pilot
```

当前预览仍运行时不要重复启动同端口。历史 runner 的 `--keep-preview` 不能单独保证退出后存活；本次交付以独立后台及退出后核实为准。

### 尚未覆盖的边界

- 原拖入堆叠／合并对 Core 集合明确不可用，先用成员面板；普通原生 Pile 不变。不沿用原少于两项自动解堆去删除 Core Collection。
- 首次展开复用原 Group 的 bounds／父子坐标，不是新增 GN2 网格，也没有完成再次自动排列。
- 首版仅支持根级、非空、当前画布已绑定的自由图文节点；复杂嵌套、未投影／其他类型成员仍保留在 Core，不承诺原卡面展示全部类型。
- 已展开 Group 的增删成员不自动重排／移走物理节点；本轮 GUI 验证的是增删成员后首次展开。展开态改名的 Group title-only 回填有定向测试，不冒称单独 GUI 场景已测。
- Gallery 已验证三成员打开，不等于其全部编辑／重排动作已接 Core。
- 本版未验收真实 Agent 执行、完整 Context／Workflow、所有文本能力或完整 TapNow 接口。安装原件／reference／copied lcos 未改，本地研究不等于厂商再分发许可。
