# 确版 View 与 primary 编辑：两层语义确实打架

结论：独立真实 Core 已证实，编辑 primary 文本后，本轮按指定版本放置的 additional View 会被一起推进。画布刷新直接显示新正文，原确版放置核对变成 409，原 Viewer 的“旧 View＋旧版本”准确阅读也会拒绝。旧文件仍在，不能把它写成正文数据丢失。

但不能倒推成“原 Core 所有 additional View 都应该 immutable”。原 domain 的 `explicit_additional` 只区分位置角色，没有 immutable 策略；原 `commitManagedTextRevision` 还有 HU-2 注释要求 View 跟随 Current。实际冲突来自新 placement 明确 pin selected revision、View 主键含 revision，而旧提交把所有 View 一起推进。

## 真实调用与结果

只用隔离 runtime 和既有公开 producer，没有候选请求、直接 SQL、模型或生产代码改动。

1. 取原 bootstrap 的 Main primary Text 和当前 revision R1。
2. 调原 `POST /api/lcos/canvases/surface-core-context/materials:place`，准确传 project / Workspace / artifact / R1 / FileRecord。真实 projector 创建 `explicit_additional` View V，Context carrier 为 `entityType:view`，正文为 R1。
3. 调原 `PUT /api/lcos/core/projects/:project/curation/canvas-text`，同 Main node / primary binding，CAS expectedRevisionId=R1，保存新正文 R2。
4. 真实 Core、原 facade 读回与现 Viewer resolver 得到：

| 核对对象 | 实际结果 |
|---|---|
| Artifact.currentRevision / primary View | 正常到 R2 |
| additional View V | id 和 referenceKind 保持，revision 从 R1 变成 R2 |
| Context 原 carrier 重新 GET | 同 carrier 变成 R2 正文，ref.revisionId 也到 R2 |
| 原 placement 按 R1 GET 核对 | 409 `MATERIAL_VIEW_ID_CONFLICT`，未伪装重放成功 |
| 现原 Viewer resolver：V＋R1 | 拒绝“所选视图与版本不一致”，没有 Current 替代 |
| 现原 Viewer resolver：明确 R1、不指定 V | 正确解析 R1 和旧 FileRecord |
| 旧 immutable FileRecord | 实际文件仍等于 R1 正文 |

完整证据：[report.json](./确版View真实Core审查/2026-10-17T13-43-16-487Z/report.json)。脚本：[native-text-additional-view-core-audit.mjs](../../scripts/native-text-additional-view-core-audit.mjs)。`passed:true` 指探针严格验证了上述失败场景，不是该产品链已修好。

## 原 owner 与建议

- 原 domain：`lcos/packages/domain/src/index.ts:255`，ArtifactView 是 Scope 中的出现位置；`referenceKind` 没有快照/跟随 Current 区分。
- 原提交 owner：实际 selected `apps/local-core/src/metadata-repository.ts` 的 `commitManagedTextRevision`；HU-2 的全量 View 更新与 `restoreArtifactCurrentRevision` 都按 artifact_id 推进所有 View，不能只修保存漏掉恢复。
- 新确版承诺 owner：`lab/pilot/native-material-placement.ts:140` 明确 pin selected revision；View 主键由 Workspace / Artifact / Revision 形成，`source()` 会拒绝同主键指向别的 revision。此保护正确暴露不一致，不应为了消掉 409 放宽或改用 Current。
- 正确后续应先明确“此出现位置跟随 Current”与“选中版本”的 Core 写入策略，再在同原事务里只推进应跟随的 View，并覆盖 primary 保存、恢复、追加版本和 existing additional 调用者。不能未经清查就把所有 `explicit_additional` 一刀切成 immutable，也不能只改读层隐藏推进事实。
- 精确 Reader 的拒绝行为和旧 FileRecord 应保留；不要去掉 View 校验把错误引用包装成正常成功。真正要让选中版本载体长期稳定，需要落实上面的 Core owner 语义，而不是新增第二份正文缓存或前端 Pin 真值。

本报告独立于当前候选前门 / PURE 阅读构建，不阻 root 实屏验证；当前已冻结前端未被本探针修改。
