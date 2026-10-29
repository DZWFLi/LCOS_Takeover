# Core 文本：原队列重发验证

结论：当前源码通过 14 组真实原 Hook / Chrome 严测；候选 `56239 / PID40728` 的整页丢回包、关窗续稿、真实30秒0重发、GET确切回执、原 Undo / Redo 各一次也全部通过，包含原始历史快照的正文和确切版本引用。下面两轮旧实屏 Undo 失败和 raw-ref 失败完整保留。这个结果只覆盖本轮声明路径，不代表全区 GUI 已全部完善。

本次只改测试：`scripts/native-text-retry.test.mjs`、`scripts/native-mindmap-browser.mjs`。产品修复由 runtime/root 的原 owner 完成。

## 不是另写一份队列自测

- 从实际 TapNow page 包依次运行现有 Cut、Node Bridge、Surface Dock、History Intent 变换，再按 AST 取实际 `r6` 依赖闭包。
- 实际使用厂商 bundle 的 `zi/cl` 请求 Hook、`bs` API、原 `s6/n6`、DTO/指纹缓存、`t6` 状态 Hook 和原画布 active/failed registry。
- 实际安装当前 `startup-history-intent.js`、`native-text-save-port.js`、`startup-surface-core.js`。POST 经过真正的 fetch 包装器、CAS 观察和确切回执核对。
- 只模拟 Flow/router/日志环境和 HTTP 对端；原 App 启动调用在测试内存副本中禁用，未修改 reference。未连接 56239、未写真实 Core。
- Playwright 控制时钟，跨过原 2.5/5/10 秒内层退避及 25 秒重排；没有改写原退避公式或另建队列。

## 通过项

| 场景 | 实际断言 |
| --- | --- |
| 正常保存 | 原 Hook → 原 API → 真包装器 → port confirmed，文本 POST 1 次。 |
| 成功但丢回包 | pending/正文保留；累计跨 2.6/5.1/10.1/25.1/60 秒，再原 flush、retry、卸载和旧 owner retry，文本仍 POST 1 次。 |
| 文本与其他工作混排 | 待核对文本独立分桶；同批普通节点和连接线各成功 1 次，不被文本卡住。 |
| 普通节点对照 | 原内层 4 次尝试 + 冷却后第 5 次成功，未认领文本回执。 |
| 普通连接线对照 | 同样保留原 4+1 次策略。 |
| 确切 CAS 冲突 | 原失败 owner/未保存正文保留；全时钟、retry、卸载不再 POST；acknowledge 不能擦掉持有的冲突。 |
| 迟到的原响应 | 16 秒超时后卸载，再放行原 fetch 响应；原观察器确认确切回执 1 次，没有补发。此处 HTTP 对端允许迟到响应，属于传输模拟。 |
| 多次只读核对 | 首次回执 404、错 wire、历史拒收均不能 confirmed；之后确切 wire + 历史接受 + Core 读回才能确认。后排同节点 position 操作仍在原队列，恢复后只投 1 次。 |
| HTTP 200 但原历史拒收 | Core body 已一致仍为 history-receipt-rejected；不更新原成功缓存、不释放失败 owner。只有后续 GET 原回执且原历史接受才释放，文本 POST 始终 1 次。 |

上表把“混排”列单独展开，因此有 9 行；测试报告按 8 个独立 fixture 场景记录。

新增 6 个实际原 O8 场景也已通过：

| 场景 | 严格结果 |
| --- | --- |
| 原 O8 早回执保存 / Undo / Redo | 原 React / debounce / `R8` / `r6`，raw history 确切引用依次 r2 / r3 / r4；Undo / Redo 索引正确，size 不增长。 |
| 原缺陷负向对照 | 仅在测试内禁新 marker 和精确 receipt 投影，回到原 setter；确实重现仅 ref r1→r2 的额外帧。不是另写一套历史。 |
| 原 O8 迟到回执 | 等 16 秒再放行原 wrapper 响应，原 history 仍只有一个保存 entry，raw 引用 r2。 |
| 同 commit 后来正文 | metadata setter 与后来正文同 React commit，真实正文帧照常记录；下一独立编辑再记一帧。 |
| 同 commit 后来连接线 | 同一 receipt commit 的实际 edge 变化照常记录；下一独立正文编辑仍记录。 |
| 纯 metadata 后的新编辑 | metadata-only 提交不造 entry；marker 消费后，下一真实用户编辑正常记录。 |

