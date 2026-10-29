# 普通 Frame 接回原 Group（2026-10-28）

结论：普通 Frame 的数据与父子关系原来就由 Huabu 保存；旧适配把所有 Frame 都当 Collection 外框，导致普通框使整页 GET 失败。现补普通框的原 Group 投影，导航与颜色仍走同一个普通 GUI owner，没有假 Collection、View 或第二空间库。真实原页待统一束验证，不能用 Core 通过代替。

## 已改与保护

- [投影模块](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-frame-projection.ts:18>)：仅无 binding、无任何 reserved ref（含 null／半截 Collection）且当前唯一 Workspace 的普通 Frame 进入普通分支。已有 Collection 字段仍沿原 Collection／binding 严格核验，失败不降级。
- 同一 spatial id、原 local xy、parent 和尺寸映射到 TapNow 原 group；createdBy=client、layoutType=none，避免原 i3 的 server 首挂自动排版。保原 label、locked（包括 false）、继承 non-draggable 与 GUI 字段。
- 缺父、错类型父、重 id、自环／父环、坏位置尺寸拒绝；合法根 undefined/null 保留。原 SET_NODE_PARENT 的 detach 用 null，原容器 mutation 会移除 parentId；0／false／空串不冒充根。
- Root 沿既有 LCOSNativePileCollectionShell 的普通 group 分支把未接的云工具过滤掉，保原 i3 body／h5 与 ua→JT。当前原 Vde 变换在判空前补原 More／Hie；无需第二浮条。原 Group 的运行、工作流、排版和拆组本轮不擅自放开。

## 已执行

[新专项](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-ordinary-frame.test.mjs>)执行真实原投影＋隔离 Core／SQLite／Huabu／facade：7 组通过（16-47-20-621Z；显式 null 断言补跑随后追加）。覆盖 root／nested Frame＋note leaf 的原 CREATE_NODES/SET_NODE_PARENT、完整 Canvas GET、用户和 Agent 两族标记正反与 no-op、原锁与继承、原 DTO echo／量测保存、普通 parent detach patch 拒绝。正文、位置、大小、parent、领域、binding、execution 和 7 份原文件字节均保留，0活动 Core／浏览器／模型。

[通过报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/普通Frame导航颜色_20261028/2026-10-27T16-47-20-621Z/report.json>)。

旧首轮 [16-39 失败](<E:/Codex 项目/LCOS夺舍计划_20261013/output/普通Frame导航颜色_20261028/2026-10-27T16-39-54-522Z/report.json>)保留：解锁后原 data.locked=false，被初版投影省略，原完整 DTO echo 501。已改为保 own locked 值，原严格 echo 没放宽。旧 Collection 专项只剩普通 Frame 必须501的过时断言，由 Root 更新，不冒称老脚本首跑绿灯。

## 原页隔离数据与待验

- label：isolated-ordinary-frame-20261028-9dc7ede7。
- runtimeRoot：E:/Codex 项目/LCOS夺舍计划_20261013/.runtime/isolated-ordinary-frame-20261028-9dc7ede7（直接原启动器目录，未搬数据库）。
- canvas：surface-core-main；原节点 ordinary-frame／nested-frame／frame-child。
- ordinary-frame 预存原橙 F4A14B；Core ColorPin definition 为0，供后续 raw-only 组改名另验。无 primary 物化节点。
- [默认 inert 原页脚本](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-ordinary-frame-browser.mjs>)已备：先只验 Frame 导航／颜色同开用户 Agent 互改、原相机定位返回、刷新且不自动排版、原橙恢复；全部正文／几何／创建／模型写不开放。原工具条两按钮和 More 三行都实际断言。等待 Root 精确 PID 与唯一 writer 授权，第一轮不点击组改名。


## 原页最终结果与范围（追加，不覆盖旧失败）

**Frame 导航固定／颜色／原目录已完成，非 Frame 全功能完工。** [最终原页 PASS](<E:/Codex 项目/LCOS夺舍计划_20261013/output/普通Frame导航颜色_20261028/真实原页/2026-10-27T17-27-16-832Z/report.json>)，Core94128，自有fixture，1500×1000：

