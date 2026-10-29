# LCOS GEN2 · Stage6 后半线运行时呈现收口

日期：2026-09-20
范围：Context Collection / Workflow Collection / Task Card / Portal / Temporal Rail 的呈现代码、局部 DOM 事件与验证。
状态：**代码候选 + 隔离真实 React 验证；不是完整产品验收。**

## 1. 应用位置与并行边界

本轮读取远端时，`frontend-reconstruction-v2` 仍为 `802b7a537ffe81a6e09c522cd45539a22a8a42da`。
本补丁直接父状态为本会话交付的 **Stage4 + Stage5**。已应用 Stage5 的 GUI 工作树只应用 Stage6，不重套前两包。

本地继续负责 Stage1–3 / REWORK01–02 的激进 donor 替换。本轮不修改这些前半线容器、Local Core、canonical contracts、Canvas/Selection/Pointer/history/runtime、导航 mutation、ProjectionBinding、safeRect truth 或 LOD owner。

没有创建远端提交、没有 push、没有合入 `frontend-reconstruction-v2`。内部用于生成 diff 的 Git 是源码子集验证夹具，不是用户仓库的正式 commit。

## 2. 为什么这一轮先修运行时问题

Stage5 的验证是静态 DOM/CSS。此次直接加载交付的 React View，而不是再制作一份“长得相同”的 HTML。
初次实跑确认：

| 问题 | 初次观察 | 本轮处理 |
|---|---|---|
| 时间轨滚轮污染外层 | 外层 `onWheel` 收到事件；控制台出现 passive listener 警告 | 提取 Huabu 的原生 wheel 生命周期，capture + passive:false；仅回调既有时间窗动作 |
| Portal CSS 侵入原生预览 | 宽泛 descendant selector 改写子按钮；浅层插槽测试中甚至被拉成 412×220 | Chrome 只选择自己的直接按钮；只拉伸 scene host，不处理其全部后代 |
| 窄屏 Portal 溢出 | 390px 视口中预览右边界到 451px | 容器查询重排，桌面窄停靠窗口同样生效，不缩字体 |
| Task 外壳几何不精确 | 把 224×324 总框本身当成卡身 | 增加 216×312、偏移(4,4)的真实卡身；焦点描边不再移动 cover |
| Collection 材质混用 ColorPin | 前袋背景随 pin token 变成深色 | 前袋使用 Figma blue-bg 的独立呈现值，不读取分组颜色语义 |
| 图像失败没有完整呈现路径 | 失败后保留破图/空白 | 直接收编 GEN1 图片 loading/ready/error 与 keyed retry |

原始 `before-findings.json` 保留。Enter 重复触发的怀疑没有复现，因此没有把它算成旧缺陷；本轮继续验证 Enter/Space 每次只触发一次。

## 3. 真正采用的 donor 代码

### A. Huabu：原生 wheel 监听生命周期

- READ_SOURCE：`huabu/apps/web/src/components/Nodes/spacePreview/SpacePreviewViewport.tsx @802b7a5` 的 wheel effect。
- ADOPTED：`addEventListener('wheel', ..., {capture:true, passive:false})` 与匹配的清理，薄适配为 `ui/context/temporalWheel.ts::bindTemporalWheel`。
- PRODUCTION CALLER：既有 `TemporalRail` → `TemporalRailView` → `bindTemporalWheel`。
- 保留：只调用 `onWindowShift`，绝不复制 donor 的 zoom state，也不写主画布 camera。
- RETIRED：View 上原先的 React `onWheel` 阻止默认事件路径。

### B. GEN1：图片加载与失败重试

- READ_SOURCE：用户 donor 包 `03_GEN1_PROVEN_DONORS/repo/apps/web/src/features/canvas/CanvasNodeVisual.tsx`。
- 包内来源记录：`a24-to-phasea-20260901@3e99769bf106d68cecc54094662352bfaecf2bdd`；本轮使用该随包快照，没有声称重新拉取 GEN1 远端。
- DIRECT_LIFT：`ImageLoadPhase / ImageLoadEvent / nextImageLoadPhase`，函数分支原样收编。
- THIN_ADAPT：`ImageObject` 的 loading/error、attempt key、重试、源切换复位。使用 native img 替换 donor OCR 宿主，不建立另一个读取服务。
- TARGET：`ui/spatial/imageLoadPhase.ts`、`PreviewMedia.tsx`、`preview-media.css`。
- CALLER：ContextCollectionView、WorkflowCollectionView、WorkflowTaskCardView。
- RETIRED：三个 View 内直接的、无错误处理的 img 输出。
- 图片重试是浏览器媒体生命周期，不是业务成功；不会触发任务取用或 Run。

