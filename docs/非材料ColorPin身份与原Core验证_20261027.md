# 非材料 ColorPin：身份模型与原 Core 验证（2026-10-27）

结论：七类已有 canonical 对象已能沿同一个 ColorPin 模型找到准确 entity target；材料继续用准确 View。普通本地 note 保留原 `color_pins`。本文件记录源码与隔离 Core 验证，**不把它当成真实页面已全部验收**。

## 本次落地

- 模型：[native-colorpin-model.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts:6>)。
- 自有模型专项：[native-colorpin-typed-model.test.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-colorpin-typed-model.test.mjs>)。
- 隔离真实链专项：[native-typed-gui-facade.test.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-typed-gui-facade.test.mjs>)。
- 原件、活动 Core、浏览器、provider 均未写入；模型请求 0。

| 原载体 | 准确字段 | ColorPin authoring target |
|---|---|---|
| Collection | `lcos_collection_ref.collectionId` | entity / Collection id |
| Note、Scope、Workspace | `lcos_member_ref.entityType + entityId` | entity / 对应对象 id |
| Conversation | `lcos_conversation_ref.connectedConversationId` | entity / Conversation id |
| Run | `lcos_execution_ref.entityType=run + entityId`；保旧 `lcos_run_ref.runId` | entity / Run id |
| ResultSlot | `lcos_execution_ref.entityType=result-slot + entityId` | entity / ResultSlot id |
| 材料 | 原 `lcos_ref` 的 Artifact / View / Revision | view / 准确 View id |
| 无 canonical 身份的本地 note | 原 `data.color_pins` | 原空间 node，不伪造 entity / View |

Typed 对象颜色在同一对象的不同出现位置共享。材料可显示 Artifact / ResultSlot 的共享颜色，但修改入口仍只作用当前准确 View，不能误删共享成员。

## 身份与读态

[身份解析](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts:80>)同时核对项目、唯一 Canvas→Workspace→Scope、唯一 ProjectionBinding、真实 entity、ref family 与跨表 id 冲突。Run / Slot 的执行阶段不影响纯 GUI 标记。没有新增 View、领域字段、坐标 owner 或状态 gate。

`NativePinFacts` 可选接受顶层 `connectedConversations / runs / resultSlots`，也兼容 graph 中同名数组；显式顶层读取优先。缺少某类读态，仅该类型无准确 target，不阻塞其他材料和对象。

[保留 ref 的存在性](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts:21>)包括 `null`。损坏/中断的 ref 不得被当普通本地节点。合法材料加 file/result 附加 metadata 仍按原 `lcos_ref` 阅读与取色。

[View membership 投影](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts:136>)必须同时匹配 `kind=view` 与 id；entity.id 恰好与另一 View.id 相同，也不会串色。

[物化回显](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts:100>)额外核对 Slot→Artifact/View 与当前出现位置的 project / canvas / workspace / revision。旧 entity membership 不复制、不迁移、不改成 View membership。

## 已执行证据

1. 模型实际源码 **9 组 PASS**：[report.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/非材料ColorPin模型_20261027/2026-10-27T14-34-44-763Z/report.json>)。含七类、legacy Run、29 个严格身份反例、缺读、同对象多出现位置、跨 kind 同 id、所有 reserved ref 的 null、11 个物化不匹配反例、原控制器准确增删。此项用 source-shaped fixture，不冒充真实 Core。
2. 隔离实际 Core / SQLite / ChangeSet / Huabu / Facade **6 组 PASS**：[report.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/非材料GUI真实Core_20261027/2026-10-27T14-41-37-359Z/report.json>)。92 次 facade 调用、387 次本进程自有 Core loopback 请求；活动 Core / 浏览器 / 模型均 0。
3. 七类载体通过原方法 `workspace:open`、原 Run / Slot producer 与 `execution:reconcile` 实际生成，随后原 `/api/rfs/:canvas/gui` 正反修改、原 `INSPECT_NODES` 读回。每类操作后深比较正文/版本/文件原字节、全空间、binding、会话、execution 均未变化。
4. 原 Run / Slot 锁实际传到 canonical DTO，两类修改均 409、零标记写入；raw note 原 `nodes:batchActions` 保存颜色，再 GET 与磁盘空间同值，位置/大小/正文未改。坏 `lcos_ref:null` 不降级，锁定 raw 同样拒绝。
5. 第二 Slot 经原 `createTextArtifact` 生成真实 Artifact / View / 文件，再经原 `ResultSlotService` 与原 Core materialize 路由变成真实 material DTO；旧 Slot 颜色只读回显，清当前 View 不误删它。此为隔离 fixture 的原服务 setup，**不是 provider 返回或 accept UI 验收**。

