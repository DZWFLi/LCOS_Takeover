import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(root, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeParent, 'native-material-context-'))

try {
  const policyFile = path.join(runtimeRoot, 'native-material-context.mjs')
  await buildPilotEntry('lab/pilot/native-material-context.ts', policyFile)
  const { buildNativeMaterialContext, verifyNativeMaterialLocation } = await import(pathToFileURL(policyFile).href)

  const projectId = 'project-material-context'
  const scopeId = 'scope-root'
  const workspace = (id, canvasId) => ({ id, projectId, scopeId, canvasId, name: id,
    intent: 'general', viewport: { x: 0, y: 0, zoom: 1 }, focusedViewIds: [], visibleLayers: [],
    contextPolicy: 'workspace-related', updatedAt: '2026-10-16T00:00:00.000Z' })
  const workspaces = [
    workspace('workspace-main', 'canvas-main'),
    workspace('workspace-context', 'canvas-context'),
    workspace('workspace-workflow', 'canvas-workflow'),
    workspace('workspace-history', 'canvas-history'),
    workspace('workspace-membership-only', 'canvas-membership-only'),
  ]

  const hash = 'hash-fixture'
  const graph = {
    schemaVersion: 1, graphVersion: 1,
    project: { id: projectId, name: 'fixture', createdAt: '2026-10-16T00:00:00.000Z' },
    scopes: [{ id: scopeId, projectId, kind: 'root', name: 'Main' }],
    workspaces,
    artifacts: [
      { id: 'artifact-image', projectId, title: '原图', kind: 'image', availability: 'available',
        managed: true, currentRevisionId: 'image-v1', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
      { id: 'artifact-text', projectId, title: '会议笔记', kind: 'markdown', availability: 'available',
        managed: true, currentRevisionId: 'text-v1', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
    ],
    artifactViews: [
      { id: 'image-view', artifactId: 'artifact-image', scopeId, revisionId: 'image-v1', referenceKind: 'primary',
        position: { x: 900, y: 900 }, size: { width: 80, height: 50 }, displayMode: 'card', collapsed: false },
      { id: 'image-view-old', artifactId: 'artifact-image', scopeId, revisionId: 'image-v0', referenceKind: 'explicit_additional',
        position: { x: 1, y: 1 }, size: { width: 20, height: 20 }, displayMode: 'card', collapsed: false },
      { id: 'text-view', artifactId: 'artifact-text', scopeId, revisionId: 'text-v1', referenceKind: 'primary',
        position: { x: 700, y: 700 }, size: { width: 60, height: 40 }, displayMode: 'card', collapsed: false },
    ],
    artifactRevisions: [
      { id: 'image-v1', artifactId: 'artifact-image', fileRecordId: 'image-file-v1', contentHash: hash,
        source: 'run', runId: 'run-image-v1', status: 'current', createdAt: '2026-10-16T00:00:00.000Z' },
      { id: 'image-v0', artifactId: 'artifact-image', fileRecordId: 'image-file-v0', contentHash: 'old-hash',
        source: 'import', status: 'superseded', createdAt: '2026-10-15T00:00:00.000Z' },
      { id: 'text-v1', artifactId: 'artifact-text', fileRecordId: 'text-file-v1', contentHash: 'text-hash',
        source: 'import', status: 'current', createdAt: '2026-10-16T00:00:00.000Z' },
    ],
    fileRecords: [
      { id: 'image-file-v1', projectId, observedPath: 'registered/image-v1.png', observedHash: hash,
        size: 1024, mimeType: 'image/png', availability: 'current', modifiedAt: '2026-10-16T00:00:00.000Z', observedAt: '2026-10-16T00:00:00.000Z' },
      { id: 'image-file-v0', projectId, observedPath: 'registered/image-v0.png', observedHash: 'old-hash',
        size: 512, mimeType: 'image/jpeg', availability: 'current', modifiedAt: '2026-10-15T00:00:00.000Z', observedAt: '2026-10-15T00:00:00.000Z' },
      { id: 'text-file-v1', projectId, observedPath: 'registered/notes.md', observedHash: 'text-hash',
        size: 800, mimeType: 'text/markdown', availability: 'current', modifiedAt: '2026-10-16T00:00:00.000Z', observedAt: '2026-10-16T00:00:00.000Z' },
    ],
    relations: [], notes: [], checkpoints: [],
    workspaceMemberships: [
      ...['workspace-main', 'workspace-context', 'workspace-workflow', 'workspace-membership-only']
        .map(workspaceId => ({ workspaceId, artifactViewId: 'image-view', addedAt: '2026-10-16T00:00:00.000Z', addedBy: 'user' })),
      { workspaceId: 'workspace-history', artifactViewId: 'image-view-old', addedAt: '2026-10-16T00:00:00.000Z', addedBy: 'user' },
      { workspaceId: 'workspace-main', artifactViewId: 'text-view', addedAt: '2026-10-16T00:00:00.000Z', addedBy: 'user' },
      { workspaceId: 'workspace-membership-only', artifactViewId: 'text-view', addedAt: '2026-10-16T00:00:00.000Z', addedBy: 'user' },
    ],
    workspaceEntityMemberships: [],
  }

  const imageRef = { version: 1, entityType: 'artifact', entityId: 'artifact-image', artifactId: 'artifact-image',
    artifactViewId: 'image-view', revisionId: 'image-v1' }
  const oldImageRef = { version: 1, entityType: 'view', entityId: 'image-view-old', artifactId: 'artifact-image',
    artifactViewId: 'image-view-old', revisionId: 'image-v0' }
  const textRef = { version: 1, entityType: 'artifact', entityId: 'artifact-text', artifactId: 'artifact-text',
    artifactViewId: 'text-view', revisionId: 'text-v1' }

  const bindings = []
  const canvases = []
  for (const [workspaceId, canvasId] of [
    ['workspace-main', 'canvas-main'], ['workspace-context', 'canvas-context'], ['workspace-workflow', 'canvas-workflow'],
  ]) {
    const prefix = workspaceId.replace('workspace-', '')
    const frameId = `${prefix}-frame`
    const imageNodeId = `${prefix}-image`
    const textNodeId = `${prefix}-text`
    const imageNode = { id: imageNodeId, type: 'image', parentId: frameId, position: { x: 10, y: 20 },
      measured: { width: 40, height: 30 }, data: { lcos_ref: imageRef } }
    const textNode = { id: textNodeId, type: canvasId === 'canvas-main' ? 'note' : 'text', parentId: frameId, position: { x: 50, y: 60 },
      measured: { width: 220, height: 90 }, data: { lcos_ref: textRef } }
    canvases.push({ canvasId, nodes: [
      { id: frameId, type: 'frame', position: { x: 100, y: 200 }, measured: { width: 400, height: 300 } },
      imageNode, textNode,
    ] })
    bindings.push(
      { projectId, canvasId, spatialKind: 'node', spatialId: imageNodeId, entityType: 'artifact', entityId: 'artifact-image' },
      { projectId, canvasId, spatialKind: 'node', spatialId: textNodeId, entityType: 'artifact', entityId: 'artifact-text' },
    )
  }
  const historyNode = { id: 'history-image', type: 'image', position: { x: 30, y: 40 }, measured: { width: 90, height: 70 },
    data: { lcos_ref: oldImageRef } }
  canvases.push({ canvasId: 'canvas-history', nodes: [historyNode] })
  bindings.push({ projectId, canvasId: 'canvas-history', spatialKind: 'node', spatialId: 'history-image',
    entityType: 'view', entityId: 'image-view-old' })

  const presentations = [
    { schemaVersion: 0, id: 'presentation-context', projectId, scopeId, capability: 'context', renderer: 'canvas',
      state: { memberViewIds: ['image-view', 'image-view-old', 'text-view'], hiddenViewIds: [], positions: {}, hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {} }, version: 1, updatedBy: 'core', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
    { schemaVersion: 0, id: 'presentation-workflow', projectId, scopeId, capability: 'workflow', renderer: 'canvas',
      state: { memberViewIds: ['image-view', 'text-view'], hiddenViewIds: [], positions: {}, hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {} }, version: 1, updatedBy: 'core', createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' },
  ]

  const base = { projectId, graph, workspaces, bindings, presentations, canvases }
  const imageContext = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    artifactDetail: { artifact: graph.artifacts[0], currentRevisionId: 'image-v1',
      revisions: [{ id: 'image-v1', status: 'current', source: 'run', createdAt: '2026-10-16T00:00:00.000Z', run: { id: 'run-image-v1', instruction: 'make image', provider: 'fixture' } }] },
    sourcePath: { status: 'registered', path: 'registered/image-v1.png', exists: true, isUrl: false } })
  assert.equal(imageContext.status, 'ready')
  assert.deepEqual(imageContext.locations.filter(item => item.sameVersion).map(item => item.canvasId).sort(),
    ['canvas-context', 'canvas-main', 'canvas-workflow'])
  assert.deepEqual(imageContext.locations.find(item => item.canvasId === 'canvas-main')?.position, { x: 110, y: 220 },
    'absolute placement comes from Canvas parent+node positions, not ArtifactView.position')
  assert.deepEqual(imageContext.locations.find(item => item.canvasId === 'canvas-main')?.size, { width: 40, height: 30 },
    'Canvas measured dimensions are authoritative')
  const oldLocation = imageContext.locations.find(item => item.revisionId === 'image-v0')
  assert.equal(oldLocation?.sameVersion, false)
  assert.equal(verifyNativeMaterialLocation(imageContext, oldLocation).canNavigate, false,
    'same Artifact on another Revision is visible in results but cannot be opened as the selected version')
  const currentLocation = imageContext.locations.find(item => item.canvasId === 'canvas-main')
  assert.equal(verifyNativeMaterialLocation(imageContext, currentLocation).canNavigate, true)
  assert.equal(imageContext.memberships.find(item => item.kind === 'workspace' && item.workspaceId === 'workspace-membership-only')?.placed, false,
    'workspace membership without a verified Canvas node is not presented as placement')
  assert.equal(imageContext.source.revision.source, 'run')
  assert.equal(imageContext.source.revision.runId, 'run-image-v1')
  assert.equal('birthRunId' in imageContext.source.revision, false, 'selected Revision run is not mislabeled as Artifact birth provenance')
  assert.deepEqual(imageContext.source.registeredSource, { status: 'registered', path: 'registered/image-v1.png', exists: true, isUrl: false })

  const textContext = buildNativeMaterialContext({ ...base, artifactId: 'artifact-text', revisionId: 'text-v1',
    sourcePath: { status: 'unregistered' } })
  assert.equal(textContext.status, 'ready')
  assert.deepEqual(textContext.locations.filter(item => item.sameVersion).map(item => item.canvasId).sort(),
    ['canvas-context', 'canvas-main', 'canvas-workflow'], 'text artifacts use the native text ref and existing exact-version verifier')
  assert.deepEqual(textContext.source.registeredSource, { status: 'unregistered' })
  assert.equal(textContext.memberships.find(item => item.kind === 'presentation' && item.capability === 'context')?.placed, true)

  const missingPinnedRevision = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    graph: { ...graph, artifactViews: graph.artifactViews.map(view => view.id === 'image-view-old' ? { ...view, revisionId: undefined } : view) } })
  assert.equal(missingPinnedRevision.memberships.some(row => row.artifactViewId === 'image-view-old'), false,
    'An unresolved additional View cannot borrow Current even for membership metadata.')
  const primaryTextView = buildNativeMaterialContext({ ...base, artifactId: 'artifact-text', revisionId: 'text-v1',
    bindings: bindings.map(binding => binding.spatialId === 'main-text' ? { ...binding, entityType: 'view', entityId: 'text-view' } : binding),
    canvases: canvases.map(canvas => canvas.canvasId === 'canvas-main' ? { ...canvas, nodes: canvas.nodes.map(node => node.id === 'main-text'
      ? { ...node, data: { lcos_ref: { ...textRef, entityType: 'view', entityId: 'text-view' } } } : node) } : canvas) })
  assert.equal(primaryTextView.locations.some(row => row.nodeId === 'main-text'), true,
    'A read-only exact View binding is legal for primary as well as additional Views; no editing permission is inferred.')

  const missingTextBinding = buildNativeMaterialContext({ ...base, artifactId: 'artifact-text', revisionId: 'text-v1',
    bindings: bindings.filter(binding => binding.spatialId !== 'main-text') })
  assert.equal(missingTextBinding.locations.some(item => item.nodeId === 'main-text'), false)
  assert.match(missingTextBinding.rejectedLocations.find(item => item.nodeId === 'main-text')?.reason ?? '', /binding|绑定/i)

  const duplicateBinding = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    bindings: [...bindings, { ...bindings[0] }] })
  assert.equal(duplicateBinding.locations.some(item => item.nodeId === 'main-image'), false)
  assert.match(duplicateBinding.rejectedLocations.find(item => item.nodeId === 'main-image')?.reason ?? '', /binding|绑定/i)

  const missingMeasured = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    canvases: canvases.map(canvas => canvas.canvasId === 'canvas-main' ? { ...canvas, nodes: canvas.nodes.map(node =>
      node.id === 'main-image' ? { ...node, measured: undefined } : node) } : canvas) })
  assert.equal(missingMeasured.locations.some(item => item.nodeId === 'main-image'), false)
  assert.match(missingMeasured.rejectedLocations.find(item => item.nodeId === 'main-image')?.reason ?? '', /measured/i)

  const foreignWorkspace = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    workspaces: workspaces.map(item => item.id === 'workspace-main' ? { ...item, projectId: 'foreign-project' } : item) })
  assert.equal(foreignWorkspace.locations.some(item => item.canvasId === 'canvas-main'), false)
  assert.match(foreignWorkspace.rejectedLocations.find(item => item.canvasId === 'canvas-main')?.reason ?? '', /Workspace/)

  const foreignFile = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    graph: { ...graph, fileRecords: graph.fileRecords.map(file => file.id === 'image-file-v1'
      ? { ...file, projectId: 'foreign-project' } : file) } })
  assert.equal(foreignFile.status, 'unavailable')
  assert.deepEqual(foreignFile.locations, [])

  const duplicateWorkspaceCanvas = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    graph: { ...graph, workspaces: [...graph.workspaces, { ...workspaces[0], id: 'workspace-duplicate' }] } })
  assert.equal(duplicateWorkspaceCanvas.locations.some(item => item.canvasId === 'canvas-main'), false)
  assert.match(duplicateWorkspaceCanvas.rejectedLocations.find(item => item.canvasId === 'canvas-main')?.reason ?? '', /Workspace/)

  const brokenParent = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    canvases: canvases.map(canvas => canvas.canvasId === 'canvas-main' ? { ...canvas, nodes: canvas.nodes.map(node =>
      node.id === 'main-frame' ? { ...node, parentId: 'main-image' } : node) } : canvas) })
  assert.equal(brokenParent.locations.some(item => item.canvasId === 'canvas-main'), false)
  assert.match(brokenParent.rejectedLocations.find(item => item.nodeId === 'main-image')?.reason ?? '', /循环/)

  const incoherentDetail = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'image-v1',
    artifactDetail: { artifact: { ...graph.artifacts[0], id: 'another-artifact' }, currentRevisionId: 'image-v1', revisions: [] } })
  assert.equal(incoherentDetail.status, 'unavailable')
  assert.match(incoherentDetail.issues[0], /detail/i)

  const unresolved = buildNativeMaterialContext({ ...base, artifactId: 'artifact-image', revisionId: 'missing-revision' })
  assert.equal(unresolved.status, 'unavailable', 'missing selected Revision never falls back to Current')
  assert.deepEqual(unresolved.locations, [])

  process.stdout.write(JSON.stringify({
    test: 'native-material-context',
    sameArtifactAcrossThreeWorksites: true,
    otherRevisionIsVisibleButNotNavigable: true,
    textAndImageNativeRefs: true,
    workspaceMembershipSeparatedFromPlacement: true,
    absoluteCanvasGeometryAndMeasuredSize: true,
    duplicateBindingForeignWorkspaceAndInvalidGeometryRejected: true,
    exactFileCoherenceAndTextBindingVerified: true,
    selectedRevisionNeverFallsBackToCurrent: true,
  }) + '\n')
} finally {
  await rm(runtimeRoot, { recursive: true, force: true })
}
