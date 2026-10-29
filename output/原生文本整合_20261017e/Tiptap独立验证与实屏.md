# 原 Tiptap 保存、工具带与草稿独立验证

当前结论：**当前独立原O8/r6 11项、真G7/原UX 12项通过；新候选整App的exact explicit导图pending重开、Undo自身loss、Redo自身loss、32px尾padding长文密度四场均通过。** 旧guard/越界/尾段/节点正面失败原样保留，分别修复后定点复验。仅证明本页列明流程，不代表全工作区都已融合或所有视觉细节已成熟。

验证日期：2026-10-17。当前整App候选 `http://127.0.0.1:56239`，PID **43968**；较早PID44908证据保留。仅复用Main已声明合成Text `text-a34ae67c-c735-4b2f-9d1a-e6b5caff5cb9`，没有新建材料、Run或调用模型。本子任务没有操作正式56238。

## 验证的是哪条原流程

原节点 `n4 → rBe → xl → JT/Hde` more 菜单选择正文/导图/编辑导图；正文双击沿原 `wa/d2/c2/vZ` 进入真实 `G7`，使用原 `hl` 300ms debounce，经过原异步 `dr/Gb/Wb/Bf/Ub/Ff`、原 `r6/s6` 队列和原 `O8` 历史保存。没有第二份编辑器、队列、Undo/Redo 或外层窗口。

产品接缝：`lab/native-tiptap-autosave-transform.mjs:24` 只给 vZ 原 updateNodeData 的 data 参数提供带原归属的 updater，并把保存反馈放进原 UX/XO/gm；`lab/native-text-save-port.js:66`、`:87`、`:520` 接原异步更新及已存在队列对象。`:268` 在原 worker 真空闲后处理已确认回执，`:289`、`:296` 从原 g 派生“继续保存”，不另建草稿队列。

恢复语义：核对旧 A 仅发回执 GET 与 Core GET；用户后来写的 C 留在原 g。必须点击原操作条“继续保存”才允许 C 按已确认 r2 发一次新 CAS。GET 不暗送 C，unknown 不重发 A。

## 独立实际 Hook：12 项通过

脚本：`scripts/native-tiptap-save-independent.test.mjs`。下表10项最初证据为`原Tiptap独立Hook验证/2026-10-17T00-53-57-861Z/report.json`；加入native-history两向原gm核对点击后，当前12项证据为`原Tiptap独立Hook验证/2026-10-17T01-41-09-664Z/report.json`，与原O8/r6 11项矩阵的范围区分见`原历史正文独立验证.md`。

| 场景 | 严格结果 |
| --- | --- |
| 快速连续输入 3 次 | 真 G7/hl 只产出最终一次原 dr 更新、一次受归属 POST，live/Core/raw O8 ref r2 一致 |
| Core preflight 读很慢，期间继续 B/C | 保留 C；按原队列实际形成 A、C 两次 CAS，expected r1/r2，无第二次 adapter update |
| unknown A 后写 C，原历史尚未 debounce | GET 确认 A 不改 C、不伪造 A 帧；原 UX 显式恢复 C，一次 CAS；真 O8 Undo/Redo r4/r5，索引 1→0→1、原两帧不增长 |
| unknown A 后写 C，原历史已 debounce | 同上，并检查已存在 C 历史与确切 ref，未吞后来的 C |
| unknown 后关闭/重开 | 原稿与原操作条恢复；跨原 2.5/5/10/25s 时钟没有重发，真实核对按钮仅 GET 后原 pending/g 退场 |
| 原 hl 300ms 前关闭 | 原 cleanup flush 同一次更新，保存一次 |
| 确切 CAS 冲突 | 保留后来输入及原 g；60s、关闭/重开均不循环重发 |
| A 回包很晚，期间已输入 C | A 只能推进确切基准，不覆盖 G7/live C；C 下一次按 r2；最终原历史 C/r3 |
| held 文本与普通 node/links 混排 | 文本只尝试一次；普通节点和连接仍走原 worker，未被整体卡死 |
| 同 Canvas ID 替换 API | 真实 deferred dr 对象暂停，0 POST、原稿与原 g 保留；不越过旧归属写新 API |

这里执行原 bundle 真函数、真实 React/Tiptap、原请求 Hook 和生产 wrapper/port；只替换空间/store 环境、合成 HTTP peer、几何和时钟。运行独立 Chrome 和随机 loopback 端口；**不冒充完整 App 或真实 Core 验证**。same-Canvas API 换主之后如何回到旧归属恢复尚未完成，本项只证明不跨归属提交。

