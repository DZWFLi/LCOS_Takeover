# Diagnostic: Verify Reorganize

检查：

- manual pins 未被移动（除非用户明确全部重排）；
- 只改了本次要求的 Presentation / Selection 范围；
- hierarchy/emphasis/grouping 读回一致；
- Artifact 未被误删；Presentation remove 仍能在其它 Surface 找到同一 Entity；
- 当前能力支持 live review 时，Keep/Revert 可用；否则 PASS8 snapshot/rollback 可用；
- 旧 Revert 不会覆盖用户后续新改动；
- Agent 没有输出/写入手工像素坐标布局；
- 新落位坐标可归入 policies/layout-recipes.md 的五类模板（层级/流程/网格/并排/扇形）；
- 若本路由发生改名（auto_title），新 label 符合 policies/node-labeling.md 的 1-5 词规范；
- reload 后最终状态仍成立。
