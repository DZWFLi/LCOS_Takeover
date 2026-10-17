import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeBase = path.join(root, '.runtime')
await mkdir(runtimeBase, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeBase, 'native-result-slot-protocol-'))

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
  mode: 'exact ResultSlot/execution-projection routes over disposable Local Core',
  fixtureKind: 'synthetic Core snapshots + original ResultSlotService producer; no raw SQL',
  originalUserDatabaseOpened: false,
  liveCoreTouched: false,
  providerOrBridgeStarted: false,
  cleanupTargetContainedInRuntime: false,
  forwardedRequests: [],
  cases: [],
}

let repository
let coreServer
let coreOrigin
const nativeFetch = globalThis.fetch.bind(globalThis)
const forwarded = []
globalThis.fetch = async (input, init) => {
  const address = input instanceof Request ? input.url : String(input)
  const response = await nativeFetch(input, init)
  if (coreOrigin && address.startsWith(coreOrigin)) {
    const responseText = await response.clone().text()
    forwarded.push({
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      pathname: new URL(address).pathname,
      requestBody: typeof init?.body === 'string' ? init.body : undefined,
      status: response.status,
      responseText,
    })
  }
  return response
}

async function directCore(method, pathname, body) {
  const response = await nativeFetch(coreOrigin + pathname, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

function assertForwardedEnvelope(result, method, pathname, body) {
  const receipt = forwarded.at(-1)
  assert.ok(receipt, `expected Core forwarding for ${method} ${pathname}`)
  assert.equal(receipt.method, method)
  assert.equal(receipt.pathname, pathname)
  if (body === undefined) assert.equal(receipt.requestBody, undefined)
  else assert.equal(receipt.requestBody, JSON.stringify(body), 'Core receives the original DTO without translation')
  assert.equal(result.status, receipt.status, 'the original Core status is preserved')
  assert.deepEqual(result.body, JSON.parse(receipt.responseText), 'the original Core envelope is preserved')
  assert.equal(JSON.stringify(result.body), receipt.responseText, 'the JSON envelope bytes are not remapped')
  return JSON.parse(receipt.responseText)
}

function routerCall(router, method, pathname, body) {
  return router.handle({
    method,
    pathname: `/api/lcos/core${pathname}`,
    url: `http://127.0.0.1/api/lcos/core${pathname}`,
    body,
  })
}

function assertNoForward(before, message) {
  assert.equal(forwarded.length, before, message)
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
  const snapshot = core.createMvpSampleSnapshot(projectRoot, '2026-10-14T00:00:00.000Z')
  repository.save(snapshot)
  const projectId = String(snapshot.project.id)
  const rootScope = repository.getScopes(projectId).find(scope => scope.kind === 'root')
  assert.ok(rootScope)
  const workspace = repository.getWorkspaces(projectId).find(candidate => String(candidate.scopeId) === String(rootScope.id))
  assert.ok(workspace)

  const foreignProjectId = 'disposable-result-slot-foreign-project'
  const foreignProjectRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignProjectRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign project', rootPath: foreignProjectRoot })
  const foreignScope = repository.getScopes(foreignProjectId).find(scope => scope.kind === 'root')
  const foreignWorkspace = repository.getWorkspaces(foreignProjectId)[0]
  assert.ok(foreignScope)
  assert.ok(foreignWorkspace)

  coreServer = core.createLocalCoreServer({
    metadataRepository: repository,
    port: 0,
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'),
    agentletsRoot: path.join(runtimeRoot, 'agentlets'),
    allowedOrigins: [],
  })
  const address = await coreServer.start()
  coreOrigin = `http://${address.host}:${address.port}`

  const foreignSlotPathForCreate = `/projects/${encodeURIComponent(foreignProjectId)}/result-slots`
  const foreignSlotCreated = await directCore('POST', foreignSlotPathForCreate, {
    scopeId: String(foreignScope.id),
    workspaceId: String(foreignWorkspace.id),
    x: 5,
    y: 7,
  })
  assert.equal(foreignSlotCreated.status, 201, JSON.stringify(foreignSlotCreated.body))
  const foreignSlot = foreignSlotCreated.body.value

  const isScopeOwned = scopeId => repository.getScopes(projectId).some(scope => String(scope.id) === scopeId)
  const isWorkspaceScopeOwned = (workspaceId, scopeId) => {
    const ownedWorkspace = repository.getWorkspace(workspaceId)
    return String(ownedWorkspace?.projectId ?? '') === projectId
      && String(ownedWorkspace?.scopeId ?? '') === scopeId
      && isScopeOwned(scopeId)
  }
  const isResultSlotOwned = slotId => String(repository.getResultSlot(slotId)?.projectId ?? '') === projectId
  const router = routerModule.createCoreProtocolRouter({
    coreOrigin,
    projectId,
    isScopeOwned,
    isWorkspaceScopeOwned,
    isResultSlotOwned,
  })

  const slotBody = {
    scopeId: String(rootScope.id),
    workspaceId: String(workspace.id),
    x: 17,
    y: 29,
    width: 248,
    height: 180,
  }
  const resultSlotsPath = `/projects/${encodeURIComponent(projectId)}/result-slots`
  const created = await routerCall(router, 'POST', resultSlotsPath, slotBody)
  const createdEnvelope = assertForwardedEnvelope(created, 'POST', resultSlotsPath, slotBody)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const slotId = String(createdEnvelope.value.id)
  assert.equal(createdEnvelope.value.projectId, projectId)
  assert.equal(createdEnvelope.value.scopeId, String(rootScope.id))
  assert.equal(createdEnvelope.value.workspaceId, String(workspace.id))
  assert.deepEqual(createdEnvelope.value.position, { x: 17, y: 29 })
  assert.deepEqual(createdEnvelope.value.size, { width: 248, height: 180 })
  assert.equal(createdEnvelope.value.status, 'empty')
  report.cases.push('POST /projects/:id/result-slots calls the original producer with its exact DTO and returns its exact status/envelope')

  const list = await routerCall(router, 'GET', resultSlotsPath)
  const listEnvelope = assertForwardedEnvelope(list, 'GET', resultSlotsPath)
  assert.equal(list.status, 200)
  assert.ok(listEnvelope.value.some(slot => slot.id === slotId))
  report.cases.push('GET /projects/:id/result-slots returns the original same-project Core list envelope')

  const slotReadPath = `/result-slots/${encodeURIComponent(slotId)}`
  const read = await routerCall(router, 'GET', slotReadPath)
  const readEnvelope = assertForwardedEnvelope(read, 'GET', slotReadPath)
  assert.equal(read.status, 200)
  assert.equal(readEnvelope.value.id, slotId)
  report.cases.push('GET /result-slots/:id is forwarded only after exact slot ownership and preserves the Core envelope')

  const executionPath = `/projects/${encodeURIComponent(projectId)}/execution-projection`
  const execution = await routerCall(router, 'GET', executionPath)
  const executionEnvelope = assertForwardedEnvelope(execution, 'GET', executionPath)
  assert.equal(execution.status, 200)
  assert.equal(executionEnvelope.value.projectId, projectId)
  assert.ok(executionEnvelope.value.resultSlots.some(slot => slot.id === slotId))
  report.cases.push('GET /projects/:id/execution-projection returns the actual Core Run/ResultSlot projection')

  const malformedBefore = forwarded.length
  const malformedBody = { scopeId: String(rootScope.id), x: 'not-a-number', y: 1 }
  const malformed = await routerCall(router, 'POST', resultSlotsPath, malformedBody)
  const malformedEnvelope = assertForwardedEnvelope(malformed, 'POST', resultSlotsPath, malformedBody)
  assert.equal(malformed.status, 400)
  assert.equal(malformedEnvelope.error.code, 'INVALID_ARGUMENT')
  assert.equal(repository.listResultSlots(projectId).length, 1)
  assert.equal(forwarded.length, malformedBefore + 1)
  report.cases.push('malformed ResultSlot DTO keeps Core INVALID_ARGUMENT behavior and creates no slot')

  const initialSlotCount = repository.listResultSlots(projectId).length
  const deniedCases = []
  let before = forwarded.length
  let denied = await routerCall(router, 'POST', resultSlotsPath, { ...slotBody, scopeId: String(foreignScope.id), workspaceId: undefined })
  assert.equal(denied.status, 404)
  assert.equal(denied.body.error.code, 'SCOPE_NOT_FOUND')
  assertNoForward(before, 'foreign scope must be rejected before Core forwarding')
  deniedCases.push('foreign project scope')

  before = forwarded.length
  denied = await routerCall(router, 'POST', resultSlotsPath, { ...slotBody, workspaceId: String(foreignWorkspace.id) })
  assert.equal(denied.status, 404)
  assert.equal(denied.body.error.code, 'WORKSPACE_SCOPE_NOT_FOUND')
  assertNoForward(before, 'foreign workspace/scope pair must be rejected before Core forwarding')
  deniedCases.push('foreign workspace/scope pair')

  const noScopeOwner = routerModule.createCoreProtocolRouter({ coreOrigin, projectId })
  before = forwarded.length
  denied = await routerCall(noScopeOwner, 'POST', resultSlotsPath, slotBody)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'SCOPE_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'missing scope owner must be rejected before Core forwarding')
  deniedCases.push('missing scope owner')

  const throwingScopeOwner = routerModule.createCoreProtocolRouter({
    coreOrigin,
    projectId,
    isScopeOwned: () => { throw new Error('synthetic scope lookup failure') },
  })
  before = forwarded.length
  denied = await routerCall(throwingScopeOwner, 'POST', resultSlotsPath, slotBody)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'SCOPE_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'failed scope owner must be rejected before Core forwarding')
  deniedCases.push('throwing scope owner')

  const noWorkspaceOwner = routerModule.createCoreProtocolRouter({ coreOrigin, projectId, isScopeOwned })
  before = forwarded.length
  denied = await routerCall(noWorkspaceOwner, 'POST', resultSlotsPath, slotBody)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'WORKSPACE_SCOPE_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'missing workspace/scope owner must be rejected before Core forwarding')
  deniedCases.push('missing workspace/scope owner')

  const throwingWorkspaceOwner = routerModule.createCoreProtocolRouter({
    coreOrigin,
    projectId,
    isScopeOwned,
    isWorkspaceScopeOwned: () => { throw new Error('synthetic workspace lookup failure') },
  })
  before = forwarded.length
  denied = await routerCall(throwingWorkspaceOwner, 'POST', resultSlotsPath, slotBody)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'WORKSPACE_SCOPE_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'failed workspace/scope owner must be rejected before Core forwarding')
  deniedCases.push('throwing workspace/scope owner')

  const unknownSlotPath = '/result-slots/unknown-synthetic-slot'
  before = forwarded.length
  denied = await routerCall(router, 'GET', unknownSlotPath)
  assert.equal(denied.status, 404)
  assert.equal(denied.body.error.code, 'RESULT_SLOT_NOT_FOUND')
  assertNoForward(before, 'unknown slot must be rejected before Core forwarding')
  deniedCases.push('unknown slot')

  const foreignSlotPath = `/result-slots/${encodeURIComponent(String(foreignSlot.id))}`
  before = forwarded.length
  denied = await routerCall(router, 'GET', foreignSlotPath)
  assert.equal(denied.status, 404)
  assert.equal(denied.body.error.code, 'RESULT_SLOT_NOT_FOUND')
  assertNoForward(before, 'foreign slot must be rejected before Core forwarding')
  deniedCases.push('foreign slot')

  const noSlotOwner = routerModule.createCoreProtocolRouter({ coreOrigin, projectId })
  before = forwarded.length
  denied = await routerCall(noSlotOwner, 'GET', slotReadPath)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'RESULT_SLOT_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'missing slot owner must be rejected before Core forwarding')
  deniedCases.push('missing slot owner')

  const throwingSlotOwner = routerModule.createCoreProtocolRouter({
    coreOrigin,
    projectId,
    isResultSlotOwned: () => { throw new Error('synthetic slot lookup failure') },
  })
  before = forwarded.length
  denied = await routerCall(throwingSlotOwner, 'GET', slotReadPath)
  assert.equal(denied.status, 503)
  assert.equal(denied.body.error.code, 'RESULT_SLOT_OWNERSHIP_UNAVAILABLE')
  assertNoForward(before, 'failed slot owner must be rejected before Core forwarding')
  deniedCases.push('throwing slot owner')

  before = forwarded.length
  denied = await routerCall(router, 'GET', `/projects/${encodeURIComponent(foreignProjectId)}/result-slots`)
  assert.equal(denied.status, 404)
  assert.equal(denied.body.error.code, 'PROJECT_NOT_FOUND')
  assertNoForward(before, 'foreign project listing must be rejected before Core forwarding')
  deniedCases.push('foreign project list')

  before = forwarded.length
  denied = await routerCall(router, 'DELETE', slotReadPath)
  assert.equal(denied.status, 501)
  assert.equal(denied.body.error.code, 'CORE_OPERATION_NOT_CONNECTED')
  assertNoForward(before, 'ResultSlot DELETE remains unregistered')
  deniedCases.push('delete remains unregistered')

  before = forwarded.length
  denied = await routerCall(router, 'POST', `/projects/${encodeURIComponent(projectId)}/spatial/result-slots/${encodeURIComponent(slotId)}/materialize`, {
    canvasId: 'synthetic-canvas',
    spatialId: 'synthetic-node',
  })
  assert.equal(denied.status, 501)
  assert.equal(denied.body.error.code, 'CORE_OPERATION_NOT_CONNECTED')
  assertNoForward(before, 'spatial binding writes remain unregistered')
  deniedCases.push('spatial writes remain unregistered')

  assert.equal(repository.listResultSlots(projectId).length, initialSlotCount,
    'all owner-denied requests leave project ResultSlots unchanged')
  report.cases.push(`fail-closed before forwarding: ${deniedCases.join(', ')}`)
  report.forwardedRequests = forwarded.map(({ method, pathname }) => ({ method, pathname }))
  report.passed = true
} catch (error) {
  report.passed = false
  report.failure = error instanceof Error ? error.stack : String(error)
  throw error
} finally {
  globalThis.fetch = nativeFetch
  await coreServer?.close()
  repository?.close()
  const runtimeRootResolved = path.resolve(runtimeRoot)
  const runtimeBaseResolved = path.resolve(runtimeBase)
  if (path.dirname(runtimeRootResolved) !== runtimeBaseResolved
    || !path.basename(runtimeRootResolved).startsWith('native-result-slot-protocol-')) {
    throw new Error('Disposable cleanup target escaped the intended .runtime directory; preserved.')
  }
  report.cleanupTargetContainedInRuntime = true
  await rm(runtimeRootResolved, { recursive: true, force: true })
}

console.log(JSON.stringify(report, null, 2))
