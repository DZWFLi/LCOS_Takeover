# Color Pin 原组菜单接线

当前结论：原顶栏、组菜单、行内改名、当前画布定位和准确文件下载的源码已接好，独立测试 **9 组通过**。本报告是源码与受控执行证据；尚未使用本轮候选做整页验证，不能写成 Color Pin 全流程已完成。

## 接到了哪里

| 原入口 / owner | 本轮接法 | 保留内容 |
| --- | --- | --- |
| `eG` 原 Canvas 总容器 | 在原返回树外包唯一 `LCOSNativeColorPinProvider`；原 `BC=bB` 与顶栏 `H7` 是兄弟，故不能只包 `bB` | 原 `Yj`、ReactFlow、顶栏、侧栏、全部子节点和身份；测试严格比较包裹前后整棵原返回 AST |
| `v7 → w7 → y7` 顶栏组按钮 | 能力与当前 Core 投影选择原 `w7` 布局的受控叶子；未知操作仍留 Core 分支 | 原按钮、尺寸、色点、hover/press 动效、开关与瞬态分组过滤。原 `w7/u7` 字节不变，普通 donor 分支保留 |
| `m7` 原组菜单 | 原行内命名显示“项目共享”；准确 definition label + updatedAt + 原 label CAS | 原输入、焦点与键盘操作；只有真实 confirmed 才收起输入，失败保留原处文字 |
| `m7` 原移除组动作 | 文案改为“移除此画布标记”；确认捕获准确 membershipIds / Canvas / API，再由既有 controller 重读 | 只移除确认范围内关系，不删节点、内容或 definition。对象共享与现场共享影响写进原确认框 |
| `m7 → p7 → g7` 原成员列表 | 最后核当前原 API、节点准确引用与当前组关系，随后调用原 `p7` | 原高亮、原 fitView、原会员行、原拒绝后菜单不关闭。没有取 Core 旧坐标，也没有误切 Surface |
| `m7` 下载组文件 | 原下载菜单动作换准确 Core 文件读取；一个文件原浏览器下载，多个文件一个本地 ZIP | 人类标题与扩展名；不把 Current 当作历史版本。ZIP 使用已有 `fflate/browser`，未装依赖 |
| 原菜单状态槽 | 保存进度、失败说明及“核对标记结果 / 重新读取”置于原菜单内部 | 未知只调用现 controller 的 GET 核对，不重发写入；没有新 HUD、dialog、portal 或第二份 Pin store |

原 `Mie/KT` 高亮、小地图和分组筛选 owner 未在本 page 变换中修改。非六色定义用真实 hex/label 展示，没有按原固定六色数组过滤掉。

## 文件与接口

- [原 page 定点变换](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-colorpin-page-transform.mjs>)：`transformNativeColorPinPageScript(filename, source)`。
- [原菜单受控适配](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-menu.tsx>)：Bar、Names、MenuActions、Locate、Downloads 五个 hook，原菜单 Status 与清除范围文案函数。
- [确版下载叶子](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-download.ts>)：调用既有 `resolveNativeMaterialVersion` 与 `session.artifacts.getFileRecordContent`；无领域写入。
- 单份 Context 与领域命令仍由 [native-colorpin-port.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-port.tsx>) / [controller](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-controller.ts>) 提供；这是另一位 agent 的 ownership，本子任务未改。
- root 统一注册 `autosave → ColorPinCourse → ColorPinPage → light`，菜单 hooks 与唯一 Provider 经 `/lcos/agent-ui.js` 同一出口导出；本子任务未改 server 或构建候选。

下载时先捕获原节点确切 Artifact / View / Revision；读取真实 Graph / Detail，再读取准确 FileRecord。缺文件、错误 View、hash 不匹配、途中换场景或引用时不替代其他版本。组里含非文件节点时，文件仍可下载，但结果明确写未确认项数；不把“部分下载”伪报为整组成功。多个文件只触发一次浏览器 ZIP 下载，避免依靠浏览器连续下载授权。

## 已验证

运行：`node scripts/native-colorpin-page.test.mjs`。

证据：[原组菜单与准确下载测试.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/原组菜单与准确下载测试.json>)。

1. 实际原 page 可解析、幂等；原 `w7/u7/bB/g7` 与所有非接缝 owner 保持字节一致；唯一 Provider 保留 `eG` 全部原树。
2. 两个实际原 bundle 按最终 server 顺序组合变换后可解析。
3. 实际 `v7/y7/原w7布局叶子` 执行：原菜单归属正确，非六色不丢失，未调用厂商命名或下载 hook。
4. 实际 `p7/g7` 执行：原当前节点 fitView / 高亮保留；身份拒绝后不移动且不关原菜单。
5. 生产 adapter 执行：准确命名 CAS、确认关系集合；unknown / API 换实例 / 引用变化拒绝新动作。
6. 实际 `m7` 执行：项目共享标识、清除影响说明、原 pending 核对行与禁写状态。
7. 实际原行内改名执行：rejected 保输入，confirmed 才关闭，pending 不重复提交。
8. 生产下载 service：历史 FileRecord、同名 ZIP 条目、人类扩展名与真实文件字节；没有读 Current 偷换。
9. 错 View / hash / 缺文件 / 迟到场景与引用变化拒绝；非文件成员明确计数。生产菜单 nativeReact 浏览器隔离 bundle 也已编译通过。

测试执行的是原函数与生产叶子，但渲染部分使用受控 hook / 元素描述器；**不等于完整 React 生命周期、真实 Core HTTP、候选浏览器下载或最终视觉通过**。未访问候选、未造材料、未写 Core、未重启服务、未运行模型。`.runtime` 中测试临时构建已清理，原 `reference/` 未改。

测试中抓到过压缩原代码 `return!x` 更换表达式后产生 `returnLCOSPinBar` 的真实运行错误；单靠 parse 会漏掉。已通过实际 `v7` 执行定位并修为括号表达式，最终九组重新全过。

## 仍要验的边界

- 等 root 统一完整构建后，在原顶栏 / 原节点菜单真实走 assign、改名、clear、丢回包核对、刷新及窄屏；下载需原浏览器手势确认，不以受控 `save` 注入冒充。
- 当前原成员菜单只列当前 Canvas 的原节点 occurrence。跨位置并未另造列表或乱用旧 resolver；已有材料位置入口继续归 `native-material-context/navigation`。若扩跨位置 Color Pin 入口，应沿其原导航与返回路径单独接线，本轮不声称已新增。
- controller owner 已将同场景预检 rejected 文案送回已有 message owner，并正在补 typed 409 竞争回归；page 没有为此另建 notice store。该控制层测试看对应 owner 报告，本子报告九组不冒充覆盖其后补变更。
- 旧 donor `color_pins` / CanvasConfig 名称没有粗暴迁入 Core；共享 entity / surface 标记是读取回显，节点色点新增 / 切换只改准确当前位置关系。共享关系批量移除以明确确认范围为准。
- 这轮只交上述原流程接线。小地图视觉、其他窗口与全工作区未接项目不因本报告销账。
