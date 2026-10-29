import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'workflow-presentation-protocol-'))

// Keep this disposable Core independent of any ambient Bridge/provider/host
// configuration. No provider action is submitted by this test.
for (const key of [
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LCOS_CODEX_AUTO_EXECUTION',
  'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT', 'HUABU_HOST_URL',
  'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

const report = {
  mode: 'exact Core Presentation protocol route with disposable Local Core',
  originalUserDatabaseOpened: false,
  externalBridgeOrProviderStarted: false,
  providerDispatchStarted: false,
  cases: [],
}

let repository
let coreServer
let coreOrigin
const forwardedRequests = []
const nativeFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = async (input, init) => {
  const address = input instanceof Request ? input.url : String(input)
  if (coreOrigin && address.startsWith(coreOrigin)) {
    forwardedRequests.push({ method: init?.method ?? (input instanceof Request ? input.method : 'GET'), url: new URL(address).pathname })
  }
  return nativeFetch(input, init)
}

async function coreCall(method, pathname, body) {
  const response = await nativeFetch(coreOrigin + pathname, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

function presentationContract(projectId, scopeId, id, description = '只验证已保存的方法定义，不表示执行') {
  return {
    schemaVersion: 0,
    id,
    projectId,
    scopeId,
    capability: 'workflow',
    renderer: 'workflow',
    state: {
      memberViewIds: [],
      hiddenViewIds: [],
      positions: {},
      hierarchy: { parentByViewId: {}, orderByParent: {} },
      presentationEdges: [],
      pinnedViewIds: [],
      emphasisByViewId: {},
      workflowActions: [{
        id: 'synthetic-review-step',
        label: '合成方法核对',
        description,
        attachedViewIds: [],
        x: 0,
        y: 0,
      }],
      workflowActionEdges: [],
    },
    version: 0,
    updatedBy: 'web',
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  }
}

try {
  const coreEntry = path.join(runtimeRoot, 'local-core-index.mjs')
  const routerEntry = path.join(runtimeRoot, 'core-protocol-router.mjs')
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreEntry)
  await buildPilotEntry('lab/pilot/core-protocol-router.ts', routerEntry)
  const [core, routerModule] = await Promise.all([
    import(pathToFileURL(coreEntry).href),
    import(pathToFileURL(routerEntry).href),
  ])

  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true })
  const projectRoot = path.join(runtimeRoot, 'synthetic-project')
  const baseSnapshot = core.createMvpSampleSnapshot(projectRoot)
  const projectId = String(baseSnapshot.project.id)
  const createdAt = new Date().toISOString()
  const rootScope = baseSnapshot.scopes.find(scope => scope.kind === 'root')
  assert.ok(rootScope, 'the disposable fixture has a canonical root scope')
  const workflowScopeId = 'scope-workflow-protocol-test'
  repository.save({
    ...baseSnapshot,
    scopes: [...baseSnapshot.scopes, {
      id: workflowScopeId,
      projectId: baseSnapshot.project.id,
      parentScopeId: rootScope.id,
      containerViewId: null,
      kind: 'workflow',
      name: '协议测试工作流',
      createdAt,
      updatedAt: createdAt,
    }],
  })

  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  coreOrigin = `http://${address.host}:${address.port}`

  const isRunOwned = runId => String(repository.getRun(runId)?.projectId ?? '') === projectId
  const isScopeOwned = scopeId => repository.getScopes(projectId).some(scope => String(scope.id) === scopeId)
  const router = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isRunOwned, isScopeOwned })
  const unconfiguredScopeRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isRunOwned })
  const call = (selectedRouter, method, pathname, body) => selectedRouter.handle({
    method,
    pathname: `/api/lcos/core${pathname}`,
    url: `${coreOrigin}/api/lcos/core${pathname}`,
    body,
  })

  const operations = router.operations
  for (const [id, method, route] of [
    ['presentation-read', 'GET', String.raw`^\/projects\/([^/]+)\/presentations\/([^/]+)$`],
    ['presentation-write', 'PUT', String.raw`^\/projects\/([^/]+)\/presentations\/([^/]+)$`],
    ['canvas-text-read', 'GET', String.raw`^\/projects\/([^/]+)\/curation\/canvas-text$`],
    ['canvas-text-write', 'PUT', String.raw`^\/projects\/([^/]+)\/curation\/canvas-text$`],
  ]) {
    assert.ok(operations.some(row => row.id === id && row.method === method && row.route === route), `${id} keeps the exact route`)
  }
  assert.ok(operations.some(row => row.id === 'assembly-apply' && row.method === 'POST'
    && row.route === String.raw`^\/projects\/([^/]+)\/assembly\/apply$`), 'Assembly apply registration is unchanged')
  assert.ok(operations.some(row => row.id === 'run-read' && row.method === 'GET'
    && row.route === String.raw`^\/runs\/([^/]+)\/(review|context-prompt|input-request|recipe)$`), 'Run recipe is only added to the existing owned read route')
  report.cases.push('translation registry adds exact nested Presentation GET/PUT and recipe read while retaining the existing CanvasText and Assembly route patterns')

  const presentationId = `presentation:workflow:${workflowScopeId}`
  const presentationPath = `/projects/${encodeURIComponent(projectId)}/presentations/${encodeURIComponent(presentationId)}`
  const firstInput = { contract: presentationContract(projectId, workflowScopeId, presentationId), expectedVersion: 0 }
  const firstSave = await call(router, 'PUT', presentationPath, firstInput)
  assert.equal(firstSave.status, 200, JSON.stringify(firstSave.body))
  assert.equal(firstSave.body.ok, true)
  assert.equal(firstSave.body.value.version, 0, 'the first save creates version zero')
  assert.equal(firstSave.body.value.projectId, projectId)
  assert.equal(firstSave.body.value.scopeId, workflowScopeId)
  assert.equal(firstSave.body.value.state.workflowActions[0].id, 'synthetic-review-step')

  const readPath = await call(router, 'GET', presentationPath)
  const readDirect = await coreCall('GET', presentationPath)
  assert.equal(readPath.status, 200)
  assert.deepEqual(readPath, readDirect, 'nested Presentation GET preserves the original Core status/envelope')
  assert.equal(readPath.body.value.id, presentationId)
  assert.equal(readPath.body.value.version, 0)

  // Core accepts expectedVersion 0 for the first write (version 0), then CAS
  // updates that current version to 1. Only a subsequent stale 0 conflicts.
  const secondInput = {
    contract: presentationContract(projectId, workflowScopeId, presentationId, '经 Core CAS 更新的方法定义'),
    expectedVersion: 0,
  }
  const secondSave = await call(router, 'PUT', presentationPath, secondInput)
  assert.equal(secondSave.status, 200, JSON.stringify(secondSave.body))
  assert.equal(secondSave.body.value.version, 1)
  const staleInput = {
    contract: presentationContract(projectId, workflowScopeId, presentationId, '这条旧 CAS 不得覆盖当前方法'),
    expectedVersion: 0,
  }
  const staleViaRouter = await call(router, 'PUT', presentationPath, staleInput)
  const staleDirect = await coreCall('PUT', presentationPath, staleInput)
  assert.equal(staleViaRouter.status, 409)
  assert.deepEqual(staleViaRouter, staleDirect, 'the original Core stale-version status and envelope are preserved')
  const afterStale = await call(router, 'GET', presentationPath)
  assert.equal(afterStale.body.value.version, 1)
  assert.equal(afterStale.body.value.state.workflowActions[0].description, '经 Core CAS 更新的方法定义')
  report.cases.push('real Presentation producer creates version 0, GET reads it back, CAS advances to 1, and an older expectedVersion returns the unchanged Core 409 without overwriting')

  const noForwardingCount = forwardedRequests.length
  const foreignProjectInput = {
    ...firstInput,
    contract: { ...firstInput.contract, projectId: 'foreign-project' },
  }
  const foreignProject = await call(router, 'PUT', presentationPath, foreignProjectInput)
  assert.equal(foreignProject.status, 400)
  assert.equal(foreignProject.body.error.code, 'PROJECT_ID_MISMATCH')
  const foreignScopeInput = {
    ...firstInput,
    contract: { ...firstInput.contract, scopeId: 'scope-owned-by-another-project' },
  }
  const foreignScope = await call(router, 'PUT', presentationPath, foreignScopeInput)
  assert.equal(foreignScope.status, 404)
  assert.equal(foreignScope.body.error.code, 'SCOPE_NOT_FOUND')
  const wrongRouteId = await call(router, 'PUT', presentationPath, {
    ...firstInput,
    contract: { ...firstInput.contract, id: 'presentation:workflow:wrong-route' },
  })
  assert.equal(wrongRouteId.status, 400)
  assert.equal(wrongRouteId.body.error.code, 'PRESENTATION_ID_MISMATCH')
  const mismatchedEnvelopeProject = await call(router, 'PUT', presentationPath, { ...firstInput, projectId: 'foreign-project' })
  assert.equal(mismatchedEnvelopeProject.status, 400)
  assert.equal(mismatchedEnvelopeProject.body.error.code, 'PROJECT_ID_MISMATCH')
  const missingScopeOwner = await call(unconfiguredScopeRouter, 'PUT', presentationPath, firstInput)
  assert.equal(missingScopeOwner.status, 503, 'missing ownership callback fails closed')
  assert.equal(missingScopeOwner.body.error.code, 'SCOPE_OWNERSHIP_UNAVAILABLE')
  assert.equal(forwardedRequests.length, noForwardingCount, 'foreign/mismatched identity requests are rejected before Core forwarding')
  assert.equal((await call(router, 'GET', `/projects/foreign-project/presentations/${encodeURIComponent(presentationId)}`)).status, 404)
  report.cases.push('foreign contract project, foreign scope, mismatched route id, legacy top-level project guard, and missing scope-owner callback fail closed before forwarding')

  // Existing text and Assembly registrations still relay their real Core
  // validation envelopes. Invalid reads/writes do not mutate any fixture.
  const canvasTextPath = `/projects/${encodeURIComponent(projectId)}/curation/canvas-text`
  const textViaRouter = await call(router, 'GET', canvasTextPath)
  const textDirect = await coreCall('GET', canvasTextPath)
  assert.equal(textViaRouter.status, textDirect.status)
  assert.deepEqual(textViaRouter.body, textDirect.body, 'CanvasText route retains the original Core validation response')
  const assemblyPath = `/projects/${encodeURIComponent(projectId)}/assembly/apply`
  const assemblyViaRouter = await call(router, 'POST', assemblyPath, {})
  const assemblyDirect = await coreCall('POST', assemblyPath, {})
  assert.equal(assemblyViaRouter.status, assemblyDirect.status)
  assert.deepEqual(assemblyViaRouter.body, assemblyDirect.body, 'Assembly route retains the original Core validation response')
  assert.notEqual(assemblyViaRouter.status, 200)
  report.cases.push('existing CanvasText and Assembly paths still relay their unchanged real-Core validation responses')

  // Probe the exact existing Core read handlers with an explicitly-owned but
  // absent synthetic Run identity. Core must return its own NOT_FOUND envelope;
  // no Run is created and no Runtime/Bridge/provider path is exercised.
  const probeRunId = 'synthetic-owned-route-probe'
  const probeRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId,
    isScopeOwned, isRunOwned: id => id === probeRunId })
  const recipePath = `/runs/${encodeURIComponent(probeRunId)}/recipe`
  const recipeViaRouter = await call(probeRouter, 'GET', recipePath)
  const recipeDirect = await coreCall('GET', recipePath)
  assert.equal(recipeViaRouter.status, 404)
  assert.deepEqual(recipeViaRouter, recipeDirect, 'RunRecipe route forwards the original Core not-found envelope after ownership passes')
  const reviewPath = `/runs/${encodeURIComponent(probeRunId)}/review`
  const reviewViaRouter = await call(probeRouter, 'GET', reviewPath)
  const reviewDirect = await coreCall('GET', reviewPath)
  assert.equal(reviewViaRouter.status, 404)
  assert.deepEqual(reviewViaRouter, reviewDirect, 'the existing Run Review route remains unchanged')
  const blockedRunReadsBefore = forwardedRequests.length
  const foreignRunRecipe = await call(router, 'GET', '/runs/foreign-run/recipe')
  assert.equal(foreignRunRecipe.status, 404, 'recipe uses the existing Run ownership callback')
  assert.equal(forwardedRequests.length, blockedRunReadsBefore, 'foreign Run recipe read is rejected before Core forwarding')
  assert.equal((await call(router, 'POST', `/runs/${encodeURIComponent(probeRunId)}/dispatch`, {})).status, 501,
    'the read-only recipe addition does not expose provider dispatch')
  assert.equal((await call(router, 'POST', `/projects/${encodeURIComponent(projectId)}/workflow/import`, {})).status, 501,
    'multipart workflow import remains unregistered')
  report.cases.push('owned synthetic Run identity reaches the real recipe/Review readers (Core not-found envelope preserved); foreign identity is blocked, with no Run creation, dispatch, or workflow import')

  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error.stack
  throw error
} finally {
  globalThis.fetch = nativeFetch
  await coreServer?.close()
  repository?.close()
  await rm(runtimeRoot, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
