---
name: lcos-glaze-materials
description: "给任何 LCOS 组件/面板做视觉施工时用本 skill：Glaze 四层（Functional Body / Light Skeleton / Matrix / Glyph）标准、D-1 对照表硬验收、z-index 与双主题 token 红线。"
---

# lcos-glaze-materials：Glaze 材质施工标准

## 何时不用（反边界）

- 不适用 foundation.css 等 legacy chrome（dock/menu/dialog）的存量样式——那些是历史债，本 skill 只管**新施工**；禁止把存量 blur/大圆角当先例复制进新组件。
- 不发明新样式定义：视觉词汇必须指向既有 `--lcos-*` token / `lcos-*` class（红线）。
- 不做装饰性随机：点阵/灯段全部由真实数据驱动（密度、进度、检查点索引）。
- 动画不进共享 rAF 时钟：点阵是纯 CSS；Glyth 引擎自带时钟并做可见性门控。

## 数据模型（状态是哪份数据，真实契约/函数名）

**token 契约（双主题三通道）**：`frontend-focus/src/spatial-components.css` L9-61——`:root`（亮）、`[data-lcos-theme='dark']`（显式暗）、`@media (prefers-color-scheme: dark) :root:not([data-lcos-theme='light'])`（跟随系统）。token 清单：`--lcos-ink / --lcos-signal / --lcos-signal-error / --lcos-matrix-dot / --lcos-segment-off / --lcos-segment-on / --lcos-segment-glow / --lcos-glyth-{stable,working,waiting,error,confirm,absorb,output,eye}`。语义红（`--lcos-signal-error`）只留给错误。

**z-index 契约**：`frontend-focus/src/foundation.css` L111-173——7 主层（canvas-base 1 / canvas-content 2 / surface-comp 3 / overlay-ui 40 / shell-chrome 60 / dialog 100 / modal 200）+ 45 个桶内保序子层，共 **52 token**；声明处禁止出现新 z-index 数字，每处替换带 `/* z-tier: 层名 */` 注释。锁：`frontend-focus/.stylelintrc.cjs`——`z-index` 只允许 `auto / inherit / -1（legacy-bg 唯一特例）/ var(--lcos-z-*)`。

**运动 token**：`frontend-focus/src/features/spatial/visual/spatialVisualTokens.ts`——`segment {thickness:2, radius:999, opacity:.42}`、`motion {fastMs:140, normalMs:220, slowMs:360}`、`glyph {size:22, coreSize:11, shellThickness:3}`；`spatialMotionDuration(ms, reducedMotion)` 归零函数。

## 施工标准（分步骤）——四层

1. **Functional Body（功能主体）**：组件外框必须复用 `.lcos-surface-component-frame` 语义——近白液晶实底（`rgba(250,249,251,.96)`，暗色 `rgba(26,24,36,.96)`）+ 细线边框 1px + **4px 直角** + `backdrop-filter: none`（css L74-88 注释原文「近白液晶实底 + 细线边框 + 4px 直角，禁毛玻璃」）。Handleless：body 即拖拽 handle，边缘 resize；右上 3px LED 指示点（`::before`，复用 `--lcos-segment-on/glow`）。选中态 outline 1px，重叠 ≥30% 出虚线 `is-overlap`。
2. **Light Skeleton（灯条骨架）**：`LightSegment`（`features/spatial/visual/LightSegment.tsx`，2026-08-23 冻结语法）——`progress` 逐格点亮、`checkpoint` 单格常亮待决、`flow` 点亮顺序即流向、`static` 暗底两锚格。段数 `max(3, round(length/9))` 夹 `[2,16]`；reduced-motion 自动降级。
3. **Matrix（点阵纹理）**：`MatrixActivity`（`features/spatial/visual/MatrixActivity.tsx`）——八字动词 `gather/spread/gap/flow/pull/break/absorb/emit`，单基色 `--lcos-matrix-dot`，方向 `--matrix-direction`；`density` 夹 `[2,24]`；idle 不渲染（`active=false` 返回 null）。verb-flow 动画：`lcos-mx-flow 1.4s linear infinite`，delay `calc(var(--matrix-index) * 110ms)`（css L456）。
4. **Glyph（生命体）**：`LcosGlyth`（`features/spatial/visual/LcosGlyth.tsx`）——七态 `stable/working/waiting/error/confirm/absorb/output`，经 `glythBloub.ts` 的 `GLYTH_TO_BLOUB` 映射 bloub 引擎（idle/thinking/notify/alert/wink/comet/burst）。**confirm 是瞬态契约**：播一次回 stable（hold = `(glythStateDuration('confirm')+0.45)*1000` ms）。指针注视 `pointerToLook`（reach = `max(60, 宽×3)`，矩形缓存 0.75s）；IntersectionObserver 可见性门控 + `useReducedSpatialMotion` 静态采样。

## 视觉词汇（复用，禁自带样式）

- 组件框架族：`.lcos-surface-component-frame`（+ `is-selected / is-overlap`）、内容网格 `.lcos-context-component / .lcos-workflow-component`（grid-template-rows: auto 1fr auto）。
- 灯条：`.lcos-light-segment.axis-*/mode-*`；点阵：`.lcos-matrix-activity.verb-*`；Glyph：`.lcos-glyth.state-*`。
- 颜色只取 `--lcos-*`；z 只取 `var(--lcos-z-*)`；时长用 `spatialVisualTokens.motion`。

## 验收（D-1 对照表硬验收，数值断言）

| 层 | 断言 |
| --- | --- |
| Functional Body | 新组件框架 `backdrop-filter === none`；外框 `border-radius <= 10px`（基调 4px）；边框 1px；暗主题背景 `rgba(26,24,36,.96)` |
| Light Skeleton | `LightSegment(length=42)` 段数 === 5（round(42/9)）；`mode='progress' progress=0.5` 点亮 ceil 半数；checkpointIndex 夹 `[0, count-1]` |
| Matrix | `density` 渲染格数夹 `[2,24]`；`active=false` DOM 为 null；verb-flow 每格 delay = index×110ms |
| Glyph | confirm 态 holdMs = (morph+0.45)×1000；`GLYTH_TO_BLOUB` 七键全映射；reduced-motion 下 `subscribeGlythClock` 不订阅 |
| token/z | stylelint 0 error（裸数字 z-index 全拒，-1 除外）；新 css 出现非 `--lcos-*` 颜色变量即返工 |

## 已知边界（0.1 不做什么，不假装）

- legacy chrome（foundation.css 的 dock/menu/dialog、composer 浮层）仍存在 `backdrop-filter: blur(...)` 与 >10px 圆角——**历史债，不扩散**：新施工一律禁 blur、圆角 ≤10px；存量收敛另立任务。
- Glyth 不支持自定义形状/表情（`createGlythEngine` 原样形态）；`variant` prop 仅向后兼容，不影响几何。
- 点阵不做 JS 逐帧驱动与每边独立方向编辑。
- 双主题不做第三套自定义主题（只有 light/dark 两态三通道）。
