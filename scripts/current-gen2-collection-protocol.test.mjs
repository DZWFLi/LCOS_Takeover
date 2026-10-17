import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
const reportDir = path.join(runtimeParent, 'current-gen2-collection-protocol')
await mkdir(reportDir, { recursive: true })
const reportPath = path.join(reportDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportDir, 'case-'))
const runtimeRootResolved = path.resolve(runtimeRoot)
const publicOrigin = 'http://127.0.0.1:19879'
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
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const report = {
  at: new Date().toISOString(),
  reportPath,
  mode: 'original Core Collection HTTP producer + isolated facade read-only GET protocol',
  fixtureKind: 'fresh fullIntegration facade, Core HTTP-created Collections, same-process loopback only',
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
let coreOrigin
let facade
let repository
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
      throw new Error('The Collection protocol test rejects its pinned dead Ollama origin without networking.')
    }
    const active = activeListeningLoopbackOrigins()
    const bootstrapCore = coreBootstrapInProgress && active.size === 1 && active.has(url.origin)
    const registeredCore = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && (bootstrapCore || registeredCore)) {
      const response = await originalFetch(input, init)
      let requestBody
      if (typeof init?.body === 'string') {
        try { requestBody = JSON.parse(init.body) } catch { /* keep non-JSON input opaque */ }
      }
      report.network.allowedCoreRequests.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname,
        status: response.status, ...(requestBody === undefined ? {} : { requestBody }) })
      return response
    }
    report.network.blocked.push({ method: method.toUpperCase(), origin: url.origin, path: url.pathname })
    throw new Error('The Collection protocol test permits only its active temporary Core listener.')
  }
}

