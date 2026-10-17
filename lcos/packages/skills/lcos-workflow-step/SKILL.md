---
name: lcos-workflow-step
description: "在 Workflow 面搭/改 Step 行动骨架（Step 卡、步骤边、材料挂接）、接 elk 布局、把 Step 链存进技能沉淀池（SKILL.md）时用本 skill 施工。"
---

# lcos-workflow-step：Step 组合与技能沉淀池施工契约

## 何时不用（反边界）

- Workflow 是行动场不是第二材料图：`WorkflowActionV0` 是 Presentation-only 状态，删 Step 永不删其挂接的 Project 材料（WorkflowSurface.tsx 头注冻结）。
- 不自动执行：默认只搭不跑；重放是显式动作。
- 序号不进数据：Step 身份用持久 id（`actionId()`），显示序号 `index+1` 只是渲染投影，禁止拿序号当 key 或寻址。
- 技能池不建第二真相：运行次数从画布 Run 节点投影，不写回 SKILL.md。

## 数据模型（状态是哪份数据，真实契约/函数名）

- **Step 状态**：`useWorkflowActionState(projectId, scopeId)`（`frontend-focus/src/state/presentationWorkflowActionState.ts`）持久化 `{actions: WorkflowActionV0[], edges}`。`WorkflowActionV0`（`@local-creative-os/contracts`）：`{id, label, attachedViewIds, x, y}`；步骤边 `{id, fromActionId, toActionId, label?}`。
- **持久 id**：`actionId() = 'workflow-action:' + Date.now().toString(36) + ':' + random(5)`（WorkflowSurface.tsx L113）；边 id 同构 `actionEdgeId()`。
- **材料挂接**：`attachedViewIds` 只存 viewId（live pointer）；`firstActionForView` / `usageCountByView` 是派生 Map。材料默认摆放：`owner.x + 18 + (index%2)*174`、`owner.y + 100 + floor(index/2)*72`。
- **尺寸契约**：`WORKFLOW_STEP_CONTRACT = surfaceComponentContract('workflow-step')`，`minSize {w:224, h:76}`（surfaceComponentCatalog.ts），`ACTION_WIDTH/HEIGHT` 取自它。
- **技能沉淀池**：`frontend-focus/src/features/workflow/skillLibrary.ts`（函数清单见 agent-composer SKILL.md §3）；SKILL.md 语法由 `workflowModel.ts` 的 `parseWorkflowFile/serializeWorkflowFile` 提供（frontmatter name ≤80 字符、description ≤1536、body ≤100000）。
- **重放指令**：`buildReplayInstruction(skill)` 产出「按已确认的工作流技能「X」执行：\n1. …\n2. …」；材料寻址靠 `collectSkillMaterialViewIds(steps)` 解析 contextArtifactIds。

## 施工标准（分步骤）

1. **建 Step**：`createAction()`（WorkflowSurface.tsx L449）——label 缺省 `步骤 ${actions.length+1}`；首个放 (130,128)，后续 `previous.x + 360` 同 y；自动连边 `previous.id → id`。选中 Selection 建步骤时 `attachedViewIds: [...new Set(selectedMaterialIds)]`。
2. **连边**：从 Step 输出端口（`.lcos-workflow-port.output`，`beginLink`）拖到目标 `data-workflow-action-input` 或卡体（`endLink`），同向重复边被去重。条件边 label 经 inspector `updateActionEdgeLabel`（placeholder「例如：客户确认后 / A 方向」），渲染在贝塞尔中点 `<text>`。
3. **挂/摘材料**：`attachSelection(id)` 并入 Selection；`detachMaterial(actionId, viewId)` 摘除；`removeMaterial(viewId)` 只从本面移除（进 hiddenIds、解除 pin，并对穿边做桥接 `presentation:` 边）。
4. **删 Step**：键盘 Delete/Backspace（焦点在 input/textarea 时跳过）或卡上删除钮 → `removeAction(id)`：过滤 action + 两端边；材料不动。
5. **elk 布局**：`previewLayout()`（L531）——`loadPresentationLayoutEngines()` 加载引擎，输入 `{nodes（含 pinned）, edges, gap: 28, componentGap: 96, preserveManualAnchors: true}`，`chooseLayoutStrategy` 判层（`layoutService.ts`：有层级或 directedRatio≥0.6 → elk-directed/layered，否则 fcose-relational，<2 节点或无边 → manual）；预览条显示「N 个关系簇 · M 个手工锚点」，应用才写 `setDraftPositions`。
6. **存技能**：header「存为技能」→ `onSaveSkill({name, steps: currentSkillSteps})`；`currentSkillSteps` 由 actions 映射（label + materials 的 viewId/title），材料只存引用。
7. **沉淀池 GUI**：`skillPanelOpen` 面板（data-testid="workflow-skill-panel"）：搜索/排序走 skillLibrary 纯函数；键位 ↑↓ 移动选中、Enter 重放（input 焦点时忽略）；详情区步骤材料可点 `onLocateSkill` 定位。

## 视觉词汇（复用，禁自带样式）

- Step 卡：`.lcos-workflow-action` + `.lcos-spatial-placement`，序号 `.lcos-workflow-action-index`（`String(index+1).padStart(2,'0')`），端口 `.lcos-workflow-port.input/.output`，附件条 `.lcos-workflow-action-attachments`，信号 `.lcos-workflow-action-signal` + `GlythAvatar`。
- 步骤边：`.lcos-workflow-action-edge`（箭头 marker `lcos-workflow-action-arrow`）；材料边 `.lcos-workflow-edge-group.material-relation`。
- 布局预览：`.lcos-spatial-layout-preview` + ghost `.lcos-layout-ghost-workflow`；锚点标记 `.lcos-manual-anchor-mark`。
- 材料卡：`.lcos-workflow-node.lcos-workflow-material`（`is-attached/is-unassigned/is-manual-anchor` + attention 桶 class）。
- 空/引导：`.lcos-workflow-empty / .lcos-workflow-step-empty`。

## 验收（数值断言）

- 建 3 个 Step 后 `actions.length===3 && edges.length===2`，且 `actions[i].id` 全部以 `workflow-action:` 开头（持久 id）。
- `removeAction` 后材料 visibleNodes 数量不变（只删骨架）。
- `chooseLayoutStrategy`：纯 reference 边 + 无层级 → `'relational'`；全 hierarchy 边 → `'layered'`；1 节点 → `'manual'`。
- `serializeWorkflowSkill({name:'X', steps:3 步})` 产出文本含 3 个 `## 步骤` 标题，`parseWorkflowSkillSteps` 回读 stepCount===3。
- `buildReplayInstruction` 首行以 `SKILL_REPLAY_INSTRUCTION_PREFIX` 开头；`projectSkillRunStats` 对 commandText 不匹配前缀的 Run 节点计 0。
- 技能面板键位：Enter 在 `event.target.tagName === 'INPUT'` 时不触发重放。

## 已知边界（0.1 不做什么，不假装）

- Step 不承载执行语义：workflow-step 组件是 `adapter-only` 空间适配，「执行语义仍属于真实 Workflow」（catalog 描述原文）。
- 不做 cron/trigger 调度、@工作流引用（workflowModel.ts 显式剥离）。
- 布局预览是「建议」不是自动整理：必须人工点「应用」。
- 导入/导出走 `.lcos-workflow.zip` 包，不做跨项目技能市场。
