# Color Pin 前端：原色点、标记与分组

本轮结论：节点侧已接回 TapNow 原色点和原分组读取链；源码及定向测试通过，**尚不能写成候选整页通过**。本分项未构建、重启或访问候选，未运行模型。最终 production 已冻结，root 将对 PID28820 的前端做 UI-only 重编后统一实屏验证。

| 原入口 → 原容器 | 接入动作 → 返回 | 本轮保留与边界 |
| --- | --- | --- |
| `Dg → Hie → jie/Lie` 原节点工具色点 | 当前节点准确 View → 原 typed ColorPin client → 原 Popover 标记回显 | 原按钮、色点、tooltip、选择环、焦点与动效；没有旧 ColorPinHud、新窗口或第二条工具带 |
| `Yie` 原色点命令 | 受管节点交 Core；普通 donor 节点保持原路径 | 受管节点不写旧 `data.color_pins`，未确认的受管节点不会偷偷回落本地假成功 |
| `n5 → Iie/Gie` 节点标记 | Core snapshot → 原 marker/移动色点 | 保留多色及已有非六色；共享 entity 标记可以回显，但节点按钮只切换准确 View 的标记 |
| `pBe → 原 Mie/KT / 小地图` | 同一 Core snapshot → 原形状 groups → 原高亮与筛选 | 原 `Foe` 指纹、`Mie/KT` 与小地图 owner 不改；分组包含真实 definitionId、准确 membershipIds 和共享影响计数 |
| 原 Popover 状态区 | 未知结果 → “核对标记结果” → GET → 同一原处 | 忙时禁点；unknown 可关闭重开并保留核对，不自动重发写；失败中文原处呈现 |

完整 page 顶栏、组菜单、行内改名、clear、定位和下载由同一 Provider 连接，见 [ColorPin原组菜单.md](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/ColorPin原组菜单.md>)。唯一 Provider 由 page `eG` 公共祖先包裹，course/page 均从 `/lcos/agent-ui.js` 取同一 Context；本节点分项没有重复挂 Provider。

## 身份与真值

- Core 的 definition/membership 是唯一领域真值；控制层只持当前读取投影和未确认 HTTP 结果，不新增 Pin 数据库、Canvas 写入、history 或持久账。
- 节点新增颜色必须同时核真实 Project/Canvas/Workspace/API、唯一投影 binding、节点 `id/data.id`、Artifact/View/Revision 及 Scope 归属。真实 ArtifactView 没有 `projectId` 字段，归属通过其真实 Scope 与 Artifact 校验，不能凭想象补字段。
- 同一 Artifact 在不同 View 的节点不会一起被节点色点改掉。旧 entity 标记仍向准确 occurrence 回显；按钮按压态只表示当前位置的 View membership，避免“共享色点看似选中，点击却新增另一笔”的错觉。
- palette 为原六色加 Core 现有自定义颜色，不滤掉旧数据。group 的显示色键与真实 definitionId 分开；clear 用用户确认的准确 membership 集合重读核对，不删节点、definition 或其他画布关系。共享 entity/surface 影响交原确认框说明。
- 未绑定到准确 View 的节点不新增一个只能报错的可点击色点；普通 donor 原策略和旧路径仍保留。

## 这轮确实抓到并修掉的问题

1. 真实 Core 对接发现 View 无 `projectId`；已按真实 Scope 归属修正。没有改 Core schema。
2. typed 409 原 CAS 拒收曾被当 unknown 永久锁住；现明确请求 4xx 拒收显示中文并允许下一次有效显式操作。503、断网、写后读回失败仍 unknown，不冒充失败或成功。写成功后 GET403/404 也不能按“写未接收”解锁。
3. 旧后台 GET 晚到曾把刚写成功的 marker 抹回旧快照；写入开始后旧读取失效，核对与写入期间合并普通刷新。unknown 状态也不因旧 GET 晚到被清除。原失败证据：[旧GET迟到_源修前失败.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/旧GET迟到_源修前失败.json>)。
4. 同 Project/Canvas/Workspace 换 API 曾隐藏旧 unknown、允许第二写。现只有 held/working 按同位置匹配；实际 current/read/adopt 仍严格核 API。旧 POST 在途时新 API 禁第二写；settled unknown 仍可见，由新 API fresh GET 核对原准确 target/membership/label，绝不向旧 API 重发。原失败证据：[同现场换API_源修前失败.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/同现场换API_源修前失败.json>)。

## 验证与归档

| 执行 | 结果 | 证据范围 |
| --- | --- | --- |
| `node scripts/native-colorpin-node.test.mjs` | 13 组 PASS | 实际原 Dg/Yie 执行、非接缝 owner 字节保留、生产 model/controller、准确 View/多色/自定义色、shared entity、未知 GET、API 竞争、迟到 GET、写后读失败 |
| `node scripts/native-colorpin-node-core-peer.test.mjs` | 4 组 PASS | 独立临时真实 Core + 原 typed client/proxy/MutationSafety；真实提交丢回包、409 CAS 竞争、503 后 GET 核对；非 Pin Graph、三 Canvas 和 Runs 不变 |
| `node scripts/native-colorpin-popover-component.test.mjs` | 3 项 PASS | 实际原 Hie/jie/Lie/Gie/Iie/Oie 在 React 执行；六色加自定义色、一次点击一次 dispatch、unknown 重开/核对、Escape 回焦及 busy 原按钮 |

报告：[节点回归](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/节点原入口与headless回归.json>)、[最新真实 Core](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/节点真实Core对接/2026-10-17T06-28-46-399Z/report.json>)、[原 Popover 实际组件](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/原色点Popover实际组件.json>)。

Popover 测试使用受控 Popover/button/translation 叶子，**不是实际 Radix 或完整候选 App**；目标 Core 测试不是整页 GUI。没有 full tsc、Pin Undo/Redo、跨重启 pending 保存、最终窄屏布局或全部跨位置导航完成声明。Provider 卸载后暂存 unknown 不持久化；跨 Project/Canvas 不把旧结果误投新现场。既有 entity/surface 标记读取保留，不凭此宣称已新增所有非媒体节点的当前位置编辑能力。小地图视觉及全区其他条目继续保留原审查状态。

代码入口：[原 course 定点变换](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-colorpin-course-transform.mjs>)、[准确投影模型](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-model.ts>)、[读取与未确认结果控制层](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-controller.ts>)、[单份 Provider/原 UI 接口](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-port.tsx>)、[原 Popover 局部样式](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-colorpin-ui.css>)。