| 原载体 | 原 More 固定／取消 | 同开目录 Agent 删加 | 原定位／返回 | 同开 Hie 用户／Agent 颜色互改 | 刷新 |
|---|---|---|---|---|---|
| 普通外框 | PASS | PASS | PASS | PASS | PASS |
| 普通内框 | PASS | PASS | PASS | PASS | PASS |

真实名称是“普通外框／普通内框”，同一原 i3/JT 保留两个按钮 Pin＋More；More 只有固定、强调、定位三行。相机原值恢复，层级与 local xy 未动，无自动排版。9 次已安装 MCP 调用（list＋8标记操作），8 次原用户 GUI 请求，原 reconcile 两次精确允许并记录；非遥测误拦0，pageErrors/routeErrors均0。最终原橙F4A14B恢复，两框无固定，Core definitions/memberships仍0；完整事实、7份Core原文件与9份Huabu节点md原字节相同，unknown=false、模型0。全部自建页面已关。

名称读桥由 Root 沿 [originalFrameSource](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:584>)读取原 space.nodes.read(frameId) 的准确 NodeContent.label，GET与batch projected echo同用，不修改节点文件；最终 [真实Core专项7组](<E:/Codex 项目/LCOS夺舍计划_20261013/output/普通Frame导航颜色_20261028/2026-10-27T17-06-33-610Z/report.json>)也逐一核对两原名及9节点md/7Core文件原字节。

### 分开的初始化与失败记录

- 16-51 原hover默认中心被嵌套框占住；16-59二次选态不是原direct selection。只改实际EFP空白点与真实单击，不设私有selection。原aUl/bl要求direct+单选，不能只看getNode.selected。
- 17-07同开目录未更新发生在harness误拦原图片初始量测的前提下；不定为产品失败。初始DTO360×240，实际DOM/zoom375×250，data/ref/src/position与原PNG488×325一致。
- [17-24原初始化保存记录](<E:/Codex 项目/LCOS夺舍计划_20261013/output/普通Frame导航颜色_20261028/真实原页/2026-10-27T17-24-27-406Z/report.json>)原HTTP200/spatial_saved=true、24→25，唯一明确允许差额是自有fixture图片360×240→375×250。除此全事实/字节同。**该整report仍false**：后续原partial {id,measured} no-op被旧五字段规则误拦，queueIdle未闲；没改同步/busy保护，没重放已保存初始化。
- 最终17-27从已存375×250新页面采前事实，完整两框通过。之后harness仅把Root已授权的partial no-op改成“实际提供的白名单字段逐个等当前准确image DTO”，未执行额外产品改动，旧false均留存。

### 仍在册，不能拿过滤工具当做完成

| 原功能 | 本轮状态 |
|---|---|
| 原f1e背景色 | 未接完整保存／历史，不宣称完成 |
| grid/horizontal布局 | 未接普通Frame原Huabu布局与历史，不放开 |
| execute／workflowManagement | 原云/业务owner未移植，不放开 |
| ungroup／拆组 | 原parent与世界坐标/Undo完整流程未接，不放开 |
| 条件download | 普通Frame完整内容与原导出owner未验证 |
| 原h5标题编辑 | 原body呈现保留；只读／可编辑策略和改名提交未实屏验证，不能把名称读回当改名已通 |
| leaf原正文／标签读桥 | 原md字节已保护，但当前通用预览仍有“合成文本”等fallback；独立待接 |
| Frame拖动/resize/创建/删除 | 本轮不验，不把导航/颜色通过外推为完整框编辑能力 |

源码原f1e未删除；Root只沿 [同一Shell工具数组](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:664>)避免裸露未连接云动作。下一阶段普通颜色组独立命名另出报告，本Frame阶段未点击改名。


后续阶段：普通颜色组独立命名也已分开实屏通过，见 [命名收口](<E:/Codex 项目/LCOS夺舍计划_20261013/docs/普通颜色组独立命名_实屏收口_20261028.md>)；Frame阶段原先0defs记录不回写，命名阶段明确另留两定义。
