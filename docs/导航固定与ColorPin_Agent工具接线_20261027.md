# 导航固定与 ColorPin：Agent 原工具链接线

状态：MCP/Host/session 共用链已实施并完成定向专项；Root/Canvas 分支的后台服务与 Reader 的即时显示接回仍须统一构建后实际集成验证。本 agent 未访问活动页面或 Core，未调用 provider。

目标是用户与 Agent 随时修改同一份 GUI 表达，继续使用原 More / 颜色 Popover / 固定目录 / Composer PermissionTray。不加入 Run、阶段、方法或新窗口。

## 原服务与建议动作

| 动作 | 已存在的真实 owner | Agent 建议 |
| --- | --- | --- |
| 读取颜色 | `CoreColorPinClient.snapshot` → `GET /projects/:pid/color-pins` | 复用实际 snapshot，不能把读失败解释成没颜色。 |
| 添加单色 | `assign` → `POST .../color-pins/memberships` → `MutationSafetyService.assignColorPin` | `set_node_color_pin` 的 `present:true`。只改当前准确节点对应的一个 target/颜色；同定义与 target 已有 membership 时原服务直接返回原记录，不制造 ChangeSet。 |
| 移除单色 | `removeMembership` → `DELETE .../color-pins/memberships/:id` | `present:false`。由当前真实 snapshot 找该 target/颜色自己的 membership；已不存在应确认无变化，不反向添加，不删除其他颜色或共享 entity 回声。 |
| 改颜色组名 | `lab/native-core-color-pin-transform.mjs` 接回的 typed `renameDefinition` → `PATCH .../color-pins/definitions/:id` | 原 label-only CAS：`label / expectedLabel / expectedUpdatedAt`。这是本项目共享 definition，不是节点标题。不能借 assign 的 label 参数暗改旧组，也不能删原 CAS。 |
| 固定/取消固定 | Root 确定中的原导航 owner；不能假造 Core Artifact/Run | `set_node_pinned` 的明确 bool，不用 toggle。读取和回执应分清原 canonical marker 与普通节点自身固定，沿同一原目录呈现。 |

上面的 URL 是现有 Core 相对地址。MCP 的新调用走 Root 确定的 authenticated current-canvas adapter，不让 Agent 传 URL、项目、Workspace、可执行文件或任意 targetRef。

## 已采用的八工具接口

原五工具保留，增加 `set_node_pinned`、`set_node_color_pin`、`rename_color_pin`。原 `queryTypes` / `commandTypes` 不扩大；`GET /api/rfs/:canvas/capabilities` 提供准确三项 `guiTypes`，`GET .../capabilities/gui/:type` 提供实际 schema，写入使用 `POST /api/rfs/:canvas/gui` 直接 body：

```json
{"type":"SET_NAVIGATION_PIN","nodeId":"原节点ID","pinned":true,"scope":"local"}
{"type":"SET_COLOR_PIN","nodeId":"原节点ID","color":"#F0606B","present":true}
{"type":"RENAME_COLOR_PIN","definitionId":"原颜色组ID","label":"新名称","expectedLabel":null,"expectedUpdatedAt":"实际读到的值"}
```

固定 scope 可省略（local），或显式 cross-surface；false 是清除该期望状态。Python 不把 GUI body 包成 execute commands，也不自行切换/创建、推断保存成功。GUI schema 仍只从真实后台取得；没有该能力的服务不会被 `list_tools` 假装公布。

产品文件：`scripts/native-space-kernel-mcp.py`，`lab/pilot/native-session-canvas-target.ts`、`native-session-canvas-host.ts`、`native-session-canvas-ui.tsx`。原 client 和构建器不含固定工具数，无须复制新 client。现用协议、权限、session 和 inspect-only 脚本的工具断言同步为8；旧 MD 证据保持原样。

## 工具和权限呈现

- 两个首选名字：`set_node_pinned`、`set_node_color_pin`。若本轮同时承接共享颜色组改名，建议 `rename_color_pin` 独立工具，而非混入“添加颜色”的含义。
- 当前原 server 名为 `lcos_` + 最多32字符，模型最终函数名还有 `mcp__` 和 `__`；上述名字连最长原 server 名都能保总长 ≤64，不用重新设计命名。
- 新工具 schema 继续从实际服务能力派生。保原 loopback/Bearer/当前 project+Workspace+Canvas、动态子现场归属、locked 与准确 target 保护；不放开任意 node-data。
- 原 PermissionTray 显示“固定/取消固定这张卡”“添加/移除某颜色”。共享颜色组改名应说明影响项目内使用该颜色组的位置，不能暗示只改当前节点。
- 明确 set 让结果可以读回；未知结果仍不能自动重放。MCP 写动作的 `idempotentHint=false` 和原失败/partial 回执保留。