## 真实候选整 App：5 项通过

脚本：`scripts/native-tiptap-browser.mjs`；原文件原件不写，只在测试响应副本加入只读原 `x.current/p.current` 观察。每场 Core/current revision、live node、raw O8 正文/ref 严格一致；原 pending 与原 g 自然清除，没有测试手动 ack 清账。

| 场景 | 真实 edit POST | 报告目录 |
| --- | ---: | --- |
| rapid | 1 | `Tiptap整页验证/2026-10-17T00-52-20-615Z/` |
| slow preflight A→C | 2，第二次 expected 等于第一批真实回执 revision | `Tiptap整页验证/2026-10-17T00-52-56-112Z/` |
| unknown-close | 1；真实观察 30s，核对仅 GET | `Tiptap整页验证/2026-10-17T00-53-57-837Z/` |
| unknown-later | 2；A 只发一次，核对后 C 只由原“继续保存”发一次 | `Tiptap整页验证/2026-10-17T00-55-15-246Z/` |
| close-flush | 1；300ms 前原返回，cleanup 真保存 | `Tiptap整页验证/2026-10-17T00-56-09-073Z/` |
| 最后一次定点 unknown A→长文 C | 2；原核对仅 GET，用户点继续后才提交 C | `Tiptap整页验证/2026-10-17T01-13-34-048Z/` |

每场 Artifacts **17→17**、Runs **1→1**，0 模型、0 页面 JS 错误。原节点 `.native-first-toolbar` 数量为 0，原 JT/Hde 文本菜单为 1；双击是同一个原媒体 Viewer、一个 dialog，原 G7 与原格式控件仍在。

合成材料原来是 H1。真实 G7 的 select-all/fill 保留原标题，serializer 输出 `# C`。脚本读取真实 DOM 的 P/H1…H6 结构形成确切预期，再严格比原 POST/Core/raw O8 bytes，没有把标题格式删掉以迁就测试。

## 实屏发现及窄修状态

初版 680px 下原格式按钮和新增核对都能实际 focus、命中且不横滚整页；新增状态为 12px/最大 120px，核对为一个原 48px gm。**当时原白色 pill 没有随内容增长**：

- 原 action bar：x=108..572，width=464，scrollWidth=553。
- 核对钮：x=613..661，落在 pill 之外。
- 证据：`Tiptap整页验证/2026-10-17T00-55-15-246Z/02-original-UX-pending-narrow.png`，已逐图查看；report 的 `toolbar.unknown-680` 记录真实 computed/rect/hit。

根已沿原 XO/原 t2 做宽度与 wrap 窄修，UI-only 重建，后端保持 PID44908。`Tiptap整页验证/2026-10-17T01-03-50-149Z/` 和 `01-05-15-833Z/` 实测：680px 原条宽560/scrollWidth560；320px 原条288×172/scrollWidth288；保存前10个实际 formatter 的 tag/role/label/order 全保留，pending 后11个 control 全包含于同一原 pill 与 viewport，实际 focus/hit 成立，没有新操作条。

**随后发现的 320px 长文尾段失败也已真实修复，历史证据保留。** `01-05-15-833Z/report.json` 的 `tailReachability` 同时记录原键盘 End 和真实 wheel 到底：当时原 scroll top3695+client624=scrollHeight4319，末段 y586..668、原条顶 y600，仍被盖，实际 editor paddingBottom=32px；未把它降格为“只是自动 caret 问题”。根/runtime 只读定位到原 layered `!py-8` 赢过先前规则，将定点规则放进原 utilities 层正确加载位置，并按原条测量高度缩原 main 可用高度，保留原滚动 owner，未新建容器。

旧 A 仅核对完成后，**节点正面被 Core A 遮住的新缺口也先严格复现再修复**：`Tiptap整页验证/2026-10-17T00-57-00-646Z/report.json`，同页 GET 后等 800ms，节点 DOM 显示旧 A，而原 G7、live `data.text` 和原 g 仍保留 C。检查在点击继续前失败，只 1 个 A POST。节点 owner 沿同原 g、精确 project/canvas/node 归属的 presence 窄修，未另建正文缓存。

### 最后一次定点整 App 结果

`Tiptap整页验证/2026-10-17T01-13-34-048Z/report.json`：总 `passed:true`、`functionalPassed:true`、`visualFailures:[]`，后端仍 PID44908。

