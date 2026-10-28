# 混合 Scope 当前对话真实页面验证准备

日期：2026-10-22。

## 已完成准备

- 经同一隔离进程的原 Core HTTP API 新增纯文本混合 Scope、两层 canonical Collection、纯文本 Workspace 和子 Scope，复用真实文本 View、附注、已链接人工对话、已有 planned Run。
- 原图片 Scope、所有旧 Artifact／Revision／View／Note／FileRecord 完整读回保持，原 Run 为 planned、attemptCount=0。
- 新 Workspace 的真实 membership 只有文本 View；尚无 canvasId，未伪造画布地址。其内容读取与现场进入是两条独立能力，未打开现场继续记账。
- 原 facade 未映射 graph PUT；原 Core 的 PUT 又因已有 Run 外键拒绝并回滚。最终使用原有 POST graph mutation batch 的 baseVersion 和事务，仅 upsert 两个新增 Scope，不重建图谱。
- 实际地址、准备意图、失败回执和成功回执完整记录在「准备回执.json」；数据地址见「fixture.json」。

## 能力边界

- 普通任务沿 `CoreCollaborationClient.delegate → CoreRunClient.createRun` 只创建 `created / planned`，执行属于独立 dispatch，本轮禁止。
- 人工导入且已链接对话的真实 `collaboration-session` 为 `canSend=false`、`canResume=false`；尚未绑定可发送的续工 owner，续聊操作列表为空。
- GUI 不强点 disabled、不注入 shell setter；续聊完整发送由原服务与本地测试 transport 验证，不能称为当前离线页面已发送成功。

## GUI 验证方案

1. 原 Library 的「用于当前对话」只加入一个 Scope 引用，所有异构成员完整保留。
2. 原芯片打开原 Library 页面并逐层进入／返回，核对原输入、光标、去重和移除。
3. 普通任务可通过原提交按钮创建一次 planned Run，并检查真实 Manifest 的全部异构来源，不 dispatch。
4. 原菜单进入 continue 输入，验证完整 Scope 取用、芯片查看、返回和原 receiver/message/operation，真实离线时保留不能发送状态。
5. 原含 PNG 的 Scope 整体拒绝，不加入可读子集；草稿与成员保留。
6. 窄窗原页面与引用芯片仍可达。

GUI 脚本：`scripts/native-mixed-scope-browser.mjs`。待根任务构建和确认 PID 后运行，不将准备成功当作 GUI 验证通过。
