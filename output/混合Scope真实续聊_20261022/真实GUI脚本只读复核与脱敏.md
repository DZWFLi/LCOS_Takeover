# 真实续聊页面脚本复核

结论：脚本最多放行两条不同 messageId 的原续聊消息；原历史与混合 Scope 正文都有具体断言。报告出口已补脱敏。这次只做本地检查，没有访问服务、启动浏览器或调用模型。

- 原提交只允许本次新会话、本次 operation；消息最多两条，重复 messageId 或第三次消息在放行前拒绝。结果未知不会自动重发；失败后按原 operation 和 messageId 只读回查回执及 timeline。
- 新建必须产生不同 canonical target，保留 requestConnectedConversationId；新旧 session 不得相同。
- 原 ConnectedConversation、session、归档 Artifact／View／revisions 和 timeline 在创建后、发送后逐字比较。
- 每条消息都核根／子 Scope、两层集合、附注原文、原人工对话两条消息、Run 原状态和标题、工作集真实成员、View 精确版本和正文。
- attach/send 回执与绑定 owner 的外部 session、transport session、provider、thread、agentlet 一致；原 adapter 不投影 runtimeScope，浏览器不会补造此字段，实际 transport 入参由 Host 审计核对；原页面无需刷新即可出现两条回复，不得新建普通 Run 或窗口。
- 仅创建、恢复、发送三条长操作的页面等待延长到 195 秒；其他界面等待保持原设置。
- 未知 POST 的正文不记录；所有 JSON 报告和错误输出均脱敏凭据字段、嵌套 JSON、Bearer、常见 API key、凭据 URL 和日志赋值；截图屏蔽凭据输入及明显 key 文本。

本地检查：脚本语法通过；`--verify-redaction-only` 通过，明确为 0 请求、0 模型调用。真实发送仍等新 Host 的地址和 PID，不能把这份复核当成实发回执。
