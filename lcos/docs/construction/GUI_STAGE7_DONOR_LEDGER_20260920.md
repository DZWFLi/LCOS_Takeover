# Stage7 · 实际采用账本

采用方式与验收状态分列。不是用更激进的措辞替代源码。

| 来源 / exact范围 | 采用方式与 target | 生产 caller / 保留owner | 当前证明 |
|---|---|---|---|
| GEN1 `features/ui/ObjectOrbit.tsx@3e99769` 的 AnimatePresence 组合、spring400/25、exit .2 | THIN_ADAPT → `presentationMotion.ts`、`ContextAtlasView`、`WorkflowHandView` | ContextWorksite atlasOpen / Workflow handOpen 原owner | 源码有接入；真实Motion未运行 |
| GEN1 `SurfaceComponentShelf.tsx` 焦点边界，Stage6已收编 | CURRENT_DONOR_REUSED → `useDescendantFocus` | Collection / TaskCard 的localfocus，不改Selection | pose纯测试；完整Motion焦点未运行 |
| CURRENT `WorkflowCardPool.tsx@802b7a5` 标题过滤 | DIRECT_LIFT + 函数提取 → `filterWorkflowTitles` | 当前CardPool查询/草稿owner未变 | 6项已执行Node过滤测试 |
| Figma `5388:25501–25503`、`5140:4159–4161` | FIGMA_EXACT paints → `LightCurtainBackdrop` / CSS | Atlas / Hand 原宿主，仅装饰图层 | 真实无Motion React背景 / 多宽度几何24项 |
| Figma `5388:25504` / `5392:4924` | FIGMA_EXACT + 响应式适配 → Atlas layout / native blank control | onClose / 唯一有效目标的既有 onEnterSurface | CSS位置/原生空白点击已测；完整场景未通过 |
| Figma `5156:3080` / `5156:3081–3127` | KEYFRAME_SAMPLE_ADAPT → `temporalFocusProfile` | TemporalRailView；不发明时间或camera | 47宽度比对；既定y不变；Motion帧待测 |
| d3 fisheye1d | 停止用于当前轨道纵向warp；原模块/测试/完整许可保留 | 当前TemporalView仅复用原基本刻度长度helper | 不再记为“轨道已d3真实动效复刻” |
| Huabu wheel / Portal scene / cache | CURRENT_DONOR_REUSED，延续Stage6 | 原接口原owner；本轮无新导航 mutation | 本轮owner源码比较；整机未测 |

## 没有采用/不能声称的部分

- 没有取得完整 Motion 可执行包，因此不声称运行了 Motion。
- 没有再次整包移植 Spatial / Lovart / TapNow；此次优先修已证实底线缺陷。
- 原 HTML 没有恢复到原件，不将“读过合同”写成“已跑过HTML”。
- Figma焦点表的线性插值与卡池阈值是公开标记的展示适配，不冒充 donor 原始算法或 Figma 精确动效参数。
