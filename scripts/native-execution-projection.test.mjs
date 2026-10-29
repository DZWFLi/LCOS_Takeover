import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
const reportDir = path.join(runtimeBase, 'native-execution-projection')
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportPath = path.join(reportDir, `${timestamp}.json`)
const runtimeRootPrefix = 'native-execution-projection-case-'
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, runtimeRootPrefix))
const publicOrigin = 'http://127.0.0.1:19881'

// Clear inherited integration endpoints/tokens by name only; never read them.
// The temporary facade itself owns its own random loopback Core port.
for (const key of [
  'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
  'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT',
  'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE',
  'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT',
  'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY', 'LCOS_PROJECTS_DIR',
  'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_COMPATIBLE_BASE_URL', 'OPENAI_BASE_URL', 'OPENAI_API_KEY',
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY', 'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL',
  'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY', 'QWEN_BASE_URL', 'DASHSCOPE_API_KEY',
  'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'MOONSHOT_API_KEY', 'SILICONFLOW_BASE_URL',
  'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY',
  'QIANFAN_BASE_URL', 'QIANFAN_API_KEY', 'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL',
  'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'ARK_BASE_URL', 'ARK_API_KEY',
  'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Any accidental embedding attempt can only target an intentionally dead loopback port.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  mode: 'real Core SQLite + real Huabu disk storage through startSurfaceCoreFacade.handle',
  fixtureKind: 'manual synthetic ArtifactReturn; explicitly not a model/provider output',
  originalUserDatabaseOpened: false,
  inheritedHostAndProviderVariablesRead: false,
  providerOrBridgeStarted: false,
  providerExecution: false,
  rawSqlUsed: false,
  existingBindingStoreWrittenDirectly: false,
  live17881Accessed: false,
  runtimeRoot,
  reportPath,
  publicOrigin: 'loopback origin configured only; facade.handle was called in-process',
  requestedProvider: 'workbuddy (fixed test field only; no dispatch)',
  cases: [],
  facadeRequests: [],
  unhandledFacadeRoutes: [],
  network: { allowedLoopback: [], blocked: [], pinnedOllamaAttempts: [],
    coreBootstrapBaselines: [], activeCoreOrigins: [] },
}

const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let facade
let compositionModule
let repository
let projectId
let workspaceRows = []
let coreOrigins = new Set()
let coreBootstrapInProgress = false

function isLoopback(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

function activeListeningLoopbackOrigins() {
  const origins = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    const hostname = address.address.includes(':') ? `[${address.address}]` : address.address
    origins.add(`http://${hostname}:${address.port}`)
  }
  return origins
}

function beginCoreBootstrap() {
  const active = activeListeningLoopbackOrigins()
  report.network.coreBootstrapBaselines.push([...active])
  assert.equal(active.size, 0, 'No pre-existing listening loopback Server may be present in this test process')
  coreBootstrapInProgress = true
}

function registerActiveCoreOrigin(origin) {
  const active = activeListeningLoopbackOrigins()
  assert.ok(active.has(origin), 'The returned Core origin must match a live listening loopback Server in this process')
  assert.equal(active.size, 1, 'The isolated test process must have exactly one listening loopback Server')
  coreOrigins.add(origin)
  report.network.activeCoreOrigins.push(origin)
  coreBootstrapInProgress = false
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaAttempts.push({ method, path: url.pathname })
      throw new Error('The isolated execution-projection test blocks the pinned dead Ollama endpoint without networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      report.network.allowedLoopback.push({ method, origin: url.origin, path: url.pathname })
      return originalFetch(input, init)
    }
    const blocked = { method, origin: url.origin, path: url.pathname }
    report.network.blocked.push(blocked)
    throw new Error('native execution projection test blocked non-isolated or reserved service access')
  }
}

async function call(method, pathname, body) {
  report.facadeRequests.push({ method, path: pathname })
  const result = await facade.handle({ method, pathname, url: publicOrigin + pathname, ...(body === undefined ? {} : { body }) })
  if (result == null) report.unhandledFacadeRoutes.push({ method, path: pathname })
  return result
}

function expectEnvelope(result, status, label) {
  assert.ok(result != null, `${label}: facade.handle returned no response (the facade route is not registered or handled)`)
  assert.equal(result?.status, status, `${label}: ${JSON.stringify(result?.body)}`)
  assert.ok(result.body && typeof result.body === 'object', `${label} must return a body`)
  return result.body
}

function one(rows, predicate, label) {
  const matches = rows.filter(predicate)
  assert.equal(matches.length, 1, `${label} must resolve exactly once; found ${matches.length}`)
  return matches[0]
}

function clone(value) { return structuredClone(value) }

function spatialGeometry(node) {
  const result = {}
  for (const key of ['position', 'width', 'height', 'size', 'measured']) {
    if (Object.hasOwn(node, key)) result[key] = clone(node[key])
  }
  if (node.style && typeof node.style === 'object' && !Array.isArray(node.style)) {
    const styleDimensions = {}
    for (const key of ['width', 'height']) {
      if (Object.hasOwn(node.style, key)) styleDimensions[key] = node.style[key]
    }
    if (Object.keys(styleDimensions).length) result.styleDimensions = styleDimensions
  }
  return result
}

function setOf(rows) { return new Set(rows.map((row) => String(row.id))) }

