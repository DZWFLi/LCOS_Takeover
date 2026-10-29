# Recipe: Context → File Organization Plan

生成计划时至少给出：

```text
from
proposed to
action: keep | move | rename | mkdir | needs-confirmation
reason
risk
source/FileRecord ref（可用时）
```

高风险依赖、歧义、跨盘、删除默认进入 `needs-confirmation` 或 `blocked`。

没有正式 Core apply 能力时只返回计划，不执行 shell 文件操作。
