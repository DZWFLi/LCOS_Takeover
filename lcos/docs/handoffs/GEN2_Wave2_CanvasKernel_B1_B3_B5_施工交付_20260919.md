# GEN2 Wave 2 Canvas Kernel｜B1 / B3 / B5 施工交付

日期：2026-09-19
范围：Wave 2 最终收口，仅覆盖 B1（拖动→undo→redo）、B3（内容 revision/CAS）、B5（关系批量投影与 reload 恢复）。
工作区：`E:\OS开发\LCOS_Gen2`
分支：`frontend-reconstruction-v2`
提交：未创建；未 push。

## 结论

**READY_TO_COMMIT：是。**

Wave 2 真实隔离浏览器回归连续两轮 `ok:true`。第一轮完成了真实拖动、Ctrl+Z、Ctrl+Shift+Z、CAS 与 reload 对账；第二轮复用同一持久化数据库后，关系投影 warning 收敛为零。工作区仍保留既有未提交修改和两个历史未跟踪 patch，本次没有覆盖或编辑它们。

## 变更链路

### Before

```text
Core projection/reconcile
  → 多次 CREATE/CONNECT 写入
  → sync update / 本地 staging 进入画布历史
  → 用户拖动后 undo/redo 栈被远端回显或重载污染
  → projected node 的首次 content PUT 使用 REV_EMPTY
  → 409 NODE_CONTENT_CONFLICT / contentConflict toast
```

### After

```text
RFS CREATE_NODES receipt.revisions
  → seedNodeContentBaseline(rev)
  → 首次 content PUT 使用服务端权威 CAS revision

reconcile relations
  → resolve endpoints
  → ONE CONNECT_NODES batch
  → INSPECT_EDGES 验证真实 edge id
  → 绑定 relation ↔ edge

open sequence 完成且静默
  → 用户真实 drag
  → gesture history snapshot
  → Ctrl+Z / Ctrl+Shift+Z
  → autosave + reload
  → binding / node / edge 对账
```

## 实际变更

- `apps/web-gen2/src/spatial/projectToSpaceProjection.ts`、`host/projectionFacade.ts`：转发 RFS `revisions`，为新投影节点提供权威内容 CAS baseline。
- `apps/web-gen2/src/spatial/relationProjection.ts`、`spatial/reconciliationRunner.ts`：关系按批次单次 `CONNECT_NODES`，验证 echo/真实 edge，避免重复绑定和共享 edge 误删。
- `huabu/apps/web/src/store/canvasStore/save/nodeContentQueue.ts`：支持在节点进入浏览器 store 前采用 revision receipt，冲突后正确解冻 baseline。
- `huabu/apps/web/src/store/canvasHistoryManager.ts`、`canvasStore.ts`、`canvasSyncStore.ts`、`lcosHost.ts`、`useLcosCanvasProps.tsx`、`stageProjectedSources.ts`：保留用户 gesture history，区分初始化物化与用户动作，并让 projection/staging 顺序稳定。
- `scripts/e2e/wave2-kernel.mjs`：等待真实打开序列完成后再测手势；对 B1/B3/B5 fail-fast，并记录 sync/history/timeline 证据。
- 对应单测更新：`apps/web-gen2/test/{binding-projection,g06-reconciliation,g08-closure}.test.ts`、Huabu `stageProjectedSources.test.ts` 与 `nodeContentQueue.baseline.test.ts`。

## 验收结果

首轮隔离环境：

- 真实 drag：`translate(0px,0px)` → `translate(206px,106.275px)`。
- Ctrl+Z：回到 `translate(0px,0px)`。
- Ctrl+Shift+Z：回到拖后几何。
- B3：无 `409 PUT .../nodes/.../content`，无 `failedResponses`。
- B5：drag、undo、redo 后均无 `contentConflict` toast。
- reload：ReactFlow 仍唯一；旧 Controls/MiniMap/Panel 隐藏；节点与 binding/edge 对账通过。
- 首轮有两个关系 edge 识别 warning，原因是同轮异步物化时 echo edge 尚未可验证；Core relation 保留，后续 reload 收敛。

第二轮复用同一数据库：

