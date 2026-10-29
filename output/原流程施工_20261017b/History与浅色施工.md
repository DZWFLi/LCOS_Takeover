# History 与浅色施工记录

2026-10-17，工作区：`E:/Codex 项目/LCOS夺舍计划_20261013`。

**原 History 的真实记录、原阅读/返回、原选择与重复投放核对已在最新统一运行版通过；创建菜单与 History 已实屏稳定浅色。全区迁移仍未完成。** 原侧栏、筛选、列表/网格、日期分组、选择、展开页、动画均沿原 owner；没有新建“历史中心”窗口。以下严格区分独立测试、已运行和未覆盖。

## 改了什么

| 文件 | 改动与真实 owner |
|---|---|
| [native-history-projection.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-history-projection.ts>) | 接准确原请求 `/api/conversation/v1/me/generation-history`。直接读取现有 Core `Artifact/ArtifactRevision/FileRecord/Run/WorkspaceMembership/ProjectionBinding`，不设历史表、不从 UI 状态编历史。导入/外部版本不伪造 generation/Run。每条 DTO 携带确切 project/artifact/revision/fileRecord 地址 |
| [surface-core-facade.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts>) | 仅增加该读适配的 import、初始化、分派。材料投放分派由 runtime agent 负责，双方已协调，互不覆盖 |
| [native-history-transform.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-history-transform.mjs>) | 保留原 `l9/r9` 内容和几何，原 `GH/t2` 增补文本/其他分类，原分页读 map 覆盖新分类；原 `Y` Apply 转真实材料投放，原 `aE` 下载转确版 FileRecord；原卡/行内补“阅读”入口和版本标题，阅读仍进统一原 viewer；原读 hook 增加原位置重读 |
| [native-history-actions.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-history-actions.ts>) | `LCOSUseNativeHistoryActions` 与 `LCOSOpenNativeHistoryVersion`。原点击/选择 Apply 保持投放语义，“阅读”才走原 `wa/d2/c2`。投放复用 `placeNativeLibraryMaterial`，不走厂商 factory/setNodes；未知回执在原入口再次点击仅 GET 核对，不重复 POST。下载重新解析确版地址并读实际 bytes/MIME，不走 filehub签名 |
| [native-light-theme-transform.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-light-theme-transform.mjs>) / [native-light-theme.css](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-light-theme.css>) | 前批原 owner 定点浅色修复保留：创建 `fH/dc/$is`、History `l9/r9/GH`、原 viewer/chat/Library 同套语义 token。无反色 filter、无全局 `!important`、不改媒体/Collection 形象/动画与几何。此轮重跑验证，并将证据输出改回第三工作区 |

原 `generation_type` 只是运输字段沿原分类消费：真实 MIME 决定 image/video/audio/model/text/other；PDF、缺 MIME 或未知格式不冒充纯文本。图/视频/音频/3D没有真实记录时返回真实空，缺失/不可读/归档/待确认版本保留记录和限制。没有输出文件的纯对话任务仍属原右栏任务记录，不编造成媒体历史条目。

当前现场筛选按该 Workspace 的材料成员/实际载体或任务产出归属过滤；材料的旧版本仍保留其历史，不会因主 View 已指向 Current 而从列表消失。每行打开、下载或投放的 revision/fileRecord 都保持原行地址。

## 已验证

- `node scripts/native-history.test.mjs` 通过：实际原包变换 parse/幂等，除精确 owner 外其他原声明原文不变；原 `r9` 展开页未换；History → light 变换组合可 parse。
- 测试直接从原包 `index:In.dialog` 求值，验证真实 API 前缀为 `/api/conversation`，没有按函数名猜 `/api/dialog`。
- 独立临时真实 Core/SQLite + Huabu fixture：修改一个受控文本产生真实新版本，History同时读到旧版/当前版及对应 FileRecord；实际 image FileRecord bytes 可读；原 offset/limit 分页、搜索、Workspace筛选、空媒体、错地址与方法均验证。
- 单独读模型 fixture：真实Run归属、draft/archived/missing/hash不一致/未知MIME/外项目关系；未假称这些是实际模型运行结果。
- 实际 Apply coordinator：历史版本不换 Current；第一次 uncertain 后第二次只传 `readOnly:true` 核对；draft/错行地址/现场变化不写；继续使用 runtime agent 已验证的真实投放 producer。
- `node scripts/native-light-theme.test.mjs` 最新通过：Chrome解析207条补充 CSS，创建白底、History白色82%玻璃、文字/placeholder可读、无pageerror。5个原模块非 paint AST不变，Collection媒体、原动画/几何不变；真实 `UnlimitedModeToggle:pO/lC` class夹具核对分类文字和库文字正文颜色。新补原 Collection `Vde/Hde` class夹具验证工具栏、更多菜单、SVG图标；对应course仅增加10处paint字串转换。

