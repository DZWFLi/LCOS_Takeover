import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportDir = path.join(workspaceRoot, '.runtime', 'current-gen2-assembly-apply')
await mkdir(reportDir, { recursive: true })
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const runtimeRootResolved = path.resolve(runtimeRoot)
const publicOrigin = 'http://127.0.0.1:19879'
const timestamp = '2026-10-14T00:00:00.000Z'
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])

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
  'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY',
  'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL',
  'QIANFAN_API_KEY', 'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY',
  'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY',
  'BEDROCK_BASE_URL', 'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
// Any semantic-index embedding attempt remains pinned to a dead loopback URL.
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  reportPath,
  mode: 'fresh fullIntegration facade → original Core Collection/Assembly/Conversation/WorkView/Run HTTP owners',
  fixtureKind: 'synthetic project, Core HTTP Collection + Assembly Apply + conversation + planned Run; no raw SQL/provider',
  currentRoot: currentGen2Root,
  process: { pid: process.pid, facadeStartedInThisProcess: false },
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { allowedCoreRequests: [], pinnedOllamaRejected: [], blocked: [], bootstrapBaseline: [], activeCoreOrigins: [] },
  facadeRequests: [],
  cases: [],
  cleanup: { targetContained: false, facadeClosed: false, listenerReleased: false, runtimeRemoved: false },
}

const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let coreBootstrapInProgress = false
let facade
let repository
let coreOrigin
let projectId
const coreOrigins = new Set()

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

function assertContained(parent, target, prefix) {
  const resolvedParent = path.resolve(parent)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget
    || (prefix && !path.basename(resolvedTarget).startsWith(prefix))) {
    throw new Error(`Refusing to clean a path outside this test-owned root: ${resolvedTarget}`)
  }
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedOllamaRejected.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname })
      throw new Error('The assembly Apply test rejects pinned dead Ollama before networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      let requestBody
      if (typeof init?.body === 'string') {
        try { requestBody = JSON.parse(init.body) } catch { /* preserve opaque non-JSON bodies */ }
      }
      report.network.allowedCoreRequests.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname,
        status: response.status, ...(requestBody === undefined ? {} : { requestBody }) })
      return response
    }
    report.network.blocked.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname })
    throw new Error('Only the active temporary Core listener and pinned dead Ollama may be addressed.')
  }
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

async function facadeRequest(method, pathname, body) {
  const result = await facade.handle({ method, pathname, url: new URL(pathname, publicOrigin), body })
  report.facadeRequests.push({ method, pathname, status: result.status, code: result.body?.error?.code ?? null })
  return result
}

