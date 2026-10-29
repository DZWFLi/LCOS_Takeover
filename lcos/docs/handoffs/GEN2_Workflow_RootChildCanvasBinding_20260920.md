# GEN2 Workflow Root / Child Canvas Binding

日期：2026-09-20  
基线：`frontend-reconstruction-v2@b31c5f5`  
范围：Workflow 根现场与导入子现场的 canonical workspace/canvas 解析  
状态：已实现并验证，未 push

## 问题与结果

导入 Workflow 会新增 `preferredSurface=workflow` 的子 workspace。旧解析把所有同类 workspace 都当成 `/workflow` 根入口候选，导致候选数大于一时根画布无法解析，页面没有 `.react-flow`。

现在根入口只接受 Project Graph 的 root scope 所属 workspace；子 Workflow 必须继续通过显式 `?workspaceId=` 进入。Project Graph 缺失或没有唯一 root scope 时直接报错，不猜第一个 workspace。

```mermaid
flowchart LR
  A[Core Project Graph root scope] --> B[Root workflow workspace]
  B --> C[/projects/:id/workflow]
  D[Imported workflow scope] --> E[Child workflow workspace]
  E --> F[/projects/:id/workflow?workspaceId=...]
```

## 修改文件

- `huabu/apps/web/src/lcos/app/useLcosWorksite.ts`
  - 与 project/workspace 同批读取 canonical graph。
  - `buildSurfaceCanvasMap()` 只消费 root scope workspace。
  - `ensureSurfaceCanvas()` 使用同一 root scope 规则。
  - graph/root scope 缺失时 fail closed。
- `huabu/apps/web/src/lcos/app/useLcosWorksite.test.ts`
  - 子 Workflow 不再污染根 SurfaceDock 映射。
  - 多个 root Workflow workspace 仍保持歧义并拒绝猜测。

## 验证

```text
useLcosWorksite.test.ts        2/2 PASS
@huabu/web typecheck          PASS
@huabu/web production build   PASS
git diff --check              PASS
```

隔离栈 headless 浏览器实际完成：

1. 根 `/workflow` 加载真实 `.react-flow`；
2. 单击 TaskCard 只预览，不打开 Composer；
3. Enter 进入精确 child workspace/canvas；
4. 返回根现场；
5. 双击再次进入同一个 child workspace/canvas；
6. 返回后 Take 打开唯一 Composer，并保留精确 `workflow:<scopeId>` target。

运行结果：`.e2e-data/workflow-canvas-binding-result.json`，`errors=[]`。  
截图：`.e2e-data/screenshots/01-root-workflow-react-flow.png`、`02-child-enter-react-flow.png`、`03-root-composer.png`。这些运行时文件不提交。

## 未覆盖与回滚

本批不调整 Workflow 卡片视觉、卡池布局或 provider 执行。视觉仍由后续 Figma lane 继续对齐。

回滚使用本提交的 `git revert`。回滚后，存在导入 Workflow 子现场的项目会重新使根 `/workflow` 入口变为歧义。
