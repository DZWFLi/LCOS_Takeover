# LCOS 结构化错误的一次修正规则

仅对以下可逆、可重新读取的错误自动修正一次：

- `ACTIVE_CONTEXT_CONFLICT`
- `STALE_GRAPH_VERSION`
- `TARGET_NOT_FOUND`
- `REVISION_NOT_FOUND`
- `TARGET_REQUIRED`
- `TARGET_FORBIDDEN`
- `CONTEXT_ITEM_NOT_FOUND`
- `PROVIDER_SESSION_STALE`

修正步骤：

1. 重新读取当前 Project、ActiveContext、Target 和 Revision 身份。
2. 保持用户原始自然语言目标不变，只替换过期 ID、version 或合法的目标组合。
3. 再调用一次 `validate_lcos_agent_plan`。
4. 第二次失败后停止自动修正。存在真实歧义时使用 `request_lcos_user_input`，否则返回人话错误。

以下情况禁止自动修正：删除、覆盖、权限扩大、路径越界、未批准 Skill 执行、外部文件冲突、多个同等 Target。
