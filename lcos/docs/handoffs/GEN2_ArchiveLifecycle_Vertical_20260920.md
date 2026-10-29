# GEN2 Artifact 归档 / 恢复纵切交接（2026-09-20）

## 结论

本分支以 **Artifact** 为第一类 canonical 可归档对象，完成了 Core 持久化、项目级 mutation、显式归档入口、Reader 只读状态、Search / Assembly / active projection 的生命周期区分，以及 ChangeSet revert / reapply。对象身份、ArtifactView、Revision、Relation 均保留；归档不是删除。

当前状态为 **IMPLEMENTED / HEADLESS REVERIFY REQUIRED**：Core 与组件链通过；`Assembly → Reader 归档 → 旧 Huabu node / ProjectionBinding 退出 → Archive 可发现并只读 → Reader 恢复 → 新 node / binding fresh placement → reload 保持` 的 fail-fast 脚本已落库。中央 pending-version 调度补丁后的最后一次 headless 被外部中断，没有生成结构化摘要，因此合并后必须由 root 在稳定隔离栈复验，不能把旧一轮通过结果冒充为当前提交结果。

## 范围与裁决来源

- 仓库：`E:\OS开发\LCOS_Gen2_archive_lifecycle`
- 分支：`codex/archive-lifecycle`
- 起点：`943bb06 fix(runtime): close ACP input recovery gaps`
- 施工卡：
  - `LCOS_Gen2_T6_C1-1_ProjectIdentity_ProjectionEligibility_ArchiveRestore_ExactSourcePlan_20260907.md`
  - `LCOS_Gen2_T6_C1-3_ArchiveRestore_ProductionImplementation_PatchPlan_20260907.md`
  - `T6_Patched_Core_Owner_Plan_20260906.md`
  - `LCOS_Gen2_T6_to_T5_01_StableTruth_StateBoundary_20260906.md`
- 采用：Artifact 是第一批 owner；`archivedAt` 独立于 availability；恢复沿用同一 Artifact id；不恢复旧坐标。
- 未采用：通用 Archive 平台、第二 Store、localStorage、删除 View / Revision、批量归档、其他实体类型归档。

## 数据流

### 变更前

```text
Artifact(active)
  → Project Graph / Search / Warehouse / Huabu projection
  → 没有 canonical archive lifecycle
```

### 变更后

```text
Reader archive
  → POST /projects/:projectId/artifacts/:artifactId/archive
  → MutationSafetyService（project scope + idempotent）
  → SQLite artifacts.archived_at + MutationChangeSet（同事务）
  → artifact.changed / change_set.changed
  → Search / Warehouse 默认排除
  → GET artifacts?lifecycle=archived 显式发现
  → ArchiveBody → Reader（只读）
  → restore（同一 Artifact id）
  → active reconciler 应按当前画布重新投影，不读取 ArtifactView.position
```

## Exact file / symbol / caller

### Domain / Contract

- `packages/domain/src/index.ts` — `Artifact.archivedAt`
- `packages/contracts/src/curation-patch.ts` — `MutationChangeItemV1.artifact_archive_state`
- `packages/contracts/src/search.ts` — `SearchQueryVNext.includeArchived`、`SearchHitVNext.archivedAt/readOnly`

### Core owner

- `apps/local-core/src/metadata-repository.ts`
  - `#migrate_056_from_v55`
  - `runCurationMutation(...artifactArchiveStates)`
  - `#upsertArtifact`：普通 graph save 不覆盖 lifecycle
  - `#artifact`：投影 `archivedAt`
- `apps/local-core/src/mutation-safety-service.ts`
  - `archiveArtifact` / `restoreArtifact` / `#setArtifactArchiveState`
  - `revert` / `reapply` 的 archive state 分支
- `apps/local-core/src/routes/entity.ts`
  - `GET /projects/:pid/artifacts?lifecycle=active|archived|all`
  - `POST /projects/:pid/artifacts/:aid/archive|restore`