- `ok:true`，`failures:[]`。
- `consoleErrors:[]`、`consoleWarns:[]`、`failedResponses:[]`。
- history timeline 仅含用户 `gesture-arm → undo → redo`。
- 关系/节点对账：`duplicateEntityBindings=[]`、`unboundCanvasNodes=[]`、`danglingBindings=[]`、`renderedButOffCanvas=[]`。
- reload 后 canvas node = 9、projection binding = 9；关系 edge bindings 保持稳定。

## 命令与结果

| 命令 | 结果 |
|---|---|
| `npm run typecheck --workspace @local-creative-os/web-gen2` | PASS |
| `npm run test --workspace @local-creative-os/web-gen2` | PASS，324/324 |
| `npx vitest run src/store/canvasStore/save/__tests__/nodeContentQueue.baseline.test.ts src/lcos/nodes/stageProjectedSources.test.ts`（Huabu） | PASS，12/12 |
| `npm run typecheck`（`huabu/apps/web`） | PASS |
| `npm run build --workspace @local-creative-os/web-gen2` | PASS |
| `npm run build`（`huabu/apps/web`） | PASS；仅既有 CSS pseudo-element/chunk size warning |
| `node scripts/e2e/wave2-kernel.mjs`（干净隔离环境首轮） | PASS，`ok:true`；记录首轮瞬态 warning |
| `node scripts/e2e/wave2-kernel.mjs`（同库第二轮） | PASS，`ok:true`；warning 收敛为零 |
| `git diff --check` | PASS；仅 CRLF→LF 提示，无 whitespace error |

## 证据

- [chrome/唯一 Canvas](C:\Users\1\AppData\Local\Temp\trae\screenshots\wave2_step1_chrome_1366.png)
- [选择/框选](C:\Users\1\AppData\Local\Temp\trae\screenshots\wave2_step2_select_1366.png)
- [拖动/undo/redo](C:\Users\1\AppData\Local\Temp\trae\screenshots\wave2_step3_drag_undo_1366.png)
- [缩放/平移](C:\Users\1\AppData\Local\Temp\trae\screenshots\wave2_step4_zoom_pan_1366.png)
- [reload 恢复](C:\Users\1\AppData\Local\Temp\trae\screenshots\wave2_step5_reload_1366.png)

## READ_SOURCE / ADOPTED / VERIFIED

- `READ_SOURCE`：`E:\OS开发\LCOS_Gen2\docs\handoffs\GEN2_NewFrontend_Wave2_CanvasKernelBoundary_20260913.md`；`E:\OS开发\LCOS_Gen2\docs\construction\HUABU_RETIREMENT_LEDGER.md` 的 Wave 2 实测段；实际源码为本交付列出的 projection / reconcile / history / CAS 文件。
- `ADOPTED`：RFS `CREATE_NODES.revisions` → `ProjectToSpaceProjection` → `Gen2Host.onNodeContentRevisions` → Huabu `NodeContentQueue.seedBaselinesFromRevisions`；`RelationProjection.reconcileRelationEdges` → production `ReconciliationRunner`。
- `VISUAL_SOURCE`：本轮没有新增视觉设计；沿用 Wave 2 Canvas kernel 与 LCOS chromeMode 约定。
- `RETIRED`：旧 NodeToolbar / Controls / MiniMap 在 LCOS mode 保持退役；本轮未恢复旧 chrome。
- `VERIFIED`：隔离 Core + Huabu + Chromium 真实鼠标拖动、键盘 undo/redo、CAS response、关系 binding 对账、reload；截图见上。
- `UNRESOLVED`：首轮关系物化仍可能出现可恢复的瞬态 edge verification warning；同一持久化环境第二轮已收敛，未发现残留 binding/edge 对账问题。构建的既有 CSS pseudo-element 与 chunk size warning 不属于本范围。

## 风险、未完成与回滚

- 本轮不改变 Core schema、主键、事务边界或安全措施；未新增 hash/contract/baseline/gate，只采用已有 revision/CAS 与 binding 规则。
- 仍未声称 Wave 1–10 或 R1–R6 整体完成；本回执只覆盖 Wave 2 B1/B3/B5。
- 未完成项仅为首轮瞬态 warning 的观测与后续自然收敛；没有阻断当前退出条件。
- 回滚：按文件回滚本次未提交 diff 即可，两个历史未跟踪 patch 与其他工作区内容保持原样；没有 commit/push 需要回滚。

## 下一步

等待用户验收后再创建小而可审查的 commit；在此之前不 push、不合并其他 GUI 专线改动。
