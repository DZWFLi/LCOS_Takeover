# GEN2 R5 / Wave 7 Workflow Hand Cards → Run 真实纵切

日期：2026-09-20

分支：`frontend-reconstruction-v2`

基线：`b5ec366`
范围：Workflow / Hand / Card Pool 的最小可测试真实链，不扩 Temporal、T7 full fork 或第二 Run/draft/store。

## 结论

Wave7 的最小行动链已接到现有 owner：

```text
Core warehouse + Core Skill catalog
  → Workflow Card Pool（三个语义 lane：workflow/skill TaskCard、material reference、conversation receiver）
  → useLcosReferenceStore.addEntityToDraft（canonical reference draft）
  → existing LcosComposerHost / existing Conversation Work View
  → CoreCollaborationClient.delegate → POST /projects/:id/runs → receipt-or-error
  → existing Collaboration projection
     ├─ WaitingInputSection（有真实 pending input 时出现）
     └─ ArtifactReturnSection（有真实 pending review 时出现）
```

只有 workflow/skill 使用 LcosTaskCard；artifact/resource/note/context/collection 进入独立 compact reference lane，conversation 进入独立 receiver/session lane。材料、工作流、技能卡没有 receiver 时，Composer 保持 disabled 并说明“请先从卡池选择一个会话作为接收者”；Conversation 卡是显式 receiver 入口。没有伪造 provider 成功、Waiting 或 Review 数据。

## 变更前 → 变更后

```text
前：warehouse 只筛 workflow → 取用只写 draft → 打开/运行未接 caller
后：warehouse workflow/material/conversation + skill catalog
    → TaskCard / material reference / receiver 三 lane
    → canonical draft/reference → existing Composer
    → receiver 缺失时 disabled；Conversation receiver 可真实 delegate Run
    → existing Conversation Work View 可到达 Waiting/Review producer
```

## READ_SOURCE

- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\04_逐Wave施工卡与验收.md`：`## Wave 7`，目的/切片/退出条件。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\10_T1-T7原始施工卡阅读入口.md`：`Wave 7` 最小读取表；T2 Worksite、T4 Round8、T5 Context/Workflow V3、T6 Run、Figma 06/07/13。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T4\LCOS_Gen2_T4_442_Round8_Workflow_WorkView_CurrentSourceCensus_20260907.md`：Workflow / Work View owner 边界与 Run 邻接能力。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T5\LCOS_Gen2_T5_ContextWorkflow交互专项_前端施工正本_V3_20260910.md`：§9 Workflow Cards、§10 Card Pool、§14 fixture-first ports。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T6\LCOS_Gen2_T6_to_T5_03_SourceSeam_Donor_ImplementationInput_20260906.md`：§8 Workflow seam、§13 ResultSlot、§14 donor boundary。
- 当前生产源码：`huabu/apps/web/src/lcos/surfaces/workflow/{WorkflowWorksite,WorkflowCardPool,workflowCardSemantics}.tsx/ts`、`huabu/apps/web/src/lcos/lcosReferenceState.ts`、`huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx`、`huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.tsx`、`WaitingInputSection.tsx`、`ArtifactReturnSection.tsx`、`apps/web-gen2/src/backend/{assembly,skills,collaboration,runs}.ts`。

## ADOPTED

关键 production caller：`WorkflowWorksite → WorkflowHandOverlay → WorkflowCardPool`; Card Pool 的 `takeCard` 只写 `useLcosReferenceStore` 并调用 `useLcosShellStore.openComposer`，既有 `LcosComposerHost.submit` 负责 `CoreCollaborationClient.delegate` / Run receipt；`ConversationWorkViewBody` 继续持有 `WaitingInputSection` 与 `ArtifactReturnSection`。

| donor / symbol | target | production caller |
|---|---|---|
| Core `GET /projects/:id/warehouse` via `CoreAssemblyClient.getWarehouse` | `WorkflowCardPool` warehouse read model → material/receiver lanes；仅 workflow 进入 TaskCard | `WorkflowWorksite → WorkflowHandOverlay → WorkflowCardPool` |
| Core `GET /projects/:id/skills` via `CoreSkillCatalogClient.list` | `toWorkflowHandCards` skill TaskCards | `WorkflowCardPool`；skill producer 失败时独立 unavailable |
| `useLcosReferenceStore.addEntityToDraft` | `WorkflowCardPool.takeCard` | `[data-lcos-material-take]` / `[data-lcos-receiver-take]` / task lane take |
| `useLcosShellStore.openComposer` + `LcosComposerHost` | `workflowComposerTarget` / existing host | Card Pool take → `LcosHostOverlay` |
| `CoreCollaborationClient.delegate` → `CoreRunClient.createRun` | unchanged | existing `LcosComposerHost.submit` |
| `useLcosShellStore.openWindow('conversation', ...)` | existing `ConversationWorkViewBody` | Conversation card “打开会话” |
| `WaitingInputSection` / `ArtifactReturnSection` | unchanged | `ConversationWorkViewBody` Core collaboration projection |

