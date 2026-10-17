# Failure: Destructive Layout

症状：用户手动排好的位置被重排打乱。

修正：rollback（如果已 apply）；未 apply 则修改 proposal 保留 pins。

防复发：reorganize 默认 preservePinned=true；任何"全部重排"必须用户显式要求。
