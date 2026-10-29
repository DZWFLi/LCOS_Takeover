import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-result-material-'))

for (const key of [
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
  'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
  'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Semantic indexing remains the real Core producer, but any accidental local
// embedding request is pinned to a deliberately dead loopback origin.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  mode: 'read-only native ResultSlot material resolver with disposable Core repository',
  fixtureKind: 'Core snapshot + ResultSlot HTTP producer + Core ArtifactReturn Accept HTTP producer; no raw SQL',
  originalUserDatabaseOpened: false,
  liveCoreTouched: false,
  providerOrBridgeStarted: false,
  ollamaEmbeddingNetworkAllowed: false,
  cleanupTargetContainedInRuntime: false,
  network: {
    allowedCoreRequests: [],
    pinnedOllamaAttempts: [],
    blockedRequests: [],
    coreBootstrapBaselines: [],
    activeCoreOrigins: [],
  },
  semanticIndexes: [],
  cases: [],
}

let repository
let coreServer
let coreOrigin
let fetchInstalled = false
const originalFetch = globalThis.fetch.bind(globalThis)
const pinnedOllamaWaiters = []

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

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      const attempt = { method, origin: url.origin, path: url.pathname }
      report.network.pinnedOllamaAttempts.push(attempt)
      for (let index = pinnedOllamaWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = pinnedOllamaWaiters[index]
        if (report.network.pinnedOllamaAttempts.length < waiter.minimumCount) continue
        pinnedOllamaWaiters.splice(index, 1)
        clearTimeout(waiter.timer)
        waiter.resolve(attempt)
      }
      throw new Error('The native result-material test blocks its pinned dead Ollama endpoint without networking.')
    }

    const activeOrigins = activeListeningLoopbackOrigins()
    if (url.protocol === 'http:' && coreOrigin !== undefined && url.origin === coreOrigin
      && isLoopback(url.hostname) && activeOrigins.has(coreOrigin)) {
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname })
      return originalFetch(input, init)
    }

    report.network.blockedRequests.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('native result-material test blocked non-Core and non-pinned network access')
  }
}

function waitForPinnedOllamaAttemptAfter(count) {
  if (report.network.pinnedOllamaAttempts.length > count) {
    return Promise.resolve(report.network.pinnedOllamaAttempts[count])
  }
  return new Promise((resolve, reject) => {
    const waiter = { minimumCount: count + 1, resolve, reject, timer: undefined }
    waiter.timer = setTimeout(() => {
      const index = pinnedOllamaWaiters.indexOf(waiter)
      if (index >= 0) pinnedOllamaWaiters.splice(index, 1)
      reject(new Error('Core accepted the ArtifactReturn but its real search-index embedding path did not reach the pinned boundary.'))
    }, 5_000)
    pinnedOllamaWaiters.push(waiter)
  })
}

