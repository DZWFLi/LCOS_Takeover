# 原小地图与三视图 Dock 避让修复

最新结论：源码已修，独立 Chrome DOM 回归通过；随后 **PID32252真实原页360/320px开关、回位和重开避让已通过**，八份响应不变。整段流程仍因默认对话占满Canvas、未接建议与提示泡覆盖保留未完成，见 [真实原页复验](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/Dock小地图原页复验.md>)。没有固定 CSS bottom、重建小地图、增加 UI、相机修改或第二个观察器；仍由原 `installSurfaceDockAvoidance` 唯一测量 owner 放置同一条三视图 Dock。

修的是已实屏确认的360px覆盖：小地图下半被 Dock 挡住。现在原 `[data-testid="rf__minimap"]` 的实际可见矩形作为障碍进入既有测量，地图不再被普通 controls 的100px高度门槛排除；传统 controls/toast 原100px及下半区域规则、12px间距、三按钮和回调全部保留。

地图只在真实非零 Canvas 可用范围内参与避让；原 SVG 层有 pointer-events-none，命中检查采用原 `yBe` 的兄弟交互 surface，并忽略 Dock 自身，避免“正被 Dock 挡住所以永远检测不到”的死循环。完全被侧栏覆盖或 Canvas 宽0的地图不预留假空间。开关、隐藏、移除和尺寸变化仍由同一原 ResizeObserver/MutationObserver 重算。

另修一条组合问题：先扫到较高 toast 时，原始 Dock 还没碰它；后扫到地图把 Dock 顶高，反而撞进已扫过的 toast。现按障碍 top **从下到上**处理同一次测量，不依赖新 observer 或反复补丁。

| 独立 DOM 场景 | 测量结果 |
| --- | --- |
| 360px，真实原形状地图 `(16,792,200,150)` | Dock bottom780，距地图12px；三键仍在 |
| 320px，同地图 | Dock保持原compact宽159，完整在320视口内，bottom780，不覆盖地图 |
| toast在DOM先于地图，y700..760 | Dock bottom688，距toast12px，同时避开地图与底部controls；没有先避一块再撞另一块 |
| 原地图关闭 / 重开 | 关闭回原bottomcontrols位置，重开再让位，不留假占位 |
| 地图完全被原侧栏形状覆盖 / flow宽0 / 地图移除 | 均回到无地图的位置，不把隐藏DOM矩形当可用地图 |
| 原busy无按钮toast、unknown带按钮toast、隐藏/移除toast、上方或>100px toast | 原规则全部回归通过 |
| 1000/1440桌面，无地图 | 原布局与回调保留，三键都可点击 |

测试：`node scripts/surface-dock-avoidance.test.mjs --output-dir=output/原生ColorPin整合_20261017h/Dock小地图避让DOM`，通过；`node scripts/surface-dock-transform.test.mjs`，通过。测试使用真实 Chrome layout、生产 Dock 组件/样式和生产测量函数；地图按实际原 `yBe` 指针结构及本轮真实矩形构造，没有假 Core handler。它是独立 DOM 夹具，**不是候选完整原 App 通过证明**。

证据：[最终测量](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/Dock小地图避让DOM/dock-avoidance-result.json>)、[360地图与toast合并实图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/Dock小地图避让DOM/screenshots/dock-original-minimap-and-toast-360.png>)、[修前真实断言失败](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/Dock小地图避让DOM_修前/failure.json>)。旧f轮证据未覆盖，测试另加可选输出路径，均写本h目录。

源码：[surface-dock-ui.js](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/surface-dock-ui.js:134>)；目标测试：[surface-dock-avoidance.test.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/surface-dock-avoidance.test.mjs>)。production现已冻结；源码与独立DOM阶段没有访问候选，后续原页验证单独链接。两阶段均未构建或重启、未写Core、未跑模型。

原页复验脚本使用 `--narrow-only --continue-known-blocked-suggestions`：已知当前Canvas的suggestions/dynamic请求仍直接abort、绝不送后台或假200，只允许继续独立几何测量。其他业务写照常停测；分别输出 `layoutPassed`、`knownBlockedSideEffects` 和 `wholeFlowPassed`，原展开右栏0宽也继续在册。该轮已由 root 授权在32252执行，报告见上链；本文件其余独立DOM证据保留其原范围。

剩余仍分开记：360px默认展开右栏导致Canvas0宽、原收起后观察到suggestions业务请求被拦、320px完整原页手势未验，均见 [小地图真实手势验证.md](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图真实手势验证.md>)；本修复只避免 Dock 继续覆盖实际可用地图，没有假称解决这些项。
