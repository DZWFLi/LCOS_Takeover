# 原生 Drop 末态事实与最终 QA

结论：最新 **23560 / 56239** 的原鼠标移动、原 Ctrl+Z / Ctrl+Shift+Z，以及移动后原库重复投放，整轮 PASS。所有 Chrome 已关闭，候选写窗口已交还 root；实际末态保留，没有回填旧初点。

| 实测 | 真实结果 |
| --- | --- |
| 原 Canvas 鼠标移动 | 原 batch 200，live world `(706.1449885583523,-243.64679633867277)`，原 PC 保存 `(706.14,-243.65)`，Core / Presentation / semantic GET present 同步 |
| 原 Ctrl+Z → 原 Ctrl+Shift+Z 各一次 | 两笔原 batch 均 200；history index `1→0→1`，size 2；准确往返本次起点 `(624.28,-217.45)` 与新点 |
| 移动后两次原库真实拖动 | 材料 POST 0 / GET 2 / measurement POST 0，同 carrier/ref 保持新点，不被另一释放点移回 |

原 API/document/camera 保持；真实鼠标仅选择目标，其他节点/连线及另外两份 Canvas 不变。Artifact/Revision/FileRecord、关系、Workspace 成员和 Run 没有偷建或修改。没有 API setPosition/undo、伪 DragEvent/DataTransfer、隐藏 store 写入或模型调用。

- [移动/原 Undo/Redo JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原材料移动与原历史GUI/2026-10-17T04-55-34-378Z/report.json>)
- [移动后原库 repeat JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库真实鼠标拖动/2026-10-17T04-56-14-346Z/report.json>)
- [末态事实 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/末态事实_23560.json>)：health 加 CoreGraph、Runs、Presentations、三 Canvas 六份完整 envelope。六项数据与最后 Main repeat 前完整 deepEqual；PID 23560，realCoreConnected true，fullScopeComplete false；Artifact **17**、Revision **64**、FileRecord **64**、View **23**、Relation **2**、Run **1**。

两个 fixture 失败照存：首轮误命中淡出的原 loading overlay，在 mouseDown 前停，改为等其自然 hidden；第二轮原 Undo DTO 的空 root parent echo 和省略 title 被测试拒绝，导致 Core 未回原点。仅精确放行同 API/确版 carrier 的这两个原序列化形式，其余 data/ref/父级保护保留，后续整链通过。没有为此改产品、强点或覆写失败 JSON。[加载失败](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原材料移动与原历史GUI/2026-10-17T04-45-37-313Z/report.json>) / [Undo 被 fixture 拦截](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原材料移动与原历史GUI/2026-10-17T04-49-55-755Z/report.json>)。

此前 41268 的 Main/Context repeat、Workflow 首笔 POST200 丢回包→30秒仅1POST→原 toast GET核对→原 full/delta 保存→repeat，以及 Composer 纯 draft 已各自整轮通过；最新构建只回归本次修复相关移动和 repeat。全部证据、产品修复因果和未覆盖项见[专项总记录](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库真实鼠标专项.md>)。

边界：Glyth 无真实节点，子 Workspace/portal/rail/其他 MIME/完整创建撤销未全页验证；不宣称全区完工或视觉成熟。外网 HTTP/WS 与启动 events/execution reconcile 被 fixture 拦截，图中重试同步提示不能当产品缺陷或已验证自动链。当前保存点 **(706.14,-243.65)**，不再发写。
