# Collection 整体跨三 Surface 接收客户端（2026-10-20）

已完成客户端薄层；Root 负责 Dock 写端组合与真实 GUI 联调，本报告不宣称完整链路已验收。

## 调用

```ts
placeNativeLibraryCollection({
  projectId,
  sourceCanvasId,            // 当前挂载、发起拖动的原画布
  canvasId: targetCanvasId,
  workspaceId: targetWorkspaceId,
  collectionId,              // 集合本体，不拆成成员
  position: targetPosition,
}, { api: sourceApi, isCurrent, readOnly, signal })
```

旧调用省略 sourceCanvasId 时保持同现场行为。成功返回新增 canonicalReceipt；未知返回 unconfirmed。远端不存在时必须由原落点能力提供目标位置，不借用源画布中心。

## 复用路径

- GET /api/lcos/canvases/:target/collections/:collection/projection
- POST /api/lcos/canvases/:target/collections:project
- 既有 Core Assembly / Presentation / ProjectToSpaceProjection / Binding 负责持久接收与唯一载体。
- 仅 flush 源 Canvas；目标未挂载时不调用源 synchronizeCollectionCarrier、不切现场、不弹目的地选择。
- 目标已存在只读复用；并发返回 already_present 仍标为 already-present。
- POST 回包丢失后自动 GET 核对一次；缺失、partial、地址不符保持未确认，不重复 POST。
- readOnly 不 flush，不触发其他保存写入。

## 文件与验证

- 修改 lab/pilot/native-library-collection-placement.ts
- 新增 scripts/native-surface-collection-placement.test.mjs

验证：
- 新跨场客户端 8 组定向测试通过。
- 旧客户端与实际原 O8 回填 7 组回归通过。
- TypeScript Compiler API：strict + noUncheckedIndexedAccess，目标文件 ownDiagnostics=[]。
- git diff --check 通过。

测试使用生产客户端与受控 HTTP/source API；不冒充真实浏览器。未改 Core、未改参考 lcos、未新增投影平台或队列、未提交或 push。
