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
const reportDir = path.join(runtimeParent, 'current-gen2-assembly-reference')
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const captureRoot = path.join(runtimeRoot, 'capture')
const publicOrigin = 'http://127.0.0.1:19875'

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
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  mode: 'adopted prepare/takeAssemblyReferences + original stores/clients + disposable real Core HTTP',
  fixtureKind: 'fullIntegration temporary Core SQLite/Huabu fixture; original Capture, resource, revision producers',
  originalUserDatabaseOpened: false,
  liveServicesAccessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  runtimeRoot,
  reportPath,
  network: { allowedCoreRequests: [], pinnedOllamaRejected: [], blocked: [], bootstrapBaselines: [], activeCoreOrigins: [] },
  cases: [],
  failure: undefined,
  cleanup: { targetContained: false, storesReset: false, facadeClosed: false, listenerReleased: false, runtimeRemoved: false },
}

const reservedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let coreOrigin
let facade
let repository
let owners
let projectId
let rootScopeId
let staging
let resourceImporter
let http
let session
let resourceClient
let useLcosReferenceStore
let useLcosShellStore
let composerInputKey
let referencePickOwnerKey
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
  assert.equal(active.size, 0, 'No pre-existing loopback listener may be present in this test process')
  coreBootstrapInProgress = true
}

function registerCoreOrigin(origin) {
  const active = activeListeningLoopbackOrigins()
  assert.ok(active.has(origin), 'Core origin must match a live listener in this process')
  assert.equal(active.size, 1, 'only one isolated Core listener may be active')
  assert.equal(reservedPorts.has(new URL(origin).port), false, 'Core must not attach to a reserved user-service port')
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
      throw new Error('Assembly reference test rejects the pinned dead Ollama endpoint without networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !reservedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      const methodAndPath = { method, origin: url.origin, path: url.pathname, status: response.status }
      if (url.pathname === '/runtime/capture-space/materialize' && typeof init?.body === 'string') {
        const body = JSON.parse(init.body)
        methodAndPath.captureIds = body.captureIds
        methodAndPath.projectId = body.projectId
      }
      report.network.allowedCoreRequests.push(methodAndPath)
      return response
    }
    report.network.blocked.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only the exact active temporary Core listener is allowed by this test.')
  }
}

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function resetStores(target, prompt = '原问题保持不变') {
  useLcosReferenceStore.getState().reset()
  useLcosReferenceStore.getState().setProject(projectId)
  useLcosShellStore.setState({ projectId, composerTarget: target, composerPrompt: prompt, composerOpen: true })
}

function operationRows() {
  return [...useLcosReferenceStore.getState().referenceInputOperations.values()]
}

function refIdentity(ref) {
  return [ref.entityType, ref.entityId, ref.revisionId ?? null, ref.artifactViewId ?? null]
}

function captureMaterializeCount() {
  return report.network.allowedCoreRequests.filter((request) =>
    request.method === 'POST' && request.path === '/runtime/capture-space/materialize').length
}

