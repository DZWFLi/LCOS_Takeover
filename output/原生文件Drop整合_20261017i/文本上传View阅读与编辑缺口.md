# 文本上传：先还原准确阅读，编辑链仍在册

结论：上传 TXT/MD 后的画布载体绑定的是确版 additional View，不能因为外观是 Text 就当成能编辑的 primary Artifact。本次已把这个 View 接回原 PURE 正文、原“阅读正文”动作与同一个精确版本 Viewer；没有放开底层保护，也没有把编辑未接洗成完成。

## 真实断点

| 原入口 → 原容器 → 操作 | 修前实际结果 / 证据 | 最窄处理与剩余 |
|---|---|---|
| 上传 → 原 XD Text 框 → 正文 | `native-material-placement.ts:144/157` 生成 `explicit_additional` 并投影 `entityType:view`；`native-text-first-transform.mjs` 旧路由只识别 Artifact，View 没有 data.type 时落到 GENERATE | 真实 Artifact/View 身份都进原 PURE；无绑定普通原生成路径保留 |
| 原 Text 双击 / t4 → 原阅读或编辑 | 原 e4 的 canEdit 可用，却没有 View text-save owner | `native-text-first-ui.tsx:27/42` 精确读取当前同 node/ref/API，只开既有 NativeMaterialViewer；不进原正文编辑器 |
| 原 iBe → fullscreen 动作槽 → 返回 | 修前仍是普通编辑语义，缺准确版本阅读动作 | `native-text-first-ui.tsx:50` 仅 View 将同一槽改为“阅读正文”；颜色、复制、存库、删除原组保留，无新工具带 |
| 原 primary Text → 保存 | 节点 owner 与 canvas-text 仅接 Artifact；facade `surface-core-facade.ts:1319` 明确拒 View 正文写入 | 普通 primary 保存 / 生成 / 导图能力保留。View 的可编辑分支尚未接，不能绕过 501 伪装 primary |

另一个不能跳过的 Core 语义问题：`lcos/apps/local-core/src/metadata-repository.ts:2718/2751` 的 `commitManagedTextRevision` 按 artifact_id 更新全部 artifact_views。若直接放开 View 写入，原本的 pinned View 也会被推进。正确后续需由确版 View 的编辑意图明确 fork/推进哪些 View，再交原 Core 事务和历史；本轮只记录，未改 Core。缺失 imported managed 字段会由仓库归一，不能据此断言 managed=false。

## 本次验证

- 修前只读事实：[文本上传编辑链只读事实.json](./文本上传编辑链只读事实.json)。实际原路由表达式求值得到 View→generate，原 save port 拒 View；这是修前证据，保留未覆盖。
- 当前源码只读复跑：[文本上传阅读链当前事实.json](./文本上传阅读链当前事实.json)，View / primary 都进 PURE，View 仍不能绕过原 primary 保存保护；历史失败文件未覆盖。
- `native-text-first-transform.test.mjs`、`native-text-actions-transform.test.mjs` 通过，含真实 View PURE、普通 primary / 未绑定生成回归与原字节恢复。
- `native-text-actions-component.test.mjs --check-version-view` 通过：[View版本阅读组件回归.json](./View版本阅读组件回归.json)。使用真实节点 owner 和提取的原 t4/e4/iBe/JT/Hde 回调；原动作点击、正文双击、原命令都只开准确 artifact/View/revision。primary GET 增量 0、原编辑器调用增量 0、Canvas 写增量 0；替换后的旧 View 回调拒绝。
- 独立原组件 Chrome 的 320/360 布局回归通过；不是候选整页上传成功证明。当前 source ready，等待 root 统一构建后实屏。

主账建议：29（文本原阅读/编辑）与 41（真实文件导入）保留“View 编辑尚缺确版 producer / Core pinned 语义”；只把这次误入生成、误开编辑的前端分派记为已源修。候选和 Core 均未被本次测试写入。

随后已用真实独立 Core 复现 primary 保存推进 additional View，见 [确版View与主文本编辑_真实Core审查.md](./确版View与主文本编辑_真实Core审查.md)。原 Core 本来有 View 跟随 Current 的设计，本轮确版 placement 与其冲突；不能把这个限定结论简化成“所有 additional 天生必须 immutable”。