- 真丢 A 回包后 30s 无重发。原关闭/重开保完整长 C；真实核对按钮仅请求回执 GET/Core GET。800ms 后 **Core 仍是 A**，原节点 live `data.text`、G7、原 g、节点正面 DOM **均是 C**；g count1/canResume，尚未提交 C。节点正面检查来自同页原 Viewer 后方 DOM；相应截图展示原 G7 与原继续保存入口，不冒充“关闭 Viewer 后的节点实屏”。
- 只点击原“继续保存”才提交 C 一次，expected 等于 A 的真实回执 revision；最终 Core/live/raw O8 bytes/ref 一致，pending/g 自然清；Artifacts17→17、Runs1→1、0 模型、0 页面 JS 错误。
- 680px pending：pill560×60/scrollWidth560，10个原 formatter+1个核对均包含在同 pill 与 viewport；原 main/scroll 高712，padding/scroll-padding116，keyboard End 与 wheel End 均能显示完整末段。
- 320px pending：pill288×132/scrollWidth288，原 main/scroll 高540，padding/scroll-padding188；末段 bottom428<bar top640，keyboard/wheel 都过。
- 确认后 320px：同一原 bar288×80/scrollWidth288，无保存状态及额外按钮，原10控件 identity/order 完整且可 focus/hit；原 main/scroll 高592，padding/scroll-padding136，末段 bottom532<bar top692，keyboard/wheel 都过，没有清 pending 后重新溢出。
- `02a-original-UX-pending-320.png`、`02b-old-A-confirmed-later-C-nodeface.png`、`03a-normal-original-UX-confirmed-320.png` 已逐张查看。真实 Core 长文 C 保留供后续纯读布局核查；测试浏览器已关闭，unknown 场景冻结，不继续造未知写入，也未提前 rich-paste 树。

无遮挡通过不等于密度完全满意：PID44908当时320px pending末段距bar约212px、confirmed约160px，为双留空。根后续回原32px padding，**PID43968新的声明长文已实测gap约56px**，新截图及严格结论见末节；旧截图不冒称已变紧凑。

## 原富文本 paste 与导图回归

- `Tiptap整页验证/2026-10-17T01-19-07-149Z/`：同一材料，真实原 G7 select-all 后派发 HTML ClipboardEvent，原 parser 接收 h1 Alpha / ul Child / h1 Beta / code opaque。真实 serializer 为 `# Alpha\n\n- Child\n\n# Beta\n\n```\nopaque()\n````，精确比 Core/raw O8；1 POST、17/1不变，没有直接 seed 或隐藏 setContent。
- `导图整页回归/2026-10-17T01-19-45-397Z/`：原 more→导图→编辑导图、未存关闭重开、六个原按钮通过；真保存 Alpha→Alpha live edited 成功后丢回包，关闭再点原 more 编辑导图被 aria-disabled。pending explicit/body完整，原菜单仍有核对原保存；该脚本在重开前失败并关闭了 context，不能再从新 page 冒称核对了同一内存 pending。Root/节点 owner 后补 exact explicit draft 专属恢复，与 autosave/history 保护分开；未新 build 实屏验证前仍算失败。
- `导图整页回归/2026-10-17T01-26-22-706Z/`：已声明新编辑 **Alpha live edited→Alpha reviewed**，不重置旧正文。原 more与同 wa body、未存原关闭/重开、六原按钮、正常保存通过；原键盘 Undo/Redo 各一次且各1 CAS，raw/live/Core body/ref精确、索引1→0→1、size2不增长、reload保最新 Redo。原 code opaque bytes 保留。17/1不变，0模型/JS错。三张编辑/Undo/Redo图已逐图确认。
- 该次结束树为Alpha reviewed，Redo revision为`revision-text-2ebca216-171d-4880-b6c5-93b1a187a6e6`。旧context已经关闭，不把它的GET回程补称通过；此后新声明意图及当前最终材料见下一节。

## PID43968：四场最终整App串行验证

根统一完整重建后，Core graph、Runs、三个Canvas完整对象重启前后deepEqual；本子任务拿唯一候选写窗口串行操作，结束后全部Chrome context已关闭、窗口已释放。