## 发现并推动修复的缺口

1. 首次只读核对后进入 `readback-matched-unconfirmed` 等状态，原白名单会挡住第二次只读核对。runtime 已修，迟到真回执案例通过。
2. 普通 HTTP 200 + Core 匹配原先能绕过 O8 拒收而 confirmed。root/runtime 已改为逐节点历史接受证明，并在原 `r6` 成功缓存前持组；新增第 8 场景通过。

## 证据与边界

- 命令：`node scripts/native-text-retry.test.mjs`
- 第一批结果：`output/原流程收口_20261017d/原队列重试验证/report.json`，原 8 组通过、浏览器错误 0。后续严测每次独立 timestamp 子目录，`latest.json` 指向当前，不覆盖旧证据。
- 最终 14 组：`output/原流程收口_20261017d/原队列重试验证/2026-10-17T00-11-42-998Z/report.json`，`passed:true`、浏览器错误 0。
- 独立结果证明当前原 Hook / 包装器 / port 组合；整页结果另列如下，不代表其他功能、真实模型或全区 GUI 已全部通过。
- 真实页面验证沿同一既有合成 Text 继续，记录在 `导图整页验证` 每次独立目录；旧失败保留，不能拿本测试覆盖旧失效事实。
- 未新增 hash、contract、数据库、第二队列或发布门禁；未安装依赖、联网、模型调用、构建/重启服务。

## 真实候选补充（2026-10-17，PID 38756）

第一轮 `2026-10-16T23-51-30-845Z` 已验证：关/重开保草稿，真实等待 30011ms 仅 1 次 edit POST；原核对 GET 缓存回执 HTTP 200；进入确版阅读、Core/live ref 一致、pending=null、O8 只新增一个保存 entry。随后原 Undo 已把 Core 正文回退，但立即读取历史 index 仍为旧值，脚本失败且未发 Redo。该失败报告/截图完整保留。

第二轮 `2026-10-16T23-54-06-936Z` 把原 index 等待补到 15 秒后，仍失败：

- loss 主链再次通过：30012ms、edit POST 1、真回执 GET 200、pending=null。
- 原 Ctrl+Z 只按一次，Core/live 确切回到旧 Alpha 正文，版本为 `revision-text-07ef15a9-07f9-487a-9c23-ba3124c9905d`。
- 原 O8 保存后为 index 1 / size 2。Undo 后等满 15 秒仍 index 1 / size 2 / canRedo false；currentEntry timestamp 从保存时改成 Undo 时。这是新记录截掉 redo 的真缺口，不能归因于单次异步瞬读。
- 未发 Redo、未循环 Undo，也没有重复提交。Chrome 已关；当前保留 Undo 后的实际状态。
- `report.json` 包含 `undoImmediately` 和 `failureState` 的完整 Core/live/history/pending；该次 `passed:false` 保留。
- 仅只读定位到 `startup-history-intent.js:1279` 的文本回执 setter 和原 O8 suppression/debounce 交界；具体产生新 entry 的差异尚未证明，交 runtime 原 owner 修，不能靠压制所有历史录制掩饰。

节点 face 同轮实测：根背景 `rgb(234,239,241)`、分支白底、文字均 `rgb(36,38,37)`；滚动容器 349×250，内容也 349×250，无溢出。记录两端均 0，不宣称本样例实际覆盖了溢出滚动。

## 实际原 O8 进一步验证（历史失败与最终修复）

夹具现在直接运行同包变换后的 `O8` Hook、真实 React state、原 debounce / `R8`，并仅在测试内只读捕获原 `x.current`。这不是产品新增 raw-history API。

