# 原生框架优先与 Collection 路线纠偏

## 结论

用户要的是在 TapNow 原有框架、样式和成熟交互上长出 LCOS，不是把 GN2 界面整体放进 TapNow。此前把“接通 Core、复用当前 GN2 代码”当作主要进度，漏掉了“优先复用 TapNow 原组件”的要求。Collection 的卡面和排列路线确实偏了。

本次先停止图片标题等续批扩展，只读复核两边实现。未启动新的 GUI 或服务，未部署旧 17881；前一批未验收代码保留为实验，不当成已完成的产品功能，不擅自删除。

## 当前实现哪里偏了

- [native-collection-ui.tsx](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-ui.tsx:559>) 实际渲染 LCOS 的 `CollectionNodePresentation`，后续是 `CanonicalCollectionView/Gen1CollectionFace` 与 Gen1 文件夹样式；不是 TapNow 原堆叠卡面。
- [native-collection-space.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-space.ts:528>) 采用 GN2 的 `collectionHostMemberPlacement/planNodeFramePlacement`，再翻译为原画布操作；不是采用 TapNow 本来的排列算法。
- [native-collection-frame-projection.ts](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-frame-projection.ts:54>) 把 GN2 frame 映成原 group，并设 `createdBy: client / layoutType: none`，主动避开原 GroupNode 自动排布。

原 ReactFlow、部分 group 外框、Canvas API、O8 历史和保存链确实保留了。因此不是完全重做一张画布；但“保留画布内核”不能算成“复用了成熟 Collection 交互”。此前的构建采用计数和通过测试只说明那条接法能运行，不说明产品方向正确。

## 原件里已经有的机制

以下来自本地安装包 `course-api-base-url-CifxI1ia.js` 的实际 AST/源码，Root 已独立核读，不是借 GN2 同名组件推断。

| 原生机制 | 已查实的行为 | 应如何复用 |
| --- | --- | --- |
| `PILE → yFe` | 真实堆叠节点，读 `memberIds/displayMembers`，有卡面、工具条和展开入口 | 以原卡面为主，补 LCOS 身份与少量操作，不再默认换成 GN1 文件夹 |
| `Ri / wFe` | 建立 pile 与成员对应，折叠时让原成员在显示层隐藏/不可拖选 | 沿用原成员呈现机制，不另造集合显示栈 |
| `FVe / D3 / LVe / tFe` | 点击打开现成 gallery；session、portal、成员布局与交互已有实现 | 优先复用原展开内容、成员操作与布局，而非挂完整 GN2 工作窗口代替 |
| `vMe / xMe / Lz` | 原创建、加入及合并堆叠的变换/检查 | 对照 Core 成员操作接入，保持原手感 |
| `NVe / TVe / wMe` | 原解堆、移出成员与落位；`NVe` 会删除 pile 载体 | 可复用排布计算，但不能把“展开”直接等同于“删除 Core Collection” |
| `GROUP → i3` | 另一条主画布分组机制，已有标题与 grid/horizontal 布局入口 | 与 PILE 区分使用，作为主画布展开容器的候选，不再先禁掉其布局 |

原 PILE 默认支持 image、video、audio、text，源码 `Iz` 明确列出四类；默认至少两项、最多50项。它不是任意 Core 实体容器：原成员解析会跳过 PILE，移出后不足两项会自动解堆，原Pile名称硬编码为 `Pile`，创建数据只有 `memberIds`。Core Collection 的空集合、单成员、嵌套、未投影成员与跨现场引用不能因此丢失。

用户描述的小画布对应独立 gallery 视口。源码 `DDe` 有自己的 camera、pointer 平移及 Ctrl+wheel 缩放，不能直接断言相机完全锁死，也没有证据把它称为第二个 ReactFlow。要改的是“展开所在的空间”，不只是换 CSS。

## 改正后的接法

1. **先用原件。** 原堆叠卡面、缩略图、菜单、命中、拖入拖出、展开和排列先保留；逐项说明真正缺什么，再补差异。
2. **Core 接在后面。** Collection ID、命名、成员、Artifact/View/Revision/FileRecord 和持久化沿已有领域接口；`memberIds` 是当前画布投影，不替代完整 Core 成员真值。
3. **主画布展开只改空间接缝。** 首选验证“PILE 的折叠卡面/成员交互 + GROUP 的命名/主画布排列”，两种呈现仍对应同一个 Core Collection，不复制集合真值。能否复用原 gallery 排布计算或 GROUP 布局，要实测后决定；保留同一主相机、原选择/拖动/历史。不能直接调用会删除 pile 的解堆动作，也不能通过再挂一套 GN2 Canvas 达成。
4. **GN2 保留能力，不默认保留整块界面。** 成员语义、上下文/方法引用、执行与 Review 能力可继续用；现 GN2 卡面、planner 和展开控制先作对照，不默认进入最终呈现。原件确实不适用的部分再论证最小新增。

这套原则也适用于文字节点、Agent、Context/Workflow：先核 TapNow 的原 body、菜单和承载位，优先向原入口增加 LCOS 能力，不再以“搬了多少当前 GN2 文件”衡量夺舍进度。

## 下一步验证范围

先做一个原生 PILE 的最小对照，不继续铺功能面：记录原卡面、展开、成员移动和解堆；再接一份合成 Core Collection，验证显示、命名、成员同步、关闭重开与刷新。随后单独比较“原 gallery 展开”和“主画布展开”的相机、坐标、选择及撤销差异。

验收看原交互有没有真的沿用、最小新增是否必要，不看资源清单数量。新方案本次尚未实施或 GUI 验收；旧 Core 身份/文件保护和原历史安全检查继续保留，不为换路线删保护或迁移真实数据。

收工只读核对：旧17881仍为原PID49552及原命令行；Graph、Presentation、唯一Run、三Canvas与10份文件完整字节和本批开工前精确相同。没有新图片标题GUI进程或隔离实例需要清理。