async function verifyAcceptedBodyIndexed(projectId, artifactId, body, attemptCountBefore) {
  await waitForPinnedOllamaAttemptAfter(attemptCountBefore)
  // FTS content is persisted before the existing embedding call. Let its
  // intentionally rejected promise unwind through the owner's catch path.
  await new Promise((resolve) => setImmediate(resolve))
  const token = body.match(/[A-Za-z0-9]+/)?.[0]
  assert.ok(token, 'synthetic body must include a searchable token')
  const hit = repository.searchDocumentsFts(projectId, token, 100)
    .find((row) => row.entityId === artifactId && row.body === body)
  assert.ok(hit, `The accepted body for ${artifactId} must be visible in the real Core FTS index before teardown.`)
  report.semanticIndexes.push({ artifactId, ftsBodyReadback: true, embeddingBlockedAt: 'http://127.0.0.1:1/api/embed' })
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(coreOrigin + pathname, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

async function createSlot({ projectId, scopeId, workspaceId, x, y }) {
  const body = {
    scopeId,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    x,
    y,
    width: 248,
    height: 180,
  }
  const result = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/result-slots`, body)
  assert.equal(result.status, 201, JSON.stringify(result.body))
  return result.body.value
}

function manifestFor(projectId, runId, artifactId, revisionId) {
  const canonicalJson = JSON.stringify({
    schemaVersion: 0,
    project: { id: projectId },
    fixtureRun: runId,
    targetArtifactId: artifactId,
    targetRevisionId: revisionId,
  })
  const manifestHash = createHash('sha256').update(canonicalJson).digest('hex')
  return {
    id: `manifest-${manifestHash}`,
    projectId,
    schemaVersion: 0,
    targetArtifactId: artifactId,
    targetRevisionId: revisionId,
    canonicalJson,
    manifestHash,
    createdAt: '2026-10-14T00:00:00.000Z',
  }
}

async function seedAndAccept({ projectId, projectRoot, artifactId, workspaceId, slot, runId, body }) {
  const now = '2026-10-14T00:00:00.000Z'
  const artifact = repository.getArtifact(artifactId)
  assert.ok(artifact?.currentRevisionId, `fixture Artifact ${artifactId} needs a Current revision`)
  const base = repository.getArtifactRevision(String(artifact.currentRevisionId))
  assert.ok(base)
  const manifest = manifestFor(projectId, runId, artifactId, String(base.id))
  repository.createContextManifest(manifest)

  const run = {
    id: runId,
    projectId,
    workspaceId,
    targetArtifactId: artifactId,
    targetRevisionId: String(base.id),
    contextManifestId: manifest.id,
    provider: 'workbuddy',
    requestedProvider: 'workbuddy',
    outputIntent: 'revise',
    returnGroupId: `return-group-${runId}`,
    status: 'running',
    instruction: `Synthetic no-provider fixture ${runId}`,
    createdAt: now,
    updatedAt: now,
  }
  const dispatch = {
    id: `dispatch-${runId}`,
    runId,
    provider: 'workbuddy',
    idempotencyKey: runId,
    status: 'bound',
    attemptCount: 1,
    createdAt: now,
    updatedAt: now,
  }
  repository.createRunWithDispatch(run, dispatch, slot?.id)
  repository.createRuntimeBinding({
    id: `binding-${runId}`,
    runId,
    provider: 'workbuddy',
    externalTaskId: `synthetic-task-${runId}`,
    providerStatus: 'review',
    lastSyncedAt: now,
    finalizePending: false,
    createdAt: now,
    updatedAt: now,
  })

  const bytes = Buffer.from(body, 'utf8')
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const fileId = `file-${runId}`
  const filePath = path.join(projectRoot, '.creative-os', 'runtime', runId, 'staging', 'draft.md')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, bytes)
  const fileRecord = {
    id: fileId,
    projectId,
    observedPath: filePath,
    observedHash: contentHash,
    size: bytes.byteLength,
    modifiedAt: now,
    mimeType: 'text/markdown',
    availability: 'current',
    observedAt: now,
  }
  const draft = {
    id: `revision-${runId}`,
    artifactId,
    fileRecordId: fileId,
    parentRevisionId: String(base.id),
    contentHash,
    source: 'run',
    runId,
    status: 'draft',
    createdAt: now,
  }
  const artifactReturn = {
    id: `return-${runId}`,
    runId,
    targetArtifactId: artifactId,
    baseRevisionId: String(base.id),
    returnedFileId: fileId,
    contentHash,
    canonicalPath: filePath,
    action: 'created',
    status: 'pending_review',
    draftRevisionId: draft.id,
    createdAt: now,
    updatedAt: now,
  }
  repository.createRuntimeDraft(fileRecord, draft, artifactReturn)
  const ollamaAttemptCountBefore = report.network.pinnedOllamaAttempts.length
  const acceptResponse = await coreRequest('POST', `/artifact-returns/${encodeURIComponent(artifactReturn.id)}/accept`, {
    expectedBaseRevisionId: String(base.id),
  })
  assert.equal(acceptResponse.status, 200, JSON.stringify(acceptResponse.body))
  await verifyAcceptedBodyIndexed(projectId, artifactId, body, ollamaAttemptCountBefore)
  const accepted = acceptResponse.body.value
  return { artifact, base, draft, fileRecord, artifactReturn, accepted }
}

async function promoteSlot(projectId, slot, canvasId, spatialId) {
  const result = await coreRequest('POST',
    `/projects/${encodeURIComponent(projectId)}/spatial/result-slots/${encodeURIComponent(slot.id)}/materialize`,
    { canvasId, spatialId })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  return result.body.value
}

function expectMaterialConflict(operation) {
  assert.throws(operation, error => error?.status === 409 && error?.code === 'NATIVE_RESULT_MATERIAL_CONFLICT')
}

try {
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  const materialEntry = path.join(runtimeRoot, 'native-result-material.mjs')
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  await buildPilotEntry('lab/pilot/native-result-material.ts', materialEntry)
  const [core, materialModule] = await Promise.all([
    import(pathToFileURL(coreEntry).href),
    import(pathToFileURL(materialEntry).href),
  ])

  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true })
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  const baseSnapshot = core.createMvpSampleSnapshot(projectRoot, '2026-10-14T00:00:00.000Z')
  const projectId = String(baseSnapshot.project.id)
  const rootScopeId = String(baseSnapshot.scopes.find(scope => scope.kind === 'root').id)
  const now = '2026-10-14T00:00:00.000Z'
  const resultScopeId = 'scope-native-result-context'
  const uniqueMainScopeId = 'scope-native-result-main-unique'
  const ambiguousMainScopeId = 'scope-native-result-main-ambiguous'
  const contextScope = {
    id: resultScopeId,
    projectId,
    parentScopeId: rootScopeId,
    containerViewId: null,
    kind: 'context',
    name: 'Synthetic result context',
    createdAt: now,
    updatedAt: now,
  }
  const uniqueMainScope = {
    ...contextScope,
    id: uniqueMainScopeId,
    name: 'Synthetic unique Main scope',
  }
  const ambiguousMainScope = {
    ...contextScope,
    id: ambiguousMainScopeId,
    name: 'Synthetic ambiguous Main scope',
  }
  const workspace = (id, scopeId, canvasId, preferredSurface) => ({
    id,
    projectId,
    scopeId,
    name: id,
    intent: 'explore',
    viewport: { x: 0, y: 0, zoom: 1 },
    focusedViewIds: [],
    visibleLayers: ['core', 'process'],
    contextPolicy: 'selection-only',
    preferredSurface,
    canvasId,
    updatedAt: now,
  })
  const workspaceA = workspace('workspace-native-result-a', resultScopeId, 'canvas-native-result-a', 'context')
  const workspaceB = workspace('workspace-native-result-b', resultScopeId, 'canvas-native-result-b', 'workflow')
  const workspaceMainUnique = workspace('workspace-native-result-main-unique', uniqueMainScopeId, 'canvas-native-result-main-unique', 'main')
  const workspaceMainAmbiguousA = workspace('workspace-native-result-main-ambiguous-a', ambiguousMainScopeId, 'canvas-native-result-main-ambiguous-a', 'main')
  const workspaceMainAmbiguousB = workspace('workspace-native-result-main-ambiguous-b', ambiguousMainScopeId, 'canvas-native-result-main-ambiguous-b', 'main')
  const primaryWorkspace = { ...baseSnapshot.workspaces[0], canvasId: 'canvas-native-result-primary' }
  repository.save({
    ...baseSnapshot,
    scopes: [...baseSnapshot.scopes, contextScope, uniqueMainScope, ambiguousMainScope],
    workspaces: [...baseSnapshot.workspaces.map((candidate, index) => index === 0 ? primaryWorkspace : candidate),
      workspaceA, workspaceB, workspaceMainUnique, workspaceMainAmbiguousA, workspaceMainAmbiguousB],
  })

  const coreBootstrapBaseline = activeListeningLoopbackOrigins()
  report.network.coreBootstrapBaselines.push([...coreBootstrapBaseline])
  assert.equal(coreBootstrapBaseline.size, 0,
    'No pre-existing loopback server may be present before this disposable Core starts.')
  installFetchBoundary()
  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  coreOrigin = `http://${address.host}:${address.port}`
  const activeCoreOrigins = activeListeningLoopbackOrigins()
  assert.ok(activeCoreOrigins.has(coreOrigin), 'The returned Core origin must be a live server in this process.')
  assert.equal(activeCoreOrigins.size, 1, 'Only this disposable Core loopback server may be active.')
  report.network.activeCoreOrigins.push(coreOrigin)

  const resolve = input => materialModule.resolveNativeResultMaterial({ repository, projectId, ...input })
  const targetCanvas = String(workspaceA.canvasId)
  const targetSpatialId = 'node-native-result-a'
  const firstSlot = await createSlot({
    projectId,
    scopeId: resultScopeId,
    workspaceId: String(workspaceA.id),
    x: 350,
    y: 120,
  })
  repository.upsertProjectionBinding({
    projectId,
    canvasId: targetCanvas,
    spatialKind: 'node',
    spatialId: targetSpatialId,
    entityType: 'result-slot',
    entityId: String(firstSlot.id),
  })
  const first = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-brief',
    workspaceId: String(workspaceA.id),
    slot: firstSlot,
    runId: 'run-native-result-historical-first',
    body: '# Accepted version one\n\nExact slot material body.\n',
  })

  assert.equal(resolve({ canvasId: targetCanvas, spatialId: targetSpatialId }), undefined,
    'a ResultSlot carrier before canonical promotion is not an Artifact material binding')
  const promoted = await promoteSlot(projectId, firstSlot, targetCanvas, targetSpatialId)
  assert.equal(promoted.status, 'promoted')
  const resolvedBeforeCurrentChanges = resolve({ canvasId: targetCanvas, spatialId: targetSpatialId })
  assert.ok(resolvedBeforeCurrentChanges)
  assert.equal(resolvedBeforeCurrentChanges.artifact.id, 'artifact-brief')
  assert.equal(resolvedBeforeCurrentChanges.view.artifactId, 'artifact-brief')
  assert.equal(resolvedBeforeCurrentChanges.view.referenceKind, 'explicit_additional')
  assert.equal(resolvedBeforeCurrentChanges.revision.id, first.draft.id)
  assert.equal(resolvedBeforeCurrentChanges.file.id, first.fileRecord.id)
  assert.equal(resolvedBeforeCurrentChanges.slot.id, firstSlot.id)
  assert.equal(resolvedBeforeCurrentChanges.slot.artifactId, resolvedBeforeCurrentChanges.artifact.id)
  assert.equal(resolvedBeforeCurrentChanges.slot.artifactViewId, resolvedBeforeCurrentChanges.view.id)
  assert.equal(resolvedBeforeCurrentChanges.view.revisionId, resolvedBeforeCurrentChanges.revision.id)
  assert.equal(resolvedBeforeCurrentChanges.revision.status, 'current')
  assert.equal(resolvedBeforeCurrentChanges.file.projectId, projectId)
  assert.ok(repository.getWorkspaces(projectId).find(candidate => String(candidate.id) === String(workspaceA.id))
    .focusedViewIds.some(id => String(id) === String(resolvedBeforeCurrentChanges.view.id)))
  report.cases.push('sole accepted explicit_additional view resolves only after slot carrier promotion and explicit workspace focus')

  const beforeRead = {
    artifact: repository.getArtifact('artifact-brief'),
    slot: repository.getResultSlot(String(firstSlot.id)),
    view: repository.getArtifactView(String(resolvedBeforeCurrentChanges.view.id)),
    bindings: repository.getProjectionBindings(projectId),
    workspace: repository.getWorkspace(String(workspaceA.id)),
  }
  resolve({ canvasId: targetCanvas, spatialId: targetSpatialId })
  assert.deepEqual(repository.getArtifact('artifact-brief'), beforeRead.artifact)
  assert.deepEqual(repository.getResultSlot(String(firstSlot.id)), beforeRead.slot)
  assert.deepEqual(repository.getArtifactView(String(resolvedBeforeCurrentChanges.view.id)), beforeRead.view)
  assert.deepEqual(repository.getProjectionBindings(projectId), beforeRead.bindings)
  assert.deepEqual(repository.getWorkspace(String(workspaceA.id)), beforeRead.workspace)
  report.cases.push('resolver performs no Core mutation or geometry/view/binding write')

  const second = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-brief',
    workspaceId: String(workspaceA.id),
    slot: undefined,
    runId: 'run-native-result-historical-current',
    body: '# Later Current\n\nThis becomes Current, not the selected slot view.\n',
  })
  assert.equal(repository.getArtifact('artifact-brief').currentRevisionId, second.draft.id)
  const historical = resolve({ canvasId: targetCanvas, spatialId: targetSpatialId })
  assert.ok(historical)
  assert.equal(historical.revision.id, first.draft.id)
  assert.equal(historical.revision.status, 'superseded')
  assert.notEqual(historical.revision.id, historical.artifact.currentRevisionId)
  assert.equal(historical.file.id, first.fileRecord.id)
  report.cases.push('later Current does not replace the exact accepted historical view revision or its FileRecord')

  const unrelatedCarrierId = 'node-native-result-other-workspace'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(workspaceB.canvasId),
    spatialKind: 'node',
    spatialId: unrelatedCarrierId,
    entityType: 'artifact',
    entityId: 'artifact-brief',
  })
  assert.equal(resolve({ canvasId: String(workspaceB.canvasId), spatialId: unrelatedCarrierId }), undefined,
    'an Artifact carrier in another workspace cannot borrow this slot’s material view')
  report.cases.push('slot tied to workspace A does not resolve on an unrelated artifact carrier in workspace B')

  const foreignProjectId = 'disposable-native-result-foreign-project'
  repository.createProject({
    id: foreignProjectId,
    name: 'Synthetic foreign project',
    rootPath: path.join(runtimeRoot, 'foreign-project'),
  })
  repository.upsertArtifact({
    id: 'artifact-native-result-foreign',
    projectId: foreignProjectId,
    title: 'Foreign synthetic artifact',
    kind: 'markdown',
    availability: 'available',
    createdAt: now,
    updatedAt: now,
  })
  const foreignSpatialId = 'node-native-result-foreign-binding'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(workspaceB.canvasId),
    spatialKind: 'node',
    spatialId: foreignSpatialId,
    entityType: 'artifact',
    entityId: 'artifact-native-result-foreign',
  })
  expectMaterialConflict(() => resolve({ canvasId: String(workspaceB.canvasId), spatialId: foreignSpatialId }))
  report.cases.push('cross-project Artifact binding raises an explicit 409 conflict instead of resolving or guessing')

  const multiFirstSlot = await createSlot({
    projectId,
    scopeId: resultScopeId,
    workspaceId: String(workspaceA.id),
    x: 550,
    y: 120,
  })
  const multiFirstSpatialId = 'node-native-result-multiple-first'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: targetCanvas,
    spatialKind: 'node',
    spatialId: multiFirstSpatialId,
    entityType: 'result-slot',
    entityId: String(multiFirstSlot.id),
  })
  const multiFirst = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-script',
    workspaceId: String(workspaceA.id),
    slot: multiFirstSlot,
    runId: 'run-native-result-multiple-first',
    body: '# First reserved version\n',
  })
  assert.ok(multiFirst.accepted)
  assert.equal((await promoteSlot(projectId, multiFirstSlot, targetCanvas, multiFirstSpatialId)).status, 'promoted')

  const multiSecondSlot = await createSlot({
    projectId,
    scopeId: resultScopeId,
    workspaceId: String(workspaceA.id),
    x: 800,
    y: 120,
  })
  const multiSecondSpatialId = 'node-native-result-multiple-second'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: targetCanvas,
    spatialKind: 'node',
    spatialId: multiSecondSpatialId,
    entityType: 'result-slot',
    entityId: String(multiSecondSlot.id),
  })
  const multiSecond = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-script',
    workspaceId: String(workspaceA.id),
    slot: multiSecondSlot,
    runId: 'run-native-result-multiple-second',
    body: '# Second reserved version\n',
  })
  assert.ok(multiSecond.accepted)
  assert.equal((await promoteSlot(projectId, multiSecondSlot, targetCanvas, multiSecondSpatialId)).status, 'existing-artifact')
  expectMaterialConflict(() => resolve({ canvasId: targetCanvas, spatialId: multiFirstSpatialId }))
  report.cases.push('two accepted slots for one Artifact/workspace are rejected as ambiguous; no latest/array-order guess')

  const uniqueMainSlot = await createSlot({
    projectId,
    scopeId: uniqueMainScopeId,
    workspaceId: undefined,
    x: 80,
    y: 500,
  })
  const uniqueMainSpatialId = 'node-native-result-unscoped-main'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(workspaceMainUnique.canvasId),
    spatialKind: 'node',
    spatialId: uniqueMainSpatialId,
    entityType: 'result-slot',
    entityId: String(uniqueMainSlot.id),
  })
  await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-reference',
    workspaceId: String(workspaceMainUnique.id),
    slot: uniqueMainSlot,
    runId: 'run-native-result-unscoped-main',
    body: '# Unique Main slot version\n',
  })
  assert.equal((await promoteSlot(projectId, uniqueMainSlot, String(workspaceMainUnique.canvasId), uniqueMainSpatialId)).status, 'promoted')
  const uniqueMain = resolve({ canvasId: String(workspaceMainUnique.canvasId), spatialId: uniqueMainSpatialId })
  assert.ok(uniqueMain)
  assert.equal(uniqueMain.slot.id, uniqueMainSlot.id)
  assert.equal(uniqueMain.slot.workspaceId, undefined)
  report.cases.push('workspace-less slot resolves only through its unique same-scope Main worksite')

  const ambiguousMainSlot = await createSlot({
    projectId,
    scopeId: ambiguousMainScopeId,
    workspaceId: undefined,
    x: 100,
    y: 700,
  })
  const ambiguousMainSpatialId = 'node-native-result-ambiguous-main'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(workspaceMainAmbiguousA.canvasId),
    spatialKind: 'node',
    spatialId: ambiguousMainSpatialId,
    entityType: 'result-slot',
    entityId: String(ambiguousMainSlot.id),
  })
  await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-feedback',
    workspaceId: String(workspaceMainAmbiguousA.id),
    slot: ambiguousMainSlot,
    runId: 'run-native-result-ambiguous-main',
    body: '# Ambiguous Main slot version\n',
  })
  assert.equal((await promoteSlot(projectId, ambiguousMainSlot, String(workspaceMainAmbiguousA.canvasId), ambiguousMainSpatialId)).status, 'promoted')
  expectMaterialConflict(() => resolve({ canvasId: String(workspaceMainAmbiguousA.canvasId), spatialId: ambiguousMainSpatialId }))
  report.cases.push('workspace-less slot with multiple same-scope Main candidates raises an explicit conflict')

  const primarySlot = await createSlot({
    projectId,
    scopeId: rootScopeId,
    workspaceId: String(primaryWorkspace.id),
    x: 900,
    y: 400,
  })
  const primarySpatialId = 'node-native-result-primary-carrier'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(primaryWorkspace.canvasId),
    spatialKind: 'node',
    spatialId: primarySpatialId,
    entityType: 'result-slot',
    entityId: String(primarySlot.id),
  })
  const primaryViewsBefore = repository.getArtifactViews('artifact-script').filter((view) =>
    String(view.scopeId) === rootScopeId && view.referenceKind === 'primary')
  assert.equal(primaryViewsBefore.length, 1, 'the synthetic Workflow scope already has exactly one canonical primary view')
  const primaryAccepted = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-script',
    workspaceId: String(primaryWorkspace.id),
    slot: primarySlot,
    runId: 'run-native-result-existing-primary',
    body: '# Existing primary remains Current-following\n',
  })
  assert.equal((await promoteSlot(projectId, primarySlot, String(primaryWorkspace.canvasId), primarySpatialId)).status, 'promoted')
  const promotedPrimaryScopeMaterial = resolve({ canvasId: String(primaryWorkspace.canvasId), spatialId: primarySpatialId })
  assert.ok(promotedPrimaryScopeMaterial,
    'a primary view elsewhere in the scope must not hide the exact newly promoted ResultSlot carrier')
  assert.equal(promotedPrimaryScopeMaterial.view.referenceKind, 'explicit_additional')
  assert.equal(promotedPrimaryScopeMaterial.view.scopeId, rootScopeId)
  assert.equal(promotedPrimaryScopeMaterial.view.id, repository.getResultSlot(String(primarySlot.id)).artifactViewId)
  assert.equal(promotedPrimaryScopeMaterial.revision.id, primaryAccepted.draft.id)
  assert.equal(promotedPrimaryScopeMaterial.file.id, primaryAccepted.fileRecord.id)
  assert.ok(repository.getWorkspace(String(primaryWorkspace.id)).focusedViewIds
    .some((id) => String(id) === String(promotedPrimaryScopeMaterial.view.id)))
  report.cases.push('same-scope Primary with no prior Artifact canvas binding still resolves the promoted exact additional slot view')

  const existingPrimaryArtifactSpatialId = 'node-native-result-existing-primary-artifact'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(primaryWorkspace.canvasId),
    spatialKind: 'node',
    spatialId: existingPrimaryArtifactSpatialId,
    entityType: 'artifact',
    entityId: 'artifact-brief',
  })
  const existingArtifactSlot = await createSlot({
    projectId,
    scopeId: rootScopeId,
    workspaceId: String(primaryWorkspace.id),
    x: 1_100,
    y: 400,
  })
  const existingArtifactSlotSpatialId = 'node-native-result-existing-artifact-slot'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(primaryWorkspace.canvasId),
    spatialKind: 'node',
    spatialId: existingArtifactSlotSpatialId,
    entityType: 'result-slot',
    entityId: String(existingArtifactSlot.id),
  })
  await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-brief',
    workspaceId: String(primaryWorkspace.id),
    slot: existingArtifactSlot,
    runId: 'run-native-result-existing-artifact-receipt',
    body: '# Existing primary carrier remains Current-following\n',
  })
  const existingArtifactReceipt = await promoteSlot(
    projectId,
    existingArtifactSlot,
    String(primaryWorkspace.canvasId),
    existingArtifactSlotSpatialId,
  )
  assert.equal(existingArtifactReceipt.status, 'existing-artifact')
  assert.equal(existingArtifactReceipt.binding.spatialId, existingPrimaryArtifactSpatialId)
  assert.equal(resolve({ canvasId: String(primaryWorkspace.canvasId), spatialId: existingPrimaryArtifactSpatialId }), undefined,
    'an existing Primary Artifact carrier must not borrow the additional view from an existing-artifact slot receipt')
  const retainedSlotBinding = repository.findProjectionBinding(
    projectId, String(primaryWorkspace.canvasId), 'node', 'result-slot', String(existingArtifactSlot.id),
  )
  assert.equal(retainedSlotBinding?.spatialId, existingArtifactSlotSpatialId)
  report.cases.push('existing-artifact receipt keeps the same-canvas Primary Artifact carrier on its original Current-following lifecycle')

  const unselectedArtifact = repository.getArtifact('artifact-brief')
  assert.ok(unselectedArtifact?.currentRevisionId)
  const unselectedPrimaryView = {
    id: 'view-native-result-unselected-primary',
    artifactId: 'artifact-brief',
    scopeId: uniqueMainScopeId,
    revisionId: String(unselectedArtifact.currentRevisionId),
    referenceKind: 'primary',
    position: { x: 80, y: 800 },
    size: { width: 248, height: 180 },
    displayMode: 'card',
    collapsed: false,
  }
  repository.upsertArtifactView(unselectedPrimaryView)
  const unselectedPrimarySpatialId = 'node-native-result-unselected-primary-carrier'
  repository.upsertProjectionBinding({
    projectId,
    canvasId: String(workspaceMainUnique.canvasId),
    spatialKind: 'node',
    spatialId: unselectedPrimarySpatialId,
    entityType: 'artifact',
    entityId: 'artifact-brief',
  })
  const unselectedSlot = await createSlot({
    projectId,
    scopeId: uniqueMainScopeId,
    workspaceId: String(workspaceMainUnique.id),
    x: 1_250,
    y: 800,
  })
  const unselectedAccepted = await seedAndAccept({
    projectId,
    projectRoot,
    artifactId: 'artifact-brief',
    workspaceId: String(workspaceMainUnique.id),
    slot: unselectedSlot,
    runId: 'run-native-result-unselected-primary',
    body: '# Accepted slot with neither view focused\n',
  })
  const unselectedMaterializedSlot = repository.getResultSlot(String(unselectedSlot.id))
  assert.equal(unselectedMaterializedSlot.status, 'materialized')
  const unselectedAcceptedView = repository.getArtifactView(String(unselectedMaterializedSlot.artifactViewId))
  assert.equal(unselectedAcceptedView.referenceKind, 'explicit_additional')
  assert.equal(unselectedAcceptedView.revisionId, unselectedAccepted.draft.id)
  const unfocusedArtifactViews = repository.getArtifactViews('artifact-brief')
    .filter((view) => String(view.scopeId) === uniqueMainScopeId)
  assert.ok(unfocusedArtifactViews.some((view) => String(view.id) === String(unselectedPrimaryView.id)))
  assert.ok(unfocusedArtifactViews.some((view) => String(view.id) === String(unselectedAcceptedView.id)))
  const noArtifactViewIsFocused = repository.getWorkspace(String(workspaceMainUnique.id)).focusedViewIds
    .every((viewId) => !unfocusedArtifactViews.some((view) => String(view.id) === String(viewId)))
  assert.equal(noArtifactViewIsFocused, true)
  expectMaterialConflict(() => resolve({
    canvasId: String(workspaceMainUnique.canvasId),
    spatialId: unselectedPrimarySpatialId,
  }))
  report.cases.push('same-scope Primary with neither the Primary nor accepted slot view focused raises 409 instead of guessing Current')

  repository.upsertWorkspace({
    ...repository.getWorkspace(String(workspaceMainUnique.id)),
    focusedViewIds: [String(unselectedPrimaryView.id)],
  })
  assert.equal(resolve({
    canvasId: String(workspaceMainUnique.canvasId),
    spatialId: unselectedPrimarySpatialId,
  }), undefined, 'Current-following primary is available only after Core explicitly focuses that exact Primary')
  report.cases.push('the same Core Primary carrier defers to Current only when its exact Primary view is selected')

  assert.equal(report.network.blockedRequests.length, 0,
    'No request to any non-Core, non-pinned endpoint is permitted.')
  assert.ok(report.network.allowedCoreRequests.length > 0, 'Real Core HTTP requests must exercise the test surface.')
  assert.ok(report.network.pinnedOllamaAttempts.length > 0,
    'The real Core semantic-index producer must reach the deliberately blocked Ollama boundary.')
  assert.equal(report.semanticIndexes.length, report.network.pinnedOllamaAttempts.length,
    'Each accepted revision must have completed its real FTS readback and pinned embedding attempt before teardown.')
  assert.ok(report.network.pinnedOllamaAttempts.every((attempt) =>
    attempt.origin === 'http://127.0.0.1:1' && attempt.path === '/api/embed'),
  'Only the pinned dead local Ollama embedding path is allowed to be attempted.')

  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? error.stack : String(error)
  throw error
} finally {
  await coreServer?.close()
  repository?.close()
  if (fetchInstalled) globalThis.fetch = originalFetch
  const runtimeRootResolved = path.resolve(runtimeRoot)
  const runtimeBaseResolved = path.resolve(runtimeBase)
  if (path.dirname(runtimeRootResolved) !== runtimeBaseResolved
    || !path.basename(runtimeRootResolved).startsWith('native-result-material-')) {
    throw new Error('Disposable cleanup target escaped the intended .runtime directory; preserved.')
  }
  report.cleanupTargetContainedInRuntime = true
  await rm(runtimeRootResolved, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
