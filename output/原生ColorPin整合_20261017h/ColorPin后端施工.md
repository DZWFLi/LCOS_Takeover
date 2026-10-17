# Color Pin 后端施工

结论：后端源码 ready。原 snapshot / assign / remove / navigation 已接同项目窄代理；原 definition.label 缺口已补到原 Core 事务、ChangeSet、撤回/重做 owner。真实隔离 Core 目标测试通过，候选未由本 agent 构建、重启或写入。原 Pin GUI 由另外两位 agent 接原组件，不能用这里的后端通过替代实屏验收。

## 当前 wire

以下地址前加 `/api/lcos/core`，保持原 Core envelope。

| 方法 / 地址 | 输入 / 返回 |
| --- | --- |
| GET `/projects/:pid/color-pins` | 原 `{definitions,memberships}` 快照，已有 entity/surface/非六色关系不改。 |
| POST `/projects/:pid/color-pins/memberships` | 原 `{targetRef,colorPinId? 或 color,label?}`；原 canonical target 验证、唯一约束与原子 definition/membership/ChangeSet。 |
| DELETE `/projects/:pid/color-pins/memberships/:id` | 删除准确同项目 membership；不删 definition/节点，不扩大其他颜色/画布范围。 |
| POST `/projects/:pid/navigation/resolve` | 原 `{targetRef}`；canonical unresolved 仍是原合法结果，不伪造当前 Canvas occurrence。 |
| PATCH `/projects/:pid/color-pins/definitions/:id` | `{label,expectedUpdatedAt,expectedLabel:string\|null}`；trim 后 1–500 字符。value `{definition}`，真实变化才有 meta.changeSetId。 |

原 typed client 新增：

```ts
colorPins.renameDefinition(projectId, definitionId, {
  label,
  expectedUpdatedAt: definition.updatedAt,
  expectedLabel: definition.label ?? null,
}, signal)
// => { definition, changeSetId? }
```

`expectedLabel + expectedUpdatedAt` 是已有 row 的普通旧值 CAS。更新 timestamp 至少比原值晚 1ms；不增加数据库版本列、hash、ledger 或 gate。未知回包由原 snapshot GET 观察当前准确 definition，不自动重 PATCH，也不根据当前 label 伪造原 ChangeSet 回执。

## 唯一 owner 与落点

- [窄代理](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/core-protocol-router.ts:9>) 保同项目 route、opaque ID 与原 Core validation，不开放任意 HTTP/厂商 Config。
- [新 transform](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-core-color-pin-transform.mjs:17>) 给原 `runCurationMutation` 增加 label-only SQL UPDATE：同主键/项目、color、createdAt 必须一致；UPDATE old label/updatedAt CAS 与原 ChangeSet 共用原事务，不删除再创建 definition。
- [原 MutationSafety 接口增量](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/native-core-color-pin-transform.mjs:35>) 记 `color_pin_definition_update` 的原 row before/after；撤回前核完整 after，重做前核完整 before，之后通过同一 curation transaction 还原。后续用户改名会挡住旧撤回，不能覆盖新名字。
- 新 case **没有 appliedFingerprint/hash 字段**；只核已有字段与正常 CAS。其他原 ChangeSet case 的既有保护没删。
- [builder](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/build-pilot.mjs:29>)、[启动接线](<E:/Codex 项目/LCOS夺舍计划_20261013/scripts/start-full-integration.mjs:44>) 由根线程增加 `coreColorPin` Node 选项；metadata/contracts loader 与原 Collection title transform 顺序组合。browser 仅组合原 typed client 增量，没挂旧 ColorPinHud。

## READ_SOURCE / 实际采用源码

先读第三工作区 AGENTS、lcos AGENTS、g 目录 ColorPin 原入口审查及原 Core/typed client。当前用户的 TapNow 原框架指令覆盖旧 Wave/Figma 壳方向；本轮只做 backend，不恢复旧 GUI。

`readCurrentGen2Resource` 实际选择已逐文件核过：

| logical source | 实际读取 |
| --- | --- |
| `apps/local-core/src/metadata-repository.ts` | `E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/apps/local-core/src/metadata-repository.ts`，只读，经 lab transform 使用。 |
| `apps/local-core/src/mutation-safety-service.ts` | 第三工作区 `lcos/apps/local-core/src/mutation-safety-service.ts`。 |
| `apps/local-core/src/routes/color-pins.ts` | 第三工作区同路径。 |
| `packages/contracts/src/curation-patch.ts` | 第三工作区同路径；只增已有 ChangeItem union 的 label update case，无 schema/migration。 |
| `apps/web-gen2/src/backend/colorPins.ts` | 第三工作区同路径；保原 snapshot/assign/remove，增 typed rename。 |

ADOPTED：原 ColorPin route/client、Metadata curation transaction、MutationSafety before/after + inverse/forward → lab build transform → 原 Core HTTP caller。VISUAL_SOURCE：原 TapNow Hie/Yie/w7/m7，本 agent 不写 GUI。RETIRED：无后台旧逻辑删除；厂商 Config rename 写链由前端 agent 替换。原工程、currentGen2Root 与厂商原件都未改。

## 验证

命令：`node scripts/native-colorpin-backend.test.mjs`，**PASS**。[最终真实 Core JSON](./后端真实Core验证/2026-10-17T06-05-48-516Z/report.json)

- 5 个实际 selected source transform 语法诊断 0、幂等，错误 sourcePath 拒绝；原件内容未改。
- 原 assign 对同 target 幂等；同 Artifact 两个 View 保持不同 membership；多色和非原六色定义保留。
- rename 保 definition ID/color/createdAt 与全部 membership ID；真 before/after ChangeSet；不变无新 ChangeSet；空名、额外改色字段、旧值/时间戳冲突拒绝。
- 两笔真实并发 PATCH 只有一胜一 409。原 ChangeSet revert/reapply 恢复准确 row；后续 rename 后旧撤回 409，保新名字。
- 原 curation transaction 在 label UPDATE 后遇后续 membership 写入失败，真实回滚 label，未留下半写或伪 ChangeSet。
- typed client 带原 AbortSignal 发单次 PATCH；调用方丢弃已提交响应后，只 snapshot GET 核对，没有二次 PATCH。此项为受控 facade transport 接真实 Core，**不是实际网络丢包 GUI**。
- 跨项目 proxy、foreign definition/membership rename/remove、foreign target 均按原 owner 拒绝；导航 foreign 保原 unresolved。
- 删除一条准确 membership 保留另一 View 与其他颜色；三份原 Canvas 全状态、ExecutionProjection、Run 均保持。所有数据只在临时隔离 runtime，0 模型/Run、0 候选写入。

## 仍未宣称的部分

1. 原导航 resolver 的 View.scopeId/ArtifactView.position 仍不能当接管后当前 occurrence 真位置。代理只恢复 canonical 解析；当前/跨画布准确定位由原 Pin 菜单桥 + native material context/navigation 接口负责，未在这里伪补坐标。
2. 本报告没有原 Pin Popover、顶栏、组命名、组全部移除、原标记/小地图联动实屏证据；这属于另外两位前端 agent 与根线程统一 GUI 验证范围。
3. 没有新增“删 definition/共享改色”能力；原 UI 所需 label 更新已实现，其他动作不借机增加。
4. 本次新 rename 暴露范围为 Core HTTP + typed GUI client；未声称 CLI/MCP 也已有同名命令。带新 rename ChangeSet 的 runtime 不能剥掉对应 inverse/forward handler 当作无损回退。
