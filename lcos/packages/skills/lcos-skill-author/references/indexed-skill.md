# Indexed Skill 选择与写法

只有同时满足以下条件才用 Indexed Skill：

- 一个 Skill 内有多个高频 intent；
- intent 需要的规则/工具明显不同；
- 全部常驻会浪费上下文或造成行为污染；
- 能用稳定 trigger / deterministic resolver 区分。

优先参考 `lcos-project-curator` 当前结构。

PASS8 resolver 只支持现有 `skill.index.yaml` schema；除非同步升级 `lcos skill resolve`，不要擅自加运行时不认识的字段。

Indexed Skill 必须验证：

```text
不同 intent 的 loaded modules 不同
无跨 intent 污染
conditional_load 真按条件加载
budget 可观测
```
