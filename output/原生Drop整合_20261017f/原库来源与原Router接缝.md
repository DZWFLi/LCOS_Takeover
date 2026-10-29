# 原库拖放：来源、原 Router 与只读反馈恢复

结论：**来源和原提交接缝已落源码，独立测试通过；本分项没有构建/访问候选，没有 Core 或模型写入。** 原材料行、原拖影、原目标 resolver、同一 Drop store 和原 Router 去重仍是原 owner。完整目标 producer、释放 Graph 复核和整页真实手势由本轮其他分项接实，不能拿这些底层结果替它们销账。

## 原流程接到哪里

| 原入口 → 容器 → 动作 → 回程 | 当前最窄接法 | 保留 / 未完成 |
| --- | --- | --- |
| 原 Library `Zp.j` 材料行 → 原 Ko 拖影 → acquireDrop → 原 capture/取消 | 原 Ko 写入后添加既有 Assembly MIME；同 payload 私有 Symbol 留准确 project/canvas/API、Artifact/View/Revision/FileRecord | 不增加 store、按钮或窗；起点只叫 `startScreenPoint`，不是释放点。历史无 View 仍拒绝，不换 Current |
| 原 resolver → 原 Router.commit → 原 execute assembly-apply | 在原 tx/signature 去重内、原 signal 取消早退后、全部 legacy 分支前调用可选 `handleNativeLibraryMaterial`；非本来源 `undefined` 才回原 owner | 新库材料的远端 Rail/Portal 尚未接时明确拒绝，不走 mutable 源 View；非本来源原远端 owner、普通 Assembly 及其 retry/merge 保留 |
| 真实投放回执 → 原 settle → 原反馈 | 同 bundle 私有 Symbol 标记绑定**原 payload 对象**、tx/target/project；只这类准确材料回执跳过 Assembly item merge | 不伪造 `assemblyItems`。普通 Assembly 仍走原准确行审查/失败子集重试；unknown 不带 generic retrySourceRefs |
| 原反馈“核对” → 只读 producer → 同反馈 | 新原 store 方法 `confirmNativeLibraryPlacementReceipt(tx,incoming)` 只采用同反馈/原 payload 标记的回执；成功 idle，仍 unknown/partial 保原 failed state | 不发送投递、不重放；换手势、外来 tx/target/project/payload、已成功后的降级回包拒收。此方法不替代 Core 事实验证 |
| 未被 capture 接住的原 jF document Ko drop → 原处提示 → 返回材料 | LCOS 标记在原 parser 前消费，禁止落入 Qe/Te URL factory | 非 LCOS 原路径保留。完整 UI 回退/重新核对入口待 root 组合验证 |
| 原 Host → 原 Rt Toast → 核对动作 → 同 store 反馈 | `NativeDropNotice:se` 传入现 Host Provider；只有库来源不再渲染独立 DropReceipt 大卡，用同一原 Toast id 显示 busy/unknown/success | unknown 持续保留“核对放置结果”；实际原 action 阻止默认关闭，独立 GET signal 核对并调用原 store 方法。legacy 原 Receipt child 不变；不新增窗口/portal/表单 |

## 可直接组合的接口

[Source transforms](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-drop-owner-source-transform.mjs:115>)：

```ts
createNativeLibraryDropOwnerSourceTransforms()
// 两个原模块身份：
// lcos/huabu/apps/web/src/lcos/drop/dropCommitRouter.ts
// lcos/huabu/apps/web/src/lcos/lcosDropState.ts

// 原 DropCommitOwners 新可选方法（原 execute 内调用）
handleNativeLibraryMaterial(intent, transactionId, signal)
  : Promise<DropCommitReceipt | undefined>

// 原 LcosDropState 新只读反馈采用方法
confirmNativeLibraryPlacementReceipt(transactionId, incoming): boolean
```

Router 采用 `currentGen2Resources` 明确选择的当前原源码；store 采用原 copied 模块身份。本 transform 检查 exact sourcePath，并按 TypeScript AST 定位接口、普通分支、settle 及原 Railway 相邻位置；不写 lcos/原件。

