# GEN2 Wave 5 Assembly → Composer 真实纵切

日期：2026-09-19
范围：Assembly canonical item → 取用/引用 → 唯一 Compact Composer → receiver/workspace 校验 → delegate receipt 或真实禁用原因
状态：代码已修改，定向测试与 typecheck 通过；真实浏览器复测受当前 dev 栈既有渲染错误阻塞，未提交、未 push。

## 本轮结果

Assembly 卡片的“草稿”动作现在会复用唯一 `LcosComposerHost`：

```text
Assembly card
  → useLcosReferenceStore.addEntityToDraft(canonical kind/id)
  → useLcosShellStore.openComposer(assembly:<kind>:<id>)
  → AssemblyBody inline LcosComposerHost
  → existing CoreCollaborationClient.delegate → canonical Run receipt/error
```

会话卡使用其精确 `entityRef.id` 作为 `receiverConversationId`。普通材料可以进入 draft，但没有明确接收会话时，Composer 显示真实阻断原因并禁用提交，不猜测 Agent。`workspaceId` 只取当前 Shell 已解析的真实 `activeWorkspaceId`；缺失时沿用已有“现场未就绪”禁用语义。

失败路径仍由已有 `LcosComposerHost` 负责：4xx 显示产品错误并保留草稿；网络/5xx/未知结果显示未确认并保留草稿，不创建第二个 draft/store/Run truth。

## READ_SOURCE

- `E:\TRAE项目\OS开发\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\04_逐Wave施工卡与验收.md`：Wave 5 Assembly + Reader + Composer
- `E:\TRAE项目\OS开发\LCOS0.1收口\_cabin\01_正本\GEN2_新前端重新总装正本_20260913\09_T1-T7现成轮子承接补丁卡.md`：Assembly/Composer/reference 复用边界
- `E:\TRAE项目\OS开发\LCOS_Gen2\docs\handoffs\GEN2_NewFrontend_Wave5_AssemblyReaderComposer_20260913.md`：当前 Wave 5 production caller 与既有失败回执
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\src\lcos\professional\AssemblyBody.tsx`
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\src\lcos\composer\LcosComposerHost.tsx`
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\src\lcos\lcosReferenceState.ts`
- `E:\OS开发\LCOS_Gen2\apps\web-gen2\src\backend\collaboration.ts`：`CoreCollaborationClient.delegate`

## ADOPTED

| donor / existing symbol | target | production caller |
|---|---|---|
| `useLcosReferenceStore.addEntityToDraft` | `AssemblyBody.addToComposer` | Assembly card `[data-lcos-assembly-add]` |
| `LcosComposerHost` + `LcosComposerView` | Assembly inline section | `AssemblyBody` when shell Composer is open |
| `CoreCollaborationClient.delegate` | unchanged | `LcosComposerHost.submit` |
| `buildComposerRunInput` | unchanged | existing Composer submission path |

## VISUAL_SOURCE

Figma Composer inline/near-field component：`LcosComposerView` existing presentation contract（inline node `5280:669`）。本轮没有复制 Composer 视觉组件，只改变 Assembly 的 caller 与 target wiring。

## RETIRED

- Assembly 不再只把引用塞进一个不可见的全局草稿后结束；它现在显式打开同一个 Compact Composer。
- 没有新增 Assembly Composer、第二 Run store、第二 receiver store 或新的 Core endpoint。

## VERIFIED

### Automated

```text
corepack pnpm@10.34.3 exec vitest run src/lcos/professional/AssemblyBody.lifecycle.test.tsx src/lcos/professional/AssemblyBody.test.ts
→ 2 files / 21 tests passed

corepack pnpm@10.34.3 run typecheck   # huabu/apps/web
→ passed
```

新增覆盖：

- conversation canonical item → exact receiver id → `openComposer`；
- artifact reference → `addEntityToDraft`，无 receiver 时带真实阻断原因。

### Browser

更新脚本：`E:\OS开发\LCOS_Gen2\scripts\e2e\wave5-assembly-composer.mjs`

本次尝试访问 `http://localhost:5173/projects/lcos-gen2-dev/main` 时，当前 dev 栈在进入页面即报既有运行时错误：

```text
Unexpected Application Error!
openWindow is not defined
ProfessionalWindowStage.tsx
```

因此本轮没有把这个错误误报成 Assembly/Composer 纵切成功；待 dev 栈以当前 HEAD 重启后，应重新跑该脚本并记录：Assembly 卡片 → 引用条 → inline Composer → submit 的真实 receipt 或真实 disabled reason。

## UNRESOLVED

- 真实 provider/receiver fixture 是否能接受这次 Run 仍需在干净重启的 production route 复测；Core 4xx/5xx 时沿已有草稿保留语义。
- 当前页面无法完成浏览器验证，原因属于共享工作区已有 `ProfessionalWindowStage` dev runtime 错误；本轮未修改该禁改文件。

## 回滚

只需回退 `AssemblyBody.tsx`、对应生命周期测试和 Wave 5 E2E 更新；不涉及 Core schema、Huabu kernel、ProfessionalWindowStage 或 Reader。
