# GEN2 Workflow Canonical Producer 施工交付

## 结论

真实 Main 没出现 Workflow Collection 的原因不是 projector 断线：隔离项目 `lcos-gen2-dev` 只有 `scope-real-root(kind=root)`，`workflow scope=0`、`scope node binding=0`。三个 Main/Context/Workflow workspace 都指向同一个 root scope；`preferredSurface=workflow` 不能冒充 workflow 业务身份。

本批沿用已批准的 `.lcos-workflow.zip` 导入动作，补上 canonical producer：

```text
.lcos-workflow.zip
→ POST /projects/:id/workflow/import-as-workflow
→ Core workflow Scope + Workspace(s)（同一 graph mutation）
→ existing Workflow Presentation
→ Gen2Host mutation reconcile
→ existing Main Workflow Collection projector
→ existing Assembly warehouse scope projection
```

没有新 store、第二 Workflow graph、伪卡或 fixture 数据写入。UI 入口未冻结，本批没有自创按钮。

## 关键语义

- 相同项目重复导入相同 archive bytes，按 archive SHA-256 收敛到同一组 scope/workspace IDs；首次回 `201 created=true`，重放回 `200 created=false`。
- scope/workspace 通过既有 `metadata.applyMutations` 一次写入，继续使用 graphVersion、containment guard 和 SQLite transaction。
- archive 没有 workspace 时创建一个真实 fallback Workflow workspace；有 workspace 时稳定映射为项目内 IDs，避免直接采用外部 ID 撞库。
- Core 只建立 domain truth。Huabu canvas 仍由既有 `ensureWorkspaceCanvas → createCanvas → updateWorkspaceCanvasId` 在用户首次进入现场时建立。
- `Gen2Host.importWorkflowDefinition` 成功后调用唯一 `HostLifecycleReconciler.onMutationSuccess()`；Main 用现有 scope projector，Assembly 用现有 warehouse read model。

## 变更文件

- `packages/contracts/src/workflow-import.ts`
- `packages/contracts/src/index.ts`
- `apps/local-core/src/workflow-export-service.ts`
- `apps/local-core/src/routes/workflow.ts`
- `apps/local-core/tests/workflow-export-service.test.ts`
- `apps/local-core/tests/workflow-import-http.test.ts`
- `apps/web-gen2/src/backend/client.ts`
- `apps/web-gen2/src/backend/workflows.ts`
- `apps/web-gen2/src/host/projectionFacade.ts`
- `apps/web-gen2/src/index.ts`
- `apps/web-gen2/test/workflow-client.test.ts`

## 验证

- contracts typecheck：通过。
- local-core typecheck：通过。
- web-gen2 typecheck：通过。
- local-core targeted tests：2 files / 5 tests 通过。
- web-gen2 全量：332/332 通过（含 multipart client 与 host reconcile caller）。
- `git diff --check`：通过。

## 未完成

- 没有新增 UI import 入口；需等 Figma/施工卡指定宿主后调用 `Gen2Host.importWorkflowDefinition`。
- 未向隔离 fixture 写入 Workflow 数据，未用 mock 冒充浏览器呈现。
- 新 Workspace 初始没有 Huabu canvas；沿用既有首次进入建立/回写机制。

## 回滚

回退本提交即可；无 schema migration，无外部副作用，无用户数据修改。
