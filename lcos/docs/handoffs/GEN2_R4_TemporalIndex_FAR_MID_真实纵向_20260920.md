# GEN2 R4 Temporal Index / FAR+MID 真实纵向施工交付

## 结论

Temporal Rail 已从固定空壳接到真实、持久的 Context/Workspace 时间事实：Artifact create、Revision create、Note create、Checkpoint create、Run create 与持久化 RunEvent。投影不读取 `updatedAt`，不消费两分钟后会消失的 `ProjectEventHub` 缓冲，也没有新增时间真相表。

## 数据流

```text
Core durable truth
  ProjectGraphSnapshot(createdAt)
  runs(createdAt)
  run_events(occurredAt)
        ↓ deterministic read projection
GET /projects/:pid/temporal-index?workspaceId=...
        ↓ CoreTemporalClient
ContextWorksite → TemporalRail → TemporalRailView
```

## 本轮落地

- `TemporalIndexV1` / `TemporalFactV1` / `TemporalGroupV1` 只读契约。
- Workspace → Scope 精确过滤；workspace 不存在返回 404，不猜。
- FAR：UTC 自然日确定性分桶。
- MID：连续事实间隔超过 30 分钟时确定性切段。
- Rail 正常态读取 MID，按真实时间顺序给出位置；没有事实时显示真实空态原因。
- 可定位组点击复用既有 `requestLocate`；没有真实投影目标时禁用，不伪造相机动作。

## 修改文件

- `packages/contracts/src/temporal-index.ts`
- `packages/contracts/src/index.ts`
- `apps/local-core/src/temporal-index-projector.ts`
- `apps/local-core/src/routes/temporal-index.ts`
- `apps/local-core/src/server.ts`
- `apps/local-core/tests/temporal-index-projector.test.ts`
- `apps/web-gen2/src/backend/temporal.ts`
- `apps/web-gen2/src/index.ts`
- `apps/web-gen2/test/temporal-client.test.ts`
- `huabu/apps/web/src/lcos/app/lcosCoreClient.ts`
- `huabu/apps/web/src/lcos/surfaces/context/ContextWorksite.tsx`
- `huabu/apps/web/src/lcos/surfaces/context/TemporalRail.tsx`

## 验证

- contracts typecheck：PASS。
- local-core typecheck / lint / build：PASS。
- web-gen2 typecheck：PASS。
- Huabu typecheck / affected eslint / production build：PASS。
- projector 定向测试：2/2 PASS。
- typed client 定向测试：1/1 PASS。
- web-gen2 全套：331/331 PASS（同一运行中包含 temporal client）。
- 隔离真实 HTTP：`workspace-real-context` 返回 `source=canonical_durable_records`、`facts=6`、`far=1`、`mid=1`。

仓库 local-core 全套仍有既有环境/旧 schema 断言失败；本轮定向用例与编译链通过，未顺手改历史失败。

## 诚实缺口

- `ProjectEventHub` 仅两分钟内存缓冲，且部分 envelope 缺 Workspace/Scope identity，所以明确排除；返回 `project_event_hub_ephemeral` omission。
- Conversation 原始 timeline 目前没有 Context/Workspace 归属，明确排除；返回 `conversation_timeline_unscoped` omission。
- 本轮 FAR/MID 是确定性事实分桶，不冒充 Agent 语义 Episode；title/summary/semantic cohesion 仍待 derived Agent projection。
- 多 target 的一次性 selection/camera fit 尚无既有 Shell 调用面；当前只定位首个真实已投影 target，未伪造 multi-focus。
- Wheel temporal window、五档静态长度 score 和 Agent Episode 候选仍是后续增量。

## 回滚

删除新增 Temporal contract/projector/route/client，移除三处 export/装配，并把 `TemporalRail` 恢复诚实空态即可；无 schema、无持久数据迁移。