### C. GEN1：后代焦点边界

- READ_SOURCE：`features/spatial/components/SurfaceComponentShelf.tsx` 的 `onFocusCapture` 与 `contains(relatedTarget)` blur guard。
- THIN_ADAPT：`useDescendantFocus` 只维护 View 的键盘关注呈现。
- CALLER：ContextCollectionView、WorkflowCollectionView。
- RETIRED：在不可聚焦容器上单独依赖 `whileFocus` 的近似接法。
- 真实 Selection、Reference 和导航目标没有被更改。

### D. 已有代码继续复用

保留既有 d3 fisheye、GEN1/Motion 姿态参数、Huabu SpacePreviewViewport 和 scene cache；本轮不复制第二份引擎。没有新装生产依赖。

## 4. Figma 对照与改动

本轮实际重读 `5335:15`、`5348:1029`、`5392:6043` 的 design context；其它六态/六变体对照使用 Stage5 已取得的原节点矩阵。未声称重新精读了整个 Figma 文件。

### Task Card

- 根框 224×324；内卡身 216×312 @ (4,4)。
- Cover 200×214 @ (12,12)；原 exact glyph 保留。
- 2px 焦点描边在内卡身上，不挤动其他部件。
- 不可用时仅媒体区域 opacity 0.4；名称与原因可读。
- 草稿中仍显示 `已加入草稿 · 未发送`，不自行变更草稿事实。
- 扇形布局只作用于 Hand 中的卡，单独使用同一组件不被 nth-child 意外旋转。

### Portal

- 桌面根宽440、高360；scene左右14、top71、高220。
- stale 的按钮文案对齐 Figma：`重新读取`。
- 窄于420的容器改为400高，状态与操作分行；这是响应式适配，不称为已有窄屏整稿的逐像素复制。
- 错误细节不仅放在鼠标 title；屏幕阅读器可以读取，错误/缺失态正文保留 provider 原因。
- scene 插槽没有内容时明确提示，不显示假放大按钮，不把上游状态改写为业务错误。
- 六态动作仍由原状态和真实 callback 决定，未新增 open/zoom owner。

### Temporal Rail

- 原生 wheel 在本地消费；横向滚轮也不会泄漏到外层，但不会被误解释为时间窗移动。
- Up/Down 跳过 disabled 并移动实际 DOM focus；单一 Tab 入口。
- Enter/Space 只走原生按钮激活，避免旁路重放。
- 第一次 Esc 收自己的预览；没有本地预览时继续交给既有上层。
- 删除 item、切 scope、卸载时清理本地 preview；不把旧高亮留在新现场。
- 无合法位置就不画假 item；无数据继续零刻度。
- 555高保留47刻度；矮窗口保留11px间距与底部余量，取消原先强制280高。
- loading/error/recovery/reason/onRetry 为可选展示 props，未创建时间分组 producer。

### Collection

- 不再把同一 previewUrl 默认填充成“第二份材料”；没有第二预览则显示缺失态。
- 禁用保留身份与说明，不借 pointer-events:none 把整件内容变成不可读区域。
- Focus 的姿态输入由真实子控件 focus/blur 映射；不动 Selection。
- 非截图状态下的错误/缺失说明属于诚实降级，不声称与有真实封面的 Figma 样图像素一致。

## 5. 实际执行的验证

