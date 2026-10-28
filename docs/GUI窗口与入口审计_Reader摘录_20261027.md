# Reader 摘录：窗口与入口审计

结论：没有再加阅读器窗口。正文顶部与底部 More 的两个设置入口已收敛到原底部 More；选区动作仍只在真实选区出现。三条可叠加的正文反馈已合为一个槽，错误与不同的必要说明保留。生产原页最终复验已通过，详细证据见文末；仍未验证的边界单列，不冒称没有 GUI 可改。

| 项目 | 改前 | 本轮整改后 |
| --- | --- | --- |
| 阅读窗口 | 原 Viewer 一处 | 同一处，拖出只沿原关闭/恢复 |
| 阅读设置入口 | 顶部“阅读工具”＋底部“阅读选项”两处 | 生产文本路径只留原底部 More；其中同一“阅读”分组含目录、查找、字号 |
| 选区动作 | 原浮条三项：摘录到输入、带来源复制、拖到画布 | 保留三项，未增加第二浮条；新工作是接通原拖动 |
| 整篇引用/选区引用 | 整篇加入与选区摘录 | 对象粒度不同，不能合并成错误引用；各沿原输入 owner |
| 来源/版本/比较/归档 | 原 More 中的真实材料动作与数据行 | 同 More，不另造面板；来源行按真实关系动态出现，不把数据行数冒称静态入口数 |
| 正文反馈 | 定位、引用反馈、拖放回程最多三条 p | 一个原反馈 p；错误/位置待选择/用户暂停优先，去重但保留不同必要信息；routine“已定位”不再叠第二行 |
| 原 Sonner | 原接收器成功/失败/未知结果通知 | 保留，恢复失败时仍是兜底；正文只确认回到原文及结果待核对，不重复完整原因，不抢先声称高亮完成 |

## 实际接线

`native-material-reading.tsx` 保持原 CT、原 selection hook 和字号/搜索状态。沿既有 MindMap 的原 ActionBar span＋React Portal 模式，将现 `MaterialOptions` 接到同一原 ActionBar。控件、More 和正文属于同一 Reading React owner，无新 context、store、Popover 或窗口。非文本与独立默认 caller 保留原路径。

`native-material-viewer.tsx` 的 More 只增加可选 controlled readingMenu/content。Ctrl+F 从当前原 Viewer 打开同 More，并聚焦同一原搜索；目录点击先运行原 heading scroll，再关同 More 并在未转向外部输入时回正文。关闭、换版本/view、卸载均沿原 owner/回焦保护。

`native-material-viewer.css` 只给 More 内阅读分组使用原浅色 token、紧凑尺寸；移除生产正文常驻 summary 所占的一行，没有加全局层级或持续动画。

## 已验证

现有实际 CT/Reading 隔离专项 15 组通过：

`output/文本选区准确定位_R02_20261026/原CT与正文生命周期/2026-10-26T19-35-12-922Z/report.json`

新增证据：真实键盘 Ctrl+F、挂载多帧后 search 焦点、原查找计数、原目录、字号加/复原、目录点选后关闭与正文焦点、360×400 resize 后一个入口、换 view 关闭旧工具；320×240 仅一个反馈槽，错误与 unknown 指引不丢，旧 locator 状态/回调迟到/隐藏入场保护全过。网络与 pageerror 均 0。

More consumer 在这份叶子里明示为隔离 fixture；它不冒称原 Radix Popover。原 `native-material-viewer.test.mjs` 也通过，默认原 c2/vZ/UX/d2/CT、焦点和版本保护保持。

## 仍待或记账

1. 统一束后的真实原 Popover：Ctrl+F、目录、字号、关闭、原 Esc 回程及四条取消路径；准确 source 高亮必须有真实可见正文 EFP。
2. ActionBar 目标槽与既有 MindMap 同样找到后停止观察。尚无实屏证据证明响应式/全屏会替换该 DOM；最终要真实 resize/原全屏后再开 More 并确认最多一个，不以初次存在代替生命周期通过。
3. 原 hook pointerdown 缓存拖动 payload，只在 click/dragend 清理。pointercancel 可能是原生拖动开始的正常事件，不能直接清缓存/卸载浮条；无 dragstart、无 click 的取消边界尚未实证，先列账，不用粗暴修法破坏真实拖动。
4. 不以删除按钮或隐藏失败当功能完整；本次恢复失败仍有原 Sonner 和原同版 Reader 错误/重试。

## 最终生产原页补证（已完成上面 1、2）

`output/画布摘录Drop_20261027/产品原关闭与取消恢复/2026-10-26T19-45-34-137Z/report.json`，Core87260/Host78792。

- 同一原 Viewer 1500→360×400→1500，slot 两次均 connected/same=true，count1；More 始终 1、顶部 summary 0，无新页面。
- 四次原 More 真实 Ctrl+F 后，经原动画和 8 帧仍是原 search 真焦点；查找1/1、字号110→100、原目录点选关闭 More 并回正文真焦点均通过。
- 四条真实拖动取消/非法落点均准确同版同 file/view/[21,39]；source 高亮实际 Range 可见中心 EFP 命中正文；原 Escape 回原库/Brief 查询。
- 未发现本轮响应式替换 action span，因此没有为了假设再加常驻 observer。文字原 Viewer 已固定全页，无另一全屏切换；不借视频 fullscreen 冒充覆盖。
- Core 完整事实与全部26文件字节不变；60非GET全拦，0模型，pageerror/外网/未知协议0，context均已关闭。

人工核短屏恢复图：`360-browser-escape-03-exact-reader-restored.png`（同报告目录），一处反馈、原 More、原通知保留且精确高亮可读。原 pointercancel 无起拖边界仍记账，未删除入口或假称已修。
