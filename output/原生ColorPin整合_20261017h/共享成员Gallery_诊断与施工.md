# 同画布共享成员的原 Gallery：诊断与施工

结论：这次 Gallery 打不开是**原 pile 的排他成员索引，与 Core Collection 的多对多成员关系冲突**。不是新 Color Pin Provider 回归，也不需要强点或移动旧节点。后补源码已经接到同一个原 Gallery，独立专项 **11 组通过**；尚未部署本次 Pile 后补源码做整页复验，旧失败不销账。

**后续统一构建复验更新（12:08后）**：最新PID32252已加载本文源码。原失败的同一个Collection C已0 producer POST打开原Gallery；新首投pending/unknown关整库→GET核对→原Gallery→刷新/1000px全链亦PASS（1POST/6GET）。未投影真实Artifact可在原Viewer阅读并Escape回同Gallery，0材料物化；但所选会话入口文件仍有语义披露，不能据机制通过认定会话阅读完成。准确实屏链接、Gallery密度与拖出/重排缺口见[本轮总报告](./本轮施工与验证.md)。以下独立测试与修前范围保留，不冒充该时已部署。

## 原失败事实

原整页记录：[report.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/原库关开真实页面/2026-10-17T06-25-47-330Z/report.json>)，候选当时 PID `28820`。

- Collection C 的原库关开、丢回包后 GET 核对成功：一次生产 POST，没有重复投放；pageErrors 和被测试阻断写入均为零。
- C 绑定到 `node-b3a80be6-8de9-4389-ab99-18859aef8ed7`，canonical 有两个成员；其中图像已有两个 View，所以当前画布 DTO 合计三个真实节点 occurrence。
- 原按钮可访问名称是“堆叠节点，共 0 个节点”。点击后 Gallery 超时；这与原 getter 和打开回调一致，不能把整轮报 PASS。
- 已亲看 [failure.png](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/原库关开真实页面/2026-10-17T06-25-47-330Z/failure.png>)；前景 C 已被选中且原工具带出现。

实际原 `Ri` 的规则是：每个 NodeID 只能属于一个 pile，同一成员出现多次时由字典序最小的 pile ID 获得。它不是按 Core Collection 关系分别给各 Gallery 一份成员。

| 载体 | 原 raw memberIds | 实际原 Ri / displayMembers |
| --- | --- | --- |
| A：`node-a7df…` | 3 | 0 |
| B：`node-2e0a…` | 3 | 3 |
| C：`node-b3a8…` | 3 | 0 |

原 `yFe.ae` 中 `S.length===0` 会直接返回。并且原 `LVe` 打开后还从 nodeLookup 的 `data.displayMembers` 再读成员；只换 folder face 或只解开一次点击条件，都没有修完整路径。

原函数位置均在 [course 原件第 818 行](<E:/Codex 项目/LCOS夺舍计划_20261013/reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js:818>)；压缩文件的准确列号和字符范围在 [共享成员Pile只读诊断.json](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/共享成员Pile只读诊断.json>)。只读脚本执行实际原 `Ri/qy/Pz` 和 `yFe` 回调，四项复现通过；倒转节点数组仍由 B 独占。Color Pin course 变换对这些 Pile owner 的字节没有修改。

## 本次接线

| 原路径 | 改接 | 边界 |
| --- | --- | --- |
| `BVe → wFe → LCOSNativePileDisplay` | 给受管 Core pile 的展示字段填充实际 source 成员节点，包装仍调用原 `Ep` | 原 `Ri/wFe` 不改；原物理成员的 position、parent、可拖动性与对象引用都保留。没有生成新节点或新 binding |
| `yFe → FVe.openGallery` | 原 session 额外捕获准确 Collection / Canvas / API；Core 集合零投影也可进入原 dialog 读状态 | 普通空 pile 保留原早退；没有新 modal / portal / Gallery provider |
| `LVe → LCOSUseNativePileGallery` | 复用现 `readCollection`，读取完整 canonical members、previews、bindings 与原 Canvas DTO；核 API / 载体 / 每个引用后交原 `Ep/_3` | 原 Gallery 不再从排他赢家的空数组获取其他 Collection 的阅读成员；迟到异场景不采纳 |
| 原 `tFe` 的 viewport 自然流内容槽 | 正常只一行集合名与“2 个成员 · 3 个位置”；不重复罗列正常卡片、不常驻重读按钮 | 只有缺失、未投影、不支持预览等异常才补轻量状态行；error / 异常 / empty 原处重读。没有独立卡片、边框背景、阴影或绝对定位检查器 |
| 阅读 / 大图 / 缩放 | 保留原 `tFe/vDe` 阅读通道与原几何计算 | 版本来自真实 occurrence 的准确 Ref，保留历史版本，不用 Current 替换 |
| 尚无空间位置的 available Artifact | 异常状态行“查看”先复用原 reader 重读，再发已有 `requestNativeMaterialView({projectId,artifactId,title})` | 这是 canonical entity 的真实逻辑读取；不伪造历史 revision / View，不先 project；其余实体不冒充 Artifact API |
| 原 Viewer 返回 Gallery | Core Gallery 的原 Escape / document click owner 让已有 `[data-media-viewer]` 优先处理；关闭后恢复原 Gallery Escape | 不另存阅读状态，不关闭 Gallery session，不新建 Reader；真实整页返回仍待 GUI |
| Gallery 内拖出 / 回堆重排 | Core 阅读槽不进入 donor 的排他几何手势；普通 donor 分支照旧 | 这是尚缺准确空间提交 / 回执 owner 的能力，明确留册；不是把整组功能禁用后报完成 |
| 成员增删、合并、展开 / 收起 | 原 Collection 菜单、原 Core 命令、原 Group / 空间适配继续保留 | `changeMember` 与 `toggleSpace` 没删。它们的正确分支仍走各自真实 owner，不借阅读打开来重 parent |

