# GEN2 Wave 6 — Context / Portal child-worksite 真实纵切

日期：2026-09-20

分支：`frontend-reconstruction-v2`

范围：R4 → Wave 6 的最小可测试 Context/Portal 入口与返回连续性

状态：`PASS`

## 结论

Context Atlas 与 Assembly 进入子工作现场现在共用一个 `beginChildWorksiteNavigation` seam。进入前会捕获真实来源的 `surface / workspaceId / canvasId / viewport / selected node ids / selected entity refs`，目标只能是已解析且已有真实 `workspace.canvasId` 的工作现场；缺画布时 fail-close，不猜 root、不静默创建替代目标。

返回由 `LcosProjectShell.returnToSource` 继续负责：通过 Huabu 现有 `canvasStore.switchCanvas` 恢复来源画布，再写回来源 viewport 并恢复选中节点，然后回到来源 surface。没有创建第二个 React Flow、graph、store 或 camera。

## 修改文件与 exact owner

- `huabu/apps/web/src/lcos/navigation/childWorksiteNavigation.ts`
  - `beginChildWorksiteNavigation`
  - 统一 Context Atlas / Assembly 的 child-worksite 进入路径，捕获来源连续性并导航到精确 `workspaceId`。
- `huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.tsx`
  - `ContextWorksite.enterItem`
  - 使用 route 传入的 `isChildWorksite` 与 `surface`，不再从可能过期的浏览器 URL 或 stale shell surface 推断来源。
- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx`
  - `enterChildWorkspace`
  - 复用同一 child-worksite seam，去掉重复的来源捕获/导航实现。
- `huabu/apps/web/src/lcos/shell/lcosShellStore.ts`
  - `LcosChildReturn`
  - 增加 `sourceViewport` 与 `sourceEntityRefs`，仍是 ephemeral UI navigation context，不是 Core truth。
- `huabu/apps/web/src/lcos/shell/LcosProjectShell.tsx`
  - `returnToSource`
  - 返回时通过既有 Huabu canvas owner 恢复 viewport 与 selection；当空间 node id 在重投影后变化，会用 `sourceEntityRefs` + `waitForProjectedEntity` 按当前 projection 解析新的 node id；ContextWorksite 获得 route-owned child 标记。
- `huabu/apps/web/src/lcos/navigation/childWorksiteNavigation.test.ts`
  - 进入成功捕获真实来源连续性；目标 canvas 缺失时不导航、不写 return context。
- `huabu/apps/web/src/lcos/shell/lcosShellStore.test.ts`
  - 覆盖 child return 的 viewport/entity identity 字段。
- `scripts/e2e/wave6-context-portal.mjs`
  - 隔离栈可复现 fixture：复用生产 `POST /api/canvas/` + Core workspace canvasId 回写，补 source note；真实浏览器硬断言 Atlas → child route → return 的 canvas、viewport、selection、route。

## 流程

```text
Main / Context / Assembly source
  → Core 已解析的 Warehouse item / Workspace
  → beginChildWorksiteNavigation
     ├─ capture source canvas + viewport + selected identity
     ├─ shell.beginChildNavigation（仅临时返回上下文）
     └─ /projects/:projectId/:surface?workspaceId=:workspaceId
  → 同一个 Huabu Canvas kernel 加载目标 canvas
  → 返回来源现场
     ├─ switchCanvas(sourceCanvasId)
     ├─ setViewport(sourceViewport)
     ├─ selectNodes(source ids)
     │  └─ id 失效时按 sourceEntityRefs 等待当前 projection 的新 node id
     └─ navigate(sourceSurface [+ source child workspace query])
```

## 验证

- `corepack pnpm typecheck`（`huabu/apps/web`）：通过。
- 最终定向 Vitest：`6 files / 36 tests passed`。
- `@huabu/web` production build：通过。
- 定向 ESLint：`0 errors`；10 个 `no-non-null-assertion` 是本批未新增的既有告警。
- `git diff --check`：通过。
- `node scripts/e2e/wave6-context-portal.mjs`：`PASS`。
  - fixture source：`workspace-real-context` → `canvas-7fa2a998-c59e-4ce0-8e00-4b1aa171f53b`；source node selected。
  - child：`/projects/lcos-gen2-dev/main?workspaceId=workspace-real-main`，目标 canvas `canvas-a1b0b3b4-a5ff-41bb-a8ff-b99de1da21f6`。
  - return：回到 `/projects/lcos-gen2-dev/context`，source canvas、`transform: translate(-136.6px, -76.8px) scale(1.2)` viewport、source node selection 全部恢复；浏览器 console errors 为 0。
  - 截图：`C:/Users/1/AppData/Local/Temp/trae/screenshots/wave6_context_portal_source.png`、`wave6_context_portal_child.png`、`wave6_context_portal_return.png`。

## 当前真实 GAP

- 生产功能的最小 Context/Portal 纵切已闭合；fixture 建立脚本只服务隔离 E2E，不改变生产对象模型。
- Temporal Rail 仍保持空态骨架：没有真实 episode/time-group producer，本轮没有使用 `updatedAt` 猜业务时间，也没有伪造刻度、hover 鱼眼或 wheel window。
- Portal 的 approach/restore 动效仍属后续 Wave 8/9 视觉收口；当前返回语义已经复用唯一 Huabu camera/store。

## 不包含

- 不修改 `NodeWrapper`、Glyth、GUI Stage3、Professional Window CSS。
- 不碰两个历史 untracked patch：`LCOS_Gen2_R5_honest_state_safety_patch_20260917.patch`、`LCOS_Gen2_UXInfra_combined_v2_ee0c489.patch`。
- 不 push。
