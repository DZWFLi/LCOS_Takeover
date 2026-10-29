# Drop 语义客户端施工

结论：`receiveNativeLibraryMaterial` 已落并冻结，接根 Main / Context / Workflow 与 Glyth 的真实接收路由。首次原释放点按值保留，成功需原空间读回；未知恢复只 GET，**不flush、不重放POST**。没有新增Canvas、队列、窗口或后台真值。

[客户端源码](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-receive-client.ts>)只import type `NativeCanvasSnapshot`，不导入后端模块/SQLite。原 `native-material-placement-client.ts` 本轮由root拥有，本agent未修改。

## 接口

```ts
receiveNativeLibraryMaterial(input: NativeLibraryMaterialReceive, {
  api, isCurrent, readOnly?: boolean, signal?: AbortSignal
}): Promise<NativeLibraryMaterialReceiveResult>
```

input：`projectId / canvasId / workspaceId? / artifactId / revisionId / fileRecordId / artifactViewId? / targetRef / position?`。targetRef保持 `{kind:'main'}` 或 `{kind:'context'|'workflow'|'conversation',id}`。`workspaceId`为release时真实owner的纯核对字段，**不wire**；root dispatcher会传非空值。GET→POST回执必须保持同一workspace。

成功：`{status:'placed'|'already-present',artifactViewId,revisionId,nodeId?,canonicalReceipt}`。`canonicalReceipt`就是实际收到的完整后端data，未拼Assembly rows；失败/未知：`{status:'unconfirmed'|'rejected',message}`。

## 真实动作顺序

- 正常首次：原 `flushCanvas` → 原场景/API检查 → GET原目标准确结果 → absent时单POST → 校回执 → surface调用原 `synchronizeMaterialProjection` → 核live ref/位置。已有结果只GET，不隐式移动或重复创建。
- 只读恢复：fresh signal → GET原目标（Glyth另GET真实identity）→ 准确结果校准/原显示同步。根本不调用flushCanvas，避免“核对”顺带唤醒原g发送。
- material identity、target、释放位置在第一个await前复制；异步期间改input不会把旧操作换到新Revision或新位置。Surface首次absent无finite释放点明确拒绝，不自动找空位/造(0,0)。Glyth不接position。
- 所有fetch显式携signal、no-store、redirect:error；取消或换原API/project/canvas，POST前拒提交，POST后保未知。恢复由调用方传fresh signal，不复用被撤销的旧controller。

surface核对：project/canvas/actualworkspace/target/Artifact/Revision/FileRecord、真实Presentation地址/capability/memberViewIds/position、真实binding/node/ref以及原live读回。源码只调用现有原显示同步接口，没写第二个Canvas owner。

Glyth核对：先GET原 `connected-conversations/:id/identity`，校同项目connected↔session↔conversationArtifact链，再核实际 `conversation_context` Relation的source Artifact和target pinned View。没有材料Node/binding/Workspace写入；回执意外含材料node也不报成功。

## 验证分层

| 验证 | 实际结果与边界 |
| --- | --- |
| `node scripts/native-material-receive-client.test.mjs` | **11组PASS**。执行实际client bundle；transport与Canvas publication是受控peer，不冒充原O8或整页。三surface、释放copy、measurement允许/用户编辑阻断、loss→freshsignal GET-only、API/Canvas变化、foreignworkspace/target/file/ref/position/畸形members拒确认、Glyth错端点/意外node、partial/拒收/错live、commit后Abort及缺释放点均过。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop语义客户端验证/2026-10-17T02-55-32-643Z/report.json>) |
| `node scripts/native-material-receive.test.mjs` | **9组PASS**。真实临时Core/Gen2Host/Huabu、原Presentation/Relation/ChangeSet；额外执行实际client接真实facade和linked identity：origin前进后的surface与Glyth GET-only合同通过，全部带指定signal、0flush/POST。这里native publication callback仍受控，非原O8。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop语义目标真实Core验证/2026-10-17T02-52-36-216Z/report.json>) |
| 原Router/store/dispatcher独立验证 | Artigine接管新独立脚本，client已发ready，等其结果；本agent不拿上述client unit通过代表原拖放全链 |
| 候选整页 | 本轮未build/未访问/未写候选，root统一处理 |

新测试Run0/model0，无候选数据。所有临时bundle/runtime均已清理，真实临时Core已关闭，未启浏览器。

保留02-49首次失败：fixture让node.position与Presentation.positions共享同一个对象，试图只改Presentation位置却把两者一起改成一致，错误断言为“不一致”。修正fixture成独立位置替换后负向通过，未放宽产品判定。

## 未收成“全部完成”的内容

Core成员已成功而空间投影partial时，只GET保留真值，明确补空间的用户动作还需继续接；原O8与Core成员/追加View的统一Undo仍在册。缺失/foreign来源继续拒绝，未知不靠删除来源字段恢复。整页原库→release→原Router→原目标→返回的验收由root/独立测试继续，不以新client和后端通过替代。

后端API与真实领域记录：[Drop确版后端施工.md](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop确版后端施工.md>)。
