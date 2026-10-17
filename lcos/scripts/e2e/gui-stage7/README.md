# Stage7 真实 Motion 组件检查

从仓库根目录运行：

```bash
node scripts/e2e/gui-stage7/run.mjs /absolute/path/to/evidence
```

使用 `huabu/apps/web` 已安装的 React、Motion、Vite 和 Playwright。缺少依赖时脚本非零退出并写出 `BLOCKED_DEPENDENCIES`，不联网安装、不升级生产依赖、不换成动画测试替身。

这是实际展示组件的隔离检查。数据和外围测试按钮都明确是 fixture，不是 Local Core / ReactFlow / 正式导航。用例会启动本机 `127.0.0.1:4177` 并在结束时关闭；该端口占用时失败，不替换用户服务器。

关注：Atlas/手牌在退出中保持 DOM；快速反转保持同一 keyed 元素；退出中 inert；键盘关注；集合完整身体激活；多卡池；时间轨真实 DOM focus；Portal scene 跨状态保留；五档宽高和减少动态效果。

录屏、截图、原始结果写到参数指定目录。正式合并前还要运行仓库现有 typecheck/lint/test/build/E2E，以及真实 Core、相机、跨现场恢复和安全区测试。

2026-09-20 网页沙箱结果：`motion/react` 未安装，脚本退出 1，实际 Motion 用例执行 0 项。不能把本文件的用例数量当作已经通过。
