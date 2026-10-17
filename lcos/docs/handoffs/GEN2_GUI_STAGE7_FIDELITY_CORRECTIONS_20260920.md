# LCOS GEN2 · Stage7 源码修正与底线对照

日期：2026-09-20
范围：后半线 Context / Atlas / Workflow Hand / Temporal 的呈现修正与累计交付。
状态：**修正代码候选；真实 Motion、原 HTML 完整对照与生产整机验收尚未通过。**

## 1. 先说结论

Stage4–6 不是已经严格复刻好的完整设计。此次回查确认了前包的明确偏差：光幕颜色、退出生命周期、卡池搜索被误删、时间轨鱼眼方向。Stage7 修正这些问题，而不是把此前的“组件有了”继续写成“底线达成”。

本地继续负责前半线 Shell / Main / Glyth / Reader / Assembly / Conversation 的 donor 替换。本包不修改其业务容器、不写 Core / Canvas / Selection / Pointer / navigation / safeRect / LOD 真值。

出生点仍是 `frontend-reconstruction-v2@802b7a537ffe81a6e09c522cd45539a22a8a42da`。本轮开始通过 GitHub 连接器核过该 ref；没有创建、推送或合并用户远端提交。

## 2. 这次确切改了什么

| 原偏差 | 已写入的修正 | 证据层级 |
|---|---|---|
| Atlas / Hand 光幕是自写白色渐变 | 使用 Figma 原渐变、底部辉光、两种雾层透明度；去掉原稿没有的整屏 backdrop blur | 实际无 Motion 的 React 背景组件已运行；整页未验收 |
| open=false 立即卸载，exit 没机会执行 | 收编 GEN1 ObjectOrbit 的持久 AnimatePresence 组合方式；当前 project 内保持 key；退出中 inert，换 project 不保留旧项目画面 | 代码已接现有生产 owner；实际 Motion 未执行 |
| Atlas 只点小箭头，空白收回不完整 | 复用既有 onClose；原生空白按钮；明确唯一合法目标时整块激活，原菜单与图片重试独立 | 空白按钮实际 React 运行；整块 Motion 宿主待本地 |
| Stage5 因“去 SaaS”删掉工作流搜索 | 恢复 802 原来的 trim / lower-case / title-includes 过滤与输入；多卡进入可滚动卡池 | 过滤纯函数已执行；真实仓库请求未运行 |
| 时间鱼眼纵向拉开刻度，不符合焦点稿 | 5156:3080 保持 y=13+11*i，向内增加宽度；焦点44×3，右边固定；离开恢复，reduced-motion 不凸起 | 47条宽度与实际导出表数值核验；真实 Motion 帧未运行 |
| 键盘只变描边，注意姿态没有一致输入 | 沿用 GEN1 的后代 focus/blur guard，接同一展示 pose 与 spring | 展示输入纯测试；完整焦点交接待整机 |

### 光幕与布局

- Atlas：`5388:25501–25503`，雾色 `rgb(238,243,239)`、opacity .38；底部高690（900高视口），顶部210。
- Hand：`5140:4159–4161`，同色雾层 opacity .12；底光幕约33vh。
- 渐变停止点、色值、底部890×18 / blur12的辉光直接来自 Figma 读取，不用 ColorPin 替代。
- 1440 的 Atlas 几何夹具中，三列首项位置为 `(240,218) / (562,218) / (884,218)`，第二行 y504。1280保持三列，1152/1024两列，390一列；字体不整体缩放。
- 窄屏重排与“第6张起进入网格卡池”的阈值是本轮展示适配，不宣称 Figma 提供了同一数值规则。20+卡的本地真实 Motion 脚本使用24项明确 fixture。

### 时间轨的 donor 纠偏

此前接入 d3 fisheye 的公式本身存在，但把它用来改 tick 的 y，违反 Figma 焦点稿的固定纵向节距。Stage7 **停止在 TemporalRailView 调用该纵向 warp**，不再把“确实用了 donor”当成视觉正确的依据。

`temporalFocusProfile.ts` 保存实际导出刻度的宽度增量采样；相邻采样之间做线性插值，时间过渡仍交给项目现有 Motion。它是 **Figma 关键姿态采样适配**，不是取得了 Figma 的原始连续算法，也不是新的时间分组服务。中心之外的浮点误差以 1e-5 容差核验。

