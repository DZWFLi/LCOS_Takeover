# Interaction / Browser Loop

## Pointer discipline

- 拖拽阈值约 3–5 screen px；过阈值前不要过早 capture pointer。
- 完成 drag 后抑制 trailing click。
- 高频 pointer/viewport 用 transient ref / rAF；不要每帧写 Project business state。
- Node move / resize 时 connected edges 与必要 overlay 连续更新。
- Text input focus 永远赢过 Canvas shortcuts。

## 每个 slice 的真实循环

```text
reproduce
→ implement one slice
→ run app
→ execute realistic pointer/keyboard sequence
→ inspect Console + screenshot/current viewport
→ reload/persistence when relevant
→ fix largest felt discrepancy
```

不要一次堆很多交互再统一验证。

## 常用 stress checks

按本次修改挑相关项：

- 快速选择 20 次；
- 多方向拖节点 10 次；
- click→立即 drag / drag→立即点别的；
- marquee + Shift toggle + group move；
- 文件/对象 Drop 的 release-coordinate；
- relation 创建/删除/重连；
- resize 与 edge/overlay follow；
- camera pan/fit/focus；
- Agent candidate change 的 Keep/Revert；
- reload 后 Selection 以外的 canonical surface state 不丢。

任何明显 lag、jump、误 click、stale edge、坐标错位、旧 Revert 覆盖新状态都算失败。

## 验证比例

日常 slice：相关 type/test/smoke + 真实浏览器。
里程碑/稳定提交：完整 lint/typecheck/unit/build/smoke/browser Golden Path。
