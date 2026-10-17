# 原 Tiptap 自动保存：实际复现

结论：**未登记的 primary Tiptap autosave 仍会重放 unknown。** 这次直接跑原编辑器与原队列，已经拿到 4 次同正文/旧 CAS 的 POST；已登记导图保存的通过不能覆盖它。产品源码未改。

执行：`node scripts/native-tiptap-autosave-repro.test.mjs`

证据：`output/原流程收口_20261017d/原Tiptap自动保存复现/2026-10-17T00-18-40-521Z/report.json`。**脚本 PASS 表示成功复现已知缺陷，并非这个产品问题已修复。** 每次输出独立时间目录，旧证据保留。

| 实际路径 | 观察结果 |
| --- | --- |
| 原 G7 Tiptap DOM 连续输入三次 → 原 vZ/hl → 原 r6 | 原 300ms 防抖只把最新正文交给 `updateNodeData` 一次，首次 POST 也是最新正文；此段正常 |
| 未登记 primary 正文首请求提交后丢回包 | 原链发送 4 次相同正文 POST，均带 observed CAS `r1`；HTTP peer 首次已提交为 `r2`，后续按 CAS 拒绝，不伪造多次成功 |
| 原登记状态 | 所有这些 autosave POST 无 `lcos_text_save_request`，port pending 始终为空；本次已登记文本的 hold/recovery 没有覆盖它 |
| unknown 期间继续快速输入 | 老组仍重试旧正文；后来最新正文留在实际编辑器、live node 和原 `g.current`。不能用 busy/整段锁编辑替代这个 owner |
| 老请求迟到，新稿已排队 | 老回执被注入 Canvas API 因正文不同拒收，未覆盖新稿；原后组最终用 wrapper 实际观察的 `r2` 发最新正文。此处只观察旧正文/后稿边界，不宣称 O8 接受完整通过 |
| 300ms 前关闭原编辑器 | 原 hl unmount flush 将最后 pending 正文交给原 callback，原 r6 随后发送；不能删掉这条离场保稿路径 |

## 执行边界

- 原件只读。测试通过 AST 抽取原 `vZ`、`hl` 全函数原文，加载原 `editor-B8HR4RTZ.js` 的真实 G7/b3 Tiptap 编辑器；由真实 `contenteditable` 输入触发原 `onUpdate`，不是手工调用假 editor callback。
- 实际执行当前 transform 后的原 `r6`、原 request hook/coalescer/registry，以及产品 `startup-surface-core.js` / save port。测试只给原 r6 增加一个只读 `g.current` getter。
- 翻译、Canvas API 注入、非保存的动画/选区环境由 fixture 提供；这不是原完整 Viewer 的视觉/焦点/选区验收。Canvas API 用原 `handleNodeChange` 桥接受控 React nodes；没有另写队列、debounce 或 Tiptap。
- HTTP 对端及时间受控，模拟严格 expectedRevision CAS；没有运行真实 Core、候选整 App、模型或 Run。临时只读静态 fixture 服务与独立 Chrome 均已关闭；未触碰 56239、运行进程或任何产品源文件。

## 下一施工应守住的边界

本复现给出了接缝要求：在原 callback/原 r6 最新 DTO 处登记**已有**更新，不能再调用一次 `port.save→updateNodeData`；保留真实 300ms debounce、原 hl unmount flush、原 g 与新稿。首组未知必须 hold 准确旧操作，后来正文仍留原 owner；GET 真回执只释放准确已尝试对象，不隐式发后来稿。后续修复后此脚本应把“成功复现 4 POST”的断言改为准确登记、POST1、真回执恢复与新稿边界；修复前不把它混进“产品已通过”的清单。