| 检查 | 结果 | 能证明什么 |
|---|---|---|
| Node 纯函数测试 | 15/15 | 图像阶段、时间刻度/键盘索引、既有 fisheye、Portal 状态映射 |
| 严格 TypeScript | 5个纯TS模块通过 | strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes；不含 React 类型链接 |
| TS/TSX 语法 + CSS parser | 21文件、0错误 | 语法可解析，不等于整仓 typecheck/lint |
| 真实 React 浏览器检查 | 77/77 | 真实 View/DOM 事件、StrictMode 生命周期、焦点、回调、布局、降级 |
| 五档视口 | 1440×900 / 1280×800 / 1152×768 / 1024×768 / 390×844 | Portal容器约束、原生控件隔离、reduced-motion CSS排列 |
| 额外窄容器/矮屏 | 320px停靠容器、1024×480 | 容器重排与时间轨高度约束 |
| 控制台/page error | 0 | 本次隔离用例无运行时错误 |

**环境必须一起读：**

- 实际 React / ReactDOM 19.1.1，来自沙箱已安装 Playwright 的 vendored runtime。
- 系统 Chromium + Python Playwright；测试页面为离线 `about:blank`，不绕过网络或浏览器策略。
- Motion 使用显式 TEST-ONLY probe：转发 React DOM 事件、记录目标姿态，不执行真实动画引擎。
- 数据是明示 fixture，不是 Local Core；Portal 内层是可交互的测试 scene slot，不是完整 Huabu scene cache。
- 所以不能据此声称 Motion 帧表现、React19.2.8整仓、真实 Core、ReactFlow、reload/协作/drag 全部通过。
- 第一轮套件有一个错误的测试前置：Esc 后对已经获得焦点的按钮再次 focus，不会创建新的 preview。已保存失败结果，并改为真实离开/重进焦点后再验证删除；没有改弱产品断言。

新增仓库 Vitest 测试随 patch 提供；本环境没有 Vitest 依赖，**这些 Vitest 文件没有执行**。15项已执行的是随包 Node 测试，77项是随包 Playwright 组件检查。

## 6. 仍未关闭的生产问题

1. `TEMPORAL_GROUPING_PRODUCER`：本补丁没有时间分组事实源。生产 wrapper 仍诚实为空；fixture 的鱼眼可操作不代表已接业务时间记录。
2. `WORKFLOW_COLLECTION_PRODUCTION_CALLER`：View 可以使用，Main registry/Assembly 的具体绑定仍属于本地整合线。本轮没有跨线插入第二 registry。
3. `PORTAL_OPEN_TARGET_ACTION / PORTAL_PREVIEW_ZOOM_ACTION`：现有导航/预览 owner 尚未传入时不画死按钮。本轮只确保已有 callback 和 scene 不被 View/CSS 破坏。
4. 完整 Figma九面视觉验收、真实 Motion帧/反转/中断、多实例性能、深色、整机安全区避让和真实恢复仍未关闭。

**不再使用“后半线只剩三处接线”作为完成判断。上面只是已知接线项，不是全量验收结果。**

## 7. 本地应用

只在独立 GUI 工作树应用；不要直接覆盖主施工分支。

已有 Stage5：

```bash
git apply --check LCOS_GEN2_GUI_STAGE6_RuntimePresentation_on_STAGE5_20260920.patch
git apply LCOS_GEN2_GUI_STAGE6_RuntimePresentation_on_STAGE5_20260920.patch
```

随后从 `huabu` 目录运行现有脚本，不替换 runner：

```bash
pnpm --filter @huabu/web typecheck
pnpm --filter @huabu/web lint
pnpm --filter @huabu/web test
pnpm --filter @huabu/web build
pnpm --filter @huabu/web test:e2e
```

本轮只在 Stage5 文件子集上验证 apply 与结果文件一致。遇到本地新源码冲突按 hunk 合并，不能把 FULL_CHANGED_FILES 当成覆盖新工作的指令。不要重复套 Stage4/5。

回滚：尚未叠加其他改动时可以先 `git apply --reverse --check` 再 reverse；已经有本地后续提交则按本地实际 commit revert。不要 reset 主分支。

## 8. 测试矩阵接续

本地应优先验证：时间轨滚轮不改变相机；Tab/方向键/Esc与上层导航层级；Portal旧缓存→部分→恢复不丢 scene/本地zoom；图片重试不改变草稿/Run；原生预览按钮布局；短窗口不遮挡HUD；再看真实动效与完整Figma画面。

本包没有新增门禁、冻结协议、业务 Store 或 hash 清单。
