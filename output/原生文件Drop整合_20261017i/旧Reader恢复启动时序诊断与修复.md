# 旧 Reader 恢复：启动映射被误当永久保护

结论：确实是产品启动时序缺陷，已做窄修并冻结源码。独立 15 项通过，目标类型检查 0 错；尚未在本次候选整页重验，不能宣布旧 Reader 已全部退役。

## 为什么真实页面还在旧 Reader

- 原 TapNow `wa` 的空闲初值就是 `{phase:"open",session:null}`；`finishClose` 也返回它。失败脚本读取的状态形状正确，这个值证明不了 Viewer 已接管。
- 原 `ProfessionalWindowStage.tsx` 的 `materializeRegionEntries`、`RetainedReaderBody` 到 `body(item)` 沿用原窗口对象；没有发现 Stage 克隆 `item` 导致 `===` 失败。这个严格身份保护保留。
- `native-professional-host.tsx:85` 调用 `setProject`，原 shell 会把 `surfaceCanvasId` 设为 `{}`。Host 在 Canvas ready 后才异步读取 Graph/workspaces，随后调用 `setSurfaceCanvasMap`；Stage 此时已经挂载。
- 修前 `native-reader-recovery.tsx` 在 Canvas ready/API 存在时，把所有 `!sourceReady` 都永久记为 `retainedLegacy`。暂未读到 Surface 映射也会被锁住。映射稍后正确，仍没有 native Viewer 请求，旧 Reader 继续读取 FileRecord。

真实失败证据：`旧Reader真实恢复/2026-10-17T13-27-53-424Z/report.json`、`failure.png`、`failure-aria.txt`。它不能被“FileRecord 字节已读到”掩盖：字节可以是旧 fallback 读的。

## 改了什么

只改 `lab/pilot/native-reader-recovery.tsx`，没有修改厂商、原工程、Stage、Viewer、Core 或其他人的 history/startup 文件。

- 判定分成 waiting / eligible / protected。Canvas/API 尚未就绪、恢复对象尚未对上、Surface 映射未返回，保持等待。
- 已证实的跨现场、真实 pending/保存未知、同材料本地导图草稿、Composer 输入归属失配，继续保留并锁住原 Reader body；清掉一个 flag 不会悄悄卸载它。
- 订阅原 shell 的 `surfaceCanvasId` 和 Canvas status，异步映射完成后能自行重算；不依赖无关窗口更新或轮询。
- 对象身份、API/项目/现场核对、确切 revision、原 lease、真实 phase=open 后才确认、原 Stage 关闭回程和原持久地址均未放宽。

## 验证与证据边界

| 层次 | 结果 | 证据 |
|---|---|---|
| 修前真实整页 | 失败，旧 Reader body 仍在；wa 空闲 | 上述 `13-27-53-424Z` |
| 修前同源 React 时序反例 | 成功复现缺陷：空映射先 mount，后给正确映射仍 0 native 请求、fallback=1 | `旧Reader启动时序只读诊断/2026-10-17T13-35-13-551Z/report.json`；当时脚本归档在同目录上层 |
| 修后组件与原 owner 执行 | 15 项通过 | `旧Reader独立委托/2026-10-17T13-38-51-629Z/report.json` |
| 目标严格类型 | 通过，0 错 | `旧Reader目标类型检查.json` |
| 修后候选整页 | 未运行，交 root 统一 build 后用原脚本验证 | 不以独立测试代替实屏 |

本次回归直接提取并执行真实 Host 的映射 effect 和校验函数，保留其 ready → Core GET await → setSurfaceCanvasMap 顺序；React 挂实际恢复组件、实际 ViewerHost、原 wa initializer/runtime。初始等待无 fallback、无请求；映射后 exact r1 请求一次；手动原 `markOpen` 前不退休旧展示，之后退休展示且原持久窗口记录仍在。

这不是完整 Stage 实屏：整 Stage 没有挂载；原 Stage return closures 直接取自真实源码，Stage item 原对象链另做静态核对。Core GET/字节是明确受控叶端，未接候选或真实 Core，原动画回调由原 `markOpen/finishClose` 驱动。

其余回归保留：确切历史/草稿 revision 不切 Current；读取失败保留源并可显式重读；GET 中 API 变化不收迟到回执；pending、导图草稿、已占用 Viewer、确定跨 scene、输入归属失配均不抢占；原关闭/回程只消费一次准确 Reader；草稿和 caret、持久布局不被覆盖。

中途 `13-37-49-174Z` 的失败也留存：新 inputMismatch 用例把 `composerOriginKey` 写进磁盘布局，但原持久协议本来不保存该临时字段，所以不是有效保护夹具。已改为恢复后同标签本地窗口字段，重新运行全部 15 项通过；没有放宽产品保护来适配测试。

执行命令：

```powershell
node scripts/native-reader-recovery.test.mjs
node scripts/native-reader-recovery-types.test.mjs
```

后续实屏仍用 `scripts/native-reader-recovery-browser.mjs`；本子任务没有启停实例、没有候选浏览器、没有业务写入。