function newRows(before, after) {
  const beforeIds = setOf(before)
  return after.filter((row) => !beforeIds.has(String(row.id)))
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

async function canvasSnapshot(canvasId) {
  const result = expectEnvelope(await call('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`), 200,
    `TapNow canvas read ${canvasId}`)
  assert.equal(result.code, 0, `TapNow canvas ${canvasId} must retain the facade envelope`)
  assert.ok(result.data && Array.isArray(result.data.nodes), `Canvas ${canvasId} must return nodes`)
  assert.ok(Array.isArray(result.data.connections), `Canvas ${canvasId} must use the original connections field`)
  return result.data
}

function executionNode(canvas, entityType, entityId) {
  return one(canvas.nodes, (node) => node.type === 'lcos-execution'
    && node.data?.lcos_execution_ref?.entityType === entityType
    && node.data?.lcos_execution_ref?.entityId === entityId,
  `lcos-execution ${entityType}:${entityId}`)
}

function resultMaterialNode(canvas, spatialId) {
  return one(canvas.nodes, (node) => String(node.id) === spatialId && node.type === 'lcos-result-material',
    `accepted result material carrier ${spatialId}`)
}

function nativeGeometryPatch(node, position, measured) {
  return { id: String(node.id), type: node.type, position: clone(position), measured: clone(measured), data: clone(node.data) }
}

function sendNativeGeometryUpdate(canvasId, updates) {
  return call('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
    canvas_id: canvasId,
    actions: [{ action: 'update', updates }],
  })
}

async function updateNativeGeometry(canvasId, updates, label) {
  const result = await sendNativeGeometryUpdate(canvasId, updates)
  assert.equal(result?.status, 200, `${label}: native nodes:batchActions status ${result?.status}; ${JSON.stringify(result?.body)}`)
  assert.equal(result.body?.code, 0, `${label}: native batch envelope ${JSON.stringify(result.body)}`)
  return result.body.data
}

async function assertRejectedGeometryEcho(canvasId, update, expectedCode, label) {
  const beforeCanvas = await canvasSnapshot(canvasId)
  const beforeSpatial = clone(await facade.spatial.read(canvasId))
  const beforeCore = coreTruthSnapshot()
  const result = await sendNativeGeometryUpdate(canvasId, [update])
  assert.equal(result?.status, 409, `${label}: forged projected DTO must return HTTP 409`)
  assert.equal(result.body?.error?.code, expectedCode, `${label}: exact rejection owner`)
  assert.deepEqual(await canvasSnapshot(canvasId), beforeCanvas, `${label}: canvas DTO geometry and facts remain unchanged`)
  assert.deepEqual(await facade.spatial.read(canvasId), beforeSpatial, `${label}: Huabu stored geometry remains unchanged`)
  assert.deepEqual(coreTruthSnapshot(), beforeCore, `${label}: Core graph, execution facts, and bindings remain unchanged`)
}

function coreTruthSnapshot() {
  return {
    graph: clone(repository.get(projectId)),
    execution: clone(repository.getProjectExecutionProjection(projectId)),
    bindings: clone(repository.getProjectionBindings(projectId)),
  }
}

function assertExecutionNodeUnchanged(before, after, spatialId, label) {
  const a = one(before.nodes, (node) => String(node.id) === spatialId, `${label} before`)
  const b = one(after.nodes, (node) => String(node.id) === spatialId, `${label} after`)
  assert.equal(b.type, 'lcos-execution', `${label} remains pending execution presentation`)
  assert.deepEqual(b.position, a.position, `${label} position stays in the same Huabu slot`)
  assert.deepEqual(b.measured, a.measured, `${label} size stays in the same Huabu slot`)
  assert.deepEqual(b.data.lcos_execution_ref, a.data.lcos_execution_ref)
}

const surfaceSnapshots = new Map()
let initialGraph
let beforeAcceptGraph
let slotId
let runId
let artifactId
let revisionId
let fileRecordId
let returnId
let slotSpatialId
let runSpatialId
let acceptedViewId
let acceptedBody
let workflowCanvasId
let workflowWorkspaceId
let workflowScopeId
let slotPosition
let slotSize
let firstSlotCanvas
let afterRunCanvas
let afterAcceptCanvas

try {
  const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeEntry)
  const facadeModule = await import(pathToFileURL(facadeEntry).href)
  assert.equal(typeof facadeModule.startSurfaceCoreFacade, 'function', 'The real facade source must build and export its launcher')
  compositionModule = facadeModule

  installFetchBoundary()
  beginCoreBootstrap()
  facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
  repository = facade.core.repository
  projectId = String(facade.core.projectId)
  const coreOrigin = String(facade.core.origin)
  registerActiveCoreOrigin(coreOrigin)
  assert.ok(coreOrigin.startsWith('http://127.0.0.1:'), 'The facade must use a random loopback Core server')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'The test must not attach to any existing TapNow service port')
  workspaceRows = facade.workspaces.map((workspace) => clone(workspace))
  const mainWorkspace = one(workspaceRows, (workspace) => workspace.preferredSurface === 'main', 'Main workspace')
  const contextWorkspace = one(workspaceRows, (workspace) => workspace.preferredSurface === 'context', 'Context workspace')
  const workflowWorkspace = one(workspaceRows, (workspace) => workspace.preferredSurface === 'workflow', 'Workflow workspace')
  assert.equal(new Set([mainWorkspace.canvasId, contextWorkspace.canvasId, workflowWorkspace.canvasId]).size, 3)
  workflowCanvasId = String(workflowWorkspace.canvasId)
  workflowWorkspaceId = String(workflowWorkspace.id)
  workflowScopeId = String(workflowWorkspace.scopeId)

  const project = repository.getProject(projectId)
  assert.ok(project)
  assert.ok(isWithin(runtimeRoot, project.rootPath), 'The sample Project root must be disposable and contained')
  initialGraph = repository.get(projectId)
  assert.ok(initialGraph)
  assert.equal(repository.listCaptureWatchRules().length, 0, 'The disposable project has no inherited watchers')
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length, 0)
  assert.equal(repository.getProjectExecutionProjection(projectId).resultSlots.length, 0)

  for (const [surface, workspace] of [['main', mainWorkspace], ['context', contextWorkspace], ['workflow', workflowWorkspace]]) {
    const canvas = await canvasSnapshot(String(workspace.canvasId))
    surfaceSnapshots.set(surface, clone(canvas))
    assert.equal(canvas.id, workspace.canvasId)
  }
  const mainBefore = surfaceSnapshots.get('main')
  const contextBefore = surfaceSnapshots.get('context')
  const workflowBefore = surfaceSnapshots.get('workflow')
  assert.equal(mainBefore.nodes.length, 2)
  assert.equal(contextBefore.nodes.length, 2)
  assert.equal(workflowBefore.nodes.length, 2)
  assert.equal(mainBefore.connections.length, 0)
  assert.equal(contextBefore.connections.length, 0)
  assert.equal(workflowBefore.connections.length, 0)
  report.baseline = {
    projectId, workspaces: workspaceRows.map(({ id, preferredSurface, canvasId, scopeId }) => ({ id, preferredSurface, canvasId, scopeId })),
    initialNodeCounts: Object.fromEntries([...surfaceSnapshots].map(([surface, canvas]) => [surface, canvas.nodes.length])),
    initialConnectionCounts: Object.fromEntries([...surfaceSnapshots].map(([surface, canvas]) => [surface, canvas.connections.length])),
    originalArtifactIds: initialGraph.artifacts.map((item) => String(item.id)),
    originalArtifactViewIds: initialGraph.artifactViews.map((item) => String(item.id)),
  }
  report.cases.push({ name: 'fullIntegration facade opened fresh Core SQLite and Huabu disk stores for the three real Core Workspaces', passed: true })

  const preflightTruth = coreTruthSnapshot()
  const preflightSpatial = clone(await facade.spatial.read(workflowCanvasId))
  const unknownCanvasId = 'surface-core-unknown-native-execution-probe'
  const unknownCanvas = await call('GET', `/api/canvas/v1/canvases/${encodeURIComponent(unknownCanvasId)}`)
  assert.equal(unknownCanvas?.status, 404, 'GET of an unknown canvas returns 404')
  assert.equal(unknownCanvas.body?.error?.code, 'CANVAS_NOT_FOUND')
  const unknownExecution = await call('POST', `/api/lcos/canvases/${encodeURIComponent(unknownCanvasId)}/execution:reconcile`, {})
  assert.equal(unknownExecution?.status, 404, 'Explicit reconcile of an unknown canvas returns 404')
  assert.equal(unknownExecution.body?.error?.code, 'CANVAS_NOT_FOUND')
  const nonEmptyExecution = await call('POST', `/api/lcos/canvases/${encodeURIComponent(workflowCanvasId)}/execution:reconcile`, {
    canvasId: workflowCanvasId,
  })
  assert.equal(nonEmptyExecution?.status, 400, 'Reconcile rejects caller-supplied identity/state/geometry fields')
  assert.equal(nonEmptyExecution.body?.error?.code, 'INVALID_ARGUMENT')
  assert.deepEqual(coreTruthSnapshot(), preflightTruth, 'Unknown and malformed requests do not mutate Core graph, execution rows, or bindings')
  assert.deepEqual(await facade.spatial.read(workflowCanvasId), preflightSpatial,
    'Unknown and malformed requests do not mutate the Huabu Workflow canvas')
  report.cases.push({ name: 'unknown Canvas returns 404 and reconcile rejects non-empty/foreign input without Core or Huabu writes', passed: true })

  const projectRoute = `/api/lcos/core/projects/${encodeURIComponent(projectId)}`
  slotPosition = { x: 321.25, y: 228.5 }
  slotSize = { width: 321, height: 207 }
  const createSlot = expectEnvelope(await call('POST', `${projectRoute}/result-slots`, {
    scopeId: workflowScopeId,
    workspaceId: workflowWorkspaceId,
    x: slotPosition.x,
    y: slotPosition.y,
    width: slotSize.width,
    height: slotSize.height,
  }), 201, 'Core ResultSlot producer')
  assert.equal(createSlot.ok, true)
  const slot = createSlot.value
  slotId = String(slot.id)
  assert.equal(String(slot.projectId), projectId)
  assert.equal(String(slot.scopeId), workflowScopeId)
  assert.equal(String(slot.workspaceId), workflowWorkspaceId)
  assert.deepEqual(slot.position, slotPosition)
  assert.deepEqual(slot.size, slotSize)
  assert.equal(slot.status, 'empty')
  report.resultSlot = { id: slotId, workspaceId: workflowWorkspaceId, scopeId: workflowScopeId,
    canvasId: workflowCanvasId, position: slot.position, size: slot.size, status: slot.status }
  report.cases.push({ name: 'Core ResultSlot producer creates a real slot scoped to the Workflow workspace/canvas', passed: true })

  const executionRoute = `/api/lcos/canvases/${encodeURIComponent(workflowCanvasId)}/execution:reconcile`
  const beforeLazyCanvasReadTruth = coreTruthSnapshot()
  const beforeLazyCanvasReadSpatial = clone(await facade.spatial.read(workflowCanvasId))
  const canvasBeforeExplicitProjection = await canvasSnapshot(workflowCanvasId)
  assert.equal(canvasBeforeExplicitProjection.nodes.length, workflowBefore.nodes.length,
    'GET of a canvas with a Core ResultSlot does not project it implicitly')
  assert.equal(canvasBeforeExplicitProjection.nodes.some((node) => node.type === 'lcos-execution'), false)
  assert.deepEqual(repository.getProjectionBindings(projectId), beforeLazyCanvasReadTruth.bindings,
    'Canvas GET does not create or rewrite a Core projection binding')
  assert.deepEqual(await facade.spatial.read(workflowCanvasId), beforeLazyCanvasReadSpatial,
    'Canvas GET does not create a Huabu carrier')
  assert.deepEqual(coreTruthSnapshot(), beforeLazyCanvasReadTruth,
    'Canvas GET does not mutate Core, even when a valid unprojected ResultSlot exists')
  report.cases.push({ name: 'canvas GET is read-only for a valid Core ResultSlot until explicit execution:reconcile', passed: true })

  const initialSlotReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'explicit execution reconcile for the unmaterialized result slot')
  assert.equal(initialSlotReconcile.code, 0)
  assert.equal(initialSlotReconcile.data.canvas_id, workflowCanvasId)
  assert.equal(initialSlotReconcile.data.provider_execution_started, false)
  firstSlotCanvas = await canvasSnapshot(workflowCanvasId)
  assert.equal(firstSlotCanvas.nodes.length, workflowBefore.nodes.length + 1)
  assert.deepEqual(firstSlotCanvas.connections, workflowBefore.connections)
  const projectedSlot = executionNode(firstSlotCanvas, 'result-slot', slotId)
  slotSpatialId = String(projectedSlot.id)
  assert.notEqual(slotSpatialId, '')
  assert.deepEqual(projectedSlot.position, slotPosition)
  assert.deepEqual(projectedSlot.measured, slotSize)
  assert.equal(projectedSlot.data.lcos_execution_facts.execution.resultSlotId, slotId)
  assert.equal(projectedSlot.data.lcos_execution_facts.execution.status, 'empty')
  report.slotProjection = { spatialId: slotSpatialId, type: projectedSlot.type, ref: projectedSlot.data.lcos_execution_ref,
    facts: projectedSlot.data.lcos_execution_facts, position: projectedSlot.position, measured: projectedSlot.measured }
  report.cases.push({ name: 'explicit reconcile projects the exact unmaterialized ResultSlot as one native execution node', passed: true })

  const runResponse = expectEnvelope(await call('POST', `${projectRoute}/runs`, {
    instruction: '合成执行投影测试；仅登记 Run journal，不调用模型或 Provider。',
    outputIntent: 'create',
    workspaceId: workflowWorkspaceId,
    requestedProvider: 'workbuddy',
    resultSlotId: slotId,
  }), 201, 'Core Run journal producer')
  assert.equal(runResponse.ok, true)
  const createdReview = runResponse.value.review
  runId = String(createdReview.run.id)
  assert.equal(String(createdReview.run.projectId), projectId)
  assert.equal(String(createdReview.run.workspaceId), workflowWorkspaceId)
  assert.equal(createdReview.run.status, 'created')
  assert.equal(createdReview.dispatch.status, 'planned')
  assert.equal(createdReview.dispatch.attemptCount, 0)
  assert.equal(repository.getRuntimeBinding(runId), undefined, 'The test does not create a RuntimeBinding or claim a provider result')
  assert.equal(String(repository.getRunResultSlotId(runId)), slotId)
  assert.equal(repository.getResultSlot(slotId)?.status, 'running')
  assert.equal(String(repository.getResultSlot(slotId)?.runId), runId)
  report.run = { id: runId, workspaceId: workflowWorkspaceId, resultSlotId: slotId,
    status: createdReview.run.status, dispatch: createdReview.dispatch.status,
    dispatchAttempts: createdReview.dispatch.attemptCount, providerExecution: false, runtimeBinding: false }
  report.cases.push({ name: 'Core creates only a planned Run journal and claims the slot; no dispatch or RuntimeBinding', passed: true })

  const runProjection = expectEnvelope(await call('GET', `${projectRoute}/execution-projection`), 200,
    'Core execution projection read after Run creation')
  assert.equal(runProjection.ok, true)
  assert.equal(runProjection.value.projectId, projectId)
  assert.ok(runProjection.value.runs.some((item) => String(item.id) === runId && item.status === 'created'))
  assert.ok(runProjection.value.resultSlots.some((item) => String(item.id) === slotId && String(item.runId) === runId))
  const runReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'explicit execution reconcile after Run and claimed slot exist')
  assert.equal(runReconcile.data.canvas_id, workflowCanvasId)
  assert.equal(runReconcile.data.provider_execution_started, false)
  afterRunCanvas = await canvasSnapshot(workflowCanvasId)
  assert.equal(afterRunCanvas.nodes.length, workflowBefore.nodes.length + 2,
    'Run reconciliation must add exactly one Run beside the existing ResultSlot carrier')
  assert.deepEqual(afterRunCanvas.connections, workflowBefore.connections)
  const projectedRun = executionNode(afterRunCanvas, 'run', runId)
  const slotAfterRun = executionNode(afterRunCanvas, 'result-slot', slotId)
  runSpatialId = String(projectedRun.id)
  assert.notEqual(runSpatialId, slotSpatialId, 'The Run and its ResultSlot have distinct Core-owned spatial identities')
  assert.equal(projectedRun.data.lcos_execution_facts.execution.status, 'created')
  assert.equal(projectedRun.data.lcos_execution_facts.execution.resultSlotId, slotId)
  assert.equal(String(slotAfterRun.id), slotSpatialId, 'Adding the Run must not replace the already projected slot node')
  assert.deepEqual(slotAfterRun.position, slotPosition)
  assert.deepEqual(slotAfterRun.measured, slotSize)
  assert.equal(slotAfterRun.data.lcos_execution_facts.execution.status, 'created')
  report.runProjection = { spatialId: runSpatialId, type: projectedRun.type, ref: projectedRun.data.lcos_execution_ref,
    facts: projectedRun.data.lcos_execution_facts, resultSlotSpatialId: slotSpatialId,
    slotStatus: slotAfterRun.data.lcos_execution_facts.execution.status }
  report.cases.push({ name: 'explicit reconcile projects one Run and preserves the existing ResultSlot identity/geometry', passed: true })

  const reconcileReplay = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'idempotent execution reconcile replay before result review')
  assert.equal(reconcileReplay.data.provider_execution_started, false)
  const replayCanvas = await canvasSnapshot(workflowCanvasId)
  assert.deepEqual(setOf(replayCanvas.nodes), setOf(afterRunCanvas.nodes),
    'Repeated execution reconciliation must not allocate duplicate Run/ResultSlot carriers')
  assert.equal(replayCanvas.nodes.filter((node) => node.type === 'lcos-execution').length, 2)
  assertExecutionNodeUnchanged(firstSlotCanvas, replayCanvas, slotSpatialId, 'ResultSlot after Run reconciliation')
  report.cases.push({ name: 'repeated execution reconciliation is idempotent and creates no duplicate nodes', passed: true })

  const executionForgeryBaseline = await canvasSnapshot(workflowCanvasId)
  const slotBeforeForgery = executionNode(executionForgeryBaseline, 'result-slot', slotId)
  const forgedExecutionData = clone(slotBeforeForgery.data)
  forgedExecutionData.lcos_execution_facts.execution.status = 'materialized-by-renderer'
  const forgedExecutionPatch = nativeGeometryPatch(slotBeforeForgery, { x: 990.5, y: 991.5 }, { width: 499, height: 399 })
  forgedExecutionPatch.data = forgedExecutionData
  await assertRejectedGeometryEcho(workflowCanvasId, forgedExecutionPatch, 'PROJECTED_NODE_FACTS_MISMATCH',
    'forged lcos_execution_facts with a geometry change')
  report.cases.push({ name: 'forged Run/Slot facts return 409 before their accompanying geometry can be applied', passed: true })

  const slotNativePosition = { x: 412.25, y: 315.75 }
  const slotNativeSize = { width: 346, height: 223 }
  const runNativePosition = { x: 824.5, y: 318.5 }
  const runNativeSize = { width: 312, height: 191 }
  const geometryBaselineTruth = coreTruthSnapshot()
  const geometryBaselineCanvas = await canvasSnapshot(workflowCanvasId)
  const slotForGeometry = executionNode(geometryBaselineCanvas, 'result-slot', slotId)
  const runForGeometry = executionNode(geometryBaselineCanvas, 'run', runId)
  const nativeGeometryReceipt = await updateNativeGeometry(workflowCanvasId, [
    nativeGeometryPatch(slotForGeometry, slotNativePosition, slotNativeSize),
    nativeGeometryPatch(runForGeometry, runNativePosition, runNativeSize),
  ], 'original native Run/ResultSlot geometry update')
  assert.equal(nativeGeometryReceipt.spatial_saved, true)
  const afterNativeGeometryCanvas = await canvasSnapshot(workflowCanvasId)
  const slotAfterNativeGeometry = executionNode(afterNativeGeometryCanvas, 'result-slot', slotId)
  const runAfterNativeGeometry = executionNode(afterNativeGeometryCanvas, 'run', runId)
  assert.deepEqual(slotAfterNativeGeometry.position, slotNativePosition)
  assert.deepEqual(slotAfterNativeGeometry.measured, slotNativeSize)
  assert.deepEqual(runAfterNativeGeometry.position, runNativePosition)
  assert.deepEqual(runAfterNativeGeometry.measured, runNativeSize)
  assert.deepEqual(slotAfterNativeGeometry.data, slotForGeometry.data, 'Native geometry update is an exact echo, not an execution-facts writer')
  assert.deepEqual(runAfterNativeGeometry.data, runForGeometry.data, 'Native geometry update leaves Run facts unchanged')
  assert.deepEqual(coreTruthSnapshot(), geometryBaselineTruth, 'Native Run/Slot geometry is Huabu-owned; Core execution records remain unchanged')
  const geometryReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'reconcile after native Run/ResultSlot geometry changes')
  assert.equal(geometryReconcile.data.provider_execution_started, false)
  const afterGeometryReconcileCanvas = await canvasSnapshot(workflowCanvasId)
  assert.deepEqual(executionNode(afterGeometryReconcileCanvas, 'result-slot', slotId).position, slotNativePosition)
  assert.deepEqual(executionNode(afterGeometryReconcileCanvas, 'result-slot', slotId).measured, slotNativeSize)
  assert.deepEqual(executionNode(afterGeometryReconcileCanvas, 'run', runId).position, runNativePosition)
  assert.deepEqual(executionNode(afterGeometryReconcileCanvas, 'run', runId).measured, runNativeSize)
  assert.deepEqual(setOf(afterGeometryReconcileCanvas.nodes), setOf(afterNativeGeometryCanvas.nodes),
    'Reconciliation preserves user geometry and does not allocate replacement carriers')
  report.nativeGeometry = { owner: 'original POST nodes:batchActions → SET_NODE_GEOMETRY executor',
    slotSpatialId, slotPosition: slotNativePosition, slotSize: slotNativeSize,
    runSpatialId, runPosition: runNativePosition, runSize: runNativeSize,
    coreTruthUnchanged: true, reconciliationPreservedGeometry: true }
  report.cases.push({ name: 'original native batch update changes Run/Slot geometry and explicit reconcile preserves both IDs/geometry', passed: true })

  // Manual Core producer fixture: this is not raw SQL, a binding write, a
  // RuntimeBinding, an external provider result, or a model execution.
  const marker = `native-execution-fixture-${randomUUID()}`
  const now = new Date().toISOString()
  artifactId = `artifact-${marker}`
  revisionId = `revision-${marker}`
  fileRecordId = `file-${marker}`
  returnId = `return-${marker}`
  acceptedBody = `# ${marker}\n\nManual synthetic Run result for execution projection. No model or provider produced this file.\n`
  const content = Buffer.from(acceptedBody, 'utf8')
  const contentHash = createHash('sha256').update(content).digest('hex')
  const canonicalPath = path.join(project.rootPath, '.creative-os', 'runtime', runId, 'staging', `${marker}.md`)
  assert.ok(isWithin(project.rootPath, canonicalPath), 'The staged Markdown must stay under the synthetic Project root')
  await mkdir(path.dirname(canonicalPath), { recursive: true })
  await writeFile(canonicalPath, content)
  const fileRecord = { id: fileRecordId, projectId, observedPath: canonicalPath, observedHash: contentHash,
    size: content.byteLength, modifiedAt: now, mimeType: 'text/markdown', availability: 'current', observedAt: now }
  const artifact = { id: artifactId, projectId, title: `Manual fixture — not a model result (${marker})`,
    kind: 'markdown', availability: 'available', createdAt: now, updatedAt: now }
  const draftRevision = { id: revisionId, artifactId, fileRecordId, contentHash, source: 'run', runId,
    status: 'draft', createdAt: now }
  const artifactReturn = { id: returnId, runId, targetArtifactId: artifactId, baseRevisionId: revisionId,
    returnedFileId: fileRecordId, contentHash, canonicalPath, action: 'created',
    status: 'pending_review', draftRevisionId: revisionId, createdAt: now, updatedAt: now }
  repository.createRuntimeCreatedArtifact(fileRecord, artifact, draftRevision, artifactReturn)
  assert.equal(repository.getRuntimeBinding(runId), undefined)
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'draft')
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'pending_review')
  report.manualFixture = { method: 'SqliteMetadataRepository.createRuntimeCreatedArtifact',
    artifactId, revisionId, fileRecordId, artifactReturnId: returnId, runId,
    explicitNotModel: true, providerExecution: false, runtimeBinding: false, rawSql: false }
  report.cases.push({ name: 'manual synthetic ArtifactReturn enters the original Core producer with no provider/binding', passed: true })

  const beforeAccept = repository.get(projectId)
  assert.ok(beforeAccept)
  const spatialBeforeAccept = await facade.spatial.read(workflowCanvasId)
  assert.ok(spatialBeforeAccept)
  const slotSpatialBeforeAccept = one(spatialBeforeAccept.state.nodes, (node) => String(node.id) === slotSpatialId,
    'Huabu disk-backed slot carrier immediately before Core Accept')
  const coreReview = expectEnvelope(await call('GET', `/api/lcos/core/runs/${encodeURIComponent(runId)}/review`), 200,
    'Core Run Review before Accept')
  assert.equal(coreReview.ok, true)
  assert.equal(coreReview.value.run.id, runId)
  assert.equal(coreReview.value.returns.length, 1)
  assert.equal(coreReview.value.returns[0].id, returnId)
  assert.equal(coreReview.value.returns[0].status, 'pending_review')

  const acceptedResponse = expectEnvelope(await call('POST', `/api/lcos/core/artifact-returns/${encodeURIComponent(returnId)}/accept`, {
    expectedBaseRevisionId: revisionId,
  }), 200, 'Core ArtifactReturn Accept with exact draft revision CAS')
  assert.equal(acceptedResponse.ok, true)
  assert.equal(acceptedResponse.value.artifactReturn.status, 'adopted')
  assert.equal(String(acceptedResponse.value.currentRevision.id), revisionId)
  assert.equal(String(repository.getArtifact(artifactId)?.currentRevisionId), revisionId)
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'current')
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'adopted')
  const materializedSlot = repository.getResultSlot(slotId)
  assert.equal(materializedSlot?.status, 'materialized')
  assert.equal(String(materializedSlot?.runId), runId)
  assert.equal(String(materializedSlot?.artifactId), artifactId)
  acceptedViewId = String(materializedSlot?.artifactViewId)
  assert.ok(acceptedViewId)
  const acceptedView = repository.getArtifactView(acceptedViewId)
  assert.ok(acceptedView)
  assert.equal(String(acceptedView.artifactId), artifactId)
  assert.equal(String(acceptedView.revisionId), revisionId)
  assert.equal(String(acceptedView.scopeId), workflowScopeId)
  assert.deepEqual(acceptedView.position, slotPosition)
  assert.deepEqual(acceptedView.size, slotSize)
  const acceptedFiles = await call('GET', `${projectRoute}/file-records/${encodeURIComponent(fileRecordId)}/content`)
  assert.equal(acceptedFiles.status, 200, 'exact accepted Core FileRecord bytes must be readable')
  assert.ok(Buffer.isBuffer(acceptedFiles.body), 'FileRecord route must return original binary bytes')
  assert.deepEqual(acceptedFiles.body, content, 'The accepted revision is the exact manually staged UTF-8 body')
  report.accepted = { artifactId, artifactViewId: acceptedViewId, revisionId, fileRecordId,
    slotSpatialId, exactFileBytes: true, artifactViewReferenceKind: 'explicit_additional' }
  report.cases.push({ name: 'real Core CAS Accept materializes one exact ArtifactView and preserves the ResultSlot geometry', passed: true })

  const graphAfterAccept = repository.get(projectId)
  assert.ok(graphAfterAccept)
  assert.deepEqual(graphAfterAccept.artifacts.filter((item) => String(item.id) !== artifactId),
    beforeAccept.artifacts.filter((item) => String(item.id) !== artifactId), 'Old Artifacts are unchanged')
  assert.deepEqual(graphAfterAccept.artifactRevisions.filter((item) => String(item.id) !== revisionId),
    beforeAccept.artifactRevisions.filter((item) => String(item.id) !== revisionId), 'Old Revisions are unchanged')
  assert.deepEqual(graphAfterAccept.fileRecords, beforeAccept.fileRecords, 'Accept does not rewrite or duplicate old FileRecords')
  assert.deepEqual(graphAfterAccept.artifactViews.filter((item) => String(item.id) !== acceptedViewId),
    beforeAccept.artifactViews, 'Accept does not repoint or change any old ArtifactView')
  for (const [surface, workspace] of [['main', one(workspaceRows, (item) => item.preferredSurface === 'main', 'Main workspace')],
    ['context', one(workspaceRows, (item) => item.preferredSurface === 'context', 'Context workspace')]]) {
    const after = await canvasSnapshot(String(workspace.canvasId))
    assert.deepEqual(after, surfaceSnapshots.get(surface), `${surface} Canvas DTO is byte-for-byte structurally unchanged`)
  }
  report.cases.push({ name: 'Core Accept leaves pre-existing materials and Main/Context Canvas DTOs unchanged', passed: true })

  const acceptedReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'execution reconcile after Core Accept')
  assert.equal(acceptedReconcile.data.canvas_id, workflowCanvasId)
  assert.equal(acceptedReconcile.data.provider_execution_started, false)
  afterAcceptCanvas = await canvasSnapshot(workflowCanvasId)
  assert.equal(afterAcceptCanvas.nodes.length, workflowBefore.nodes.length + 2,
    'Accept must promote the slot carrier in place rather than add a duplicate material node')
  assert.deepEqual(afterAcceptCanvas.connections, workflowBefore.connections)
  const resultNode = resultMaterialNode(afterAcceptCanvas, slotSpatialId)
  assert.deepEqual(resultNode.position, slotNativePosition,
    'Promotion preserves the user-adjusted Huabu position, not the older Core slot placement')
  assert.deepEqual(resultNode.measured, slotNativeSize,
    'Promotion preserves the user-adjusted Huabu size, not the older Core slot size')
  assert.equal(resultNode.data.text, acceptedBody)
  assert.equal(resultNode.data.content, acceptedBody)
  assert.deepEqual(resultNode.data.lcos_result_ref, {
    projectId, canvasId: workflowCanvasId, workspaceId: workflowWorkspaceId,
    slotId, artifactId, artifactViewId: acceptedViewId, revisionId,
  })
  assert.equal(resultNode.data.lcos_result_facts.entityType, 'artifact')
  assert.equal(resultNode.data.lcos_result_facts.entityId, artifactId)
  assert.equal(resultNode.data.lcos_result_facts.artifactViewId, acceptedViewId)
  assert.equal(resultNode.data.lcos_result_facts.presentedRevisionId, revisionId)
  assert.equal(resultNode.data.lcos_result_facts.artifactViewReferenceKind, 'explicit_additional')
  assert.equal(resultNode.data.lcos_result_facts.canvasTextEditable, false,
    'The additional accepted View is projected as a read-only exact revision, not a guessed Primary writer')
  assert.equal(resultNode.data.lcos_result_facts.fileRecordId, fileRecordId)
  assert.equal(String(resultNode.data.lcos_ref.artifactId), artifactId)
  assert.equal(String(resultNode.data.lcos_ref.artifactViewId), acceptedViewId)
  assert.equal(String(resultNode.data.lcos_ref.revisionId), revisionId)
  const runAfterAccept = executionNode(afterAcceptCanvas, 'run', runId)
  assert.equal(String(runAfterAccept.id), runSpatialId, 'Run identity remains independent of the promoted slot carrier')
  assert.equal(afterAcceptCanvas.nodes.filter((node) => node.type === 'lcos-result-material').length, 1)
  assert.equal(afterAcceptCanvas.nodes.filter((node) => node.type === 'lcos-execution').length, 1)
  report.acceptedProjection = { spatialId: String(resultNode.id), type: resultNode.type,
    resultRef: resultNode.data.lcos_result_ref, resultFacts: resultNode.data.lcos_result_facts,
    lcosRef: resultNode.data.lcos_ref, exactBody: resultNode.data.text === acceptedBody,
    runSpatialId: String(runAfterAccept.id), nodeCount: afterAcceptCanvas.nodes.length }
  report.cases.push({ name: 'accepted carrier changes lcos-execution→lcos-result-material in place with exact View/Revision/body', passed: true })

  const spatialAfterAccept = await facade.spatial.read(workflowCanvasId)
  assert.ok(spatialAfterAccept)
  const rawSlotCarrier = one(spatialAfterAccept.state.nodes, (node) => String(node.id) === slotSpatialId,
    'Huabu disk-backed promoted carrier')
  assert.deepEqual(spatialGeometry(rawSlotCarrier), spatialGeometry(slotSpatialBeforeAccept),
    'Promotion preserves the actual Huabu geometry fields as stored before Core Accept')
  assert.deepEqual(rawSlotCarrier.position, slotNativePosition,
    'The promoted Huabu carrier keeps the user-adjusted position')

  const resultForgeryTruth = coreTruthSnapshot()
  const resultNodeForForgery = resultMaterialNode(await canvasSnapshot(workflowCanvasId), slotSpatialId)
  const attemptedResultPosition = { x: 988.25, y: 983.75 }
  const attemptedResultSize = { width: 488, height: 388 }
  const forgedLcosRefPatch = nativeGeometryPatch(resultNodeForForgery, attemptedResultPosition, attemptedResultSize)
  forgedLcosRefPatch.data.lcos_ref.revisionId = 'revision-forged-native-echo'
  await assertRejectedGeometryEcho(workflowCanvasId, forgedLcosRefPatch, 'PROJECTED_NODE_FACTS_MISMATCH',
    'forged accepted result lcos_ref revision')

  const forgedResultRevisionPatch = nativeGeometryPatch(resultNodeForForgery, attemptedResultPosition, attemptedResultSize)
  forgedResultRevisionPatch.data.lcos_result_ref.revisionId = 'revision-forged-native-result-ref'
  await assertRejectedGeometryEcho(workflowCanvasId, forgedResultRevisionPatch, 'PROJECTED_NODE_FACTS_MISMATCH',
    'forged accepted result lcos_result_ref revision')

  const forgedResultBodyPatch = nativeGeometryPatch(resultNodeForForgery, attemptedResultPosition, attemptedResultSize)
  forgedResultBodyPatch.data.text = 'tampered accepted body'
  forgedResultBodyPatch.data.content = 'tampered accepted body'
  await assertRejectedGeometryEcho(workflowCanvasId, forgedResultBodyPatch, 'PROJECTED_NODE_FACTS_MISMATCH',
    'forged accepted result body')
  assert.deepEqual(coreTruthSnapshot(), resultForgeryTruth, 'All forged accepted-material echoes leave Core truth unchanged')
  report.cases.push({ name: 'forged accepted lcos_ref/revision/body return 409 with Core facts and attempted geometry unchanged', passed: true })

  const acceptedNativePosition = { x: 518.75, y: 438.25 }
  const acceptedNativeSize = { width: 402, height: 254 }
  const acceptedGeometryBaselineTruth = coreTruthSnapshot()
  const acceptedGeometryReceipt = await updateNativeGeometry(workflowCanvasId, [
    nativeGeometryPatch(resultNodeForForgery, acceptedNativePosition, acceptedNativeSize),
  ], 'original native accepted-material geometry update')
  assert.equal(acceptedGeometryReceipt.spatial_saved, true)
  assert.deepEqual(coreTruthSnapshot(), acceptedGeometryBaselineTruth,
    'Accepted carrier geometry changes stay in original Huabu geometry ownership, not Core material metadata')
  afterAcceptCanvas = await canvasSnapshot(workflowCanvasId)
  const acceptedAfterGeometry = resultMaterialNode(afterAcceptCanvas, slotSpatialId)
  assert.deepEqual(acceptedAfterGeometry.position, acceptedNativePosition)
  assert.deepEqual(acceptedAfterGeometry.measured, acceptedNativeSize)
  assert.deepEqual(acceptedAfterGeometry.data, resultNodeForForgery.data,
    'Accepted geometry update exactly echoes and preserves the read-only result DTO')
  assert.deepEqual(repository.getArtifactView(acceptedViewId)?.position, slotPosition,
    'Native carrier movement does not rewrite the Core Accepted ArtifactView position')
  assert.deepEqual(repository.getArtifactView(acceptedViewId)?.size, slotSize,
    'Native carrier resize does not rewrite the Core Accepted ArtifactView size')
  report.acceptedNativeGeometry = { spatialId: slotSpatialId, position: acceptedNativePosition,
    size: acceptedNativeSize, coreViewPositionUnchanged: true, coreViewSizeUnchanged: true }
  report.cases.push({ name: 'accepted result-material geometry uses the original Huabu executor and leaves Core View facts read-only', passed: true })

  const replayAcceptReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'idempotent execution reconcile replay after materialization')
  assert.equal(replayAcceptReconcile.data.provider_execution_started, false)
  const replayAcceptedCanvas = await canvasSnapshot(workflowCanvasId)
  assert.deepEqual(setOf(replayAcceptedCanvas.nodes), setOf(afterAcceptCanvas.nodes),
    'Repeated accepted projection must not create another material carrier')
  assert.equal(replayAcceptedCanvas.nodes.filter((node) => node.type === 'lcos-result-material').length, 1)
  const replayResult = resultMaterialNode(replayAcceptedCanvas, slotSpatialId)
  assert.equal(replayResult.data.lcos_result_ref.artifactViewId, acceptedViewId)
  assert.equal(replayResult.data.lcos_result_ref.revisionId, revisionId)
  assert.equal(replayResult.data.text, acceptedBody)
  assert.deepEqual(replayResult.position, acceptedNativePosition,
    'Execution reconcile preserves the accepted carrier position as managed by Huabu')
  assert.deepEqual(replayResult.measured, acceptedNativeSize,
    'Execution reconcile preserves the accepted carrier size as managed by Huabu')
  assert.deepEqual(await canvasSnapshot(String(mainWorkspace.canvasId)), surfaceSnapshots.get('main'))
  assert.deepEqual(await canvasSnapshot(String(contextWorkspace.canvasId)), surfaceSnapshots.get('context'))
  report.cases.push({ name: 'repeated accepted reconcile keeps one same-ID material node and leaves other canvases unchanged', passed: true })

  await facade.close()
  facade = undefined
  report.closeBeforeReopen = true
  beginCoreBootstrap()
  facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
  repository = facade.core.repository
  registerActiveCoreOrigin(String(facade.core.origin))
  assert.equal(String(facade.core.projectId), projectId)
  const reopenSlot = repository.getResultSlot(slotId)
  assert.equal(reopenSlot?.status, 'materialized')
  assert.equal(String(reopenSlot?.artifactId), artifactId)
  assert.equal(String(reopenSlot?.artifactViewId), acceptedViewId)
  assert.equal(repository.getArtifactRevision(revisionId)?.status, 'current')
  assert.equal(repository.getArtifactReturn(returnId)?.status, 'adopted')
  assert.equal(repository.getRuntimeBinding(runId), undefined)
  const reopenedCanvasBeforeReplay = await canvasSnapshot(workflowCanvasId)
  const reopenedMaterial = resultMaterialNode(reopenedCanvasBeforeReplay, slotSpatialId)
  assert.equal(reopenedMaterial.data.lcos_result_ref.artifactViewId, acceptedViewId)
  assert.equal(reopenedMaterial.data.lcos_result_ref.revisionId, revisionId)
  assert.equal(reopenedMaterial.data.text, acceptedBody)
  assert.deepEqual(reopenedMaterial.position, acceptedNativePosition)
  assert.deepEqual(reopenedMaterial.measured, acceptedNativeSize)
  const reopenedRunBeforeReplay = executionNode(reopenedCanvasBeforeReplay, 'run', runId)
  assert.equal(String(reopenedRunBeforeReplay.id), runSpatialId)
  assert.deepEqual(reopenedRunBeforeReplay.position, runNativePosition)
  assert.deepEqual(reopenedRunBeforeReplay.measured, runNativeSize)
  assert.deepEqual(await canvasSnapshot(String(mainWorkspace.canvasId)), surfaceSnapshots.get('main'))
  assert.deepEqual(await canvasSnapshot(String(contextWorkspace.canvasId)), surfaceSnapshots.get('context'))
  const reopenReconcile = expectEnvelope(await call('POST', executionRoute, {}), 200,
    'reconcile after closing/reopening real Core and Huabu stores')
  assert.equal(reopenReconcile.data.provider_execution_started, false)
  const reopenedCanvasAfterReplay = await canvasSnapshot(workflowCanvasId)
  assert.deepEqual(setOf(reopenedCanvasAfterReplay.nodes), setOf(afterAcceptCanvas.nodes),
    'Reopen + reconcile retains the same Run and promoted ResultSlot spatial IDs without duplication')
  const reopenedResult = resultMaterialNode(reopenedCanvasAfterReplay, slotSpatialId)
  assert.equal(reopenedResult.data.lcos_result_ref.artifactViewId, acceptedViewId)
  assert.equal(reopenedResult.data.lcos_result_ref.revisionId, revisionId)
  assert.equal(reopenedResult.data.text, acceptedBody)
  assert.equal(reopenedResult.data.lcos_result_facts.canvasTextEditable, false)
  assert.deepEqual(reopenedResult.position, acceptedNativePosition)
  assert.deepEqual(reopenedResult.measured, acceptedNativeSize)
  const reopenedRunAfterReplay = executionNode(reopenedCanvasAfterReplay, 'run', runId)
  assert.deepEqual(reopenedRunAfterReplay.position, runNativePosition)
  assert.deepEqual(reopenedRunAfterReplay.measured, runNativeSize)
  report.reopen = { facadeClosedAndReopened: true, sameProjectId: projectId, sameRunId: runId,
    sameResultSlotId: slotId, sameSpatialId: slotSpatialId, sameRunSpatialId: runSpatialId,
    sameArtifactId: artifactId, sameArtifactViewId: acceptedViewId, sameAcceptedRevisionId: revisionId,
    providerExecution: false, runGeometryRetained: true, acceptedCarrierGeometryRetained: true }
  report.cases.push({ name: 'closed/reopened Core SQLite and Huabu disk stores retain exact accepted carrier and idempotent reconcile', passed: true })

  assert.equal(repository.getRuntimeBinding(runId), undefined)
  assert.equal(report.network.blocked.length, 0, 'No remote host, old live service, or external provider request is permitted')
  assert.equal(report.network.allowedLoopback.some((item) => blockedPorts.has(new URL(item.origin).port)), false,
    'No previously running TapNow/Core port was accessed')
  const unexpectedLoopback = report.network.allowedLoopback.filter((item) =>
    !coreOrigins.has(item.origin) && item.origin !== 'http://127.0.0.1:1')
  assert.deepEqual(unexpectedLoopback, [], 'Only this disposable Core and dead local Ollama loopback may be contacted')
  report.network.disposableCoreOrigins = [...coreOrigins]
  report.network.unexpectedLoopback = unexpectedLoopback
  report.network.externalFetchesAllowed = false
  report.providerExecution = false
  report.rawSqlUsed = false
  report.existingBindingStoreWrittenDirectly = false
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? error.stack : String(error)
} finally {
  if (facade) {
    try {
      await facade.close()
      report.facadeClosed = true
    } catch (error) {
      report.passed = false
      report.cleanupFailure = `Facade close failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  if (fetchInstalled) globalThis.fetch = originalFetch
  const runtimeResolved = path.resolve(runtimeRoot)
  const runtimeBaseResolved = path.resolve(runtimeBase)
  if (runtimeResolved.startsWith(runtimeBaseResolved + path.sep)
    && path.basename(runtimeResolved).startsWith(runtimeRootPrefix)) {
    try {
      await rm(runtimeResolved, { recursive: true, force: true })
      report.disposableRuntimeRemoved = true
    } catch (error) {
      report.passed = false
      report.cleanupFailure = `Contained disposable runtime cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    }
  } else {
    report.passed = false
    report.cleanupFailure = 'Disposable cleanup failed containment/name validation; runtime data was preserved.'
  }
  report.network.blocked ??= []
  report.network.allowedLoopback ??= []
  report.reportPath = reportPath
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
