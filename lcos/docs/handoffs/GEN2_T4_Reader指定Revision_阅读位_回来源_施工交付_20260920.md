# GEN2 T4 Reader：指定 Revision、阅读位、回到来源施工交付（2026-09-20）

## 结论

Reader 的纵向真实链已闭合：打开入口把 `artifactId + revisionId + source node/surface` 交给 Professional Window；Reader 明确读取指定 revision，缺失或不可读时不会偷换 current；关闭重开、float/dock/tab 切换继续使用该 Reader target 自己的 scroll/zoom；关闭、Esc 与正文“回到来源”统一回到真实来源节点。

## READ_SOURCE

- `README.md`、`AGENTS.md`
- `docs/construction/FIGMA_SOURCE_LEDGER.md`
- `E:/Codex 项目/OS开发/exports/LCOS_Figma_全设计包_20260913/unification/specs/reader.json`
- `E:/TRAE项目/LCOS0.1收口/_cabin/01_正本/GEN2_新前端重新总装正本_20260913/references/original_route_cards/T4/45_T4_to_T5_ProfessionalWindow_and_ProfessionalBodies_ExactBlueprint_v1.md`
- `E:/TRAE项目/LCOS0.1收口/_cabin/01_正本/GEN2_新前端重新总装正本_20260913/references/original_route_cards/T4/LCOS_Gen2_T4_C1-2_ProfessionalWindowTopology_Dockview_ProtectedCanvas_ExactSourcePlan_20260906.md`
- `E:/TRAE项目/LCOS0.1收口/_cabin/01_正本/GEN2_新前端重新总装正本_20260913/references/original_route_cards/V6/04_T4_WorkView_Assembly_Context_Workflow_Skill_30KB_Planning_Guide.md`

## ADOPTED

- `CoreArtifactClient` 继续拥有 Artifact detail、revision list 与 canonical file record 读取。
- `lcosShellStore` 继续拥有 Professional Window target/topology，以及本次新增的 Reader UI-only 会话阅读位。
- `ProfessionalWindowStage` 继续拥有窗口关闭、Esc、float/dock/tab 与回来源编排；Reader body 不碰画布 camera/geometry。
- `ReaderContentView` 继续作为正文呈现组件，仅增加“重读同一版本”的诚实失败动作。

## 实际变更

1. Main 节点双击与 Action Arc 的 Reader caller 改走 `openReader`，携带当前 Core descriptor 的 exact revision 和打开来源。
2. Reader window target identity 从只有 artifact 扩成 `artifact + revision`；同 artifact 的不同 revision 不再互相吞掉。
3. 指定 revision 不存在时保留该目标身份并显示错误；retry 仍读取同一 revision。
4. scroll/zoom 按 `project + artifact + revision` 隔离，存放在既有 shell UI owner，仅在当前窗口会话内存活。
5. “回到来源”、X 与 Esc 先关闭 Reader，再按来源 Core identity 发既有 locate intent；来源节点已消失时寻找同 artifact 的当前投影，否则诚实回报 `unprojected`。
6. stale/missing availability 显式显示，不把外部变化伪装成 Reader 已自动升级。

## VISUAL_SOURCE

- Figma Reader frame：`5388:27411` / spec `5392:6127`
- Professional Window chrome：`5387:331`
- 本批只补真实状态与入口行为，没有重画视觉系统。

## RETIRED

- 退役 Reader 的 ad-hoc `sessionStorage` reload 假恢复；仓库没有正式 Professional UI preference 持久 owner，不能用浏览器存储冒充产品真相。
- 退役两个 production caller 的 artifact-only Reader 打开方式。

## VERIFIED

- Targeted tests：3 files，43/43 通过。
  - exact revision / missing revision fail-close / stale
  - artifact+revision 阅读位隔离与关闭重开恢复
  - Reader target passthrough、回来源、Esc
  - shell target identity 与 source continuity
- `@huabu/web typecheck`：通过。
- `@huabu/web production build`：通过。
- 改动文件定向 oxlint：0 error；2 条既有 `LcosActionArc.tsx` spread warning。
- `git diff --check`：通过。

## UNRESOLVED / GAP

- **reload 后恢复 scroll/zoom 仍是 GAP。** 当前只保证同一浏览器窗口会话内、关闭重开与窗口形态切换的恢复。等正式 Professional UI preference owner 出现后再接入；本批没有新增 DB、没有把 Project/Revision truth 写入 localStorage/sessionStorage。
- 没有真实 Core fixture 可在本批稳定复现“读取中源文件瞬间被删除”；代码与测试覆盖 canonical revision 缺失、file record 读取失败、stale/missing availability。

## 回滚

回滚本提交即可；没有 schema、migration、Local Core 数据或 Huabu canvas camera 改动。
