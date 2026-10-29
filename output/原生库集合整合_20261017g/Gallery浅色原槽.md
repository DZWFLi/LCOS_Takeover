# 原 Gallery 黑底补修

结论：root 真实整页截图里的全屏黑底是产品问题，首放/刷新功能通过不能替它销账。现已改到原 Gallery 的真实背景层与原标记控件，保留原页面和全部操作 owner。源码、独立原样式回归及 root 最终29668整页复验均通过。

## 准确原流程与修改

- 原 `yFe` pile 点击 → `D3.openGallery` → `tFe` 原 Gallery portal。黑底在 `tFe` 自己的 `pointer-events-none absolute inset-0 bg-black`，不是 LCOS 新建窗口。改为现有 `bg-background`，沿同一浅色 token。
- `aDe/bDe` 原成员 label、缩放与可读宽度原样保留；本来已用 `text-muted-foreground`，没有改字号/排版。
- page `MF/H7/bW` 仅处理带 `data-pile-gallery-chrome` 的原 JSX 子树：硬编码暗底/白字改成现有浅色 semantic token。没有扩成全模块重染，也没有动成员图片。
- 接线只在 `lab/native-pile-collection-transform.mjs`：新 `transformNativePileGalleryPaintScript` 由既有 Collection transform 自组合。没有新服务入口、窗口、Portal、全局反色、CSS reset 或 UI body。

原 `yFe/i3`、Gallery scroll/pan/drag、关闭、导航、焦点、原动画参数和 portal container 均保留。真实整页黑底证据：[原截图](原库真实页面/2026-10-17T05-39-18-472Z/05-original-gallery-members.png)。

## 已验证

1. `scripts/native-pile-collection-transform.test.mjs` 通过，原标题/成员/拖入/合并/原 Pile 与 Group 接缝保留。
2. `scripts/native-pile-gallery-light.test.mjs` 通过。整份原 AST 只改 14 处 paint literal（course 1、page 13）；所有非指定 owner 字节相同。组合/重复转换幂等，reference 原件没改。
3. 独立 Chrome 加载实际原 CSS 和现有浅色 tokens：背景从 `[0,0,0,255]` 变为 `[255,255,255,255]`，原控件浅底深字；同一夹具的 rect/overflow/transform/transition/animation 完全相同，成员图片截图字节相同。已亲看浅色夹具图。

证据：[报告](Gallery浅色原槽/report.json)、[改前夹具](Gallery浅色原槽/01-before-original-black.png)、[改后夹具](Gallery浅色原槽/02-after-original-light.png)。

上述1–3项是 source + 原 class/CSS 实测。root 另已完整重建/重启到29668，并[实际走原库／Gallery／Escape／刷新／重开／窄屏](原库真实页面/2026-10-17T05-49-17-630Z/report.json)：背景实测rgb(255,255,255)，0 producer POST、2 projection GET，七项Core/Canvas完整事实不变，页面与路由JS错误0。root已亲看最终整页图；不把独立夹具当整页声明。
