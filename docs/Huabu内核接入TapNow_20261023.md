# Huabu 内核接入 TapNow · 2026-10-23

后续接续：原 Composer 调用固定四工具已施工，真实 Main／Context 查询、原权限确认、模型位置移动与原 Undo／Redo／刷新通过；同 native 断线恢复后继续实发，最终24条消息、19项混合Scope保留。[最新完整施工与余项](Composer画布工具接入_20261023.md)。下面是首批外部API/MCP的历史记录，其中“原Composer未接”已由后续接续，其他未通项继续有效。

首批真实工具链已接通并实屏验证：外部 API／MCP → 当前页面同一 Huabu 空间 → 原 Core 布局保存 → TapNow 原画布实时更新及原撤销／重做。原入口、原画布、原保存与历史共同工作，没有增加产品窗口。

本轮接通结构查询与现有节点位置移动。它是一条能继续扩展的薄接线，不代表完整 Huabu 工具、原 Composer 自动调用、完整 Rail 已全部完成。预览：[当前工作区](http://127.0.0.1:56311/canvas/surface-core-main)。

本轮前面的实时归档、真实断线恢复与连续混合 Scope 对话已验收，见[完整记录](实时归档与真正断线续聊_20261023.md)。对话接通不代表画布工具、Rail 或 MCP 已全部接通。

## 查到了什么

| 真实情况 | 接法 |
|---|---|
| TapNow 页面画布和独立聊天 Host 使用两份 Huabu storage；Host 只有自己的空 World | 工具操作落在当前 facade 的原空间，不盲转 Host 的 RFS |
| 原 Huabu 已有查询、命令执行、RFS、工具 dispatch 和同步事件 | 复用这些生产者和 schema，补缺失适配，不重新造内核 |
| 原 Core 续聊 ensure owner 没传 canvas/env/space prompt；daemon new/load 的 MCP 列表为空 | 不能把能聊天说成能操作画布；会话级工具上下文与 MCP 配置传递另列待接 |
| TapNow 原编辑 → nodes:batchActions → Core／Huabu 已通 | 外部布局命令委托这条原路径，不直接改 Huabu 副本绕过 Core |
| 当前 façade 只接特定投影同步，没有通用外部画布变化消费者 | 用 Huabu 原 CanvasSyncEvent 接原 TapNow API、normalize 和 O8 回填，不挂第二份 canvasStore |

## 第一批施工范围

一个能力适配器，供 HTTP API、MCP 和后续原页面动作共同调用。

- 原 `GET_SPACE_OUTLINE`、`INSPECT_NODES`、`INSPECT_EDGES` 只读结构、位置和拓扑；全文、搜索与文件仍交原 Core 当前 Revision／归档读取。
- `SET_NODE_GEOMETRY` 首批只接位置移动，一个显式命令可包含多个节点；经过原绑定检查、Huabu 执行与 Presentation 保存，按实际 from/to/deltas 回执，不把 no-op 说成发生了改动。外接缩放暂拒绝，原手动缩放保留；自动 measured 尺寸与原 O8 作者尺寸的完整桥接另列待接。
- Collection carrier／group 及集合内成员的外部几何尚未接到原集合 owner，因此提交前检查真实持久化节点、Core binding 和父链；混合批次命中一项即整组拒绝，不能保存后让页面永远等待。原手动集合功能保留。
- 原 `/api/canvas/:canvasId/sync/stream` 复用同一个 publisher；订阅先于 snapshot，断开退订、换现场结束、漏事件准确读回。
- 原画布回投只处理已存在节点的几何。正在拖动、改尺寸、编辑正文或原保存队列未完成时等待；不覆盖用户编辑、不二次 POST。
- 外部变化进入原 O8 的正常历史动作，再沿原 Undo／Redo 保存；不无条件清空历史。
- MCP 使用已安装的官方 Python 库，仅作协议包装。工具 schema 从同一 HTTP 适配器读取，不维护第二套业务规则。写入失败／未知不重发。
- 原 RFS Bearer 边界保留；使用当前画布 runtime 自己的 connection token，和聊天 Host 分离。凭据仅在忽略的 runtime 连接文件中，不进入界面、命令行或报告。

## 入口与后续顺序

| 顺序 | 原入口／能力 | 下一步 |
|---|---|---|
| 1 | 外部 API／MCP 画布查询和布局 | 本批已跑真实 Core、同一空间与原页面闭环；首批仅位置移动，集合／缩放另记 |
| 2 | 原 Composer 直接调用画布工具 | 下一项：原 send 捕获现场地址，facade 验真实会话／空间后，沿同一 native 会话动态挂固定自有 MCP；权限也需接原会话输入，不能只挂工具就宣布完成 |
| 3 | 原加号“添加智能体” | 候选形象、刷新、拖放沿现有 Glyth 逻辑；实际创建走已通原会话 owner，再投影到原画布，不挂旧独立创建菜单 |
| 4 | 左侧 Rail | 沿原导航载体补动态子现场、Peek、定位与携带接收。三现场切换不等于完整 Rail；创建功能放原加号 |
| 5 | 原节点工具菜单 | 原 tools 槽复用命令生成和原阅读／对话／任务去向，不整挂旧 Arc 工具带 |
| 6 | 外部内容／材料／任务 | 文本写入走 Artifact／Revision，图片走原导入，集合走原成员及空间历史，Task／Run 走 Core；禁止代理整个原 RFS execute |
| 7 | MCP Apps／交互视图 | 原 TapNow 本地 Apps 的 tools/call、ui/message 仍需按原协议和实际工具能力接，不把厂商插件列表当 MCP server 注册表 |

## 验证记录

当前真实预览 Core PID51072，Host49648保持原进程；原 runtime 与对话归档保留。本批没有调用模型，也不借聊天的两次回复冒充画布工具验证。浏览器插件不可用，实屏使用已有 Playwright 与真实 Chrome。

[最终运行与对话只读核对](../output/原画布内核薄接入_20261023/最终运行与对话只读核对.json)确认上述进程及原8条消息保留。

| 层 | 证据／结果 |
|---|---|
| 原 Space／查询／事件 | [7 组真实原空间定向验证](../output/原画布内核薄接入_20261023/2026-10-22T19-40-54.898Z/report.json)：原查询、原 schema、事件竞态、断开和背压 |
| 完整 Core＋facade | [最终 9 组集成](../output/原画布内核薄接入_20261023/真实Facade/2026-10-22T20-26-34.980Z/report.json)：真实布局及 Presentation、no-op、并发 CAS 的真实部分提交、正文／Revision 保留，以及真实 Collection／group／内部成员和混合批次写前拒绝 |
| 实际 HTTP＋MCP | [新 Core 最终入口报告](../output/原画布内核薄接入_20261023/真实HTTP与MCP/2026-10-22T20-35-15.133599+00-00/report.json)：缺失／错误 Bearer 为401，外部 Host／Origin 为403；标准 MCP 查询和直接 HTTP 一致。另发一次正常文本＋集合混合命令，实际501且原画布完全不变；零成功几何写入 |
| 标准 MCP 包装 | [真实 SDK 协议回归](../output/原画布内核薄接入_20261023/MCP协议回归.json)：schema 来自同适配器、部分提交事实保留、写入不重发、本地凭据不经系统代理；HTTP 为明确测试端，不冒充实屏 |
| 原前端／历史 | [前端接线与回归](../output/原画布外部工具实时接入_20261023/前端接线与验证.md)：8组 controller／真实 O8、4组真实 r6 去重；先复现吞撤销，再修复，不清历史 |
| 实际页面前半段 | [真实移动／原撤销重做／跨现场](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T19-58-05-171Z/report.json)逐项通过；该报告整轮仍为失败，后面的按住测试点中了回返过渡层，不能把整份原报告改成通过 |
| 实际页面最终补验 | [新 Core 跨现场＋真实按住／释放／刷新](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T20-32-48-511Z/report.json)通过。按住时保留596/152并等待version16，松手后604/158，刷新一致；正文不变，接收阶段0重复保存 |

已发现并修正的具体失败会单列：首次真实 facade 调原几何生产者缺 `canvas_id`，原校验正确拒绝；现补原字段，没有放宽校验。首次红报告保留在 `output/原画布内核薄接入_20261023/真实Facade/2026-10-22T19-20-59.523Z/report.json`。

首次真实 MCP 发现还抓到 `querys/queries` 路径拼写差异，协议测试端已加强准确路径验证，真实入口复跑通过；[原失败保留](../output/原画布内核薄接入_20261023/真实HTTP与MCP/首次MCP发现失败.md)。外部移动后 Undo 曾被原保存去重吞掉，也已在真实原 r6 复现并修正。

按住测试的旧失败通过[零移动诊断](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T20-26-36-412Z/report.json)确认：pointerdown 命中原回返过渡遮罩，未进入画布；不是节点监听失效。最终验证等原页面实际可操作，核对命中节点与真实 pointerActive 后才发唯一新命令，没有删除或穿透遮罩，也没有猜着改交互行为。历次五笔 MCP 几何命令均已确认；失败验证没有触发重放。启动、回返和刷新仍有原图片同值回显／执行投影请求，独立记账，不能称整个页面零 POST。

[独立复审](../output/原画布内核薄接入_20261023/独立复审_20261023.md)发现的集合漏项已在写前收住；原集合 first-open／reopen 仍通过。它没有被删掉来掩盖未接功能。

最终截图：[按住时等待](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T20-32-48-511Z/06-original-pointer-held-deferred.png)、[释放后同步](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T20-32-48-511Z/07-pointer-release-catches-up.png)、[刷新后保留](../output/原画布外部工具实时接入_20261023/真实页面/2026-10-22T20-32-48-511Z/08-refresh-keeps-current-saved-geometry.png)。

## 实现与复跑

内核适配器在 `lab/pilot/native-space-kernel.ts`，原事件 HTTP 桥在 `lab/pilot/native-canvas-sync-stream.ts`；`surface-core-facade.ts` 负责同一空间身份与原提交，`lab/server.mjs` 保留原 RFS 认证并挂事件。`lab/native-canvas-sync.js` 与原 node/history bridge 负责接回唯一画布。

MCP 入口是 `scripts/native-space-kernel-mcp.py`，用现有 Python MCP 2.1.1（依赖声明在 `scripts/requirements-native-space-kernel-mcp.txt`）；`native-space-kernel-mcp-client.py` 是标准真实客户端，不是模拟工具调用。进程按 `--canvas=surface-core-main` 固定当前打开的画布，工具参数不能换项目或画布。它读取当前 runtime 的原连接配置，不需用户在产品中填写 token，也没有修改用户的全局 MCP 设置。

```text
python -X utf8 scripts/native-space-kernel-mcp.py --canvas=surface-core-main
```

`get_space_outline`、`inspect_nodes`、`inspect_edges`、`set_node_geometry` 四项由同一能力发现入口供给；目前最后一项只接受位置。原 Composer 自动使用这些工具仍是下一项，不能把外部客户端实际可用与会话级 MCP 配置已接通混为一谈。

## 原助手接线已研究到哪一步

[完整最小接线研究](audit/Composer原会话画布四工具接线研究_20261023.md)已核对当前真实供应商包、原 SDK 与原 Host client。现用 Qwen 支持 session 级动态 MCP，可沿原发送给当前 native 会话挂固定自有工具，不改全局 settings、不换对话、不动已安装 daemon。

仍须施工的具体项：原发送携带并校验现场地址；工具准备与整条原发送防串现场；新 Host 能力验证原 Bearer；自有 MCP 不继承多余模型凭据；原会话工具 permission 回原输入 owner。目前无 Run 的 permission 会取消，不能靠新造 Run 或删除保护绕过去。这些都是明确未通项，本轮没有调用模型冒充验证。

## 仍不能宣称的事项

完整画布工具集、外部集合几何／缩放、任意第三方 API／MCP 安装、真实模型自动选用工具、图片／PDF 多模态、完整动态 Rail、全部 GUI 质感都尚未完成。平台配置、云插件和语音能力原501继续留账。首批能力发现只报实际接通子集；不复制原默认“所有命令均可写”的声明。

只改第三工作区 `E:/Codex 项目/LCOS夺舍计划_20261013` 的 lab/scripts 与文档；原 OS、原用户配置和参照源保持只读。没有新增第二份领域数据、协议冻结、hash 方案、baseline 或 gate，没有发布／推送。
