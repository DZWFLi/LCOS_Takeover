# Failure: Workflow Overengineering

症状：简单 A→B→C 被做成运算符、配置表或自动化 DAG。

修正：Material 与 Step 分开；简单顺序只用 Edge；默认只搭不执行。

验证：简单 sequence 中不存在 Serial operator，且输入仍是原 Entity。
