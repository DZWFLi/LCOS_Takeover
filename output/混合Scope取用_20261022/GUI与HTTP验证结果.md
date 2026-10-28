# 混合 Scope 当前对话｜真实 GUI 与 HTTP 验证

日期：2026-10-22。最终隔离服务：PID 15016，端口 56311。本轮没有调用模型。

## 结论

最终 GUI 8组、实际 HTTP 4组、原 Composer 独立8组通过。Scope 始终是一条原地址引用，经原 Composer、原 Library 行、原集合页查看和返回。集合、附注、人工对话历史、Run、Workspace 与子 Scope 的正文及来源都进入真实 Manifest，没有展平为材料列表或新建窗口。

普通任务已通过原提交按钮真实创建一个 `created / planned` Run，attemptCount=0，未 dispatch。最终页面复验只回读原回执，没有重复创建。续聊输入能完整取用、查看并返回；当前真实会话没有可发送 owner，`canSend=false`，页面没有发送，也未伪称成功。

## 最终 GUI 8组

1. 原「用于当前对话」加入单个 Scope 引用，保持原输入与光标。省略 mode 沿原 Core 的全文默认语义。
2. 原芯片打开原 Library 行，进入两层集合、逐层返回，实际点击原「返回 当前输入」，回同一输入；Stage 窗口列表不变。
3. 同一 Scope 再次取用幂等去重；原移除按钮只移除引用，草稿保留。
4. 原含 PNG 的 Scope 在原提交时整体409拒绝，结构化码为 `MIXED_SCOPE_CONTENT_UNSUPPORTED`。原草稿和完整 Scope 芯片保留，执行投影不变，没有只发送可读子集。
5. 前轮真实 GUI 创建的 planned Run 与完整 Manifest 读回通过，最终复验没有新建任务。
6. 原历史菜单进入 continue 输入，Scope 的取用、查看、返回保持原 receiver/message/operation；真实离线 owner 阻断发送。
7. 1040×760 窄窗可达，返回保留原续聊草稿和光标。
8. 原画布列表恢复为三个真实已打开 Canvas；新增未打开 Workspace 仍在 Core 与 Scope 内，原「现场列表暂不可用」业务错误消失。

PNG 页面现在明确提示：「这份内容包含暂不能完整加入对话的图片、PDF 或其他文件；输入和引用已保留。」原普通 CONFLICT／STALE_REVISION 仍使用原恢复流程，没有按错误消息猜类型或泄漏后端路径。

## 实际 HTTP 4组

- 原 `orderedReferences: scope` 和 `savedContextId` 两入口分别读取同一整份异构内容，真实存储的 Manifest 保持一个聚合项、完整原文及成员证据。
- 原 PNG Scope 在这两条入口都整体拒绝，执行投影不变，不返回部分结果或 Manifest 身份。
- 原图谱、原 Presentation、集合与原输入任务读回不变；没有 dispatch、cancel、provider 或模型调用。
- 最终 HTTP 复验只读取前轮已创建的两个 planned Run，新增 Run 数为0。

原公开 HTTP 没有 Manifest 总清单接口，因此 HTTP 严格证明无新 Run、无返回 Manifest ID；失败时无孤儿 Manifest 写入需结合根任务的原服务与真实 repository 集成测试，本文不冒充已从 HTTP 枚举证明。

## 真实创建记录

整个验证累计仅有3个成功创建的合成 planned Run，全部 attemptCount=0：

- GUI：`run-84dd82b6-63c7-4a96-976a-10a71658fbbf`
- HTTP 原 Scope 引用：`run-10df1ffa-194c-409f-acdc-c1b598c79dee`
- HTTP savedContext：`run-d3c2ccd5-4f58-4e59-a26d-5a23fa08cee5`

## 最终证据

- GUI：`真实页面/2026-10-22T13-26-14-823Z/report.json`
- 单 Scope 芯片：同目录 `02-one-scope-original-composer.png`
- 原库、嵌套路径、原返回按钮：同目录 `03-chip-original-library-nested-return.png`
- PNG 精准失败提示：同目录 `04-png-whole-scope-rejected-draft-retained.png`
- 原续聊与真实离线 owner：同目录 `05-continuation-scope-real-offline-owner.png`
- 窄窗：同目录 `06-narrow-original-mixed-scope.png`
- HTTP：`实际HTTP/2026-10-22T13-28-38-797Z/report.json`
- 首次真实 GUI 提交回执：`真实页面/2026-10-22T13-07-49-591Z/普通任务提交回执.json`
- 合成准备：`fixture.json`、`准备回执.json`
- 原 Composer 独立8组：`../混合Scope当前对话_20261022/原Composer接线独立验证.json`

此前未通过的 GUI 记录全部保留，分别是过严的全文默认 mode 断言、未等原库退出动效就再次搜索、错误假设 PNG 已在取用阶段预检。最终按原控件和真实提交边界修正，没有强点 disabled、注入 setter 或改写成功结果。

新增未打开 Workspace 还暴露了原 Canvas 列表把 undefined canvasId 传给读路径的问题，409 复现见「未打开工作集导致原画布列表失败.json」。根任务修复投影后最终业务断言通过，未删除该 Workspace 或成员。

## 继续记账

- 当前真实续聊 owner 离线，GUI 实际发送待接入可用 owner 后验证；原服务加本地测试 transport 的发送测试由根任务另行归档。
- 新纯文本 Workspace 的内容已通过真实 membership 读取，但尚未打开现场，没有 canvasId；保持原不可进入提示。
- 本轮浏览器为保护场景数据，阻断了原自动 execution reconciliation 1次与原图片 batch 同步3次写尝试，Canvas 前后相等。截图中的「Failed to fetch 重试同步」对应测试主动阻断的同步请求，不是新的 GET 业务失败；不能称启动零写尝试。
- `pageErrors=[]`。离线角色库、厂商统计和受控失败仍记在网络日志；不能称控制台完全无错误。
