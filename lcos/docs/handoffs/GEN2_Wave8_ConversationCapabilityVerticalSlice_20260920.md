# Wave 8 Conversation Work View capability vertical slice

日期：2026-09-20

分支：`frontend-reconstruction-v2`

基线：`e35c7ef`
范围：Collaboration projection / facade / T6 continuation caller；不触碰 GUI visual/CSS、Glyth donor renderer、`NodeWrapper`。

## 结论

已把 Conversation Work View 的四类续工动作接到现有 Core truth：

- `selected_context` / `blank_new`：读取现有 Collaboration projection 的 `createSession` probe；能力明确为 true 时调用现有 `CoreContinuationClient.submit()`，返回 `new_session` receipt。提交只创建 T6 operation journal intent，不直接创建第二个 provider session。`operationId` 必须由 caller 持有并在 uncertain retry 时复用。
- `send`：仍 `unavailable`，不 fallback 到 `createRun`。
- `native_full_fork`：当前 facade 仍 `unavailable`；没有 authoritative provider probe 时不把 create + bundle 冒充 full-history fork。
- `continue_existing`：保留现有 `resume()` → T6 `continue_existing` submit 路径；后续 provider side effect 仍由 existing recovery action / journal 推进。
- `ConversationWorkViewBody` 现在直接消费 `canResume/canSelectedContext/canBlankNew/canFork` 与 capability reason；四个入口均由 projection 门控。
- UI caller 从 canonical draft 生成 `orderedReferences`；每种动作按 project/conversation 分别持有 caller-owned `operationId`，失败/unknown 保留，确认 receipt 后才轮换。selected-context 的引用快照与该 operation 绑定，切换动作或修改草稿不会把未知结果重发成另一份请求。native fork 仍 disabled，不以 create+摘要替代。
- selected-context 没有引用或含不受支持的引用类型时保持禁用并显示原因，不与 blank-new 混成同一个动作。

## 变更前后流程

```text
Before: Work View / facade 只有 resume；selected-context / blank-new 没有 product caller
After:  ConversationWorkViewBody caller（持有稳定 operationId）→ CoreCollaborationClient.resume/newSession/fork
        → readSession capability(createSession)
        → CoreContinuationClient.submit()
        → T6 operation journal / projection / recovery actions
        → T7 adapter（仅在允许的 recovery action 中产生 provider receipt）
```

## Exact source / caller

READ_SOURCE：

- `docs/construction/GEN2_R1-R6_to_Wave3-10_ExecutionMap_20260919.md` §R5→Wave7 / Conversation Wave8。
- `docs/handoffs/GEN2_T6T7_TransportRecovery_Handoff_20260914.md` §1.3–1.5、§7。
- `E:\Codex 项目\OS开发\docs\handoffs\GEN2_T7_Glyth续工_AgentAdapter源码蓝图施工正本_V2_20260911.md` §9–§11（provider capability / receipt / T6-T7 owner boundary）。
- `packages/contracts/src/conversation-continuation.ts`：四种 mode、operation journal、allowedActions。
- `packages/contracts/src/provider-capability.ts`：field-level probe，unknown ≠ false ≠ true。
- `apps/local-core/src/conversation-continuation-service.ts`：唯一 T6 journal / recovery owner。

ADOPTED：

- `ProviderContinuationCapabilitySnapshotV1.session.createSession` → `apps/local-core/src/collaboration-capability-resolver.ts::resolveCollaborationCapabilitiesV1` → `CollaborationSessionProjectionV1.capabilities.canSelectedContext/canBlankNew`。
- `apps/web-gen2/src/backend/collaboration.ts::CoreCollaborationClient.newSession` → existing `CoreContinuationClient.submit` → existing T6 `ConversationContinuationService`。
- `huabu/apps/web/src/lcos/professional/ConversationWorkViewBody.tsx::ConversationWorkViewBody` → projection-gated four action buttons → existing collaboration facade。
- `huabu/apps/web/src/lcos/professional/conversationContinuationActions.ts` → stable intent identity + canonical ordered draft mapping。

