import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
const reportDir = path.join(runtimeParent, 'native-image-metadata')
const runStamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
const reportPath = path.join(reportDir, `${runStamp}.json`)
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const publicOrigin = 'http://127.0.0.1:19761'
const captureRoot = path.join(runtimeRoot, 'capture')

// Remove integration configuration by name only. The Core and every write in
// this test are created under this unique runtime root.
for (const key of [
  'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
  'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT',
  'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE',
  'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'RECOVERY_TRANSPORT',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL',
  'LCOS_OLLAMA_EMBED_MODEL', 'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY',
  'LCOS_PROJECTS_DIR', 'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_COMPATIBLE_BASE_URL', 'OPENAI_BASE_URL',
  'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_API_KEY',
  'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY', 'GROQ_BASE_URL', 'GROQ_API_KEY',
  'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY', 'QWEN_BASE_URL',
  'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'MOONSHOT_API_KEY',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY',
  'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL', 'QIANFAN_API_KEY', 'COHERE_BASE_URL',
  'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL',
  'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL',
  'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION',
  'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = captureRoot
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Any accidental local model request is rejected before networking.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  runStamp,
  mode: 'real temporary Local Core + same-project facade; Core Artifact metadata title owner',
  originalUserDatabaseOpened: false,
  livePorts17879To17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  runtimeRoot,
  reportPath,
  network: { allowedCoreRequests: [], pinnedOllamaRejected: [], blocked: [], bootstrapBaselines: [], activeCoreOrigins: [] },
  facadeRequests: [],
  cases: [],
  failure: undefined,
  cleanup: { targetContained: false, facadeClosed: false, listenerReleased: false, runtimeRemoved: false },
}

const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let coreBootstrapInProgress = false
let coreOrigin
let facade
let repository
let projectId
let foreignProjectId
let foreignArtifactId
let coreOrigins = new Set()

function isLoopback(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function assertContained(parent, target, prefix) {
  const resolvedParent = path.resolve(parent)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget
    || (prefix && !path.basename(resolvedTarget).startsWith(prefix))) {
    throw new Error(`Refusing to use or clean a path outside the test-owned root: ${resolvedTarget}`)
  }
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
  report.network.bootstrapBaselines.push([...active])
  assert.equal(active.size, 0, 'No pre-existing listening loopback server may exist in this test process')
  coreBootstrapInProgress = true
}

function registerCoreOrigin(origin) {
  const active = activeListeningLoopbackOrigins()
  assert.ok(active.has(origin), 'Facade must return the origin of its live temporary Core listener')
  assert.equal(active.size, 1, 'Only the isolated Core listener may be active')
  assert.equal(blockedPorts.has(new URL(origin).port), false, 'Core must not use a reserved user-service port')
  coreOrigin = origin
  coreOrigins.add(origin)
  report.network.activeCoreOrigins.push(origin)
  coreBootstrapInProgress = false
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaRejected.push({ method, path: url.pathname })
      throw new Error('This test rejects the pinned dead Ollama endpoint before networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status })
      return response
    }
    report.network.blocked.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only the active temporary Core listener owned by this process may receive fetch requests.')
  }
}

async function callFacade(method, address, body) {
  const url = new URL(address, publicOrigin)
  const result = await facade.handle({ method, pathname: url.pathname, url: url.href, ...(body === undefined ? {} : { body }) })
  assert.ok(result != null, `${method} ${url.pathname} must be handled by this facade`)
  report.facadeRequests.push({ method: method.toUpperCase(), path: url.pathname, status: result.status })
  return result
}

function assertStatus(result, status, code, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`)
  if (code) assert.equal(result.body?.error?.code, code, `${label}: exact error code`)
  return result.body
}

function assertOk(result, label) {
  assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.body)}`)
  assert.equal(result.body?.ok, true, `${label}: original Core envelope`)
  return result.body.value
}

const projectPath = (id) => `/api/lcos/core/projects/${encodeURIComponent(id)}`
const canvasPath = (id) => `/api/canvas/v1/canvases/${encodeURIComponent(id)}`
const bindingPath = (id) => `${projectPath(id)}/spatial/bindings`
const artifactTitlePath = (id) => `/api/lcos/core/entities/artifact/${encodeURIComponent(id)}/title`

