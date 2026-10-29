# LCOS 与 TapNow 的接入重点

## 结论

方向成立：LCOS 继续使用现有 Local Core、Huabu 画布和本地执行入口，采用 TapNow 好用的节点呈现、排版与编辑交互，避免再反复打磨同一套前端。

Core 本来就是本地 HTTP 服务器，不需要“假装”服务器，也不需要复制 TapNow 的整套云后台。需要的是薄薄的接入层，把组件要求的身份、内容、操作与返回结果对齐。

## LCOS 到底是什么

LCOS 是本地创作项目的总导演台：把文件与素材、上下文、会话、工作流、执行、结果、审阅和版本组织成可持续工作的项目。

它不只是文件夹管理，也不只是画布，更不是必须依赖厂商云端的生图网站。几个现有部分各管一件事：

| 部分 | 职责 |
| --- | --- |
| Local Core | 项目、材料身份、文件登记、版本、执行与结果审阅 |
| Huabu | 现有画布的坐标、尺寸、选择、连线、视口与空间历史 |
| 现有执行与 API 助手 | 接受任务，调用已有工具或模型，产出文件与执行结果 |
| LCOS 前端 | 组织 Main、Context、Workflow 现场与项目操作 |
| TapNow 可采用部分 | 图片/文本节点外观、内容排版、富文本控件与经过验证的交互 |

换的是节点的驾驶舱，不是再造文件登记簿和画布发动机。

## 现有后端已经有什么

这些是当前复制源码中的能力，不等于本轮已启动真实用户库或完成整机接入：

- Core 是监听 `127.0.0.1` 的 Node HTTP server：`lcos/apps/local-core/src/server.ts:1616`。
- 本机可信文件可登记为 FileRecord、Artifact 和 Revision：`lcos/apps/local-core/src/file-registry-service.ts:72`。浏览器不直接提交任意绝对路径。
- 浏览器选中的图片可沿原 Import Copy 写进本地项目并认领原节点：`lcos/apps/web-gen2/src/backend/artifacts.ts:81`，入口是 `/projects/:id/imports`，不是厂商云上传。
- 文件内容从 FileRecord 的本机路径读取，返回真实图片/正文：`lcos/apps/web-gen2/src/backend/artifacts.ts:157`，入口是 `/projects/:id/file-records/:id/content`。
- 文本节点已有 `readCanvasText` / `saveCanvasText`，内容归入原 Artifact/Revision，保留版本冲突检查：`lcos/apps/web-gen2/src/backend/artifacts.ts:106`、`lcos/apps/local-core/src/canvas-text-service.ts:60`。
- 生成执行和结果登记分开：Run dispatch 调现有 adapter/Bridge；输出从 run staging 登记成 draft，审阅接受后才更新 current。不能把“生成结束”直接等同于“覆盖当前材料”：`lcos/apps/local-core/src/runtime-result-ingestion.ts:301`、`lcos/apps/local-core/src/routes/runtime-reviews.ts:23`。

“本地 API”不等于“模型一定在本机推理”。API 助手可以按你的配置调用外部模型，但入口、结果管理与文件登记由自己的系统承接，不依赖 TapNow 的云后台。具体生成能力仍需真实调度验证，不能只因接口存在就称全链路成熟。

## 到底接哪些

| TapNow 前端动作 | 接我们的哪部分 |
| --- | --- |
| 展示图片 | Core 当前/明确选定版本 → FileRecord 字节 → 节点图片 body |
| 上传或接收本地图片 | 原 Import Copy/可信来源登记 → 原 Artifact 与 View → 原节点绑定 |
| 编辑文本 | 原 canvas-text 读写 → 新 Revision；沿用现有保存与冲突反馈 |
| 拖动、缩放节点、排版与连线 | 现有 Huabu 命令与历史，保留原空间状态 |
| 发起生成 | 现有 Run 与执行适配器 → API 助手 → 本地结果登记与审阅 |
| 点击生成物查看/引用 | 已登记的材料与版本，不从厂商云历史反查 |
| 厂商登录、积分、营销、社区 | 不属于节点采用目标；不需要模拟其业务 |

用户主要需要的节点排版、内容呈现和编辑，优先从现有 `resolveNodeBody` / renderer 接口进入。`lcos/README.md` 已规定 binding-aware 节点呈现，Huabu NodeWrapper 继续管理几何与指针；`lcos/apps/web-gen2/src/integration/huabu/LcosCanvasAdapter.tsx` 已能传入 renderer、body resolver 与操作 recognizer。

因此正式方向是 **保留现有画布，用 TapNow 的节点呈现替换/增强现有节点 body 与视觉**。本轮保留整套 donor ReactFlow 的实验用于定位、测量和拆接口，不作为第二套生产画布引入。

## 为什么不能只把域名换成本机

TapNow 的字段和操作语义并不等于我们的接口：它用 node ID、src、上传与下载任务；我们用项目、Artifact、Revision、FileRecord 和画布绑定。接入层负责翻译，不强迫 Core 改成厂商的数据模型。

已实测到两个具体差异：原文本 editor 改 `data.text` 而不更新旧 content；原 TapNow 删除/撤销可能创建新 node ID。采用时要读取明确正文并保留原 LCOS 身份，不能让视觉动作换掉材料主键。保留现有 Huabu 的空间动作更符合这个目标。

原下载和生成历史的厂商依赖，也不必完整仿制。LCOS 可以用自己的 FileRecord 内容与 Run/Revision 历史完成对应产品动作。

## 最新实施与下一步收敛

中断恢复后，以下最小真实纵切已经实施，运行于新合成项目而非正式用户项目：

1. 在现有 Huabu 画布展示一张已登记本地图片和一个已登记文本节点，采用 TapNow 的节点视觉/内容结构。
2. 图片读原 FileRecord；文本保存走原 canvas-text；拖动/尺寸/连线继续走 Huabu。
3. 刷新后确认同一材料、同一版本与空间状态恢复。之后再接本地生成结果的登记与呈现；此部分尚未实施。

验收重点是“现有项目真实文件能用、节点好用、保存能回来”，不再以独立调色工具、完整厂商云 API 覆盖率或完整反编译量作为主目标。

新入口 http://127.0.0.1:17879/ 已通过 6 项浏览器验证，真实 Core 6 项、Huabu 4 项和启动失败清理测试通过。原 TapNow 图片 vT、文本 e4/CT、标题 _ie 在宿主 React 下运行；Markdown 解析和编辑器沿用现有 Milkdown，不等于采用了原厂整套富文本编辑器。详细结果见 [图片文本真实接入续工](./图片文本真实接入续工_20261013.md)。旧整包对照仍见 [节点与画布功能实测](./节点与画布功能实测_20261013.md)。没有修改生产代码、启动用户数据库或提交模型任务。