VISUAL_SOURCE：沿用现有 Collaboration Contract product capability 投影；本切片没有新增或改动 Figma/CSS/renderer。

RETIRED：没有退役旧 GUI caller；现有 delegate Composer 仍明确是 Run 委托，不改成 continuation。

VERIFIED：

- `newSession(selected_context)` 只发 projection read + connected-conversations read + 一次 continuation submit，并保留 ordered references。
- `newSession(blank_new)` 在 create probe 未确认时返回 `unavailable`，只发 projection read，不 submit、不 create external session。
- 两次 `newSession(blank_new)` 使用同一 caller-owned `operationId` 时，提交 body 的 journal identity 完全相同；Core/T6 幂等层可返回既有 journal，不会因 facade 重试生成第二个 operation。
- contract / projection tests 验证新 capability 位在 unknown 时 fail-closed。
- send/fork 原有测试继续证明零 HTTP、无 createRun fallback。
- Huabu component test 验证四入口、native fork disabled/reason、同动作 uncertain retry 复用 operationId、跨模式切换后回来仍复用原 operationId、selected-context 快照固定。

## 测试

通过：

```text
npx vitest run packages/contracts/tests/collaboration-contract.test.ts apps/local-core/tests/collaboration-projection.test.ts
  2 files / 15 tests passed
npx tsc -p apps/local-core/tsconfig.json --noEmit --pretty false
npx tsc -p apps/web-gen2/tsconfig.json --noEmit --pretty false
npm run test --workspace @local-creative-os/web-gen2 -- --test-name-pattern='newSession|send/fork|resume'
  328 tests passed
pnpm --filter @huabu/web exec vitest run src/lcos/professional/conversationContinuationActions.test.ts src/lcos/professional/ConversationWorkViewBody.test.tsx
  2 files / 6 tests passed
pnpm --filter @huabu/web typecheck
  passed
pnpm --filter @huabu/web exec eslint src/lcos/professional/ConversationWorkViewBody.tsx src/lcos/professional/conversationContinuationActions.ts src/lcos/professional/ConversationWorkViewBody.test.tsx src/lcos/professional/conversationContinuationActions.test.ts --report-unused-disable-directives --max-warnings 0 --quiet
  passed
git diff --check
  passed
pnpm exec playwright test -c e2e/lcos-collab-golden.playwright.config.ts e2e/lcos-collab-golden.spec.ts -g "B1\. Wave8"
  1 passed
```

## Hard fail-close / 未完成

- 本环境没有 authoritative real provider fork probe；native full-history fork 保持 unavailable。
- Huabu ACP prompt/live send owner 尚未暴露给 T7；send 保持 unavailable。
- `new_session` receipt 只确认 T6 operation intent 已提交，不代表 external session 已创建；external identity 只能来自后续 T7 receipt 并写回 journal。
- 只改了现有 `ConversationWorkViewBody` 的行为/动作接线，没有改 visual CSS、Glyth donor renderer 或 NodeWrapper。隔离 Playwright hard assertion 已加入 `lcos-collab-golden.spec.ts::B1`：无真实 gateway 时四动作 disabled、native fork 显示 reason、无 continuation POST，Diagnostics recovery 可见。
- `newSession()` 与 `resume()` 都不再内部生成 UUID；UI caller 把 `operationId` 绑定到一次可恢复 intent，并在 submit/recovery outcome unknown 时原样复用。UI caller GAP 已关闭；native fork 与 send 仍是明确 capability GAP。
- 真实 gateway 未配置时，T6 recovery action 仍按既有 route 返回 unavailable/503；没有伪造成功。

## 回滚

只回退本 handoff 对应的 facade/contract、Work View caller、纯逻辑/组件测试和 e2e 断言文件即可；不动既有 T6 journal、T7 adapter、视觉 CSS、Glyth donor renderer、NodeWrapper，也不删除用户未跟踪 patch。
