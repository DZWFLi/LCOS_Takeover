import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
const reportDir = path.join(runtimeParent, 'current-gen2-capture-protocol')
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const captureRoot = path.join(runtimeRoot, 'capture')
const publicOrigin = 'http://127.0.0.1:19876'

// Clear integration endpoints/tokens by name only; do not inspect inherited values.
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
  'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY',
  'BEDROCK_BASE_URL', 'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = captureRoot
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Any accidental local embedding request is rejected before it reaches the network.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  mode: 'adopted current Gen2 CaptureStagingService → facade.handle → real temporary Core HTTP producer',
  fixtureKind: 'disposable fullIntegration SQLite project + original Capture staging/materialize producers',
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  directCorePUTUsed: false,
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
let coreOrigin
let facade
let repository
let owners
let staging
let projectId
let rootScopeId
let coreOrigins = new Set()
let coreBootstrapInProgress = false

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
  assert.equal(active.size, 0, 'No pre-existing listening loopback Server may exist in this test process')
  coreBootstrapInProgress = true
}

function registerCoreOrigin(origin) {
  const active = activeListeningLoopbackOrigins()
  assert.ok(active.has(origin), 'facade must return the origin of a live Core listener in this process')
  assert.equal(active.size, 1, 'only the isolated Core listener may be active')
  assert.equal(blockedPorts.has(new URL(origin).port), false, 'the Core listener must not use a reserved user-service port')
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
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaRejected.push({ method, path: url.pathname })
      throw new Error('The capture protocol test rejects the pinned dead Ollama endpoint without networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      const requestBody = url.pathname === '/runtime/capture-space/materialize' && typeof init?.body === 'string'
        ? JSON.parse(init.body) : undefined
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status,
        ...(requestBody === undefined ? {} : { requestBody }) })
      return response
    }
    report.network.blocked.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('The capture protocol test permits only this process\'s active temporary Core listener.')
  }
}

async function callFacade(method, pathname, body) {
  report.facadeRequests.push({ method, path: pathname })
  const result = await facade.handle({ method, pathname, url: publicOrigin + pathname, ...(body === undefined ? {} : { body }) })
  assert.ok(result != null, `${method} ${pathname} must be handled by the facade`)
  return result
}

