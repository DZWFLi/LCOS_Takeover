# Drop 原目标分派接缝

结论：**原库来源可以接现有 Drop store/Router；普通 Workspace 画布接确版投放，根 Main/Context/Workflow、Composer、Glyth 各留原提交语义。** 不能把所有释放都包装成 workspace membership，也不能把 `placeNativeLibraryMaterial` 的结果伪造成原 source View 的 AssemblyApplyResult。

本轮只读产品源码，新增独立隔离探针和本说明；43968 候选未访问/写入/重启，生产 freeze 保持。下一轮由 root 集成 producer/dispatcher，native agent 独占原库来源 adapter/transform。

## 真正采用的源

`currentGen2Root = E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926`。`currentGen2Resources` 明确采用它的 LcosHostOverlay、DropCommitRouter、DropIntentResolver、dropTypes、dropAssemblyReceipt、surfaceDockDrop、PortalDropWorkspaceContext、composerDropPreparation、AssemblyApplyService、metadata-repository；不是看到工作区副本就当实际源码。[选择表](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/current-gen2-resources.mjs:40>)

`scripts/start-full-integration.mjs` 的 browser build 把原 canvasStore 指向 `native-canvas-port.ts`；它的 `rfInstance` 就是当前 `window.__LCOS_NODE_LAB__.api`。现 `native-ui-source-transforms` 已把 Overlay 的 targetRef 改接 `useNativeWorksiteDropTarget`，Collection placementHost 改接原生桥；`native-chat-owner-transform` 只移除了第二个 Composer caller，Drop commit owner 仍在原 Overlay。[构建覆盖](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/start-full-integration.mjs:54>)、[现 target 改接](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-ui-source-transforms.mjs:147>)

## 目标 → 真 owner → 最窄改接

| 实际目标 | 当前分派与业务 owner | 下一窄接法 / 不能偷换 |
| --- | --- | --- |
| 当前普通/子 Workspace Canvas | `nativeWorksiteDropTarget` 核唯一 canvas↔Workspace，child 保 `{kind:'workspace',id}`；resolver 生成 assembly-apply；Overlay owners.applyAssembly → Core Assembly → Workspace working-set membership | **仅原库确版 artifact + 真实 canvas target + workspace/scene 目标**转 `placeNativeLibraryMaterial`。它已有确版 additional View → 同 Workspace membership → 原 projector → real binding/node → 原 O8 subscribe publication 读回。普通旧来源/Collection/rail/portal继续原 owner。当前 UI 的固定三现场导航限制不因后端支持 child 就自动消失 |
| 根 Main Canvas / 根 Main 入口 | `surfaceDockDropSemantic` 明确 `{kind:'main'}`，Core解析 root Scope / `presentation:context:<rootScope>` | 保根 Presentation member/position/ChangeSet owner；不能拿 activeWorkspaceId 改写成 workspace |
| 根 Context / Workflow Canvas 或对应入口 | `{kind:'context'|'workflow',id:真实scopeId}`；Core `#applyPresentationMember` 读/建原 Presentation，用真实 expectedVersion 提交成员和位置 | 保原 targetRef。确版材料需先通过既有 View owner 固定 revision，再把该确版 View 接原 Presentation；原空间读回再接现 projector/O8。现 `materials:place` 硬写 workspace，**不能直接拿它覆盖此语义** |
| 原 Chatbox Composer / 临时输入目标 | resolver composer-reference 保 `inputKey/intent` 与 exact reference；`beginComposerDropPreparation` 锁同 project/canvas/message/continuation/input；Overlay `references.addEntitiesToDraft`；workflow method另走 `addWorkflowMethodDrop` | 普通材料维持 `{entityType:'artifact',entityId,revisionId,artifactViewId?,mimeType?,displayLabel}`，只加入原 draft，不落 Canvas、不建立会话持久关系、不发模型。版本本来是显式 Revision，可在源 View 已前进后继续取旧 Revision；释放/异步返回仍核原 input/API/项目 |
| 原 Glyth / agent 节点 body | `NativeConversationDropTarget` 只注册当前 project/canvas/workspace +真实 connectedConversationId；resolver转 `assembly-apply targetRef:{kind:'conversation',id}`；Core建立 `conversation_context` Relation（source conversation artifact→target View），Overlay refresh原 collaboration session | 保持持久会话上下文，不降为 Composer临时引用。为了确版，传给原 Core relation owner 的 View需显式 pin选中 Revision；不能只把旧 revision塞payload却仍绑定会随Current变化的源View |
| Collection body / rail / portal | 原 collection membership、Railway receive/new-worksite/bookmark各有真实 owner及receipt | 来源 adapter可接入，dispatcher不抢这些分支；不拿当前Canvas投放替代远目标接收 |

