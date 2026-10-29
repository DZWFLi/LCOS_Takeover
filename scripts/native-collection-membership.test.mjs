import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportDir = path.join(workspaceRoot, '.runtime', 'native-collection-membership')
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await mkdir(reportDir, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const publicOrigin = 'http://127.0.0.1:19876'

// This test owns one disposable Core. Do not inherit provider, database, or bridge endpoints.
for (const key of [
  'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN',
  'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID', 'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT',
  'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT', 'LOCAL_CORE_ENABLE_MVP_SAMPLE',
  'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS', 'LCOS_RECOVERY_TRANSPORT',
  'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL',
  'LCOS_OLLAMA_EMBED_MODEL', 'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY',
  'LCOS_PROJECTS_DIR', 'LCOS_INTELLIGENCE_PROVIDERS', 'LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION',
  'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'GEMINI_BASE_URL',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY', 'GROQ_BASE_URL',
  'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY', 'QWEN_BASE_URL',
  'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL', 'MOONSHOT_API_KEY',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL',
  'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL', 'QIANFAN_API_KEY', 'COHERE_BASE_URL', 'COHERE_API_KEY',
  'TOGETHER_BASE_URL', 'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL', 'FIREWORKS_API_KEY',
  'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION', 'LMSTUDIO_BASE_URL',
]) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const reservedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let coreOrigin
let facade
let repository
let projectId
let coreBootstrapInProgress = false
const coreOrigins = new Set()
const report = {
  at: new Date().toISOString(),
  mode: 'adopted current Gen2 Core + facade.handle + real temporary Core HTTP Collection producers',
  fixtureKind: 'fresh fullIntegration SQLite/Core runtime; Collection fixtures created by original Core route',
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  browserStarted: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  collectionEntityCreateRenameDeleteExposedByProxy: false,
  runtimeRoot,
  reportPath,
  network: { allowedCoreRequests: [], blocked: [], activeCoreOrigins: [], pinnedEndpointRejected: [] },
  cases: [],
  failure: undefined,
  cleanup: { targetContained: false, facadeClosed: false, listenerReleased: false, runtimeRemoved: false },
}

function activeLoopbackOrigins() {
  const origins = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !['127.0.0.1', '::1'].includes(address.address)
      || !Number.isInteger(address.port)) continue
    const host = address.address.includes(':') ? `[${address.address}]` : address.address
    origins.add(`http://${host}:${address.port}`)
  }
  return origins
}

function assertContained(parent, target, requiredPrefix) {
  const resolvedParent = path.resolve(parent)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget
    || !path.basename(resolvedTarget).startsWith(requiredPrefix)) {
    throw new Error(`Refusing to use or clean a path outside this test-owned root: ${resolvedTarget}`)
  }
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.pinnedEndpointRejected.push({ method, origin: url.origin, path: url.pathname })
      throw new Error('Pinned dead Ollama endpoint is rejected without network access.')
    }
    const active = activeLoopbackOrigins()
    const bootstrapping = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registered = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !reservedPorts.has(url.port) && (bootstrapping || registered)) {
      const response = await originalFetch(input, init)
      let requestBody
      if (typeof init?.body === 'string') {
        try { requestBody = JSON.parse(init.body) } catch { requestBody = undefined }
      }
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname,
        status: response.status, ...(requestBody === undefined ? {} : { requestBody }) })
      return response
    }
    report.network.blocked.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('This test permits only this process\'s active temporary Core listener.')
  }
}

function beginCoreBootstrap() {
  const active = activeLoopbackOrigins()
  assert.equal(active.size, 0, 'No pre-existing loopback listener may be present before Core bootstrap.')
  coreBootstrapInProgress = true
}

function registerCoreOrigin(origin) {
  const active = activeLoopbackOrigins()
  assert.ok(active.has(origin), 'Facade must return its live Core listener origin.')
  assert.equal(active.size, 1, 'Only the isolated Core listener may be active.')
  assert.equal(reservedPorts.has(new URL(origin).port), false, 'Core must use an ephemeral non-user port.')
  coreOrigin = origin
  coreOrigins.add(origin)
  report.network.activeCoreOrigins.push(origin)
  coreBootstrapInProgress = false
}

