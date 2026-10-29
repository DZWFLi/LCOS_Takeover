import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { Server as NetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import {
  nativeCoreCollectionTitleRepositorySource,
  nativeCoreCollectionTitleRouteSource,
  transformNativeCoreCollectionTitleRepository,
  transformNativeCoreCollectionTitleRoute,
} from '../lab/native-core-collection-title-transform.mjs'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeParent = path.join(workspaceRoot, '.runtime')
await mkdir(runtimeParent, { recursive: true })
const runtimeRoot = await mkdtemp(path.join(runtimeParent, 'native-core-collection-title-'))
const runtimeRootReal = await realpath(runtimeRoot)
const publicOrigin = 'http://127.0.0.1:19889'
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const secretishEnv = [
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
  'ZHIPU_BASE_URL', 'MOONSHOT_BASE_URL', 'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY',
  'MINIMAX_BASE_URL', 'MINIMAX_API_KEY', 'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'QIANFAN_BASE_URL',
  'COHERE_BASE_URL', 'COHERE_API_KEY', 'TOGETHER_BASE_URL', 'TOGETHER_API_KEY', 'FIREWORKS_BASE_URL',
  'FIREWORKS_API_KEY', 'PERPLEXITY_BASE_URL', 'PERPLEXITY_API_KEY', 'BEDROCK_BASE_URL',
  'BEDROCK_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_API_VERSION',
  'LMSTUDIO_BASE_URL',
]
for (const key of secretishEnv) delete process.env[key]
process.env.LCOS_RECOVERY_TRANSPORT = 'none'
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'

const originalFetch = globalThis.fetch.bind(globalThis)
let fetchInstalled = false
let allowBootstrap = false
let coreOrigin = ''
const coreOrigins = new Set()
const attemptsAtPinnedOllama = []
const blockedNetwork = []
let facade

function activeOrigins() {
  const result = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !Number.isInteger(address.port)) continue
    const hostname = address.address.includes(':') ? `[${address.address}]` : address.address
    result.add(`http://${hostname}:${address.port}`)
  }
  return result
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      attemptsAtPinnedOllama.push({ method, path: url.pathname })
      throw new Error('Pinned dead Ollama endpoint rejected before networking.')
    }
    const active = activeOrigins()
    const bootstrap = allowBootstrap && active.size === 1 && active.has(url.origin)
    const registered = coreOrigins.has(url.origin) && active.has(url.origin)
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !blockedPorts.has(url.port) && (bootstrap || registered)) {
      return originalFetch(input, init)
    }
    blockedNetwork.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('This test permits only its own ephemeral loopback Core listener.')
  }
}

function assertContained(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target))
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative),
    `cleanup target must be a child of the test runtime parent: ${target}`)
  assert.equal(path.basename(target).startsWith('native-core-collection-title-'), true)
}

async function coreRequest(method, pathname, body) {
  const response = await fetch(coreOrigin + pathname, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const content = await response.text()
  return { status: response.status, body: content ? JSON.parse(content) : null }
}

function facadeRequest(method, pathname, body) {
  return facade.handle({ method, pathname, url: publicOrigin + pathname, ...(body === undefined ? {} : { body }) })
}

function artifactRevisions(repository, artifacts) {
  return artifacts.flatMap(artifact => repository.getArtifactRevisions(String(artifact.id)))
}

function assertCoreStateUnchanged(repository, projectId, collectionId, before, graphVersion, memberships, artifacts, revisions) {
  assert.deepEqual(repository.getCollection(collectionId), before)
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), memberships)
  assert.equal(repository.getProject(projectId).graphVersion, graphVersion)
  assert.deepEqual(repository.getArtifacts(projectId), artifacts)
  assert.deepEqual(artifactRevisions(repository, artifacts), revisions)
}