[同 bundle 来源和标记](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-drop.ts:49>)：

```ts
readNativeLibraryDropCapture(originalPayload)
markNativeLibraryPlacementReceipt(receipt, originalPayload)
isNativeLibraryPlacementReceipt(receipt, originalPayload)
```

标记要求 receipt.projectId 同准确来源，且不允许 generic retrySourceRefs。连保留 Symbol 的 `{...payload}` 也不是原手势对象。不能 JSON 重建 payload/回执，也不能重新创建另一份 helper bundle。标记只是原反馈采用证明，真实 Graph、producer 回执与 O8 发布仍须由委托核对。

委托的 capture 分支应把可理解的失败/unknown 回执标记后返回。直接 throw 虽不会回退 apply，但原 Router catch 的普通失败回执没有私有标记，仍会走 Assembly unknown 审查，不能据此声称专属只读恢复已接好。

## 测试与边界

`node scripts/native-library-drop-owner.test.mjs`：[8 组 PASS](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库DropRouter与Store测试.json>)。

- 真正读取 current selected Router；运行整份 transform 后原 Router、整份原 Zustand store，以及实际原 receipt/resolver helpers。producer 是受控函数，没有假称真实 Core。
- 去除声明新增的 AST 接缝后，两份原文件**全部字节相同**；原函数未重写。TypeScript AST、幂等、精确恢复和外来 sourcePath 拒绝通过。
- 独立临时 browser bundle 编译两处 source transform，原 module identity/当前选源通过；不属于候选构建。
- 同 tx 重复只调用委托一次；改同 tx 意图拒绝；unknown 原 payload/目标/释放点/真实回执保留；只读恢复的正反例通过。
- 普通 absent/undefined 委托、异常、abort、portal 分流保持；普通 Assembly partial 只重试明确失败项并合并此前成功，外来或畸形回执继续 unknown。

原 Toast 接线也已落源码：

- `native-library-drop-transform.mjs` 新 `transformNativeLibraryDropNoticeScript`：agent host 改接之后，仅给同一 Host 加 `NativeDropNotice:se`；校验原 index 的 `al as se`。
- `native-agent-ui.tsx` 只增加 Host prop/Provider 与原 DragStart/Fallback 导出。`native-library-drop-feedback.tsx` 不创建 HTML 卡、portal、定时器或全局 store。
- `transformNativeLibraryDropFeedbackOverlay` 是独立函数，由 root 与现 Overlay owner transform 组合；原 `<LcosDropReceipt />` 保留为 child。非库来源和缺 Notice 的 fallback 都继续原组件。

`node scripts/native-library-drop-feedback.test.mjs`：[5 组 PASS](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库Drop原Toast测试.json>)。执行实际 donor `Rt`、实际 Sonner observer 和实际 action onClick 源码，不是 `(string,options)` 的假 Toast 记录器；production controller 接实际 transform 后原 store，查询 producer 为受控函数。

实证包括：同 id 的 busy→unknown→success、原 `duration:0` 真映射、action 必须 preventDefault 才不关闭、独立查询 signal/防重复查询、换 tx/现场取消与晚回包拒收、中文错误且不披露 raw ID/HTTP、原 legacy child/字节保留。成功清空 action/duration 回原 Toast 默认退场；本测试不把真实页面 Toast 渲染、默认计时或 Core 查询说成已实屏通过。

`node scripts/native-library-drop.test.mjs` 来源回归 [7 组 PASS](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/原库Ko未接入口补丁测试.json>)：原 Zp/jF 回调、同一 acquire/store、准确版本、原 Ko/样式、释放换目标/Escape、重复事件不重放、无 View/外来材料不降 URL。旧路径保留该来源测试档案；本轮新 Router/store 结果归 f。

剩余必须用实际 Core/GUI 验：普通/根 Presentation/Glyth/Composer 各自目标、释放现场与原 API/Graph、mutable 源 View 前进后的 GET-only 恢复、O8 实际发布、全部 MIME 和统一 Undo。原起点不代替 release，真实位置只取原 recognizer 释放时冻结的 intent.placementPoint。