| 新声明意图 | 原真实路径与结果 | 报告目录 |
| --- | --- | --- |
| Alpha reviewed→Alpha guard checked | 原more进入同wa编辑；真保存后丢200，同exact explicit pending经原more重开同草稿/六原控件；30s1editPOST，原核对只GET后pending退场；正常UndoRedo各一次准确CAS/ref/index | `导图整页回归/2026-10-17T01-44-18-056Z/` |
| Alpha guard checked→Alpha undo checked | 先原编辑正常保存，再原键盘Undo真提交后丢200；native-history/undo原pending，30s仅1UndoPOST；关闭Viewer后真实Hde more核对只GET，raw目标ref补齐；反向Redo使用真实Undo新revision，共3POST | `导图整页回归/2026-10-17T01-46-47-532Z/` |
| Alpha undo checked→Alpha redo checked | 原新编辑保存、正常Undo、目标Redo真提交丢200；30s仅1RedoPOST；原more核对只GET；恢复后反向Undo一次使用真Redo新revision，共4POST，最后回Alpha undo checked | `导图整页回归/2026-10-17T01-48-42-218Z/` |
| 声明新原G7长C | 原more切正文（1个load元数据POST），原G7新A成功丢回包后粘贴长C；30s0重放；核对后Core仍A，live/G7/g/node DOM均C；只点击原继续保存才C一次，共2个editPOST；原32px padding及两宽密度通过 | `Tiptap整页验证/2026-10-17T01-50-25-653Z/` |

四场Artifacts **17→17**、Runs **1→1**，0模型/页面JS错误；每个unknown是新的明确用户编辑/历史意图，不是重发旧context未知写。每场读取真实Core、live与raw O8；历史size2不增长，原index和对应body/ref准确。两向history-loss的恢复是**实际原more菜单点击**，没有测试直接port.verify替代。

最后长文的pending680、pending320、confirmed320均为**同一原action pill**，原10个formatter identity/order完整，pending只有一个原48px核对钮；按钮全部within同bar及viewport、能focus/hit，scrollWidth=clientWidth。真实键盘End与原wheel到底都完整显示尾段；wheel end gap为 **55.625 / 56.25 / 56.25px**，均≤80，实际padding均32px。pending320与confirmed320的原bar高度分别132/80px，原main继续避让，无第二滚动owner或浮条。

新四场的恢复/窄宽截图已逐张查看。最终同材料为新声明长文C，revision **`revision-text-4895864b-6f01-43fb-a94d-846d60e9a7d0`**，没有遗留pending/g；不是仍声称保留旧Alpha树。旧失败中的已关闭context不能补出原握手，这个边界仍保留。

## 保留的失败及证据边界

- `原Tiptap独立Hook验证/2026-10-17T00-40-37-386Z/`：当时原队列 busy 时 A 已 confirmed 仍留 g，C 无恢复入口；生产 owner 后补 queueIdle，最终 10 项已覆盖。
- `原Tiptap独立Hook验证/2026-10-17T00-50-18-930Z/`：测试冻结时钟却要求原 500ms worker 同步结束；g 已被真 worker 拿走，属于 fixture 时序断言。修为先取回执立即快照，再推进原时钟，要求自然清账；未手动 ack 掩盖。
- `原Tiptap独立Hook验证/2026-10-17T00-52-20-628Z/`：安全暂停实际是 `core-preflight-failed`，初写预期为 `context-changed`；0 POST/原稿保留均成立，修准确状态预期后通过。
- `Tiptap整页验证/2026-10-17T00-49-17-192Z/`：测试错把 H1 原 serializer 的 `# C` 当纯 C；真实 1 POST 已成功，Core/pending/g 正确。失败文件原样保留，后续按原 DOM 格式校正预期。
- `Tiptap整页验证/2026-10-17T01-02-29-808Z/`：新增验证误把原 Radix 的 radio/ToggleItem 当 `getByRole(button)`；真实10个格式控件仍在。改成先取原真实 tag/role/label/order，之后逐项比对及 focus/hit/矩形包含；原失败保留。
- 更早 TooltipProvider 缺失、把原 updater 当 JSON clone 的 fixture 引导错误也保留在同 Hook 目录，不算产品验证。

本页较早的O8往返仅覆盖自身正常回包；后发现的自身loss重发/rawref缺口，旧负向见`原UndoRedo丢回包_实际复现.md`。当前native-history source的独立11项、真G7/UX12项，以及PID43968两向整App loss真实原more GET回程均已通过；严格边界见`原历史正文独立验证.md`，旧负向仍保留。

本轮没有验证跨项目/替换 API 之后的人工恢复、所有富文本格式组合、所有 Canvas/旧窗口入口，也没有把 d 阶段导图保存通过等同于 e 阶段原 Tiptap 已通过。全工作区审查仍按根报告列册。