- `2026-10-17T00-04-49-255Z/report.json`：当前 marker 开启时普通保存 / Undo / Redo 的索引通过；测试内只禁用新 metadata setter marker、回到原 `setNodes`，录出额外元数据帧。原 `R8` 前抓到的 candidate/prior 完整差异仅为 `data.lcos_ref.revisionId`：r2 对 r1。正文、几何、其他 data 全同。该负向场景当时尚未转成预期失败断言，所以整次报告保留 `passed:false`。
- 这证明 `flushHistory()` 的 React updater 可晚于当次 `getHistory()`：回填当时看不到将追加的真实 entry，随后仅 ref setter 又被原 debounce 当成新帧。
- `2026-10-17T00-07-20-803Z/report.json`：加到实际 raw snapshot 的严格断言后，marker-on 保存 entry 仍为正文 after、ref r1，预期 r2，真实失败。仅阻多帧不能证明确版历史已经修好。
- 最终 runtime 在原 `S` 的 candidate 构造处接精确 text receipt 投影：只对同 Canvas / Node / primary Artifact / View / exact body 且已验收的当前回执补 ref；仍用原 `R8`，不另建历史或调整索引。只有原 metadata setter 的完整 nodes+edges 匹配才跳该次提交，原 effect 随即消费 marker。
- 最终 14 组已经严格检查 saved / Undo / Redo 实际原快照 r2 / r3 / r4，以及迟到回执、同 commit 后来正文 / 连接线和后续新编辑，全部通过。后续统一构建后的候选整页也已通过，见下一节；测试不再继续扩面。

## 最终真实整页：PID40728 全部通过

命令：

```powershell
node scripts/native-mindmap-browser.mjs --base-url=http://127.0.0.1:56239 --node-id=text-a34ae67c-c735-4b2f-9d1a-e6b5caff5cb9 --lose-final-response --history-roundtrip --inspect-original-history
```

证据：[完整 report](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程融合_20261017c/导图整页验证/2026-10-17T00-14-30-272Z/report.json>)，`passed:true`。7 张截图已逐张打开确认，原编辑动作栏、待核对草稿、确版阅读和原节点往返均有对应截图。

- 同一既有合成 Text；seed unchanged，没有新造材料。原外框关闭 / 重开保留未保存与待核对草稿。
- 真服务器成功响应被测试拦截丢弃，真实等待 **30015ms**，edit 只有 **1 次 POST**，没有自动重放。
- 点原“核对保存”，真实 GET 原缓存 HTTP 回执 200，确版阅读 / Core / live ref 一致，原队列精准确认后 `getPending` 为 null。
- 原 Ctrl+Z / Ctrl+Shift+Z 各一次，额外 CAS 各一次；原 history index **1→0→1**、size 始终 **2**。
- 仅在本测试浏览器的 page 模块响应内存副本加入只读捕获原 `x.current/p.current`，没有改产品磁盘源码、UI或新增产品 API。saved / Undo / Redo 的真实原 history entry 均逐项核对 node / Artifact / View / 正文 / revision 与 Core 和 live node 相符。

| 原操作 | 原 entry 的确切 revision |
| --- | --- |
| 保存并核对 | `revision-text-ba74aff5-90b7-4ff7-b0d0-368b63f000d3` |
| Undo | `revision-text-563ed6ca-c976-4c5b-9eb0-5bd308c52d64` |
| Redo（当前最终版） | `revision-text-b49480ff-041e-44e1-9dd3-b172f89dbf7b` |

总 batch 3 次，恰为 edit / Undo / Redo 各一次。Artifacts 15→15、Runs 1→1；模型调用 0、pageerror 0。浏览器已关闭，写窗口已释放。

浅色节点 face 同前：根浅灰蓝、分支白底、深字；349×250 此样例没有溢出，不声称覆盖大导图两端滚动。标题 rename、Stage 旧恢复路径等剩余范围继续见原审查，不因本轮通过而删除或隐瞒。
