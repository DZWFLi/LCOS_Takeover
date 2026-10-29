# GEN2 Wave5 Composer Single Host 施工回执

日期：2026-09-20
范围：AssemblyBody / ConversationWorkViewBody 的同一 Composer intent 单宿主收口
状态：源码已改，未提交，未 push

## 问题

Assembly 取用会话材料后会把 `composerTarget` 写成 `assembly:<kind>:<id>`，同时目标会话的 Conversation Work View 也会因为 `receiverConversationId` 匹配而挂载 `LcosComposerHost`。两个窗口同时可见时，同一个 draft / receiver / workspace intent 可能出现两个视觉宿主。

## 修复

- `AssemblyBody.tsx`
  - 增加 `assemblyComposerOwnsTarget` 纯判定函数。
  - 只有 `composerOpen=true` 且 target 的 `nodeId` 以 `assembly:` 开头时，Assembly 挂载现有 `LcosComposerHost`。
- `ConversationWorkViewBody.tsx`
  - 增加 `conversationComposerOwnsTarget` 纯判定函数。
  - Assembly 来源的 target 即使 receiver 匹配当前会话，也由 Assembly 独占；普通 Conversation target 仍由对应会话窗口承接。
- 未新增 shell store 字段，未复制 draft、receiver、workspace 或 Run truth。

## 验证

通过：

```text
pnpm exec vitest run src/lcos/professional/AssemblyBody.lifecycle.test.tsx src/lcos/professional/ComposerHostOwnership.test.ts --config vitest.config.ts
2 files / 10 tests passed
pnpm exec tsc --noEmit -p tsconfig.json
passed
```

新增定向测试覆盖：

- Assembly + matching Conversation receiver 同时存在时 owner 数量为 1；
- 普通 Conversation intent 仍由 Conversation owner；
- closed / mismatched receiver 不宣称 owner。

说明：`ProfessionalWindowStage.test.tsx` 当前工作区本身存在 React/Zustand invalid hook call，属于现有测试环境/共享改动问题；本次没有扩大范围修复。该文件未作为本批验收依据。

ESLint 定向运行无新增 error；Assembly 文件仍有已有的 4 条 non-null assertion warning，使用 `--max-warnings 0` 时命令按既有 warning 退出。

## 回滚

回滚本批新增的 owner 判定与测试即可；不涉及 schema、store、Core、Bridge 或 Huabu runtime。
