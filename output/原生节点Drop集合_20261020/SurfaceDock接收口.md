# 三 Surface Dock 共用 Drop 接收口（2026-10-20）

已完成 DOM 注册；跨现场写入由 Root 负责，本页不宣称整条链已通。

新增 `lab/pilot/native-surface-dock-drop.tsx`，在 agent-ui 的同一个 React/Drop store 内，给现有 Main、Context、Workflow 按钮注册接收口。未改 Dock 原 Ke 切换、未新增导航 UI、未在松手前切现场。

- 地址来自 PortalDropWorkspaceContext 和 Shell 的真实 root canvas map，复用已有 surfaceDockDropSemantic。
- ID 固定为 native-surface-dock:main / context / workflow。导出 NATIVE_SURFACE_DOCK_TARGET_IDS 和 nativeSurfaceForDropTargetId；不靠标题猜地址。
- 动态位置直接读当前按钮 getBoundingClientRect；遮挡复用 isDropPointExposed。
- 原按钮禁用、身份未就绪、项目/Canvas/API/root map变化时，不执行投递；禁用按钮仍挡住下层Canvas误收。
- 缺失/重复根地址不猜默认ID；从子现场拖来仍指向对应根现场。

Root 组合：把 NativeSurfaceDockDropTargets 挂在 OriginalLCOSProfessionalHost children 内，保证处于既有 Portal provider；写端单独接已有接收producer。

验证：`node scripts/native-surface-dock-drop.test.mjs` 通过。使用真实选中的 semantic factory、resolver、registry，覆盖三root地址、child来源、明确ID、DOM几何、禁用不穿透、遮挡、staleAPI/项目、缺失/重复映射。没有业务写入或Provider调用。尚待真实浏览器联调。