async function readNativeCanvas(canvasId) {
  const result = await callFacade('GET', canvasPath(canvasId))
  assert.equal(result.status, 200, `NativeCanvas GET ${canvasId}: ${JSON.stringify(result.body)}`)
  return result.body.data
}

async function readLibraryAssets(folderId) {
  const result = await callFacade('GET', `/api/library/v1/folders/${encodeURIComponent(folderId)}/assets`)
  assert.equal(result.status, 200, `Library GET: ${JSON.stringify(result.body)}`)
  return result.body.data.assets
}

async function readCoreFileBytes(projectIdValue, fileRecordId) {
  const result = await callFacade('GET', `${projectPath(projectIdValue)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
  assert.equal(result.status, 200, `Core FileRecord read ${fileRecordId}: ${JSON.stringify(result.body)}`)
  assert.ok(Buffer.isBuffer(result.body), `Core FileRecord ${fileRecordId} must return original binary bytes`)
  return Buffer.from(result.body)
}

async function readAllNativeCanvases() {
  const canvases = {}
  for (const workspace of repository.getWorkspaces(projectId)) {
    assert.ok(workspace.canvasId, 'Temporary Core Workspace must retain its native Canvas ID')
    canvases[String(workspace.canvasId)] = await readNativeCanvas(String(workspace.canvasId))
  }
  return canvases
}

async function readAllProjectFileBytes(graph) {
  const bytes = {}
  for (const file of graph.fileRecords ?? []) {
    bytes[String(file.id)] = await readCoreFileBytes(projectId, String(file.id))
  }
  return bytes
}

function titleModesForProject(graph, projectIdValue) {
  return Object.fromEntries((graph.artifacts ?? []).map((artifact) => {
    const id = String(artifact.id)
    return [id, repository.getEntityTitleMode('artifact', id)]
  }).sort(([left], [right]) => String(left).localeCompare(String(right))))
}

function directCoreState() {
  const graph = repository.get(projectId)
  assert.ok(graph, 'Temporary Core project graph must remain readable')
  const foreignGraph = repository.get(foreignProjectId)
  assert.ok(foreignGraph, 'Temporary foreign fixture graph must remain readable')
  return structuredClone({
    graph,
    titleModes: titleModesForProject(graph, projectId),
    projectionBindings: repository.getProjectionBindings(projectId),
    importBatches: repository.listImportBatches(projectId),
    foreignGraph,
    foreignArtifactTitleMode: repository.getEntityTitleMode('artifact', foreignArtifactId),
  })
}

async function observableState(folderId) {
  const graph = repository.get(projectId)
  assert.ok(graph, 'Temporary Core project graph must remain readable')
  const bindingsResponse = await callFacade('GET', bindingPath(projectId))
  const bindings = assertOk(bindingsResponse, 'original spatial binding read')
  assert.deepEqual(bindings, repository.getProjectionBindings(projectId),
    'facade binding read must be the exact original Core ProjectionBinding list')
  const presentationResponse = await callFacade('GET', `${projectPath(projectId)}/presentations`)
  const runResponse = await callFacade('GET', `${projectPath(projectId)}/runs`)
  assert.equal(presentationResponse.status, 200, 'Core Presentation list must remain readable')
  assert.equal(runResponse.status, 200, 'Core Run list must remain readable')
  const libraryAssets = await readLibraryAssets(folderId)
  return {
    graph: structuredClone(graph),
    titleModes: titleModesForProject(graph, projectId),
    bindings: structuredClone(bindings),
    fileBytes: await readAllProjectFileBytes(graph),
    canvases: await readAllNativeCanvases(),
    libraryAssets: structuredClone(libraryAssets),
    presentations: structuredClone(presentationResponse.body),
    runs: structuredClone(runResponse.body),
    importBatches: structuredClone(repository.listImportBatches(projectId)),
    foreignGraph: structuredClone(repository.get(foreignProjectId)),
    foreignArtifactTitleMode: repository.getEntityTitleMode('artifact', foreignArtifactId),
  }
}

function normalizeGraphTitleChange(graph, artifactId) {
  const clone = structuredClone(graph)
  clone.artifacts = clone.artifacts.map((artifact) => {
    if (String(artifact.id) !== artifactId) return artifact
    const normalized = { ...artifact }
    for (const key of ['title', 'updatedAt', 'updated_at', 'titleMode', 'title_mode']) {
      if (Object.hasOwn(normalized, key)) normalized[key] = `__title-owner-${key}__`
    }
    return normalized
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)))
  return clone
}

function normalizeCanvasTitleProjection(canvas, artifactId) {
  const clone = structuredClone(canvas)
  for (const node of clone.nodes ?? []) {
    const ref = node.data?.lcos_ref
    if (node.type === 'image' && String(ref?.artifactId ?? '') === artifactId) node.data.title = '__Core Artifact title projection__'
  }
  return clone
}

function normalizeTitleModes(values, artifactId) {
  const clone = { ...values }
  if (Object.hasOwn(clone, artifactId)) clone[artifactId] = '__Core Artifact title mode__'
  return clone
}

function normalizeLibraryAssets(assets, artifactId) {
  return assets.map((asset) => String(asset.id) === artifactId
    ? { ...asset, name: '__Core Artifact title projection__', updated_at: '__Core Artifact updatedAt projection__' }
    : asset).sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

function normalizeTitleOwnerEffects(state, artifactId) {
  return {
    ...state,
    graph: normalizeGraphTitleChange(state.graph, artifactId),
    titleModes: normalizeTitleModes(state.titleModes, artifactId),
    canvases: Object.fromEntries(Object.entries(state.canvases).map(([id, canvas]) => [id, normalizeCanvasTitleProjection(canvas, artifactId)])),
    libraryAssets: normalizeLibraryAssets(state.libraryAssets, artifactId),
  }
}

function changedKeys(before, after) {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .sort()
}

test('Core Artifact title owner renames a bound native image without changing material, bindings, history, or canvas geometry', async () => {
  try {
    const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
    const fixtureOwnersEntry = path.join(runtimeRoot, 'current-gen2-capture-owners.mjs')
    await Promise.all([
      buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeEntry),
      buildPilotEntry('lab/pilot/current-gen2-capture-owners.ts', fixtureOwnersEntry),
    ])
    const [facadeModule, fixtureOwners] = await Promise.all([
      import(pathToFileURL(facadeEntry).href),
      import(pathToFileURL(fixtureOwnersEntry).href),
    ])
    assert.equal(typeof facadeModule.startSurfaceCoreFacade, 'function')
    assert.equal(typeof fixtureOwners.createTextArtifact, 'function')

    installFetchBoundary()
    const bootstrapping = activeListeningLoopbackOrigins()
    report.network.bootstrapBaselines.push([...bootstrapping])
    assert.equal(bootstrapping.size, 0, 'No pre-existing loopback listener may be reused')
    coreBootstrapInProgress = true
    facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
    repository = facade.core.repository
    projectId = String(facade.core.projectId)
    coreOrigin = String(facade.core.origin)
    registerCoreOrigin(coreOrigin)
    assert.ok(isWithin(runtimeRoot, repository.databasePath), 'Core SQLite database must be inside this run runtime')
    assert.ok(isWithin(runtimeRoot, repository.getProject(projectId)?.rootPath ?? ''), 'Core Project files must be inside this run runtime')

    foreignProjectId = 'native-image-metadata-foreign'
    const foreignRoot = path.join(runtimeRoot, 'foreign-project')
    await mkdir(foreignRoot, { recursive: true })
    repository.createProject({ id: foreignProjectId, name: 'Disposable foreign project', rootPath: foreignRoot })
    const foreignScope = repository.getScopes(foreignProjectId).find((scope) => scope.kind === 'root')
    assert.ok(foreignScope, 'Core creates a root Scope for the foreign-project guard fixture')
    const foreignArtifact = await fixtureOwners.createTextArtifact(repository, foreignProjectId, {
      title: 'Foreign artifact title must remain unchanged', body: 'foreign-only synthetic fixture', scopeId: String(foreignScope.id),
    })
    foreignArtifactId = String(foreignArtifact.artifactId)
    assert.equal(String(repository.getArtifact(foreignArtifactId)?.projectId), foreignProjectId)

    const mainCanvasId = 'surface-core-main'
    const mainPath = canvasPath(mainCanvasId)
    const projectGraphBefore = repository.get(projectId)
    assert.ok(projectGraphBefore, 'Fresh Core project graph exists')
    const initialCanvas = await readNativeCanvas(mainCanvasId)
    const initialImageNodes = initialCanvas.nodes.filter((node) => node.type === 'image' && node.data?.lcos_ref?.artifactId)
    assert.ok(initialImageNodes.length > 0, 'Baseline NativeCanvas must contain an image with an exact Core identity')
    const sourceNode = initialImageNodes[0]
    const sourceRef = sourceNode.data.lcos_ref
    const targetArtifactId = String(sourceRef.artifactId)
    assert.equal(sourceRef.entityType, 'artifact', 'Baseline original image is the Artifact carrier, not an inferred image DTO')
    assert.equal(sourceRef.entityId, targetArtifactId)

    const imageBindingsRoute = await callFacade('GET', bindingPath(projectId))
    const imageBindings = assertOk(imageBindingsRoute, 'original SpatialBinding read')
    assert.deepEqual(imageBindings, repository.getProjectionBindings(projectId), 'read route must return original Core binding rows')
    const sourceBinding = imageBindings.find((binding) => binding.canvasId === mainCanvasId && binding.spatialId === sourceNode.id)
    assert.ok(sourceBinding, 'Baseline image has one persisted Core ProjectionBinding')
    assert.deepEqual([sourceBinding.entityType, sourceBinding.entityId], ['artifact', targetArtifactId])

    const artifact = repository.getArtifact(targetArtifactId)
    const sourceView = repository.getArtifactView(String(sourceRef.artifactViewId))
    const sourceRevision = repository.getArtifactRevision(String(sourceRef.revisionId))
    const sourceFile = sourceRevision ? repository.getFileRecord(String(sourceRevision.fileRecordId)) : undefined
    assert.ok(artifact && sourceView && sourceRevision && sourceFile, 'Native image identity must join to Core Artifact/View/Revision/FileRecord facts')
    assert.equal(String(artifact.projectId), projectId)
    assert.equal(artifact.kind, 'image')
    assert.equal(String(sourceView.artifactId), targetArtifactId)
    assert.equal(String(sourceRevision.artifactId), targetArtifactId)
    assert.equal(String(sourceView.revisionId), String(sourceRevision.id))
    assert.equal(String(sourceFile.projectId), projectId)

    // Bootstrap a real additional image View through the original native batch
    // lifecycle. This is before the title baseline; no resolver/import helper
    // is used to hydrate the image or claim its Core identity.
    const duplicateNodeId = `native-image-title-view-${randomUUID()}`
    const duplicateData = {
      title: String(artifact.title), src: String(sourceNode.data.src), type: 'upload', prompt: '', defaultOpenGallery: false,
      ...(sourceNode.data.__metadata === undefined ? {} : { __metadata: structuredClone(sourceNode.data.__metadata) }),
    }
    const graphBeforeDuplicate = repository.get(projectId)
    assert.ok(graphBeforeDuplicate)
    const duplicateResponse = await callFacade('POST', `${mainPath}/nodes:batchActions`, {
      canvas_id: mainCanvasId,
      actions: [{ action: 'create', creates: [{ id: duplicateNodeId, type: 'image', position: { x: 720, y: 460 },
        measured: { width: 360, height: 240 }, lcos_ref: structuredClone(sourceRef), data: duplicateData }] }],
      lcos_operation: { version: 1, operationId: `native-image-title-duplicate-${randomUUID()}`, kind: 'duplicate-view', phase: 'apply' },
    })
    assert.equal(duplicateResponse.status, 200, `Additional image View bootstrap: ${JSON.stringify(duplicateResponse.body)}`)
    const duplicateRef = duplicateResponse.body?.data?.lcos_refs?.[duplicateNodeId]
    assert.ok(duplicateRef, 'Original node lifecycle returns the duplicate image Core reference')
    assert.equal(duplicateRef.entityType, 'view')
    assert.equal(String(duplicateRef.artifactId), targetArtifactId)
    assert.notEqual(String(duplicateRef.artifactViewId), String(sourceRef.artifactViewId))
    assert.equal(String(duplicateRef.revisionId), String(sourceRef.revisionId))
    const graphAfterDuplicate = repository.get(projectId)
    assert.ok(graphAfterDuplicate)
    assert.equal(graphAfterDuplicate.artifacts.length, graphBeforeDuplicate.artifacts.length, 'Duplicate View must not create another Artifact')
    assert.equal(graphAfterDuplicate.artifactRevisions.length, graphBeforeDuplicate.artifactRevisions.length, 'Duplicate View must not create a Revision')
    assert.equal(graphAfterDuplicate.fileRecords.length, graphBeforeDuplicate.fileRecords.length, 'Duplicate View must not copy image bytes')
    assert.equal(graphAfterDuplicate.artifactViews.length, graphBeforeDuplicate.artifactViews.length + 1, 'Duplicate bootstrap adds exactly one View')
    const duplicateView = repository.getArtifactView(String(duplicateRef.artifactViewId))
    assert.equal(duplicateView?.referenceKind, 'explicit_additional')
    assert.equal(String(duplicateView?.artifactId), targetArtifactId)

    const canvasAfterDuplicate = await readNativeCanvas(mainCanvasId)
    const duplicateNode = canvasAfterDuplicate.nodes.find((node) => node.id === duplicateNodeId)
    assert.ok(duplicateNode, 'NativeCanvas GET reads back the duplicate image carrier')
    assert.equal(duplicateNode.data.lcos_ref.entityType, 'view')
    assert.equal(String(duplicateNode.data.lcos_ref.artifactId), targetArtifactId)
    const bindingsAfterDuplicate = assertOk(await callFacade('GET', bindingPath(projectId)), 'binding read after duplicate')
    assert.deepEqual(bindingsAfterDuplicate, repository.getProjectionBindings(projectId))
    assert.ok(bindingsAfterDuplicate.some((binding) => binding.canvasId === mainCanvasId && binding.spatialId === duplicateNodeId
      && binding.entityType === 'view' && binding.entityId === String(duplicateRef.artifactViewId)),
    'the additional image View is backed by the original Core binding store')

    const foldersResponse = await callFacade('GET', '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders')
    assert.equal(foldersResponse.status, 200, 'Native Library folder projection is available')
    const folderId = String(foldersResponse.body?.data?.folders?.[0]?.id ?? '')
    assert.ok(folderId, 'Temporary project has one local Library folder')

    const titleRoute = artifactTitlePath(targetArtifactId)
    const renameInput = (title) => ({ title, mode: 'manual', generatedBy: 'user' })
    const titleModeBefore = repository.getEntityTitleMode('artifact', targetArtifactId)
    const baselineDirect = directCoreState()

    // The new binding projection is a read-only mapping to original Core rows;
    // wrong-project reads and unregistered writes must never be forwarded.
    const requestCountBeforeBindingGuards = report.network.allowedCoreRequests.length
    const foreignBindings = await callFacade('GET', bindingPath(foreignProjectId))
    assertStatus(foreignBindings, 404, 'PROJECT_NOT_FOUND', 'cross-project binding read')
    const sourceBindingBody = { canvasId: mainCanvasId, spatialKind: 'node', spatialId: duplicateNodeId,
      entityType: 'view', entityId: String(duplicateRef.artifactViewId) }
    assertStatus(await callFacade('PUT', bindingPath(projectId), { projectId, ...sourceBindingBody }),
      501, 'CORE_OPERATION_NOT_CONNECTED', 'binding write remains disconnected')
    assertStatus(await callFacade('DELETE', bindingPath(projectId), sourceBindingBody),
      501, 'CORE_OPERATION_NOT_CONNECTED', 'binding delete remains disconnected')
    assert.equal(report.network.allowedCoreRequests.length, requestCountBeforeBindingGuards,
      'cross-project binding and unregistered binding writes stop before Core HTTP')
    assert.deepEqual(repository.getProjectionBindings(projectId), baselineDirect.projectionBindings,
      'binding reads/writes do not create, update, or delete a Core binding')

    // Existing Core validation/errors are retained and produce no state changes.
    const invalidTitle = await callFacade('POST', titleRoute, renameInput('   '))
    assertStatus(invalidTitle, 400, 'INVALID_ARGUMENT', 'blank Artifact title')
    assert.deepEqual(directCoreState(), baselineDirect, 'blank title has zero Core side effects')
    const unknownField = await callFacade('POST', titleRoute, { ...renameInput('Should not persist'), unexpected: true })
    assertStatus(unknownField, 400, 'INVALID_ARGUMENT', 'unknown title field')
    assert.deepEqual(directCoreState(), baselineDirect, 'unknown title field has zero Core side effects')

    const requestsBeforeOwnershipRejects = report.network.allowedCoreRequests.length
    const foreignTitle = await callFacade('POST', artifactTitlePath(foreignArtifactId), renameInput('Cross-project write'))
    assertStatus(foreignTitle, 404, 'ARTIFACT_NOT_FOUND', 'cross-project Artifact title write')
    const workspaceId = String(repository.getWorkspaces(projectId)[0]?.id ?? '')
    assert.ok(workspaceId, 'Temporary Core project has a Workspace for the non-Artifact route guard')
    const workspaceTitle = await callFacade('POST', `/api/lcos/core/entities/workspace/${encodeURIComponent(workspaceId)}/title`, renameInput('Workspace write is not connected'))
    assertStatus(workspaceTitle, 501, 'CORE_OPERATION_NOT_CONNECTED', 'non-Artifact title owner remains disconnected')
    assert.equal(report.network.allowedCoreRequests.length, requestsBeforeOwnershipRejects,
      'cross-project and non-Artifact title writes are rejected by the facade before Core HTTP')
    assert.deepEqual(directCoreState(), baselineDirect, 'ownership and non-Artifact rejections have zero Core side effects')

    // The ordinary node batch remains presentation-only for an image title.
    const fakeBatchTitle = await callFacade('POST', `${mainPath}/nodes:batchActions`, {
      canvas_id: mainCanvasId,
      actions: [{ action: 'update', updates: [{ id: duplicateNodeId, data: { title: 'Must not bypass Core title owner' } }] }],
    })
    assertStatus(fakeBatchTitle, 501, 'IMAGE_TITLE_UPDATE_NOT_IMPLEMENTED', 'image node data cannot impersonate title metadata')
    assert.deepEqual(directCoreState(), baselineDirect, 'rejected image node title patch has zero Core side effects')

    const baseline = await observableState(folderId)
    assert.deepEqual(baseline.graph, baselineDirect.graph, 'Read-only observations do not mutate the Core graph')
    const baselineArtifact = repository.getArtifact(targetArtifactId)
    assert.ok(baselineArtifact)
    const baselineViewIds = baseline.graph.artifactViews.filter((view) => String(view.artifactId) === targetArtifactId).map((view) => String(view.id)).sort()
    assert.ok(baselineViewIds.includes(String(sourceRef.artifactViewId)) && baselineViewIds.includes(String(duplicateRef.artifactViewId)),
      'Baseline includes both the original image View and the exact additional same-Artifact View')

    const newTitle = `F2 metadata rename ${runStamp}`
    await new Promise((resolve) => setTimeout(resolve, 5))
    const renameStartIndex = report.network.allowedCoreRequests.length
    const renamed = await callFacade('POST', titleRoute, renameInput(newTitle))
    assert.equal(renamed.status, 200, `Original Core Artifact title owner: ${JSON.stringify(renamed.body)}`)
    assert.deepEqual(renamed.body?.value, { id: targetArtifactId, entity: 'artifact', title: newTitle, mode: 'manual' },
      'Core title owner returns the original manual title receipt')
    assert.deepEqual(report.network.allowedCoreRequests.slice(renameStartIndex).map(({ method, path, status }) => ({ method, path, status })),
      [{ method: 'POST', path: `/entities/artifact/${targetArtifactId}/title`, status: 200 }],
      'CoreArtifactClient.renameEntity contract forwards only the exact original Core POST')

    const after = await observableState(folderId)
    const updatedArtifact = repository.getArtifact(targetArtifactId)
    assert.ok(updatedArtifact)
    assert.equal(updatedArtifact.title, newTitle)
    assert.equal(repository.getEntityTitleMode('artifact', targetArtifactId), 'manual')
    assert.equal(updatedArtifact.updatedAt, after.graph.artifacts.find((row) => String(row.id) === targetArtifactId)?.updatedAt)
    assert.notEqual(updatedArtifact.updatedAt, baselineArtifact.updatedAt, 'Core owner updates only the target Artifact updatedAt')
    const beforeArtifactRow = baseline.graph.artifacts.find((row) => String(row.id) === targetArtifactId)
    const afterArtifactRow = after.graph.artifacts.find((row) => String(row.id) === targetArtifactId)
    assert.ok(beforeArtifactRow && afterArtifactRow)
    const rowChanges = changedKeys(beforeArtifactRow, afterArtifactRow)
    assert.ok(rowChanges.includes('title'), 'Target Artifact title changes')
    assert.ok(rowChanges.every((key) => ['title', 'updatedAt', 'updated_at', 'titleMode', 'title_mode'].includes(key)),
      `Only title/titleMode/updatedAt may change on the target Artifact; changed ${rowChanges.join(', ')}`)
    assert.deepEqual(normalizeTitleOwnerEffects(after, targetArtifactId), normalizeTitleOwnerEffects(baseline, targetArtifactId),
      'All canonical material, bytes, bindings, graph version, presentations, runs, imports, and spatial state remain unchanged except the target title projections')
    assert.deepEqual(normalizeGraphTitleChange(after.graph, targetArtifactId), normalizeGraphTitleChange(baseline.graph, targetArtifactId),
      'Artifact/View/Revision/FileRecord/project facts are otherwise identical')
    assert.deepEqual(normalizeTitleModes(after.titleModes, targetArtifactId), normalizeTitleModes(baseline.titleModes, targetArtifactId),
      'Only the target Artifact title mode can change')
    assert.equal(after.titleModes[targetArtifactId], 'manual')
    assert.deepEqual(after.bindings, baseline.bindings, 'Original and duplicate-image Core bindings remain byte-for-byte equivalent')

    const mainAfter = after.canvases[mainCanvasId]
    for (const nodeId of [sourceNode.id, duplicateNodeId]) {
      const node = mainAfter.nodes.find((item) => item.id === nodeId)
      assert.equal(node?.data?.title, newTitle, `NativeCanvas GET projects Core title onto image node ${nodeId}`)
      assert.equal(String(node?.data?.lcos_ref?.artifactId), targetArtifactId)
    }
    const libraryAsset = after.libraryAssets.find((asset) => String(asset.id) === targetArtifactId)
    assert.equal(libraryAsset?.name, newTitle, 'Library GET reads the new Core Artifact title')
    assert.equal(libraryAsset?.updated_at, updatedArtifact.updatedAt, 'Library updatedAt projection follows the existing Core Artifact owner')
    assert.equal(repository.get(projectId)?.graphVersion, baseline.graph.graphVersion, 'Metadata rename does not advance Project graph version')
    assert.ok(after.canvases[mainCanvasId].version === baseline.canvases[mainCanvasId].version,
      'Metadata rename does not advance native canvas geometry version')
    assert.deepEqual(after.fileBytes, baseline.fileBytes, 'All original FileRecord bytes are unchanged')

    const bindingReadAfter = assertOk(await callFacade('GET', bindingPath(projectId)), 'spatial binding read after title update')
    assert.deepEqual(bindingReadAfter, repository.getProjectionBindings(projectId))
    assert.deepEqual(bindingReadAfter, baseline.bindings, 'Read-only binding mapping still reflects the original persisted binding set')
    assert.equal(report.network.blocked.length, 0, 'No non-Core network request may be attempted')
    assert.deepEqual(report.network.pinnedOllamaRejected, [{ method: 'POST', path: '/api/embed' }],
      'Fresh image import may ask Core semantic indexing for one embedding, but the pinned Ollama fetch must be rejected before any network call')
    assert.ok(report.network.allowedCoreRequests.every((request) => request.origin === coreOrigin),
      'Every forwarded fetch targets only the active temporary Core listener')
    report.summary = {
      projectId, foreignProjectId, artifactId: targetArtifactId,
      originalImageNodeId: String(sourceNode.id), duplicateImageNodeId: duplicateNodeId,
      originalViewId: String(sourceRef.artifactViewId), additionalViewId: String(duplicateRef.artifactViewId),
      revisionId: String(sourceRevision.id), fileRecordId: String(sourceFile.id),
      titleModeBefore: titleModeBefore ?? null, titleModeAfter: repository.getEntityTitleMode('artifact', targetArtifactId),
      updatedAtBefore: baselineArtifact.updatedAt, updatedAtAfter: updatedArtifact.updatedAt,
      projectGraphVersion: after.graph.graphVersion,
      canvasVersions: Object.fromEntries(Object.entries(after.canvases).map(([id, canvas]) => [id, canvas.version])),
      presentationCount: Array.isArray(after.presentations.body?.value) ? after.presentations.body.value.length : undefined,
      runCount: Array.isArray(after.runs.body?.value) ? after.runs.body.value.length : undefined,
      fileRecordBytes: Object.fromEntries(Object.entries(after.fileBytes).map(([id, bytes]) => [id, bytes.length])),
      allowedCoreRequests: report.network.allowedCoreRequests.length,
    }
    report.cases.push(
      'Core ProjectionBinding GET returns original rows; cross-project read and PUT/DELETE remain closed without writes',
      'a real native image and same-Artifact additional View are joined through Core, then read through NativeCanvas and Library DTOs',
      'original Core Artifact title POST returns manual receipt and changes only target title/titleMode/updatedAt projections',
      'invalid, unknown-field, cross-project, non-Artifact, and image-node pseudo-title writes preserve original errors and zero side effects',
    )
  } catch (error) {
    report.failure = { name: error?.name, message: error?.message, stack: error?.stack }
    throw error
  }
})

after(async () => {
  let cleanupError
  try {
    if (facade) {
      await facade.close()
      report.cleanup.facadeClosed = true
    } else report.cleanup.facadeClosed = true
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error)
    report.cleanup.closeError = cleanupError
  } finally {
    if (fetchInstalled) globalThis.fetch = originalFetch
  }
  const remaining = activeListeningLoopbackOrigins()
  report.cleanup.listenerReleased = remaining.size === 0
  report.cleanup.remainingLoopbackOrigins = [...remaining]
  if (report.cleanup.facadeClosed && report.cleanup.listenerReleased) {
    try {
      assertContained(runtimeParent, runtimeRoot, 'case-')
      report.cleanup.targetContained = true
      await rm(runtimeRoot, { recursive: true, force: false })
      report.cleanup.runtimeRemoved = true
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error)
      report.cleanup.cleanupError = cleanupError
    }
  }
  try {
    assertContained(reportDir, reportPath, runStamp)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error)
    report.cleanup.reportError = cleanupError
  }
  console.log(`REPORT_PATH=${reportPath}`)
  console.log(`CLEANUP=${JSON.stringify(report.cleanup)}`)
  if (cleanupError || !report.cleanup.facadeClosed || !report.cleanup.listenerReleased || !report.cleanup.runtimeRemoved) {
    throw new Error(`Temporary Core cleanup failed: ${cleanupError ?? JSON.stringify(report.cleanup)}`)
  }
})
