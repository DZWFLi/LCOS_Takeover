# Composer 的系统文件接入

结论：系统文件直接落到现有输入的引用条，复用原上传器和原引用准入。没有额外 Composer、文件队列、Canvas 节点或自动发送。源码已冻结、8 组定向回归通过；尚未在候选整页验证。

原入口是 Native Chatbox 内唯一 inline `LcosComposerHost`，其原 `onMaterialDragOver / onMaterialDrop / onMaterialPaste` 先接 `Files`，非文件继续原摘录 MIME。原全局 `c7` 已避让这个输入，防止同一文件又落 Canvas。

- [native-composer-file-source-transform.mjs](../../lab/native-composer-file-source-transform.mjs) 仅改准确 Host source；提供 `withNativeComposerFileSourceTransforms(existing)`，先执行已有 map，再加本层。原 UI/chat/reader/recovery map 的每个旧字节可恢复。
- [native-composer-file-input.ts](../../lab/pilot/native-composer-file-input.ts) 调同一个 `useOriginalFileUploadManager`（原 course `ai/EO`）。开始和结束使用已有 `referenceInputOperation(preparing)`，原发送按钮自然沿已有状态等待，不造另一把锁。
- 导入后读真实 Graph，逐项核 project、artifact、revision、View、FileRecord、MIME、size、可用性与原内容事实。只调用原 `addEntitiesToDraft`，版本不一致不替换 Current。
- 跨异步锁定 project / Canvas / API / workspace / inputKey / receiver / message / continuation operation；结束后不改 prompt。原文字、输入焦点和选区均未变才恢复原 caret。用户后来写的 C 不被 A 覆盖。

新 hook：

```ts
useNativeComposerFileInput({
  projectId, inputKey, open,
  blocked: state === 'submitting' || voiceState !== 'idle',
  textareaRef, onNotice: setMaterialNotice, session,
}): (transfer: DataTransfer) => boolean
```

这里 `blocked` 不包含本次准备操作本身，避免开始准备后把自己误判成外来忙状态；同一原 owner 已有 preparing/sending 操作时，另一笔文件上传直接保原输入，不开第二笔请求。

`node scripts/native-composer-file-input.test.mjs` 已通过：

1. 真实 full source map 组合、解析、精确 sourcePath、幂等和旧字节恢复。
2. 实际原 reference operation / admission / controller 源码，保原顺序和准确 revision/View/MIME。
3. 同 inputKey 的 Canvas/API/message/op/receiver/workspace/input/closed 八种迟到变化均拒绝；第二笔并发不上传。
4. Graph 回来前换 message，0 引用写入。
5. 源 View 已前进，拒收，不采用 Current。
6. 上传结果未知，0 自动重传 / 0 Canvas 回退 / 0 假引用。
7. 同输入后来文字 C 保留，拒绝恢复 A 的 caret。
8. 实际变换后的 Host DOM drop/paste handler 消费 Files，原摘录 MIME 仍走原分支。

证据：[Composer文件原输入回归.json](./Composer文件原输入回归.json)。上传与 Graph 网络、DOM 叶子受控；这不是实际模型、多媒体理解、Core 写入或完整整页证明。

剩余边界：原 `Mor/Nxt` 的完成请求成功但回包丢失时，任务只暴露失败结果；本轮原处提示、0 自动重传，但同 upload 的 GET 核对尚未接。原 Task state 保存 fileId、`jK` 映 TransferPanel 时未带出，这才是下一段的准确接点；不能另建账本补忘性。非纯文本能加入引用不表示当前 Run 通道能理解它，现有提交能力限制仍保留。Library 区域系统文件拖入另需原库 owner，不能因 Composer 成功一并勾完。
