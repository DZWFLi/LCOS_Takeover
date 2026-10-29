# 材料分派独立 HTTP 验证

结论：**当前源码 19 组通过**，已包含恢复 closure 保留、慢 Graph GET 后 Composer 确版引用重查，以及当前 receive 精度 helper。原 Main/Context/Workflow、Workspace、Composer 和 Glyth 的分派边界按真实代码执行。候选访问 0、Core 写入 0、模型 0。这里是前端 transport/owner 的独立验证，**不冒充真实 Core、Chrome、DOM 或 O8 发布整页通过**。

最终 [19 组 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/材料分派独立HTTP验证/2026-10-17T03-40-20-018Z/report.json>)；[测试脚本](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-library-material-dispatch.test.mjs>)。

## 到底执行了什么

真实 `native-library-material-dispatch`、`native-library-drop`、receive/place clients，以及本轮定点 transform 后的**整份原 Router 和整份原 Zustand Drop store**。Router 来自 `currentGen2Resources` 选中的当前 GN2 原件，报告记录准确 sourcePath；不是拿早期副本充数。

依赖用 `buildPilotEntry` 编入第三工作区临时 Node 模块。该 builder 限制 production source transforms 只能进原浏览器 React，因此测试按已有 owner 回归方式，以 esbuild 编译整份 transformed 原模块，并注入同一 bundle 的实际依赖与私有 capture 模块，保持 Symbol/payload 对象身份。没有另写 Router、队列或 drop store。

随机 loopback HTTP peer 提供受控 Graph/identity/材料 producer。丢回包不是简单 `throw` 假装成功：peer 先存下准确 `present` 回执，再销毁 POST 连接；后续 GET 读同一条 peer 记录。原 Canvas API 的 flush 和 publish 是明确标注的受控叶子；回执与原 O8/真实 Core 的正确性须由各自独立和整页测试补证。

## 当前通过项

| 范围 | 严格断言 |
| --- | --- |
| Main / Context / Workflow | 原 Router 事务签名去重包住真实 dispatcher；同一 payload、重复 commit Promise 相同，只 `materials:receive` 一次 POST，不进 legacy Assembly |
| Workspace | 只 `materials:place` 一次 POST，保留原 Workspace 身份，不偷换为根 Presentation |
| 释放落点 | 提交的是原 recognizer 的世界坐标，不是起拖屏幕点；慢 Graph GET 期间 caller 改原 placement 对象也不改已捕获落点；重算相机/自动落点 API 设置为抛错，未被调用 |
| Glyth | 先读准确原会话 identity，再确认源会话 Artifact → 确版 View 的 `conversation_context` Relation；不发布 Canvas 节点、不传假位置，刷新同一会话 |
| Composer | 仅 Graph admission 读取；准确 source/ref/inputKey/intent；错输入、错版本、多来源与输入切换拒绝。慢 GET 期间原 reference 改 r2 或 references 多一项，await 后重新验证并拒收。没有测试替身把“准入”说成真实 draft owner 完整交互 |
| captured portal / rail | 三种远目标标志均明确失败，0 HTTP producer、0 legacy mutable View owner；不暗放到当前 Canvas |
| Main / Workspace 丢回包 | peer 确实记账后断连接 → partial 保留同原 payload/反馈，不伪造 Assembly rows/retry subset；原 signal 已 abort 后可用 fresh signal 核对；只 GET，0 新 flush、0 新 POST |
| HTTP 200 但发布 owner 拒收 | 不报 success；保 partial。之后 peer 回执 GET + 原发布叶子接受才成功，不重新提交 producer |
| 慢 Graph GET 换现场 | API、Canvas、Workspace、target、gesture 五种变化均在 producer 前拒绝，0 POST、0 flush |
| 旧 unknown 恢复归属 | 上述五种变化后，旧反馈不能读到新现场，更不能确认或写入；保留 partial 和同原只读 closure，不能 terminal failed 吞恢复入口。0 新 HTTP、0 flush、仍只有原一笔 peer 写 |
| mutable source View | 原准确结果已存在后，同 Artifact 的源 View 前进不阻断 GET 核对；foreign Artifact/Scope 在 Graph 层拒收。尚无结果的前进源不发新 POST，不回退 Current |
| 不混用来源 | 只有 noncaptured 返回 undefined 给原路径；captured 错 tx、多来源、abort 均拒绝，不降级 legacy |

每组详细请求序列、真正 peer 写次数、flush/publish 次数、子场景和原 owner provenance 都在 JSON。

## 失败与证据边界

- [02:58 首轮](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/材料分派独立HTTP验证/2026-10-17T02-58-27-593Z/report.json>) 在执行场景前被 builder 拒绝：Node 不允许直接使用 browser-only sourceTransforms。属于 fixture 接入错误，产品未运行，保留原报告。随后调整为执行整份真实 transformed 模块，不放宽 builder 的限制。
- [02:59 首批 16 组](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/材料分派独立HTTP验证/2026-10-17T02-59-51-883Z/report.json>) 已过；03:02 在此基础上补 caller 异步改点、HTTP 200 发布拒收两项，18 组全部重跑通过。
- [03:02 的 18 组](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/材料分派独立HTTP验证/2026-10-17T03-02-40-741Z/report.json>) 保留为当时源码证据。root 后续发现恢复 terminal failed 丢 closure、Composer await 后未重新检查引用，产品修复后，03:40 更新严格期待并补第 19 组慢 GET 引用变化，全部重跑通过。
- HTTP peer 是受控 producer，原 Canvas publish 是受控叶子；未使用候选地址，不宣称 SQLite/Core 真值、ChangeSet、原 O8 或原手势全链已经验收。
- 当前真实旧版原库/接收器只读证据另见 [真实鼠标专项](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库真实鼠标专项.md>)。新的统一构建后，按 root 提供的串行写窗口跑真实鼠标 release、30 秒不重发、GET 回程、重复不移动及原空间状态保持。
