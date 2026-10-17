# 三视图 Dock 避开原 Toast

结论：源修已完成，独立 Chrome DOM 测量通过；等待 root 统一构建后检查真实 Toast。只改 [现有避让 selector/filter](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/surface-dock-ui.js:168>)，纳入 `[data-sonner-toaster] [data-sonner-toast]`，包括没有 button 的 busy Toast。原 rect、ResizeObserver/MutationObserver、measure owner 与原动画未改，没有新增窗口/Toast root/相机或布局 owner。

[DOM 结果](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/Dock原Toast避让DOM/dock-avoidance-result.json>)：

- 按实图 Toast `x542..896/y942..995` 测量，Dock.bottom 从 976 调到 930，正好保留原 12px 间距；busy 无 button 也生效。
- Toast 增高到 73px 后，原 observer 重测使 Dock.bottom=910；不碰撞、上方、隐藏、移除均不预留假空间。
- 原 ≤100px 高度和下半区限制保留。Main/Context/Workflow 三键全部保留并可点，原回调顺序通过。
- 1000×800 原右栏/底控件避让、1440×1000 原 Toast 避让均通过；原 Surface transform/Ke/ReactFlow 数量检查通过。

截图：[busy](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/Dock原Toast避让DOM/screenshots/dock-busy-original-toast.png>)、[unknown](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/Dock原Toast避让DOM/screenshots/dock-unknown-original-toast.png>)。这是实际 Dock 代码和浏览器 DOM 矩形，Toast 位置/属性为夹具；候选未访问，Core/模型写入 0。真实页面/Toast 动画后的最终矩形由整页报告单列。

本轮 TS 边界：`confirmNativeLibraryPlacementReceipt` 由原 store source transform 增加，独立 AST/执行/browser 编译覆盖了该结构。没有跑全项目 tsc，不能把结构桥接测试写成 full tsc 通过，也没有为此扩展另一套 Host。