function assertStatus(result, status, code, label) {
  assert.equal(result?.status, status, `${label}: ${JSON.stringify(result?.body)}`)
  if (code !== undefined) assert.equal(result.body?.error?.code, code, `${label}: exact error code`)
  return result.body
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

async function facadeRequest(method, pathname, body) {
  report.facadeRequests.push({ method, path: pathname })
  const result = await facade.handle({ method, pathname, url: `${publicOrigin}${pathname}`,
    ...(body === undefined ? {} : { body }) })
  assert.ok(result !== null && result !== undefined, `${method} ${pathname} must be handled by the facade`)
  return result
}

function projectCollectionTruth() {
  return {
    collections: repository.listCollections(projectId),
    memberships: repository.listCollectionMemberships(projectId),
  }
}

async function main() {
  const facadeBundle = path.join(runtimeRoot, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', facadeBundle)
  const facadeModule = await import(pathToFileURL(facadeBundle).href)
  assert.equal(typeof facadeModule.startSurfaceCoreFacade, 'function')

  const baseline = activeListeningLoopbackOrigins()
  report.network.bootstrapBaseline = [...baseline]
  assert.equal(baseline.size, 0, 'the standalone test process must start without another loopback listener')
  installFetchBoundary()
  coreBootstrapInProgress = true
  facade = await facadeModule.startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration: true })
  report.process.facadeStartedInThisProcess = true
  repository = facade.core.repository
  projectId = String(facade.core.projectId)
  const initialRunCount = repository.getProjectRuns(projectId, 200).length
  assert.equal(initialRunCount, 0, 'the isolated Core protocol fixture must start without Runs')
  coreOrigin = String(facade.core.origin)
  const active = activeListeningLoopbackOrigins()
  assert.ok(active.has(coreOrigin), 'facade must report the live Core listener owned by this PID')
  assert.equal(active.size, 1, 'only this temporary Core listener may be active')
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'Core must use a random ephemeral loopback port')
  coreOrigins.add(coreOrigin)
  report.network.activeCoreOrigins.push(coreOrigin)
  coreBootstrapInProgress = false

  const ownProject = repository.getProject(projectId)
  assert.ok(ownProject)
  const artifacts = repository.getArtifacts(projectId)
  assert.ok(artifacts.length > 0, 'fullIntegration bootstrap must provide an isolated synthetic Artifact fixture')
  const memberArtifactId = String(artifacts[0].id)

  // Collection and membership truth are created by the original Core HTTP route,
  // not by the facade or by direct SQL/repository insertion.
  const createOwn = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Protocol synthetic collection',
    members: [{ type: 'artifact', id: memberArtifactId }],
  })
  assert.equal(createOwn.status, 201, JSON.stringify(createOwn.body))
  const ownCollection = createOwn.body?.value
  assert.ok(ownCollection?.id)
  const collectionId = String(ownCollection.id)
  const ownCollectionMembers = repository.listCollectionMemberships(projectId, collectionId)
  assert.equal(ownCollectionMembers.length, 1)
  assert.deepEqual(ownCollectionMembers[0]?.memberRef, { type: 'artifact', id: memberArtifactId })
  report.fixture = { projectId, collectionId, memberArtifactId }
  report.cases.push('synthetic Collection/member fixture created through original Core POST; no facade write or direct SQL')

  const foreignProjectId = `collection-protocol-foreign-${process.pid}`
  const foreignProjectRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignProjectRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign Collection project', rootPath: foreignProjectRoot })
  const createForeign = await coreRequest('POST', `/projects/${encodeURIComponent(foreignProjectId)}/collections`, {
    title: 'Foreign protocol Collection', members: [],
  })
  assert.equal(createForeign.status, 201, JSON.stringify(createForeign.body))
  const foreignCollectionId = String(createForeign.body?.value?.id)
  assert.ok(foreignCollectionId)
  report.foreignFixture = { projectId: foreignProjectId, collectionId: foreignCollectionId }

  const reads = [
    ['list', `/projects/${encodeURIComponent(projectId)}/collections`],
    ['detail', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}`],
    ['members', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`],
  ]
  for (const [label, corePath] of reads) {
    const direct = await coreRequest('GET', corePath)
    const throughFacade = await facadeRequest('GET', `/api/lcos/core${corePath}`)
    assert.equal(direct.status, 200, `${label}: original Core read status`)
    assert.equal(throughFacade.status, direct.status, `${label}: facade must preserve Core status`)
    assert.deepEqual(throughFacade.body, direct.body, `${label}: facade must preserve the original Core DTO/envelope byte-semantics`)
  }
  const facadeMemberRead = await facadeRequest('GET', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`)
  assert.equal(facadeMemberRead.status, 200)
  assert.deepEqual(facadeMemberRead.body.value.members.map(member => member.memberRef), [{ type: 'artifact', id: memberArtifactId }])
  report.cases.push('Core and facade list/detail/members GET status and original envelopes match exactly')

  const foreignCollectionCorePath = `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(foreignCollectionId)}`
  const directForeign = await coreRequest('GET', foreignCollectionCorePath)
  const foreignFacade = await facadeRequest('GET', `/api/lcos/core${foreignCollectionCorePath}`)
  assert.equal(directForeign.status, 404, JSON.stringify(directForeign.body))
  assert.equal(foreignFacade.status, directForeign.status)
  assert.deepEqual(foreignFacade.body, directForeign.body, 'same-project lookup of a foreign Collection must preserve Core 404 DTO')
  report.cases.push('own-project route with foreign Collection returns original Core 404 envelope')

  const forbiddenBefore = report.network.allowedCoreRequests.length
  const ownTruthBefore = structuredClone(projectCollectionTruth())
  const wrongProject = await facadeRequest('GET', `/api/lcos/core/projects/${encodeURIComponent(foreignProjectId)}/collections`)
  assertStatus(wrongProject, 404, 'PROJECT_NOT_FOUND', 'wrong project must be rejected before forwarding')
  assert.equal(report.network.allowedCoreRequests.length, forbiddenBefore, 'foreign project address must not reach Core')

  const malformedPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/%ZZ`
  assertStatus(await facadeRequest('GET', malformedPath), 400, 'INVALID_CORE_ADDRESS', 'malformed percent encoding')
  const traversalPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/%2e%2e/members`
  assertStatus(await facadeRequest('GET', traversalPath), 400, 'INVALID_CORE_ADDRESS', 'encoded dot traversal')
  const separatorPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}%2fother`
  assertStatus(await facadeRequest('GET', separatorPath), 400, 'INVALID_CORE_ADDRESS', 'encoded separator in opaque Collection ID')
  assert.equal(report.network.allowedCoreRequests.length, forbiddenBefore,
    'wrong-project, malformed, traversal, and encoded-separator addresses must fail before Core forwarding')
  report.cases.push('wrong project, malformed ID, traversal, and encoded separator all fail closed before network forwarding')

  const postUnsupported = await facadeRequest('POST', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Must not be created by facade', members: [{ type: 'artifact', id: memberArtifactId }],
  })
  assertStatus(postUnsupported, 501, 'CORE_OPERATION_NOT_CONNECTED', 'facade Collection POST remains unsupported')
  const deleteUnsupported = await facadeRequest('DELETE', `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`, {
    memberType: 'artifact', memberId: memberArtifactId,
  })
  assertStatus(deleteUnsupported, 501, 'CORE_OPERATION_NOT_CONNECTED', 'facade Collection DELETE remains unsupported')
  assert.equal(report.network.allowedCoreRequests.length, forbiddenBefore,
    'facade POST/DELETE must not forward to Core')
  assert.deepEqual(projectCollectionTruth(), ownTruthBefore, 'unsupported writes must not change Collection or membership truth')
  report.cases.push('POST/DELETE remain 501; neither reaches Core nor changes canonical Collection/member rows')

  const finalRunCount = repository.getProjectRuns(projectId, 200).length
  assert.equal(finalRunCount, 0, 'read-only Collection protocol requests must leave Run count at zero')
  report.runCount = { start: initialRunCount, end: finalRunCount }
  assert.equal(report.network.blocked.length, 0, 'no non-Core network request may escape the boundary')
  assert.ok(report.network.pinnedOllamaRejected.every(request =>
    request.origin === 'http://127.0.0.1:1' && request.path === '/api/embed'),
  'only the explicitly pinned dead Ollama endpoint may be attempted, and fetch rejects before networking')
  assert.ok(report.network.allowedCoreRequests.length > 0)
  assert.ok(report.network.allowedCoreRequests.every(request => request.origin === coreOrigin))
  report.network.allCoreRequestsSameOrigin = true
  report.summary = {
    projectId,
    coreOrigin,
    collectionId,
    foreignProjectId,
    foreignCollectionId,
    successfulReads: ['list', 'detail', 'members'],
    rejectedPreForwardAddresses: 4,
    unsupportedWrites: ['POST collection', 'DELETE membership'],
    runCountStart: initialRunCount,
    runCountEnd: finalRunCount,
    pinnedLocalOllamaAttemptsRejected: report.network.pinnedOllamaRejected.length,
    coreHttpRequests: report.network.allowedCoreRequests.length,
  }
  report.cases.push(`Ollama attempts observed: ${report.network.pinnedOllamaRejected.length}; any attempt was pinned to the dead loopback endpoint and rejected before networking`)
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