证据：[history-source-core-result.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/history-source-core-result.json>)、[theme-source-fixture-result.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/theme-source-fixture-result.json>)。`screenshots/theme-fixture-*.png` 是原 owner CSS夹具，**不是整 App 截图**。

## 注册与最新实屏

根线程已注册 `transformNativeHistoryScript` 在 LibraryContexts 后、材料viewer/light前执行；`native-agent-ui` 已导出两项原动作桥接。未由本子线程构建/重启56238，未运行模型，未下载外部内容，未修改原包或 `lcos/`，未写0.1工作区。

最新统一实例为 `http://127.0.0.1:56238`，health `PID43972`、`realCoreConnected=true`、`fullScopeComplete=false`。根线程统一构建/加载；本子线程没有构建或重启该服务。

`node scripts/native-history-browser.mjs --base-url=http://127.0.0.1:56238` **passed=true**，最后一次开始于 `2026-10-17 06:36:09 +08:00`。独立 Chrome 已关闭。真实原 App 流程：

| 实屏动作 | 实际结果与限制 |
|---|---|
| 原 rail 历史 → 原侧栏 | 六分类、搜索、当前现场范围合计25次原端点GET全部200；显示现有Core材料版本，无History加载错误 |
| 原文本tab → 版本“阅读” | 进入同一个原 `wa/d2/c2` viewer，未出现旧 Stage Reader；正文Ctrl+F留在阅读器内；Escape回保留的原History |
| 原搜索 → 清空 → 展开 → 当前项目 | 原 `r9` 展开页、原搜索和原tab保留；实际 `canvas_id=surface-core-main` GET证明接当前Workspace过滤，而非只改tab外观 |
| 原返回 → 加号创建菜单 | 等原动画稳定后确认白底深字；computed background `rgb(255,255,255)`、foreground `rgb(36,38,37)` |
| 1000×800 → 原History | 文字、分类可读；下方三视图键位于可用画布，未盖住右侧Composer。保留三键语义和原相机 |
| Context原“选择→应用到画布” → 普通点击同条目 | 两次均GET读回 `state=present` 与确切revision；当前已有载体复用，节点数与该材料载体数前后不变。脚本对任何投放POST提前阻断，实际0个POST，因此本轮不能冒称新增节点写入实屏已验 |

无pageerror、模型请求、外部下载。所有7张最终截图已逐张打开查看；截图前等待原弹簧/淡入稳定，不禁用动画。证据：[最新结果](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/history-live-browser-result.json>)、[原侧栏](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-01-real-sidebar.png>)、[原文本查看](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-03-original-text-viewer.png>)、[原展开页](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-04-original-expanded.png>)、[稳定创建菜单](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-05-create-stable-light.png>)、[窄屏](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-06-narrow.png>)、[Context幂等确认](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/history-07-idempotent-apply.png>)。

此前 `PID18496` 两轮完整脚本因错用button查询tab、错用已被替换的rail关闭侧栏而失败，旧 `passed=false` JSON保留，不抹掉历史。最新结果只覆盖上表，不以修好脚本替代业务证据。

实屏定位的两个原paint漏项已包含本版：原分类 `t2` 实为 `UnlimitedModeToggle:a9→pO`，原库文字轻预览 `TS→yk/ca→Kg→lC`。theme定点纳入 `pO/lC/cl`，保留原布局/滚动/正文；pO在最新实屏可读，lC在实际原leaf CSS夹具可读，本脚本未再次打开原库文字preview，不能将该leaf单独报整App通过。文本History原卡的音频图标与双份标题已修，最新实屏为文本图标/单份标题。

