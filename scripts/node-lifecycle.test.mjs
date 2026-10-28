import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, '.runtime', 'node-lifecycle-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })
await mkdir(path.join(root, 'evidence'), { recursive: true })
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_RECOVERY_TRANSPORT = 'none'

const publicOrigin = 'http://127.0.0.1:17879'
const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'), 'node', { coreWorkspaceMembership: true })
const lifecycleEntry = await buildPilotEntry('lab/pilot/node-lifecycle.ts', path.join(runtimeRoot, 'node-lifecycle.mjs'))
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href)
const { createNodeLifecycle, NodeLifecycleError } = await import(pathToFileURL(lifecycleEntry).href)
const report = {
  implementation: 'temporary real Local Core SQLite + Huabu disk space and command executor',
  runtimeRoot,
  originalUserDatabaseOpened: false,
  userProjectFilesWritten: false,
  syntheticCoreFilesWritten: true,
  modelTaskSubmitted: false,
  cases: [],
}

let facade
const operation = (kind, phase, operationId) => ({ version: 1, operationId, kind, phase })
const connectLifecycle = current => createNodeLifecycle({
  repository: current.core.repository,
  projectId: current.core.projectId,
  spatial: current.spatial,
  workspaceForCanvas: canvasId => current.workspaces.find(workspace => workspace.canvasId === canvasId),
  publicOrigin,
  coreOrigin: current.core.origin,
})

