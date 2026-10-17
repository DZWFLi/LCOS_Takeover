# GEN2 Wave 4 · Railway Peek / Receive / More 施工交付

日期：2026-09-19
范围：真实 Railway destination 的 Peek / Receive / More 与刷新回读
状态：源码已落地；未 commit、未 push

## 结论

Railway 现在对每个真实 Core destination ref 提供 hover/focus Peek 面板、Receive 能力说明和 More 菜单。Peek 只读当前 Core destination projection；Receive 继续命中已有 `railway-receive` target，由 R1 drop router → `CoreAssemblyClient.apply()` 产生 canonical receipt；More 的进入动作复用既有 destination activation，移除动作使用 Railway order 的 Core CAS 写入并显示服务端版本。

三现场入口仍由 SurfaceDock 提供，Railway 没有生成第二套根入口。

## 流程

```text
Core order + project graph
  → Railway destination projection（exact kind:viewId）
  → hover/focus
  → Peek（label/ref/availability/Receive reason）
  → Receive：外部素材拖入 live railway-receive target
      → existing drop resolver/router
      → CoreAssemblyClient.apply()
      → canonical receipt
  → More
      → enter：existing activateDestination
      → remove：CoreRailwayClient.write(expectedVersion)
  → server order / version
  → reload read + graph projection
```

## 修改文件

- `huabu/apps/web/src/lcos/shell/LcosRailway.tsx`
- `huabu/apps/web/src/lcos/ui/families/LcosRailwayView.tsx`
- `huabu/apps/web/src/lcos/ui/families/lcos-hud-presentation.css`
- `huabu/apps/web/src/lcos/ui/families/lcosFamilies.test.tsx`
- `huabu/apps/web/e2e/lcos-collab-r2r3.spec.ts`

没有修改 `LcosGlobalHud`、`LcosProjectShell`、Core contracts 或 Local Core route；没有触碰两份历史 patch。

## 诚实边界

- Peek 是 Core read projection 的预览，不伪造缩略图或第二 destination store。
- Receive 按钮在没有拖入素材的静态状态下保持 disabled；实际接收只能由 live target + 既有 Assembly apply 提交，避免空操作生成假 receipt。
- Collection / unresolved destination 仍展示 unavailable reason；More 仍允许移除对应 raw ref，进入动作按 capability disabled。
- 当前改动只负责 Railway surface；Locator arrival、Collection Portal、物理跨 Space transfer 不在本批范围。

## 验证

```text
npm run test --workspace @local-creative-os/web-gen2 -- --test-name-pattern railway
→ 325/325 passed

npm run typecheck --workspace @local-creative-os/web-gen2
→ passed

npx vitest run src/lcos/ui/families/lcosFamilies.test.tsx src/lcos/navigation/railwayProjection.test.ts
→ 16/16 passed

npx tsc -p huabu/apps/web/tsconfig.json --noEmit --pretty false
→ passed

npx vitest run src/lcos/ui/families/lcosFamilies.test.tsx
→ 9/9 passed（含 Tab 进入 Peek 内部后保持、离开 Railway entry 后收口）

targeted eslint（LcosRailway / LcosRailwayView / lcosFamilies.test）
→ passed
```

定向浏览器项已追加到 `huabu/apps/web/e2e/lcos-collab-r2r3.spec.ts`：Peek 显示 exact destination ref、Receive 无 source 时 disabled、More 进入/移除按 capability 展示、刷新后目标仍从 Core order 回读。已尝试：

```text
$env:E2E_WEB_PORT='5299'; $env:E2E_SERVER_PORT='3199'; npx playwright test e2e/lcos-collab-r2r3.spec.ts --grep "R3-2A" --project=touch
→ harness 在既有 canvas 等待阶段超时：页面已渲染 Railway 目的地，但 canvas 仍显示“还没有画布 / 建立主画布”，并返回 Origin is not allowed；未到达本批 Peek 断言。
```

失败证据：`huabu/apps/web/test-results/lcos-collab-r2r3-R3-2A-Pee-e5868-on-显示-capability，刷新后仍回读同一目标-touch/error-context.md`。该失败发生在现有 fixture/canvas bootstrap，不是本批 Railway 交互断言失败。

## 回滚

逐文件 revert 本批 Railway 相关变更即可；不涉及数据库迁移、contract、版本号或跨系统写入。
