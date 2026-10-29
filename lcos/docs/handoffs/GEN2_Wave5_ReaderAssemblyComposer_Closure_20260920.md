# GEN2 Wave 5 Reader / Assembly / Composer 收口交接

日期：2026-09-20

分支：`frontend-reconstruction-v2`

范围：真实仓库材料 → Reader → 阅读续接；Assembly 引用 → 单一 Composer → receiver 诚实阻断

## 结论

Wave 5 已完成源码接线与隔离浏览器验收。Reader 使用 Core 的 canonical Artifact → current Revision → FileRecord 正文链；Reader 缩放、阅读位置和目标在关闭重开与页面刷新后恢复。Assembly 取用材料继续复用既有 reference draft 与 `LcosComposerHost`，同一 intent 在 Assembly / Conversation 双窗口下只允许一个视觉宿主。

本批未制造 provider 成功回执。fixture 没有 receiver 时，提交保持禁用并显示真实原因，草稿和 canonical 引用在关闭重开后保留。

## 实际流程

```text
Assembly canonical item
  ├─ 阅读 → ProfessionalWindowStage → ArtifactReaderBody
  │          → Artifact detail → current Revision → FileRecord bytes
  │          → zoom / scroll / target continuity
  └─ 草稿 → canonical reference draft → existing LcosComposerHost
             → Assembly-origin intent 由 Assembly 单宿主呈现
             → 无 receiver：禁提交 + 保留草稿
             → 有 receiver：继续走既有 delegate / Run receipt 链
```

## 修改范围

- `huabu/apps/web/src/lcos/professional/ArtifactReaderBody.tsx`
- `huabu/apps/web/src/lcos/professional/AssemblyBody.tsx`
- `huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.tsx`
- `huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx`
- 对应定向测试与 `huabu/apps/web/src/lcos/ui/professional/` 视觉组件
- `scripts/e2e/wave5-assembly-composer.mjs`

## 验证

```text
Vitest：4 files / 40 tests passed
@huabu/web typecheck：passed
@huabu/web production build：passed
git diff --check：passed
```

隔离真实浏览器环境：Core `43131`、Huabu `3011`、Web `5273`，数据位于 `.e2e-data`，验收后已关闭，不影响用户开发端口。

浏览器硬断言：

- fixture `artifact-positioning`、`revision-positioning-initial`、`file-positioning` 来自隔离 Core；
- Reader 正文来自真实 FileRecord bytes；
- zoom `100% → 110%`；真实滚轮产生 `scrollTop=9`；
- Reader 关闭重开与 reload 后 target / zoom / scroll 均保持；
- Assembly 引用后全局 Composer 数量严格为 `1`；
- canonical reference key 为 `artifact:artifact-positioning` 且不重复；
- 无 receiver 时提交禁用，原因是“尚未选择会话接收者；请从会话窗口打开 Composer 后再提交”；
- 关闭重开后 prompt 与 reference 保持；
- `consoleErrors=[]`，`pageErrors=[]`。

截图：

- `C:\Users\1\AppData\Local\Temp\trae\screenshots\wave5_step2_assembly_1366.png`
- `C:\Users\1\AppData\Local\Temp\trae\screenshots\wave5_step3_reader_1366.png`
- `C:\Users\1\AppData\Local\Temp\trae\screenshots\wave5_step4_reader_reload_1366.png`
- `C:\Users\1\AppData\Local\Temp\trae\screenshots\wave5_step5_composer_blocked_1366.png`

## 已知未收口

- `ProfessionalWindowStage.test.tsx` 在当前仓库测试环境仍有既有 React/Zustand invalid hook call；同一生产路径已由 typecheck、build 与真实浏览器硬断言覆盖，本批未把该基线问题伪装成通过。
- PDF/PPT 等正文仍依赖既有 Preview Worker/Renderer producer；没有 producer 时 Reader 继续显示诚实 unavailable 状态。
- Build 保留既有 CSS `::highlight` 与大 chunk 警告，未影响本批产物生成。

## 回滚

本批不含 schema、Core migration 或 Huabu runtime 修改。按本提交回退上述 Reader / Assembly / Professional UI / E2E 文件即可。
