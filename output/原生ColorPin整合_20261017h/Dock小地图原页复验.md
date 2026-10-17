# Dock / 小地图真实原页复验

结论：候选 **PID32252** 已实际加载避让修复，360/320px 的原地图开关、关闭后回位、重开后避让及三键零重叠通过。这里只确认 **地图与三视图 Dock 的布局**；`wholeFlowPassed:false` 继续保留，没有把未接建议和默认0宽画布洗绿。测试浏览器已关闭，运行窗口已释放给 root。

运行：

```text
node scripts/native-minimap-gestures-readonly-browser.mjs --base-url=http://127.0.0.1:56239/ --expected-pid=32252 --narrow-only --continue-known-blocked-suggestions
```

| 真实原操作 / 视口 | 实测 |
| --- | --- |
| 360px 原“收起对话”后，原小地图保持打开 | Canvas恢复360；Dock `(26.46,721,307.08,59)`，地图完整框 `(15,791,200,150)`，实际零重叠 |
| 360px 原小地图关闭 → 原按钮重开 | Dock y `721 → 874 → 721`，原测量 owner 实际回位，不是固定 bottom |
| 320px 原地图打开 | Canvas宽320；Dock走原compact宽159，rect `(80.5,721,159,59)`，三按钮全部保留，不越视口 |
| 320px 原地图关闭 → 原按钮重开 | Dock y同样 `721 → 874 → 721`，原按钮可达，重开后无覆盖 |
| 两个宽度，原 marker 与相机映射 | 原 getViewport / getNodesBounds 只读核对通过，没有 API 相机 setter、节点更新或假 fixture |

实际 `rf__minimap` 元素位于其原1px外框内：顶边792，Dock底边780，所以对生产测量障碍的间距为 **12px**。外侧指针/边框完整框顶边791，间距为 **11px**。报告同时保留两组数值，没有把外框间距写成12。

## 仍不通过的整段范围

- 默认360px原对话展开时，Canvas仍为0宽，地图DOM挂在其后却被遮住；本轮仍需显式点原“收起对话”，没有假称修了整个小屏布局。
- 当前Canvas的 `POST /api/agent-gateway/v1/conversations/suggestions/dynamic` 出现一次，body `count:5, mode:mixed`。它仍在浏览器 **abort**，没有送后端、没有假200；仅按预先约定继续独立几何测量。没有其他业务写。
- 亲看截图，原右下“看看下一步做什么”提示泡仍会覆盖小地图右下部分。Dock这条覆盖已解决，不能因此声称所有浮层都已避开小地图；建议入口是否可用也未通过。
- 本轮使用 `--narrow-only`，没有无意义重复已经记录通过的桌面pan/zoom；桌面手势范围见 [修复前手势报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图真实手势验证.md>)。

## 证据与数据边界

最终结果为 `layoutPassed:true`、`wholeFlowPassed:false`、总 `passed:false`。Graph、Runs、Presentation、binding、三Canvas以及Pin snapshot **八份完整响应前后 deepEqual**；pageErrors/routeErrors均为空。只放行诊断和原幂等execution reconcile启动请求，未构建、重启、发模型或写业务。依据当前32252之前事实读取，没有复用5532旧数据当作这轮before。

- [实际报告与矩形](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图只读手势/2026-10-17T12-07-14-479Z/report.json>)
- [360px 实图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图只读手势/2026-10-17T12-07-14-479Z/04b-width-360-original-collapse-chat.png>) / [320px 实图](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图只读手势/2026-10-17T12-07-14-479Z/04-width-320.png>)
- [before 八份响应](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图只读手势/2026-10-17T12-07-14-479Z/before-facts.json>) / [after 八份响应](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图只读手势/2026-10-17T12-07-14-479Z/after-facts.json>)
- [源码与独立DOM回归说明](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/Dock小地图避让修复.md>)