依据：[child/root目标判定](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-worksite-drop.ts:9>)、[原根语义](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/shell/surfaceDockDrop.ts:18>)、[原提交 owner](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/LcosHostOverlay.tsx:371>)、[原Composer owner](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/src/lcos/LcosHostOverlay.tsx:420>)、[Glyth receiver](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-conversation-drop.tsx:65>)。

## dispatcher 的具体接缝

1. native agent 已落、尚未入口 wire：`native-library-drop.ts` / `native-library-drop-ui.ts` / `native-library-drop-transform.mjs`。原 Ko仍由原行写，另写既有 assembly MIME、用真正 acquireDrop持有**同一对象**。私有 Symbol来源含 projectId/canvasId/实际API/artifactId/artifactViewId/所选revisionId/fileRecordId/title/startScreenPoint；JSON不含Symbol/API。`readNativeLibraryDropCapture(payload)`是唯一读取口，不加Map/新拖放store。
2. Overlay原 committing effect（:250起）已有 `store.state.payload`、transactionId、dropCanvasId、activeSurface、activeWorkspaceId、原 API、readTarget、AbortSignal和signal/current-input生命周期。在这里捕获 release时原目标+确版来源，建立**可选 native material owner委托**；不是在dragstart提交。
3. 最窄 source-transform：给原 `DropCommitOwners` 增可选同模块委托，在 Router `execute` 的普通 `assembly-apply` 分支内部调用。原 `commit()` 的 transactionId+JSON signature去重保留，`signal.aborted`仍先判；无capture/非普通workspace材料即走原 applyAssembly。不要在 Router外先调用place，再调用原commit，否则去重罩不住写入。
4. 委托只消费已准确匹配的 `intent.sourceRefs[0] == capture.artifactViewId`、真实 canvas receiver/targetRef及同 project/canvas/API。多源/聚合仍走现有整组支持或明确拒绝，不能挑支持子集。释放后、只读Graph后、POST紧前/回包后都核原场景；target消失或换语义不得退回背景Canvas。现Router signature不含Symbol；必须保来源只附一次、同一原payload对象/同transaction，不得JSON重建来源或给旧transaction重新绑定另一选中版本。
5. **还要处理 settle，不然会把真投放重新判未知。** 当前 `lcosDropState.settle` 对一切 assembly-apply 强制 `mergeAssemblyDropAttempt`，而material结果不是原Assembly item rows。新委托回执须用窄私有标记/专用受控识别，令这一个真实producer回执直接settle；普通Assembly merge、unknownSourceKeys和失败子集重试原样。不要伪造 `assemblyItems`、改写原sourceRef或塞空成功。
6. unknown/partial 使用现 feedback.attempt / originalIntent / payload携同一次准确target与来源，给原反馈槽“核对放置结果”；**仅**调用 `placeNativeLibraryMaterial(input,{api,isCurrent,readOnly:true})`。不要调用 `router.clear→commit`、`retryFailed`或再次拖同payload去恢复。已确认读回才更新同feedback，不造成功；新场景不回填。现 `retryFailed`只为真失败子集准备，不应借给unknown。

