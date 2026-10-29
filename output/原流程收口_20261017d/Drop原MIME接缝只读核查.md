# Drop原MIME接缝只读核查

结论：原库按钮投放已桥到准确材料producer，不代表原库拖出也桥好了。当前至少有三种不同载荷，不能把“原DropCommitRouter挂着”当成全部已通。本项只读，没有新增施工或业务请求。

| 原入口与当前caller | 真正接收链 | 当前差异与正确接入位置 |
|---|---|---|
| TapNow原 `Zp.j` 行拖出：`Ko=application/x-library-asset`，`setData(Ko,JSON.stringify(asset))`，`effectAllowed=move` | 原 `jF` document `dragstart→dragover→drop`，`jk(raw)→Qe(asset,screenToFlow(point))→Te(node)` | [库变换](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-assembly-library-transform.mjs:388>) 只在原 `ut` Apply先接 `LCOSNativeAssemblyOpen(detail)`，没有改这个document drop链。应保留原行/拖影/准确落点，把该释放点交既有精确Artifact/Revision/View producer及原O8回填；不能让Qe按URL重导入或改成Current。尚未GUI拖放验证，不能算按钮测试已覆盖。 |
| Context/Workflow等扩展原 `Zp` 类别行 | [原行变换](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-library-contexts-transform.mjs:81>) 对 `lcos_library_entry` 关闭draggable，点行开原TS详情 | 已有点击/取用不等于可拖。应按类别生成既有typed source，连接同一语义Drop owner；保留方法、集合等源类型，不冒充媒体URL。未接，不应删除能力或称支持全部拖出。 |
| 原GN2 Assembly carry handle（当前原件只读映射进副本依赖） | `AssemblyBody.beginAssemblyCarry` + `application/x-lcos-assembly` / ephemeral drop store；[原transport](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/drop/nativeAssemblyDrop.ts:24>) 在capture阶段接drop，才会进DropCommitRouter | 原载荷与Ko不同。旧AssemblyBody保留手势不证明新jF能发这种手势。现有同事务去重、释放点重测、Core正回执、空间失败partial必须保留；不另建一套Drop store/history。 |
| 原Huabu/GEN1摘录、页面、文本、文件传输 | `application/x-huabu-dnd`、GEN1 `LCOS_MATERIAL_TRANSFER_MIME`；materialTransferIngress/composer preparation分别消费 | 当前新原库没转换为这些格式；[Composer](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx:641>) 的onMaterialDrop只检查GEN1材料MIME，不能自然读Ko。原Glyth注册了准确空间接收面，但可选`onContextDrop`没有找到实际producercaller；不能凭壳上的onDrop声称原库→会话上下文闭环。 |
| 系统文件→TapNow原上传/原画布 | [Core upload](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/core-upload.ts:13>) 只允许PNG/JPEG/WebP，按准确上传URL关联Core回执 | PDF、音视频、Office等并未由这条原文件上传通道支持。旧GEN1 generic ImportCopy具备的能力不能替这里完成验收；下一步应复用其现有MIME/导入producer并桥原释放点，不把二进制当文本，也不新开一个“导入管理”窗。 |

实际owner与边界：`NativeConversationDropHost→LcosHostOverlay`已在agent根挂载（[agent-ui](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-agent-ui.tsx:40>)）。当前source transform将旧浮动Composer caller迁走，Drop owner仍保留；`nativeWorksiteDropTarget`严格核Project/Canvas/Workspace，Context/Workflow不能按Main猜目的地。当前资源映射会读取原GN2的指定只读源，因此判断不能只看副本里某个旧函数版本。

本核查没有重跑Drop GUI，也没有声称PDF等文件在Composer或Core所有入口都不能导入。结论精确限定为：**原库Ko与既有语义Drop未连成同一释放链，TapNow原上传入口的通用文件能力尚缺。** 原Collection合并鼠标手势/原UndoRedo实测与普通成员拖入是不同链，继续沿既有分项记录，不互相销账。

