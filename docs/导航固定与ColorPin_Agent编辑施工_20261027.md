# 导航固定与 Color Pin：Agent 编辑、原入口与真实页验证

2026-10-27｜本地工作区 `E:/Codex 项目/LCOS夺舍计划_20261013`。

导航固定、材料颜色增删及颜色组改名已接到用户和 Agent 共用的原能力，独立于阶段、Run 和工作流。原页正常完整链、导航交错、最终颜色刷新与颜色交错均通过。当前 Core97832 / Host78692。

## 本轮落地

| 项目 | 最终接法 |
| --- | --- |
| 导航固定 | 用户继续原节点 More；Agent `set_node_pinned` 明确设固定/取消，支持 local / cross-surface。原 Core SpatialMarker 仍是唯一记录。 |
| 多范围固定 | 单笔准确取消；local / cross 同时存在时只显示一个“管理固定”，进入原目录逐项处理，不猜删、不重复新增。 |
| Color Pin | 用户继续原 Pin/六色 Popover；Agent `set_node_color_pin` 添加/移除准确材料 View 的所选颜色，保其它颜色和对象共享回声。 |
| 颜色组名称 | `rename_color_pin` 沿原 definition / CAS 修改项目共享组名；原 inline 改名和菜单保留，不添窗口。 |
| 即时显示 | 复用原项目事件和原画布订阅。目录/面板开着就能收到外部修改；保输入、焦点、搜索、滚动、视角及返回记录。忙态结束补一次读取，不重放写入。 |
| 并发交替 | 有效回执后被另一方删除/替代/改名，显示最新事实；未取得有效回执的未知写仍保留核对。修复目录关闭后派生 pending 不结算的卡住问题。 |
| 反馈准确 | 外部颜色实质变化后清过期成功文案；错误、未知和核对提示保留。 |
| 工具读取 | 原 `inspect_nodes` 追加真实 `.gui`。附加 GUI 信息不可读时标 unavailable；不把失败写成没固定/没颜色，也不拖垮本来可用的结构查询。 |

原三查询、位置和强调工具保留，共八工具。新 GUI 操作不接受正文、任意地址、项目/现场覆盖或 Run 参数。正常材料升版本不锁住 GUI；换目标、换归属和原锁仍校验。失败/未知不自动重试，原事务、颜色改名 CAS、原权限呈现与 ChangeSet 保留。

## 新入口与窗口跟审

- 新增产品窗口 **0**，新增可见入口 **0**。节点 More 的固定项、原 Pin、原固定目录各用原入口。
- 目录读失败时 header/body 重复刷新 **2→1**；保具名错误、原重试和焦点回交。
- 文本格式菜单和 More 是正常的不同功能，已按原 tooltip / testid 核对，没有误删格式能力。
- 原颜色组操作、单节点颜色及固定目录承担不同范围，未靠藏功能或强开按钮假装接通。

## 真实页面证据

全部访问原 `http://127.0.0.1:56311/canvas/surface-core-main`，原界面真实点击 + installed MCP 单次调用；无模型发送、无产品 setter、无 force 点击，外网与无关协议拦截。观察脚本只读取原状态，不伪造业务响应。

| 路径 | 结果和证据 |
| --- | --- |
| 原 More 用户固定 → 开着的目录接 Agent 取消/增加 → 原目录取消 | [正常完整链 PASS](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-00-00-185Z/report.json)。搜索焦点、query/scroll、镜头保持。 |
| cross 单笔原 More 取消；双 scope 一个“管理固定”进入原目录 | 同一完整链 PASS；两笔均准确取消，单一页面和入口。 |
| 原 palette 用户加色 → 同开面板 Agent 删/加 → 用户移除；Agent 改名 | 同一完整链 PASS，8 次实际 MCP。360×400 原目录及44px入口的在屏边界和实际命中通过。 |
| 用户固定有效 ACK 后立即被 Agent 取消 | [导航交错 PASS](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-03-19-872Z/report.json)。只延迟原 GET、不改响应；显示已变化、pending=false，0重复POST，标记回0。 |
| 最终颜色源：原 palette 用户加色后，Agent 删色 | [颜色刷新 PASS](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-32-05-905Z/report.json)。同面板 pressed=false，旧“已添加”真实消失；输入、镜头、窗口状态保持，Canvas写入0。 |
| 最终颜色源：有效 ACK 后被 Agent 取消的交错 | [颜色交错 PASS](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-35-49-166Z/report.json)。只延迟原 snapshot GET、不改响应；原 Changed 提示、pressed=false、控件enabled、pending=false，0重复POST/Canvas写。 |

