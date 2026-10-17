# local-creative-os-gen2

LCOS Gen2 — 本地创作项目总导演台（Local Core truth + Huabu spatial kernel + LCOS 产品前端）。

## GEN2 前端产品组合根

LCOS GEN2 的 production UI 由 route-level `LcosProjectShell`（`/projects/:projectId/:surface?`）统一组合。Huabu 是唯一 Canvas kernel，负责 ReactFlow、空间拓扑、geometry、viewport、selection、drag、resize、connect gesture 与 spatial history；Local Core 是 Project/Artifact/Conversation/Run/Result/Review/Revision 的 canonical truth。

生产调用链：

```text
App route
→ LcosProjectRoute（/projects/:projectId/:surface?）
→ LcosProjectShell
→ LcosWorksiteStage
→ Canvas Host （Huabu Canvas kernel；Wave 2 收口为 CanvasHostBoundary）
```

Global HUD、Railway、Professional Window、Context Atlas、Workflow Hand 与 Composer 属于 LCOS Shell/Worksite。Composer 可通过唯一受控 canvas portal 做对象近场呈现；它不进入 Canvas truth，也不作为 route-level 常驻底栏。其余项目级产品壳不得塞进 Canvas overlay。

Main、Context、Workflow 是同一 Project 的三个语义工作现场，共享 entity identity 和同一 Canvas mechanics；不是三套 graph/store/runtime。三现场各自独立 camera/selection/layout/history，canvasId 由 Core workspaces 提供（首进由 SurfaceDock 建立并回写）。

旧 Huabu `MainLayout`、`CanvasHeader`、`CanvasLayerPanel` 和 CenterArea 不拥有 LCOS production route 的布局。原生对话、Agent 配置与预览能力仍须可达：`LcosCanvasCapabilities` 消费已有 panel request，`ProfessionalWindowStage` 的 `native-workspace` body 直接复用 `PreviewWorkspacePanel`、ChatPanel、原生会话与 API；窗口几何仍只有 LCOS Stage 一个 owner。Settings 保持原单例，并在三个现场提供明显入口。

节点创建工具条与未覆盖命令不能因换外观而丢失。`NodeToolbar` 在 LCOS 模式下由紧凑创建入口和原快捷键接替；项目文本沿原 Huabu carrier 接 Core canvas-text，F2、正文/大纲/导图和显式额外 View 使用既有身份与保存入口。普通网址沿现成 import-url producer 保存为链接材料，不作为未绑定的第二个 web 节点。单节点 resize 已按 Lovart demo 的细框、小角点、较大命中区和文本宽度手势适配，仍调用 Huabu/React Flow 的 geometry、snap 和 undo。当前交互对标与逐动作证据见 `docs/handoffs/GEN2_Main_Gen1_交互齐平_20261008.md`。

普通退出以点击画布空白收回当前前景窗口/输入为主，草稿保留；Esc 共用同一退出栈。平移、右键和进行中的拖放不触发收回。Atlas/手牌继续使用已有背景收回面。

节点呈现通过 binding-aware `CanvasNodePresentationSeam` 接管内容和视觉（Wave 3 起）；Huabu `NodeWrapper` 继续拥有 geometry、selection、resize 和 pointer arbitration。native body 只在 unbound、unsupported、stale binding 或 runtime unavailable 时诚实 fallback。

## 施工文档

- 前端 UX 唯一挂载树与 owner 合同：`docs/construction/GEN2_FRONTEND_UX_RUNTIME_CONTRACT.md`
- 施工认知与账本：`docs/construction/PROJECT_READBACK.md`、`SOURCE_ADOPTION_LEDGER.md`、`FIGMA_SOURCE_LEDGER.md`、`HUABU_RETIREMENT_LEDGER.md`
- 逐 Wave handoff：`docs/handoffs/GEN2_NewFrontend_WaveN_*.md`
- 浏览器验收脚本：`scripts/e2e/`（本地 Chromium + playwright-core）
# Component credit

Surface navigation adopts [Rare UI](https://rareui.com), by Swami Malode. The copied component retains its source credit and license in `huabu/apps/web/src/lcos/ui/vendor/rareui/`.