## 下一步可直接施工的DTO与seam（仍只读）

原`Zp`拖出时已经`JSON.stringify(asset)`，无需再向原行塞一份GN2卡片。真正身份由[projectAsset](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/assembly-library-projection.ts:99>)产生：

| Ko asset字段 | 真实含义/核对 |
|---|---|
| `asset.id`、`lcos_projection.artifact_id`、`assembly_item.entityRef.id` | 三者必须同Artifact；名称、缩略图和source_url都不是ID |
| `lcos_projection.project_id` | 必须同drag开始及释放时唯一原Project/API；禁止切项目后按新现场提交旧材料 |
| `presented_revision_id`、`assembly_item.presentedRevisionId` | 所选准确Revision，不改用`current_revision_id` |
| `artifact_view_id`、`assembly_item.entityRef.viewId` | 对应所选版本的既有View；真正历史版本可为null，不造一个Current View来补齐 |
| `file_record_id` | 准确Revision的FileRecord，必须可读并与现有Core内容证据一致 |
| `content_available`、`referenceable` | 展示时能力，不代替释放时真实Graph复核；`read_only`指原云库操作不是Core写授权 |
| `lcos_library_entry:{projectId,item}` | Context/Workflow扩展原行的另一种DTO；不是上述artifact投放DTO，不能因`asset_type=4`就按纯文本创建 |

可直接复用[policy](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-assembly-policy.ts:7>)的`nativeAssemblyItem({asset},projectId)`和`verifyNativeAssemblyVersion(graph,projectId,item,fileRecordId)`，释放时再读准确Graph。普通artifact行`draggable`的原限制只是`isRenaming`；Core行现有`read_only`字段不会自动把它变成语义Drop。缺投影、错误项目、归档、过期View/Revision等要原处失败，不能悄悄走`source_url→Qe`。

最窄原接缝是`jF`现有document `rt` drop回调中的`const Cs=o({x:clientX,y:clientY}),wn=Qe(yt,Cs);wn&&Te(wn)`：`o`已是原screenToFlow转换，`Cs`就是用户明确释放的世界点。保留原Ko拖影、原排除库内drop的`ot`和原取消周期；在`Qe/Te`之前把Core投影载荷交唯一typed路由，并**消费一次**。不要再同时让后续原document listener和window capture各提交一遍。可以在原`Zp.j`开始时只向现有Drop store登记准确payload；现有`bindNativeAssemblyDropEvents`也必须扩到这个原transport或让它识别所登记的assembly状态，不能假设它会读取Ko JSON。新增桥接只是瞬态手势owner，不新增列表/Window/store/history。

## 准确producer能复用多少

现有[client](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-placement-client.ts:104>)：

```ts
placeNativeLibraryMaterial(
  { projectId, canvasId, workspaceId, artifactId, revisionId, artifactViewId?, fileRecordId, title? },
  { api, isCurrent, readOnly?: boolean }
): Promise<
  | { status: 'placed' | 'already-present'; nodeId; artifactViewId; revisionId; outsideVisible? }
  | { status: 'unconfirmed' | 'rejected'; message }
>
```

**当前不能原样传显式点**：client类型没有position，`absent`分支总调`initialPosition(api)`。最窄扩展是可选`position?:{x,y}`；有显式点必须finite并原样用，没点才沿现有默认避障。不要把拖放点再吸附到别处。[后端input](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-placement.ts:5>)已经允许position，并透传到原`putArtifactView`和`nodeProjector.projectEntity`，不用新URL导入或重建Artifact。GET inspect只读身份，不把position混成材料身份。

既有链是`flushCanvas(saved)→GET materials:place→absent时唯一POST→准确receipt→api.synchronizeMaterialProjection`；[原O8回填](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/startup-node-bridge.js:249>)验证同Project/Canvas/API及确版ref，走既有`backfillNodeReceipt(material-projection)`，等同一原`subscribeNative`发布后再返回成功。不`addNodes`猜新节点，不reload，不替换旧Canvas。unknown只用同intent的`readOnly:true`核对；保留已提交材料与旧编辑，不自动重POST。

