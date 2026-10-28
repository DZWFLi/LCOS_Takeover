# Glyth 思绪详情：沿原 Popover 接回

状态更新：这是施工前的只读方案记录。随后根代理授权持续节点 leaf 施工，实际接口与 1300ms / history / 原组件测试的最终结果见 [Glyth思绪详情接回_20261026.md](Glyth思绪详情接回_20261026.md)；本文件不再作为完成范围清单。

结论：本批先做完整的“现有摘要 → 原 Popover 详情 / 长文字 → 准确查看过程 → 原右侧对话 → Escape 回到原摘要按钮”阅读链。当前 M2 身体光波保留；不挂回旧 `CanvasFloatingPopover`，不把整个旧 ThoughtView 卡片套进新窗口。

这是只读方案，未改产品、未运行真实页写操作、未发送模型。原自动弹出 / 1300ms 更新 / 近场历史的取舍逐项列在后面，不能因恢复一个详情页就宣称旧 ThoughtView 全部恢复。

## 目前真实 owner

| 位置 | 当前事实 |
|---|---|
| `lab/pilot/native-agent-ui.tsx:408` | `useCollaborationSession` 是唯一会话读取来源；`resolveGlythThought` 从同一 projection / timeline 产出摘要。没有第二套任务状态 |
| `native-agent-ui.tsx:449` | 标题 / 节点点击沿 `requestNativeConversationView` 打开已有原右栏 |
| `native-agent-ui.tsx:453` | `openStateAction` 会重新读准确 node reference 与最新 session，按现能力查 action 后再开原右栏；不能用旧 render 的可用性直接执行 |
| `native-agent-ui.tsx:492` | 新 `NativeGlythThoughtMaterial` 已挂身体周边，保 quiet GUI / 真实 thinking 区分，未挂旧浮窗 |
| `native-agent-ui.tsx:525` | 当前 12px 状态行（造型节点 CSS 实际压到 10px）只显示摘要；点击直接执行当前 primary 的查看动作，没有展开长文字、近场历史或旧 Whisper 生命周期 |
| `lab/pilot/native-glyth-actions.ts:48` | 原命令模型决定 primary / more / unavailable；recover / needs_user 的读取不应拿 canSend 当门槛 |
| `lab/pilot/native-chat-ui.tsx:98` | `view-progress` 已能滚到原活动条；当前只按当前 activeRun 找最新 progress，尚不能表达“这条摘要来源的准确历史 item” |
| `lab/pilot/native-material-viewer-types.ts:14` | 原 `Popover` / `ActionButton` 已由原 bundle 供应；没有必要自建弹层系统 |

接点须注意：`NativeViewerParts` 只传入 ReactFlow 内的 `LCOSProfessionalHost` 子树。Flow 节点并不是这个 Host 的后代。只在 Host 里加一个 Provider，不会让 `ConversationNodeInstance` 自动拿到原 `pr`。最小两选一：在现 memoized `nodeTypes` seam 给会话 renderer 传原 `pr` / 原 Button；或让纯 React parts Provider 包住原 ReactFlow，Provider 不增加 DOM。由根代理确定该共享槽的最终归属。

## 旧 ThoughtView 确实有什么

旧真实 caller 是 `lcos/huabu/apps/web/src/lcos/nodes/GlythNodeBody.tsx:198`，不是孤立组件。读取、交互与显示如下。