### 可直接取得的参数

```ts
placeNativeLibraryMaterial({
  projectId: capture.projectId,
  canvasId: release.canvasId,
  workspaceId: intent.targetRef.id, // 仅已证明workspace/scene且canvas映射唯一时
  artifactId: capture.artifactId,
  artifactViewId: capture.artifactViewId,
  revisionId: capture.revisionId,
  fileRecordId: capture.fileRecordId,
  title: capture.title,
  position: { ...intent.placementPoint },
}, { api: capture.api, isCurrent, readOnly });
```

`placementPoint` 是原 recognizer **在 release重测时**用原API `screenToFlowPosition(clientX,clientY)`取得的world point；store将它放进冻结intent。`startScreenPoint`只作来源手势信息，绝不是落点；不能重新按当前相机换算旧release，也不能退回按钮的自动空位。[释放重测](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/drop/nativeAssemblyDrop.ts:44>)、[原坐标转换](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts:281>)、[现finiteposition支持](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-placement-client.ts:119>)。

缺实际release point的非Canvas入口不能伪造(0,0)。`api`必须原实际对象；`useCanvasStore.getState().rfInstance===capture.api`在当前native覆盖下可核。`isCurrent`还要核project/canvas/Workspace/activeSurface、当前Drop transaction、原target enabled/semantic与原API；只比canvas字符串不够。

## mutable View：现有能力与真实缺口

- 原 `AssemblyApplyRequestV1`只有 sourceRefs/targetRef/placementBySource，没有 sourceRevision expected；Core的 Presentation expectedVersion保护成员/位置，**不保护source View.revisionId**。View PUT也是普通upsert，没有View version CAS。因此“Graph读到r1→apply原View”中间它改成r2，会接到r2；不能把目标CAS说成确版保护。
- 正确窄路是沿现 `putArtifactView` 创建/复用**显式 revisionId、explicit_additional**的确版View，校准 project/scope/Artifact/Revision/FileRecord后接原目标。当前普通placement已有同workspace/artifact/revision组成的普通稳定主键、source多次校验和original projector，不需要新ledger/hash；根语义复用确版View owner后仍走原Presentation/Relation，不迁membership类型。多次检查不等于origin原子CAS：异步写之间origin再变化，可能已有确版View而后续未完成，应保partial并只读核对；不能重发整串，也不能称全事务完成。确版目标View自身被其他writer改写仍按existing identity conflict拒绝，不把普通upsert主键说成不可变保证。
- 历史无View不能补Current。普通placement producer本来能创建确版additionalView；新源adapter本轮暂时明确拒绝无View拖动，这是登记中的能力缺口，不能说历史拖放已完成。Composer可继续显式历史Revision引用。
- 普通placement的首次source View版本变更拒写是正确措施，保留它。恢复需要拆准入与准确回执读回，见下一节。

依据：[Assembly contract](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/packages/contracts/src/assembly.ts:115>)、[原Presentation CAS](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/apps/local-core/src/assembly-apply-service.ts:350>)、[View PUT](<E:/Codex 项目/LCOS夺舍计划_20261013/lcos/apps/local-core/src/routes/entity.ts:186>)、[实际采用View upsert](<E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/apps/local-core/src/metadata-repository.ts:6200>)、[确版placement](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-placement.ts:111>)。

## 真实Core探针：来源准入与GET恢复要拆

新 `node scripts/native-drop-owner-probe.test.mjs` 通过。复用现真实临时Core/Gen2Host/Huabu fixture，只运行本探针，不执行旧测试的Run片段；0模型、0候选、0原项目改动，官方putArtifactView和现投放producer写入只在可清理的合成runtime，结束已close/清理。[原始报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop源View确版探针/2026-10-17T01-47-54-486Z/report.json>)

实际结果：