## 读取与立即显示

继续复用 `inspect_nodes` 的原 `result.nodes`、label/position/style，不新增独立查看窗口或全量内容读取。建议附最小 GUI 读回：强调 bool、是否固定及确证 marker/scope、颜色 definition/membership 的 ID、hex、label；改名所需旧值/updatedAt由同次真实 snapshot 提供。

精简读回不能伪造否定事实：未读取成功时应标记该部分 unavailable，不能回 false 或空数组；现有正文、文件路径和 raw reasoning 不需要混进这些字段。内容 revision 变化本身不应禁止普通视觉表达，跨 artifact/view 或 typed entity 换绑则继续准确核对。

后台写入成功不等于当前 GUI 已更新。Root 在 `inspect_nodes.result.nodes[].gui` 提供真实 availability / navigation / colorPins（含 definition 与原 CAS 值）；Reader 分支沿既有项目事件/订阅补即时刷新，不另加 store/stream、不用刷新页面掩盖。本 agent 的 transport/原权限接线不能单独销掉此实屏验收。

## 定向专项证据

- 真实 installed MCP 2.1.1 client/stdio + 明示 loopback HTTP stub：7 项 PASS。八 schema 按原 query/command/gui routes 派生；explicit true/false 与 rename CAS 原值准确传到 gui；未知写与 stale CAS 保持错误且只调用一次。报告：`output/原画布内核薄接入_20261023/MCP协议回归.json`。此处不冒称 Core producer 已完成。
- 实际原 PermissionTray 呈现函数：4 组 PASS。固定/取消、单色添加/移除保其他颜色、共享改名范围、原 request 与 callback 不变，null raw input 不崩。报告：`output/Agent纯GUI强调_20261027/原权限呈现.json`。
- installed ACP SDK + 实际原 Host/session/permission owner：9 组 PASS。覆盖准确动态子现场、原 Bearer、未知/外项目/扩能力/缺 GUI 能力拒绝、连接迟到、busy、原 permission Map、原发送内容/Scope 不变及最大32字符原 server 名的64字符模型函数名上限。报告：`output/原会话画布工具_20261023/定向验证/2026-10-27T04-05-42.504Z/report.json`。AgentConnection 与 GUI capability HTTP leaf 明确受控，不冒称真实 provider。
- 新负例发现旧 Host 的诊断分支 `regex.test(undefined)` 会误入，再读 `error.data.errorKind` 弄成500。仅加真实 string 判断；现在旧5工具回执仍503/unconfirmed、不能启动 prompt，之后显式同 owner 8工具准备可恢复。原失败报告保留，没有删错误或伪 ready。

需统一重建 Core 与原 Host，不能只替 Python 源就沿用旧5工具 Host。原准备器/manifest 参数、token和项目历史继续保留；本 agent 没有启动/停止活动 Host。安全只读诊断沿现 `native-session-canvas-live-read.mjs --inspect-only --expected-pid=...`，现在检查8工具，仍0 runtime-add/remove/abandon/resume/prompt，不把已断开原 transport 写成已挂载。

MCP GUI 返回语义也已实测：只有 body.status=confirmed 才成功。HTTP200但 unknown / rejected 仍 isError=true，完整 coreResponse 原样保留，不把 transport200当保存成功、也不自动重发。协议报告保留这两类200反例与原 HTTP error/partial 反例。

Core 原同步去重与 Collection/Run 解析已另做10组独立真实Core专项，见 `docs/Core导航固定去重与Run集合解析_20261027.md`；不是把 transport stub 当成 Core 完成证据。

## 定向验证范围

1. 实际 MCP schema 与 explicit true/false；同值重复是无变化，未知结果不重发；错误颜色、外项目/现场、锁定和换绑拒绝。
2. 原 session exact target / 动态子现场与权限 ownership、工具总数和模型函数名长度；受控 ACP 结果不冒称真实 provider 已调用。
3. 隔离真实 Core原 assign/remove/rename 主键与事务；只改明确颜色，保其它颜色/共享对象；rename原CAS冲突不丢。
4. 统一构建后再由Root指定独占真实页面：原UI即时显示、原回程和输入/相机不偷换，完整消息/图/字节保护；模型调用保持0。
