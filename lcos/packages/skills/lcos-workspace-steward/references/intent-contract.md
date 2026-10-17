# Workspace Steward Intent Contract

## Input

```text
projectState
surface: main | context | workflow
componentSemantics
selection / focus
manual / pinned layout
active state
coarse geometry
```

## Output

```text
intent
targets
reason
```

`intent` 只能来自：`preserve`, `foreground`, `cluster`, `sequence`, `make room`, `deemphasize`, `suggest region`。

## v0.1 能力映射

| Steward intent | 当前可执行映射 | 结果 |
| --- | --- | --- |
| `preserve` | 不产生 SurfaceOp | 明确保留当前 Presentation |
| `cluster` | `organize(hint: cluster)` | 为显式目标创建绑定的 Region Ghost |
| `sequence` | `organize(hint: sequence)` | 为显式目标创建绑定的 Region Ghost |
| `suggest region` | `organize` / `focus-region` | 创建 Region Ghost，不改目标成员关系 |
| `foreground` | 无通用 z-order / emphasis op | 只返回 Proposal / blocked |
| `make room` | 无安全的批量避让 op | 只返回 Proposal / blocked |
| `deemphasize` | 无通用 emphasis op | 只返回 Proposal / blocked |

Context 的 `show-structure` / `show-evolution` 与 Main 的 `prepare-workbench` 是已有组件意图，但不等同于上述布局动作；仅当用户意图明确要求对应组件时才能选用。

目标集合采用显式 User / Agent Selection；Workspace focus 只能作为缺省候选。它是当前 Presentation 的对象集合，不是 Project Truth membership。

几何层负责确定位置和尺寸，SurfaceOps 负责校验。任何 pinned 对象必须保持原 bounds；无法安全安排时返回建议而不是强行移动。只有 Ghost 经 Keep 后才允许持久化，Revert 必须保持原 Presentation 不变。
