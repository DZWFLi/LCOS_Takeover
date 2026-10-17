import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeParent, 'native-pile-first-open-diagnostic-'))
const runtimeReal = await realpath(runtimeRoot)
const publicOrigin = 'http://127.0.0.1:19890'
const originalFetch = globalThis.fetch.bind(globalThis)
let allowBootstrap = false
let facade
let coreOrigin = ''
const allowedOrigins = new Set()
const blockedNetwork = []
const pinnedAttempts = []

function activeOrigins() {
  const origins = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !Number.isInteger(address.port)) continue
    const host = address.address.includes(':') ? `[${address.address}]` : address.address
    origins.add(`http://${host}:${address.port}`)
  }
  return origins
}

globalThis.fetch = async (input, init) => {
  const href = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
  const url = new URL(href)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (url.origin === 'http://127.0.0.1:1') {
    pinnedAttempts.push({ method, path: url.pathname })
    throw new Error('Pinned dead Ollama endpoint is rejected before networking.')
  }
  const active = activeOrigins()
  const bootstrapCore = allowBootstrap && active.size === 1 && active.has(url.origin)
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    && (bootstrapCore || allowedOrigins.has(url.origin) && active.has(url.origin))) {
    return originalFetch(input, init)
  }
  blockedNetwork.push({ method, origin: url.origin, path: url.pathname })
  throw new Error('Diagnostic permits only its own fresh loopback Core server.')
}

process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
for (const key of ['LCOS_BRIDGE_URL', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT', 'LOCAL_CORE_API_TOKEN',
  'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LCOS_RUNTIME_REGISTRY', 'LCOS_PROJECTS_DIR', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_API_KEY', 'DASHSCOPE_API_KEY']) delete process.env[key]

async function coreJson(origin, method, pathname, body) {
  const response = await fetch(origin + pathname, { method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { text } }
  return { status: response.status, payload }
}

function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: publicOrigin + pathname, ...(body === undefined ? {} : { body }) })
}

