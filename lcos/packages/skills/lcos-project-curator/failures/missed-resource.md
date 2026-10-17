# Failure: Missed Resource

症状：用户马上把漏掉的文件重新拖进来。

修正：补导入该资源并建立来源关系。

防复发：ingest 前检查 capture pending + source 范围是否覆盖用户给的全部输入。