旧 `fisheye1d` 和原测试保留为兼容历史，不再登记为当前时间轨的生产动效采用。随源码补全原始 BSD 许可，不删除原有来源记录。

## 3. 实际 donor 采用与保留边界

- **GEN1 ObjectOrbit.tsx @3e99769**：取 persistent AnimatePresence + open conditional 组合、spring 400/25、退出 .2 easeOut；不搬 GEN1 overlay store、命令或 camera。属于 THIN_ADAPT，不是整份组件原样复制。
- **CURRENT WorkflowCardPool.tsx @802b7a5**：恢复原有标题过滤代码；提取成 `filterWorkflowTitles` 以便普通测试。没有新建 Search 服务或另一个草稿 Store。
- **GEN1 SurfaceComponentShelf 焦点边界**：复用 Stage6 已收编的 `useDescendantFocus`，没有再写第二份全局监听。
- **Figma exact**：光幕 paints、刻度 keyframe、Atlas 容器位置。组件的几何/资产并不是由 donor skin 反向决定。
- **Motion**：生产代码继续 import 项目已有 `motion/react`；没有自造 spring/RAF；本轮没有安装或更换生产依赖。
- **Huabu**：既有空间内核、Portal scene cache/viewport、wheel 隔离继续保留。本轮没有新增 Portal 导航或相机 owner。

账本见同包 `DONOR_LEDGER.md`。没有新声称大段 Spatial / Lovart 原码已移植。

## 4. 原 HTML 底线如何处理

实际读到的是用户上传 Figma 合同包中的原件：

`03_ContextWorkflow产品语义裁决.md`

其中明确：Context 呼出伴随光幕与 focus，轻点空白收起；集合进入真实 child；Workflow 卡多时进入 Card Pool / Search，不能要求线性轮转20张卡；单击轻预览、双击/Enter打开，与取用/续接分开；不能把 HTML 定时器/模拟数据当生产语义。

**未取得并运行该文件引用的完整 HTML 原件：**

`LCOS_GlobalHUD_Navigator_ContextWorkflow_Prototype_V2_ThreeVideoIntegrated_20260910.html`

本轮通过 Files 搜索原名/简称仍未恢复到该原件。搜索无结果不等于文件不存在，也不等于交互要求可以忽略。因此本包只把能从已读原合同确认的底线落实，**不写“原 HTML 交互全部达成”**。完整对应表见 `BOTTOM_LINE_AUDIT.md`。

## 5. 实际检查，连同失败一并交付

| 检查 | 实际结果 | 不代表什么 |
|---|---|---|
| Node 纯函数 | 23/23，通过 | 不代表生产请求/导航/回执 |
| 严格 TypeScript | 8个纯TS模块，通过 | 不含 React 类型链接，不是整仓 typecheck |
| TS/TSX / CSS 解析 | 37个文件，0语法错误 | 不等于 lint / build |
| 原 owner 源码回归 | 5/5，通过 | AST/源码对比，不是整机行为证明 |
| 无 Motion 的实际 React 背景组件 + CSS 几何夹具 | 24/24，通过 | 不是整个 Atlas/Hand；不是动画测试 |
| 实际 Motion 运行脚本 | **退出1，BLOCKED_DEPENDENCIES，0用例执行** | 未以 probe/mock替代，不得标为通过 |
| Vitest 文件 | 已增加，**未执行** | 不能计入23项Node结果 |
| 原 HTML 原件运行对照 | **未执行，原件未恢复** | 不用合同摘要假装原型运行证据 |
| 完整 repo / Core / ReactFlow / Motion / Golden Path | **未执行** | 不是可直接合并的验收完成件 |

环境：Node22.16、TS5.8.3；无Motion React背景检查用沙箱可取得的真实 React19.1.1，Chromium + Python Playwright。目标仓库记录 React19.2.8 / TS6，版本不等价。

真实 Motion 脚本解析本地 workspace 的 `motion/react` 失败。官方包下载/本地缓存寻找未取得完整可执行依赖；连接器读到的第三方旧版压缩长行是截断文本，没有拿来假装运行引擎。失败日志完整保留在 `EVIDENCE/real-motion/results.json`。

