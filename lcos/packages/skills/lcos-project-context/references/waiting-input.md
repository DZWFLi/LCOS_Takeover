# 真实 waiting_input

任务缺少一个必须的回答时：

```text
request_lcos_user_input(
  runId,
  requestId,
  question,
  options?,
  allowFreeText=true,
  contextVersion?
)
```

这不是失败也不是重试：保持同一个 canonical Run 与首选 provider 会话。
用户可自由文本、选项或两者都答；没有自动取消超时。

用户回答后，同一个 Bridge Task 重新入队。恢复同一个首选项目会话，读
`get_lcos_run_input_request` / 任务 `inputResponse`，然后从冻结的
ContextManifest + 明确回答继续执行。