每个原 Gallery 卡片都引用本次准确读取的真实画布节点。没有把未投影成员伪造成文字 node 填卡片：这些成员使用同 dialog 状态行，并明确说明没有可核对的位置。音频 / 视频沿原媒体类型可预览；其他类型若已有空间位置但未接预览，会准确显示位置数量和预览缺口。

当前文件：

- [native-pile-ui.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:58>)：既有完整成员 reader；[366 行](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:366>) 展示投影；[398 行](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-pile-ui.tsx:398>) 原 Gallery 受控读取。
- [native-pile-collection-transform.mjs](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-pile-collection-transform.mjs:121>)：原 `yFe/LVe/tFe` 的可选接缝；`/lcos/native-pile-ui.js` 新增直接导出 `LCOSUseNativePileGallery`，不需要另挂 Provider 或 server route。

## 验证

[专项脚本](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/native-pile-gallery-members.test.mjs>) → [最终十一项报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/共享成员原Gallery修复测试.json>)。

1. 实际原 `Ri/wFe/aFe/FVe/IDe/kDe/vDe/D3` 字节不变，变换可解析且幂等。
2. 直接执行当前 server 的完整 26 模块源码变换链；两份真实原 bundle 可解析，未启动 server/backend。
3. 生产展示函数给三个受管集合各自恢复真实节点阅读引用；原 source、物理展示与普通 pile 不变。
4. 真安装 React + happy-dom 执行生产 hook：canonical 2 / occurrence 3；历史 `history-r1` 与另一个 View 的 `current-r9` 原样保留；正常 caption 没有重复成员列表或常驻核对按钮。
5. 音频真实 occurrence 保留历史引用；已有位置但未接预览的 Note 显示准确位置数，不假称“没投影”。
6. 缺失 / 未投影 / 全空 / 零投影都保留完整 canonical 状态，同原内容槽可 GET 重读，无假 node。
7. available 未投影 Artifact 的真实事件入口仅发 entity 请求，先三次 GET 核对；没有造 occurrence、没有 domain mutation。
8. 实际变换后 `yFe` 回调：Core 空集合开原 session；普通空 pile 仍按原规则不打开。
9. 实际原 `LVe/tFe` 回调：原 Ep/_3 snapshot、阅读动作保留；只隔开未接的 Core 空间拖动，普通原拖动正向对照仍执行。
10. 实际原 `pe` 回调：已有 media Viewer 在场时 Gallery 不抢 Escape；Viewer DOM 关闭后原 Gallery 关闭行为恢复。点击放行仍在原 document owner，没有新增监听层。
11. API 在“查看”预检期间晚换，不打开任何材料；旧 session 不采纳迟到读取，受控传输全为 GET。

已有回归也通过：`native-pile-collection-transform.test.mjs`、`native-pile-ui.test.mjs`、`native-pile-actions.test.mjs`。旧变换测试现在明确区分“ordinary 回调去掉显式 Core 接缝后严格还原”与“Core 额外阅读接缝”，没有继续声称改过的函数原字节完全不变。

[严格目标类型检查](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生ColorPin整合_20261017h/PileUI目标类型检查.json>) 也通过：实际 `native-pile-ui.tsx` 使用真实安装的 React 类型，`Read.galleryCandidates/occurrences` 明确声明，`nodes` 明确为 `Row[]`；只给既有 Folder 实现留一个类型边界，未跑全仓 tsc。并未用 esbuild 的可转译结果代替类型检查。

这些证据是原源码执行、真实 React 生命周期与受控 Core DTO；**不是候选整页通过，也不是已修复 Gallery 内空间拖出 / 重排**。没有 candidate HTTP / 浏览器 / Core 写入、没有新材料、没有 build/restart 候选、没有模型调用。独立临时 bundle 已清理。

## 留册与下一步

- root 统一加载后，使用已有 A/B/C 逐个单击原 pile，验证同原 Gallery 的卡片、准确 Ref、两成员 / 三位置及 reload；不要再造集合规避冲突。
- 真实空集合、缺失与未投影需要同 dialog 稳态 GUI；本轮受控生命周期已覆盖，未假冒主实例证据。
- Core Gallery 拖出 / 回堆重排需要单独打通准确 occurrence 的空间提交与回执。若产品要让同一个 Artifact 在多个 Collection 中独立排布，应沿既有 additional View / projector 语义建立各自 occurrence；不能重 parent 或搬动被其他 Collection 使用的旧节点，也不能改 Ri 让它同时拥有两套坐标。
- 原 Core 菜单的成员增删，以及已有唯一 Group / 展开空间分支继续由原 owner 验证。这次阅读修复不替它们补签验收。