try {
  assert.equal(activeOrigins().size, 0, 'No pre-existing local listener may be adopted as a fixture Core.')
  const bootstrapDir = path.join(runtimeRoot, 'bootstrap')
  await mkdir(bootstrapDir, { recursive: true })
  const bootstrapBundle = path.join(bootstrapDir, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', bootstrapBundle, 'node')
  const bootstrapModule = await import(pathToFileURL(bootstrapBundle).href)
  allowBootstrap = true
  facade = await bootstrapModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
  coreOrigin = facade.core.origin
  allowedOrigins.add(coreOrigin)
  allowBootstrap = false
  const projectId = String(facade.core.projectId)
  const canvasId = String(facade.workspaces.find(row => row.preferredSurface === 'main').canvasId)
  const boundArtifactIds = [...new Set(facade.core.repository.getProjectionBindings(projectId)
    .filter(row => row.canvasId === canvasId && row.spatialKind === 'node')
    .flatMap(row => {
      if (row.entityType === 'artifact') return [String(row.entityId)]
      if (row.entityType === 'view') {
        const view = facade.core.repository.getArtifactView(String(row.entityId))
        return view ? [String(view.artifactId)] : []
      }
      return []
    }))]
  const members = boundArtifactIds.slice(0, 2).map(id => ({ type: 'artifact', id }))
  assert.equal(members.length, 2)
  const created = await coreJson(coreOrigin, 'POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Original producer first-open fixture', members,
  })
  assert.equal(created.status, 201, JSON.stringify(created.payload))
  const collectionId = String(created.payload.value.id)
  const assembly = await facadeCall('POST', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(assembly.status, 200, JSON.stringify(assembly.body))
  const projection = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
  assert.equal(projection.status, 200, JSON.stringify(projection.body))
  const carrierId = String(projection.body.data.binding.spatialId)
  assert.ok(carrierId)
  await facade.close()
  facade = undefined
  allowedOrigins.delete(coreOrigin)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(activeOrigins().size, 0, 'Bootstrap Core must close before the isolated native-mode reopen.')

  const nativeDir = path.join(runtimeRoot, 'native')
  await mkdir(nativeDir, { recursive: true })
  const nativeBundle = path.join(nativeDir, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', nativeBundle, 'node', { coreCollectionTitle: true })
  const nativeModule = await import(pathToFileURL(nativeBundle).href)
  allowBootstrap = true
  facade = await nativeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true, nativeCollectionPilot: true })
  coreOrigin = facade.core.origin
  allowedOrigins.add(coreOrigin)
  allowBootstrap = false
  const before = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(before.status, 200)
  const memberNodeIds = before.body.data.nodes.filter(node => node.id !== carrierId).map(node => String(node.id))
  assert.equal(memberNodeIds.length, 2)
  const prepared = await facadeCall('GET', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/space:prepare`)
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body))
  const plan = prepared.body.data
  assert.equal(plan.committed, false)
  assert.equal(plan.provider_execution_started, false)
  assert.equal(plan.collection_id, collectionId)
  assert.equal(plan.collection_node_id, carrierId)
  const frameId = String(plan.frame_id)
  const plannedFrame = plan.after_nodes.find(node => String(node.id) === frameId)
  assert.equal(plannedFrame.type, 'group')
  const afterSlices = new Map(plan.space.after.map(row => [row.id, row]))
  const beforeSlices = new Map(plan.space.before.map(row => [row.id, row]))
  const memberUpdates = (slices, nativeNodes) => nativeNodes.map(node => {
    const slice = slices.get(String(node.id))
    assert.ok(slice, `O8 slice exists for member ${node.id}`)
    return { id: String(node.id), canvas_id: canvasId, type: node.type,
      position: slice.position, parent_id: slice.parentId ?? '' }
  })
  const operationId = `native-pile-first-open-${randomUUID()}`
  const operation = phase => ({ version: 1, operationId, kind: 'collection-space', phase, space: plan.space })
  const sendOperation = (phase, actions, expectedVersion) => facadeCall('POST',
    `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
      canvas_id: canvasId, created_by_role: 'user', actions, lcos_operation: operation(phase),
      lcos_expected_canvas_version: expectedVersion, lcos_expected_revisions: {}, lcos_refs: {}, lcos_snapshots: {},
    })
  const applyActions = [
    { action: 'create', nodes: [plannedFrame] },
    { action: 'update', updates: memberUpdates(afterSlices, plan.before_nodes) },
  ]
  const applied = await sendOperation('apply', applyActions, plan.source_version)
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  assert.equal(applied.body.data.created, true)
  let canvas = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(canvas.status, 200)
  const frameAfterApply = canvas.body.data.nodes.find(node => String(node.id) === frameId)
  assert.equal(frameAfterApply.type, 'group')
  assert.deepEqual(frameAfterApply.position, plannedFrame.position)
  assert.deepEqual(frameAfterApply.measured, plannedFrame.measured)
  let internal = await facade.spatial.read(canvasId)
  assert.equal(internal.state.nodes.find(node => node.id === frameId).data.sizing, 'manual')

  const undoActions = [
    { action: 'delete', delete_ids: [frameId] },
    { action: 'update', updates: memberUpdates(beforeSlices, plan.after_nodes.filter(node => String(node.id) !== frameId)) },
  ]
  const undone = await sendOperation('undo', undoActions, canvas.body.data.version)
  assert.equal(undone.status, 200, JSON.stringify(undone.body))
  assert.equal(undone.body.data.created, false)
  canvas = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(canvas.status, 200)
  assert.equal(canvas.body.data.nodes.some(node => String(node.id) === frameId), false)
  for (const nodeId of memberNodeIds) {
    const saved = canvas.body.data.nodes.find(node => String(node.id) === nodeId)
    const original = plan.before_nodes.find(node => String(node.id) === nodeId)
    assert.deepEqual(saved.position, original.position)
    assert.equal(saved.parent_id ?? '', '')
  }

  const redoActions = [
    { action: 'create', nodes: [plannedFrame] },
    { action: 'update', updates: memberUpdates(afterSlices, plan.before_nodes) },
  ]
  const redone = await sendOperation('redo', redoActions, canvas.body.data.version)
  assert.equal(redone.status, 200, JSON.stringify(redone.body))
  assert.equal(redone.body.data.created, true)
  canvas = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  const frameAfterRedo = canvas.body.data.nodes.find(node => String(node.id) === frameId)
  assert.ok(frameAfterRedo)
  assert.deepEqual(frameAfterRedo.position, plannedFrame.position)
  assert.deepEqual(frameAfterRedo.measured, plannedFrame.measured)
  internal = await facade.spatial.read(canvasId)
  assert.equal(internal.state.nodes.find(node => node.id === frameId).data.sizing, 'manual')
  console.log(JSON.stringify({
    reproduced: true,
    passed: true,
    scope: 'fresh temporary Core + original Collection create/Assembly/binding producers; exact native O8 apply/undo/redo; no GUI or old DB',
    collectionId, carrierId, memberNodeIds,
    group: { id: frameId, position: frameAfterRedo.position, measured: frameAfterRedo.measured,
      internalSizing: internal.state.nodes.find(node => node.id === frameId).data.sizing },
    pinnedOllamaAttemptsRejectedBeforeNetworking: pinnedAttempts.length,
    blockedNetwork,
  }, null, 2))
} finally {
  if (facade) await facade.close()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(activeOrigins().size, 0, 'All test-owned Core listeners must be closed before cleanup.')
  assert.equal(blockedNetwork.length, 0, 'No external or unrelated local request may escape the fetch fence.')
  globalThis.fetch = originalFetch
  const relative = path.relative(path.resolve(runtimeParent), path.resolve(runtimeReal))
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  assert.equal(path.basename(runtimeReal).startsWith('native-pile-first-open-diagnostic-'), true)
  await rm(runtimeReal, { recursive: true, force: true })
}

