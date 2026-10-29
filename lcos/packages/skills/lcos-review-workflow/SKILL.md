---
name: lcos-review-workflow
description: "搭或改 Workflow 面的 Review/Checkpoint 人工审阅组件、接 Accept/Reject Artifact Return 契约、写意图权限门时用本 skill 施工。"
---

# lcos-review-workflow：Review 审阅组件施工契约

## 何时不用（反边界）

- 不做自动 Accept：结果只到 `review` 相位，Keep/Revert 必须是人工判断（`lcos-executor-run` 同款红线）。
- 不伪造 item 级审阅：0.1 的 capabilities 粒度是「整个 ArtifactReturn（return 级）」，没有 item-level accept/reject——Core 未提供，UI 不得假装。
- Review 组件是 `adapter-only`：必须绑定真实 runId，禁止空造「假 Review 卡」。
- 不做执行与提交：那是 `lcos-executor-run` 的事。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **RunReview 契约**（`frontend-focus/packages/contracts/src/index.ts` L279-293）：`run / dispatch / binding? / returns: readonly ArtifactReturn[] / draftRevisions / inputRequest? / presentationPhase / capabilities{accept, reject, retry}`，每个 capability 是 `{enabled, reason?}`；`presentationPhase ∈ created|queued|running|waiting_input|review|completed|failed|cancelled`。
- **Accept/Reject 契约**（同文件）：`AcceptArtifactReturnInput{expectedBaseRevisionId}`（CAS 乐观锁）；`AcceptArtifactReturnResult{artifactReturn, currentRevision, previousRevision?, run}`；`RejectArtifactReturnResult{artifactReturn, draftRevision, run}`。接口：`ProjectContract.acceptReturn/rejectReturn`、`RuntimeReviewContract.getRunReview/acceptReturn/rejectReturn/retryReturn`。
- **客户端调用**（`frontend-focus/src/runtime/localCoreClient.ts`）：`projectRunReviews(projectId, limit)`、`getRunReview(runId)`、`acceptArtifactReturn(returnId, {expectedBaseRevisionId})`、`rejectArtifactReturn(returnId)`。
- **App 层接线**（`frontend-focus/src/App.tsx`）：`acceptRun`（L5949）= acceptArtifactReturn → `finalizeRuntimeRun(id, 'completed', 'Artifact Return accepted in LCOS.')` → 重载项目；`rejectRun`（L6020）= rejectArtifactReturn → 删 pending 节点 → finalize。reviews 投影（L7060）：`workflowReviews: runReviews.map(r => ({runId: String(r.run.id), label: r.run.instruction || id, phase: r.presentationPhase}))`。
- **权限门**（`frontend-focus/src/features/workflow/permissionGate.ts`）：`evaluateRunPermission({outputIntent, instruction, contextTitles})` → `allow`（只读白名单 `['analyze','read']`）| `confirm{title, items}`（写意图 fail-closed，未知意图一律当写）。UI 是 `PermissionConfirmCard.tsx`。
- **Review 组件**（`frontend-focus/src/features/spatial/components/WorkflowComponentRenderers.tsx`）：`ReviewComponent` 从 `context?.reviews?.find(item => item.runId === element.binding?.runId)` 取真实 review，`semantic = presentation?.variant ?? (bound ? 'waiting review' : 'candidate')`，点击调 `context?.onOpenReview?.(review.runId)`。

## 施工标准（分步骤）

1. **投放 Review 组件**：在 `WorkflowSurface.tsx` 用 `nextReview = props.reviews?.find(r => !projectedReviewIds.has(r.runId))` 找未投影项，header 出 `<Plus/>Review` 按钮，调 `addBoundComponent('review', runId, {runId}, phase)`——id `surface:review:${runId}`、binding `{runId}`、variant=phase。已投影判重用 `projectedReviewIds`（从 surfaceElements 的 binding.runId 收集）。
2. **打开审阅**：`onOpenReview(runId)` → App 层 `openRunReview(review)`（App.tsx L5092），数据源 `runReviews`（`projectRunReviews` 轮询/事件刷新）。
3. **Accept 落库**：走 `acceptArtifactReturn(runtimeReturnId, {expectedBaseRevisionId})`，成功后必接 `finalizeRuntimeRun`；CAS 失败（base revision 变了）要显示错误并放弃，不得盲重试。
4. **Reject 落库**：走 `rejectArtifactReturn(returnId)`，成功后移除 pending 画布节点；Current Revision 保持不变。
5. **写意图权限门**：Run 发送前调 `evaluateRunPermission`；`confirm` 时挂 `PermissionConfirmCard`（复用 ConfirmDialog 浮层协议：backdrop + `dismissFromBackdrop` + role=dialog），确认才发、取消则 Run 根本不创建。
6. **灯条**：Review 头部 `LightSegment mode="checkpoint" lightCheckpoint={2}`（保留范围：checkpoint 灯段一枚常亮）；Checkpoint 组件用 `lightCheckpoint={1}`。

## 视觉词汇（复用，禁自带样式）

- Review 卡：`.lcos-workflow-component.workflow-review`、状态钮 `.lcos-workflow-review-state`、头 `.lcos-workflow-component-header`（spatial-components.css）。
- 确认卡：`.permission-confirm-backdrop / .permission-confirm-card / .permission-confirm-items`；按钮 `primary-action / secondary-action`。
- 徽标/灯段/`:root` 与 `[data-lcos-theme='dark']` 双主题 token：`--lcos-segment-on / --lcos-segment-off / --lcos-glyth-*`。
- z-index 只准 `var(--lcos-z-modal-run-confirm)` 等既有 token。

## 验收（数值断言）

- `evaluateRunPermission({outputIntent:'analyze',...})` 返回 `{kind:'allow'}`；`outputIntent:'revise'` 返回 `{kind:'confirm', items.length ≥ 1}`（空 titles 兜底 `['当前项目']`）。
- Review 组件在无 binding 时渲染「待绑定」且按钮 disabled（`disabled={!review}`）；有 review 时 phase 文案与 `presentationPhase` 一致。
- 同一 runId 第二次投放被 `projectedReviewIds` 判重，surfaceElements 数量不变。
- `addBoundComponent('review', ...)` 生成的 op 经 `validateSurfaceOps` 必须 `{ok:true}`（minSize 300×170 满足、surface 匹配）。
- Accept 成功路径恰好 1 次 acceptArtifactReturn + 1 次 finalizeRuntimeRun；reject 后 `graph.nodes` 中 pendingArtifactId 不存在。

## 已知边界（0.1 不做什么，不假装）

- item-level 审阅（ChangeSet 内逐项勾选）待 Core 能力，0.1 只有 return 级。
- `capabilities.retry` 在契约里有字段，UI 审阅抽屉之外不提供独立 retry 入口。
- 原型模式（bootMode ≠ runtime）不写项目关系/不接受 Return，只提示。
