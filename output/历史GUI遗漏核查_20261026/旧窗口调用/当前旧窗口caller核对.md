# 当前构建的旧窗口 caller 核对

核对时间：2026-10-25T17:10:47.585Z。候选运行目录：`isolated-node-carry-20261020`。

按当前采用源规则读取 LCOS GUI 与 lab/pilot（包含未入包文件），共 31 条 openWindow 直接调用，分布在 16 个文件；按当前正式组合变换核对后，当前 UI 已入包模块内仍有 7 条。**入包不等于分支已触发，不能当作同等数量的实屏故障。**

## 当前入包仍保留的调用

| 文件与原源码行 | 旧目的地 | 改接去向 |
|---|---|---|
| [native-collection-ui.tsx:431](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:431>) | `'collection'` | 原 Pile/Gallery/Group 与原成员详情 |
| [AssemblyBody.tsx:896](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:896>) | `'portal-preview'` | 原位置轻预览及原 Workspace 导航 |
| [AssemblyBody.tsx:911](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:911>) | `destination.bodyKey` | 动态目的地须按真实 body 类型翻译；不得继续开启旧管理页 |
| [AssemblyBody.tsx:971](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx:971>) | `'archive'` | 原库归档分类/详情/恢复 |
| [CollectionWorkViewBody.tsx:113](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx:113>) | `'conversation'` | 原右栏原标题/会话内容；保留准确会话与请求回程 |
| [CollectionWorkViewBody.tsx:116](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx:116>) | `'run-review'` | 同一原右栏任务内容及返回栈 |
| [CollectionWorkViewBody.tsx:119](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx:119>) | `'collection'` | 原 Pile/Gallery/Group 与原成员详情 |

## 全部文件：改接、兼容与未入包区分

| 文件 | 真实采用来源 | 原调用→变换后 | 当前模块入包 |
|---|---|---|---|
| [native-collection-ui.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx>) | 工作区副本 | 1 → 1 | 是；不代表已触发 |
| [NativeConversationProjectEntry.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/collaboration/NativeConversationProjectEntry.tsx>) | 工作区副本 | 2 → 2 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [LcosComposerHost.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx>) | 工作区副本 | 3 → 0（实际生产组合变换） | 是；不代表已触发 |
| [LcosActionArc.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/navigation/LcosActionArc.tsx>) | 工作区副本 | 5 → 2（实际生产组合变换） | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [LcosNavigatorIsland.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/navigation/LcosNavigatorIsland.tsx>) | 工作区副本 | 1 → 1 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [ExecutionNodeBody.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/nodes/ExecutionNodeBody.tsx>) | 工作区副本 | 1 → 0（实际生产组合变换） | 是；不代表已触发 |
| [GlythNodeBody.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/nodes/GlythNodeBody.tsx>) | 工作区副本 | 1 → 1 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [PortalNodeBody.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/nodes/PortalNodeBody.tsx>) | 工作区副本 | 1 → 1 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [ColorPinHud.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/pin/ColorPinHud.tsx>) | 工作区副本 | 1 → 1 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [AssemblyBody.tsx](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/AssemblyBody.tsx>) | 显式当前 GN2 只读源 | 3 → 3（实际生产组合变换） | 是；不代表已触发 |
| [CollectionWorkViewBody.tsx](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx>) | 显式当前 GN2 只读源 | 3 → 3 | 是；不代表已触发 |
| [ConversationContinuationControls.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx>) | 工作区副本 | 2 → 0（实际生产组合变换） | 是；不代表已触发 |
| [RunWorkViewBody.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/professional/RunWorkViewBody.tsx>) | 工作区副本 | 1 → 0（实际生产组合变换） | 是；不代表已触发 |
| [LcosCanvasCapabilities.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/shell/LcosCanvasCapabilities.tsx>) | 工作区副本 | 3 → 3 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [LcosProjectSystemMenu.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/shell/LcosProjectSystemMenu.tsx>) | 工作区副本 | 1 → 1 | 本次三个 UI 包未检出模块，不报当前默认入口 |
| [LcosRailway.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/shell/LcosRailway.tsx>) | 工作区副本 | 2 → 2 | 本次三个 UI 包未检出模块，不报当前默认入口 |

## 需要人工判定的边界

- ProfessionalWindowStage 仍保留旧 body 分派与状态恢复。仅移掉新入口不足以退役，必须迁移地址、未完成输入和返回位置。
- 选用源覆盖、当前磁盘副本、已构建包分别核对；没有拿副本里残留的旧调用替代真实组合变换。
- 本表只计openWindow直接调用；openAssembly/openReader封装、shell恢复、旧portal/overlay、原厂商window.open/API旁路另见本次历史GUI遗漏主报告，不把源码调用数当功能覆盖率。
- 当前没有入包的 ColorPinHud、LcosRailway、旧 Atlas/Hand 等不计为默认实屏窗口；保留功能迁移和潜伏旧实现记录。
- 导图仅将按钮 portal 到原 Viewer 的既有动作槽，不构成第二窗口。普通原编辑路径保留的默认 dialog 和旧 GN2 恢复分支，分别登记。
- 本清单是代码定位附录，逐功能流程、原件owner与修法以50项审查主报告为准；没有进行自动删窗或清状态。