源代码专项亦已通过：[薄适配12组](导航与颜色Agent薄接回_20261027.md)、[原 Core 导航10组](Core导航固定去重与Run集合解析_20261027.md)、[工具/权限/Host 接线](导航固定与ColorPin_Agent工具接线_20261027.md)、[导航 ACK16组](../output/导航固定并发ACK_20261027/2026-10-27T04-55-39-960Z/report.json)、[颜色原控制器27组及前端审计](导航固定与颜色标记前端同步_20261027.md)、[独立实际 CoreColorPinClient/控制器14组](颜色标记有效回执交错复核_20261027.md)。包含 no-op、坏/丢回执、原404、原Undo同id恢复、新id不追删、改名覆盖、正常升版本、typed Run 原锁与旧owner拒收。原完整Facade、结构查询及强调回归保留通过证据。

## 数据与共享布局

| 内容 | 结果 |
| --- | --- |
| 原文件 | 26份逐字节比较一致（原22+上批4测试摘录）；本轮未创建材料或改正文。 |
| 对话 | 全36条、长会话28条；原消息及续聊操作34条保持。GUI原ChangeSet按真实操作新增，未清历史。 |
| 标记 | 测试固定最终0、颜色成员最终0；保留1个获授权原预设 `#F0606B` 定义“珊瑚红”，明确是保留差额。 |
| 布局 | 用户已明确答复正在手动整理。主画布7处新位置、version123→134是该期间检测到的变化，全部保留；不复原旧截图。最终颜色测试从当前布局取前事实，禁止一切Canvas写（含echo）。 |
| 保护范围 | 颜色测试精确比较其它事实与26份文件。若用户继续拖动，仅逐节点分列 Main position/version/updated_at，不泛忽略Canvas或其它字段。 |
| 运行 | 当前 Core97832 / Host78692，同一原运行参数。[最终事实](../output/Agent导航固定与ColorPin_20261027/最终事实.json)与[最终颜色记录](../output/Agent导航固定与ColorPin_20261027/最终ColorPin.json)已保存。旧实时会话只读诊断仍未确认挂载，见下表。 |

[布局差异记录](../output/Agent导航固定与ColorPin_20261027/颜色交错重建差异诊断.json) 与颜色重建前后事实保留；最初整组比较失败没有抹掉。用户确认是本人整理后，才将其作为合法共享布局变更分列。

## 失败记录保留

- `04-35-17-150Z`：原文本多个不同菜单被测试误当多个More，0写时停；修选择器，未删产品功能。
- `04-42-35-853Z`：local链已通，后续cross被 pending 锁住。修真实ACK覆盖及结算问题；[旧准确marker原UI取消](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T04-49-09-222Z/report.json)、正常链及专门交错均另留 PASS。
- 早期隔离测试的fixture变量/旧版本状态预期错误，保留原 false，修测试后另留通过结果，未为过测放宽产品。

## 未接通与后续顺序

| 优先级 | 仍在册 |
| --- | --- |
| P1 | 无 canonical 引用的普通节点导航、部分非材料混合成员的 Color Pin authoring 尚未完整；不能伪造 View、套强调字段或删入口销账。共享对象颜色本轮以原回声保留，Agent单节点写只改准确材料View。 |
| P1 | 原实时会话仍断开；原 Host 只读返回409 `canvas_owner_changed`，八工具发现不等于旧会话已挂载。未做runtime-add/remove/abandon/resume/prompt。[只读报告](../output/原会话画布工具_20261023/真实会话挂载/2026-10-27T04-35-02.436Z/report.json)。 |
| P1 | 首次原资产变换慢，仍可能占事件循环；没有跳过加载或把超时当空数据。 |
| P1 | 已保存摘录但来源关联失败的原页恢复、完整Arc/W3/Figma及其它历史GUI余项，沿[上一批账](新接功能GUI跟审与极简接回_20261027.md)继续，不在本轮冒称全量完成。 |

## 主要施工位置

Core标记薄适配和原owner路由：`lab/pilot/native-canvas-gui-markers.ts`、`native-space-kernel.ts`、`surface-core-facade.ts`、`lab/native-core-navigation-pin-transform.mjs`。

原界面及失效刷新：`native-navigation-state.ts`、`native-navigation-markers.ts`、`native-navigation-ui.tsx`、`native-navigation-directory-state.ts`、`native-navigation-directory.tsx`、`native-colorpin-controller.ts`、原节点工具栏transform。MCP与session沿原`native-space-kernel-mcp.py`和原Host/权限路径；`lcos/`、`reference/`原件只读。


## 实屏索引

[双范围在同一原目录](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-00-00-185Z/02b-both-scopes-one-original-directory.png) · [原六色面板](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-00-00-185Z/04-agent-color-live-same-palette.png) · [360×400原目录](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-00-00-185Z/06-narrow-original-directory.png) · [最终原面板：移除后旧成功提示消失](../output/导航固定与颜色Agent同步_20261027/真实原页/2026-10-27T05-32-05-905Z/02-same-palette-agent-removal-current-state.png)。

最终两段测试都没有发生新的布局差异，完整事实与26份文件字节严格相同，原1个“珊瑚红”定义精确恢复、成员0。用户此前的手动位置调整完整保留；原PNG当前190.49,37.06，尺寸375×250。没有为恢复旧测试图而挪动节点。