try {
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin })
  let lifecycle = connectLifecycle(facade)
  const projectId = facade.core.projectId
  const mainWorkspace = facade.workspaces.find(workspace => workspace.preferredSurface === 'main')
  assert.ok(mainWorkspace?.canvasId)
  const canvasId = mainWorkspace.canvasId
  const initialScene = await facade.spatial.read(canvasId)
  const originalTextNode = initialScene.state.nodes.find(node => node.type === 'note')
  const originalImageNode = initialScene.state.nodes.find(node => node.type === 'image')
  assert.ok(originalTextNode && originalImageNode)
  const textPresentation = { lcosTextViewMode: 'mindmap', lcosTextCollapsedIds: ['section-a'],
    lcosTextBeforeMindMapSize: { width: 244, height: 150 } }
  report.cases.push('module bootstraps against the facade factory’s disposable Core project and real Huabu space')

  const textCreate = await lifecycle.applyAction({
    canvasId,
    lcos_operation: operation('create', 'apply', 'node-life-create-text-1'),
    action: { action: 'create', creates: [{ id: 'client-picked-id', type: 'text', position: { x: 920, y: 180 },
      measured: { width: 380, height: 240 }, data: { title: '生命周期文本', text: '# 新文本\n\n正文只由 Core 管理。', ...textPresentation } }] },
  })
  const createdText = textCreate.nodes[0]
  assert.ok(createdText)
  assert.equal(createdText.nodeId, 'client-picked-id')
  assert.equal(textCreate.client_to_spatial_ids['client-picked-id'], createdText.nodeId)
  assert.equal(createdText.lcos_ref.entityType, 'artifact')
  assert.equal(createdText.lcos_ref.entityId, createdText.lcos_ref.artifactId)
  const createdTextBinding = facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'artifact', createdText.lcos_ref.artifactId)
  assert.equal(createdTextBinding?.spatialId, createdText.nodeId)
  const createdTextArtifact = facade.core.repository.getArtifact(createdText.lcos_ref.artifactId)
  const createdTextRevision = facade.core.repository.getArtifactRevision(createdText.lcos_ref.revisionId)
  assert.equal(createdTextArtifact?.title, '生命周期文本')
  assert.equal(createdTextRevision?.artifactId, createdText.lcos_ref.artifactId)
  assert.equal(createdText.lcos_ref.artifactViewId, textCreate.nodes[0].lcos_ref.artifactViewId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(createdText.data[key], value)
  const createdSpatialText = (await facade.spatial.read(canvasId)).state.nodes.find(node => node.id === createdText.nodeId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(createdSpatialText.data[key], value)
  report.cases.push('fresh text CREATE_NODES result binds the returned Huabu NodeID through createTextArtifact/Core readback and preserves validated text-face preferences in Huabu')

  const deletedText = await lifecycle.applyAction({
    canvasId,
    lcos_operation: operation('create', 'undo', 'node-life-create-text-1'),
    lcos_refs: { [createdText.nodeId]: createdText.lcos_ref },
    lcos_snapshots: { [createdText.nodeId]: { id: createdText.nodeId, type: createdText.type, position: createdText.position,
      measured: createdText.measured, data: { ...createdText.data, lcos_ref: createdText.lcos_ref } } },
    action: { action: 'delete', delete_ids: [createdText.nodeId] },
  })
  assert.deepEqual(deletedText.deleted_node_ids, [createdText.nodeId])
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'artifact', createdText.lcos_ref.artifactId), undefined)
  assert.ok(facade.core.repository.getArtifact(createdText.lcos_ref.artifactId))
  assert.ok(facade.core.repository.getArtifactRevision(createdText.lcos_ref.revisionId))
  assert.ok(facade.core.repository.getArtifactView(createdText.lcos_ref.artifactViewId))
  assert.equal(facade.core.repository.listWorkspaceMembers(mainWorkspace.id).some(member => member.artifactViewId === createdText.lcos_ref.artifactViewId), false)
  const textRestore = await lifecycle.applyAction({
    canvasId,
    lcos_operation: operation('create', 'redo', 'node-life-create-text-1'),
    action: { action: 'create', creates: [{ id: 'history-created-text-id', type: 'text', position: createdText.position,
      measured: createdText.measured, data: structuredClone(createdText.data),
      lcos_ref: deletedText.lcos_refs[createdText.nodeId] }] },
  })
  assert.notEqual(textRestore.nodes[0].nodeId, createdText.nodeId, 'Native undo/redo can assign a replacement Huabu NodeID')
  assert.equal(textRestore.nodes[0].nodeId, 'history-created-text-id', 'restore preserves Native’s newly generated ID')
  assert.equal(textRestore.client_to_spatial_ids['history-created-text-id'], textRestore.nodes[0].nodeId)
  assert.equal(textRestore.nodes[0].lcos_ref.entityId, createdText.lcos_ref.entityId, 'Core Artifact identity must survive Native NodeID rotation')
  assert.ok(facade.core.repository.listWorkspaceMembers(mainWorkspace.id).some(member => member.artifactViewId === createdText.lcos_ref.artifactViewId))
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'artifact', createdText.lcos_ref.artifactId)?.spatialId,
    textRestore.nodes[0].nodeId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(textRestore.nodes[0].data[key], value)
  const restoredSpatialText = (await facade.spatial.read(canvasId)).state.nodes.find(node => node.id === textRestore.nodes[0].nodeId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(restoredSpatialText.data[key], value)
  report.cases.push('create undo/redo removes only the carrier and restores the same Artifact and text-face preferences under a new Huabu NodeID')

  const originalImageBinding = facade.core.repository.getProjectionBindings(projectId)
    .find(binding => binding.canvasId === canvasId && binding.spatialId === originalImageNode.id)
  assert.equal(originalImageBinding?.entityType, 'artifact')
  const sourceImageView = facade.core.repository.getArtifactViews(originalImageBinding.entityId)
    .find(view => String(view.scopeId) === String(mainWorkspace.scopeId) && view.referenceKind === 'primary')
  const sourceImageArtifact = facade.core.repository.getArtifact(originalImageBinding.entityId)
  const sourceImageRevision = sourceImageArtifact?.currentRevisionId
    ? facade.core.repository.getArtifactRevision(String(sourceImageArtifact.currentRevisionId)) : undefined
  assert.ok(sourceImageView && sourceImageArtifact && sourceImageRevision)
  const sourceImageRef = { version: 1, entityType: 'artifact', entityId: String(sourceImageArtifact.id), artifactId: String(sourceImageArtifact.id),
    artifactViewId: String(sourceImageView.id), revisionId: String(sourceImageRevision.id) }
  const viewCountBeforeImage = facade.core.repository.getArtifactViews(String(sourceImageArtifact.id)).length
  const imageDuplicate = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'apply', 'node-life-duplicate-image-1'),
    action: { action: 'create', creates: [{ type: 'image', position: { x: 1280, y: 180 }, measured: { width: 340, height: 220 },
      data: {}, lcos_ref: sourceImageRef }] },
  })
  const duplicatedImage = imageDuplicate.nodes[0]
  assert.ok(duplicatedImage)
  assert.notEqual(duplicatedImage.nodeId, originalImageNode.id)
  assert.equal(duplicatedImage.lcos_ref.entityType, 'view')
  assert.equal(duplicatedImage.lcos_ref.artifactId, sourceImageRef.artifactId)
  assert.notEqual(duplicatedImage.lcos_ref.artifactViewId, sourceImageRef.artifactViewId)
  assert.equal(facade.core.repository.getArtifactViews(sourceImageRef.artifactId).length, viewCountBeforeImage + 1)
  const clonedImageRevision = facade.core.repository.getArtifactRevision(duplicatedImage.lcos_ref.revisionId)
  assert.equal(String(clonedImageRevision?.fileRecordId), String(sourceImageRevision.fileRecordId), 'duplicate reuses the exact Core FileRecord')
  const duplicatedImageBinding = facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'view', duplicatedImage.lcos_ref.artifactViewId)
  assert.equal(duplicatedImageBinding?.spatialId, duplicatedImage.nodeId)
  report.cases.push('Core image duplicate creates one additional ArtifactView and reuses the same revision/FileRecord without copying bytes')

  const imageDelete = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'undo', 'node-life-duplicate-image-1'),
    lcos_refs: { [duplicatedImage.nodeId]: duplicatedImage.lcos_ref },
    lcos_snapshots: { [duplicatedImage.nodeId]: { id: duplicatedImage.nodeId, type: duplicatedImage.type, position: duplicatedImage.position,
      measured: duplicatedImage.measured, data: { ...duplicatedImage.data, lcos_ref: duplicatedImage.lcos_ref } } },
    action: { action: 'delete', delete_ids: [duplicatedImage.nodeId] },
  })
  assert.equal(imageDelete.core_saved, true)
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'view', duplicatedImage.lcos_ref.artifactViewId), undefined)
  assert.ok(facade.core.repository.getArtifact(sourceImageRef.artifactId))
  assert.ok(facade.core.repository.getArtifactView(duplicatedImage.lcos_ref.artifactViewId))
  assert.ok(facade.core.repository.getFileRecord(String(sourceImageRevision.fileRecordId)))
  const imageRestore = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'redo', 'node-life-duplicate-image-1'),
    action: { action: 'create', creates: [{ id: 'history-created-image-id', type: 'image', position: duplicatedImage.position,
      measured: duplicatedImage.measured, data: { lcos_workspace_membership: duplicatedImage.data.lcos_workspace_membership },
      lcos_ref: imageDelete.lcos_refs[duplicatedImage.nodeId] }] },
  })
  assert.notEqual(imageRestore.nodes[0].nodeId, duplicatedImage.nodeId)
  assert.equal(imageRestore.nodes[0].nodeId, 'history-created-image-id')
  assert.equal(imageRestore.nodes[0].lcos_ref.artifactViewId, duplicatedImage.lcos_ref.artifactViewId)
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'view', duplicatedImage.lcos_ref.artifactViewId)?.spatialId,
    imageRestore.nodes[0].nodeId)
  assert.equal(facade.core.repository.getArtifactViews(sourceImageRef.artifactId).length, viewCountBeforeImage + 1)
  report.cases.push('duplicate-view undo/redo unbinds display without deleting Artifact/View/FileRecord and restores the exact View under a new NodeID')

  const originalTextBinding = facade.core.repository.getProjectionBindings(projectId)
    .find(binding => binding.canvasId === canvasId && binding.spatialId === originalTextNode.id)
  assert.equal(originalTextBinding?.entityType, 'artifact')
  const originalTextArtifact = facade.core.repository.getArtifact(originalTextBinding.entityId)
  const originalTextView = facade.core.repository.getArtifactViews(originalTextBinding.entityId)
    .find(view => String(view.scopeId) === String(mainWorkspace.scopeId) && view.referenceKind === 'primary')
  const originalTextRevision = originalTextArtifact?.currentRevisionId
    ? facade.core.repository.getArtifactRevision(String(originalTextArtifact.currentRevisionId)) : undefined
  assert.ok(originalTextArtifact && originalTextView && originalTextRevision)
  const textFileId = String(originalTextRevision.fileRecordId)
  const sourceTextRef = { version: 1, entityType: 'artifact', entityId: String(originalTextArtifact.id), artifactId: String(originalTextArtifact.id),
    artifactViewId: String(originalTextView.id), revisionId: String(originalTextRevision.id) }
  const textViewsBefore = facade.core.repository.getArtifactViews(String(originalTextArtifact.id)).length
  const textDuplicate = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'apply', 'node-life-duplicate-text-1'),
    action: { action: 'create', creates: [{ type: 'text', position: { x: 1700, y: 160 }, measured: { width: 360, height: 280 },
      data: { ...textPresentation }, lcos_ref: sourceTextRef }] },
  })
  assert.equal(textDuplicate.nodes[0].lcos_ref.entityType, 'view')
  assert.equal(textDuplicate.nodes[0].data.text, '# Main · 项目总览\n\n整理这份合成项目的 Brief 与下一步。')
  assert.equal(facade.core.repository.getArtifactViews(String(originalTextArtifact.id)).length, textViewsBefore + 1)
  assert.equal(String(facade.core.repository.getArtifactRevision(textDuplicate.nodes[0].lcos_ref.revisionId)?.fileRecordId), textFileId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(textDuplicate.nodes[0].data[key], value)
  const duplicateSpatialText = (await facade.spatial.read(canvasId)).state.nodes.find(node => node.id === textDuplicate.nodes[0].nodeId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(duplicateSpatialText.data[key], value)
  const textDuplicateDelete = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'undo', 'node-life-duplicate-text-1'),
    lcos_refs: { [textDuplicate.nodes[0].nodeId]: textDuplicate.nodes[0].lcos_ref },
    action: { action: 'delete', delete_ids: [textDuplicate.nodes[0].nodeId] },
  })
  assert.ok(facade.core.repository.getArtifactView(textDuplicate.nodes[0].lcos_ref.artifactViewId))
  const textDuplicateRestore = await lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'redo', 'node-life-duplicate-text-1'),
    action: { action: 'create', creates: [{ id: 'history-created-text-view-id', type: 'text', position: textDuplicate.nodes[0].position,
      measured: textDuplicate.nodes[0].measured, data: { ...textPresentation },
      lcos_ref: textDuplicateDelete.lcos_refs[textDuplicate.nodes[0].nodeId] }] },
  })
  assert.equal(textDuplicateRestore.nodes[0].lcos_ref.artifactViewId, textDuplicate.nodes[0].lcos_ref.artifactViewId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(textDuplicateRestore.nodes[0].data[key], value)
  const redoneSpatialText = (await facade.spatial.read(canvasId)).state.nodes.find(node => node.id === textDuplicateRestore.nodes[0].nodeId)
  for (const [key, value] of Object.entries(textPresentation)) assert.deepEqual(redoneSpatialText.data[key], value)
  assert.equal(facade.core.repository.getArtifactViews(String(originalTextArtifact.id)).length, textViewsBefore + 1)
  assert.equal(String(facade.core.repository.getArtifactRevision(textDuplicateRestore.nodes[0].lcos_ref.revisionId)?.fileRecordId), textFileId)
  report.cases.push('Core text duplicate creates one pinned View and undo/redo reuses that exact View while preserving all text-face preferences and FileRecord')

  const beforeUnknown = (await facade.spatial.read(canvasId)).state.nodes.length
  const beforeUnsupportedView = facade.core.repository.getArtifactViews(String(originalTextArtifact.id)).length
  for (const invalidPresentation of [
    { lcosTextViewMode: 'diagonal' },
    { lcosTextCollapsedIds: ['valid', 7] },
    { lcosTextBeforeMindMapSize: { width: 244, height: -1 } },
    { lcosTextBeforeMindMapSize: { width: 244, height: 150, scale: 2 } },
  ]) await assert.rejects(() => lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'apply', 'node-life-invalid-text-presentation'),
    action: { action: 'create', creates: [{ type: 'text', position: { x: 1900, y: 160 }, measured: { width: 360, height: 280 },
      data: invalidPresentation, lcos_ref: sourceTextRef }] },
  }), error => error instanceof NodeLifecycleError && error.code === 'INVALID_ARGUMENT')
  await assert.rejects(() => lifecycle.applyAction({ canvasId,
    lcos_operation: operation('duplicate-view', 'apply', 'node-life-image-text-presentation'),
    action: { action: 'create', creates: [{ type: 'image', position: { x: 1900, y: 160 }, measured: { width: 360, height: 280 },
      data: { lcosTextViewMode: 'mindmap' }, lcos_ref: sourceImageRef }] },
  }), error => error instanceof NodeLifecycleError && error.code === 'NODE_TYPE_MISMATCH')
  await assert.rejects(() => lifecycle.applyAction({ canvasId,
    lcos_operation: operation('create', 'apply', 'node-life-unknown-create'),
    action: { action: 'create', creates: [{ type: 'video', position: { x: 0, y: 0 }, data: {} }] },
  }), error => error instanceof NodeLifecycleError && error.code === 'NODE_TYPE_NOT_IMPLEMENTED')
  await assert.rejects(() => lifecycle.applyAction({ canvasId,
    lcos_operation: operation('delete', 'apply', 'node-life-unknown-action'),
    action: { action: 'duplicate', nodeIds: [originalImageNode.id] },
  }), error => error instanceof NodeLifecycleError && error.code === 'NODE_ACTION_NOT_IMPLEMENTED')
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.length, beforeUnknown)
  assert.equal(facade.core.repository.getArtifactViews(String(originalTextArtifact.id)).length, beforeUnsupportedView)
  report.cases.push('unknown create/action, invalid text preference values, and text preferences on images fail before any spatial/Core write')

  const restoredTextNodeId = textRestore.nodes[0].nodeId
  const restoredViewNodeId = imageRestore.nodes[0].nodeId
  await facade.close()
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin })
  lifecycle = connectLifecycle(facade)
  assert.ok((await facade.spatial.read(canvasId)).state.nodes.some(node => node.id === restoredTextNodeId))
  assert.ok((await facade.spatial.read(canvasId)).state.nodes.some(node => node.id === restoredViewNodeId))
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'artifact', createdText.lcos_ref.artifactId)?.spatialId,
    restoredTextNodeId)
  assert.equal(facade.core.repository.findProjectionBinding(projectId, canvasId, 'node', 'view', duplicatedImage.lcos_ref.artifactViewId)?.spatialId,
    restoredViewNodeId)
  report.cases.push('Core bindings and newly assigned Huabu NodeIDs survive closing and reopening both real stores')
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = error?.stack || String(error)
  process.exitCode = 1
} finally {
  await facade?.close()
  await writeFile(path.join(root, 'evidence', 'node-lifecycle.json'), JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify(report, null, 2))
