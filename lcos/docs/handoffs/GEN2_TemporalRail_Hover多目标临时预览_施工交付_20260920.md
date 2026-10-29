# GEN2 Temporal Rail Hover 多目标临时预览施工交付（2026-09-20）

## 结论

Context Temporal Rail 的 Episode hover 现已把该组全部已投影节点显示为临时黑色轮廓。它不写 Core、不改 committed selection、不移动 camera；leave、Esc、click、rail unmount 及现场切换都会清理。click 清理预览后继续调用既有多目标 selection/camera 路径。

## 实现

- `TemporalRail` 复用既有 `projectTemporalGroupTargets()`，只把已解析 `nodeIds` 发布到 ephemeral store。
- `TemporalPreviewOutlines` 挂在唯一 `LcosHostOverlay`。空闲 owner 只订阅 preview/canvas identity；只有 hover 有目标时才挂 active child，订阅 nodes/viewport 一次，不给每个节点加高频订阅。
- preview 带 `ownerKey + canvasId`，旧现场 cleanup 不能误清新现场。
- Episode hover/focus 为临时纯黑凸出；committed active 状态仍保留既有 accent 轮廓。

## 验证

- Vitest：7 files / 29 tests passed；行为覆盖 leave、Esc、click、scope change、unmount 与 stale-owner cleanup。
- Huabu web typecheck：passed。
- changed-file ESLint：passed。
- production build：passed；仅既有 CSS highlight、lottie eval 与 chunk-size warnings。
- Headless production path：`scripts/e2e/temporal-hover-preview.mjs` passed。
  - 真实 Episode `可定位 8/16`；hover 出现 8 个临时轮廓。
  - hover 前后 selection 数量、viewport transform 均不变，Core write=0。
  - leave/Esc 清零；click 后 8 个 committed selection、临时轮廓为 0。
  - 切到 Main 后 rail unmount，临时轮廓为 0。
- 截图：`C:\Users\1\AppData\Local\Temp\LCOS_GEN2_temporal_hover_preview_20260920.png`。

隔离 fixture 的 Main 仍保留一条既有 stale canvas binding，最终现场切换会出现一个已白名单且完整记录的 404；Temporal、console page error 与本卡断言均通过。

## 修改范围

- `huabu/apps/web/src/lcos/surfaces/context/temporalPreviewState.ts`
- `huabu/apps/web/src/lcos/surfaces/context/TemporalPreviewOutlines.tsx`
- `huabu/apps/web/src/lcos/surfaces/context/TemporalRail.tsx`
- `huabu/apps/web/src/lcos/ui/context/TemporalRailView.tsx`
- `huabu/apps/web/src/lcos/LcosHostOverlay.tsx`
- `huabu/apps/web/src/lcos/ui/context/context-spatial.css`
- 对应测试与 `scripts/e2e/temporal-hover-preview.mjs`

无 schema、Core 数据、selection/camera owner 或持久化变更；回滚本提交即可。