| 能力 | 原实现 / 准确含义 | 本批建议 |
|---|---|---|
| 真实摘要、来源、完整长句 | `collaboration/glythThought.ts:26` 只读公开 collaboration 事实；当前 Run progress / task / attention / result / recovery，96 字摘要，较长才附 detail | 直接保留原 resolver。不得读取 assistant 原回复、raw reasoning 或 system note 伪装进展 |
| 新进展展示后收起 | `ui/glyth/glythThoughtView.ts:17`：6200ms 是展示后的 dwell，不是 hover 等待；done 为 4400ms；attention / error sticky | 本批不自动弹出。原摘要持续可读、用户点开详情；自动播报属下一项明确记账 |
| hover / focus / 点击展开 | `glythThoughtView.ts:93`、`:158`：hover / focus / tapExpanded 扩展 detail；离开 160ms 过桥，冻结当前正文 | 本批用原点击 Popover 完成准确阅读 / 键盘链；不将 hover 直接写成 thinking。旧 hover 展开若要恢复，必须与原 pr 的 focus / outside owner 一起验证 |
| 1300ms 正文替换 | `glythThoughtView.ts:136`：距当前正文实际展示时间最少 1300ms；engaged 时冻结 pending；不是每收到事件重开 1300ms debounce | 不把每次 React 更新都立即改字。若本批包含此项，应将这段纯显示状态抽到持续挂载的节点 leaf；不能靠持久隐藏 DOM 搬 Portal 保状态 |
| 最近进展 | `glythThoughtView.ts:149`：本次挂载观察过的同 scope 去重记录最多 4 条；展开显示除当前之外最近 2 条；scope 换即清 | 与 1300ms 模型一起接，独立记账。它是短暂 GUI 阅读历史，不是 Core timeline 副本，不承诺刷新后保留 |
| 查看过程 | `glythThoughtView.ts:49` 原按钮最终调用 caller 的旧 `openWindow('conversation')` | 不复用旧 window handler。改接原 `requestNativeConversationView` / 现活动条，保准确 conversation / Run / item |
| Escape / 回焦 | `glythThoughtView.ts:172` dismiss 当前 key、隐藏、回原参考元素 | 保留读功能，通过原 Popover 关闭，再回当前真实摘要 BUTTON；不回一个不可聚焦的 wrapper，不做全局 Esc 兜底 |
| hidden / reduced / 销毁 | `glythThoughtView.ts:183`、`:196`：visibility 停显示、reduced 取消动画，destroy 释放 ripple / timers / listeners | 新 leaf 必须全带；不因恢复、待回答而 suppress 读取。实际 hidden / 身份变更 / 卸载才关闭 |
| 精确旧尺寸 | `glyth-object-lens.css:2` 当前高优先级对象样式为 228px，正文 12.5px / 19px，不是基础样式的 304px | 取其紧凑边距与字距；原 Popover 可用更清晰的阅读字号。不要把节点现有 10px 原样放大复制成详情阅读规范 |

## 原 Popover 的边界

本地 `reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js` 原 `a1 = IQe`（当前 page 中 `pr`）已经实读：支持 controlled `open`、`onOpenChange`、`content`、side / align / collision / style。hover 立即开、leave 100ms；click 模式切换。它没有把 `forceMount` 转给内容，剩余 props 给的是 trigger DIV。内容首项还有原焦点哨兵。

因此不整挂旧 ThoughtView：Popover 关闭卸载会丢它内部 rows / pending / shownAt / dismissed；勉强维持隐藏 DOM、跨 Portal 搬节点，会增加不必要的生命周期。应复用它的内容语义和必要纯显示规则，原 Popover 留作唯一弹层 / 碰撞 / outside owner。

## 最小完整接法

建议独占 `lab/pilot/native-glyth-thought-detail.tsx` + `.css`，先只做详情阅读 leaf；测试另开 `scripts/native-glyth-thought-detail.test.mjs`。根代理仍拥有 `native-agent-ui.tsx`、原 nodeTypes seam、`native-task-route.ts` / `native-chat-ui.tsx` 的接线。待根代理确认后再施工。

建议接口（不是新增领域 contract）：

```ts
NativeGlythThoughtDetail({
  thought, // 原 resolver 公开用户摘要；不接 raw response / reasoning
  identity: { projectId, conversationId, canvasId, nodeId },
  NativePopover,
  trigger, // 现状态行真实按钮、真实 ref；标题打开对话入口不变
  onOpenProcess, // 精确原右栏地址；不创建 Run / 会话
  primaryAction, // 保原 answer/review/recover 的可用动作与真实 handler
  suppressed, // 仅实际 hidden / 拖拽 / 身份无效；不是 !canSend
})
```

节点 121×142 / 普通 row 几何不变。详情只在原 Popover 的 content 内：明确“当前进展 / 当前任务 / 上次进展”→完整公开句子→已有主操作（如果与查看过程不同）→查看过程。没有进展时只显示“还没有可显示的进展”，仍能进入原对话阅读；不能靠灰掉入口假装完整。

当前状态摘要本身兼任 primary action。若改为点击展开，必须把原 answer / review / recover 动作放回这个原 Popover 的明确按钮，并保原更多菜单；不能让加详情顺便吞掉原功能。若根代理要保单击直接动作，则摘要旁可借当前同一状态行内的原 disclosure affordance，避免新造一整行工具条。最终取哪一种需根代理在共享 node seam 定稿。

### 准确“查看过程”

`NativeConversationViewRequest` 可新增可选 GUI 定位字段 `progressItemId` / `progressRunId`，来自原 thought.sourceItemId + 当时已确认 activeRun；不是新后端事实。右栏只在同 project / conversation 的已读取 timeline 找准确 item，并核 Run 一致。找不到或 Run 已变，显示准确记录暂不可定位、保留原会话与返回入口；不能默默定位另一条“当前最新”。没有 sourceItemId 的任务 / attention / recovery 摘要，可进入原对应段落或普通对话，不伪造 progress item。

点击时重新核当前 node reference、真实 conversation identity 与 handler；读进展不要求 canSend / canRecover。原恢复 / 待回答能力仍由原 owner 决定，详情不能偷偷触发恢复、连接、准备或发送。

