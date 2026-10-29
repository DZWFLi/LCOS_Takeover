# GEN2 Temporal Rail 时间窗口与五档长度施工交付（2026-09-20）

## 结论

Temporal Rail 现在由 `TemporalRail` 持有当前时间窗口。滚轮只推进/回退这个窗口，重新投影可见 group 与窗口内 ratio，不向 Huabu Canvas 发 zoom/camera 命令。每组以 canonical `eventCount + targets.length` 经单一纯函数得到 continuous score，再量化为 L0–L4；View 只消费 `lengthTier/staticWidth`。

Hover 在静态档宽上叠加 bell falloff：命中项临时变为最长 44px、黑色、4px 高，邻近项渐变；leave 恢复各自 L0–L4 静态宽。reduced-motion 保留静态档与 focus/selected 轮廓，不执行鱼眼。

## 变更流程

```text
Before
Core TemporalIndex.mid（全部）
→ View 一次画完、ratio 按数组下标
→ item width CSS 固定 8px
→ wheel listener 在 loading aside 上绑定后，ready div 丢失 listener

After
Core TemporalIndex.mid（全部）
→ TemporalRail producer-owned window（capacity=7，边界 clamp）
→ durable start/end 重算窗口内 ratio
→ eventCount/targetCount continuous score → L0…L4 → 8/11/16/23/34px
→ TemporalRailView 绘制范围 band + “2–8 / 10”反馈
→ wheel capture 推进窗口；Canvas viewport transform 不变
→ staticWidth + bell falloff；leave 精确恢复 staticWidth
```

没有新增 Core truth、schema、数据库或 `updatedAt` 推断。

## 修改文件

- `huabu/apps/web/src/lcos/surfaces/context/TemporalRail.tsx`
- `huabu/apps/web/src/lcos/surfaces/context/temporalWindow.ts`
- `huabu/apps/web/src/lcos/surfaces/context/temporalWindow.test.ts`
- `huabu/apps/web/src/lcos/ui/context/TemporalRailView.tsx`
- `huabu/apps/web/src/lcos/ui/context/temporalLength.ts`
- `huabu/apps/web/src/lcos/ui/context/temporalLength.test.ts`
- `huabu/apps/web/src/lcos/ui/context/temporalFocusProfile.ts`
- `huabu/apps/web/src/lcos/ui/context/temporalFocusProfile.test.ts`
- `huabu/apps/web/src/lcos/ui/context/context-spatial.css`
- `huabu/apps/web/src/lcos/ui/spatial/Stage6Presentation.test.tsx`

## 验证

| 检查 | 结果 |
|---|---|
| pure tests：length/window/focus/wheel | PASS，4 files / 19 tests |
| Huabu web typecheck | PASS |
| 改动文件 ESLint | PASS |
| production build | PASS；仅仓库既有 CSS highlight / bundle-size / lottie eval warnings |
| production browser：10 组窗口 fixture | PASS；7组可见，1–7→2–8，L0–L4，hover/leave，Canvas zoom 不变 |
| production browser：真实 Core producer | PASS；真实 group/band/范围反馈，wheel 不改 Canvas，console/page/http error=0 |

真实浏览器截图：

- `C:\Users\1\AppData\Local\Temp\LCOS_GEN2_temporal_window_tiers_20260920.png`
- `C:\Users\1\AppData\Local\Temp\LCOS_GEN2_temporal_live_producer_20260920.png`

Browser plugin 本会话不可用，按仓库 `scripts/e2e/_harness.mjs` 使用本地 Playwright/Chromium。隔离 worktree 的 React DOM suite 因 junction 依赖出现仓库已知 duplicate-React hook-copy 错误，7 个用例在组件挂载前失败；相同源码已由 typecheck/build 与两轮 production browser 覆盖，本轮不把该环境错误写成通过。

## 六字段回传

```text
READ_SOURCE:
- E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T5\LCOS_Gen2_T5_ContextWorkflow交互专项_前端施工正本_V3_20260910.md §8.6–8.9
- E:\Codex 项目\OS开发\exports\LCOS_Figma_全设计包_20260913\unification\specs\temporal.json
- packages/contracts/src/temporal-index.ts
- apps/local-core/src/temporal-index-projector.ts
- huabu/apps/web/src/lcos/{surfaces,ui}/context/Temporal*

ADOPTED:
- existing bindTemporalWheel capture lifetime → TemporalRail producer window setter → production TemporalRailView
- existing temporalFocusProfile measured Stage7 bell curve → canonical group L0–L4 width overlay

VISUAL_SOURCE:
- Figma page 07 / main 5388:25701 / spec 5392:6043 / detail 5156:504,1871,3249

RETIRED:
- fixed 8px group marker as sole length owner
- ready root inheriting a listener bound to the replaced loading root

VERIFIED:
- http://127.0.0.1:5373/projects/lcos-gen2-dev/context?workspaceId=workspace-real-context
- real producer and 10-group capacity scenario both PASS; browser console/page/http errors 0

UNRESOLVED:
- unified continuous-motion recording remains the existing Figma GAP
- live dev producer currently has one mid group, so multi-window capacity proof uses a canonical-shaped intercepted TemporalIndex response while retaining the production route/component/Canvas
- worktree-only duplicate React junction prevents counting Stage6 DOM suite as PASS
```

## 回滚

单提交可直接 `git revert <commit>`；无 schema/data migration，无持久数据需要恢复。