test('current adopted Assembly reference helper preserves source versions and original input ownership across take/cancel/send', async () => {
  try {
    const ownersEntry = path.join(runtimeRoot, 'assembly-reference-owners.mjs')
    const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
    await Promise.all([
      buildPilotEntry('lab/pilot/current-gen2-assembly-reference-test-owners.ts', ownersEntry),
      buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeEntry),
    ])
    const [ownerModule, facadeModule] = await Promise.all([
      import(pathToFileURL(ownersEntry).href),
      import(pathToFileURL(facadeEntry).href),
    ])
    for (const name of ['prepareAssemblyReferences', 'takeAssemblyReferences', 'CoreProjectClient', 'CoreResourceClient', 'HttpClient']) {
      assert.equal(typeof ownerModule[name], 'function', `single test bundle must export original ${name}`)
    }
    for (const name of ['useLcosReferenceStore', 'useLcosShellStore', 'composerInputKey', 'referencePickOwnerKey']) {
      assert.ok(ownerModule[name], `single test bundle must export original ${name}`)
    }
    owners = ownerModule
    useLcosReferenceStore = ownerModule.useLcosReferenceStore
    useLcosShellStore = ownerModule.useLcosShellStore
    composerInputKey = ownerModule.composerInputKey
    referencePickOwnerKey = ownerModule.referencePickOwnerKey

    const sourceManifest = JSON.parse(await readFile(`${ownersEntry}.sources.json`, 'utf8'))
    assert.equal(sourceManifest.currentRoot, currentGen2Root)
    const selectedSources = new Set((sourceManifest.resources ?? []).map((item) => item.resourcePath))
    assert.ok(selectedSources.has('huabu/apps/web/src/lcos/professional/prepareAssemblyReferences.ts'),
      'the runtime bundle must contain the explicitly selected current Gen2 helper, not only copied code')
    report.adoptedSources = [...selectedSources].sort()

    installFetchBoundary()
    beginCoreBootstrap()
    facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
    repository = facade.core.repository
    projectId = String(facade.core.projectId)
    registerCoreOrigin(String(facade.core.origin))
    assert.ok(isWithin(runtimeRoot, repository.getProject(projectId)?.rootPath ?? ''), 'all Core project writes must stay inside this test runtime')

    http = new ownerModule.HttpClient({ baseUrl: coreOrigin })
    session = { http, projects: new ownerModule.CoreProjectClient(http) }
    resourceClient = new ownerModule.CoreResourceClient(http)
    staging = new ownerModule.CaptureStagingService(repository, captureRoot)
    resourceImporter = new ownerModule.UniversalResourceImportService(repository, new ownerModule.ImportCopyService(repository))
    const rootScope = repository.getScopes(projectId).find((scope) => scope.kind === 'root')
    assert.ok(rootScope)
    rootScopeId = String(rootScope.id)

    let resourceSequence = 0
    async function importResource(title, body) {
      resourceSequence += 1
      return resourceImporter.importFile(projectId, {
        importRequestId: `assembly-reference-resource-${resourceSequence}`,
        fileName: `assembly-reference-${resourceSequence}.json`,
        bytes: Buffer.from(JSON.stringify({ title, body }), 'utf8'),
        contentType: 'application/json',
        scopeId: rootScopeId,
        position: { x: 24 * resourceSequence, y: 32 },
      })
    }

    const resourceA = await importResource('Reference A', 'exact resource A')
    const resourceB = await importResource('Reference B', 'exact resource B')
    const [descriptorA, descriptorB] = await Promise.all([
      resourceClient.descriptor(projectId, String(resourceA.resourceId)),
      resourceClient.descriptor(projectId, String(resourceB.resourceId)),
    ])
    assert.equal(String(descriptorA.resourceId), String(resourceA.resourceId))
    assert.equal(String(descriptorB.resourceId), String(resourceB.resourceId))
    assert.equal(String(descriptorA.artifactId), String(resourceA.artifactId))
    assert.equal(String(descriptorB.artifactId), String(resourceB.artifactId))

    const captureA = await staging.enqueue({ operationId: 'assembly-reference-capture-A', kind: 'clipboard_text',
      payloadBytes: new TextEncoder().encode('Capture A exact UTF-8\n雪与é  '), source: { title: 'Capture A' }, suggestedProjects: [] })
    const captureB = await staging.enqueue({ operationId: 'assembly-reference-capture-B', kind: 'clipboard_text',
      payloadBytes: new TextEncoder().encode('Capture B exact UTF-8\n尾'), source: { title: 'Capture B' }, suggestedProjects: [] })
    const sources = [
      { kind: 'resource', id: String(resourceB.resourceId) },
      { kind: 'capture', id: captureA.id },
      { kind: 'resource', id: String(resourceA.resourceId) },
      { kind: 'capture', id: captureB.id },
    ]
    const readResource = (id, signal) => resourceClient.descriptor(projectId, id, signal)
    const prepared = await ownerModule.prepareAssemblyReferences(session, projectId, sources, readResource)
    assert.equal(prepared.length, sources.length)
    assert.deepEqual(prepared.map((ref) => ref.entityId), [
      String(resourceB.artifactId), String(repository.getCaptureStagingItem(captureA.id)?.resolvedArtifactId),
      String(resourceA.artifactId), String(repository.getCaptureStagingItem(captureB.id)?.resolvedArtifactId),
    ], 'the exact mixed source order is preserved')
    assert.equal(prepared[0].revisionId, String(descriptorB.sourceRevisionId))
    assert.equal(prepared[2].revisionId, String(descriptorA.sourceRevisionId))
    const captureARef = prepared[1]
    const captureBRef = prepared[3]
    assert.ok(captureARef.artifactViewId && captureARef.revisionId)
    assert.ok(captureBRef.artifactViewId && captureBRef.revisionId)
    assert.equal(repository.getArtifactView(captureARef.artifactViewId)?.revisionId, captureARef.revisionId)
    assert.equal(repository.getArtifactView(captureBRef.artifactViewId)?.revisionId, captureBRef.revisionId)
    report.cases.push('original prepare helper reads Core resource descriptors and Capture receipts, preserving mixed caller order and exact Artifact/View/Revision identities')

    const firstGraph = await session.projects.getProjectGraph(projectId)
    assert.ok(firstGraph && String(firstGraph.project.id) === projectId)
    const captureARevision = firstGraph.artifactRevisions.find((row) => String(row.id) === captureARef.revisionId)
    const captureAFile = captureARevision && firstGraph.fileRecords.find((row) => String(row.id) === String(captureARevision.fileRecordId))
    assert.ok(captureAFile && isWithin(repository.getProject(projectId).rootPath, captureAFile.observedPath))
    assert.deepEqual(await readFile(captureAFile.observedPath), Buffer.from('Capture A exact UTF-8\n雪与é  ', 'utf8'))
    const beforeEditCounts = repository.get(projectId)
    const revised = await ownerModule.reviseManagedTextArtifact(repository, projectId, { artifactId: captureARef.entityId },
      'NEW CURRENT must not replace the pinned Capture revision', { expectedRevisionId: captureARef.revisionId })
    assert.notEqual(revised.revisionId, captureARef.revisionId)
    assert.equal(repository.getArtifactView(captureARef.artifactViewId)?.revisionId, revised.revisionId,
      'the live View follows the revised Current while the prior revision remains addressable')
    const afterEditCounts = repository.get(projectId)
    assert.equal(afterEditCounts.artifacts.length, beforeEditCounts.artifacts.length)
    assert.equal(afterEditCounts.artifactViews.length, beforeEditCounts.artifactViews.length)
    assert.equal(afterEditCounts.artifactRevisions.length, beforeEditCounts.artifactRevisions.length + 1)

    const retried = await ownerModule.prepareAssemblyReferences(session, projectId, sources, readResource)
    assert.deepEqual(retried.map(refIdentity), prepared.map(refIdentity),
      'retry must retain original capture receipts and exact source revisions; it must not follow the View to new Current')
    assert.notEqual(retried[1].revisionId, revised.revisionId)
    assert.equal(repository.getArtifactRevision(retried[1].revisionId)?.artifactId, captureARef.entityId)
    report.revisionEvidence = { captureArtifactId: captureARef.entityId, pinnedRevisionId: captureARef.revisionId,
      currentRevisionAfterEdit: revised.revisionId, viewRevisionAfterEdit: String(repository.getArtifactView(captureARef.artifactViewId)?.revisionId),
      retryRevisionId: retried[1].revisionId, originalBodyBytesVerified: true }
    report.cases.push('after an original Core revision edit changes View→Current, Capture retry still returns the original receipt revision and bytes')

    const target = {
      nodeId: 'conversation:original-input', title: '原输入', intent: 'continue', receiverConversationId: 'conversation:receiver-original',
      continuationOperationId: 'continuation-operation-original', messageId: 'message-original',
      anchor: { x: 12, y: 18, width: 280, height: 120 },
    }
    const inputKey = composerInputKey(target)
    const owner = referencePickOwnerKey(projectId, target)
    assert.ok(inputKey && owner)
    resetStores(target)
    const originalTargetObject = useLcosShellStore.getState().composerTarget
    const originalPrompt = useLcosShellStore.getState().composerPrompt
    const gate = deferred()
    const readsStarted = deferred()
    let readCount = 0
    const pendingTake = ownerModule.takeAssemblyReferences(session, projectId, inputKey, sources,
      async (id, signal) => {
        readCount += 1
        if (readCount === sources.filter((source) => source.kind === 'resource').length) readsStarted.resolve()
        await gate.promise
        return resourceClient.descriptor(projectId, id, signal)
      })
    await readsStarted.promise
    assert.deepEqual(operationRows(), [{ owner, kind: 'preparing' }], 'the original store tracks the in-flight input owner')
    assert.deepEqual(useLcosReferenceStore.getState().draft.orderedEntityRefs, [],
      'no prefix of the selected group enters the composer before every source is ready')
    assert.equal(useLcosShellStore.getState().composerTarget, originalTargetObject)
    assert.equal(useLcosShellStore.getState().composerPrompt, originalPrompt)
    const materializeDuringPrepare = captureMaterializeCount()
    gate.resolve()
    assert.equal(await pendingTake, sources.length)
    assert.equal(captureMaterializeCount(), materializeDuringPrepare + 1,
      'the real Capture client performed one materialize call while resource preparation was held pending')
    assert.deepEqual(useLcosReferenceStore.getState().draft.orderedEntityRefs.map(refIdentity), prepared.map(refIdentity),
      'the complete prepared group is appended exactly once in source order')
    assert.deepEqual(operationRows(), [], 'preparing is released after successful group commit')
    assert.equal(useLcosShellStore.getState().composerTarget, originalTargetObject)
    assert.equal(useLcosShellStore.getState().composerPrompt, originalPrompt)
    assert.equal(useLcosShellStore.getState().composerTarget?.receiverConversationId, target.receiverConversationId)
    assert.equal(useLcosShellStore.getState().composerTarget?.messageId, target.messageId)
    report.cases.push('take helper keeps the original input pending with an empty draft, then appends the full ordered group once without changing prompt/receiver/message')

    const cancellationChecks = [
      {
        name: 'message identity changes',
        cancel: () => useLcosShellStore.setState({ composerTarget: { ...target, messageId: 'message-next' } }),
      },
      {
        name: 'Composer closes and resumes',
        cancel: () => {
          useLcosShellStore.getState().closeComposer()
          assert.equal(useLcosShellStore.getState().resumeComposer(inputKey), true)
        },
      },
      {
        name: 'caller aborts',
        cancel: (controller) => controller.abort(),
      },
    ]
    const oneResourceSource = [{ kind: 'resource', id: String(resourceA.resourceId) }]
    for (const check of cancellationChecks) {
      resetStores(target)
      const cancelGate = deferred()
      const callbackEntered = deferred()
      const callbackSettled = deferred()
      const controller = new AbortController()
      const beforeDraft = useLcosReferenceStore.getState().draft.orderedEntityRefs
      const beforeMaterialize = captureMaterializeCount()
      const pending = ownerModule.takeAssemblyReferences(session, projectId, inputKey, oneResourceSource,
        async (id, signal) => {
          callbackEntered.resolve()
          await cancelGate.promise
          try {
            if (signal?.aborted) return descriptorA
            return await resourceClient.descriptor(projectId, id, signal)
          } finally { callbackSettled.resolve() }
        }, controller.signal)
      const rejection = assert.rejects(pending, /本次取用已取消/)
      await callbackEntered.promise
      assert.deepEqual(operationRows(), [{ owner, kind: 'preparing' }], `${check.name}: operation must be pending before cancellation`)
      assert.deepEqual(useLcosReferenceStore.getState().draft.orderedEntityRefs, [], `${check.name}: no references may be partially added`)
      check.cancel(controller)
      await rejection
      assert.deepEqual(operationRows(), [], `${check.name}: the original preparing operation must be released`)
      cancelGate.resolve()
      await callbackSettled.promise
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepEqual(useLcosReferenceStore.getState().draft.orderedEntityRefs, beforeDraft,
        `${check.name}: late completion must not write into this or a later draft`)
      assert.equal(captureMaterializeCount(), beforeMaterialize)
      assert.deepEqual(operationRows(), [])
      report.cases.push(`${check.name} cancels the original asynchronous preparation without late input mutation`)
    }

    resetStores(target)
    const queuedCapture = await staging.enqueue({ operationId: 'assembly-reference-sending-guard', kind: 'clipboard_text',
      payloadBytes: new TextEncoder().encode('must remain staged during send'), source: { title: 'sending guard' }, suggestedProjects: [] })
    const sendingToken = useLcosReferenceStore.getState().beginReferenceInputOperation(owner, 'sending')
    const beforeSendingMaterialize = captureMaterializeCount()
    const beforeSendingGraph = repository.get(projectId)
    await assert.rejects(ownerModule.takeAssemblyReferences(session, projectId, inputKey,
      [{ kind: 'capture', id: queuedCapture.id }], async () => { assert.fail('sending guard must reject before source preparation') }), /正在发送/)
    assert.equal(captureMaterializeCount(), beforeSendingMaterialize, 'sending state must stop before the Core Capture producer')
    assert.equal(repository.getCaptureStagingItem(queuedCapture.id)?.resolvedProjectId, undefined)
    const afterSendingGraph = repository.get(projectId)
    assert.equal(afterSendingGraph.artifacts.length, beforeSendingGraph.artifacts.length)
    assert.equal(afterSendingGraph.artifactViews.length, beforeSendingGraph.artifactViews.length)
    assert.equal(afterSendingGraph.artifactRevisions.length, beforeSendingGraph.artifactRevisions.length)
    assert.equal(afterSendingGraph.fileRecords.length, beforeSendingGraph.fileRecords.length)
    assert.deepEqual(useLcosReferenceStore.getState().draft.orderedEntityRefs, [])
    useLcosReferenceStore.getState().finishReferenceInputOperation(sendingToken)
    assert.deepEqual(operationRows(), [])
    report.cases.push('an existing sending operation rejects take before invoking Capture/Core and leaves staging plus Core graph untouched')

    assert.ok(report.network.pinnedOllamaRejected.every((request) => request.path === '/api/embed'))
    assert.deepEqual(report.network.blocked, [], 'all attempted network traffic must be the active isolated Core or the intentionally rejected Ollama pin')
    assert.ok(report.network.allowedCoreRequests.length > 0)
    assert.ok(report.network.allowedCoreRequests.every((request) => request.origin === coreOrigin))
    assert.ok(report.network.allowedCoreRequests.some((request) => request.path === `/projects/${encodeURIComponent(projectId)}/graph`))
    assert.ok(report.network.allowedCoreRequests.some((request) => request.path.includes('/resources/') && request.path.endsWith('/descriptor')))
    assert.ok(report.network.allowedCoreRequests.some((request) => request.path === '/runtime/capture-space/materialize'))
    report.summary = { projectId, rootScopeId, coreOrigin, originalInputKey: inputKey, originalReferenceOwner: owner,
      sourceOrder: sources, refsInOrder: prepared.map(refIdentity), cancellationCases: cancellationChecks.map((item) => item.name),
      sendingGuardMaterializeCountUnchanged: true, networkCoreRequestCount: report.network.allowedCoreRequests.length,
      pinnedOllamaRejectedCount: report.network.pinnedOllamaRejected.length }
  } catch (error) {
    report.failure = { name: error?.name, message: error?.message, stack: error?.stack }
    throw error
  }
})

after(async () => {
  try {
    if (useLcosReferenceStore) {
      useLcosReferenceStore.getState().reset()
      useLcosReferenceStore.setState({ projectId: null, referencePickOwner: null })
      report.cleanup.storesReset = true
    }
    if (useLcosShellStore) useLcosShellStore.setState({ projectId: null, composerTarget: null, composerPrompt: '', composerOpen: false })
  } catch (error) {
    report.cleanup.storeResetError = error instanceof Error ? error.message : String(error)
  }
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
  await mkdir(reportDir, { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
})
