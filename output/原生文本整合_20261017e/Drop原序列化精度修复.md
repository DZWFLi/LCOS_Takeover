# Drop 原序列化精度修复

结论：确实是原 DC/PC 保存器把释放点写成两位小数，原Presentation仍保高精度；新semantic读取用全等比较，导致真实正常保存后误报partial。已只复用现有 `nativeCollectionSavedPlacementMatches` 接受原已知持久化表示，明显位移继续拒绝。源码已冻结交root，候选未由本agent操作。

## 证据先于修复

- 原release：`{x:542.4233409610985,y:-191.24673913043478}`；原batch序列化后：`{x:542.42,y:-191.25}`，measurement `375×250`。
- 独立真实Chrome只放行准确原measurement保存一次200后，同receive GET变partial，Core Graph/Runs/Presentation不变：[原GUI负向报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生Drop整合_20261017f/原库真实鼠标拖动/2026-10-17T03-29-31-075Z/report.json>)。
- 本agent另用真实临时Core的原 `nodes:batchActions` 保存同round2 position + measured，复现semantic partial；不是假改repository或只跑比较函数：[原Core负向报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop原序列化精度验证/2026-10-17T03-29-49-877Z/report.json>)。

## 最窄改动

- [receive backend](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-receive.ts:111>)：只在真实saved node位置与原Presentation desired位置之间调用既有精度helper。
- [receive client](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-material-receive-client.ts:19>)：相同helper用于回执node与原Presentation/释放点、原live读回与同一Presentation desired位置。live可以仍是精确release，也可以已是DC/PC表示；不拿两个不同方向的round结果互相模糊匹配。
- [既有helper](<E:/Codex 项目/LCOS夺舍计划_20261013/lab/pilot/native-collection-save-precision.mjs>)未修改；保原DC/PC的精确值/两位小数表示规则，没有新容差、位置owner或手工纠正坐标。
- 原membership、Revision/ref、FileRecord、原API/项目/现场保护均未动。Workspace inspect本来就读真实载体、没有Presentation位置全等，因此没有这次误partial，不修改Workspace保护。

## 修后验证

| 命令 / 范围 | 结果 |
| --- | --- |
| `node scripts/native-material-receive-precision.test.mjs` | **5组PASS**：真实原batch round2 measurement后semantic present；实际client接同真实Core receipt，GET-only、无flush/POST；额外`+0.01`真实保存位移仍partial；Workspace对照仍present。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop原序列化精度验证/2026-10-17T03-35-46-309Z/report.json>) |
| `node scripts/native-material-receive-client.test.mjs` | **12组PASS**；新增posted response为round2/live发布round2接受，额外0.01回执或live位移不确认。其transport/publication受控，不冒充原O8。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop语义客户端验证/2026-10-17T03-34-16-278Z/report.json>) |
| `node scripts/native-material-receive.test.mjs` | 原语义真实Core9组回归全过；含根三Surface、图片、Glyth关系、origin前进GET恢复及foreign拒绝。[报告](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原生文本整合_20261017e/Drop语义目标真实Core验证/2026-10-17T03-35-46-319Z/report.json>) |
| `node scripts/native-collection-save-precision.test.mjs` | 原真实DC/PC量化函数 + 既有helper 8组全过，非GUI |
| 候选整页修后 | 等root统一build及Artigine原鼠标全链回归；此处不提前记通过 |

新测试Run0/model0；临时Core均关闭、测试目录已清理。第一次测试误把measurement写成顶级width/height被原route拒绝501，改为原协议的`measured:{width,height}`后才取得真实复现；未改产品接受测试错误DTO。