该producer当前每Workspace/Artifact/Revision复用唯一准确载体：已经present就`already-present`，**不会因第二次拖到另一点自动移动或复制旧载体**。若产品要求显式复制，应另接既有`duplicate-view`意图，不擅自修改幂等身份或以第二个随机View绕过未知回执。

## 按释放目标分流，不能全接材料place

| 原释放目标 | 正确owner与仍缺的接线 |
|---|---|
| 普通当前工作现场Canvas，目标确认为当前Workspace working set | 可走上述准确placement producer+原O8，窄扩position即可；先同Workspace/Canvas核对，保显式点和旧相机。 |
| Context/Workflow根或三键上的语义投放 | `nativeWorksiteDropTarget→surfaceDockDropSemantic`实际返回`{kind:'context'|'workflow',id:scopeId}`；child才是workspace。**材料place后端固定`assembly.apply targetRef=workspace`，不能直接替代根Context Presentation/Workflow成员语义**。需保持原typed target，沿既有Core Assembly apply/真实成员readback，再补同原空间owner准确落地；不把Canvas显示了当Saved Context/Workflow成员已加入。Main的typed target也不能悄悄改成workspace。 |
| 原可见Composer输入框 | 临时本条引用，复用`assemblyDraftReferenceOf`、`prepareDraftReferences`和原`referencePickOwnerKey/inputKey/message/continuation`归属；同原preparing/sending生命周期，不发送、不先place。历史无View但有准确Revision可作为已有artifact引用，继续沿capability检查。 |
| Glyth节点body | 这是durable conversation context，现resolver明确转`assembly-apply targetRef=conversation`；不是Composer临时草稿。核准确ConnectedConversation后沿Core正回执刷新同会话，不借Canvas membership冒充。 |
| 库中的已保存Context / Workflow方法行 | 载荷保留真实scope类型：Context整组准确成员进输入，方法走`addWorkflowMethodDrop/appendWorkflowMethodDraft`，包括步骤及附件，不当作一段asset.content复制。投放到空间时保留聚合/自投/scene限制。 |
| Collection / Portal / Rail / 排除区域 | 保留唯一resolver的优先级、遮挡、release重测和typed接收者；原Ko的document全局drop不能绕过这些目标统一落Canvas。 |

最后一个实际缺口：既有Assembly source若没有准确View，不能硬构造`artifactView` source；`prepareAssemblyReferences`仅处理Capture/Resource，并不是任意历史Artifact的View producer。Composer引用和当前Workspace确版place已有独立支持；其他语义目标的历史无View应明确补既有Core View owner后再接，或诚实记未接，不能改用Current。原Drop router的成功receipt也不等于材料已进原O8；当前`onAssemblyApplied`重点处理Collection，普通媒体仍需上述准确发布确认与统一Undo补齐。

最低验收：真实Ko mouse drag→原释放点→准确目标分流；一般/历史确版、重复已存在不挪旧节点、换现场/迟到/丢200只读核对、原选区/相机/草稿保留、Context/Workflow成员与空间分别读回、Composer和Glyth不同语义、原Undo/Redo及刷新；全文件MIME另按真实ImportCopy逐类验。此节是可施工准备，**没有把这些接线或验证标成完成**。

## 2026-10-17e 再核：下一轮最小改动面

只读确认当前代码仍未接Ko。原 `page-Da_DfwiK.js` 的 jF `rt` 仍先 `jk(hs)`，然后直接 `const Cs=o({x:ht.clientX,y:ht.clientY}),wn=Qe(yt,Cs);wn&&Te(wn)`；其中Qe按source_url选原图文等factory，Te直接追加原节点并改选区。当前按钮适配位于 `lab/native-assembly-library-transform.mjs:388`，只接ut，不覆盖这个rt。**不需要重写拖放体系，先补这一处实际旁路。**