1. 源View显式指r1，inspect absent后经现官方owner改为r2；place(captured r1+原View)拒绝 `MATERIAL_SOURCE_VIEW_CHANGED`，目标确版View还未创建。保护有效。
2. 源View恢复r1后，现producer成功在Workflow投放r1确版additional carrier，真实位置`{x:123.5,y:-248.25}`。
3. 仅让原source View再指r2；目标carrier和确版View仍r1，但现 `inspect(captured)`也409。模拟首200丢回包时，原unknown GET会永远卡住，即使确版结果已存在。
4. 用相同project/workspace/artifact/revision/file核对、只省mutable origin View筛选，可GET读到**同一node/同一确版View/同一点**，不是另建或Current替代。这一步仅证明安全恢复分层的可用事实，不是建议客户端悄悄删来源字段绕过保护。

### producer最小改法（下一轮，当前未修改）

将现 `source()`拆成同模块两个校验阶段，仍读原repository/producer，不建新账：

- `identityFacts`：始终核project/Workspace↔Canvas/Scope、Artifact、Revision→FileRecord、文件可用性及原hash一致性、View若存在的同project/Artifact/scope归属。**foreign/crossproject/别的Artifact View始终拒绝**，不能为恢复放宽。
- `originAdmission`：首次 absent→准备新View/写前必须再核origin View仍表示所选revision；origin变更不能写，旧保护不删。
- `inspect`先按准确稳定targetView/realbinding、同Artifact/Revision/File、真实投影node核对。若确版carrier已存在，允许原同归属origin View已前进，不要求它仍等于旧revision；若找不到准确carrier且origin已变，则拒绝新写/保持unknown。
- source View已被删除的unknown恢复是否允许要另明确：本轮没有证明，也不一并放宽。部分View/membership无carrier仍partial，GET不补写projector、不重放apply。
- client第一次POST回包丢失后只readOnly GET；始终携原捕获身份，server依据上面真实target facts确认。确认原O8 subscribe发布后才成功，重复Drop不暗移已存在carrier。

### 下一轮最低测试矩阵

| 场景 | 应断言 |
| --- | --- |
| POST确版提交成功但200丢失，之后origin前进 | 首POST1；恢复仅GET；同node/确版View/revision/file/位置，0新membership/node/Revision/Run |
| 无existingcarrier，Graph读后origin前进 | POST前/producer首写前拒绝；0新targetView/membership/projector；原稿/原Drop保留 |
| foreign/crossproject/另一Artifact source View，即使目标已有确版carrier | 仍拒绝，不能借GET恢复越权或串材料 |
| source是Current且Current前进 / 显式历史源View仍旧版 | 前者首次拒写；后者仍投真正旧Revision，不读Current |
| 释放后换API/Canvas/Workspace、目标消失/被覆盖 | 0错误目标POST；已提交则unknown、只核原目标，不把新场景盖掉 |
| 同gesture effect重复、正常重复drag、未知重复click | 原Router同tx共享Promise；准确既有carrier GET幂等；unknown无自动/手动重POST |
| 根Context/Workflow、Glyth、Composer | 分别断真实Presentation、conversation_context Relation、原draft引用；不能只有按钮状态或普通workspace测试 |
| geometry/selection/camera/edit/history | 旧节点/边/选区/草稿不变；release点准确；回填等待原subscribe发布；缺O8统一Undo单列 |

## Undo边界与未完成项

当前普通material placement能保原O8旧历史/编辑，不代表一次原Undo能撤销新additionalView、Core membership与空间carrier。Core Assembly有ChangeSet，原空间也有O8，但两者尚未统一成一次真实Undo意图；不能用删除本地node或清历史假装完成。根Presentation、Glyth relation也须各保其原ChangeSet/回读，不能偷塞进普通r6 localhistory。

本轮没有启用新Drop来源，没有产品构建/候选GUI通过结论；原库adapter自身测试通过、现producer按钮投放通过，都不等于这套完整Dispatcher已经接好。