function assertStatus(result, status, code, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`)
  if (code) assert.equal(result.body?.error?.code, code, `${label}: exact route error code`)
  return result.body
}

function targetGraphCounts() {
  const graph = repository.get(projectId)
  assert.ok(graph, 'isolated project graph must remain readable')
  return Object.fromEntries(['artifacts', 'artifactViews', 'artifactRevisions', 'fileRecords']
    .map((key) => [key, Array.isArray(graph[key]) ? graph[key].length : 0]))
}

function targetImportBatchCount() {
  return repository.listImportBatches(projectId).length
}

async function enqueueText(operationId, body) {
  return staging.enqueue({
    operationId,
    kind: 'clipboard_text',
    payloadBytes: new TextEncoder().encode(body),
    source: { title: operationId },
    suggestedProjects: [],
  })
}

function materializeCall(body) {
  return callFacade('POST', '/api/lcos/core/runtime/capture-space/materialize', body)
}

function idsAndMaterial(resultBody) {
  assert.equal(resultBody?.ok, true)
  assert.ok(resultBody.value && Array.isArray(resultBody.value.items))
  return resultBody.value
}

test('guarded Capture materialization forwards only contained blobs and preserves producer ordering/idempotency', async () => {
  try {
    const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
    const ownersEntry = path.join(runtimeRoot, 'current-gen2-capture-owners.mjs')
    const routerEntry = path.join(runtimeRoot, 'core-protocol-router.mjs')
    await Promise.all([
      buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeEntry),
      buildPilotEntry('lab/pilot/current-gen2-capture-owners.ts', ownersEntry),
      buildPilotEntry('lab/pilot/core-protocol-router.ts', routerEntry),
    ])
    const [facadeModule, ownerModule, routerModule] = await Promise.all([
      import(pathToFileURL(facadeEntry).href),
      import(pathToFileURL(ownersEntry).href),
      import(pathToFileURL(routerEntry).href),
    ])
    assert.equal(typeof facadeModule.startSurfaceCoreFacade, 'function')
    assert.equal(typeof ownerModule.CaptureStagingService, 'function')
    assert.equal(typeof ownerModule.createTextArtifact, 'function')
    owners = ownerModule
    const ownersManifest = JSON.parse(await readFile(`${ownersEntry}.sources.json`, 'utf8'))
    assert.equal(ownersManifest.currentRoot, currentGen2Root)
    const adopted = new Set((ownersManifest.resources ?? []).map((item) => item.resourcePath))
    for (const resourcePath of [
      'apps/local-core/src/metadata-repository.ts',
      'apps/local-core/src/text-artifact-service.ts',
      'apps/local-core/src/capture-space-service.ts',
      'apps/local-core/src/capture-title.ts',
      'apps/local-core/src/import-copy-service.ts',
      'apps/local-core/src/resources/universal-resource-import-service.ts',
    ]) assert.ok(adopted.has(resourcePath), `test producer bundle must use selected current owner ${resourcePath}`)
    report.adoptedCurrentSources = [...adopted].sort()

    installFetchBoundary()
    beginCoreBootstrap()
    facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
    repository = facade.core.repository
    projectId = String(facade.core.projectId)
    registerCoreOrigin(String(facade.core.origin))
    assert.ok(isWithin(runtimeRoot, repository.getProject(projectId)?.rootPath ?? ''), 'Core project root must be test-owned')
    const rootScope = repository.getScopes(projectId).find((scope) => scope.kind === 'root')
    assert.ok(rootScope)
    rootScopeId = String(rootScope.id)
    staging = new ownerModule.CaptureStagingService(repository, captureRoot)

    // Route preconditions: wrong/missing project, malformed IDs, and missing scope callback never fetch Core.
    const requestsBeforeValidation = report.network.allowedCoreRequests.length
    assertStatus(await materializeCall({ captureIds: ['missing-project'] }), 400, 'PROJECT_ID_MISMATCH', 'missing projectId')
    assertStatus(await materializeCall({ projectId: 'foreign-project', captureIds: ['missing-project'] }), 400, 'PROJECT_ID_MISMATCH', 'wrong projectId')
    assertStatus(await materializeCall({ projectId, captureIds: [] }), 400, 'INVALID_ARGUMENT', 'empty captureIds')
    assertStatus(await materializeCall({ projectId, captureIds: ['valid-id', 5] }), 400, 'INVALID_ARGUMENT', 'non-string captureId')
    const missingCallbackRouter = routerModule.createCoreProtocolRouter({ coreOrigin: String(facade.core.origin), projectId })
    const missingCallback = await missingCallbackRouter.handle({ method: 'POST',
      pathname: '/api/lcos/core/runtime/capture-space/materialize',
      url: 'http://127.0.0.1/api/lcos/core/runtime/capture-space/materialize',
      body: { projectId, captureIds: ['valid-id'] },
    })
    assertStatus(missingCallback, 503, 'CAPTURE_SCOPE_UNAVAILABLE', 'missing capture scope callback')
    assert.equal(report.network.allowedCoreRequests.length, requestsBeforeValidation,
      'all router precondition failures must stop before a Core HTTP request')
    report.cases.push('project, IDs, and required scope callback fail closed before forwarding')

    const beforeRejectedSources = targetGraphCounts()
    const rejectedCoreRequests = report.network.allowedCoreRequests.length

    const missingCapture = await enqueueText('capture-protocol-missing-item', 'never materialized')
    const missingStatus = assertStatus(await materializeCall({ projectId, captureIds: [`${missingCapture.id}-missing`] }),
      404, 'CAPTURE_SOURCE_NOT_IN_SCOPE', 'missing capture row')
    assert.ok(missingStatus.error)

    const foreignRoot = path.join(runtimeRoot, 'foreign-project')
    await mkdir(foreignRoot, { recursive: true })
    const foreignProjectId = 'capture-protocol-foreign-project'
    repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign project', rootPath: foreignRoot })
    const foreignScope = repository.getScopes(foreignProjectId).find((scope) => scope.kind === 'root')
    assert.ok(foreignScope)
    const foreignMaterial = await ownerModule.createTextArtifact(repository, foreignProjectId, {
      title: 'Foreign resolved fixture', body: 'foreign-only fixture', scopeId: String(foreignScope.id),
    })
    const foreignCapture = await enqueueText('capture-protocol-foreign-resolved', 'foreign source bytes')
    assert.equal(repository.resolveCaptureStagingItem(foreignCapture.id, foreignProjectId, new Date().toISOString(),
      foreignMaterial.artifactId, foreignMaterial.viewId), true, 'the original repository producer marks this fixture resolved to a real foreign artifact/view')
    assertStatus(await materializeCall({ projectId, captureIds: [foreignCapture.id] }),
      404, 'CAPTURE_SOURCE_NOT_IN_SCOPE', 'capture resolved to foreign project')

    const urlCapture = await staging.enqueue({
      operationId: 'capture-protocol-external-url', kind: 'web_page', payloadRef: 'https://example.invalid/not-fetched',
      source: { title: 'External URL must stay disabled' }, suggestedProjects: [],
    })
    assertStatus(await materializeCall({ projectId, captureIds: [urlCapture.id] }),
      404, 'CAPTURE_SOURCE_NOT_IN_SCOPE', 'external URL source')

    const outsideCaptureFile = path.join(runtimeRoot, 'outside-capture-source.txt')
    const outsideCaptureBytes = 'outside the configured blob root; do not read'
    await writeFile(outsideCaptureFile, outsideCaptureBytes, 'utf8')
    const pathCapture = await staging.enqueue({
      operationId: 'capture-protocol-outside-path', kind: 'file', payloadRef: outsideCaptureFile,
      source: { title: 'Path source must stay disabled' }, suggestedProjects: [],
    })
    assertStatus(await materializeCall({ projectId, captureIds: [pathCapture.id] }),
      404, 'CAPTURE_SOURCE_NOT_IN_SCOPE', 'filesystem path source')
    assert.equal(await readFile(outsideCaptureFile, 'utf8'), outsideCaptureBytes,
      'scope rejection must not consume or mutate the path outside captureRoot')
    assert.deepEqual(targetGraphCounts(), beforeRejectedSources, 'missing/foreign/URL/path sources must not grow the destination project graph')
    assert.equal(report.network.allowedCoreRequests.length, rejectedCoreRequests,
      'scope rejection must occur before any Core fetch, not just before materialization')
    assert.ok(!report.network.allowedCoreRequests.some((request) => request.path.includes('example.invalid')))
    report.cases.push('missing, foreign-resolved, external URL, and outside-root path sources are rejected without target graph or Core request changes')

    const bodyA = 'capture A — exact UTF-8\n尾部空格  '
    const bodyB = 'capture B — exact bytes\n雪与é'
    const a = await enqueueText('capture-protocol-A', bodyA)
    const b = await enqueueText('capture-protocol-B', bodyB)
    assert.ok(a.payloadRef.startsWith('blob:') && b.payloadRef.startsWith('blob:'))
    assert.ok(isWithin(captureRoot, path.join(captureRoot, a.payloadRef.slice('blob:'.length))))
    const beforeValid = targetGraphCounts()
    const batchesBeforeValid = targetImportBatchCount()
    const inputIds = [b.id, a.id, b.id]
    const firstRequest = { projectId, captureIds: inputIds }
    const createdResponse = await materializeCall(firstRequest)
    assertStatus(createdResponse, 201, undefined, 'valid current-project capture materialization')
    const created = idsAndMaterial(createdResponse.body)
    report.firstMaterializeReceipt = structuredClone(created)
    assert.equal(created.projectId, projectId)
    assert.equal(created.imported, 2, 'duplicate Capture IDs are produced once by the current owner')
    assert.deepEqual(created.items.map((item) => item.captureId), inputIds, 'the Core producer preserves caller order, including duplicates')
    assert.deepEqual(created.items.map((item) => item.artifactId), [created.items[0].artifactId, created.items[1].artifactId, created.items[0].artifactId])
    assert.deepEqual(created.items.map((item) => item.viewId), [created.items[0].viewId, created.items[1].viewId, created.items[0].viewId])
    assert.deepEqual(created.items.map((item) => item.revisionId), [created.items[0].revisionId, created.items[1].revisionId, created.items[0].revisionId])
    assert.deepEqual(created.items[2], created.items[0],
      'the current Core DTO reports the same exact item for a duplicate ID in the same input; do not infer an extra reused flag')
    assert.deepEqual(targetGraphCounts(), Object.fromEntries(Object.entries(beforeValid).map(([key, value]) => [key, value + 2])),
      'the two distinct Capture IDs create exactly two Artifacts/Views/Revisions/FileRecords')
    const batchesAfterFirst = targetImportBatchCount()
    assert.equal(batchesAfterFirst, batchesBeforeValid + 1, 'the original Capture producer records one batch for this materialization call')

    for (const [index, expectedBody] of [[0, bodyB], [1, bodyA]]) {
      const item = created.items[index]
      const artifact = repository.getArtifact(item.artifactId)
      const view = repository.getArtifactView(item.viewId)
      const revision = repository.getArtifactRevision(item.revisionId)
      assert.ok(artifact && view && revision, 'the HTTP receipt IDs must resolve to original Core graph records')
      assert.equal(String(artifact.projectId), projectId)
      assert.equal(String(artifact.currentRevisionId), item.revisionId)
      assert.equal(String(view.artifactId), item.artifactId)
      assert.equal(String(view.scopeId), rootScopeId)
      assert.equal(String(view.referenceKind), 'primary')
      assert.equal(String(revision.artifactId), item.artifactId)
      assert.equal(String(revision.id), item.revisionId)
      assert.equal(String(view.revisionId), item.revisionId)
      const fileRecord = repository.getFileRecord(String(revision.fileRecordId))
      assert.ok(fileRecord && String(fileRecord.projectId) === projectId)
      assert.ok(isWithin(repository.getProject(projectId).rootPath, fileRecord.observedPath), 'FileRecord bytes must stay under the isolated project root')
      assert.deepEqual(await readFile(fileRecord.observedPath), Buffer.from(expectedBody, 'utf8'), 'FileRecord bytes must exactly match original Capture bytes')
      const stagingRow = repository.getCaptureStagingItem(item.captureId)
      assert.equal(stagingRow?.resolvedProjectId, projectId)
      assert.equal(stagingRow?.resolvedArtifactId, item.artifactId)
      assert.equal(stagingRow?.resolvedViewId, item.viewId)
    }
    report.cases.push('actual Core HTTP receipt resolves to exact same-project Artifact/View/Revision/FileRecord bytes; duplicate input preserves order without duplicating material')

    const afterFirst = targetGraphCounts()
    const repeatedResponse = await materializeCall(firstRequest)
    assertStatus(repeatedResponse, 201, undefined, 'idempotent repeated materialization')
    const repeated = idsAndMaterial(repeatedResponse.body)
    assert.equal(repeated.imported, 0)
    assert.deepEqual(repeated.items.map((item) => item.captureId), inputIds)
    assert.deepEqual(repeated.items.map((item) => item.artifactId), created.items.map((item) => item.artifactId))
    assert.deepEqual(repeated.items.map((item) => item.viewId), created.items.map((item) => item.viewId))
    assert.deepEqual(repeated.items.map((item) => item.revisionId), created.items.map((item) => item.revisionId))
    assert.ok(repeated.items.every((item) => item.reused === true))
    assert.deepEqual(targetGraphCounts(), afterFirst, 'repeated request must not grow the Core graph')
    assert.equal(targetImportBatchCount(), batchesAfterFirst, 'repeated request must not create another import batch')
    report.cases.push('repeating the identical ordered request returns reused receipts and leaves graph counts unchanged')

    const materializeRequests = report.network.allowedCoreRequests.filter((request) =>
      request.path === '/runtime/capture-space/materialize' && request.method === 'POST')
    assert.equal(materializeRequests.length, 2, 'only valid create and idempotent retry reach the real Core materialize route')
    assert.ok(materializeRequests.every((request) => request.status === 201))
    assert.deepEqual(materializeRequests.map((request) => request.requestBody), [firstRequest, firstRequest],
      'Core receives the original project/captureIds DTO byte shape semantically unchanged, including duplicate/order')
    assert.ok(report.network.allowedCoreRequests.every((request) => request.origin === coreOrigin),
      'all allowed network requests must target the exact returned temporary Core origin')
    assert.deepEqual(report.network.blocked, [], 'no non-Core network request may be attempted')
    report.summary = { projectId, rootScopeId, coreOrigin, createdCaptureIds: inputIds,
      artifactIds: created.items.map((item) => item.artifactId), viewIds: created.items.map((item) => item.viewId),
      revisionIds: created.items.map((item) => item.revisionId), graphCountsAfterCreate: afterFirst,
      graphCountsAfterRepeat: targetGraphCounts(), importBatchCountAfterCreate: batchesAfterFirst,
      importBatchCountAfterRepeat: targetImportBatchCount(), materializeHttpRequests: materializeRequests.length }
  } catch (error) {
    report.failure = { name: error?.name, message: error?.message, stack: error?.stack }
    throw error
  }
})

after(async () => {
  try {
    if (facade) {
      await facade.close()
      report.cleanup.facadeClosed = true
    }
  } catch (error) {
    report.cleanup.closeError = error instanceof Error ? error.message : String(error)
  } finally {
    if (fetchInstalled) globalThis.fetch = originalFetch
  }
  const remaining = activeListeningLoopbackOrigins()
  report.cleanup.listenerReleased = remaining.size === 0
  report.cleanup.remainingLoopbackOrigins = [...remaining]
  try {
    assertContained(runtimeParent, runtimeRoot, 'case-')
    report.cleanup.targetContained = true
    await rm(runtimeRoot, { recursive: true, force: true })
    report.cleanup.runtimeRemoved = true
  } catch (error) {
    report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
})
