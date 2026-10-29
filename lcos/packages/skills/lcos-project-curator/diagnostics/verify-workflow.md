# Diagnostic: Verify Workflow

检查：

- Material 仍引用原 Entity；
- Step 是行动结构，不复制材料正文；
- 简单 sequence 没有 Serial operator；
- 分支/并行可读；
- 没有自动创建/dispatch Run；
- 写能力存在时 reload/read-back 保持结构。
