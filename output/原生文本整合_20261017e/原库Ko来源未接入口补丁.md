# 原库 Ko 来源补丁：已验证，尚未启用

结论：原 TapNow 材料行的拖动入口已做成可审阅补丁，复用现有 Assembly MIME、`acquireDrop` 和同一 Drop store；独立测试通过。**没有接入 entry/server，没有构建或改写候选，也没有完整 Drop 成功结论。**

## 原入口 → 原容器 → 动作 → 返回

| 位置 | 本次最窄改动 | 保留与限制 |
| --- | --- | --- |
| 原 `Zp.j` 材料行 dragstart | 原行先写原 `Ko` JSON，随后把准确材料交现有 `acquireDrop`；继续原 hover/拖动样式和原拖影 | 不新增行、按钮、窗口或拖放 store；非 LCOS 原回调执行轨迹不变 |
| 同一 Assembly payload | 私有 Symbol 保存原 project/canvas/API、Artifact/View/所选 Revision/FileRecord/title、拖动起点 | 对外 MIME 不写 API/Symbol；`startScreenPoint` **不是释放落点**，不得拿它投放 |
| 原 jF document drop | 在原 `jk` parser 之前识别 LCOS 标记；未被原 capture 接住的 LCOS 在原处提示并消费 | 畸形 LCOS 也不能降级给原 `Qe/Te` URL 导入；非 LCOS 继续原路径 |
| 原语义 resolver / capture | 保留 Workspace、根 Context/Workflow、Composer、Glyth 的各自目标和原 Escape/释放重测 | 本次仅验证 transport/store，不调用真实目标 producer；没有把这些目标统一偷换成当前画布 |

新文件与交接接口：

- [来源适配](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-drop.ts:43>)：`readNativeLibraryDropCapture(payload)`、`beginNativeLibraryAssemblyDrop(event,asset,port)`、`rejectNativeLibraryDropFallback(event,rawOrAsset,notice)`。
- [现有单例连接包装](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-drop-ui.ts:9>)：`LCOSNativeLibraryDragStart` / `LCOSNativeLibraryDropFallback`；尚无入口 import/re-export。
- [原包定点 transform](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-drop-transform.mjs:35>)：只改 `Zp.j` 和 jF 原 `Ko` drop 两处，可与现有 Library transform 组合；有精确恢复比较。
- [独立测试](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-library-drop.test.mjs:15>)：`node scripts/native-library-drop.test.mjs`。

## 实测范围

[测试 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原库Ko未接入口补丁测试.json>)：7 组通过，候选写入 0、Core 写入 0、模型 0。使用实际现有 Zustand store、实际 `acquireDrop`、实际原 `bindNativeAssemblyDropEvents` 和构建选择表当前采用的 resolver；不是旧副本 resolver。

已覆盖：原 AST 可解析/幂等/精确恢复、TS/IS/CU 原字节保留、所选旧版本不替成 Current、同 payload/API 身份、来源切换拒绝、busy 不替换提交中意图、重复 drop/dragend 不重放、释放换目标/Escape 取消、历史无 View/跨项目/畸形数据拒绝、原 `Zp.j` 的非 LCOS 轨迹相等，以及 LCOS 不能进入 `Qe/Te`。几何叶子为受控端口，不能称真实页面拖放或 Core/O8 闭环通过。

## 启用前必须接实的部分

1. 原 Overlay / Router 原 committing 分支在**释放时**复核同 project/canvas/API、准确 Graph、原接收目标和原 `screenToFlowPosition` 落点。Symbol 仅是来源，不是授权；同 payload 对象须保持到 commit，不能 JSON 重建丢掉来源。
2. 按原目标分派真实 producer：普通 Workspace 确版投放；根 Main/Context/Workflow 保 Presentation；Glyth 保持久会话关系；Composer 只加同一输入引用。现 settle 对 assembly-apply 的通用 merge 也须识别真实投放回执，不能伪造 Assembly rows。
3. 首次写入仍拒绝已前进的 mutable 源 View；unknown 核对则应基于准确已落 carrier 读回。已成功后源 View 前进不能把同一确版结果永远判失败，更不能重 POST 或降 Current。见真实 Core [探针](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop源View确版探针/2026-10-17T01-47-54-486Z/report.json>)。
4. 历史无 View 拖动本补丁仍明确拒绝；Composer 原历史版本引用保留。全部 MIME、远目标、统一撤销/重做、真实原手势 GUI 均未销账。

目标分派的完整接缝与恢复矩阵见 [Drop 原目标分派接缝](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop原目标分派接缝.md>)。当前补丁可 review，先不启用，避免“能拖起来”被误报成“落到了正确的地方”。