## 验证与剩余账

受控实际原 `pr` + 实际 Button 验证：点击 / 键盘展开、长句阅读、原主动作未丢、正确来源 item、Escape 回真实摘要按钮；outside 保原关闭；无 node 冒泡误开右栏、无 pan/drag 被吞。实际公开进展 / task / attention / recovery / done / 无摘要 / 读取失败分别验证，不通过发模型造动态。

真实页只读验证：当前原 Glyth → 原 Popover → 原对话进展 → 返回；检查节点尺寸、相机、原输入 / caret / 引用、消息与 Core 事实不变。320 / 360 与右栏展开时不越界；reduced / forced colors / hidden / 卸载释放正确。无真实 thinking 事件就明确受控事实夹具边界。

若本批只完成上述阅读链，账本仍保留：自动新进展 6200 / 4400 展示收起、1300ms pending 冻结、4 留 2 显示的近场历史、hover/focus 的160ms过桥。每项须实际代码和真实原组件专项通过才勾选，不能统称“ThoughtView 已全部补回”。


## 独立准确进展路由专项（2026-10-26）

结论：**11组实际源码受控测试通过，未发现本次精准目标接线需要产品修复的反例。** 本专项没有把纯函数绿灯冒充真实页面验证；本轮真实原页与统一构建由主代理执行。

- [专项脚本](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-glyth-thought-route.test.mjs>)。
- [完整测试报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/Glyth思绪详情_20261026/准确进展路由专项.json>)：`passed=true`，`failures=[]`，Core写入0、模型0。

### 真实执行了什么

| 原owner | 本专项证据 |
| --- | --- |
| 原 `resolveGlythThought` → `resolveNativeGlythThoughtTarget` | 用实际旧projection/timeline生成displayed thought，scope内project/conversation/Run和sourceItem准确带到`view-progress`；task无item和空态走普通同对话 |
| `requestNativeConversationView` | 实际原函数把item/Run成对发给原同右栏两个事件；缺一项、空地址、错section、外项目完全不发；没有prepare/connect/send等动作 |
| `ConversationNodeInstance.openThoughtProcess` | AST抽实际回调执行，旧displayed条目不会被新activeRun/latest替代；旧project、API、Canvas、hidden、删除节点、换绑定不导航 |
| 原 `openStateAction` | 实际回调依当前entry重新解原命令model和权限，working原主动作仍到当前进展；断开ready仍到原会话选项，旧已不再可用的primary不导航 |
| 原 ThoughtDetail“查看过程” JSX按钮 | 执行实际按钮onClick：关原Popover、停止回焦请求、传**正在显示的current**，不拿新pending thought；空态原“查看对话”只开普通同对话 |
| 原 `NativeCoreChatPanel` mounted listener | 执行实际useEffect并用EventTarget注册/派发：exact item/Run原样进section state，仍原conversation route；拒错pair/外项目，cleanup后旧事件无效 |
| 实际 `ConversationContent` TSX + 实际timeline projector | 真实React树与原effect执行；旧Run条目仍能准确定位；无exact时原主动作仍取当前Run最后进展；实际activity的item/run属性保留 |
| 缺项、错Run、消息冒充 | 显示“暂时没有找到这条进展，原对话和记录保留。”；聚焦原具名状态/返回控件，不退第一历史或新latest；原返回onDismissRequest实际被调用 |
| 重复ID、未知kind、timeline/session读取错误 | 实际projector拒绝不可靠timeline，原错误状态与原onRefresh保留，不显示假活动；loading不聚焦旧条目 |
| 旧回调 | 换conversation/project与unmount取消旧RAF；额外强交已经持有的旧callback仍不聚焦替代页面 |

准确匹配不把activity当message：纯helper拒绝user_message/agent_message；即使有别的同Run新活动，显式条目丢失仍显示原具名缺项。重复ID即便出现在不同Run也不能任选一条。当前工作主动作的“最新当前Run”与查看某条历史思绪的“精确旧Run/item”分开保留，未另写一套工作流。

### 边界

这是实际源码的受控专项：使用实际导出helper、原ThoughtDetail按钮JSX、原Glyth两个回调、原mounted listener、实际ConversationContent与原timeline投影；React hooks调度和DOM的focus/scroll端口受控。没有重写算法，只替换外部store/DOM/RAF依赖。

**不覆盖** 原Popover完整挂载/焦点的真实浏览器时序、真实元素命中或布局、活动记录是否在当前真实项目存在、Core/Host或统一完整构建。没有模拟后端成功，没有运行当前真实页面，没有调用恢复/取消/模型。真实页面与完整构建应引用主代理另存的结果，不能用这11组替代。