**最后新增、尚未进主实例的主题修复：** Collection整页实测抓到原 `JT→Vde/Hde` 更多菜单仍深色/工具栏白字。源码现仅将这两个原chrome owner纳入paint翻译，并补其原SVG utility对应的精确CSS；独立AST/Chrome原class夹具通过。[夹具截图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程施工_20261017b/screenshots/theme-fixture-original-collection-menu.png>)不是整App截图。根线程已明确本批暂不重启，因此当前 `PID43972` 该菜单仍按未加载修复登记；没有把源码结果替代主实例视觉通过。

## 尚未完成的边界

1. 图片和text/markdown的已确认/历史版本投放已接共享 producer；video/audio/3D/其他、draft和归档版本投放没有偷偷转成文本或Current，会保留原记录并提示原因。故不称“History全功能完成”。
2. 历史当前按挂载/分类/搜索/分页和显式重读刷新，尚未订阅Core版本变更事件；未将其称为实时历史。
3. 原History新增载体写入、展开页批量Apply、实际下载/批量下载浏览器手势限制尚未在本轮实屏覆盖。确版读/写producer及丢回包恢复另有Core/协调器测试，不能替代这些UI分支。
4. 全区仍有原厂商侧路未接：`page:hH` 模板继续 `op/mp` 厂商模板仓库/Apply；`index:IDl/qu/kza/JTl` 账户/组织/订阅设置；`page:k7` 分享与TapTV；`page:UH/IH` 帮助外链/厂商反馈；`G8` 长按V仍写原pending voice flags。History数据接通不代表这些流程融入，外链/API被拦截也不算迁移。具体原owner、原页面落点和返回见[全区子审查](<E:/Codex 项目/LCOS夺舍计划_20261013/output/全区流程审查_20261017/全局窗口与阅读审查.md>)。
5. 完整GN2 Stage/12种body的历史恢复尚未退出，不属于本次History侧栏修复已解决范围。新viewer/原History组件共存也不能证明旧Reader/窗口拓扑已全面迁移。
6. 原日期分组直接取UTC日期：上海时区10月17日凌晨创建的版本显示 `2026-10-16`。版本时间是真实UTC，不能改假时间；后续应在原分组/显示owner统一按用户时区格式化。
7. 最新Context截图仍可见现场已有卡片叠放；本次只核对原载体，未增加或调整这些节点，因此不将幂等通过写成整个现场排版已合格。可读标记基于真FileRecord元数据；物理bytes仍由实际Core内容接口验证，未对整项目逐文件stat。
8. 原展开页范围标签仍为“所有项目 / 当前项目”，当前真实读适配含义分别是“整个LCOS项目 / 当前现场Workspace”。过滤结果与确版地址已验证，标签语义尚需在原r9范围tab定点改为“整个项目 / 当前现场”，不能将当前Workspace冒称另一个项目。

## 回传字段

- **READ_SOURCE**：原 `page-Da_DfwiK.js` 的 `l9/r9/GH/YH/aE/Y/W/cm`；原 `useHistoryAssetList-DmiPqiyV.js:J/W/B`；原 `index-BAQXnPag.js:In/$d/nc`；现有 `metadata-repository.ts` 的 revisions/files/run/membership读取；共享 `native-material-placement-client.ts` / producer；原浅色theme helper。
- **ADOPTED**：本地安装原包原History内容/操作容器 → `native-history-transform.mjs` 精确owner变换 → 原左rail `fH/H7/l9` production caller。既有Core真值 → GET读适配；既有投放producer → 原Y；既有统一原viewer → 卡/行阅读。
- **VISUAL_SOURCE**：本地安装的TapNow原侧栏、列表/网格、展开页、原Card主题浅色分支；以本地原件为准，无新增Figma推测。仅本地研究；未再分发厂商代码。
- **RETIRED**：LCOS History路径中原Y→W厂商节点factory和原aE→filehub下载caller已转真实owner；原函数和原布局仍保留，未靠CSS隐藏或删功能造融合假象。
- **VERIFIED**：独立真实Core读/bytes、源AST与动作协调器测试、Chrome原owner CSS夹具；最新 `56238/PID43972` 原History侧栏/搜索/当前现场展开、原viewer阅读/返回、稳定浅色创建/History、窄屏、Context两种原Apply手势的已有确版载体核对。
- **UNRESOLVED**：上述不支持投放格式/状态、实时刷新、实际UI新增/批量Apply和下载、lC原库preview单独实屏回归、原UTC日期显示、已有现场排版、全区厂商云侧路与旧Stage恢复。