| 最小文件／owner | 下轮修改建议 |
| --- | --- |
| 新专用 `lab/native-library-drop-transform.mjs`（或现有assembly库transform的独立接缝） | 只改原Zp拖出start与jF drop的Core分支。原Ko原JSON／原拖影／原库内排除／取消周期保持；非LCOS资产走原路径。LCOS字段缺失／身份错误也必须消费并失败，禁止降级回Qe/Te。用同既有原源码精确restore方式证明其余字节不动，不造新窗口。 |
| 一个窄transport adapter，复用当前 `useLcosDropStore/acquireDrop` 与原resolver/router | 原Ko拖动开始时按真实投影登记准确typed payload，并给同DataTransfer附已有`application/x-lcos-assembly`标记；不新建Drop store。释放由现有 `bindNativeAssemblyDropEvents` 的window capture advance→canCommitDropRelease→commit消费，原document rt便不能二次Qe/Te。不能只在document rt异步启动第二个commit，否则绕过释放目标重测且有双POST风险。若拒绝开始，也不能让Core行继续原URL导入。 |
| `lab/pilot/native-material-placement-client.ts:4/:110/:140` | 给现有input加可选有限 `position:{x,y}`；**只在absent的唯一POST使用原screenToFlow显式点**，有点不走默认避障；无点继续按钮默认逻辑。GET/query身份仍只用原project/canvas/workspace/artifact/revision/file/View，不把落点变主键或额外幂等账。already-present保持原节点位置，重复拖动不暗移动。 |
| 现有 typed router 的Canvas/workspace producer分派 | 只有resolver确认普通当前Workspace目标时，调用同 `placeNativeLibraryMaterial`；显式点由当前原API转换一次并原样送。Context／Workflow根、Composer、Glyth、Collection、Portal和Rail继续各自既有语义owner，不全部转为workspace place。 |
| `lab/startup-node-bridge.js:249` / `lab/startup-history-intent.js:1832` | 不新增owner：继续 `synchronizeMaterialProjection→material-projection→原O8→subscribeNative`；现有准确绑定、API／现场、编辑保护和发布确认全部保留。此链能承接准确生产回执，不让transport自己addNodes、重建Canvas或reload。 |

真正可复用的原返回是现有client的 `{status:'placed'|'already-present',nodeId,artifactViewId,revisionId,outsideVisible?}`；unknown/rejected仍为 `{status,message}`。unknown必须把**同一已释放意图的准确input与同api/isCurrent归属**交既有核对动作，调用readOnly:true；不得用用户第二次拖动当自动重放。原TS按钮已经在 `native-assembly-ui.tsx:172/:255` 做in-flight与“核对放置结果”，可提取这段状态所有权给同原容器复用；不要另弹一个GN2管理窗，也不能仅禁用而没核对回程。

现有client POST前flush、GET absent/present/partial、明确只POST一次、late编辑／现场变化后unconfirmed、原O8发布与liveRef核对均可保持。后端 `native-material-placement.ts:5/:116/:131` 已验证position并同时给Core View及原projectEntity，不用扩新后端域producer；**其membership仍固定workspace，不能拿这点覆盖根Context/Workflow语义。**

本节仅核对源码、提出最小施工面；没有改production、没有运行candidate拖放、没有声称Ko已闭环。原完整流程的Undo/Redo和未知回执仍须通过同一真实拖放入口验证，不能用此前按钮／Collection测试代替。

注意typed payload边界：已有View可以沿真实`artifactView` source；历史无View虽然材料place producer可准确创建View，但当前Assembly payload不能凭空填一个View ID。下一轮应明确让既有router在准确Artifact+Revision分支调用上述producer，或先由既有Core View owner补齐再走原source；不能只加MIME标记便声称所有历史行已支持。`railwayAssemblyDrop.ts:79`只支持真实聚合，不是可直接拿来cast任意artifact的函数；可借其既有MIME/store生命周期，不改其源类型含义。