try {
  const repositorySource = await readFile(path.join(workspaceRoot, nativeCoreCollectionTitleRepositorySource), 'utf8')
  const routeSource = await readFile(path.join(workspaceRoot, nativeCoreCollectionTitleRouteSource), 'utf8')
  const adaptedRepository = transformNativeCoreCollectionTitleRepository(repositorySource,
    { sourcePath: path.join(workspaceRoot, nativeCoreCollectionTitleRepositorySource) })
  const adaptedRoute = transformNativeCoreCollectionTitleRoute(routeSource,
    { sourcePath: path.join(workspaceRoot, nativeCoreCollectionTitleRouteSource) })
  assert.equal(transformNativeCoreCollectionTitleRepository(adaptedRepository,
    { sourcePath: path.join(workspaceRoot, nativeCoreCollectionTitleRepositorySource) }), adaptedRepository,
  'repository transform is idempotent')
  assert.equal(transformNativeCoreCollectionTitleRoute(adaptedRoute,
    { sourcePath: path.join(workspaceRoot, nativeCoreCollectionTitleRouteSource) }), adaptedRoute,
  'route transform is idempotent')
  assert.match(adaptedRepository, /UPDATE collections SET title = \?, updated_at = \? WHERE id = \? AND project_id = \?/)
  assert.match(adaptedRoute, /Collection rename accepts only a title/)
  assert.throws(() => transformNativeCoreCollectionTitleRepository(repositorySource, { sourcePath: 'unrelated.ts' }), /exact copied Local Core sourcePath/)
  assert.throws(() => transformNativeCoreCollectionTitleRoute(routeSource.replace("  if (ctx.method === 'GET' && isMembersRoute) {", '  // moved seam'),
    { sourcePath: path.join(workspaceRoot, nativeCoreCollectionTitleRouteSource) }), /drifted, is partial/)

  const helperBundle = path.join(runtimeRoot, 'native-pile-space-adapter.mjs')
  await buildPilotEntry('lab/pilot/native-pile-space-adapter.ts', helperBundle, 'node')
  const { planNativePileGroupLayout } = await import(pathToFileURL(helperBundle).href)
  const groupLayout = planNativePileGroupLayout({
    nodes: [
      { id: 'carrier', type: 'image', position: { x: 320, y: 100 }, measured: { width: 180, height: 150 }, data: {} },
      { id: 'member-image', type: 'image', position: { x: 20, y: 30 }, measured: { width: 100, height: 80 }, data: {} },
      { id: 'member-text', type: 'note', position: { x: 190, y: 40 }, measured: { width: 120, height: 90 }, data: {} },
    ],
    selectedNodeIds: ['member-image', 'member-text'], groupId: 'node-00000000-0000-4000-8000-000000000001',
    collectionNodeId: 'carrier', title: 'TapNow Group title', fail(status, code, message) {
      throw Object.assign(new Error(message), { status, code })
    },
  })
  assert.equal(groupLayout.frame.type, 'group')
  assert.equal(groupLayout.frame.id, 'node-00000000-0000-4000-8000-000000000001')
  assert.equal(groupLayout.frame.data.title, 'TapNow Group title')
  assert.deepEqual(groupLayout.nodes.map(node => node.id), ['member-image', 'member-text'])
  assert.ok(groupLayout.nodes.every(node => node.parentId === groupLayout.frame.id))

  const projectionBundle = path.join(runtimeRoot, 'native-pile-collection-projection.mjs')
  await buildPilotEntry('lab/pilot/native-pile-collection-projection.ts', projectionBundle, 'node')
  const { createNativePileCollectionProjection } = await import(pathToFileURL(projectionBundle).href)
  const projectFixtureId = 'pilot-project', canvasFixtureId = 'pilot-canvas', collectionFixtureId = 'collection-main'
  const fixtureNodes = [
    { id: 'carrier', type: 'image', position: { x: 320, y: 100 }, measured: { width: 180, height: 150 }, data: {} },
    { id: 'artifact-node', type: 'image', position: { x: 20, y: 30 }, measured: { width: 100, height: 80 }, data: {} },
    { id: 'view-node', type: 'note', position: { x: 190, y: 40 }, measured: { width: 120, height: 90 }, data: {} },
    { id: 'nested-pile', type: 'image', position: { x: 480, y: 40 }, measured: { width: 160, height: 120 }, data: {} },
    { id: 'same-title-unbound', type: 'note', position: { x: 680, y: 40 }, measured: { width: 100, height: 80 }, data: { title: 'Canon Collection' } },
  ]
  const fixtureMemberships = [
    { collectionId: collectionFixtureId, memberRef: { type: 'artifact', id: 'artifact-a' } },
    { collectionId: collectionFixtureId, memberRef: { type: 'artifact', id: 'artifact-b' } },
    { collectionId: collectionFixtureId, memberRef: { type: 'collection', id: 'collection-nested' } },
    { collectionId: collectionFixtureId, memberRef: { type: 'note', id: 'note-unprojected' } },
  ]
  const fixtureBindings = [
    { projectId: projectFixtureId, canvasId: canvasFixtureId, spatialKind: 'node', spatialId: 'carrier', entityType: 'collection', entityId: collectionFixtureId },
    { projectId: projectFixtureId, canvasId: canvasFixtureId, spatialKind: 'node', spatialId: 'artifact-node', entityType: 'artifact', entityId: 'artifact-a' },
    { projectId: projectFixtureId, canvasId: canvasFixtureId, spatialKind: 'node', spatialId: 'view-node', entityType: 'view', entityId: 'view-b' },
    { projectId: projectFixtureId, canvasId: canvasFixtureId, spatialKind: 'node', spatialId: 'nested-pile', entityType: 'collection', entityId: 'collection-nested' },
  ]
  const fixtureRepository = {
    getWorkspaces: id => id === projectFixtureId ? [{ id: 'workspace-main', projectId: id, canvasId: canvasFixtureId }] : [],
    getCollection: id => id === collectionFixtureId ? { id, projectId: projectFixtureId, title: 'Canon Collection' } : undefined,
    listCollectionMemberships: (_projectId, id) => id === collectionFixtureId ? fixtureMemberships : [],
    getProjectionBindings: id => id === projectFixtureId ? fixtureBindings : [],
    findProjectionBinding: (...args) => fixtureBindings.find(row => [row.projectId, row.canvasId, row.spatialKind, row.entityType, row.entityId].join('|')
      === args.join('|')),
    getArtifactView: id => id === 'view-b' ? { id, artifactId: 'artifact-b', scopeId: 'scope-main' } : undefined,
    getArtifact: id => ['artifact-a', 'artifact-b'].includes(id) ? { id, projectId: projectFixtureId } : undefined,
  }
  const fixtureSpatial = { async read(id) { return id === canvasFixtureId ? { state: { nodes: fixtureNodes } } : undefined } }
  const projectionFail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }) }
  const pileProjection = createNativePileCollectionProjection({ repository: fixtureRepository, projectId: projectFixtureId,
    spatial: fixtureSpatial, fail: projectionFail })
  const pile = pileProjection.node(canvasFixtureId, fixtureNodes[0], fixtureNodes)
  assert.equal(pile.type, 'pile')
  assert.equal(pile.data.lcos_native_collection, true)
  assert.equal(pile.data.title, 'Canon Collection')
  assert.deepEqual(pile.data.memberIds, ['artifact-node', 'view-node', 'nested-pile'])
  assert.deepEqual(await pileProjection.readBinding(canvasFixtureId, collectionFixtureId).then(result => result.node.data.memberIds),
    ['artifact-node', 'view-node', 'nested-pile'])
  assert.equal(pileProjection.unprojectedMemberCount(canvasFixtureId, collectionFixtureId, fixtureNodes), 1)
  const noCarrierRepository = { ...fixtureRepository, getProjectionBindings: () => fixtureBindings.filter(row => row.entityId !== collectionFixtureId) }
  const noCarrier = createNativePileCollectionProjection({ repository: noCarrierRepository, projectId: projectFixtureId,
    spatial: fixtureSpatial, fail: projectionFail })
  assert.equal(noCarrier.node(canvasFixtureId, fixtureNodes[0], fixtureNodes), undefined,
    'the projection does not synthesize a carrier when the current Canvas has no Core binding')
  await assert.rejects(noCarrier.project(canvasFixtureId, collectionFixtureId),
    error => error.code === 'COLLECTION_BINDING_REQUIRED')

  const baseline = activeOrigins()
  assert.equal(baseline.size, 0, 'test process begins with no other loopback listener')
  installFetchBoundary()

  const pilotRoot = path.join(runtimeRoot, 'pilot')
  await mkdir(pilotRoot, { recursive: true })
  const pilotBundle = path.join(pilotRoot, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', pilotBundle, 'node', { coreCollectionTitle: true })
  const pilotBundleText = await readFile(pilotBundle, 'utf8')
  assert.match(pilotBundleText, /updateCollectionTitle/)
  const { startSurfaceCoreFacade } = await import(pathToFileURL(pilotBundle).href)
  allowBootstrap = true
  facade = await startSurfaceCoreFacade({ runtimeRoot: pilotRoot, publicOrigin, fullIntegration: true, nativeCollectionPilot: true })
  coreOrigin = facade.core.origin
  coreOrigins.add(coreOrigin)
  allowBootstrap = false
  const repository = facade.core.repository
  const projectId = String(facade.core.projectId)

  const artifacts = repository.getArtifacts(projectId)
  assert.ok(artifacts.length > 0, 'temporary Core fixture has a canonical member Artifact')
  const artifactId = String(artifacts[0].id)
  const created = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Before rename', members: [{ type: 'artifact', id: artifactId }],
  })
  assert.equal(created.status, 201)
  const collectionId = String(created.body.value.id)
  const before = structuredClone(repository.getCollection(collectionId))
  const memberships = structuredClone(repository.listCollectionMemberships(projectId, collectionId))
  const graphVersion = repository.getProject(projectId).graphVersion
  const artifactSnapshot = structuredClone(repository.getArtifacts(projectId))
  const revisionSnapshot = structuredClone(artifactRevisions(repository, artifactSnapshot))

  const directPath = `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}`
  const directRename = await coreRequest('PATCH', directPath, { title: 'Renamed by Core' })
  assert.equal(directRename.status, 200, JSON.stringify(directRename.body))
  assert.equal(directRename.body.value.title, 'Renamed by Core')
  const afterDirect = structuredClone(repository.getCollection(collectionId))
  assert.equal(afterDirect.id, before.id)
  assert.equal(afterDirect.projectId, before.projectId)
  assert.equal(afterDirect.createdAt, before.createdAt)
  assert.equal(afterDirect.title, 'Renamed by Core')
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), memberships)
  assert.equal(repository.getProject(projectId).graphVersion, graphVersion)
  assert.deepEqual(repository.getArtifacts(projectId), artifactSnapshot)
  assert.deepEqual(artifactRevisions(repository, artifactSnapshot), revisionSnapshot)

  const proxyPath = `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}`
  const beforeProxy = structuredClone(repository.getCollection(collectionId))
  const proxyRename = await facadeRequest('PATCH', proxyPath, { title: 'Renamed through isolated native pilot' })
  assert.equal(proxyRename.status, 200, JSON.stringify(proxyRename.body))
  assert.equal(proxyRename.body.ok, true)
  assert.equal(proxyRename.body.value.title, 'Renamed through isolated native pilot')
  const afterProxy = structuredClone(repository.getCollection(collectionId))
  assert.deepEqual({ ...afterProxy, title: beforeProxy.title, updatedAt: beforeProxy.updatedAt }, beforeProxy,
    'the Core title owner changes only title and updatedAt')
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), memberships)
  assert.equal(repository.getProject(projectId).graphVersion, graphVersion)
  assert.deepEqual(repository.getArtifacts(projectId), artifactSnapshot)
  assert.deepEqual(artifactRevisions(repository, artifactSnapshot), revisionSnapshot)

  const invalidRequests = [
    { path: proxyPath, body: { title: '   ' }, status: 400 },
    { path: proxyPath, body: { title: 'x'.repeat(501) }, status: 400 },
    { path: proxyPath, body: { title: 'valid', extra: true }, status: 400 },
    { path: proxyPath, body: { title: null }, status: 400 },
    { path: `/api/lcos/core/projects/${encodeURIComponent(projectId)}/collections/unknown-collection`, body: { title: 'valid' }, status: 404 },
    { path: `/api/lcos/core/projects/foreign-project/collections/${encodeURIComponent(collectionId)}`, body: { title: 'valid' }, status: 404 },
  ]
  for (const row of invalidRequests) {
    const result = await facadeRequest('PATCH', row.path, row.body)
    assert.equal(result.status, row.status, `${row.path}: ${JSON.stringify(result.body)}`)
    assertCoreStateUnchanged(repository, projectId, collectionId, afterProxy, graphVersion, memberships, artifactSnapshot, revisionSnapshot)
  }
  assert.ok(facade.core.repository.getCollection(collectionId))

  await facade.close()
  facade = undefined
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(activeOrigins().size, 0, 'pilot Core listener is closed before default mode starts')

  const legacyRoot = path.join(runtimeRoot, 'default')
  await mkdir(legacyRoot, { recursive: true })
  const legacyBundle = path.join(legacyRoot, 'surface-core-facade.mjs')
  await buildPilotEntry('lab/pilot/surface-core-facade.ts', legacyBundle, 'node')
  const legacyText = await readFile(legacyBundle, 'utf8')
  assert.doesNotMatch(legacyText, /updateCollectionTitle/, 'default Node build does not contain the pilot-only producer transform')
  const legacyModule = await import(pathToFileURL(legacyBundle).href)
  allowBootstrap = true
  facade = await legacyModule.startSurfaceCoreFacade({ runtimeRoot: legacyRoot, publicOrigin, fullIntegration: true })
  coreOrigin = facade.core.origin
  coreOrigins.add(coreOrigin)
  allowBootstrap = false
  const legacyProxyPath = `/api/lcos/core/projects/${encodeURIComponent(facade.core.projectId)}/collections/unknown-collection`
  const legacyRejected = await facadeRequest('PATCH', legacyProxyPath, { title: 'must stay disabled' })
  assert.equal(legacyRejected.status, 501)
  assert.equal(legacyRejected.body.error.code, 'CORE_OPERATION_NOT_CONNECTED')

  assert.equal(blockedNetwork.length, 0, 'no external, provider, live port, or old runtime request escaped the test fetch fence')
  assert.ok(attemptsAtPinnedOllama.every(request => request.path === '/api/embed'),
    'any bootstrap embedding lookup stayed at the explicitly pinned dead loopback endpoint and was rejected before networking')
  console.log(JSON.stringify({
    passed: true,
    scope: 'fresh temporary Local Core only; no original database, provider, Bridge, GUI, or live port',
    cases: ['source transforms are exact, idempotent, and fail closed on drift',
      'real Core PATCH renames only canonical Collection title/updatedAt',
      'native-pilot facade exposes same-project PATCH and preserves the original Core envelope',
      'invalid, cross-project, unknown-field, and unknown-Collection requests have zero side effects',
      'default Node build keeps the Collection title producer unregistered and returns 501'],
    activeCoreOrigins: [...coreOrigins],
    pinnedOllamaAttemptsRejectedBeforeNetworking: attemptsAtPinnedOllama.length,
  }, null, 2))
} finally {
  if (facade) await facade.close()
  await new Promise(resolve => setImmediate(resolve))
  const remaining = activeOrigins()
  assert.equal(remaining.size, 0, 'only this test-owned Core listeners must remain and be closed')
  globalThis.fetch = originalFetch
  assertContained(runtimeParent, runtimeRootReal)
  await rm(runtimeRootReal, { recursive: true, force: true })
}

