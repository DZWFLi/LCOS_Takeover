# 画布摘录 Drop：原 Viewer 拖出与取消恢复

当前结论：最终四条真实取消/非法落点回程，以及原 More 的真实 Ctrl+F、查找、字号、目录返回和宽窄宽切换全部通过。原生拖动沿原关闭流程显露真实画布，Chrome 在原按钮卸载后仍保留同一拖放和两种 MIME；恢复回同版同文件的准确摘录。本报告保留全部中间失败，不把受控专项代报为实屏。

## 本轮实际改动

| 原入口 | 接法 | 边界 |
| --- | --- | --- |
| 原 `useReaderTextFeatures.onDragStartCapture` | 原 material/plain DataTransfer 写完后新增可选回调 | 原 caller 不传时行为保持；原件只读，变换在 lab |
| `NativeMaterialTextReading` | 只将当前真实局部选区 payload 与原 source 按钮交给当前 Viewer | 版本、view、file、locator、quote 继续准确校验 |
| 原 Viewer 关闭 | 下一帧调用原 runtime.close | 不穿透全屏、不改 DOM 样式、不合成 drop、不另开窗口 |
| 原 dragend / 接收回执 | 等待原关闭和真实 native end；合法接收另等原队列结果 | `dropEffect=copy` 不代表保存成功；saved/unconfirmed/rejected/stale/owned 区分 |
| 取消或拒绝 | 原 Viewer 同版、同位置重开，再保原返回与焦点 | 换项目/现场/API/输入后不复活旧页面；卸载清理临时回调 |

源码：`lab/pilot/native-reader-excerpt-drag.ts`、`lab/native-reader-selection-source-transform.mjs`、`lab/pilot/native-material-reading.tsx`、`lab/pilot/native-material-viewer.tsx:422` 和 `:508`。这是一次原生拖动的临时 UI 回执，不是第二条材料队列或持久状态。

## 已有证据

- 受控真实 helper 8 组通过：`output/画布摘录Drop_20261027/原drag生命周期专项.json`。覆盖脱离 DOM 的 source end、快取消、非法落点、回执等待、不同结果、换 owner、卸载、错误 payload 和替代手势。这里的 EventTarget 测试不冒称实屏。
- 原 selection/source-transform 3 组通过：`output/文本选区准确定位_R02_20261026/类型与原payload源变换.json`。原复制等 handler 保留；原 drag handler 仅增加写完两种 MIME 后的可选回调，实际原 handler 受控执行确认顺序。
- 旧原页实鼠标 `16-41-45-285Z`：全屏 Viewer 内合法画布落点为 0，原生拖动能开始但无法落出。准确失败保留。
- `17-07-41-779Z` 明确标作只读预演：调用原关闭后，原按钮虽卸载，trusted native dragend 仍携带 material/plain MIME；但旧正常关闭立即恢复 Composer，使拖动落向输入。这推动本次产品拖放期间暂缓原回程，不能把该预演记为保存成功。

以上实屏目录均在 `output/画布摘录Drop_20261027/`，原实验报告各自注明范围与失败。

## 实屏中间结果与测试纠正

实际 Core 96332，Host 63512。全非 GET、外网、SSE、WS 拦截；不连接、不发送、不调用模型，前后全部 Core 事实与当时 22 份原文件字节相同。

| 报告时间（UTC） | 实际结果 | 解释边界 |
| --- | --- | --- |
| `17-32-13-464Z` | cold ready 60 秒未就绪，0 drag | 保留加载失败，原因未证实；没有延长或放开原 ready 条件 |
| `17-36-44-360Z` | 3 秒只读复查 ready/原 API 一致 | 仅复查，不当拖放通过；后续均为同束 warm 复跑 |
| `17-40-21-917Z` | 原关闭、真实 pane 和取消恢复出现；snapshot 提前落在 opening | 原身份断言失败保留 |
| `17-48-35-777Z` | 桌面取消两种路径走完；360 恢复 snapshot 提前 | 因测试等待缺陷，不能据此宣称最终全通过 |
| `17-51-46-562Z` | 原 runtime 只读订阅精确证明 key1 关闭→key2 恢复一次；file/view/range 均存在 | 没有第三次 open；先前“可能重复打开”的推断撤回 |

最后一轮实际栈明确：原 runtime `finishClose` 可以是 `phase=open/session=空`，不能只看 phase。随后同 key2 的 loading→正文→markOpen 是原呈现流程。

测试本身也查到具体问题：当前 `playwright-core@1.63.0/lib/coreBundle.js:24413` 对 `waitForFunction(async...)` 先把 Promise 当真值，再只解析一次结果，不重轮询 false。专属 harness 已改为 Node 侧有界读取原 runtime JSON，拿成功的同一个 snapshot 断言；不改产品或延长 loader。原生 Selection.toString 的块尾换行也不能冒充 CT source quote：新期望来自同一个 trusted `dragstart`、原 React handler 写完的真实 MIME，回程 locator 逐字段比较。原按钮与滚动区是兄弟，不能假定 target 原生监听已晚于 React bubble；观察器只沿 composedPath 注册原生 bubble，在原 React 后首个读到 MIME 即统一清理，未走到者 0ms 清理，不改传播或 DataTransfer。

