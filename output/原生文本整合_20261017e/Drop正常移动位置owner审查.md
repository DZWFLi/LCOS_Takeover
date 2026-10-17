# Drop 正常移动的位置 owner 审查

结论：**写桥确实缺了一段。** 原鼠标移动产生的 `nodes:batchActions` 只保存Huabu geometry，没有同步新root材料所属Presentation.positions。用户正常挪卡后semantic GET会partial，重复拖放/核对也会卡住。它不是DC/PC小数精度问题，不能删位置核对或放宽任意移动来销账。

本轮仅读产品源码，新增隔离探针/本文，未改产品、未构建或访问候选41268；Artigine的唯一GUI窗口不受影响。

## 源码链

1. [surface-core-facade.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:1116>)把原patch.position/measured收进geometryItems。
2. [同文件](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:1253>)只组合 `SET_NODE_GEOMETRY`，调用原 `executeOnServer`，再读原保存Canvas。
3. 该路径的Core写只有正文/title；`core_saved`也只看text/title的coreCommittedNodeIds。普通geometry没有Presentation save、没有setPositions；[返回路径](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/surface-core-facade.ts:1288>)会是spatial_saved:true/core_saved:false。
4. [semantic inspect](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-receive.ts:111>)正确检查原Presentation位置与实际载体是否一致，所以正常move暴露了前面的写桥缺口。

`ArtifactView.position/size`仍是旧字段，Core Project client明确说不可当Huabu Spatial Truth；正确补点是原Presentation位置owner，不是再PUT源View“顺便修坐标”。[原注释](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/web-gen2/src/backend/projects.ts:58>)。

## 真实临时Core证据

执行：`node scripts/native-material-move-owner-probe.test.mjs`。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop正常移动owner探针/2026-10-17T03-57-09-921Z/report.json>)。

| 动作 | 真实结果 |
| --- | --- |
| 原semantic producer把确版材料放到Main | 位置`542.4233409610985,-191.24673913043478`，真实Presentation version1、真实pinned View/binding/node |
| 原 `nodes:batchActions` 正常移动到`910.25,280.5` | HTTP200，Huabu真实保存了新位置，spatial_saved:true/core_saved:false；不是rounding/measurement |
| 读Core Presentation与View | Presentation全对象仍与原先deepEqual、version仍1、positions仍旧点；View对象也未改；Revision/ref不变 |
| semantic GET / 再次投放 | GET partial；再次POST409，原载体没被移动回旧release，未重复创建 |
| **只在隔离探针里**调用原Presentation PUT expectedVersion CAS，把该view位置同步为真实move | GET立刻present，repeat already-present并保新位置；stale CAS409。memberViewIds不变，只positions+原version变化 |

PASS指成功证明缺口和原owner可用，**不是生产已修复**。没有重写空间算法、没有SQL；Run0/model0，临时Core已关闭/清理。执行原O8鼠标动作的GUI边界由Artigine继续，本probe执行的是其真实后端提交owner。

## 正确的最窄写桥

落在既有facade原geometry batch路径，调用现 `PresentationApplicationService.save` / 原 `PUT /projects/:pid/presentations/:id` 的expectedVersion CAS；不另建前端位置store或保存队列。

1. 对原batch中确有position的项，用真实Canvas→Workspace→Scope/Surface映射和实际binding找view。仅同步**该原Presentation中已存在的memberViewId**，核project/Artifact/View/ref；Collection frame、Glyth本体、普通未绑定node和links不借此改成材料成员。
2. 若新保存点只是现有Presentation desired点的原DC/PC表示，沿既有precision helper视为同位置，不凭一次renderer measurement增Presentation version。
3. 真移动则按同一个原Presentation分组，把原state其余字段完整保留，只更新该组view的positions；用刚读的expectedVersion调用原布局owner。不调用Assembly.apply，不改membership、Artifact Current/Revision、原View位置或graphVersion。
4. 同一次原batch继续由现Huabu `SET_NODE_GEOMETRY` 保存真实carrier；推荐先用Core CAS拒绝陈旧布局，再执行原空间batch。跨系统不冒充事务：Core已成但Huabu失败必须返回明确partial/CoreSaved证据，不能沿目前仅text/title的coreCommittedNodeIds报“未写Core”。反向顺序也必须处理Huabu已成/Core失败，不能HTTP200销账。
5. 重复原几何请求如当前Presentation已经等于该已保存目标，skip布局CAS，避免重复version/ChangeSet；空间仍走原writer。只有已有真实ProjectEventOrigin时才复用原projectMutations去重，不新造ledger/hash。
6. 原Undo/Redo移动仍由原O8产生前后geometry，走同一桥，让Presentation位置跟随真实动作；桥接不再调用本地setNodes，不额外录O8帧。材料创建/成员关系整体Undo仍是另一项，不因普通移动修好就报全齐。

已有owner：[Presentation save](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/presentation-application-service.ts:54>)、[原HTTP version-CAS](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/routes/presentations.ts:148>)。原route明确placement-only不新增semantic ChangeSet，保留这个语义。

嵌套node需沿既有原geometry/parent owner转换为正确world位置再同步Presentation，不把frame内局部position直接写成scope绝对点；本轮临时复现只覆盖新root材料的top-level普通移动，未验证嵌套移动，不能提前记完成。

## 施工后的最低回归

- root三Surface真实move→flush→刷新：Huabu位置与原Presentation更新一致、sameView/Revision/File/成员不变、repeat和只GET核对都能确认。
- 同位置measurement/round2不多改Core版本；真实0.01+移动经**写桥成功**同步后可以正常确认；若只有空间被错误改变而Presentation没同步，仍须partial，不放宽比较。
- 多view同Presentation一笔原batch，另一Presentation/普通node/link不被触及；保原相机、选区、草稿、旧节点/边。
- stale Presentation CAS不覆盖并发新布局；任一侧提交后另一侧失败的partial可读且不误重放membership。
- 原O8 move Undo/Redo分别让空间和Presentation回到前后位置，索引不增假帧；成员级统一Undo另记。

当前仍待实际施工，本报告不以“正确发现owner”当作完成移动功能。
