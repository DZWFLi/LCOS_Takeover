import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-delegation-provider-'))

// Isolated real-Core test only. Clear inherited integration routing without
// reading values; all embeddings are pinned to a deliberately dead loopback.
for (const key of [
  'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
  'HUABU_AGENTLET_ID', 'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT',
  'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE',
  'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT',
  'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL', 'LCOS_OLLAMA_EMBED_MODEL',
  'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY', 'LCOS_PROJECTS_DIR',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const originalFetch = globalThis.fetch.bind(globalThis)
const activeCoreOrigins = new Set()
const allowedCoreRequests = []
const blockedRequests = []
const pinnedOllamaAttempts = []
let coreBootstrapInProgress = false
let facade

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
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      pinnedOllamaAttempts.push({ method, path: url.pathname })
      throw new Error('native delegation test blocks the pinned dead Ollama endpoint')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = activeCoreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname })
      return originalFetch(input, init)
    }
    blockedRequests.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('native delegation test blocked access outside its temporary Core')
  }
}

async function coreJson(coreOrigin, method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const envelope = await response.json()
  assert.equal(response.ok, true, `${method} ${pathname}: ${response.status} ${JSON.stringify(envelope)}`)
  assert.equal(envelope?.ok, true, `${method} ${pathname}: ${JSON.stringify(envelope)}`)
  return envelope.value
}

async function importSyntheticCodexSession(coreOrigin, projectId, workspace) {
  const bytes = Buffer.from(`${JSON.stringify({
    type: 'event_msg',
    timestamp: '2026-10-14T00:00:00.000Z',
    payload: { type: 'user_message', message: 'Synthetic Codex receiver session; no provider execution.' },
  })}\n`, 'utf8')
  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const base = `/projects/${encodeURIComponent(projectId)}/conversation-import-sessions`
  const upload = await coreJson(coreOrigin, 'POST', base, {
    sourceKind: 'codex',
    title: 'Synthetic Codex receiver session',
    sourceFileName: 'synthetic-codex-session.jsonl',
    expectedBytes: bytes.byteLength,
    workspaceId: String(workspace.id),
    scopeId: String(workspace.scopeId),
  })
  // Raw import bytes are sent only to the same temporary Core, with its existing
  // chunk digest header. The request helper above intentionally handles JSON only.
  const chunkResponse = await fetch(`${coreOrigin}${base}/${encodeURIComponent(upload.id)}/chunks/0`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-content-sha256': contentHash },
    body: bytes,
  })
  const chunkEnvelope = await chunkResponse.json()
  assert.equal(chunkResponse.ok, true, `Codex import chunk: ${chunkResponse.status} ${JSON.stringify(chunkEnvelope)}`)
  assert.equal(chunkEnvelope?.ok, true, JSON.stringify(chunkEnvelope))
  const completed = await coreJson(coreOrigin, 'POST', `${base}/${encodeURIComponent(upload.id)}/complete`, {
    expectedChunks: 1,
    expectedContentHash: contentHash,
  })
  assert.equal(completed.session.projectId, projectId)
  assert.equal(completed.session.provider, 'codex')
  return completed.session
}

function requireRun(repository, runId) {
  const run = repository.getRun(runId)
  const dispatch = repository.getRuntimeDispatch(runId)
  assert.ok(run, `Core must persist Run ${runId}`)
  assert.ok(dispatch, `Core must persist the paired Dispatch for ${runId}`)
  assert.equal(run.status, 'created')
  assert.equal(dispatch.status, 'planned')
  assert.equal(dispatch.attemptCount, 0, 'This test only creates a journal; it never dispatches')
  assert.equal(repository.getRuntimeBinding(runId), undefined, 'No provider binding may be created by delegation')
  return { run, dispatch }
}