背景截图有“几何夹具，不是完整场景或 Motion 验证”的明确标签，不能充当 Figma 整页复刻截图。本轮没有原速动效录像，不用静态帧生成 MP4 充数。

## 6. 累计补丁修复了旧应用缺陷

恢复 Stage4→6 时发现 Stage4 的 `WorkflowWorksite.tsx` 旧上下文误写 `</div>`，真实802源码为 `</button>`。因此不能宣称旧四包无需任何修正即可顺序普通 apply。

此次只修复该旧上下文匹配，保留原补丁目标文本；重建 post-Stage6 文件子集，并与随包31个完整文件逐字节一致。六个原有文件均已核 GitHub exact blob。

新累计 patch 是**从六个经核原始文件到当前完整子集工作树的 Git diff**，不是旧 patch 字符串拼接。Stage7 增量由同一 post-Stage6 父树生成。两份都进行普通 fresh `git apply --check` / apply / 结果比对，无 `--recount`。

这仍是源码子集验证，**不是已 clone 完整仓库的构建验收**。具体退出码与文件数见 `EVIDENCE/patch-verification.json`。

## 7. 本地应用方式

### 已有 Stage6

只应用本次增量：

```bash
git apply --check LCOS_GEN2_GUI_STAGE7_Curtain_Presence_Search_on_STAGE6_20260920.patch
git apply LCOS_GEN2_GUI_STAGE7_Curtain_Presence_Search_on_STAGE6_20260920.patch
```

### 未应用后半线 Stage4–6

在独立 GUI 工作树，从本包声明的出生点/与其兼容的本地前半线结果应用：

```bash
git apply --check LCOS_GEN2_GUI_STAGE4-7_CUMULATIVE_802b7a5_20260920.patch
git apply LCOS_GEN2_GUI_STAGE4-7_CUMULATIVE_802b7a5_20260920.patch
```

累计版与各阶段补丁二选一，**不要重复应用**。如果本地已改这六个 container，按 hunk 合并，不用 FULL_FILES 覆盖新工作。只有Stage4/5时继续用所需增量或在独立树重放，不能盲套累计版。

累计版只含后半线，不包含 Stage1–3 / REWORK01–02，不是全仓快照。生产需要本地前半线已提供的 `motion/react` 依赖；本包不改 package.json 或 lockfile。

## 8. 可在本地直接执行的真实引擎检查

先使用现有 package manager 安装/恢复项目自身依赖，不换版本来迁就测试：

```bash
cd huabu
pnpm --filter @huabu/web typecheck
pnpm --filter @huabu/web lint
pnpm --filter @huabu/web test
pnpm --filter @huabu/web build
pnpm --filter @huabu/web test:e2e
```

再从仓库根目录：

```bash
node scripts/e2e/gui-stage7/run.mjs /absolute/path/to/gui-stage7-evidence
```

此脚本不安装依赖，不 mock Motion；真实浏览器使用实际 View 与明示 fixture，不冒充 Core。检查持续运动、退出保留、inert、快速反转、键盘关注、整块集合激活、24卡可达、时间轨内凸与wheel、Portal场景保留、五档尺寸、reduced-motion。缺依赖/selector/失败请求/断言失败均非零退出。脚本本身需要本地运行结果，未计为本轮通过。

## 9. 未关闭项

- 原 HTML 原件的全交互逐项对照；Figma 整面并排/overlay/diff。
- 真实 Motion 连续帧、reverse、中断、相机移动预算、多实例性能。
- Temporal 真实时间分组与组目标预览；当前 wrapper 仍为空态。
- Workflow 单击预览 / 打开 / 续接各自真实 producer；此包只保留实际草稿取用。
- Atlas 拆/合/删、集合拖到Main的实际接线和恢复。
- Workflow Collection 的跨视图生产 caller；Portal打开/放大的真实owner回调。
- 真实 child 返回、safeRect避让、Core回执、reload与协作，及完整九面回归。

**上述项目都仍属于底线，不因为记了 INFRA_WIRING_REQUIRED 就算完成。** GUI 该交的呈现/适配继续补；真正的语义owner由Infra接入；最终由真实应用运行证明。
