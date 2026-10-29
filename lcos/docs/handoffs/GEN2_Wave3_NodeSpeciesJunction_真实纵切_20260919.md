# GEN2 Wave 3 节点物种 Junction｜真实纵切回执

日期：2026-09-19
工作区：`E:\OS开发\LCOS_GEN2`
分支：`frontend-reconstruction-v2`
提交：未创建；未 push

## 结论

本轮完成 Wave 3 的最小真实纵切：`useLcosCanvasProps → createLcosNodePresentationSeam → NodeWrapper` 仍是唯一 presentation junction。已绑定节点的 LCOS body 现在独占四档 `mark / summary / working / reading` density；Huabu binary LOD 只保留给 native heavy node，避免外层 placeholder 抢走 LCOS body。

Artifact 的 Draft 识别接入 Core 当前 revision 的真实 `ArtifactRevision.runId` + Artifact `managed` 字段。缺少 Run 关联时保持 Source/unknown 既有诚实降级，不按 title/id 猜。Context、Decision、Run、Glyth 继续由现有 Core kind/entityType binding 解析。

## 变更链路

### Before

```text
Core graph / ProjectionBinding
  → single presentation seam
  → LCOS body
  + Huabu NodeWrapper binary minimal placeholder
  → bound node 在小屏时可能被 Huabu placeholder 覆盖
```

### After

```text
Core ArtifactRevision.runId + Artifact.managed
  → ProjectedEntityFacts.sourceRunId
  → resolveNodeSpeciesFromFacts → draft
  → createLcosNodePresentationSeam → species body
  → NodeWrapper hostPresentation 已存在时跳过 Huabu binary LOD
  → useLcosDensity 负责 LCOS 四档 density
```

## 修改文件

- `apps/web-gen2/src/host/projectionFacade.ts`
- `apps/web-gen2/src/presentation/projectedNodeDescriptor.ts`
- `apps/web-gen2/src/spatial/projectToSpaceProjection.ts`
- `apps/web-gen2/src/spatial/reconciliationRunner.ts`
- `apps/web-gen2/test/projected-node-descriptor.test.ts`
- `huabu/apps/web/src/components/Nodes/NodeWrapper.tsx`
- `scripts/e2e/wave3-species.mjs`
- `docs/handoffs/GEN2_Wave3_NodeSpeciesJunction_真实纵切_20260919.md`

## READ_SOURCE / ADOPTED / VERIFIED

- `READ_SOURCE`：`E:\OS开发\LCOS_GEN2\README.md`；`E:\OS开发\LCOS_GEN2\AGENTS.md`；`E:\OS开发\LCOS_GEN2\docs\construction\GEN2_R1-R6_to_Wave3-10_ExecutionMap_20260919.md`；`E:\OS开发\LCOS_GEN2\docs\handoffs\GEN2_Wave2_CanvasKernel_B1_B3_B5_施工交付_20260919.md`；`apps/web-gen2/src/presentation/{nodeSpecies,projectedNodeDescriptor,nodePresentation}.ts`；`apps/web-gen2/src/host/projectionFacade.ts`；`huabu/apps/web/src/lcos/{useLcosCanvasProps,lcosReferenceState,nodes/createLcosNodePresentationSeam,nodes/useLcosDensity}.ts(x)`；`huabu/apps/web/src/components/Nodes/NodeWrapper.tsx`。
- `ADOPTED`：Core `ArtifactRevision.runId` + `Artifact.managed` → `ProjectedEntityFacts.sourceRunId` → existing `resolveNodeSpecies` / single junction → registered Draft body；existing `hostPresentation` seam → Huabu `supportsMinimalLOD` owner handoff。
- `VISUAL_SOURCE`：沿用既有 Wave 3 node species / Figma geometry and LCOS density contract；本轮未新增视觉组件或 token。
- `RETIRED`：对已绑定 LCOS body 退役 Huabu `SemanticPlaceholder` 的 binary LOD 覆盖行为；native note/pdf/web 的原有 binary LOD 保留。
- `VERIFIED`：`npm run typecheck --workspace @local-creative-os/web-gen2` PASS；web-gen2 全量 test PASS（325/325）；`npm run typecheck`（`huabu/apps/web`）PASS；`git diff --check` PASS。隔离栈先由 Wave 2 真实 fixture 建立项目/画布，再以 `LCOS_E2E_WEB_URL=http://localhost:5273` 运行 `wave3-species.mjs`：9 个节点全部进入 LCOS presentation body，`source=8`、`bare fallback=1`，放大后的 density 内容可读；截图为 `wave3_step1_species_1366.png`、`wave3_step2_zoomin_1366.png`。
- `UNRESOLVED`：当前浏览器 fixture 没有带 `ArtifactRevision.runId` 的生成物，Draft 的真实浏览器态仅由单测覆盖，未冒充整机验证；Core graph 也没有通用 Run 活动状态 read model，Working body 仍保持现有真实状态不足时的 fallback。Run/Decision/Context 的深层 action/state body 需各自 Wave 5/7/8 read model。两份历史未跟踪 patch 未触碰。

## 风险与回滚

- 未改变 Core schema、主键、事务、安全措施或 Huabu geometry/drag/resize/edge owner。
- 回滚本轮未提交 diff 即可；不要删除或覆盖 `LCOS_Gen2_R5_honest_state_safety_patch_20260917.patch`、`LCOS_Gen2_UXInfra_combined_v2_ee0c489.patch`。

## 下一步

当前纵切可提交；后续用真实 generated artifact fixture 补 Draft 浏览器态，并在对应 Wave 接入 Working/Run 状态 producer。
