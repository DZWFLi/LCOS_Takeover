# 小地图 Pin：原入口与真实颜色链

结论：**没有发现 `MF/pin.enabled=false` 截断小地图 Pin 的链路。** 小地图本身不读该开关；它从已接的 `pBe` 获取 Core 分组，再按原 `Mie/KT` 当前打开组着色。已执行实际原函数直到原 SVG `rect.style.fill/stroke`，不是仅凭“原 owner 没改”判通过。本小项未访问候选、未写 Core、未修改产品或重建候选；完整实屏颜色由 root 补验。

| 原链 | 当前接线与行为 |
| --- | --- |
| page `H7 → Hj`（course 原 `UVe`） | 原 bottom-left controls 的小地图按钮；点击原 `O0.toggle()`，原 `data-active` 变 true，原 `yBe` 出现 |
| `yBe → pBe()` | `pBe` 仅把最终读取交 `LCOSUseNativeColorPinGroups`；来自同一 Provider/真实 Core snapshot，受管节点不依赖旧 `data.color_pins` |
| `Mie.setGroupOpen → KT()` | 临时高亮 owner 仍原实现。未打开组时原本就是中性灰；打开组后按 `group.nodeIds` 及真实 `group.hex` 着色 |
| `yBe.nodeColor/nodeStrokeColor → B7` | 不读 `MF`，也不重新走 `Noe/_oe` 固定六色过滤。已有非六色同样传准确 hex |
| `B7=eR → ag → TE → IE → wE` | 原 MiniMap 沿每个真实 node lookup 读取位置/尺寸；最终原 `rect.react-flow__minimap-node` 的 inline fill/stroke 接收上述回调 |

原蓝色优先读 `Cx.nodeIds`，对应 Unlimited `ID` 的 **highlightedNodes**，不是单纯 ReactFlow selection。原定位等动作尚有短暂高亮时会优先蓝色；原 `wE` 还会给 ReactFlow selected 节点加 `.selected` class。实屏应等原高亮退出，再对照打开组的颜色，不能把这个原优先级误判成断链。

## 真实 DOM 定位

原入口不带独立 aria-label。可用其原 hover span 精确定位，避免靠第几个 28px 按钮猜：

```js
const toggle = page
  .locator('[data-pile-gallery-chrome="bottom-left"] button')
  .filter({ has: page.locator(
    'span[aria-hidden="true"][class*="-inset-0.5"][class*="group-data-[active]"]'
  ) });
// 原 Tooltip key：canvas.minimap.open / canvas.minimap.close
// 原点击后：toggle.getAttribute('data-active') === 'true'
const svg = page.locator('[data-testid="rf__minimap"] svg.react-flow__minimap-svg');
const rects = svg.locator('rect.react-flow__minimap-node');
```

原 `wE` **没有把节点 id 输出到 DOM**，不能杜撰 `data-node-id`。按原 `TE` 的 `nodes.map(id)` 顺序及 `IE` 过滤 hidden/无尺寸后的序列对应，另交叉核 `rect` 的 x/y/width/height 与原 `internals.positionAbsolute` / measured。原 SVG 使用画布绝对坐标，不能拿屏幕 rect 冒充。两个节点几何完全相同时，仅几何不足以唯一对应，应再核顺序或准确读回节点集合。

## 执行证据

运行 `node scripts/native-colorpin-minimap-audit.mjs`，4 项通过：

1. 实际源确认 `yBe` 无 `MF` 调用，原 `UVe/yBe` 字节保留，生产 `pBe` 进入同一原生投影。
2. 生产 `projectNativePins` 的准确 View 自定义色 `#123ABC` → 实际变换后 `pBe` → 原 `Mie/KT` → 原 `yBe` → 原 `IE/wE`，最终真实原 rect 元素描述的 fill/stroke 均为 `#123ABC`；没有提供任何 `MF=true`。
3. 同 Artifact 另一 View 仍灰；未打开组仍灰；原 highlightedNodes 蓝色优先保留。反向对照去掉 native groups 后该受管节点确实灰，证明测试经过了接线而非硬写 rect 颜色。
4. 实际原 `UVe` 点击原按钮执行原 `O0` 开关，追踪事件与 `data-active` 正确，原 `yBe` 挂载；没有新增入口或 UI store。

证据：[小地图Pin原链只读摘录.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/小地图Pin原链只读摘录.json>)。测试执行实际原函数与生产投影模型，但 React hook/motion/store selector 是受控端口，**不是候选浏览器测量**；没有声称原小地图的拖动/缩放/窄窗布局全部实屏通过。

补充事实：root 已交付 [11:33 原色点整页报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/原色点整页/2026-10-17T11-33-44-913Z/report.json>)，记录原色点 assign 丢回包→GET 核对、原组改名、准确字节下载、定位与 clear 通过；该报告此前没有小地图颜色步骤，因此本小项仍分别记账。
