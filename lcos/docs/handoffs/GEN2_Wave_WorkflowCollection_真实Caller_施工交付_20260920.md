# GEN2 Wave Workflow Collection 真实 Caller 施工交付

```text
BASE: d8803e6
BRANCH: codex/wave-workflow-collection
STATUS: IMPLEMENTED / COMMITTED / NOT PUSHED
```

## 这次落了什么

- Core `Scope(kind=workflow)` 只在 Main/root canvas 通过既有 `ProjectToSpaceProjection + ProjectionBinding` 投影；没有新增 store、表或 scope truth。
- Main 节点由同一 `LcosSpeciesBody` junction 进入 `WorkflowCollectionView(rendition="主画布")`。
- Main 节点的入口先按真实 `scopeId → Workspace.scopeId` 读取目标现场，再复用 `beginChildWorksiteNavigation` 进入正确的 Workflow 子现场；无绑定/无画布如实禁用。
- Assembly 的真实 warehouse workflow item 使用同一 `WorkflowCollectionView(rendition="装配")`，目标复用现有 `workspaceTargetsForItem` 与 `enterChildWorkspace`。
- Workflow Worksite 继续唯一消费 `WorkflowCardPool`，没有复制卡池或技能 truth。
- Gallery 补上 Workflow Collection 三种 rendition，方便视觉回看。

## 文件

- `apps/web-gen2/src/spatial/reconciliationRunner.ts`
- `apps/web-gen2/src/host/projectionFacade.ts`
- `apps/web-gen2/src/presentation/nodeSpecies.ts`
- `apps/web-gen2/test/nodeSpecies.test.ts`
- `huabu/apps/web/src/lcos/nodes/LcosSpeciesBodies.tsx`
- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx`
- `huabu/apps/web/src/lcos/dev/LcosFamiliesGalleryPage.tsx`
- `huabu/apps/web/src/lcos/ui/workflow/workflowCollectionWiring.test.ts`

## 验证

- `npm run typecheck:web-gen2`：通过。
- `node --import tsx --test test/nodeSpecies.test.ts test/g08-closure.test.ts`：16/16 通过。
- `git diff --check`：通过。
- Huabu typecheck/build：本 worktree 的 Huabu 依赖未安装，无法在此环境执行；未把失败伪装成通过。主仓已有 `node_modules` junction 不能解析其 workspace 包，需在主机现有 Huabu 工具链中运行。

## 未完成 / 限制

- 未 push。
- 真实浏览器手测需由主工作区 cherry-pick 后启动 Huabu dev 栈完成。
- Workflow Collection 的 preview 仍只接受 Warehouse 提供的真实 `previewRef`，没有新增伪造封面。

## 回滚

删除本提交即可恢复到 `d8803e6`；没有迁移、数据库表或不可逆外部写入。
