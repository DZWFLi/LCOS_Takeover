# Drop 确版后端施工

结论：普通 Workspace 的 origin 前进恢复已修；Main / Context / Workflow / Glyth 的确版接收已落真实 producer 和 GET/POST 路由。根三视图继续写 Presentation，Glyth继续写持久 `conversation_context` Relation，**没有转成 Workspace membership**。源码已交 root 冻结/统一构建，本 agent 未访问、写入或重启候选。

## 改动与 owner

- [native-material-placement.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-placement.ts>)：抽出共享 `readNativeMaterialVersion` / `assertNativeMaterialOriginVersion`。所有读仍核 project/Artifact/Revision/FileRecord/来源 View 的归属；首次 absent→写前须校来源 View 仍指所选Revision；准确既有 carrier GET允许同归属origin View前进。缺失、跨项目Scope、另一Artifact来源不放宽。
- [native-material-receive.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-receive.ts>)：新薄适配，组合既有 Core View、Assembly、Presentation/Relation、ChangeSet 和原 Gen2Host projector。普通稳定主键来自 target kind/id + Artifact/Revision，无新ledger/hash/schema。
- [surface-core-facade.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts>)：仅新增该模块 import/实例和局部 `materials:receive` 分派，未改协议router、文本/port/history、UI或原GN2源。

## 客户端可直接接的 API

```ts
POST /api/lcos/canvases/:canvasId/materials:receive
{
  projectId, artifactId, revisionId, fileRecordId,
  artifactViewId?,
  targetRef: {kind:'main'} |
    {kind:'context'|'workflow'|'conversation', id:string},
  position?: {x:number,y:number}
}
```

GET 同路径，query保相同身份，`targetRef=JSON.stringify(targetRef)`，不带position；GET不写、不repair、不重放。所有响应继续用原 facade `{code:0,data:...}` envelope。错误继续原HTTP/code/error owner。

共同data：`project_id / canvas_id / workspace_id / target_ref / artifact_id / revision_id / file_record_id / artifact_view_id / provider_execution_started:false / state:'absent'|'partial'|'present'`。

- surface present：真实 `presentation / binding / node`；`workspace_id`只是该Canvas的实际owner，供原 `api.synchronizeMaterialProjection` 使用，实际membership仍Presentation。POST首次成功另回真实 `assembly_receipt / change_set_id`；GET绝不伪造Assembly rows或重建旧ChangeSet ID。
- conversation present：真实 `relation`；无材料node/binding，不需Canvas material sync。POST首次成功同样回真实 `assembly_receipt / change_set_id`。必须有项目内官方linked session→conversationArtifact→唯一primaryView和该Canvas的真实conversation binding，不按provider/标题猜。
- 已present重复POST只读返回 `already_present:true`，不会暗移位置/再建node/再apply。部分落地返回partial；再次POST拒绝，不重放已经成功的成员关系。

Surface支持现已连接的原text/markdown/image renderer；Glyth只需确版文件与原Relation owner，不把二进制转换为文字。conversation拒绝传position，避免偷做画布投放。

## 真实流程与版本

1. 核准同project、Canvas↔Workspace↔原Scope/target，读准确Revision/FileRecord和现来源View归属。
2. 若准确目标已存在，GET核真实 membership/relation、确版View、binding/保存node和原投影正文/位置；同归属来源View可前进，不能换成Current。
3. absent首次写先核来源Revision未变化，沿原FileRecord内容owner读字节；沿 `putArtifactView`建/核显式固定Revision的 `explicit_additional` View。
4. 用该确版View调用原 `assembly.apply`，targetRef原样保持。三Surface读回真实Presentation member/position，Glyth读回真实会话Relation；只接受实际正确正向回执。
5. Surface再调用原 `nodeProjector.projectEntity(entityType:'view')`，核binding、原保存Canvas和native projection的精确ref/位置；Glyth不创建材料空间节点。
6. 丢回包只GET查同target/确版结果；GET不会写projector或再次apply。来源同归属但前进不阻断准确恢复，foreign来源仍拒绝。

## 验证

新测试全部在可清理的真实隔离Core/Huabu/Gen2Host中跑；新测试Run0、model0、无SQL、无原项目或候选改动，临时facade均已关闭。

| 命令 | 实际范围 / 结果 |
| --- | --- |
| `node scripts/native-drop-owner-probe.test.mjs` | 最终5组PASS：历史无View真实additional；无carrier+origin变更拒写；准确carrier恢复仍挡missing/foreignscope/另一Artifact；真实POST200丢弃caller回包后origin前进，GET回同node/确版/位置、0投放重放；投影异步读回途中origin被重绑foreign Scope也最终拒绝，不用旧快照销账。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop源View确版探针/2026-10-17T02-30-22-476Z/report.json>) |
| `node scripts/native-material-receive.test.mjs` | 最终8组PASS：根三Surface各真Presentation/ChangeSet/projector/native ref；真实图片无文字化；真实另一项目Scope/另一Artifact/源变更/目标错Scope/pinned主键冲突拒绝；投影中断partial不重放；官方合成会话import/connect/link→真Glyth durable Relation/ChangeSet。所有surface后workspaceMemberships与之前深相等，Glyth不新增材料node/binding，Run计数始终0。异步读回末端再核来源归属和realbinding。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop语义目标真实Core验证/2026-10-17T02-31-22-538Z/report.json>) |
| `node scripts/native-material-placement.test.mjs` | 既有完整投放回归PASS。注意它旧manifest段会另建1条临时created Run、从不dispatch；不能把此旧全回归宣称Run0。新两脚本只复用其无Run setup片段，没有跑该旧段 |

保留失败：第一次新semantic测试把graph.runs当成存在字段，实际原graph没有该字段而失败（02-18-07报告）；改为原 `getProjectExecutionProjection().runs`核真实Run计数，未改产品来适配测试。原恢复负向证据01-47报告也保留，没有覆盖。

## 仍在册

- 前端原库来源/Drop Router/settle分支/原处GET恢复由root与native agent集成；本报告不把后端PASS当整页拖放通过。
- Core成员关系已成功而原投影中断时保持partial，GET不补写；用户明确恢复“只补空间显示”的完整动作尚未接。本次没有拿hold替代正常投放，正常三Surface与Glyth已完成真实闭环。
- 原Canvas一次Undo同时撤additionalView、Core membership/relation、空间carrier尚未接。原ChangeSet保留，不能把本地删node或O8索引正常冒充统一Undo。
- 删除来源View、来源跨归属、精确FileRecord失效仍拒绝。不能为unknown恢复偷偷删保护。
- original View PUT无source Revision CAS；本适配用显式确版目标View隔开Current变化，多次校验不宣称跨Core/Huabu全事务。已有部分真值必须读回和保留。

接入口的只读核查与dispatcher注意项保留在 [Drop原目标分派接缝.md](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop原目标分派接缝.md>)。
