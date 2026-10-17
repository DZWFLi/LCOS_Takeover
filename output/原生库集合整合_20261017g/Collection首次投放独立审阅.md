# Collection 首次投放独立审阅

结论：原 Library → 原 TS 预览 → 真实 Collection 接收/投影 → 原 pile 的路径在源码上连到既有 owner，没有另建 Collection 窗口。独立审查抓到的**在途并发重复 CREATE**窗口，已用 scoped 原 CREATE 的已有 Collection ref echo 与原 Canvas 锁内读回修复：**当前源独立验证通过，且同一 Collection 的 Main→Context→Workflow 正常首投与各自重复均通过。** 中间版 applied-only 会挡正常场景，已撤回，原中间证据保留。**前端关闭重开丢失 unknown 保持已被 native owner 的实际 React 组件负向证实，尚未修复**；领域防重正确不能替它销账。

本轮没有候选/浏览器/Core 写入，没有构建或重启。只读三处产品文件和实际 callers，新增独立受控 probe；生产文件由原 owner 修改。

## 已证实并修的并发窗口

两次请求均在 canonical receive 前读到 absent。原 `ProjectToSpaceProjection` 有 module-global entity lock，可防普通并发双建；但第一请求的 CREATE 已成功、binding 写失败时，排队的第二请求仍会 findLiveNode 无 binding，再 CREATE 第二节点。原锁内断言只检查同 owner/received，没阻止这个失败窗口。

独立脚本执行**实际新 backend + 实际原 ProjectToSpaceProjection/ENTITY_CREATE_LOCKS**，仅 repository/Assembly/spatial/binding transport 与几何展示 leaf 受控：

| 对照 | 原 projector 次数 | CREATE / saved node | 结果 |
| --- | --- | --- | --- |
| 仅移除新增分支重建此前 admission | 2 | 2 / 2 | 第一笔 binding 失败，第二笔成功指向 node-2，留下 node-1 孤儿 |
| 中间 applied-only 源 | 1 | 1 / 1 | 第一笔诚实失败；第二笔 skipped 只读，未确认即拒绝，不排第二次创建 |

中间修复位于当时的 `native-pile-collection-placement:104`：仅原 Assembly receipt 的 `applied/presentation-membership` 请求拥有首次创建；`skipped/already-member` 只重读，present 返回既有结果，partial/未确认不重放。没有添加新锁、ledger 或替代 projector。这份结果保留为中间源的证据；后续 scoped echo 方案会取代此分支。

[独立脚本](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-collection-placement-review.test.mjs>) / [负向与当前结果](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/集合并发独立复核/report-with-negative-control.json>)。**受控源代码执行，不是实际 Core 或整页验证。**

## 最新 scoped echo 方案复核

从当前 facade AST 提取实际 `projectCollection` 闭包执行，没有另写一个 echo guard 来测试自己；同时执行当前 helper 和原 `ProjectToSpaceProjection` 的真实 entity lock。只替 repository/Assembly/spatial/binding transport 及展示尺寸 leaf，不构建 bundle、不触候选。

| 当前源用例 | 严格结果 |
| --- | --- |
| 禁用原 Canvas 锁内读回段的负向对照，第一笔 CREATE 成功但 binding 失败 | 2 CREATE / 2 node，第二笔绑定 node-2，旧缺口重现 |
| 当前实际锁内读回与 scoped CREATE echo，同样两笔在途请求 | 两次进入 projector，但仅 1 CREATE / 1 node；完整既有 `lcos_collection_ref` 随原 CREATE 原子保存；第二笔在锁内拒绝，GET partial，不造成功回执 |
| 同一个 Collection 顺序 Main→Context→Workflow | 3 个 Canvas 各 1 CREATE/1 binding，三次 present；Main/Context 共用 Presentation 的 already-member 不再挡合法首次落位 |
| 三个 Canvas 随后各重复一次 | 都 already_present，没有第 4 次 CREATE，不用回旧窗口或重置会员 |
| binding 真提交、但回包抛错 | 只 1 CREATE / 1 binding，后续原请求复用同 node，inspect present，不再造节点 |
| 原 Canvas 锁内 read 等待时，canonical membership 被移除 | read 后原 assertCurrent 拒绝，CREATE 0 / binding 0，未把迟到首投写进失效 owner |

[当前 scoped echo 完整 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/集合并发独立复核/report-scoped-echo.json>)。脚本已更新为现行分支，不残留“必须存在 applied-only guard”的旧断言；旧 JSON 未覆盖。

## 当前接线和保留措施

- [facade:542](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:542>) 沿原 Assembly apply，再原 ProjectToSpaceProjection。其原 CREATE 由已有 Canvas lock 执行前再断言当前 Presentation owner；没有直接前端 new pile 伪成功。
- [POST route:784](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:784>) / 紧随的 GET projection route 分离写与核对；原 membership、binding、saved carrier、pile 类型/完整 Collection ref 同时成立才 present。
- [client:114](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-collection-placement.ts:114>) 正常意图先原 flush，再 GET；[128](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-collection-placement.ts:128>) 检查等待期间现场和真实 editable 数据未变，才交同原 O8 publication。unknown/readOnly 不 flush、不 POST；真正出现原 pile 后才返回 placed/already-present。
- [原 TS 预览 caller:622](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-library-contexts.tsx:622>) 使用同 API/project/workspace/canvas/generation，异步迟到不投另一个现场。旧 drop host 也改走同客户端，没有把 Gen2Host 冒充成完整原对象。
- existing carrier 路径不重排、不换 binding，也不打开旧 Collection body/window；原位置/选择/锁由原发布 owner 保留。此处是源码与 sibling 定向测试范围，整页仍等 root 串行 GUI。

## 还需明确的两项

1. **已证实：unknown 期间关闭/重开预览丢失保持。**当前 `needsCheck` 在 React 组件内，随 API/现场身份切换清空；卸载也消失。native owner 执行实际 React 组件负向：重开 GET 暂 absent 后能再发第 2 POST，`productUnknownRetentionPassed:false`。[实际组件 JSON](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/详情关开与全成员实际组件.json>)。本轮依 root 指令没有新增 Map/Symbol/伪 Drop attempt；这个 UI 缺口保留。native owner 另在[真实 Core peer](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生库集合整合_20261017g/前端真实Core对接/2026-10-17T05-36-35-456Z/report.json>)确认新 backend 两 POST 仍只有一个 carrier/binding，但它不能证明前端始终 GET-only，更不是整页鼠标验证。
2. **此前已收进 Presentation、但该 Canvas 从未投影的合法首次落位：**旧 `received+无binding → partial` 会409；Main/Context 又共用 root context Presentation，确实挡正常路径。最新源已改为：无 binding 且没有准确原 saved echo 才 absent；有 echo 仍 partial；原 scoped CREATE 写同一 ref，并在原 Canvas 锁内读 saved、重核 owner、查 echo/binding 再执行。独立同 Collection 三 Canvas 首投/重复现已通过，不再保留此旧缺口为当前状态。历史旧路径若 CREATE 从未写任何可识别 echo，仍不能靠标题猜其归属；这一遗留数据范围不能由新源测试自动销账。