async function callFacade(method, pathname, body) {
  const result = await facade.handle({ method, pathname, url: publicOrigin + pathname,
    ...(body === undefined ? {} : { body }) })
  assert.ok(result != null, `${method} ${pathname} must be handled by the facade.`)
  return result
}

async function callCore(method, pathname, body) {
  const response = await fetch(new URL(pathname, coreOrigin), {
    method, headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

function assertStatus(result, status, code, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`)
  if (code !== undefined) assert.equal(result.body?.error?.code, code, `${label}: exact error code`)
  return result.body
}

function membersOf(collectionId) {
  return repository.listCollectionMemberships(projectId, collectionId)
    .map((row) => ({ type: row.memberRef.type, id: row.memberRef.id, relationId: String(row.relationId) }))
}

async function createFixtureCollection(ownerProjectId, title) {
  const result = await callCore('POST', `/projects/${encodeURIComponent(ownerProjectId)}/collections`, { title })
  assert.equal(result.status, 201, `Original Core Collection fixture producer: ${JSON.stringify(result.body)}`)
  return String(result.body.value.id)
}

test('facade forwards only exact owned Collection member add/remove DTOs to original Core', async () => {
  try {
    const facadeEntry = path.join(runtimeRoot, 'surface-core-facade.mjs')
    const ownersEntry = path.join(runtimeRoot, 'current-gen2-test-owners.mjs')
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
    const manifest = JSON.parse(await readFile(`${facadeEntry}.sources.json`, 'utf8'))
    assert.equal(manifest.currentRoot, currentGen2Root)
    const adopted = new Set((manifest.resources ?? []).map((item) => item.resourcePath))
    for (const required of ['apps/local-core/src/metadata-repository.ts', 'apps/local-core/src/assembly-apply-service.ts']) {
      assert.ok(adopted.has(required), `facade bundle must use current canonical owner ${required}`)
    }
    assert.equal(typeof ownerModule.createTextArtifact, 'function')
    report.currentCoreResources = [...adopted].sort()
    report.cases.push('runtime bundle uses current metadata repository and AssemblyApply Service; Collection membership remains a typed Core relation')

    installFetchBoundary()
    beginCoreBootstrap()
    facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
    repository = facade.core.repository
    projectId = String(facade.core.projectId)
    registerCoreOrigin(String(facade.core.origin))
    assert.ok(isWithin(runtimeRoot, repository.getProject(projectId)?.rootPath ?? ''),
      'the fresh Core project root must stay inside the test-owned runtime')

    const registry = await callFacade('GET', '/api/lcos/translation')
    assert.equal(registry.body.data.fullScopeComplete, false)
    const operations = registry.body.data.operations
    assert.ok(operations.some((row) => row.id === 'collection-member-add' && row.method === 'POST' && row.uiVerified === false))
    assert.ok(operations.some((row) => row.id === 'collection-member-remove' && row.method === 'DELETE' && row.uiVerified === false))

    const networkBeforeClosedRoutes = report.network.allowedCoreRequests.length
    assertStatus(await callFacade('POST', `/api/lcos/core/projects/${projectId}/collections`, { title: 'not exposed' }),
      501, 'CORE_OPERATION_NOT_CONNECTED', 'Collection creation stays closed')
    assertStatus(await callFacade('POST', `/api/lcos/core/entities/collection/example/title`, { title: 'not exposed' }),
      501, 'CORE_OPERATION_NOT_CONNECTED', 'Collection rename stays closed')
    assertStatus(await callFacade('DELETE', `/api/lcos/core/projects/${projectId}/collections/example`),
      501, 'CORE_OPERATION_NOT_CONNECTED', 'Collection entity deletion stays closed')
    assert.equal(report.network.allowedCoreRequests.length, networkBeforeClosedRoutes,
      'unimplemented identity routes must not reach Core')
    report.collectionEntityCreateRenameDeleteExposedByProxy = false
    report.cases.push('Collection create, rename, and entity delete remain unregistered; only existing membership writers are connected')

    const collectionId = await createFixtureCollection(projectId, 'Membership route fixture')
    const secondCollectionId = await createFixtureCollection(projectId, 'Cycle route fixture A')
    const thirdCollectionId = await createFixtureCollection(projectId, 'Cycle route fixture B')
    const rootScopeId = String(repository.getScopes(projectId).find((scope) => scope.kind === 'root')?.id ?? '')
    assert.ok(rootScopeId)
    const projectArtifact = repository.get(projectId)?.artifacts?.[0]
    assert.ok(projectArtifact, 'Fresh fullIntegration must contain a real project Artifact fixture.')
    const localMember = { memberType: 'artifact', memberId: String(projectArtifact.id) }

    const coreRoute = (collection, suffix = '/members') => `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collection)}${suffix}`
    let beforeValidation = report.network.allowedCoreRequests.length
    for (const [label, body] of [
      ['missing body', undefined],
      ['view identity is not a canonical member type', { memberType: 'artifactView', memberId: 'view-not-member' }],
      ['empty member id', { memberType: 'artifact', memberId: '  ' }],
      ['non-string member id', { memberType: 'artifact', memberId: 7 }],
      ['extra body field', { memberType: 'artifact', memberId: String(projectArtifact.id), origin: { operationId: 'not part of this DTO' } }],
    ]) assertStatus(await callFacade('POST', coreRoute(collectionId), body), 400, 'INVALID_ARGUMENT', label)
    assert.equal(report.network.allowedCoreRequests.length, beforeValidation, 'malformed member DTOs must stop before Core HTTP')

    const missingOwnerRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId })
    const ownerless = await missingOwnerRouter.handle({ method: 'POST', pathname: coreRoute(collectionId),
      url: publicOrigin + coreRoute(collectionId), body: localMember })
    assertStatus(ownerless, 503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'missing exact Collection owner')
    const throwingOwnerRouter = routerModule.createCoreProtocolRouter({ coreOrigin, projectId,
      isCollectionOwned: () => { throw new Error('fixture ownership failure') } })
    const ownerFailure = await throwingOwnerRouter.handle({ method: 'DELETE', pathname: coreRoute(collectionId),
      url: publicOrigin + coreRoute(collectionId), body: localMember })
    assertStatus(ownerFailure, 503, 'COLLECTION_OWNERSHIP_UNAVAILABLE', 'throwing exact Collection owner')
    assert.equal(report.network.allowedCoreRequests.length, beforeValidation, 'missing or failed ownership checks must not forward')
    report.cases.push('exact two-field member DTO, allowed canonical types, and mandatory Collection ownership fail closed before forwarding')

    const foreignRoot = path.join(runtimeRoot, 'foreign-project-root')
    await mkdir(foreignRoot, { recursive: true })
    const foreignProjectId = 'collection-membership-foreign-project'
    repository.createProject({ id: foreignProjectId, name: 'Foreign collection test project', rootPath: foreignRoot })
    const foreignCollectionId = await createFixtureCollection(foreignProjectId, 'Foreign Collection')
    const foreignScope = repository.getScopes(foreignProjectId).find((scope) => scope.kind === 'root')
    assert.ok(foreignScope)
    const foreignArtifact = await ownerModule.createTextArtifact(repository, foreignProjectId, {
      title: 'Foreign member fixture', body: 'isolated foreign fixture', scopeId: String(foreignScope.id),
    })

    beforeValidation = report.network.allowedCoreRequests.length
    assertStatus(await callFacade('POST', coreRoute(foreignCollectionId), localMember), 404, 'COLLECTION_NOT_FOUND', 'foreign Collection owner')
    assertStatus(await callFacade('POST', `/api/lcos/core/projects/${encodeURIComponent(foreignProjectId)}/collections/${encodeURIComponent(foreignCollectionId)}/members`, localMember),
      404, 'PROJECT_NOT_FOUND', 'foreign route project')
    assert.equal(report.network.allowedCoreRequests.length, beforeValidation, 'foreign Collection/project must not reach Core through the proxy')

    const initial = membersOf(collectionId)
    const baselineMutationSets = repository.listMutationChangeSets(projectId).length
    const addBody = { ...localMember }
    const firstAdd = await callFacade('POST', coreRoute(collectionId), addBody)
    assertStatus(firstAdd, 200, undefined, 'Core Collection add receipt')
    assert.equal(firstAdd.body.value.status, 'applied')
    assert.equal(firstAdd.body.value.collectionId, collectionId)
    assert.deepEqual(firstAdd.body.value.memberRef, { type: 'artifact', id: localMember.memberId })
    assert.ok(firstAdd.body.value.changeSetId)
    assert.equal(membersOf(collectionId).length, initial.length + 1)
    assert.equal(repository.listMutationChangeSets(projectId).length, baselineMutationSets + 1)
    const repeatAdd = await callFacade('POST', coreRoute(collectionId), addBody)
    assertStatus(repeatAdd, 200, undefined, 'Core idempotent add receipt')
    assert.equal(repeatAdd.body.value.status, 'already-member')
    assert.equal(membersOf(collectionId).length, initial.length + 1)
    assert.equal(repository.listMutationChangeSets(projectId).length, baselineMutationSets + 1,
      'already-member is returned by Core without a second membership ChangeSet')
    const readback = await callFacade('GET', coreRoute(collectionId))
    assert.equal(readback.status, 200)
    assert.equal(readback.body.value.collection.id, collectionId)
    assert.ok(readback.body.value.members.some((row) => row.memberRef.type === 'artifact' && row.memberRef.id === localMember.memberId))
    report.cases.push('valid add and duplicate add return original Core applied/already-member receipts; GET reads the one durable member')

    const foreignMemberBody = { memberType: 'artifact', memberId: foreignArtifact.artifactId }
    const beforeForeignMember = report.network.allowedCoreRequests.length
    const foreignMemberResult = await callFacade('POST', coreRoute(collectionId), foreignMemberBody)
    assertStatus(foreignMemberResult, 422, 'VALIDATION', 'Core rejects foreign canonical member')
    assert.equal(report.network.allowedCoreRequests.length, beforeForeignMember + 1,
      'valid typed foreign member is forwarded to Core, where canonical project ownership remains authoritative')
    assert.deepEqual(membersOf(collectionId).map((row) => row.id), [localMember.memberId])

    const scopeAsCollection = await callFacade('POST', coreRoute(collectionId), { memberType: 'collection', memberId: rootScopeId })
    assertStatus(scopeAsCollection, 422, 'VALIDATION', 'a Scope id cannot masquerade as a Collection id')
    assert.deepEqual(membersOf(collectionId).map((row) => row.id), [localMember.memberId])
    report.cases.push('Core rejects foreign Artifact membership and a Scope id falsely typed as Collection; proxy never maps Scope/Collection identity')

    const removeBody = { ...localMember }
    const removed = await callFacade('DELETE', coreRoute(collectionId), removeBody)
    assertStatus(removed, 200, undefined, 'Core Collection removal receipt')
    assert.equal(removed.body.value.status, 'removed')
    assert.equal(removed.body.value.collectionId, collectionId)
    assert.deepEqual(removed.body.value.memberRef, { type: 'artifact', id: localMember.memberId })
    assert.equal(membersOf(collectionId).length, initial.length)
    const repeatRemove = await callFacade('DELETE', coreRoute(collectionId), removeBody)
    assertStatus(repeatRemove, 200, undefined, 'Core idempotent remove receipt')
    assert.equal(repeatRemove.body.value.status, 'not-member')
    assert.equal(membersOf(collectionId).length, initial.length)
    report.cases.push('remove changes only the exact membership; repeated remove is the Core not-member receipt')

    const addNestedCollection = await callFacade('POST', coreRoute(secondCollectionId), {
      memberType: 'collection', memberId: thirdCollectionId,
    })
    assertStatus(addNestedCollection, 200, undefined, 'Core Collection nesting first edge')
    assert.equal(addNestedCollection.body.value.status, 'applied')
    const cycleAttempt = await callFacade('POST', coreRoute(thirdCollectionId), {
      memberType: 'collection', memberId: secondCollectionId,
    })
    assertStatus(cycleAttempt, 422, 'VALIDATION', 'Core preserves nesting cycle guard')
    assert.equal(membersOf(thirdCollectionId).length, 0)
    const removeNestedCollection = await callFacade('DELETE', coreRoute(secondCollectionId), {
      memberType: 'collection', memberId: thirdCollectionId,
    })
    assert.equal(removeNestedCollection.body.value.status, 'removed')
    assert.equal(membersOf(secondCollectionId).length, 0)
    report.cases.push('Collection nesting uses original Core membership and cycle validation; cycle rejection leaves membership unchanged')

    const coreMemberRequests = report.network.allowedCoreRequests.filter((request) =>
      (request.method === 'POST' || request.method === 'DELETE')
      && /\/projects\/[^/]+\/collections\/[^/]+\/members$/.test(request.path))
    const expectedMemberRequests = [
      ['POST', collectionId, addBody], ['POST', collectionId, addBody],
      ['POST', collectionId, foreignMemberBody], ['POST', collectionId, { memberType: 'collection', memberId: rootScopeId }],
      ['DELETE', collectionId, removeBody], ['DELETE', collectionId, removeBody],
      ['POST', secondCollectionId, { memberType: 'collection', memberId: thirdCollectionId }],
      ['POST', thirdCollectionId, { memberType: 'collection', memberId: secondCollectionId }],
      ['DELETE', secondCollectionId, { memberType: 'collection', memberId: thirdCollectionId }],
    ]
    assert.equal(coreMemberRequests.length, expectedMemberRequests.length)
    assert.deepEqual(coreMemberRequests.map(request => [request.method,
      decodeURIComponent(request.path.split('/').at(-2)), request.requestBody]), expectedMemberRequests,
    'proxy forwards original memberType/memberId DTOs unchanged and never forwards malformed or foreign-Collection requests')
    assert.equal(report.network.blocked.length, 0)
    assert.ok(report.network.allowedCoreRequests.every((request) => request.origin === coreOrigin))
    assert.ok(report.network.pinnedEndpointRejected.every((request) => request.origin === 'http://127.0.0.1:1'),
      'any Core background embedding probe must remain pinned to the dead endpoint and never reach a provider')
    assert.deepEqual(report.network.activeCoreOrigins, [coreOrigin])
    report.summary = { projectId, collectionId, foreignCollectionId, localMemberId: localMember.memberId,
      firstAddStatus: firstAdd.body.value.status, duplicateAddStatus: repeatAdd.body.value.status,
      removeStatus: removed.body.value.status, repeatRemoveStatus: repeatRemove.body.value.status,
      cycleStatus: cycleAttempt.status, forwardedMemberWriteCount: coreMemberRequests.length,
      currentCoreRoot: currentGen2Root }
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
  const remaining = activeLoopbackOrigins()
  report.cleanup.listenerReleased = remaining.size === 0
  report.cleanup.remainingLoopbackOrigins = [...remaining]
  try {
    assertContained(reportDir, runtimeRoot, 'case-')
    report.cleanup.targetContained = true
    if (report.cleanup.facadeClosed && report.cleanup.listenerReleased) {
      await rm(runtimeRoot, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    }
  } catch (error) {
    report.cleanup.cleanupError = error instanceof Error ? error.message : String(error)
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
})
