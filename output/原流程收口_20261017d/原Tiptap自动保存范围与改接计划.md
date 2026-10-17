# 原 Tiptap 自动保存：仍是单独 P0

结论：本轮通过的是**已登记 save-port 的导图/受控正文**，不能扩成全部文字保存。原 primary 正常双击 Tiptap autosave 的缺口已实际运行复现：真实原编辑器→原 vZ/hl→原 r6/wrapper 在 unknown 后同正文/旧 CAS 重复 POST4，port pending/token 均缺。5 场景脚本 PASS 表示复现成功，不表示修复；产品入口尚未改。见 [实际结果与边界](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/原Tiptap自动保存_实际复现.md>)。

实际 caller：

- `native-text-first-ui.tsx:23` 的 `LCOSRequestNativeTextEdit` 直接 `return originalEdit()`；`native-text-first-transform.mjs:6` 仅把完整primary引用路由到原Pure renderer。
- 原 `course-api-base-url-CifxI1ia.js:822` 的 `r4/s4→t4`，`t4→Lx(nodeId,{mode:'edit'})`。
- 原同文件 line3 `Lx`（offset150314）→`g2/AZ`文本session→`wa.open`。
- 原 `vZ`（line3 offset136612）取 `{updateNodeData:u}=_t()`；`hl(n.markdown,b)` 的change owner最后调用 `b=S=>{g&&u(e,{text:S})}`。
- `native-material-viewer-transform.mjs:52` 只给 `lcosControlled` session插body/actions；普通原session继续上述原callback。没有在它前面调用saveNativeCanvasText，也没有在r6发送前收编该准确正文。

最窄后续接法：保留原 vZ/hl/Tiptap 的本地输入与 debounce，不用 `port.save` 替掉 callback。后者会第二次updateNodeData，busy或异步预检还可能吞/覆盖后来输入。

应在原callback→同一原queue记录来源，并在真实r6 debounce合并完成、发送准确最新DTO前，以现有port登记这一次**既有**文本更新：读取唯一project/canvas/API/primary binding/observed CAS，capture这次要发的原body，必要Core只读预检后再发原h。登记本身不updateNodeData、不生成新history、不复制队列。预检期间新输入继续由原editor/原g拥有；若旧组已发出未知，保留旧operation与后来草稿分别排队，不能busy就丢掉新正文。

原处状态需接回同vZ/原工具栏的保存状态位：saving、待核对、真实冲突、明确恢复；核对复用真HTTP回执GET+O8精确确认，关闭/重开保留准确旧operation与最新草稿。不能靠禁用编辑或删除原autosave功能销账。

必要验证：真实原vZ+hl+Tiptap callback→原r6实际执行；快速连续输入/原debounce仅保存最新稿；预检慢时继续输入不回滚；unknown后继续输入不吞新稿；首200丢回包跨全部retry时间POST1、原处保稿/关重开/GET核对；准确冲突；迟到回执；场景切换；普通节点/links策略不变。最后整App normal/loss与原Undo/Redo完整链验证。当前尚未施工，也未用导图测试替代这条链。

已新增实际可执行复现：`node scripts/native-tiptap-autosave-repro.test.mjs`，5 场景成功复现。原 vZ/hl + 真实 G7 Tiptap DOM 编辑 + 原 r6/wrapper 中，unknown 同正文/旧 CAS 重复 POST4，port pending/token 均缺；后来输入仍由原 editor/live/g 保留。产品未修。完整范围和证据见 [实际复现](<E:/Codex 项目/LCOS夺舍计划_20261013/output/原流程收口_20261017d/原Tiptap自动保存_实际复现.md>)。
