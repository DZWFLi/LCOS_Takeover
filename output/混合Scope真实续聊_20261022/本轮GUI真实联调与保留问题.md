# 本轮 GUI 真实联调与保留问题

结论：原新建菜单 → 自动连接 → 原栏选中新会话 → 整份混合 Scope → 连续两条真实回复，已经跑通。两条消息使用同一 canonical 会话、同一 operation、同一外部 session／thread／agentlet；没有新窗口、普通 Run 或页面刷新。

## 真实结果

- 成功 operation：`conversation-blank_new-2e8b7219-78d3-410d-9983-96d21e12dbcd`。
- 成功会话：`connected-conversation-b0b62164-091e-4656-b495-40da78541bf0`。
- 外部 session：`36c961f9-efa3-45db-ae3b-e401f7a55c83`。
- 两条 message：`88b8132f-b2bb-4503-b3df-78a035913f14`、`10e08407-9ca5-4b8f-a320-aa94ff315440`。
- 每条均有完整 Scope 的 17 条成员读取证据，保留两层集合、附注正文、原人工对话两条消息、Run 状态与标题、工作集真实成员、View 精确版本正文；attach 为 attached，send 为 sent。
- 第一条真实回复逐字列出集合、附注、历史对话、Run、工作集的原标题；第二条为“真实续聊验证二”。正文附加证据与模型回复证据分开保存，不把收到引用等同于模型理解了全部正文。
- 原人工历史、归档、集合和执行投影未改。旧附件失败 operation 和旧恢复失败 operation 完整对照不变。
- GUI 的逻辑 provider 标签仍为 codex；实际 ACP／模型来源由 root 的真实 Host 审计确认，浏览器不凭标签猜模型，也不归档凭据。

[成功报告](</E:/Codex 项目/LCOS夺舍计划_20261013/output/混合Scope真实续聊_20261022/真实页面/2026-10-22T17-02-00-551Z/report.json>) · [两条回复截图](</E:/Codex 项目/LCOS夺舍计划_20261013/output/混合Scope真实续聊_20261022/真实页面/2026-10-22T17-02-00-551Z/04-real-same-conversation-reply.png>)

## 本轮修复

1. 原会话选项接受请求后自动执行已有恢复动作，再读取真实绑定结果；新建必须新 target，续用必须原 target，未知结果不盲目重建。
2. 同 canonical 续用确认后，fresh canSend 验证通过才调用原 Shell 准备动作切换 operation，沿原输入与原页面继续。
3. 原菜单错误要求非空 executorId，拒绝了 Core 合法的空字符串；现在只接受字符串，其他项目、schema、provider、地址等检查保留，不伪填执行器。
4. 原 Host 对省略 mode 与全文证据的比较不一致，由后端修复；保留原单 Scope 地址，不展平为材料。
5. 成功反馈固定“等待会话回应”会在回复后残留，现精确改为 typed receipt 实际确认的“消息已提交”，反馈仍保留。
6. 浏览器工具把 async waitForFunction 的 Promise 当成成功，改为有期限的 Node 只读等待；只读报告统一脱敏，未知只按原 operation／messageId 回查。

本地原接线 9 组、真实 bound 列表 decoder 3 组、等待与脱敏检查均通过。真实脚本独立只读审阅发现的两项缺口已修复复核。

## 真实失败仍保留

- 旧 `edd6…`／`c81…`：一次附件明确失败、没有 provider prompt，输入与单 Scope chip 保留；没有冒充成功或覆写失败回执。
- 旧 `c106…`：原继续现有会话确实尝试恢复旧 native，因外部会话不能恢复而明确失败，0 条消息；没有 fallback 新建。本次成功是随后明确的独立新建动作，不能称旧 native 恢复成功。
- 原 diagnostics 刷新会短暂显示准备状态，仍记为 loading flicker；本轮未改状态机。
- 健康会话的 operation 只有 cancel_request 时，原界面仍显示“会话恢复／取消该操作”卡片；稳定截图确认是真实 UX 残留，尚未施工。
- 两个会话默认标题相同，原菜单可选但辨识不清；测试通过原列表可见顺序选择后核对真实 receiver ID，没有隐藏 setter。

caption 更新后另做 0 POST 只读核查：原菜单选成功会话，三次连续 ready 样本后两条历史回复仍可见，没有长期“正在准备”。新页重置了原 done feedback，因此不以该截图声称原 done 反馈会自动更新。全 POST 阻断导致的同步失败 toast 单独归因于测试隔离。

[只读报告](</E:/Codex 项目/LCOS夺舍计划_20261013/output/混合Scope真实续聊_20261022/真实页面/2026-10-22T17-10-53-572Z/report.json>) · [稳定截图](</E:/Codex 项目/LCOS夺舍计划_20261013/output/混合Scope真实续聊_20261022/真实页面/2026-10-22T17-10-53-572Z/05-existing-conversation-stable-read-only.png>) · [旧恢复失败记录未改写](</E:/Codex 项目/LCOS夺舍计划_20261013/output/混合Scope真实续聊_20261022/旧会话恢复失败记录未改写.json>)
