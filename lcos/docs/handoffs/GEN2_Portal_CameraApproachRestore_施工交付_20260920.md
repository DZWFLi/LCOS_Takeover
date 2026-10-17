# GEN2 Portal Camera Approach / Restore 施工交付

## 结果

Portal / 子现场纵切已复用 Huabu 唯一 ReactFlow camera owner 完成：

- 进入前，来源画布朝真实投影节点轻量 approach；
- 目标有已保存 viewport 时，从较宽起始帧 settle 到该 viewport；
- 目标没有已保存 viewport 时，继续走既有 first-fit，不伪造相机状态；
- 返回时从来源 approach pose 反向恢复到进入前的精确 viewport，并恢复原 selection；
- reduced-motion 直接到位；快速返回和新请求会使旧 transition 失效；
- 跨路由只保存一次性 presentation intent，没有新增第二个相机、第二套 Canvas store 或 Core truth。

## 主要改动

- `Canvas.tsx` / `useInitialCanvasViewport.ts`：允许一次性的 presentation-only 初始 pose。
- `CanvasHostBoundary.tsx` / `LcosCanvasCommands.tsx`：消费目标 Canvas 的 settle / restore intent。
- `childWorksiteNavigation.ts`：记录来源 viewport、approach pose 和 canonical source node，再切换真实 target canvas。
- `LcosProjectShell.tsx`：返回来源 canvas 后恢复精确 framing / selection，并处理快速中断。
- `lcosShellStore.ts`：新增一次性 `worksiteCameraTransition`，按 id 更新和消费。
- Atlas、Assembly、Workflow 入口只补 exact source node 传递；既有 target resolver 与 navigation owner 不变。
- `wave6-context-portal.mjs`：改成 fail-fast 的真实 enter → child → quick return 度量。

## 验证

- `pnpm --filter @huabu/web typecheck`：PASS。
- 定向单测：4 files / 29 tests PASS。
- `pnpm --filter @huabu/web build`：PASS；仅保留既有 CSS `::highlight`、lottie eval、chunk size warning。
- 真实浏览器（Vite 5283 / Core 43141 / Huabu 3011）：PASS。
  - 来源 approach 有可见中间帧；
  - fresh target 保持 first-fit `translate(0px, 0px) scale(1)`；
  - quick return 后 source canvas、viewport、selection 全部精确恢复；
  - `worksiteCameraTransition === null`；
  - console / page / HTTP errors = 0。
- `git diff --check`：PASS。

截图：

- `C:/Users/1/AppData/Local/Temp/trae/screenshots/wave6_context_portal_source.png`
- `C:/Users/1/AppData/Local/Temp/trae/screenshots/wave6_context_portal_child.png`
- `C:/Users/1/AppData/Local/Temp/trae/screenshots/wave6_context_portal_return.png`

## 边界

- Camera transition 是可丢失 UI presentation，不写 Core。
- 目标无 saved viewport 时不会制造“恢复成功”假象，只使用已有 first-fit。
- 回滚本提交即可；无 schema / migration / 外部数据变更。
