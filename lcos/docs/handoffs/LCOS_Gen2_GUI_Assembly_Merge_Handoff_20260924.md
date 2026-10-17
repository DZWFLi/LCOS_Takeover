# LCOS Gen2 GUI 合并交接（2026-09-24）

## 结果与范围

把 `codex/gui-assembly-fidelity` 的 Assembly、Reader、窗口 Chrome 与表面反馈呈现合入 `frontend-reconstruction-v2`，只做本地合并，未 push。GUI 使用既有 Core 数据与 Huabu 专业窗口；没有新增 Conversation、Run、Canvas 或 Project truth。

保留了当前主线的 Reader 原来源返回、Portal Core 目标解析、Temporal Rail producer/episode 语义、工作流卡预览与进入现场路径、归档入口和 Assembly 精确来源导航。GUI 分支旧版的 sessionStorage Reader 恢复和工作流卡交互已弃用。

```text
之前：Assembly 数据源与操作挤在旧列表结构中
  → 预览 / 选择 / 投放回执缺少统一呈现

现在：Assembly 独立窗口
  → 项目 / 收件 / 来源 / 技能
  → 搜索与材料筛选
  → Masonry 专用对象脸与可访问操作
  → 预览 / 多选批量投放 / 逐项 Core 回执
```

## 修改文件

- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx`
- `huabu/apps/web/src/lcos/professional/AssemblyBody.lifecycle.test.tsx`
- `huabu/apps/web/src/lcos/professional/AssemblySourceMedia.tsx`
- `huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx`
- `huabu/apps/web/src/lcos/ui/FigmaShellGlyph.tsx`
- `huabu/apps/web/src/lcos/ui/LcosSurfaceFeedbackView.tsx`
- `huabu/apps/web/src/lcos/ui/families/LcosWindowChrome.tsx`
- `huabu/apps/web/src/lcos/ui/families/lcos-hud-presentation.css`
- `huabu/apps/web/src/lcos/ui/families/lcosFamilyWiring.test.ts`
- `huabu/apps/web/src/lcos/ui/professional/AssemblyItemView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/AssemblyMaterialView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/AssemblyPreviewView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/AssemblyReceiptView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/AssemblySourceTabsView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/AssemblyToolbarView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/ReaderContentTabsView.test.tsx`
- `huabu/apps/web/src/lcos/ui/professional/ReaderContentTabsView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/ReaderGroupView.tsx`
- `huabu/apps/web/src/lcos/ui/professional/assemblyPresentation.test.ts`
- `huabu/apps/web/src/lcos/ui/professional/assemblyPresentation.ts`
- `huabu/apps/web/src/lcos/ui/professional/professional-assembly.css`
- `huabu/apps/web/src/lcos/ui/professional/professional-reading.css`
- `huabu/apps/web/src/lcos/ui/professional/reader-content-tabs.css`
- `huabu/apps/web/src/lcos/ui/surface-feedback.css`
- `huabu/apps/web/src/lcos/ui/workflow/workflowCollectionWiring.test.ts`
- `docs/handoffs/LCOS_Gen2_GUI_Assembly_Merge_Handoff_20260924.md`

## 验证

- Huabu Web TypeScript：通过。
- Assembly / Window / Reader tabs / workflow wiring / family wiring / temporal presentation：8 个相关测试文件，86/86 通过。
- 改动 TypeScript 文件 ESLint：通过。
- Huabu Web 生产构建：通过。构建有现存 CSS Highlight、第三方纯注释、Lottie `eval` 和 chunk size 警告。
- `git diff --check`：通过。
- 人工浏览器手测与截图：待用户手测，本交接未声称视觉验收完成。

另有 2 组未涉及本次修改的既有失败（`ProfessionalViews.test.tsx` 1 项、`LcosActionOrbView.test.tsx` 3 项）；已在合并前的原工作区复跑，失败相同。全量测试未作为通过条件。

## 未完成与回退

人工确认 Assembly 密度、材料脸、筛选、预览返回焦点、窗口尺寸/菜单、Reader tabs 后，再决定视觉调整。风险主要是新 CSS 的真实密度与不同窗口尺寸下的体感尚未人工确认。

回退方式：在 `frontend-reconstruction-v2` 上对本次本地合并提交执行可审查的 `git revert -m 1 <merge-commit>`。当前未 push，可直接丢弃这次合并提交但不应重写已分享历史。
