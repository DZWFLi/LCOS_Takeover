# 三方视觉与信息架构审计 · 证据包

2026-10-18。配套主报告：`docs/三方视觉与信息架构审计与重构原则_20261018.md`。

候选：`http://127.0.0.1:56239/takeover/`，runtime `isolated-native-flow-20261017c`（复用 10-17 21:22 快照）。
启动参数（**四个 pilot 缺一不可**，少传任一会让 `course-api-base-url-CifxI1ia.js` 返回 500 导致白屏）：

```
node lab/server.mjs --takeover --cut --full-integration --port 56239 \
  --runtime-label=isolated-native-flow-20261017c --native-rail-pilot --native-collection-pilot
```

## screens/ — 7 张实机截图（1440×900，08 为 360×800）

| 文件 | 证明什么 |
|---|---|
| `01-cold-start-1440x900.png` | 首屏 C1=30 界面控件、13 个画布对象、两个输入暗示并存、左侧文本节点溢出 |
| `02-composer-focus.png` | 点 Composer 后**无可见变化**（与 01 同尺寸），仅用于 DOM 计数 |
| `03-library-open.png` | 库展开 C1=37；库面板覆盖画布，画布中间仍挂空态提示 |
| `06-node-selected.png` | 点集合卡**无可见变化**，选中态未能取证 |
| `07-chat-panel.png` | 会话入口是 220×110 浮层（3 个可点），不是对话面板；C1=33 |
| `08-narrow-360.png` | **360px 画布完全消失**，只剩顶栏 + 空态 + 三 pill + Composer；C1=41 |
| `09-context-menu.png` | 右键**无可见变化**，右键菜单未能取证 |

## dom/ — 每屏控件几何与文案

`*.dom.json`：可见控件的 tag/role/text/aria-label/bbox，用于复算 C1。
`*.visible-copy.txt`：排除画布内容后的可见文本。

C1 复算规则：全部可见控件 − 画布内容对象（≥200×200 的集合卡 / 含「堆叠节点」的 role=button / 任务卡）。

## aria/ — 每屏 ariaSnapshot

用于核对可访问名与控件语义。`07-chat-panel` 仅 1.1KB，反映该面板实际元素极少。

## metrics/ — 七份指标

| 文件 | 内容 |
|---|---|
| `00-baseline.json` | git HEAD、候选端口/PID、四类计数契约、证据等级、已核事实 |
| `copy-inventory.json` | 796 条中文字面量全量，含 A/B 分类、判定理由、file:line、内部术语命中 |
| `token-and-entry-inventory.json` | 32 行 Figma 变量映射（canonical 承接 / adapter 重定义）+ C2 入口计数 + 色值统计 |
| `ledger-map.json` | 55 项主账处置（REPLACE 9 / DELETE 11 / FIX 29 / DEFER 6）+ 31 条多余入口 + 4 条 P0 |
| `transform-chain-all.json` | 26 级变换全 PASS（正确参数） |
| `transform-chain-collection-only.json` | 15 级 OK + 第 16 级 `fileUpload` FAIL（错误参数复现） |
| `verification.json` | 23 个抽样数字回溯结果（0 失败）、报告行数 399 |

## run/ — 可复跑脚本

| 脚本 | 用途 |
|---|---|
| `capture-01-cold.mjs` | 冷启动截图 + DOM + aria |
| `capture-multi.mjs` | 02/03/06/07/08/09 六屏批量 |
| `diag-load.mjs` | 网络诊断：列出所有 HTTP≥400 与 requestfailed |
| `diag-chain.mjs` | 复刻 27 级 transform 链，逐级 PASS/FAIL；`--rail` 为正确参数，默认仅 collection |
| `diag-anchor.mjs` / `diag-anchor2.mjs` | AST 锚点唯一性检查（c2/vZ/UX/d2） |
| `capture-01b-bypass.mjs` | 绕过故障 chunk 的对照实验（证明缺 `LCOSNativeMaterialViewerRuntime` 导出） |

`server-56239*.log` 为服务启动日志，**不入库**。

## 不在这份证据里的

- ARTIGINE 界面截图（约束：不启动它的客户端）；它的 14 控件、36 命令、42 token 均为 bundle 结构计数（C 级）
- TapNow 真实首屏（约束：不启动客户端）；30 控件为 bundle 结构计数（C 级）
- Figma PNG 的像素级几何对照（未做 DOM↔PNG 配准）
- 模型调用、上传写入、消息发送（全程未触发）