try {
  installFetchBoundary()
  const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
  const testOwnersEntry = path.join(runtimeRoot, 'native-delegation-test-owners.mjs')
  await Promise.all([
    buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeEntry),
    buildPilotEntry('lab/pilot/native-delegation-test-owners.ts', testOwnersEntry),
  ])

  const [facadeModule, testOwners] = await Promise.all([
    import(pathToFileURL(facadeEntry).href),
    import(pathToFileURL(testOwnersEntry).href),
  ])
  assert.equal(typeof facadeModule.startSurfaceCoreFacade, 'function')
  assert.equal(typeof testOwners.NativeCoreCollaborationClient, 'function')
  assert.equal(typeof testOwners.HttpClient, 'function')

  const activeBeforeBootstrap = activeListeningLoopbackOrigins()
  assert.equal(activeBeforeBootstrap.size, 0, 'No existing loopback server may be attached by this test')
  coreBootstrapInProgress = true
  facade = await facadeModule.startSurfaceCoreFacade({
    runtimeRoot,
    publicOrigin: 'http://127.0.0.1:19991',
    fullIntegration: true,
  })
  const coreOrigin = String(facade.core.origin)
  const activeAfterBootstrap = activeListeningLoopbackOrigins()
  assert.equal(activeAfterBootstrap.size, 1, 'The test must own exactly one temporary listening Core')
  assert.ok(activeAfterBootstrap.has(coreOrigin), 'The Core origin must belong to this process')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'The test must not attach to a known live service port')
  activeCoreOrigins.add(coreOrigin)
  coreBootstrapInProgress = false

  const repository = facade.core.repository
  const projectId = String(facade.core.projectId)
  const workspace = facade.workspaces.find(row => row.preferredSurface === 'context') ?? facade.workspaces[0]
  assert.ok(workspace, 'The real facade must expose its synthetic project Workspace')
  const initialRunCount = repository.getProjectExecutionProjection(projectId).runs.length
  assert.equal(initialRunCount, 0, 'The disposable Core project must start without Runs')

  const codexSession = await importSyntheticCodexSession(coreOrigin, projectId, workspace)
  const codexConnected = await coreJson(coreOrigin, 'POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations`, {
    action: 'connect',
    provider: 'codex',
    executorId: 'synthetic-codex-executor',
    conversationRef: 'synthetic-external-codex-conversation',
    label: 'Synthetic Codex receiver',
  })
  const linkedIdentity = await coreJson(coreOrigin, 'POST',
    `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(codexConnected.id)}/link-session`,
    { conversationSessionId: codexSession.id })
  assert.equal(linkedIdentity.connectedConversation.id, codexConnected.id)
  assert.equal(linkedIdentity.conversationSession.id, codexSession.id)

  const workbuddyConnected = await coreJson(coreOrigin, 'POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations`, {
    action: 'connect',
    provider: 'workbuddy',
    executorId: 'synthetic-workbuddy-executor',
    conversationRef: 'synthetic-external-workbuddy-conversation',
    label: 'Synthetic WorkBuddy receiver',
  })

  const routingHttp = new testOwners.HttpClient({ baseUrl: coreOrigin })
  const collaboration = new testOwners.NativeCoreCollaborationClient(routingHttp)
  const baseInput = { instruction: 'Record a synthetic analysis task only.', outputIntent: 'analyze' }
  const runCount = () => repository.getProjectExecutionProjection(projectId).runs.length

  const codexAutoInput = {
    ...baseInput,
    requestedProvider: 'auto',
    receiverRef: { connectedConversationId: codexConnected.id },
  }
  const codexAutoInputBefore = structuredClone(codexAutoInput)
  const codexAuto = await collaboration.delegate(projectId, codexAutoInput)
  assert.equal(codexAuto.ok, true, JSON.stringify(codexAuto))
  assert.deepEqual(codexAutoInput, codexAutoInputBefore, 'The routing adapter must not mutate its caller-owned request')
  const codexAutoRunId = codexAuto.receipt.runId
  assert.ok(codexAutoRunId)
  const { run: codexAutoRun, dispatch: codexAutoDispatch } = requireRun(repository, codexAutoRunId)
  assert.equal(codexAutoRun.provider, 'codex')
  assert.equal(codexAutoRun.requestedProvider, 'codex')
  assert.equal(codexAutoDispatch.provider, 'codex')
  assert.equal(repository.getRunReceiverConversationId(codexAutoRunId), codexConnected.id)
  assert.equal(repository.getConnectedConversation(projectId, codexConnected.id)?.conversationSessionId, codexSession.id)

  const codexMissingChoice = await collaboration.delegate(projectId, {
    ...baseInput,
    receiverRef: { connectedConversationId: codexConnected.id },
  })
  assert.equal(codexMissingChoice.ok, true, JSON.stringify(codexMissingChoice))
  const codexMissingRunId = codexMissingChoice.receipt.runId
  assert.ok(codexMissingRunId)
  const { run: codexMissingRun, dispatch: codexMissingDispatch } = requireRun(repository, codexMissingRunId)
  assert.equal(codexMissingRun.provider, 'codex', 'An omitted executor choice follows the registered canonical receiver provider')
  assert.equal(codexMissingRun.requestedProvider, 'codex')
  assert.equal(codexMissingDispatch.provider, 'codex')
  assert.equal(repository.getRunReceiverConversationId(codexMissingRunId), codexConnected.id)
  assert.equal(repository.getConnectedConversation(projectId, codexConnected.id)?.conversationSessionId, codexSession.id)

  const codexExplicitSame = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'codex',
    receiverRef: { connectedConversationId: codexConnected.id },
  }, undefined, () => true)
  assert.equal(codexExplicitSame.ok, true, JSON.stringify(codexExplicitSame))
  const codexExplicitRunId = codexExplicitSame.receipt.runId
  assert.ok(codexExplicitRunId)
  assert.equal(requireRun(repository, codexExplicitRunId).run.requestedProvider, 'codex')

  // Hold the real Core provider metadata response after it has arrived. The
  // existing UI ownership predicate goes stale while this asynchronous
  // preflight is pending (for example, target changed or panel was closed).
  let markProviderReadReached
  let releaseProviderRead
  const providerReadReached = new Promise(resolve => { markProviderReadReached = resolve })
  const providerReadRelease = new Promise(resolve => { releaseProviderRead = resolve })
  const gatedHttp = new testOwners.HttpClient({
    baseUrl: coreOrigin,
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const response = await globalThis.fetch(input, init)
      if (url.origin === coreOrigin && url.pathname === '/runtime/providers') {
        markProviderReadReached()
        await providerReadRelease
      }
      return response
    },
  })
  const gatedClient = new testOwners.NativeCoreCollaborationClient(gatedHttp)
  let targetIsCurrent = true
  const runsBeforeStaleGate = runCount()
  const runPostsBeforeStaleGate = allowedCoreRequests.filter(request => request.method === 'POST'
    && request.path === `/projects/${encodeURIComponent(projectId)}/runs`).length
  const stalePending = gatedClient.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'auto',
    receiverRef: { connectedConversationId: codexConnected.id },
  }, undefined, () => targetIsCurrent)
  let providerGateTimeout
  try {
    await Promise.race([
      providerReadReached,
      new Promise((_, reject) => { providerGateTimeout = setTimeout(() => reject(new Error('Real Core provider read did not reach its test gate.')), 5_000) }),
    ])
    targetIsCurrent = false
  } finally {
    clearTimeout(providerGateTimeout)
    releaseProviderRead()
  }
  const staleGateResult = await stalePending
  assert.equal(staleGateResult.ok, false)
  assert.equal(staleGateResult.error.code, 'cancelled')
  assert.equal(runCount(), runsBeforeStaleGate, 'Stale receiver metadata preflight must not create a Run')
  assert.equal(allowedCoreRequests.filter(request => request.method === 'POST'
    && request.path === `/projects/${encodeURIComponent(projectId)}/runs`).length, runPostsBeforeStaleGate,
  'Stale receiver metadata preflight must stop before the canonical Core Run POST')

  const workbuddyAuto = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'auto',
    receiverRef: { connectedConversationId: workbuddyConnected.id },
  })
  assert.equal(workbuddyAuto.ok, true, JSON.stringify(workbuddyAuto))
  const workbuddyRunId = workbuddyAuto.receipt.runId
  assert.ok(workbuddyRunId)
  const { run: workbuddyRun, dispatch: workbuddyDispatch } = requireRun(repository, workbuddyRunId)
  assert.equal(workbuddyRun.provider, 'workbuddy')
  assert.equal(workbuddyRun.requestedProvider, 'workbuddy')
  assert.equal(workbuddyDispatch.provider, 'workbuddy')
  assert.equal(repository.getRunReceiverConversationId(workbuddyRunId), workbuddyConnected.id)

  const beforeRejectedCalls = runCount()
  const rejectedCrossProvider = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'workbuddy',
    receiverRef: { connectedConversationId: codexConnected.id },
  })
  assert.equal(rejectedCrossProvider.ok, false)
  assert.equal(rejectedCrossProvider.error.code, 'unavailable')
  assert.equal(runCount(), beforeRejectedCalls, 'Explicit cross-provider mismatch must not create a Run or Dispatch')

  const rejectedMissingReceiver = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'auto',
    receiverRef: { connectedConversationId: 'synthetic-missing-receiver' },
  })
  assert.equal(rejectedMissingReceiver.ok, false)
  assert.equal(rejectedMissingReceiver.error.code, 'unavailable')
  assert.equal(runCount(), beforeRejectedCalls, 'Unknown receiver must not fall back to WorkBuddy or create a Run')

  const abortedController = new AbortController()
  abortedController.abort()
  const abortedDelegate = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'auto',
    receiverRef: { connectedConversationId: codexConnected.id },
  }, abortedController.signal)
  assert.equal(abortedDelegate.ok, false)
  assert.equal(abortedDelegate.error.code, 'cancelled')
  assert.equal(runCount(), beforeRejectedCalls, 'An aborted mapping attempt must not create a Run')

  const standaloneDefault = await collaboration.delegate(projectId, baseInput)
  assert.equal(standaloneDefault.ok, true, JSON.stringify(standaloneDefault))
  const standaloneDefaultRunId = standaloneDefault.receipt.runId
  assert.ok(standaloneDefaultRunId)
  assert.equal(requireRun(repository, standaloneDefaultRunId).run.provider, 'workbuddy',
    'No-receiver requests retain the original Core default')

  const standaloneExplicitCodex = await collaboration.delegate(projectId, {
    ...baseInput,
    requestedProvider: 'codex',
  })
  assert.equal(standaloneExplicitCodex.ok, true, JSON.stringify(standaloneExplicitCodex))
  const standaloneExplicitRunId = standaloneExplicitCodex.receipt.runId
  assert.ok(standaloneExplicitRunId)
  assert.equal(requireRun(repository, standaloneExplicitRunId).run.provider, 'codex',
    'No-receiver explicit executor choice remains on the original Core path')

  assert.equal(blockedRequests.length, 0, JSON.stringify(blockedRequests))
  assert.ok(allowedCoreRequests.every(request => activeCoreOrigins.has(request.origin)))
  assert.equal(allowedCoreRequests.some(request => /\/runs\/[^/]+\/dispatch$/.test(request.path)), false,
    'No Run dispatch route may be called')
  assert.equal(allowedCoreRequests.some(request => request.path === '/runtime/providers'), true,
    'Receiver mapping must consult the actual Core provider capability response')
  for (const runId of [codexAutoRunId, codexMissingRunId, codexExplicitRunId, workbuddyRunId,
    standaloneDefaultRunId, standaloneExplicitRunId]) {
    requireRun(repository, runId)
  }

  const runPosts = allowedCoreRequests.filter(request => request.method === 'POST'
    && request.path === `/projects/${encodeURIComponent(projectId)}/runs`)
  assert.equal(runPosts.length, 6, 'Successful delegates must cross only the original Core Run create route')
  assert.equal(allowedCoreRequests.some(request => /\/delegate(?:\/|$)/.test(request.path)), false,
    'The adapter must not introduce a second delegate endpoint')

  // Synthetic transport only: future provider routing is not a claim that the
  // current Core type/transport already implements that provider. No DB write.
  const faultRequests = []
  let futureProviderRegistered = false
  const futureRunInputs = []
  const faultHttp = new testOwners.HttpClient({
    baseUrl: 'http://fault-injection.invalid',
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      faultRequests.push({ method, path: url.pathname })
      if (url.pathname.endsWith('/connected-conversations')) {
        return Response.json({ ok: true, value: [{
          schemaVersion: 1,
          id: 'synthetic-future-receiver',
          projectId: 'synthetic-fault-project',
          provider: 'future-provider',
          executorId: 'future-executor',
          conversationRef: 'future-session',
          label: 'Synthetic future provider (fault injection only)',
          isRunning: false,
          lastActiveAt: '2026-10-14T00:00:00.000Z',
        }] }, { status: 200 })
      }
      if (url.pathname === '/runtime/providers') {
        return Response.json({ ok: true, value: [
          { provider: 'codex', availability: 'offline' },
          { provider: 'workbuddy', availability: 'offline' },
          { provider: 'auto', availability: 'offline' },
          ...(futureProviderRegistered ? [{ provider: 'future-provider', availability: 'offline' }] : []),
        ] }, { status: 200 })
      }
      if (futureProviderRegistered && method === 'POST' && url.pathname === '/projects/synthetic-fault-project/runs') {
        futureRunInputs.push(JSON.parse(init.body))
        return Response.json({ ok: true, value: { review: { run: {
          id: 'synthetic-future-run-receipt', projectId: 'synthetic-fault-project',
        } } } }, { status: 201 })
      }
      return Response.json({ ok: false, error: { code: 'UNEXPECTED_FAULT_TEST_ROUTE', message: 'Unexpected route.' } }, { status: 500 })
    },
  })
  const faultClient = new testOwners.NativeCoreCollaborationClient(faultHttp)
  const unregisteredResult = await faultClient.delegate('synthetic-fault-project', {
    ...baseInput,
    receiverRef: { connectedConversationId: 'synthetic-future-receiver' },
  })
  assert.equal(unregisteredResult.ok, false)
  assert.equal(unregisteredResult.error.code, 'unavailable')
  assert.equal(faultRequests.some(request => request.method === 'POST'
    && request.path.endsWith('/runs')), false, 'Unregistered source provider must not attempt a Run POST')

  futureProviderRegistered = true
  const registeredFutureResult = await faultClient.delegate('synthetic-fault-project', {
    ...baseInput,
    receiverRef: { connectedConversationId: 'synthetic-future-receiver' },
  })
  assert.equal(registeredFutureResult.ok, true, JSON.stringify(registeredFutureResult))
  assert.equal(registeredFutureResult.receipt.runId, 'synthetic-future-run-receipt')
  assert.equal(futureRunInputs.length, 1, 'The thin adapter uses the original delegate POST exactly once')
  assert.equal(futureRunInputs[0].requestedProvider, 'future-provider',
    'Routing is driven by the existing capability response, not a Codex/WorkBuddy switch in this UI adapter')
  assert.deepEqual(futureRunInputs[0].receiverRef, { connectedConversationId: 'synthetic-future-receiver' })
  assert.equal(runCount(), 6, 'Synthetic future transport is not real-Core or real-provider execution evidence')

  const failedProviderRequests = []
  const failedProviderHttp = new testOwners.HttpClient({
    baseUrl: 'http://fault-injection-provider-read.invalid',
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      failedProviderRequests.push({ method, path: url.pathname })
      if (url.pathname.endsWith('/connected-conversations')) {
        return Response.json({ ok: true, value: [{
          schemaVersion: 1,
          id: 'synthetic-known-codex-receiver',
          projectId: 'synthetic-fault-project',
          provider: 'codex',
          executorId: 'codex-executor',
          conversationRef: 'codex-session',
          label: 'Synthetic Codex receiver (fault injection only)',
          isRunning: false,
          lastActiveAt: '2026-10-14T00:00:00.000Z',
        }] }, { status: 200 })
      }
      if (url.pathname === '/runtime/providers') {
        return Response.json({ ok: false, error: { code: 'UNAVAILABLE', message: 'Synthetic provider read failure.' } }, { status: 503 })
      }
      return Response.json({ ok: false, error: { code: 'UNEXPECTED_FAULT_TEST_ROUTE', message: 'Unexpected route.' } }, { status: 500 })
    },
  })
  const failedProviderClient = new testOwners.NativeCoreCollaborationClient(failedProviderHttp)
  const failedProviderResult = await failedProviderClient.delegate('synthetic-fault-project', {
    ...baseInput,
    receiverRef: { connectedConversationId: 'synthetic-known-codex-receiver' },
  })
  assert.equal(failedProviderResult.ok, false)
  assert.equal(failedProviderResult.error.code, 'provider_offline')
  assert.equal(failedProviderRequests.some(request => request.method === 'POST'
    && request.path.endsWith('/runs')), false, 'Provider registry read failure must not attempt a Run POST')

  console.log(JSON.stringify({
    ok: true,
    mode: 'real disposable Local Core facade + real collaboration/Core clients',
    providerExecution: false,
    bridgeOrProviderStarted: false,
    originalUserDatabaseOpened: false,
    rawSqlUsed: false,
    live17881Accessed: false,
    projectId,
    runCountBefore: initialRunCount,
    runCountAfter: runCount(),
    createdRunIds: [codexAutoRunId, codexMissingRunId, codexExplicitRunId, workbuddyRunId,
      standaloneDefaultRunId, standaloneExplicitRunId],
    cases: [
      'Codex receiver + auto resolves through Core provider capability and persists a Codex Run/Dispatch',
      'Codex receiver + omitted choice follows the same canonical provider mapping',
      'Explicit provider matching the receiver remains accepted unchanged',
      'WorkBuddy receiver + auto maps to the one registered WorkBuddy provider',
      'Cross-provider explicit choice and unknown receiver reject before any Run creation',
      'Aborted receiver mapping creates no Run; caller input remains unmodified',
      'Real Core provider metadata response held while isCurrent flips false returns cancelled with zero Run POST or DB growth',
      'Standalone no-receiver requests retain the existing Core WorkBuddy fallback; explicit Codex remains unchanged',
      'All created journals remain created/planned with attemptCount=0 and no RuntimeBinding',
      'Fault-injection only: unknown provider and provider-list failure fail closed before Run POST',
      'Synthetic transport only: a registered future provider passes through unchanged without adding a provider-name branch; current Core support is not implied',
    ],
    allowedCoreRequestCount: allowedCoreRequests.length,
    pinnedDeadOllamaAttempts: pinnedOllamaAttempts.length,
  }, null, 2))
} finally {
  coreBootstrapInProgress = false
  if (facade !== undefined) await facade.close()
  activeCoreOrigins.clear()
  globalThis.fetch = originalFetch
  const resolvedBase = path.resolve(runtimeBase)
  const resolvedRuntime = path.resolve(runtimeRoot)
  assert.ok(resolvedRuntime.startsWith(`${resolvedBase}${path.sep}`), 'Temporary test runtime must stay under .runtime')
  await rm(resolvedRuntime, { recursive: true, force: true })
}
