# 真实续聊｜原新建与恢复链审计

本轮状态：只读审计与脚本准备，尚未创建真实会话、尚未请求模型。

## 真实原链

1. TapNow 原标题菜单「新建对话…」进入现有 `ConversationContinuationControls`。
2. `blank_new / selected_context` 经 `CoreCollaborationClient.newSession` 写同一 continuation journal；原回执仅表示请求已记录，不表示外部会话已经创建。
3. 真正外部副作用由原 `recover_external` → provider `createSession`，再由 `recover_bind` → `continueExisting` 和 `confirmContinuationCoreBind` 原子绑定确认。
4. 原 `useComposerContinuation` 只有在真实 `canSend=true`、原 operation 有 `externalEvidence` 后，才准备原 messageId / operationId。原提交调用独立 `collaboration-send`，不退回普通 Run。
5. 成功发送由原 Shell 轮换 messageId；同一会话第二条应保持 conversationId / operationId 不变。

## 必须先修的具体缺口

- `ConversationContinuationService.#recoverBind` 原来一律用源 `row.connectedConversationId` 作 fallback。
- `SqliteMetadataRepository.confirmContinuationCoreBind` 在新 provider ref 下会更新已有该 ID 的 `conversation_ref`，并复用已链接 manual session。空 originMeta 不足以阻止历史被重绑定。
- 因此空白／精选／分支新建应分配新 canonical target，源 ConnectedConversation、Session、Message、Artifact、Revision、View 全部保留。继续现有会话才可复用原 target。
- `#recoverExternal` 原默认 `createSession` 还覆盖 continue_existing，不能把这种额外新建当作真实恢复原 session。必须按 mode 核对原语义。
- 原 GUI 的 onSubmitted 只刷新 continuation，右栏又仅显示当前 target 的 operations；journal 绑定新 target 后会从旧 target 消失。应沿原 NativeCoreChatPanel.choose 选中新 canonical target、准备原 Composer，不另开窗。

## 测试建议

- Core：blank_new / selected_context 产生独立 canonical ID，源手工历史逐字不变；continue_existing 保持原 ID 且不重复 create；未知 create 只 reconcile，不再次创建。
- GUI 主流程：原菜单、原会话选项一次确认应接完整原服务创建／绑定流程，绑定后自动选新 target。恢复按钮用于真实失败恢复，不要求用户平时逐个操作内部步骤。
- 实发：Scope 仍是一条完整引用；两条原提交保持同 conversation / operation，不同 messageId；原 frozen contextResolution 包含集合、附注、对话、Run、工作集等全部成员；原栏实时出现 assistant 正文，无 reload，无普通 Run 创建。
- 恢复：未知结果保留原 messageId 和冻结引用，只通过原核对／重试流程；不能以 fake transport 或直接 HTTP 写入冒充 GUI 实发。

## 脚本草稿

`scripts/native-live-scope-conversation-browser.mjs`

默认仅输出准备计划，模型调用为0。实际执行必须由根任务给出真实 Host 和对应页面地址，再显式传入 `--execute-live-ui --send-real --expected-pid=...`。可选 `--mode=blank_new|selected_context`；原恢复控件专测可加 `--recover-via-original-controls`。脚本不通过隐藏 setter 或直接 POST 完成 GUI 步骤。
