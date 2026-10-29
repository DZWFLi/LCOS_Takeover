import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-space-history')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const report = {
  at: new Date().toISOString(), reportPath, runtimeRoot,
  test: 'native-collection-space-history',
  implementation: 'restricted collection-space history adapter over original Gen2 planner, same O8 operation snapshot and one locked Huabu batch per phase',
  boundary: 'Core Collection/Artifact/membership/binding truth is read-only; only one Collection frame and exact same-Canvas member geometry/parent are changed',
  currentRoot: currentGen2Root,
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { allowedCoreRequests: [], rejectedDeadSemanticRequests: [], blockedRequests: [], activeListeners: [], activeListenersAtClose: [] },
  fixture: {}, cases: [], cleanup: { facadeClosed: false, listenersReleased: false, runtimeRemoved: false }, passed: false,
}
const originalFetch = globalThis.fetch.bind(globalThis)
const coreOrigins = new Set()
let facade
let coreOrigin
let repository
let fetchInstalled = false
let bootstrapping = false

function isLoopback(host) { return ['127.0.0.1', 'localhost', '[::1]'].includes(host) }
function activeLoopbackOrigins() {
  const result = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    result.add(`http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`)
  }
  return result
}
function assertContained(parent, target) {
  const resolvedParent = path.resolve(parent), resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget) throw new Error(`Refusing cleanup outside owned runtime: ${resolvedTarget}`)
}
function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.rejectedDeadSemanticRequests.push({ method, path: url.pathname })
      throw new Error('Pinned dead semantic endpoint; no model/provider access is allowed.')
    }
    const active = activeLoopbackOrigins()
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && ((coreOrigins.has(url.origin) && active.has(url.origin))
        || (bootstrapping && active.size === 1 && [...active][0] === url.origin))) {
      const response = await originalFetch(input, init)
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status })
      return response
    }
    report.network.blockedRequests.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only the test-owned isolated Core loopback listener and pinned dead semantic endpoint are permitted.')
  }
}
function relativeImport(fromFile, targetFile) {
  let value = path.relative(path.dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = './' + value
  return value
}
async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const payload = (response.headers.get('content-type') || '').includes('application/json')
    ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, body: payload }
}
async function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
}
function valueOf(result) { return result?.body?.data ?? result?.body?.value ?? result?.body }
function errorCode(result) { return result?.body?.error?.code ?? result?.body?.code ?? result?.body?.errorCode }
function statusError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error }
async function exactFile(projectId, id) {
  const response = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(id)}/content`)
  assert.equal(response.status, 200)
  return response.body
}
function clone(value) { return structuredClone(value) }
function parentWire(slice) { return slice.parentId ?? '' }

const providerEnv = ['LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT',
  'LCOS_INTELLIGENCE_PROVIDERS', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY',
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY',
  'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY',
  'QWEN_BASE_URL', 'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'HUNYUAN_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'LMSTUDIO_BASE_URL', 'LCOS_BRIDGE_URL']

try {
  for (const key of providerEnv) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  assert.equal(activeLoopbackOrigins().size, 0, 'history adapter test must not inherit a server listener')
  installFetchBoundary()

  const ownersEntry = path.join(runtimeRoot, 'native-collection-space-history-test-owners.ts')
  await writeFile(ownersEntry, [
    `export { startSurfaceCoreFacade } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/surface-core-facade.ts')))}`,
    `export { Gen2Host } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/host/projectionFacade.ts')))}`,
    `export { HttpClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/client.ts')))}`,
    `export { CoreArtifactClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/artifacts.ts')))}`,
    `export { createHeadlessProjectionPort } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/headless-projection-port.ts')))}`,
    `export { createNativeCollectionSpace } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space.ts')))}`,
    `export { createNativeCollectionSpaceHistory } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space-history.ts')))}`,
    `export { createNodeLifecycle } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/node-lifecycle.ts')))}`,
  ].join('\n'), 'utf8')
  const ownersBundle = path.join(runtimeRoot, 'native-collection-space-history-test-owners.mjs')
  await buildPilotEntry(path.relative(root, ownersEntry), ownersBundle)
  const owners = await import(pathToFileURL(ownersBundle).href)

  bootstrapping = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, fullIntegration: true })
  coreOrigin = String(facade.core.origin)
  repository = facade.core.repository
  assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false)
  coreOrigins.add(coreOrigin)
  assert.deepEqual([...activeLoopbackOrigins()], [coreOrigin])
  report.network.activeListeners.push(coreOrigin)
  bootstrapping = false

  const projectId = String(facade.core.projectId)
  const workspace = facade.workspaces.find(row => row.preferredSurface === 'main')
  const rootScope = repository.getScopes(projectId).find(row => row.kind === 'root')
  assert.ok(workspace?.canvasId && rootScope)
  const canvasId = String(workspace.canvasId)
  const hosts = new Map()
  const projectionHost = targetCanvas => {
    if (targetCanvas !== canvasId) throw new Error('This test factory exposes only its one fresh synthetic Canvas.')
    let host = hosts.get(targetCanvas)
    if (!host) {
      host = new owners.Gen2Host({ projectId, http: new owners.HttpClient({ baseUrl: coreOrigin }),
        rfs: owners.createHeadlessProjectionPort({ canvasId, coreOrigin, read: facade.spatial.read, execute: facade.spatial.execute }) })
      hosts.set(targetCanvas, host)
    }
    return host
  }
  const host = projectionHost(canvasId)
  const artifacts = new owners.CoreArtifactClient(new owners.HttpClient({ baseUrl: coreOrigin }))
  const body = '这段合成材料用于原 O8 空间历史回归，不属于真实项目内容。\nCOLLECTION_SPACE_HISTORY_TEXT_TAIL_雪'
  const text = await artifacts.createTextArtifact(projectId, { title: 'Native Collection history fixture', body, scopeId: String(rootScope.id) })
  const membership = [{ type: 'artifact', id: text.artifactId }]
  const collectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection O8 history fixture', members: membership,
  })
  assert.equal(collectionResponse.status, 201, JSON.stringify(collectionResponse.body))
  const collectionId = String(collectionResponse.body?.value?.id ?? '')
  assert.ok(collectionId)
  const accepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  const projected = await host.projectArtifacts([{ projectId, artifactId: String(text.artifactId), kind: 'text', title: text.title,
    fileRecordId: String(text.fileRecordId), currentRevisionId: String(text.revisionId), mimeType: 'text/markdown', size: { width: 260, height: 180 } }])
  assert.equal(projected.length, 1)
  const memberId = String(projected[0].spatialId)
  const primaryView = repository.getArtifactViews(String(text.artifactId)).find(view => String(view.scopeId) === String(workspace.scopeId)
    && view.referenceKind === 'primary' && String(view.revisionId) === String(text.revisionId))
  assert.ok(primaryView, 'the text producer must provide its real scoped primary View')
  const lifecycle = owners.createNodeLifecycle({ repository, projectId, spatial: facade.spatial,
    workspaceForCanvas: targetCanvas => repository.getWorkspaces(projectId).find(row => String(row.canvasId) === targetCanvas),
    publicOrigin: coreOrigin, coreOrigin })
  const duplicateView = await lifecycle.applyAction({ canvasId,
    lcos_operation: { version: 1, operationId: `space-view-${process.pid}-${Date.now()}`, kind: 'duplicate-view', phase: 'apply' },
    action: { action: 'create', creates: [{ id: `node-${randomUUID()}`, type: 'text', position: { x: 850, y: 520 },
      measured: { width: 260, height: 180 }, data: { title: text.title, text: body, content: body },
      lcos_ref: { version: 1, entityType: 'artifact', entityId: String(text.artifactId), artifactId: String(text.artifactId),
        artifactViewId: String(primaryView.id), revisionId: String(text.revisionId) } }] } })
  const viewMemberId = String(duplicateView.nodes[0]?.nodeId ?? '')
  assert.ok(viewMemberId && viewMemberId !== memberId)
  const rawViewBinding = repository.getProjectionBindings(projectId).find(row => row.canvasId === canvasId && row.spatialId === viewMemberId)
  assert.equal(rawViewBinding?.entityType, 'view', 'the duplicate must be a real additional ArtifactView carrier')
  const normalizedViewBinding = (await host.listNodeBindings()).filter(row => row.spatialId === viewMemberId)
  assert.equal(normalizedViewBinding.length, 1)
  assert.deepEqual({ entityType: normalizedViewBinding[0].entityType, entityId: normalizedViewBinding[0].entityId },
    { entityType: 'artifact', entityId: String(text.artifactId) }, 'the original Gen2Host normalization maps the view to its Artifact')
  const ownerResult = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
  assert.equal(ownerResult.status, 200, JSON.stringify(ownerResult.body))
  const collectionNodeId = String(valueOf(ownerResult).binding.spatialId)
  const collide = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: memberId, position: { x: 720, y: 440 } },
  ] }])
  assert.ok(collide.results.every(result => result.applied === true))

  const failure = (status, code, message) => statusError(status, code, message)
  const collectionSpace = owners.createNativeCollectionSpace({ repository, projectId, spatial: facade.spatial,
    projectionHost, fail: failure })
  const readCanvasDto = async targetCanvas => {
    const response = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(targetCanvas)}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    return valueOf(response)
  }
  const projectNativeNodes = async (targetCanvas, snapshot) => {
    const current = await readCanvasDto(targetCanvas)
    const existing = new Map(current.nodes.map(node => [String(node.id), node]))
    return snapshot.state.nodes.map(node => {
      if (node.type === 'frame') {
        const collection = repository.getCollection(String(node.data?.lcosCollectionId))
        assert.ok(collection)
        const size = { width: Number(node.measured?.width ?? node.style?.width ?? node.width),
          height: Number(node.measured?.height ?? node.style?.height ?? node.height) }
        return { id: String(node.id), canvas_id: targetCanvas, type: 'group', position: { ...node.position }, measured: size,
          width: size.width, height: size.height,
          ...(node.parentId ? { parent_id: String(node.parentId) } : {}),
          data: { id: String(node.id), title: String(collection.title), createdBy: 'client', loading: false,
            layoutType: 'none', lcosCollectionId: String(collection.id), lcosCollectionNodeId: String(node.data.lcosCollectionNodeId) } }
      }
      const prior = existing.get(String(node.id))
      assert.ok(prior, `native DTO projection needs existing canonical node ${node.id}`)
      return { ...prior, position: { ...node.position },
        ...(node.parentId ? { parent_id: String(node.parentId) } : { parent_id: '' }) }
    })
  }
  const history = owners.createNativeCollectionSpaceHistory({ repository, projectId, spatial: facade.spatial,
    collectionSpace, projectNativeNodes, fail: failure })
  const spacePath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/space`
  const prepared = await collectionSpace.prepare({ canvasId, collectionId, collectionNodeId })
  assert.equal(prepared.created, true)
  assert.equal(prepared.nodeIds.includes(memberId), true)
  assert.equal(prepared.nodeIds.includes(viewMemberId), true, 'the planner joins canonical Artifact membership to the normalized view-bound spatial node')
  assert.equal(prepared.before.some(slice => slice.id === memberId && slice.parentId === null), true)
  assert.equal(prepared.after.some(slice => slice.id === memberId && slice.parentId === prepared.frameId), true)
  assert.equal(prepared.after.some(slice => slice.id === prepared.frameId), true)
  assert.equal(prepared.sourceVersion, (await facade.spatial.read(canvasId)).version)
  const operationBase = { version: 1, operationId: `native-collection-space-${process.pid}-${Date.now()}`,
    kind: 'collection-space', space: { projectId, canvasId, workspaceId: String(workspace.id), collectionId,
      collectionNodeId, frameId: prepared.frameId, sourceVersion: prepared.sourceVersion,
      before: prepared.before, after: prepared.after } }
  const nativeBefore = new Map((await projectNativeNodes(canvasId, prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const nativeAfter = new Map((await projectNativeNodes(canvasId, prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const makeApplyActions = () => {
    const frame = nativeAfter.get(prepared.frameId)
    assert.ok(frame)
    return [
      { action: 'create', nodes: [{ id: frame.id, canvas_id: frame.canvas_id, type: frame.type,
        position: frame.position, measured: frame.measured, data: frame.data,
        ...(frame.parent_id ? { parent_id: frame.parent_id } : {}) }] },
      { action: 'update', updates: prepared.before.filter(slice => slice.id !== prepared.frameId).map(slice => {
        const node = nativeBefore.get(slice.id), target = nativeAfter.get(slice.id)
        assert.ok(node && target)
        return { id: slice.id, canvas_id: canvasId, type: node.type, data: node.data,
          position: target.position, measured: target.measured, parent_id: parentWire(prepared.after.find(item => item.id === slice.id)) }
      }) },
    ]
  }
  const applyActions = makeApplyActions()
  const expectedRevisions = { [memberId]: String(text.revisionId), [viewMemberId]: String(text.revisionId) }
  const versionBefore = prepared.sourceVersion
  const artifactBefore = repository.getArtifact(text.artifactId)
  const revisionBefore = repository.getArtifactRevision(text.revisionId)
  const fileBytesBefore = await exactFile(projectId, String(text.fileRecordId))
  const membershipBefore = repository.listCollectionMemberships(projectId, collectionId).map(row => row.memberRef)
  const bindingBefore = repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
    && [collectionNodeId, memberId, viewMemberId].includes(row.spatialId))
  const runCountBefore = repository.getProjectRuns(projectId, 100).length

  const forgedApply = clone(applyActions)
  forgedApply[1].updates[0].data = { ...forgedApply[1].updates[0].data, title: 'forged title write' }
  await assert.rejects(history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: forgedApply }), error => error.status === 501
      && error.code === 'COLLECTION_SPACE_MATERIAL_WRITE_NOT_ALLOWED')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore, 'material data edits are rejected before spatial write')
  report.cases.push('r6 create/update action validator rejects a material title/data write before any spatial command')

  const mixedOutsideScope = clone(applyActions)
  mixedOutsideScope[1].updates.push({ id: collectionNodeId, canvas_id: canvasId, type: 'lcos-collection',
    position: { x: 999, y: 999 }, parent_id: '' })
  await assert.rejects(history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: mixedOutsideScope }), error => error.status === 409
      && error.code === 'COLLECTION_SPACE_ACTION_SET_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore)
  report.cases.push('mixed action touching the Collection owner outside the exact prepared child set fails before write')

  const staleApply = await history.applyOperation({ canvasId, expectedVersion: versionBefore + 1,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions }).then(() => ({ ok: true }), error => error)
  assert.equal(staleApply.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore)
  report.cases.push('stale apply expectedCanvasVersion returns 409 with zero version change')

  const malformedRevisions = await history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions, expectedRevisions: [] }).then(() => ({ ok: true }), error => error)
  assert.equal(malformedRevisions.status, 400)
  assert.equal(malformedRevisions.code, 'COLLECTION_SPACE_REVISIONS_INVALID')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore)
  const unknownRevisionNodeId = `node-${randomUUID()}`
  const unknownRevision = await history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions,
    expectedRevisions: { [unknownRevisionNodeId]: String(text.revisionId) } }).then(() => ({ ok: true }), error => error)
  assert.equal(unknownRevision.status, 409)
  assert.equal(unknownRevision.code, 'COLLECTION_SPACE_REVISION_SCOPE_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore)
  const staleMaterialRevision = await history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions,
    expectedRevisions: { [memberId]: `revision-stale-${randomUUID()}` } }).then(() => ({ ok: true }), error => error)
  assert.equal(staleMaterialRevision.status, 409)
  assert.equal(staleMaterialRevision.code, 'COLLECTION_SPACE_REVISION_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBefore)
  report.cases.push('malformed, out-of-operation and stale original lcos_expected_revisions entries fail before any Canvas write')

  const applied = await history.applyOperation({ canvasId, expectedVersion: versionBefore,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions, expectedRevisions })
  assert.equal(applied.created, true)
  assert.equal(applied.frame_id, prepared.frameId)
  assert.equal(applied.from_version, versionBefore)
  assert.equal(applied.to_version, versionBefore + 1)
  const afterApply = await facade.spatial.read(canvasId)
  const createdFrame = afterApply.state.nodes.find(node => String(node.id) === prepared.frameId)
  assert.equal(createdFrame?.data?.lcosCollectionId, collectionId)
  assert.equal(afterApply.state.nodes.find(node => String(node.id) === memberId)?.parentId, prepared.frameId)
  assert.equal(afterApply.state.nodes.find(node => String(node.id) === memberId)?.position.x, prepared.after.find(slice => slice.id === memberId).position.x)
  report.cases.push('apply recomputed the original locked planner and committed frame create + member parent/position as one Huabu version')

  const undoActions = [
    { action: 'delete', delete_ids: [prepared.frameId] },
    { action: 'update', updates: prepared.before.map(slice => {
      const node = nativeBefore.get(slice.id)
      assert.ok(node)
      return { id: slice.id, canvas_id: canvasId, type: node.type, data: node.data, position: slice.position,
        measured: node.measured, parent_id: parentWire(slice) }
    }) },
  ]
  const badUndo = clone(undoActions)
  badUndo[1].updates[0].position = { x: 123456, y: -54321 }
  const beforeBadUndoVersion = afterApply.version
  const staleUndo = await history.applyOperation({ canvasId, expectedVersion: beforeBadUndoVersion - 1,
    operation: { ...operationBase, phase: 'undo' }, actions: undoActions }).then(() => ({ ok: true }), error => error)
  assert.equal(staleUndo.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, beforeBadUndoVersion)
  report.cases.push('Undo has its own current-version CAS; an old apply/source version is not reused')
  await assert.rejects(history.applyOperation({ canvasId, expectedVersion: beforeBadUndoVersion,
    operation: { ...operationBase, phase: 'undo' }, actions: badUndo }), error => error.status === 409
      && error.code === 'COLLECTION_SPACE_ACTION_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeBadUndoVersion)
  report.cases.push('undo refuses an O8 target position that does not match the recorded before slice')

  const removedMember = await coreRequest('DELETE', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`, {
    memberType: 'artifact', memberId: String(text.artifactId),
  })
  assert.equal(removedMember.status, 200, JSON.stringify(removedMember.body))
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), [], 'the existing Core member action removes the canonical member before history Undo')
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(node => String(node.id) === memberId)?.parentId, prepared.frameId,
    'removing Core membership must not mutate existing Canvas parentage')
  report.cases.push('the real Core Collection member-removal producer removed membership while leaving both spatial carriers under the frame')

  const undo = await history.applyOperation({ canvasId, expectedVersion: beforeBadUndoVersion,
    operation: { ...operationBase, phase: 'undo' }, actions: undoActions, expectedRevisions })
  assert.equal(undo.created, false)
  assert.equal(undo.frame_id, prepared.frameId)
  const afterUndo = await facade.spatial.read(canvasId)
  assert.equal(afterUndo.state.nodes.some(node => String(node.id) === prepared.frameId), false)
  const restoredMember = afterUndo.state.nodes.find(node => String(node.id) === memberId)
  assert.equal(restoredMember?.parentId, undefined)
  assert.deepEqual(restoredMember?.position, prepared.before.find(slice => slice.id === memberId).position)
  assert.equal(afterUndo.state.nodes.find(node => String(node.id) === viewMemberId)?.parentId, undefined)
  assert.equal(undo.to_version, beforeBadUndoVersion + 1)
  report.cases.push('undo detaches children before DISSOLVE_FRAME and restores exact old parent/position without deleting the material carrier')

  const undoReplay = await history.applyOperation({ canvasId, expectedVersion: undo.to_version,
    operation: { ...operationBase, phase: 'undo' }, actions: undoActions, expectedRevisions })
  assert.equal(undoReplay.idempotent, true)
  assert.equal(undoReplay.to_version, undo.to_version)
  report.cases.push('duplicate Undo recognizes the exact already-restored before side without another Canvas version')

  const afterUndoneNative = new Map((await projectNativeNodes(canvasId, prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const afterRedoNative = new Map((await projectNativeNodes(canvasId, prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const redoActions = [
    { action: 'create', nodes: [{ id: prepared.frameId, canvas_id: canvasId, type: 'group',
      position: afterRedoNative.get(prepared.frameId).position, measured: afterRedoNative.get(prepared.frameId).measured,
      data: afterRedoNative.get(prepared.frameId).data }] },
    { action: 'update', updates: prepared.before.map(slice => {
      const node = afterUndoneNative.get(slice.id), target = afterRedoNative.get(slice.id)
      assert.ok(node && target)
      return { id: slice.id, canvas_id: canvasId, type: node.type, data: node.data, position: target.position,
        measured: target.measured, parent_id: parentWire(prepared.after.find(item => item.id === slice.id)) }
    }) },
  ]
  const redoWrongId = clone(redoActions)
  redoWrongId[0].nodes[0].id = `node-${randomUUID()}`
  const beforeBadRedo = (await facade.spatial.read(canvasId)).version
  await assert.rejects(history.applyOperation({ canvasId, expectedVersion: beforeBadRedo,
    operation: { ...operationBase, phase: 'redo' }, actions: redoWrongId }), error => error.status === 409
      && error.code === 'COLLECTION_SPACE_FRAME_CREATE_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeBadRedo)
  report.cases.push('redo refuses a native remapped frame id; the scoped O8 stable-id exception must deliver the original frame id')

  const staleRedo = await history.applyOperation({ canvasId, expectedVersion: beforeBadRedo - 1,
    operation: { ...operationBase, phase: 'redo' }, actions: redoActions }).then(() => ({ ok: true }), error => error)
  assert.equal(staleRedo.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, beforeBadRedo)
  report.cases.push('Redo uses the current post-Undo expected version and rejects stale replay with zero write')

  const redo = await history.applyOperation({ canvasId, expectedVersion: beforeBadRedo,
    operation: { ...operationBase, phase: 'redo' }, actions: redoActions, expectedRevisions })
  assert.equal(redo.frame_id, prepared.frameId)
  assert.equal(redo.created, true)
  const afterRedo = await facade.spatial.read(canvasId)
  assert.ok(afterRedo.state.nodes.some(node => String(node.id) === prepared.frameId), 'redo must recreate the exact original frame id')
  assert.deepEqual(afterRedo.state.nodes.filter(node => node.parentId === prepared.frameId).map(node => String(node.id)).sort(),
    [memberId, viewMemberId].sort(), 'redo restores the recorded O8 child set rather than recomputing today\'s empty membership')
  assert.equal(afterRedo.state.nodes.find(node => String(node.id) === memberId)?.parentId, prepared.frameId)
  assert.equal(afterRedo.state.nodes.find(node => String(node.id) === viewMemberId)?.parentId, prepared.frameId)
  report.cases.push('redo used Huabu CREATE_NODES with the exact original frame id and restored the same bound member under it')

  const idempotentApply = await history.applyOperation({ canvasId, expectedVersion: redo.to_version,
    operation: { ...operationBase, phase: 'apply' }, actions: applyActions, expectedRevisions })
  assert.equal(idempotentApply.idempotent, true)
  assert.equal(idempotentApply.to_version, redo.to_version)

  const edgeId = `edge-${randomUUID()}`
  const edgeReceipt = await facade.spatial.execute(canvasId, [{ type: 'CONNECT_NODES', edges: [
    { id: edgeId, source: prepared.frameId, target: memberId },
  ] }])
  assert.ok(edgeReceipt.results.every(result => result.applied === true), JSON.stringify(edgeReceipt.results))
  const beforeEdgeUndo = await facade.spatial.read(canvasId)
  assert.ok(beforeEdgeUndo.state.edges.some(edge => String(edge.id) === edgeId))
  const edgeUndo = await history.applyOperation({ canvasId, expectedVersion: beforeEdgeUndo.version,
    operation: { ...operationBase, phase: 'undo' }, actions: undoActions, expectedRevisions }).then(() => ({ ok: true }), error => error)
  assert.equal(edgeUndo.status, 409)
  assert.equal(edgeUndo.code, 'COLLECTION_SPACE_FRAME_HAS_EDGES')
  const afterEdgeUndo = await facade.spatial.read(canvasId)
  assert.equal(afterEdgeUndo.version, beforeEdgeUndo.version, 'unknown frame edges reject Undo before a spatial write')
  assert.deepEqual(afterEdgeUndo.state.edges, beforeEdgeUndo.state.edges, 'Undo refusal must retain the exact edge')
  assert.ok(afterEdgeUndo.state.nodes.some(node => String(node.id) === prepared.frameId))
  report.cases.push('a real Huabu edge attached to the frame makes Undo fail closed; the frame, edge, and Canvas version remain unchanged')

  const emptyCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection empty-frame history fixture', members: [],
  })
  assert.equal(emptyCollectionResponse.status, 201, JSON.stringify(emptyCollectionResponse.body))
  const emptyCollectionId = String(emptyCollectionResponse.body?.value?.id ?? '')
  assert.ok(emptyCollectionId)
  const emptyAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: emptyCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(emptyAccepted.status, 200, JSON.stringify(emptyAccepted.body))
  const emptyOwnerResult = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, {
    collectionId: emptyCollectionId,
  })
  assert.equal(emptyOwnerResult.status, 200, JSON.stringify(emptyOwnerResult.body))
  const emptyCollectionNodeId = String(valueOf(emptyOwnerResult).binding.spatialId)
  const emptyPrepared = await collectionSpace.prepare({ canvasId, collectionId: emptyCollectionId,
    collectionNodeId: emptyCollectionNodeId })
  assert.equal(emptyPrepared.created, true)
  assert.equal(emptyPrepared.before.length, 0)
  assert.deepEqual(emptyPrepared.after.map(slice => slice.id), [emptyPrepared.frameId])
  const emptyOperation = { version: 1, operationId: `empty-frame-${process.pid}-${Date.now()}`, kind: 'collection-space',
    phase: 'apply', space: { projectId, canvasId, workspaceId: String(workspace.id), collectionId: emptyCollectionId,
      collectionNodeId: emptyCollectionNodeId, frameId: emptyPrepared.frameId, sourceVersion: emptyPrepared.sourceVersion,
      before: emptyPrepared.before, after: emptyPrepared.after } }
  const emptyFrameDto = new Map((await projectNativeNodes(canvasId, emptyPrepared.afterSnapshot)).map(node => [String(node.id), node]))
    .get(emptyPrepared.frameId)
  assert.ok(emptyFrameDto)
  const emptyCreateActions = [{ action: 'create', nodes: [{ id: emptyFrameDto.id, canvas_id: emptyFrameDto.canvas_id,
    type: emptyFrameDto.type, position: emptyFrameDto.position, measured: emptyFrameDto.measured, data: emptyFrameDto.data }] }]
  const emptyApply = await history.applyOperation({ canvasId, expectedVersion: emptyPrepared.sourceVersion,
    operation: emptyOperation, actions: emptyCreateActions, expectedRevisions: {} })
  assert.equal(emptyApply.created, true)
  assert.equal(emptyApply.frame_id, emptyPrepared.frameId)
  const emptyAfterApply = await facade.spatial.read(canvasId)
  assert.equal(emptyAfterApply.state.nodes.some(node => String(node.id) === emptyPrepared.frameId), true)
  assert.equal(emptyAfterApply.state.nodes.some(node => node.parentId === emptyPrepared.frameId), false)
  const emptyUndoActions = [{ action: 'delete', delete_ids: [emptyPrepared.frameId] }]
  const emptyUndo = await history.applyOperation({ canvasId, expectedVersion: emptyApply.to_version,
    operation: { ...emptyOperation, phase: 'undo' }, actions: emptyUndoActions, expectedRevisions: {} })
  assert.equal(emptyUndo.created, false)
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.some(node => String(node.id) === emptyPrepared.frameId), false)
  const emptyRedo = await history.applyOperation({ canvasId, expectedVersion: emptyUndo.to_version,
    operation: { ...emptyOperation, phase: 'redo' }, actions: emptyCreateActions, expectedRevisions: {} })
  assert.equal(emptyRedo.created, true)
  assert.equal(emptyRedo.frame_id, emptyPrepared.frameId)
  const emptyAfterRedo = await facade.spatial.read(canvasId)
  assert.equal(emptyAfterRedo.state.nodes.some(node => String(node.id) === emptyPrepared.frameId), true)
  assert.equal(emptyAfterRedo.state.nodes.some(node => node.parentId === emptyPrepared.frameId), false)
  assert.equal(emptyAfterRedo.version, emptyPrepared.sourceVersion + 3)
  report.cases.push('an empty canonical Collection completed frame-only Apply/Undo/Redo with the exact same frame id and no child or material changes')

  assert.deepEqual(repository.getArtifact(text.artifactId), artifactBefore)
  assert.deepEqual(repository.getArtifactRevision(text.revisionId), revisionBefore)
  assert.deepEqual(await exactFile(projectId, String(text.fileRecordId)), fileBytesBefore)
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), [], 'Undo/Redo must not restore the removed Core membership')
  assert.deepEqual(repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
    && [collectionNodeId, memberId, viewMemberId].includes(row.spatialId)), bindingBefore)
  assert.equal(repository.getProjectRuns(projectId, 100).length, runCountBefore)
  assert.deepEqual(report.network.blockedRequests, [])
  const finalCanvas = await facade.spatial.read(canvasId)
  report.fixture = { projectId, canvasId, workspaceId: String(workspace.id), collectionId, collectionNodeId,
    frameId: prepared.frameId, memberId, viewMemberId, sourceVersion: prepared.sourceVersion,
    applyVersion: applied.to_version, undoVersion: undo.to_version, redoVersion: redo.to_version,
    membershipCountBeforeRemoval: membershipBefore.length, membershipCountAfterRemoval: repository.listCollectionMemberships(projectId, collectionId).length,
    frameEdgeId: edgeId, emptyCollectionId, emptyFrameId: emptyPrepared.frameId,
    emptyFrameVersions: [emptyPrepared.sourceVersion, emptyApply.to_version, emptyUndo.to_version, emptyRedo.to_version],
    runCount: runCountBefore }
  report.final = { canvasVersion: finalCanvas.version, runCount: repository.getProjectRuns(projectId, 100).length,
    collectionCount: (await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/collections`)).body?.value?.length }
  report.cases.push('Apply/Undo/Redo preserved removed Core membership as removed, canonical view/artifact bindings and file bytes; historical child set returned without consulting current membership and no Runs were created')
  report.cases.push('exact current Artifact and additional-View Revision echoes were accepted across Apply/Undo/Redo; frame-only history accepted an empty revision map')
  report.passed = true
} catch (error) {
  report.failure = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
  process.exitCode = 1
} finally {
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.closeError = error instanceof Error ? error.message : String(error) }
  }
  report.network.activeListenersAtClose = [...activeLoopbackOrigins()]
  report.cleanup.listenersReleased = report.network.activeListenersAtClose.length === 0
  globalThis.fetch = originalFetch
  const resolvedRuntime = path.resolve(runtimeRoot)
  try {
    assertContained(reportRoot, resolvedRuntime)
    if (report.cleanup.facadeClosed && report.cleanup.listenersReleased) {
      await rm(resolvedRuntime, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    }
  } catch (error) {
    report.cleanup.removalError = error instanceof Error ? error.message : String(error)
    process.exitCode = 1
    report.passed = false
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