- `apps/local-core/src/project-search-service.ts` — 默认 active；`includeArchived` 只读、无 location / view target
- `apps/local-core/src/warehouse-service.ts`、`routes/artifacts.ts` — active 默认排除
- `apps/local-core/src/routes/curation.ts` — 透传 `includeArchived`

### Projection / SSE

- `apps/web-gen2/src/spatial/reconciliationRunner.ts` — graph 保留 archived，active source set 排除 archived；restore 仍走 `ProjectToSpaceProjection` 的当前画布 incremental placement，没有读取旧 `ArtifactView.position`
- `apps/web-gen2/src/backend/collaboration.ts` — 既有项目 SSE 暴露 `onProjectEvent`
- `huabu/apps/web/src/lcos/collaboration/collaborationSessionStore.ts` — `watchArtifactChanges` 复用同一 project SSE
- `apps/web-gen2/src/host/lifecycleReconciler.ts` — `HostLifecycleReconciler.onMutationSuccess`：mutation 与 project-open reconcile 竞争时保留 pending version，直到真实 sweep 跑过；并发 mutation 继续合并
- `apps/web-gen2/src/host/projectionFacade.ts`
  - `Gen2Host.removeArchivedArtifactFromCurrentCanvas`：fresh Core graph 确认 `archivedAt` 后，仅删除当前 canvas 的 Artifact node / binding
  - `Gen2Host.notifyMutationSuccess`：关系与其余投影的完整 reconcile 通知入口
- `huabu/apps/web/src/lcos/shell/LcosProjectShell.tsx` — `artifact.changed` caller → 当前 host mutation reconcile

### UI consumer

- `apps/web-gen2/src/backend/artifacts.ts` — list/archive/restore typed client
- `huabu/apps/web/src/lcos/professional/ArchiveBody.tsx` — 归档列表、Reader、恢复
- `huabu/apps/web/src/lcos/professional/ArtifactReaderBody.tsx` — active archive / archived readonly / restore
- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx` — 复用 Professional Window 打开 Archive
- `ProfessionalWindowStage.tsx`、`lcosShellStore.ts` — 注册 `archive` body key；没有新壳

## 已验证

- migration 55→56：已填充 v55 DB 升级，Project Graph / View / Revision / Relation 保留。
- project-scoped archive / restore；不存在或跨项目返回 404。
- 重复 archive / restore 幂等；不重复 Event / ChangeSet。
- Project Graph 保留 archived Artifact；Warehouse / Search 默认排除。
- `includeArchived` 返回 read-only hit，`locationRefs=[]`、`locationCount=0`、无 viewId。
- ChangeSet revert / reapply；restore 后 SQLite reopen 状态一致。
- active reconciler 定向测试：archived binding 被列为 orphan 并删除。
- UI 组件链：Assembly 打开 canonical Archive body；归档条目可打开 Reader；Reader 显示只读并恢复同一 identity。
- production race 修复：project-open reconcile 在途时 `Gen2Host.reconcile('mutation')` 会诚实返回 `false`；调用方不再丢弃该信号，而是等待当前（可能已经 retarget 的）host 可执行后再跑。
- cold-start fast path：Reader 的 Core archive 成功后，先核 fresh graph，再复用 `nodeProjector.removeOrphanNode` 退出当前画布；随后仍通知中央 reconciler。RFS 删除失败不会倒写成 Core 失败，UI 保留 archived truth 并显示“归档已保存，画布仍在同步”。Restore 不走 fast path，继续由普通 reconcile 创建新 node / binding 和 fresh placement。
- fail-fast headless：归档后旧 binding / node 均消失；恢复后的 spatial id 与归档前不同；reload 后仍是恢复生成的新 binding，因此没有复用旧 node id 或旧坐标。

### 命令与结果

```text
npx vitest run tests/archive-lifecycle.test.ts tests/projection-bindings.test.ts tests/metadata-repository.test.ts tests/conversation-continuation-service.test.ts --maxWorkers=1
→ 47/47 PASS

npm run test --workspace @local-creative-os/web-gen2 ...
→ 338/338 PASS

