# GEN2 GUI Stage 1 主线验收

日期：2026-09-19
分支：`frontend-reconstruction-v2`
主线提交：`0e16017 → a2f6a76 → a5dbd46`
状态：`APPLIED / PARTIAL`

## 结论

Stage 1 已无冲突进入主线。真实项目页能看到 Project Identity、Navigator、三现场 SurfaceDock、Camera Controls 与画布节点；打开 Assembly 后，Professional Window Chrome 也从 production caller 实际出现。本轮不把组件 Gallery 当作整机证据。

当前仍为 `PARTIAL`：桌面打开态通过，但窄宽、分组、停靠与完整动作状态没有在本轮逐项覆盖；节点形态、排布和后续页面视觉也属于 Wave 3 之后的范围。

## 验证

| 项目 | 结果 |
|---|---|
| GUI commits 与 Wave 2 exact overlap | `NONE` |
| 合入顺序 | `a2f6a76 → a5dbd46`，无冲突 |
| Huabu web typecheck | PASS |
| `lcosFamilyWiring.test.ts` | PASS，11/11 |
| Huabu web production build | PASS |
| `git diff --check` | PASS |
| 真实项目页 | PASS，Shell/HUD 与 Assembly Professional Window caller 可见 |

构建只保留既有 CSS `::highlight`、lottie `eval` 与大 chunk 警告。

## 证据

- `E:\OS开发\LCOS_Gen2\huabu\apps\web\output\playwright\gui-stage1-mainline-production-20260919.png`
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\output\playwright\gui-stage1-mainline-production-window-20260919.png`
- `E:\OS开发\LCOS_Gen2\huabu\apps\web\output\playwright\gui-stage1-shell-hud-navigation.png`

## 未完成

- Professional Window 的窄宽、分组、停靠和完整动作状态尚未在本轮生产截图中覆盖。
- Stage 1 只负责 Shell/HUD/Navigation；节点物种、Assembly、Reader、Context、Workflow、Glyth 继续按 Wave 3–10 实现。
- 未 push。

## 回滚

按反向顺序回滚 `a5dbd46`、`a2f6a76`；Wave 2 `0e16017` 独立，不需要跟随回滚。