## VISUAL_SOURCE

- Figma Workflow `5388:22998`；取用卡 `5335:110`（3:4 TaskCard / Card Pool 状态轴）。
- Figma Composer existing near-field `5388:324`；inline Work View `5280:669`。
- 保留 b5ec366 Glyth visual seam、Wave6 Context child navigation、Wave5 Reader/Assembly/Composer single-host 结构；本批未改 NodeWrapper、Canvas kernel、Glyth、ProfessionalWindowStage。

## RETIRED / 保留边界

- `isWorkflowCardItem` 恢复为只认 `workflow`；skill 可作为 task/equipment 卡。普通 artifact/resource/note/context/collection 进入独立 compact reference lane，conversation 进入独立 receiver/session lane；两者均不使用 `LcosTaskCard`，实体仍只作为 reference，不复制正文或创建第二 truth。
- “打开（尚未接入）”死文案被替换为可用的 Composer take 与 Conversation Work View caller；send/fork/handoff 仍留在 Wave8 的 fail-closed owner。
- 保留唯一 `useLcosReferenceStore` draft、唯一 `LcosComposerHost`、唯一 Core Run owner；没有新增 Workflow graph、Run store 或 provider session。

## VERIFIED

自动检查：

```text
corepack pnpm exec vitest run src/lcos/surfaces/workflow/WorkflowCardPool.test.ts --config vitest.config.ts
→ 1 file / 2 tests passed（TaskCard / material reference / receiver 三 lane 语义不混淆）

corepack pnpm exec eslint src/lcos/surfaces/workflow/WorkflowCardPool.tsx src/lcos/surfaces/workflow/workflowCardSemantics.ts src/lcos/surfaces/workflow/WorkflowCardPool.test.ts
→ passed（无新增 error）

corepack pnpm exec tsc --noEmit -p tsconfig.json
→ passed（huabu/apps/web）

corepack pnpm run build
→ passed（既有 CSS `::highlight`、lottie eval、large chunk warnings）

corepack pnpm test
→ baseline 环境失败：29 files / 144 tests failed，主要为既有 React invalid-hook-call、Milkdown decoration 与 localhost:3000 连接失败；本批定向测试不受影响

git diff --check
→ passed
```

隔离浏览器：

```text
LCOS_E2E_BASE=http://localhost:5273 node scripts/e2e/wave7-workflow.mjs
→ PASS
```

真实证据：

- Workflow route、stage、Huabu canvas 均存活；缺失 canvas 时通过生产“建立 Workflow 画布”按钮创建并回写 workspace。
- Card Pool 读到 9 张 warehouse-backed entries（artifact ×8、conversation ×1）；TaskCard lane 为 0（workflow task 0、skill task 0），material reference lane 为 8，receiver/session lane 为 1。`[data-lcos-skill-unavailable]` 诚实显示，因为隔离 Core `/projects/lcos-gen2-dev/skills` 当前返回 500；fixture 没有 workflow/skill task card，不能伪造任务卡。
- material `artifact:artifact-ambientAudio` 取用后出现在 Composer reference strip；target `artifact:artifact-ambientAudio`；submit disabled；阻断原因为“已加入草稿；请先从卡池选择一个会话作为接收者”。
- conversation `conversation:conversation-e2e-fixture` 作为 receiver 后复用同一 Composer，真实 Run submit 回执为“Run 已创建（回执未带 id，查阅 Main/运行节点）”。
- Conversation Work View 可达；Waiting/Review 数量为 0（当前 fixture 没有 pending input / pending review，不伪造状态）。
- 截图：`C:\Users\1\AppData\Local\Temp\trae\screenshots\wave7_step1_workflow_1366.png`、`wave7_step2_hand_1366.png`、`wave7_step3_take_draft_1366.png`、`wave7_step4_run_submit_1366.png`、`wave7_step5_conversation_work_view_1366.png`。

## UNRESOLVED / GAP

- 隔离 Core Skill catalog producer 返回 500，技能卡暂不可用；卡池保留真实 warehouse 卡并展示 unavailable。需要 Core skill-layer fixture / producer 修复后补 skill-card 浏览器证据。
- 当前隔离 fixture 没有 workflow/skill task card，因此 TaskCard lane 为空；材料引用与会话接收者 lane 仍完成真实 Composer → Run receipt 链。
- 当前 fixture 没有 pending input 或 pending review，所以 Waiting/Review 仅验证 production caller 可达，未声称状态已产生；需要真实 provider 的 waiting/review fixture 做下一次跨状态浏览器证据。
- Run 回执未带 run id，UI 按既有 honest receipt 展示；不在前端猜测或制造 id。
- Wave8 的 live send、native full-history fork、完整 handoff/receiver switching 不在本轮范围，继续 fail-closed。

## 回滚

回退 `WorkflowCardPool.tsx`、`workflowCardSemantics.ts`、`WorkflowCardPool.test.ts` 与 `scripts/e2e/wave7-workflow.mjs` 即可；无 schema、Core migration、Huabu kernel 或 Glyth runtime 变更。未 push。
