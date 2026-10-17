# GEN2 Workflow Archive Drop Caller 施工交付

## 结论

`.lcos-workflow.zip` 现在有了用户可达入口：把单个归档拖入 Main 画布或 Workflow 现场，会直接调用当前项目会话的 `Gen2Host.importWorkflowDefinition`。Core 成功后继续由既有 reconciler 生成 Main Workflow Collection，并由既有 warehouse read model 出现在 Assembly。

没有新增按钮、第二 store、假卡，也没有在浏览器解析 ZIP。

## 实际流程

```text
单个 *.lcos-workflow.zip
→ LCOS host 捕获原生文件 Drop（保留 File/Blob）
→ Gen2Host.importWorkflowDefinition(file, file.name)
→ Core canonical workflow import
→ existing HostLifecycleReconciler
→ Main Workflow Collection / Assembly item
```

普通文件仍进入 Huabu 原有上传链。混合投放或一次投放多个文件会明确拒绝，避免一部分变成 Workflow truth、另一部分误落成普通节点。

## 失败语义

- Core/网络失败：显示真实失败原因；Drop 已被 LCOS 消费，不会回落到 Huabu `addNode/addNodes`，原画布现场不变。
- Host 尚未就绪：明确提示等待连接，不伪造成功。
- 重复归档：沿用 Core receipt；`created=false` 时提示项目已有该工作流。

## 修改文件

- `huabu/apps/web/src/lcos/LcosHostOverlay.tsx`
- `huabu/apps/web/src/lcos/surfaces/workflow/workflowArchiveDrop.ts`
- `huabu/apps/web/src/lcos/surfaces/workflow/workflowArchiveDrop.test.ts`

## 验证

- 精确识别、混合投放拒绝、成功 receipt、失败不走画布 fallback：3/3 通过。
- 受影响文件 ESLint：通过。
- Huabu web typecheck：通过。
- Huabu web production build：通过。
- `git diff --check`：通过。
- 主线合并后真实隔离栈（43131/3011/5273）：把真实 `.lcos-workflow.zip` 作为浏览器 `File` Drop 到 Main Canvas，Core 返回 `created=false`，UI 显示“已定位到现有定义”，Main 仍只有 1 个 Workflow Collection；console/page/http error 均为 0。

Production build 仍有仓内既有 CSS `::highlight`、lottie `eval` 和大 chunk 警告，本批未新增。

## 未做

- 没有为归档 Drop 新建常驻入口或解析器。
- 没有把 Blob 塞进 Semantic Drop 的元数据 payload；该状态机继续只负责空间意图。
- 没有修改 Context 的投放语义；当前只允许 Main 与 Workflow。

## 回滚

回退本提交即可；本批无 schema migration。导入成功后的 Core workflow truth 由既有项目数据规则管理，不由前端回滚伪删除。