npm run test -- --run ArchiveBody.test.tsx ArtifactReaderBody.test.tsx
→ 21/21 PASS

npx tsx --test apps/web-gen2/test/g09-host.test.ts
→ 13/13 PASS（含 Core archived guard、当前画布删除与 binding 解绑）

LCOS_E2E_WEB_URL=http://localhost:5276 node scripts/e2e/archive-lifecycle.mjs
→ PASS（全新 SQLite / Huabu workspace / 主画布冷启动）
→ oldSpatialId=node-0426ad91-01f9-40c9-959f-de7db85dbba7
→ freshSpatialId=node-d93f3970-8213-42f4-a785-d59cac5f9e7a
→ reloadSpatialId=node-d93f3970-8213-42f4-a785-d59cac5f9e7a
→ consoleErrors=[] / pageErrors=[] / http=[]

Assembly archive entrance targeted test
→ PASS

Core / web-gen2 / Huabu web typecheck
→ PASS

npm run build:local-core
npm run build (huabu/apps/web)
→ PASS（仅既有 CSS / third-party / chunk-size warning）

git diff --check
→ PASS
```

## 浏览器实测

隔离栈使用 Core `:43136`、Huabu `:3016`、Vite `:5276`，没有打开可见窗口。headless Chromium 实际完成：

```text
Assembly
→ 打开 项目定位 Reader
→ Archive
→ Reader 显示「归档对象 · 只读」
→ Archive 列表发现同一 artifact-positioning
→ 再开 Reader
→ Restore
```

首次失败定位到 production caller 的时序竞争：Archive mutation 完成时 project-open reconciliation 仍在途，`Gen2Host.reconcile('mutation')` 返回 `false`；旧 caller 没有重试，因此旧 node / binding 会残留。修复后 fail-fast 场景要求旧 binding 变为不存在、旧节点文本计数归零，再允许进入恢复步骤；恢复又要求新 spatial id 与旧值不同，reload 后 id 不变。任一条件不成立脚本都非零退出。

修复落在既有 `HostLifecycleReconciler`：`onMutationSuccess` 递增 pending version；若 sweep 因 project-open 在途或 cooldown 未执行，内部只保留一枚定时器继续重排；只有某次真实 sweep 覆盖当前最新 version 后才清账。Reader / Archive / SSE 只 fire-and-forget 通知当前 host，不各自创建 polling，也不把 timer 绑在已被 retarget 的 UI caller 上。

主线冷启动复验进一步证明，初次全量 reconcile 在 20 秒窗口内仍可能尚未完成；删除机制本身可由手动 reconcile 立即触发，暖态也可通过。因此追加当前画布 fast path，把用户刚完成的 archive 从全量 sweep 的耗时中解耦。它不会猜 lifecycle：若 fresh Core graph 中对象仍 active / 不存在，拒绝删除；只有 canonical archived truth 才调用现有 orphan removal。

最终冷启动复验截图：`C:\Users\1\AppData\Local\Temp\archive-lifecycle-pass.png`。本次使用全新 SQLite、Huabu workspace 和现场画布；E2E 先通过正式空态入口建立主画布，没有复用历史数据或手工 reconcile。

## 未完成

- 本纵切没有恢复归档前坐标；这是明确产品语义，不是缺口。恢复通过现有 `ProjectToSpaceProjection` 在当前现场 fresh placement。
- 没有扩展到 Conversation / Workflow 等其他实体类型；本批 owner 限定 Artifact。

另有一条既有测试失败记录：`AssemblyBody.lifecycle.test.tsx` 的 context child workspace case mock 缺少当前 navigation `entries`；本批没有顺手修与归档纵切无关的旧 mock。

## 回滚

- 代码可按本分支提交逐个 `git revert`。
- migration 56 是 nullable additive column。已经打开过的 DB 会停在 v56；若回滚运行时代码，必须保留能读取 v56 的兼容 reader 或追加 forward migration，不能直接把旧二进制指向 v56 DB。
- 归档/恢复从不删除 Artifact、ArtifactView、Revision 或源文件。
