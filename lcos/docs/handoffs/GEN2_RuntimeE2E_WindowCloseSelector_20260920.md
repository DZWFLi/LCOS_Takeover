# GEN2 Runtime E2E 窗口关闭选择器修正

- 范围：`scripts/e2e/gen2-ux-runtime-contract.mjs`
- 原因：共享窗口新增停靠/分组按钮后，旧脚本用通用图标选择器命中 4 个按钮，无法继续验证产品路径。
- 修正：按既有 `aria-label="关闭窗口"` 精确点击关闭按钮；不改产品行为。
- 验证：隔离栈 `43131 / 3011 / 5273` 上运行 `node scripts/e2e/gen2-ux-runtime-contract.mjs`，结果 PASS，console/page/http error 均为 0。
- 证据：`.e2e-data/shots/gen2-ux-runtime-contract-1440.png`
- 回滚：还原该选择器一行即可。