async function nativeCanvas(canvasId) {
  const result = await facadeRequest('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(result.status, 200, `native canvas read ${canvasId}: ${JSON.stringify(result.body)}`)
  return result.body.data
}

async function collectionProjection(canvasId, collectionId) {
  return facadeRequest('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
}

function mutationIds() {
  return repository.listMutationChangeSets(projectId, 200).map(changeSet => String(changeSet.id)).sort()
}

function applyBody(source, targetRef) {
  return { schemaVersion: 1, projectId, sourceRefs: [source], targetRef }
}

function memberRefs(presentationId) {
  return repository.getPresentationView(projectId, presentationId)?.state.memberEntityRefs ?? []
}

async function main() {
  const ownerBundle = path.join(runtimeRoot, 'current-gen2-assembly-apply-test-owners.mjs')
  await buildPilotEntry('lab/pilot/current-gen2-assembly-apply-test-owners.ts', ownerBundle)
  const owners = await import(pathToFileURL(ownerBundle).href)
  assert.equal(typeof owners.startSurfaceCoreFacade, 'function')
  assert.equal(typeof owners.createTextArtifact, 'function')
  const sourceManifest = JSON.parse(await readFile(`${ownerBundle}.sources.json`, 'utf8'))
  assert.equal(sourceManifest.currentRoot, currentGen2Root)
  const bundledCurrent = new Set((sourceManifest.resources ?? []).map(resource => resource.resourcePath))
  const currentApplyClosure = [
    'apps/local-core/src/assembly-apply-service.ts',
    'apps/local-core/src/curation-command-service.ts',
    'apps/local-core/src/presentation-application-service.ts',
    'apps/local-core/src/conversation-context.ts',
    'apps/local-core/src/collection-content.ts',
    'apps/local-core/src/context-manifest-service.ts',
    'apps/local-core/src/runtime-application-service.ts',
    'apps/local-core/src/compose.ts',
  ]
  for (const resourcePath of currentApplyClosure) {
    assert.ok(bundledCurrent.has(resourcePath), `the real isolated Core bundle must use current owner ${resourcePath}`)
  }
  report.currentCoreClosure = currentApplyClosure
  report.bundledCurrentSources = [...bundledCurrent].sort()

  const bootstrapOrigins = activeListeningLoopbackOrigins()
  report.network.bootstrapBaseline = [...bootstrapOrigins]
  assert.equal(bootstrapOrigins.size, 0, 'test process must start without an inherited listener')
  installFetchBoundary()
  coreBootstrapInProgress = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
  report.process.facadeStartedInThisProcess = true
  repository = facade.core.repository
  projectId = String(facade.core.projectId)
  coreOrigin = String(facade.core.origin)
  const listening = activeListeningLoopbackOrigins()
  assert.ok(listening.has(coreOrigin), 'fresh facade must own and report its actual Core listener')
  assert.equal(listening.size, 1, 'only this isolated Core listener may be active')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'Core must use an ephemeral non-production loopback port')
  coreOrigins.add(coreOrigin)
  report.network.activeCoreOrigins.push(coreOrigin)
  coreBootstrapInProgress = false

  const initialRunCount = repository.getProjectRuns(projectId, 200).length
  assert.equal(initialRunCount, 0, 'fresh assembly test starts with no Runs')
  const rootScope = repository.getScopes(projectId).find(scope => scope.kind === 'root')
  const contextScope = repository.getScopes(projectId).find(scope => String(scope.id) === 'scope-surface-core-context')
  const workflowScope = repository.getScopes(projectId).find(scope => String(scope.id) === 'scope-surface-core-workflow')
  const project = repository.getProject(projectId)
  assert.ok(rootScope && contextScope?.kind === 'context' && workflowScope?.kind === 'workflow' && project)

  const body = `BOUND_COLLECTION_RUN_BODY_START\n${Array.from({ length: 72 }, (_, index) =>
    `正文段 ${String(index + 1).padStart(3, '0')}：真实完整 UTF-8 内容保留关系、版本和尾部，不是短预览。`).join('\n')}\nBOUND_COLLECTION_RUN_BODY_TAIL_雪_END`
  const text = await owners.createTextArtifact(repository, projectId, {
    title: 'Bound conversation collection material', body, scopeId: String(rootScope.id),
  })
  const created = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Bound Collection synthetic fixture',
    members: [{ type: 'artifact', id: text.artifactId }],
  })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const collectionId = String(created.body?.value?.id ?? '')
  assert.ok(collectionId)
  const collection = repository.getCollection(collectionId)
  assert.equal(String(collection?.projectId), projectId)
  const collectionMembersBefore = repository.listCollectionMemberships(projectId, collectionId)
  assert.equal(collectionMembersBefore.length, 1)
  assert.deepEqual(collectionMembersBefore[0]?.memberRef, { type: 'artifact', id: text.artifactId })

  // Synthetic identity collision: a valid Scope and a legacy kind=collection Scope share/imitate IDs,
  // while the canonical Collection remains the only valid Collection identity.
  const graph = repository.get(projectId)
  assert.ok(graph)
  const sameIdScope = { ...rootScope, id: collectionId, parentScopeId: rootScope.id, kind: 'context', name: 'same-ID Context fixture' }
  const scopeOnlyId = `legacy-scope-only-${process.pid}`
  const legacyCollectionScope = { ...rootScope, id: scopeOnlyId, parentScopeId: rootScope.id, kind: 'collection', name: 'legacy Collection-like Scope fixture' }
  repository.applyMutations({ baseVersion: graph.graphVersion, actorKind: 'user', ops: [
    { type: 'upsert_scope', scope: sameIdScope },
    { type: 'upsert_scope', scope: legacyCollectionScope },
  ] }, projectId)
  assert.equal(String(repository.getCollection(collectionId)?.id), collectionId)
  assert.ok(repository.getScopes(projectId).some(scope => String(scope.id) === collectionId && scope.kind === 'context'))
  assert.ok(repository.getScopes(projectId).some(scope => String(scope.id) === scopeOnlyId && scope.kind === 'collection'))

  const foreignProjectId = `gen2-assembly-foreign-${process.pid}`
  const foreignProjectRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignProjectRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign Assembly project', rootPath: foreignProjectRoot })
  const foreignCreated = await coreRequest('POST', `/projects/${encodeURIComponent(foreignProjectId)}/collections`, {
    title: 'Foreign Collection must stay foreign', members: [],
  })
  assert.equal(foreignCreated.status, 201, JSON.stringify(foreignCreated.body))
  const foreignCollectionId = String(foreignCreated.body?.value?.id ?? '')
  assert.ok(foreignCollectionId)

  report.fixture = {
    projectId,
    collectionId,
    artifactId: text.artifactId,
    revisionId: text.revisionId,
    fileRecordId: text.fileRecordId,
    sameIdScope: collectionId,
    scopeOnlyCollectionLikeId: scopeOnlyId,
    foreignProjectId,
    foreignCollectionId,
    contextScopeId: String(contextScope.id),
    workflowScopeId: String(workflowScope.id),
  }

  const rootContextPresentationId = `presentation:context:${rootScope.id}`
  const rootWorkflowPresentationId = `presentation:workflow:${rootScope.id}`
  const surfaces = [
    { label: 'Main', surfaceKey: 'main', targetRef: { kind: 'main' }, presentationId: rootContextPresentationId },
    // Main and the root Context workspace intentionally share the root Context
    // Presentation. This synthetic Saved Context scope is a separate target,
    // not the 一级 Context worksite address.
    { label: 'Context', surfaceKey: 'context', targetRef: { kind: 'context', id: String(rootScope.id) }, presentationId: rootContextPresentationId },
    { label: 'Workflow', surfaceKey: 'workflow', targetRef: { kind: 'workflow', id: String(rootScope.id) }, presentationId: rootWorkflowPresentationId },
  ]
  const surfaceCanvasIds = new Map()
  for (const surface of surfaces) {
    const workspaces = facade.workspaces.filter(workspace => workspace.preferredSurface === surface.surfaceKey)
    assert.equal(workspaces.length, 1, `${surface.label} must resolve to one root Core Workspace`)
    assert.equal(String(workspaces[0].scopeId), String(rootScope.id),
      `${surface.label} root workspace must retain the original rootScopeId; synthetic aggregate scopes are not root surfaces`)
    assert.ok(workspaces[0].canvasId, `${surface.label} root Workspace must own an exact Huabu Canvas`)
    surfaceCanvasIds.set(surface.surfaceKey, String(workspaces[0].canvasId))
  }
  assert.equal(new Set(surfaceCanvasIds.values()).size, 3, 'the root surfaces retain separate native Canvas identities')

  const assertProjectionNotReceived = async surface => {
    const canvasId = surfaceCanvasIds.get(surface.surfaceKey)
    const beforeCanvas = structuredClone(await facade.spatial.read(canvasId))
    const beforeBindings = structuredClone(repository.getProjectionBindings(projectId).filter(binding => binding.canvasId === canvasId))
    const notReceived = await collectionProjection(canvasId, collectionId)
    assert.equal(notReceived.status, 409, `${surface.label} projection before its canonical Presentation receipt must fail closed`)
    assert.equal(notReceived.body?.error?.code, 'COLLECTION_NOT_RECEIVED')
    assert.deepEqual(await facade.spatial.read(canvasId), beforeCanvas,
      `${surface.label} pre-acceptance projection cannot write a carrier`)
    assert.deepEqual(repository.getProjectionBindings(projectId).filter(binding => binding.canvasId === canvasId), beforeBindings,
      `${surface.label} pre-acceptance projection cannot write a binding`)
  }
  // Check all three before any surface receives the shared Main/Context member.
  for (const surface of surfaces) await assertProjectionNotReceived(surface)

  const collectionSource = { kind: 'collection', id: collectionId }
  const artifactCountBeforeApply = repository.getArtifacts(projectId).length
  for (const surface of surfaces) {
    const canvasId = surfaceCanvasIds.get(surface.surfaceKey)
    // Unlike Main/Context, Workflow has a separate Presentation. Recheck after
    // the shared root Context member exists to prove it still cannot leak there.
    if (surface.label === 'Workflow') await assertProjectionNotReceived(surface)

    const before = mutationIds()
    const applied = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
      applyBody(collectionSource, surface.targetRef))
    assert.equal(applied.status, 200, `${surface.label} Apply HTTP: ${JSON.stringify(applied.body)}`)
    assert.equal(applied.body?.ok, true, `${surface.label} Apply envelope`)
    const result = applied.body.value.results[0]
    assert.deepEqual(result.sourceRef, collectionSource)
    assert.equal(result.presentationId, surface.presentationId)
    assert.deepEqual(memberRefs(surface.presentationId), [{ type: 'collection', id: collectionId }])
    const afterApply = mutationIds()
    if (surface.label === 'Context') {
      assert.equal(result.status, 'skipped', 'root Context reuses the already accepted Main Context Presentation member')
      assert.equal(result.channel, 'already-member')
      assert.equal(result.changeSetId, undefined)
      assert.deepEqual(afterApply, before, 'shared Main/Context membership must not create a second ChangeSet')
    } else {
      assert.equal(result.status, 'applied', `${surface.label} must apply the canonical Collection, not its colliding Scope ID`)
      assert.equal(result.channel, 'presentation-membership')
      assert.ok(result.changeSetId)
      assert.equal(afterApply.length, before.length + 1, `${surface.label} semantic membership has one original ChangeSet receipt`)
      assert.ok(afterApply.includes(String(result.changeSetId)))
    }

    const beforeReplay = mutationIds()
    const replay = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
      applyBody(collectionSource, surface.targetRef))
    assert.equal(replay.status, 200, `${surface.label} replay HTTP`)
    assert.deepEqual(replay.body.value.results[0], {
      sourceRef: collectionSource,
      status: 'skipped',
      channel: 'already-member',
      message: `Already a member of ${surface.targetRef.kind} presentation.`,
      presentationId: surface.presentationId,
    })
    assert.deepEqual(mutationIds(), beforeReplay, `${surface.label} idempotent replay must not add a ChangeSet`)
    report.cases.push(surface.label === 'Context'
      ? 'Context root reuses Main’s exact Core Presentation membership; AssemblyApply reports already-member without a second ChangeSet'
      : `${surface.label}: original Core AssemblyApply created exactly one typed Collection memberEntityRef; replay skipped without another ChangeSet`)

    if (surface.label === 'Main') {
      const reverted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/change-sets/${encodeURIComponent(result.changeSetId)}/revert`, {})
      assert.equal(reverted.status, 200, `Main original ChangeSet revert: ${JSON.stringify(reverted.body)}`)
      assert.equal(memberRefs(surface.presentationId).some(ref => ref.type === 'collection' && ref.id === collectionId), false)
      assert.equal(String(repository.getCollection(collectionId)?.id), collectionId, 'undoing placement membership must not delete Collection truth')
      assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), collectionMembersBefore,
        'undoing Presentation membership must not remove Collection members')
      const reapplied = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/change-sets/${encodeURIComponent(result.changeSetId)}/reapply`, {})
      assert.equal(reapplied.status, 200, `Main original ChangeSet reapply: ${JSON.stringify(reapplied.body)}`)
      assert.deepEqual(memberRefs(surface.presentationId), [{ type: 'collection', id: collectionId }])
      report.cases.push('Main semantic membership uses original Core ChangeSet revert/reapply; Collection identity and its member rows survive both directions')

      const coreCollectionBeforeProjection = structuredClone(repository.getCollection(collectionId))
      const coreMembersBeforeProjection = structuredClone(repository.listCollectionMemberships(projectId, collectionId))
      const canvasBeforeProjection = await nativeCanvas(canvasId)
      const idsBeforeProjection = canvasBeforeProjection.nodes.map(node => String(node.id)).sort()
      const projected = await collectionProjection(canvasId, collectionId)
      assert.equal(projected.status, 200, `accepted Main Collection projects through the original projector: ${JSON.stringify(projected.body)}`)
      const projectedNode = projected.body.data.node
      const projectedBinding = projected.body.data.binding
      assert.equal(projectedNode.type, 'lcos-collection')
      assert.equal(projectedNode.data.lcos_collection_ref?.projectId, projectId)
      assert.equal(projectedNode.data.lcos_collection_ref?.canvasId, canvasId)
      assert.equal(projectedNode.data.lcos_collection_ref?.collectionId, collectionId)
      assert.equal(projectedBinding.entityType, 'collection')
      assert.equal(projectedBinding.entityId, collectionId)
      assert.equal(projectedBinding.spatialId, projectedNode.id)
      const boundProjection = await facadeRequest('GET', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/projection`)
      assert.equal(boundProjection.status, 200)
      assert.equal(boundProjection.body.data.binding.spatialId, projectedNode.id)

      const repeatedProjection = await collectionProjection(canvasId, collectionId)
      assert.equal(repeatedProjection.status, 200)
      assert.equal(repeatedProjection.body.data.binding.spatialId, projectedNode.id,
        'projection replay must retain the same Core binding and carrier identity')
      const canvasAfterReplay = await nativeCanvas(canvasId)
      assert.deepEqual(canvasAfterReplay.nodes.map(node => String(node.id)).sort(), [...idsBeforeProjection, String(projectedNode.id)].sort(),
        'replaying the same accepted Collection must not allocate another spatial node')

      const movedPosition = { x: Number(projectedNode.position.x) + 37, y: Number(projectedNode.position.y) + 23 }
      const moved = await facadeRequest('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
        canvas_id: canvasId,
        actions: [{ action: 'update', updates: [{ id: projectedNode.id, type: projectedNode.type,
          position: movedPosition, measured: structuredClone(projectedNode.measured), data: structuredClone(projectedNode.data) }] }],
      })
      assert.equal(moved.status, 200, `same-carrier Collection geometry save: ${JSON.stringify(moved.body)}`)
      assert.equal(moved.body.data.spatial_saved, true)
      const canvasAfterMove = await nativeCanvas(canvasId)
      const movedNode = canvasAfterMove.nodes.find(node => String(node.id) === String(projectedNode.id))
      assert.ok(movedNode)
      assert.equal(movedNode.type, 'lcos-collection')
      assert.deepEqual(movedNode.position, movedPosition)
      assert.equal(canvasAfterMove.nodes.length, canvasAfterReplay.nodes.length)
      const bindingAfterMove = await facadeRequest('GET', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/projection`)
      assert.equal(bindingAfterMove.status, 200)
      assert.equal(bindingAfterMove.body.data.binding.spatialId, projectedNode.id)
      assert.deepEqual(bindingAfterMove.body.data.node.position, movedPosition)
      assert.deepEqual(repository.getCollection(collectionId), coreCollectionBeforeProjection,
        'carrier projection and geometry remain presentation-only; Collection metadata is unchanged')
      assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), coreMembersBeforeProjection,
        'moving the carrier does not mutate canonical Collection members')

      const spatialBeforeForgery = structuredClone(await facade.spatial.read(canvasId))
      const forgedData = structuredClone(movedNode.data)
      forgedData.lcos_collection_ref.collectionId = foreignCollectionId
      const forged = await facadeRequest('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
        canvas_id: canvasId,
        actions: [{ action: 'update', updates: [{ id: movedNode.id, type: movedNode.type,
          position: { x: movedPosition.x + 91, y: movedPosition.y + 91 }, measured: structuredClone(movedNode.measured), data: forgedData }] }],
      })
      assert.equal(forged.status, 409, 'renderer cannot replace the Collection identity while requesting geometry')
      assert.equal(forged.body?.error?.code, 'PROJECTED_NODE_FACTS_MISMATCH')
      assert.deepEqual(await facade.spatial.read(canvasId), spatialBeforeForgery, 'forged DTO rejection happens before spatial geometry writes')
      assert.deepEqual(repository.getCollection(collectionId), coreCollectionBeforeProjection)
      assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), coreMembersBeforeProjection)
      report.collectionCarrier = { canvasId, spatialId: String(projectedNode.id), type: projectedNode.type,
        presentationId: surface.presentationId, replayKeptOneCarrier: true, geometry: movedPosition,
        sameCoreCollectionAndMembers: true, forgedReferenceRejected: true }
      report.cases.push('accepted Main Collection projects to one exact same-ID binding/carrier; replay is idempotent, native geometry moves that carrier only, and forged ref returns 409')
    } else if (surface.label === 'Context') {
      const mainCanvasId = surfaceCanvasIds.get('main')
      const mainCarrierId = report.collectionCarrier?.spatialId
      assert.ok(mainCarrierId, 'Main must have its own accepted Collection carrier before Context projection')
      const mainBeforeContext = await nativeCanvas(mainCanvasId)
      const mainNodeBeforeContext = mainBeforeContext.nodes.find(node => String(node.id) === mainCarrierId)
      assert.ok(mainNodeBeforeContext)
      const mainPositionBeforeContext = structuredClone(mainNodeBeforeContext.position)
      const contextBeforeProjection = await nativeCanvas(canvasId)
      const contextIdsBeforeProjection = contextBeforeProjection.nodes.map(node => String(node.id)).sort()
      const coreCollectionBeforeContext = structuredClone(repository.getCollection(collectionId))
      const coreMembersBeforeContext = structuredClone(repository.listCollectionMemberships(projectId, collectionId))
      const changesBeforeContextProjection = mutationIds()

      const projected = await collectionProjection(canvasId, collectionId)
      assert.equal(projected.status, 200,
        `Main’s positive shared Presentation receipt permits a distinct Context canvas projection: ${JSON.stringify(projected.body)}`)
      const projectedNode = projected.body.data.node
      assert.equal(projectedNode.type, 'lcos-collection')
      assert.equal(projectedNode.data.lcos_collection_ref?.projectId, projectId)
      assert.equal(projectedNode.data.lcos_collection_ref?.canvasId, canvasId)
      assert.equal(projectedNode.data.lcos_collection_ref?.collectionId, collectionId)
      assert.notEqual(String(projectedNode.id), String(mainCarrierId), 'Main and Context keep distinct native carrier IDs')
      assert.equal(projected.body.data.binding.canvasId, canvasId)
      assert.equal(projected.body.data.binding.spatialId, projectedNode.id)
      assert.equal(projected.body.data.binding.entityType, 'collection')
      assert.equal(projected.body.data.binding.entityId, collectionId)
      const contextAfterProjection = await nativeCanvas(canvasId)
      assert.deepEqual(contextAfterProjection.nodes.map(node => String(node.id)).sort(),
        [...contextIdsBeforeProjection, String(projectedNode.id)].sort(),
      'Context projection adds exactly its own one carrier without touching Main nodes')

      const repeatedProjection = await collectionProjection(canvasId, collectionId)
      assert.equal(repeatedProjection.status, 200)
      assert.equal(repeatedProjection.body.data.binding.spatialId, projectedNode.id,
        'Context replay retains its own binding/carrier identity')
      const contextAfterReplay = await nativeCanvas(canvasId)
      assert.deepEqual(contextAfterReplay.nodes.map(node => String(node.id)).sort(),
        [...contextIdsBeforeProjection, String(projectedNode.id)].sort(),
      'Context replay must not allocate a second carrier')

      const contextMovedPosition = { x: Number(projectedNode.position.x) + 19, y: Number(projectedNode.position.y) + 29 }
      const contextMoved = await facadeRequest('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
        canvas_id: canvasId,
        actions: [{ action: 'update', updates: [{ id: projectedNode.id, type: projectedNode.type,
          position: contextMovedPosition, measured: structuredClone(projectedNode.measured), data: structuredClone(projectedNode.data) }] }],
      })
      assert.equal(contextMoved.status, 200, `Context native geometry save: ${JSON.stringify(contextMoved.body)}`)
      assert.equal(contextMoved.body.data.spatial_saved, true)
      const contextAfterMove = await nativeCanvas(canvasId)
      const movedContextNode = contextAfterMove.nodes.find(node => String(node.id) === String(projectedNode.id))
      assert.ok(movedContextNode)
      assert.deepEqual(movedContextNode.position, contextMovedPosition)
      assert.equal(contextAfterMove.nodes.length, contextAfterReplay.nodes.length)
      const contextBindingAfterMove = await facadeRequest('GET', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/projection`)
      assert.equal(contextBindingAfterMove.status, 200)
      assert.equal(contextBindingAfterMove.body.data.binding.canvasId, canvasId)
      assert.equal(contextBindingAfterMove.body.data.binding.spatialId, projectedNode.id)
      assert.deepEqual(contextBindingAfterMove.body.data.node.position, contextMovedPosition)

      const mainAfterContextMove = await nativeCanvas(mainCanvasId)
      const mainNodeAfterContextMove = mainAfterContextMove.nodes.find(node => String(node.id) === mainCarrierId)
      assert.ok(mainNodeAfterContextMove)
      assert.deepEqual(mainNodeAfterContextMove.position, mainPositionBeforeContext,
        'moving the Context carrier must not change Main geometry')
      assert.deepEqual(mutationIds(), changesBeforeContextProjection,
        'per-canvas Collection projection and native geometry do not mutate Presentation membership')
      assert.deepEqual(repository.getCollection(collectionId), coreCollectionBeforeContext)
      assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), coreMembersBeforeContext)
      report.contextCarrier = { canvasId, spatialId: String(projectedNode.id), type: projectedNode.type,
        presentationId: surface.presentationId, distinctFromMainCarrier: true, replayKeptOneCarrier: true,
        geometry: contextMovedPosition, mainGeometryUnaffected: true, sameCoreCollectionAndMembers: true }
      report.cases.push('accepted shared Main/Context Presentation projects one distinct Context carrier; repeat keeps its binding and Context geometry cannot move Main')
    } else if (surface.label === 'Workflow') {
      const canvasBeforeProjection = await nativeCanvas(canvasId)
      const idsBeforeProjection = canvasBeforeProjection.nodes.map(node => String(node.id)).sort()
      const projected = await collectionProjection(canvasId, collectionId)
      assert.equal(projected.status, 200, `accepted Workflow Collection projects through the original projector: ${JSON.stringify(projected.body)}`)
      const projectedNode = projected.body.data.node
      assert.equal(projectedNode.type, 'lcos-collection')
      assert.equal(projectedNode.data.lcos_collection_ref?.projectId, projectId)
      assert.equal(projectedNode.data.lcos_collection_ref?.canvasId, canvasId)
      assert.equal(projectedNode.data.lcos_collection_ref?.collectionId, collectionId)
      assert.notEqual(String(projectedNode.id), String(report.collectionCarrier.spatialId))
      assert.notEqual(String(projectedNode.id), String(report.contextCarrier.spatialId))
      assert.equal(projected.body.data.binding.canvasId, canvasId)
      assert.equal(projected.body.data.binding.spatialId, projectedNode.id)
      const repeatedProjection = await collectionProjection(canvasId, collectionId)
      assert.equal(repeatedProjection.status, 200)
      assert.equal(repeatedProjection.body.data.binding.spatialId, projectedNode.id,
        'Workflow replay retains its exact carrier binding')
      const canvasAfterReplay = await nativeCanvas(canvasId)
      assert.deepEqual(canvasAfterReplay.nodes.map(node => String(node.id)).sort(), [...idsBeforeProjection, String(projectedNode.id)].sort(),
        'Workflow replay must not allocate a second carrier')
      report.workflowCarrier = { canvasId, spatialId: String(projectedNode.id), type: projectedNode.type,
        presentationId: surface.presentationId, unreceivedBeforeCoreReceiptRejected: true, replayKeptOneCarrier: true }
      report.cases.push('Workflow projection remains blocked until its separate Core Presentation receipt, then projects one exact carrier idempotently')
    }
  }

  // Keep the synthetic nested Saved Context scope coverage, but never use it as
  // the address of the 一级 Context Workspace above.
  const syntheticChildPresentationId = `presentation:context:${contextScope.id}`
  const rootPresentationBeforeChildApply = structuredClone(memberRefs(rootContextPresentationId))
  const childBefore = mutationIds()
  const childApply = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
    applyBody(collectionSource, { kind: 'context', id: String(contextScope.id) }))
  assert.equal(childApply.status, 200, `synthetic child Saved Context Apply: ${JSON.stringify(childApply.body)}`)
  const childResult = childApply.body.value.results[0]
  assert.equal(childResult.status, 'applied')
  assert.equal(childResult.channel, 'presentation-membership')
  assert.equal(childResult.presentationId, syntheticChildPresentationId)
  assert.equal(mutationIds().length, childBefore.length + 1)
  assert.deepEqual(memberRefs(syntheticChildPresentationId), [{ type: 'collection', id: collectionId }])
  assert.deepEqual(memberRefs(rootContextPresentationId), rootPresentationBeforeChildApply,
    'a synthetic child Context Presentation is separate from shared Main/root Context membership')
  const childReplay = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
    applyBody(collectionSource, { kind: 'context', id: String(contextScope.id) }))
  assert.equal(childReplay.body.value.results[0]?.status, 'skipped')
  assert.equal(childReplay.body.value.results[0]?.channel, 'already-member')
  assert.deepEqual(mutationIds(), [...childBefore, String(childResult.changeSetId)].sort(),
    'synthetic child Context replay remains idempotent')
  report.syntheticChildContext = { scopeId: String(contextScope.id), presentationId: syntheticChildPresentationId,
    separateFromRootContext: true, replayIdempotent: true }
  report.cases.push('synthetic child Saved Context retains its own independent Presentation without being mistaken for the root Context worksite')

  assert.equal(repository.getArtifacts(projectId).length, artifactCountBeforeApply,
    'Collection surface Apply references the aggregate; it must not clone its member Artifacts')
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), collectionMembersBefore,
    'Presentation Apply must not mutate the Collection member list')

  const conversationBody = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/conversations/import-manual`, {
    title: 'Synthetic linked conversation for Collection context',
    scopeId: String(rootScope.id),
    entries: [{ role: 'user', contentText: 'Synthetic conversation body for bound Collection test.' }],
  })
  assert.equal(conversationBody.status, 201, JSON.stringify(conversationBody.body))
  const sessionId = String(conversationBody.body?.value?.session?.id ?? '')
  assert.ok(sessionId)
  const connected = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations`, {
    action: 'connect', provider: 'codex', executorId: 'synthetic-test-only',
    conversationRef: `synthetic-assembly-${process.pid}`, label: 'Synthetic bound Collection conversation',
  })
  assert.equal(connected.status, 201, JSON.stringify(connected.body))
  const connectedConversationId = String(connected.body?.value?.id ?? '')
  assert.ok(connectedConversationId)
  const linked = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/link-session`, {
    conversationSessionId: sessionId,
  })
  assert.equal(linked.status, 200, JSON.stringify(linked.body))

  const scopeRelation = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
    applyBody({ kind: 'context', id: collectionId }, { kind: 'conversation', id: connectedConversationId }))
  assert.equal(scopeRelation.status, 200, JSON.stringify(scopeRelation.body))
  assert.equal(scopeRelation.body.value.results[0]?.status, 'applied')
  const collectionRelation = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
    applyBody(collectionSource, { kind: 'conversation', id: connectedConversationId }))
  assert.equal(collectionRelation.status, 200, JSON.stringify(collectionRelation.body))
  assert.equal(collectionRelation.body.value.results[0]?.status, 'applied',
    'same-ID Scope relation must not make the distinct Collection relation appear already present')
  assert.equal(collectionRelation.body.value.results[0]?.channel, 'relation')
  assert.ok(collectionRelation.body.value.results[0]?.changeSetId)
  const relationTargets = repository.getRelations(projectId)
    .filter(relation => relation.kind === 'conversation_context' && String(relation.targetEntityId) === collectionId)
    .map(relation => relation.targetEntityType).sort()
  assert.deepEqual(relationTargets, ['collection', 'scope'], 'Core must preserve the exact target entity kinds despite same ID')

  const workView = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/work-view`)
  assert.equal(workView.status, 200, JSON.stringify(workView.body))
  assert.equal(workView.body.value.connectedConversationId, connectedConversationId)
  const reachedCollection = workView.body.value.reach?.items?.find(item =>
    item.entityRef?.type === 'collection' && item.entityRef?.id === collectionId && item.tier === 'bound')
  assert.ok(reachedCollection, 'original WorkView reach must read the bound Collection endpoint, not only the same-ID Scope')
  const collaborationSession = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/collaboration-session`)
  assert.equal(collaborationSession.status, 200, JSON.stringify(collaborationSession.body))
  const boundContext = collaborationSession.body.value.relation?.boundContext
  assert.ok(Array.isArray(boundContext))
  const boundCollection = boundContext.find(item => item.entityRef?.type === 'collection' && item.entityRef?.id === collectionId)
  assert.ok(boundCollection, 'the existing bound-context read model must keep the typed Collection ref')
  assert.ok(boundContext.some(item => item.entityRef?.type === 'scope' && item.entityRef?.id === collectionId),
    'the distinct same-ID Scope binding must remain visible rather than being overwritten')
  report.cases.push('original WorkView and CollaborationSession readbacks expose both same-ID Scope and Collection as distinct bound identities')

  // The bound-context row supplies only the exact aggregate address. The original Run owner then
  // resolves its full ordered member body through CollectionContent; no member is flattened client-side.
  const runReference = { order: 0, ref: { type: 'collection', collectionId: String(boundCollection.entityRef.id) } }
  const runCreated = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/runs`, {
    instruction: 'Inspect the exact bound Collection aggregate and retain its full member text.',
    outputIntent: 'analyze',
    receiverRef: { connectedConversationId },
    orderedReferences: [runReference],
  })
  assert.equal(runCreated.status, 201, JSON.stringify(runCreated.body))
  const review = runCreated.body?.value?.review
  assert.ok(review?.run?.id)
  const runId = String(review.run.id)
  assert.equal(review.run.status, 'created')
  assert.equal(review.dispatch.status, 'planned')
  assert.equal(review.dispatch.attemptCount, 0)
  assert.equal(repository.getRuntimeBinding(runId), undefined, 'planned journal must not start a Bridge/provider task')
  assert.deepEqual(repository.getRunOrderedReferences(runId), [runReference])
  const manifestRow = repository.getContextManifest(String(review.run.contextManifestId))
  assert.ok(manifestRow)
  const manifest = JSON.parse(manifestRow.canonicalJson)
  const manifestItem = manifest.orderedItems.find(item => item.role === 'reference' && item.artifactId === text.artifactId)
  assert.ok(manifestItem, 'the original Run manifest must expand the bound Collection into its member Artifact')
  assert.equal(manifestItem.revisionId, text.revisionId)
  assert.ok(manifestItem.content.includes('BOUND_COLLECTION_RUN_BODY_START'))
  assert.ok(manifestItem.content.includes('BOUND_COLLECTION_RUN_BODY_TAIL_雪_END'))
  assert.deepEqual(JSON.parse(manifestItem.sourceAnchor), {
    collectionId,
    sourcePaths: [[`collection:${collectionId}`, `membership:${collectionMembersBefore[0].relationId}`, `artifact:${text.artifactId}`]],
  })
  const revision = repository.getArtifactRevision(text.revisionId)
  const file = revision && repository.getFileRecord(String(revision.fileRecordId))
  assert.ok(file)
  assert.equal(await readFile(file.observedPath, 'utf8'), body, 'Run body must equal the exact canonical FileRecord bytes')
  const workViewAfterRun = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/connected-conversations/${encodeURIComponent(connectedConversationId)}/work-view`)
  assert.ok(workViewAfterRun.body.value.runs.some(run => run.runId === runId && run.status === 'created'))
  assert.equal(repository.getProjectRuns(projectId, 200).length, initialRunCount + 1)
  report.run = {
    runId,
    receiverConversationId: connectedConversationId,
    orderedReferences: repository.getRunOrderedReferences(runId),
    status: review.run.status,
    dispatchStatus: review.dispatch.status,
    attemptCount: review.dispatch.attemptCount,
    runtimeBindingCreated: false,
    manifestArtifactId: manifestItem.artifactId,
    manifestRevisionId: manifestItem.revisionId,
    bodyCharacters: body.length,
  }
  report.cases.push('WorkView-bound Collection was passed as one typed ordered aggregate ref to the original Run HTTP owner; manifest preserves exact full member bytes/provenance; Run remains planned with zero attempts')

  const beforeRejected = mutationIds()
  const presentationBeforeRejected = structuredClone(memberRefs(`presentation:context:${contextScope.id}`))
  const invalidSources = [
    { label: 'foreign Collection', source: { kind: 'collection', id: foreignCollectionId } },
    { label: 'Scope-only legacy kind=collection ID', source: { kind: 'collection', id: scopeOnlyId } },
  ]
  for (const invalid of invalidSources) {
    const rejected = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`,
      applyBody(invalid.source, { kind: 'context', id: String(contextScope.id) }))
    assert.equal(rejected.status, 200, `${invalid.label} semantic rejection is an original Assembly result`)
    assert.equal(rejected.body.value.results[0]?.status, 'failed', `${invalid.label} must not be reinterpreted as Scope`)
    assert.equal(rejected.body.value.results[0]?.channel, 'error')
  }
  assert.deepEqual(mutationIds(), beforeRejected, 'foreign and Scope-only Collection refs must not create ChangeSets')
  assert.deepEqual(memberRefs(`presentation:context:${contextScope.id}`), presentationBeforeRejected,
    'rejected identities must not change presentation membership')
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), collectionMembersBefore)
  report.cases.push('foreign Collection and Scope-only kind=collection identities fail closed without ChangeSet, Presentation, or Collection-member writes')

  const finalRunCount = repository.getProjectRuns(projectId, 200).length
  assert.equal(finalRunCount, initialRunCount + 1, 'only the one explicit synthetic planned Run may exist')
  assert.equal(report.network.blocked.length, 0, 'no external request may escape the network boundary')
  assert.ok(report.network.pinnedOllamaRejected.every(request =>
    request.origin === 'http://127.0.0.1:1' && request.path === '/api/embed'),
  'any embedding request must remain pinned to dead loopback and rejected before network')
  assert.ok(report.network.allowedCoreRequests.every(request => request.origin === coreOrigin))
  assert.ok(!report.network.allowedCoreRequests.some(request => /\/runs\/[^/]+\/(dispatch|recover|sync)$/.test(request.path)),
    'the test must not call any execution/dispatch endpoint')
  report.runCount = { start: initialRunCount, end: finalRunCount }
  report.summary = {
    projectId,
    collectionId,
    surfaces: surfaces.map(surface => surface.label),
    linkedConversationId: connectedConversationId,
    typedRunReference: runReference,
    runCount: report.runCount,
    runStatus: review.run.status,
    dispatchAttemptCount: review.dispatch.attemptCount,
    dispatchEndpointCalls: 0,
    pinnedOllamaAttemptsRejected: report.network.pinnedOllamaRejected.length,
    coreHttpRequests: report.network.allowedCoreRequests.length,
  }
}

try {
  await main()
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error)
  process.exitCode = 1
} finally {
  if (facade) {
    try {
      await facade.close()
      report.cleanup.facadeClosed = true
    } catch (error) {
      report.cleanup.closeError = error instanceof Error ? error.message : String(error)
    }
  } else report.cleanup.facadeClosed = true
  await new Promise(resolve => setImmediate(resolve))
  const remainingOrigins = activeListeningLoopbackOrigins()
  const baselineOrigins = new Set(report.network.bootstrapBaseline)
  report.cleanup.listenerReleased = [...remainingOrigins].every(origin => baselineOrigins.has(origin))
    && [...baselineOrigins].every(origin => remainingOrigins.has(origin))
  report.cleanup.remainingLoopbackOrigins = [...remainingOrigins]
  report.cleanup.ownerPid = process.pid
  report.cleanup.pidMatchesOwner = report.process.pid === process.pid
  try {
    assert.equal(path.dirname(runtimeRootResolved), path.resolve(reportDir))
    assertContained(reportDir, runtimeRootResolved, 'case-')
    report.cleanup.targetContained = true
  } catch (error) {
    report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
  }
  if (report.cleanup.facadeClosed && report.cleanup.listenerReleased && report.cleanup.targetContained) {
    try {
      await rm(runtimeRootResolved, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    } catch (error) {
      report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
    }
  } else report.cleanup.runtimePreservedOnCloseFailure = true
  if (fetchInstalled) globalThis.fetch = originalFetch
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
}

if (!report.cleanup.facadeClosed || !report.cleanup.listenerReleased || !report.cleanup.targetContained
  || !report.cleanup.runtimeRemoved || !report.cleanup.pidMatchesOwner) {
  process.exitCode = 1
}