物化路由目前不在 facade 的 Core protocol allowlist；专项调用的是同一隔离 Core 已有 HTTP 路由，没有改路由来凑通过。

## 保留的失败和修复

- `14-22-55-846Z`：测试误把原 `upsertNote(void)` 当返回对象，修测试，未改产品。
- `14-24-31-733Z`：**真实旧缺口 P1**。原普通 `frame` 被全量交给 `collectionFrameProjection.frame`，缺少原 Collection owner 即 501，继而整页 GET / GUI 读失败。原拒绝保护保留，本轮没有把普通 frame 冒充 Collection / Group。
- `14-28-47-197Z`：真实保护漏洞。坏 `lcos_ref:null` 被旧 DTO 翻译丢掉，后被误判 ordinary，GUI 竟成功写入。Root 已修原 DTO 保留 reserved ref 与 raw+DTO 双检、mutex 内再查 raw；终版实际反例拒绝通过。
- `14-35-38-270Z`：七类与 raw 已过，物化 setup 错走未映射 facade route 得 501；改专项调用同隔离 Core 已存在原路由，未修改产品 allowlist。

上述报告均在 [output/非材料GUI真实Core_20261027](<E:/Codex 项目/LCOS夺舍计划_20261013/output/非材料GUI真实Core_20261027>) 原样保留，没覆盖成绿灯。

## 供后续原页复用的隔离数据

- `--browser-fixture` 模式全新生成，未搬旧数据；已 clean close；保留目录：`E:/Codex 项目/LCOS夺舍计划_20261013/.runtime/isolated-nonmaterial-gui-20261027-dc8786e6`。
- 原启动器 label：`isolated-nonmaterial-gui-20261027-dc8786e6`，publicOrigin 为 `http://127.0.0.1:56331`。本专项未启动原 UI。
- Project：`disposable-surface-core-facade`。
- Workspace：`workspace:scope-typed-gui-method`。
- Canvas：`worksite-WyJkaXNwb3NhYmxlLXN1cmZhY2UtY29yZS1mYWNhZGUiLCJ3b3Jrc3BhY2U6c2NvcGUtdHlwZWQtZ3VpLW1ldGhvZCJd`。
- 七类准确 node/ref 见最终 report 的 `identities`；额外物化节点见 `materialized`；原 empty Slot 保留。
- `raw-gui`：未锁，原正文，已存红色与本地固定；`raw-bad-ref`：null 损坏 ref，禁止 authoring。
- 无普通 frame，原因是上面明确未接的原呈现能力；失败 runtime `typed-gui-facade-TDVCxd` 仍保留，未删除坏 frame 掩饰。

待完成：Root / Reader 在这份隔离数据上验证原 JT / Vde / Hie 页面入口、组菜单、用户与 Agent 即时互改。原普通 frame / parent 保存能力继续在册。实际 CAS 迟到覆盖和未知回执由原 adapter/controller 专项覆盖，本脚本不声称额外证明一个尚未跑的真页并发过程。


## 后续真实原页收口（2026-10-28）

七类＋ordinary note 的原入口实屏已逐类通过；旧整轮 false、只读尾段与最新 raw 专项单列，见 [完整矩阵](<E:/Codex 项目/LCOS夺舍计划_20261013/docs/非材料八类原入口实屏矩阵_20261028.md>)。本节补充后续证据，不覆盖上文当时待实屏状态或失败记录。
