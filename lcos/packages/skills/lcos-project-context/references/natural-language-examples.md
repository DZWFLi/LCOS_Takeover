# 真实自然语言样例（给 Skill/Agent 决策链开发）

> 这些样例来自用户本人在 MVP 对话里说过的话，期望行为按 20260804 拍板规则推断；
> 开发可据此校准 Target/Context/Intent 识别，有出入以拍板文档为准。

## 单 Target + 修改（revise）

1. “帮我给这段脚本加一句结尾” → Target=script，Context=无，intent=revise
2. “把这份 brief 的语气改得更专业一点” → Target=brief，intent=revise
3. “给 feedback 里提的问题补上解决建议” → Target=feedback，intent=revise

## 带参考的修改（revise + Context）

4. “参考 reference-1 的色调，把这份脚本的描述改一版” → Target=script，Context=[reference-1]
5. “结合 brief 和 notes，重写这段介绍” → Target=介绍节点，Context=[brief, notes]

## 自然语言上下文操作（Context 指令）

6. “把第二张也加进来” → 把当前选区外的第 2 个候选加入 Context，不建 Run
7. “参考这些帮我改一下” → 当前选区全部作为 Context，识别 Target 后 revise
8. “把 reference-2 移出参考” → 从 Context 移除，不建 Run
9. “这次只看 brief 和 script，别的都别管” → Context=[brief, script]，排除其它

## 新建（create）

10. “帮我新建一个分镜草稿” → 新节点，intent=create
11. “基于这份 brief 生成一个 storyboard 文件，放到新节点” → 新节点，create_artifact

## 分析（analyze）

12. “你觉得这两张参考图适合什么风格” → Context=[reference-1, reference-2]，intent=analyze，reply_only
13. “总结一下 notes 里的要点，不用存文件” → Context=[notes]，analyze，reply_only

## 需要确认/有风险

14. “把 script 整个删掉重写” → requiresConfirmation=true（覆盖/删除风险）
15. “把这几个节点全部并成一个文件” → 歧义/多 Target，先问一次

## 验收锚点

- 以上指令都应能由 Skill 独立完成，用户不需要提供 Intent/Target ID/Revision ID；
- 只有 14/15 这类才允许打断用户；
- validate-plan 失败时先自动修正一次，不要把错误直接甩给用户。
