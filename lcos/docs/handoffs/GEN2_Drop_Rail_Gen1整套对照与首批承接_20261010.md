# Drop / Rail：Gen1整套对照与首批承接

本轮三路代码核对、根代理Gen1与Gen2真实浏览器、定点修复和验证已归档：

[完整交付、代码采用、原卡来源、GUI证据与真实剩余项](E:/TRAE项目/LCOS0.1收口/review/LCOS_Gen1_Drop_Rail整套对照_20261009/07_整合交付与大白话结论.md)

已修：右携带4px边界、Rail接收时不扩大、同一目的地图标/Peek共享身份、Context/Workflow画布来源保留类别、真实成员单canvas地图。

验证：17文件119测试；目标lint、diff-check、最终tsc+production build通过；真实投送Core applied、重复投送already-member、Source与所有节点坐标不动、普通Move经过Rail不触发投送且原生Undo恢复、测试change-set已revert并reload回原3成员。

后续用户明确选择T2收录规则，已落地并实测：长期现场/会话自动，集合等右拖到＋后加入；岛94→136px。pointer实时重排已生产接线，邻项让位、松手Core保存、reload、Esc不写均验证。自己的新增导航ref与顺序已用正式CAS恢复。后续组合5文件44测试、含tsc的生产build通过（27.42s）。

尚未整套完成：Atlas/工作窗口/Assembly整体Collection取用、完整跨区矩阵。未存入canonical order的自动长期现场仍受原卡durable reorder边界约束，不为排序静默固定候选。

只有首批明确缺口闭合，不能以本回执替代全部Drop/Rail体验。未commit/push，保留并行与既有未提交修改。没有后端施工、数据库迁移、第二canvas/geometry/导航truth或新增泛化gate。