## 尚待最终实屏

`scripts/native-reader-excerpt-drag-cancel-browser.mjs`：桌面及 360×400，非法 Chrome/原库落点、浏览器 Escape 取消、原 Viewer 同 artifact/revision/file/view/range 恢复、准确定位 ready、原 Escape 回程。测试只读；主代理完成唯一写入后，以新事实重新采样全部文件，可传 `--expected-file-count=实际数量`，不会把合法新增 child 误报为污染。

真实成功写入、准确 accepted receipt、Undo/Redo、重载由主代理/接收器专项负责，不在本报告代报。未确认的结果不会自动重试或伪称成功。

## 18:12 同束复验（仍未报四条全过）

`output/画布摘录Drop_20261027/产品原关闭与取消恢复/2026-10-26T18-12-18-007Z/report.json`：修正轮询和原 React 后 MIME 观察器后，桌面非法落点、桌面浏览器 Escape、360×400 非法落点三条以真实 source MIME 为期望，准确 file/view/locator、正文 ready 和原 Viewer 焦点均通过。52 笔非 GET 全拦，Core 全事实及 22 文件字节未变，context 已关闭。

第四条在重新选区的前置停止，尚未发起拖动：原首段首行 y113.67 的 EFP 是“阅读工具”，实际鼠标选成“工具”而非正文。首轮窄屏 Selection 也曾因重排选到标题；该轮 payload 与准确回程虽合法，不能冒称首段一直命中。后续 harness 仅选真实 EFP 可见的连续字符行，原 wheel/hover 后重新测量，并要求真实 Selection 的 anchor/focus 都在该原段落；不伪造 Selection 或移动工具。

为防止此修正遮住真正 GUI 问题，最终恢复检查另加原 CSS Highlight 的真实 Range/原 scroll/viewport 交集与 EFP：至少一处准确来源高亮的可见中心应命中正文；若高亮整体不露出或被工具/动作盖住，仍记录为产品失败。当前尚待主代理后端窄修后的新 PID，再补四条完整实屏。

## 最终真实原页：通过并停止现场

`output/画布摘录Drop_20261027/产品原关闭与取消恢复/2026-10-26T19-45-34-137Z/report.json`

Core **87260**，Host **78792**，当前 **26** 份文件。前后完整 Core 事实和全部 26 文件字节一致：marker 0、journal 34、主会话 28 / 全部消息 36、原图片位置 120,100 / 尺寸 375×250。60 笔非 GET 全拦，pageerror / route error / 外网 / 未知协议均 0，0 模型。所有 context 已关闭，之后只核图和归档，没有再开启现场。

| 原生路径 | 准确恢复 | 可见/返回 |
| --- | --- | --- |
| 1500×1000 → 原 Chrome/库内非法释放 | 原 artifact-brief / revision-brief-initial / view-brief / file-brief；真实 MIME range [21,39]、quote `Goal: show a local` 逐字段一致 | ready；实际 CSS Range 的可见中心 EFP 命中正文 |
| 1500×1000 → 浏览器 Escape 取消 | 同上 | 原 Viewer 真焦点，后续原 Escape 回同库 Brief 查询 |
| 360×400 → 原 Chrome/库内非法释放 | 同上 | 高亮完整 21px 高可见，原 scroll y80..195，中心 EFP 是正文 SPAN |
| 360×400 → 浏览器 Escape 取消 | 同上 | 原 Viewer 真焦点，后续原 Escape 回同库 Brief 查询 |

四次均是可信 native drag，原 source 卸载后真实 dragend；未使用 Selection setter、合成 drop、DOM 样式穿透或测试强 focus。取消后 source 定位状态和实际可见高亮同时核对，未只看 ready 标记。

同一原 Viewer 还完成 **1500→360×400→1500**：原 ActionBar span 两次仍 `connected=true/same=true/count=1`；各次与独立窄屏页均只有一个“阅读选项”，正文 summary 为 0。真实 Ctrl+F 打开原 Popover，有限动画及 8 帧后搜索焦点仍正确；原查找 `Goal` 为 1/1，字号 110%→100%，目录原 heading 点击后同 More 关闭并回原正文真焦点。没有测试 focus 兜底。文本原 Viewer 已是 fixed inset-0 全页，没有额外全屏切换，video fullscreen 不借来代测。

已人工核 `360-browser-escape-03-exact-reader-restored.png`：顶部没有第二设置入口，原选区高亮可读，反馈一处，底部原 More 与原通知都保留。这里只说明极短屏真实可达，不外推为所有内容/所有设备设计已完成。

仍记账：原 hook 在无 dragstart、无 click 到达的 pointer 取消边界未实证；native drag 开始本身会发 pointercancel，不能粗暴清理破坏拖动。未知保存结果/真实成功创建与 Undo/Redo 的业务链由主代理独立报告，本只读验证没有制造材料。
