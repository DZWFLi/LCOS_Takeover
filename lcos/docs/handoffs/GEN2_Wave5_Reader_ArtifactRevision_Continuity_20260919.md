# GEN2 Wave 5 · Reader Artifact/Revision 真实纵切与续读

日期：2026-09-19

仓库：`E:\OS开发\LCOS_Gen2`

分支：`frontend-reconstruction-v2`
状态：代码已接入；未 commit、未 push。

## 结论

同一 Artifact 现在可以从节点或 Assembly 打开 Professional Reader。Reader target 只携带 `artifactId`，正文再通过 Core 的 canonical revision 解析 `fileRecordId` 后读取真实字节；找不到 revision/file-record 或读取失败时显示明确失败态，不把 `previewRef` 或 opaque id 冒充正文。

Reader 的 revision、正文滚动位置和 Reader zoom 写入当前浏览器 tab 的 `sessionStorage`，关闭窗口后重开仍复用内存/会话连续性，页面刷新后 Stage 会按项目恢复 Reader artifact target。Reader zoom 只改正文呈现，未调用 Canvas camera/zoom owner。

## 变更流程

Before：

```text
节点 / Assembly
→ openWindow(reader, artifactId)
→ detail + revision + file-record 正文
→ 阅读位只存在内存 Map
→ 刷新后窗口 target 与阅读位丢失
```

After：

```text
节点 / Assembly
→ openWindow(reader, artifactId)
→ ProfessionalWindowStage（唯一 topology / safeRect / drag / resize owner）
→ ArtifactReaderBody
   → GET artifact detail
   → GET canonical revisions
   → revision.fileRecordId
   → GET file-record content/text
   → 文本 / 图片真实正文，其他类型诚实 unavailable
→ revision + scrollTop + readerZoom 写 sessionStorage（按 projectId + artifactId）
→ reload
   → Stage 恢复 Reader target
   → Reader 恢复版本、阅读位置与 Reader zoom
```

## READ_SOURCE

- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\04_逐Wave施工卡与验收.md`：Wave 5，目的/代码行为/退出条件。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T4\45_T4_to_T5_ProfessionalWindow_and_ProfessionalBodies_ExactBlueprint_v1.md`：Professional Window/Reader body topology 与真实 caller 边界。
- `E:\TRAE项目\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\references\original_route_cards\T5\GEN2_T5_完整源码施工正本_V4_六路合并_20260911.md`：Reader identity、revision、失败态与 continuity 约束。
- `E:\OS开发\LCOS_Gen2\docs\construction\GEN2_FRONTEND_UX_RUNTIME_CONTRACT.md`：ProfessionalWindowStage 唯一产品挂载与窗口 owner。
- `E:\OS开发\LCOS_Gen2\docs\handoffs\GEN2_ArtifactReader真实内容接线_20260915.md`：已有 Core detail/revision/file-record 内容链。

## 调研到的成熟形态

- VS Code 官方 UI 文档说明编辑项以 tab 形式呈现在 editor title area，并支持重新打开时恢复工作台/editor 状态：<https://code.visualstudio.com/docs/editing/getting-started/userinterface>。
- MDN 说明 `sessionStorage` 按 tab/origin 隔离，页面刷新期间保留，适合短期 UI continuity：<https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage>。

采用结果：Reader target/版本/位置/zoom 属于当前 tab 的 UI continuity；Artifact、Revision、FileRecord 仍由 Core 提供真值。窗口 geometry/topology 继续由 Stage/store 当前 owner 管理。

## ADOPTED

| donor / symbol | target | production caller |
|---|---|---|
| `CoreArtifactClient.getArtifactDetail` + `listArtifactRevisions` | `ArtifactReaderBody` detail/revision 读取 | `ProfessionalWindowStage → ArtifactReaderBody` |
| `CoreArtifactClient.getFileRecordText/getFileRecordContent` | 文本/图片正文读取 | `ArtifactReaderBody` |
| `LcosActionArc` / `AssemblyBody` existing `openWindow('reader', artifactId)` | artifact identity 入口 | 节点与 Assembly 生产 caller |
| existing `ProfessionalWindowStage` topology/geometry handlers | target restore only；不复制 drag/resize/safeRect | `ProfessionalWindowStage` |
| MDN tab session storage pattern | Reader continuity UI state | `ArtifactReaderBody` + Stage |

## VISUAL_SOURCE

- Figma Reader/window references：`reader.json`、`reader-final.png`、`reader-verified.png`，位于材料舱 `references/figma-master/unification/`。
- 视觉实现保留既有 Window Chrome、Stage min size、safeRect、dock/resize 手感；新增 Reader zoom 仅为正文控制行，不改变 Canvas controls。

## RETIRED

- 旧的“Reader 阅读位只记内存，刷新必丢”行为被 session continuity 替换。
- content fetch 失败时不再落到看起来像正文的空白区域；改为带错误原因的 Reader content error。

## 修改文件

- `huabu/apps/web/src/lcos/professional/ArtifactReaderBody.tsx`
- `huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.tsx`
- `huabu/apps/web/src/lcos/professional/ArtifactReaderBody.test.tsx`
- `huabu/apps/web/src/lcos/professional/ProfessionalWindowStage.test.tsx`
- `scripts/e2e/wave5-assembly-composer.mjs`

## 验证

- `pnpm --filter @huabu/web exec vitest run src/lcos/professional/ArtifactReaderBody.test.tsx`：12/12 PASS。
- `pnpm --filter @huabu/web exec tsc --noEmit --pretty false`：PASS。
- `pnpm --filter @huabu/web exec eslint src/lcos/professional/ArtifactReaderBody.tsx src/lcos/professional/ProfessionalWindowStage.tsx --report-unused-disable-directives --max-warnings 0`：PASS。
- `node --check scripts/e2e/wave5-assembly-composer.mjs`：PASS。
- `git diff --check`：PASS。
- `ProfessionalWindowStage.test.tsx`：当前仓库既有 React/Zustand 测试环境 invalid hook call，4 项均在 Stage 首个 Zustand hook 处失败；该失败在本次改动前已存在，不能计为 Stage 浏览器通过。
- 真实 production route：`node scripts/e2e/wave5-assembly-composer.mjs`：Assembly 8 项真实材料；`artifact-milestone` 从 Assembly 打开 Reader；`readerOpen=true`、`markdown · 受管 Artifact`；Reader zoom `100%→110%`，滚动位置 `160`，关闭→重开 target 与 zoom 保持，刷新后 target=`artifact-milestone`、zoom=`110%` 保持；脚本未产生 console error。该 fixture 的正文走真实 Core file-record 通道并显示当前 revision `revision-milestone-initial`。

## UNRESOLVED

- PDF/PPT/其他类型仍等待既有 Preview Worker/Renderer producer；Reader 明确显示暂无正文通道。
- 当前 handoff 没有新增 window geometry persistence；刷新后 Reader target 恢复为 Stage 默认 floating region，Stage 仍是 geometry/topology 唯一 owner。
- Stage 单测的既有 invalid hook call 需要仓库测试环境单独修复；生产 typecheck 与 Reader 定向测试已通过。

## 回滚

移除本 handoff 对应的 Reader continuity/sessionStorage 与 content error/zoom 变更即可；不需要 schema/Core migration，不触碰历史 patch，不改变 AssemblyBody、LcosComposerHost、Canvas camera 或 window drag/resize owner。
