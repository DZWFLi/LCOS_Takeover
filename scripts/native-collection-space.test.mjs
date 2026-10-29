import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-space')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const report = {
  at: new Date().toISOString(), reportPath, runtimeRoot,
  test: 'native-collection-space',
  implementation: 'original Gen2 collectionHost first-open + original GROUP_SELECTION_INTO_FRAME resolver + Huabu executor under one canvas lock',
  boundary: 'Core membership/artifact truth unchanged; only already-bound same-Canvas spatial nodes are grouped; no new material node, Canvas, Run, provider or history owner',
  currentRoot: currentGen2Root,
  originalUserDatabaseOpened: false,
  live17881Accessed: false,
  providerOrBridgeStarted: false,
  rawSqlUsed: false,
  schemaChanged: false,
  network: { bootstrapListeners: [], allowedCoreRequests: [], rejectedDeadSemanticRequests: [], blockedRequests: [], activeListeners: [] },
  fixture: {}, cases: [],
  cleanup: { facadeClosed: false, listenersReleased: false, runtimeRemoved: false },
  passed: false,
}

const originalFetch = globalThis.fetch.bind(globalThis)
const coreOrigins = new Set()
let fetchInstalled = false
let bootstrapping = false
let facade
let coreOrigin
let repository

function isLoopback(host) { return ['127.0.0.1', 'localhost', '[::1]'].includes(host) }

function activeLoopbackOrigins() {
  const result = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    result.add(`http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`)
  }
  return result
}

function assertContained(parent, target) {
  const resolvedParent = path.resolve(parent), resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget) throw new Error(`Refusing cleanup outside the owned test runtime: ${resolvedTarget}`)
}

function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.rejectedDeadSemanticRequests.push({ method, path: url.pathname })
      throw new Error('This isolated test pins semantic indexing to a dead loopback endpoint.')
    }
    const active = activeLoopbackOrigins()
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && ((coreOrigins.has(url.origin) && active.has(url.origin))
        || (bootstrapping && active.size === 1 && [...active][0] === url.origin))) {
      const response = await originalFetch(input, init)
      report.network.allowedCoreRequests.push({ method, origin: url.origin, path: url.pathname, status: response.status })
      return response
    }
    report.network.blockedRequests.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only this test-owned isolated Core listener and the pinned dead semantic endpoint are allowed.')
  }
}

function relativeImport(fromFile, targetFile) {
  let value = path.relative(path.dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = './' + value
  return value
}

async function coreRequest(method, pathname, body, options = {}) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    ...(options.headers ? { headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers } } : {}),
  })
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, body: result, headers: response.headers }
}

async function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
}

function valueOf(result) { return result?.body?.data ?? result?.body?.value ?? result?.body }
function errorCode(result) { return result?.body?.error?.code ?? result?.body?.code ?? result?.body?.errorCode }
function statusError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error }

async function exactFileBytes(projectId, fileRecordId) {
  const result = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/file-records/${encodeURIComponent(fileRecordId)}/content`)
  assert.equal(result.status, 200, `Core file read ${fileRecordId}`)
  return result.body
}

const providerEnv = [
  'LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT',
  'LCOS_INTELLIGENCE_PROVIDERS', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY',
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY',
  'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY',
  'QWEN_BASE_URL', 'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'HUNYUAN_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'LMSTUDIO_BASE_URL', 'LCOS_BRIDGE_URL',
]

try {
  for (const key of providerEnv) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')

  const initialListeners = activeLoopbackOrigins()
  report.network.bootstrapListeners = [...initialListeners]
  assert.equal(initialListeners.size, 0, 'the isolated adapter test must not inherit a listener')
  installFetchBoundary()

  const ownersEntry = path.join(runtimeRoot, 'native-collection-space-test-owners.ts')
  const ownersSource = [
    `export { startSurfaceCoreFacade } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/surface-core-facade.ts')))}`,
    `export { Gen2Host } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/host/projectionFacade.ts')))}`,
    `export { HttpClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/client.ts')))}`,
    `export { CoreArtifactClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/artifacts.ts')))}`,
    `export { createHeadlessProjectionPort } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/headless-projection-port.ts')))}`,
    `export { createNativeCollectionSpace } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space.ts')))}`,
  ].join('\n')
  await writeFile(ownersEntry, ownersSource, 'utf8')
  const ownersBundle = path.join(runtimeRoot, 'native-collection-space-test-owners.mjs')
  await buildPilotEntry(path.relative(root, ownersEntry), ownersBundle)
  const owners = await import(pathToFileURL(ownersBundle).href)
  const sourceManifest = JSON.parse(await (await import('node:fs/promises')).readFile(`${ownersBundle}.sources.json`, 'utf8'))
  const adopted = new Set((sourceManifest.resources ?? []).map(resource => resource.resourcePath))
  const requiredCurrentOwners = [
    'huabu/apps/web/src/lcos/nodes/collectionHost.ts',
    'huabu/apps/web/src/lcos/nodes/collectionDragCompanions.ts',
    'huabu/apps/web/src/lcos/nodes/collectionExpandLayout.ts',
    'huabu/apps/web/src/handler/canvasCommand/resolvers/resolveGroupSelectionIntoFrame.ts',
    'huabu/apps/web/src/handler/canvasCommand/utils/index.ts',
    'huabu/apps/web/src/handler/canvasCommand/utils/local.ts',
  ]
  for (const resource of requiredCurrentOwners) assert.ok(adopted.has(resource), `bundle must execute current original owner ${resource}`)
  report.currentOwnerClosure = requiredCurrentOwners
  report.bundledCurrentResources = [...adopted].sort()
  report.cases.push('buildPilotEntry adopted all six current collection/frame owners; shared frame mutation/tree/size/executor remain byte-identical and use the existing engine')

  bootstrapping = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, fullIntegration: true })
  coreOrigin = String(facade.core.origin)
  repository = facade.core.repository
  assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false, 'Core must bind its own unblocked ephemeral loopback port')
  coreOrigins.add(coreOrigin)
  const listenersAfterStart = activeLoopbackOrigins()
  assert.deepEqual([...listenersAfterStart], [coreOrigin], 'the fresh Core facade must own the only listener')
  report.network.activeListeners.push(...listenersAfterStart)
  bootstrapping = false

  const projectId = String(facade.core.projectId)
  const mainWorkspace = facade.workspaces.find(workspace => workspace.preferredSurface === 'main')
  const rootScope = repository.getScopes(projectId).find(scope => scope.kind === 'root')
  assert.ok(mainWorkspace?.canvasId && mainWorkspace.scopeId && rootScope)
  const canvasId = String(mainWorkspace.canvasId)
  const initialRunCount = repository.getProjectRuns(projectId, 100).length
  assert.equal(initialRunCount, 0)
  const hosts = new Map()
  const projectionHost = canvas => {
    if (String(canvas) !== canvasId) throw new Error('This test host only serves its one synthetic Main Canvas.')
    let host = hosts.get(canvas)
    if (!host) {
      host = new owners.Gen2Host({ projectId, http: new owners.HttpClient({ baseUrl: coreOrigin }),
        rfs: owners.createHeadlessProjectionPort({ canvasId: canvas, coreOrigin,
          read: facade.spatial.read, execute: facade.spatial.execute }) })
      hosts.set(canvas, host)
    }
    return host
  }
  const host = projectionHost(canvasId)
  const artifactClient = new owners.CoreArtifactClient(new owners.HttpClient({ baseUrl: coreOrigin }))

  const textBody = '这是隔离测试里的 Core 文本材料，展开只会改变 Canvas 空间父子关系。\nTEXT_SPACE_MEMBER_TAIL_雪'
  const text = await artifactClient.createTextArtifact(projectId, { title: 'Native Collection text fixture', body: textBody,
    scopeId: String(rootScope.id) })
  assert.ok(text.artifactId && text.revisionId && text.fileRecordId)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6X3mQAAAAASUVORK5CYII=', 'base64')
  const image = await artifactClient.importCopiedFile(projectId, { file: new File([png], 'space-fixture.png', { type: 'image/png' }),
    importRequestId: `native-collection-space-${process.pid}-${Date.now()}`, scopeId: String(rootScope.id), position: { x: 0, y: 0 } })
  assert.equal(String(image.artifact.projectId), projectId)
  assert.ok(image.view?.id && image.revision?.id, 'the Core ImportCopy producer must return its exact image View and Revision')
  const imageArtifactId = String(image.artifact.id)
  const imageRevisionId = String(image.revision.id)
  const imageFileRecordId = String(image.revision.fileRecordId)
  const imageBytesBefore = await exactFileBytes(projectId, imageFileRecordId)
  assert.deepEqual(imageBytesBefore, png, 'the synthetic image FileRecord stores the exact fixture bytes')

  const members = [{ type: 'artifact', id: text.artifactId }, { type: 'artifact', id: imageArtifactId }]
  const createdCollection = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection space fixture', members,
  })
  assert.equal(createdCollection.status, 201, JSON.stringify(createdCollection.body))
  const collectionId = String(createdCollection.body?.value?.id ?? '')
  assert.ok(collectionId)
  const membershipBefore = repository.listCollectionMemberships(projectId, collectionId)
  assert.deepEqual(membershipBefore.map(row => JSON.stringify([row.memberRef.type, row.memberRef.id])).sort(),
    members.map(member => JSON.stringify([member.type, member.id])).sort())
  const accepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

  const projectionSources = [
    { projectId, artifactId: String(text.artifactId), kind: 'text', title: text.title, fileRecordId: String(text.fileRecordId),
      currentRevisionId: String(text.revisionId), mimeType: 'text/markdown', size: { width: 260, height: 180 } },
    { projectId, artifactId: imageArtifactId, kind: 'image', title: String(image.artifact.title), fileRecordId: imageFileRecordId,
      currentRevisionId: imageRevisionId, mimeType: 'image/png', size: { width: 220, height: 180 } },
  ]
  const memberBindings = await host.projectArtifacts(projectionSources)
  assert.equal(memberBindings.length, 2)
  const textSpatialId = String(memberBindings.find(binding => binding.entityId === text.artifactId)?.spatialId ?? '')
  const imageSpatialId = String(memberBindings.find(binding => binding.entityId === imageArtifactId)?.spatialId ?? '')
  assert.ok(textSpatialId && imageSpatialId && textSpatialId !== imageSpatialId)

  const collectionProjection = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
  assert.equal(collectionProjection.status, 200, JSON.stringify(collectionProjection.body))
  const collectionNodeId = String(valueOf(collectionProjection)?.binding?.spatialId ?? '')
  assert.ok(collectionNodeId, JSON.stringify(collectionProjection.body))
  const collectionBindingsBefore = repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
    && row.entityType === 'collection' && row.entityId === collectionId)
  assert.equal(collectionBindingsBefore.length, 1)

  // Put two real bound material nodes on the same origin so the original layout
  // owner has a meaningful first-open geometry change to resolve.
  const beforeArrange = await facade.spatial.read(canvasId)
  const initialMemberPositions = new Map([textSpatialId, imageSpatialId].map(id => {
    const node = beforeArrange.state.nodes.find(row => String(row.id) === id)
    assert.ok(node)
    return [id, { ...node.position }]
  }))
  const overlapReceipt = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: textSpatialId, position: { x: 820, y: 510 } },
    { nodeId: imageSpatialId, position: { x: 820, y: 510 } },
  ] }])
  assert.ok(overlapReceipt.results.every(result => result.applied === true), JSON.stringify(overlapReceipt.results))

  const spacePath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(collectionId)}/space`
  const beforeSpace = await facadeCall('GET', spacePath)
  assert.equal(beforeSpace.status, 200, JSON.stringify(beforeSpace.body))
  const beforeDto = valueOf(beforeSpace)
  assert.equal(beforeDto.collection_node_id, collectionNodeId)
  assert.deepEqual([...beforeDto.node_ids].sort(), [textSpatialId, imageSpatialId].sort(), 'only exact same-Canvas bound material identities participate')
  assert.equal(beforeDto.unprojected_member_count, 0)
  const fromVersion = Number(beforeDto.version)
  const applied = await facadeCall('POST', spacePath, { collectionNodeId, expectedVersion: fromVersion })
  assert.equal(applied.status, 200, JSON.stringify(applied.body))
  const applyDto = valueOf(applied)
  const frameId = String(applyDto.frame_id ?? '')
  assert.ok(frameId)
  assert.equal(applyDto.created, true)
  assert.equal(applyDto.from_version, fromVersion)
  assert.equal(applyDto.provider_execution_started, false)

  const after = await facade.spatial.read(canvasId)
  assert.equal(after.version, applyDto.to_version)
  const frameNodes = after.state.nodes.filter(node => node.type === 'frame'
    && node.data?.lcosCollectionId === collectionId && node.data?.lcosCollectionNodeId === collectionNodeId)
  assert.equal(frameNodes.length, 1)
  const frame = frameNodes[0]
  const frameChildren = after.state.nodes.filter(node => node.parentId === frameId)
  assert.deepEqual(frameChildren.map(node => String(node.id)).sort(), [textSpatialId, imageSpatialId].sort())
  assert.equal(frameChildren.find(node => String(node.id) === imageSpatialId)?.type, 'image')
  assert.ok(['note', 'text'].includes(String(frameChildren.find(node => String(node.id) === textSpatialId)?.type)),
    'the original Huabu text-bearing carrier may serialize as note or text; Core binding remains the artifact identity')
  const positionsAfter = new Map(frameChildren.map(node => [String(node.id), { ...node.position }]))
  assert.notDeepEqual(positionsAfter.get(textSpatialId), { x: 0, y: 0 })
  assert.ok(frameChildren.some(node => node.position.x !== 820 || node.position.y !== 510), 'the original Collection layout must separate the overlapping materials')
  const facadeCanvas = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
  assert.equal(facadeCanvas.status, 200, JSON.stringify(facadeCanvas.body))
  const facadeCanvasDto = valueOf(facadeCanvas)
  const facadeGroup = facadeCanvasDto.nodes.find(node => String(node.id) === frameId)
  assert.equal(facadeGroup?.type, 'group', 'the exact original Huabu frame is presented through TapNow’s native group renderer')
  assert.equal(facadeGroup?.data?.lcosCollectionId, collectionId)
  assert.equal(facadeGroup?.data?.lcosCollectionNodeId, collectionNodeId)
  for (const id of [textSpatialId, imageSpatialId]) {
    const child = facadeCanvasDto.nodes.find(node => String(node.id) === id)
    assert.equal(child?.parent_id, frameId, `facade GET must preserve the saved native parent for ${id}`)
  }
  const facadeVersionBeforeEcho = (await facade.spatial.read(canvasId)).version
  const parentEcho = await facadeCall('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
    canvas_id: canvasId, actions: [{ action: 'update', updates: [{ id: textSpatialId, parent_id: frameId }] }],
  })
  assert.equal(parentEcho.status, 200, JSON.stringify(parentEcho.body))
  assert.equal((await facade.spatial.read(canvasId)).version, facadeVersionBeforeEcho,
    'an exact saved parent echo is a readback, not a second parent writer')
  const ordinaryId = `native-collection-space-unbound-${process.pid}`
  const ordinaryCreate = await facade.spatial.execute(canvasId, [{ type: 'CREATE_NODES', nodes: [{
    id: ordinaryId, nodeType: 'note', position: { x: 1700, y: 1200 }, data: { label: 'isolated ordinary parent guard fixture' },
  }] }])
  assert.ok(ordinaryCreate.results.every(result => result.applied === true), JSON.stringify(ordinaryCreate.results))
  const beforeForgedParent = await facade.spatial.read(canvasId)
  const forgedParent = await facadeCall('POST', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
    canvas_id: canvasId, actions: [{ action: 'update', updates: [{ id: ordinaryId, parent_id: frameId }] }],
  })
  assert.equal(forgedParent.status, 501, JSON.stringify(forgedParent.body))
  assert.equal(errorCode(forgedParent), 'NODE_PARENT_PATCH_NOT_CONNECTED')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeForgedParent.version,
    'an ordinary renderer patch cannot create a parent relationship')
  report.cases.push('facade Canvas GET exposed the exact original group and child parent_id; exact parent echo did not write, forged ordinary parent remained 501')
  report.fixture.main = { projectId, canvasId, workspaceId: String(mainWorkspace.id), collectionId,
    collectionNodeId, frameId, textArtifactId: text.artifactId, textSpatialId,
    imageArtifactId, imageRevisionId, imageFileRecordId, imageSpatialId,
    initialMemberPositions: Object.fromEntries(initialMemberPositions), positionsAfter: Object.fromEntries(positionsAfter),
    coreAcceptedCollectionMembers: membershipBefore.map(row => row.memberRef) }
  report.cases.push('real text and PNG Artifacts were independently projected/bound before first-open; original collectionHost+group resolver placed only those existing native node ids in one frame')

  const identityBefore = {
    memberships: repository.listCollectionMemberships(projectId, collectionId).map(row => row.memberRef),
    bindings: repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId && [textSpatialId, imageSpatialId, collectionNodeId].includes(row.spatialId)),
    textArtifact: repository.getArtifact(text.artifactId), textRevision: repository.getArtifactRevision(text.revisionId),
    imageArtifact: repository.getArtifact(imageArtifactId), imageRevision: repository.getArtifactRevision(imageRevisionId),
  }
  const textBytesBefore = await exactFileBytes(projectId, String(text.fileRecordId))
  const stale = await facadeCall('POST', spacePath, { collectionNodeId, expectedVersion: fromVersion })
  assert.equal(stale.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, beforeForgedParent.version, 'stale expectedVersion cannot execute any spatial command')
  report.cases.push('stale Canvas expectedVersion failed closed before a second spatial write')

  const replay = await facadeCall('POST', spacePath, { collectionNodeId, expectedVersion: beforeForgedParent.version })
  assert.equal(replay.status, 200, JSON.stringify(replay.body))
  assert.equal(valueOf(replay).created, false)
  assert.equal(valueOf(replay).frame_id, frameId)
  assert.equal(valueOf(replay).to_version, beforeForgedParent.version)
  assert.equal((await facade.spatial.read(canvasId)).version, beforeForgedParent.version, 'opening an existing frame is idempotent and does not re-layout')
  assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId).map(row => row.memberRef), identityBefore.memberships)
  assert.deepEqual(repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
    && [textSpatialId, imageSpatialId, collectionNodeId].includes(row.spatialId)), identityBefore.bindings)
  assert.deepEqual(repository.getArtifact(text.artifactId), identityBefore.textArtifact)
  assert.deepEqual(repository.getArtifactRevision(text.revisionId), identityBefore.textRevision)
  assert.deepEqual(repository.getArtifact(imageArtifactId), identityBefore.imageArtifact)
  assert.deepEqual(repository.getArtifactRevision(imageRevisionId), identityBefore.imageRevision)
  assert.deepEqual(await exactFileBytes(projectId, String(text.fileRecordId)), textBytesBefore)
  assert.deepEqual(await exactFileBytes(projectId, imageFileRecordId), imageBytesBefore)
  assert.equal(repository.getProjectRuns(projectId, 100).length, initialRunCount)
  report.cases.push('existing frame replay preserved current Core memberships, Artifact/Revision/FileRecord bytes and ProjectionBindings; no Core identity or Run was created')

  // Original first-open semantics filter a locked member and still create the
  // empty/partial frame, reporting the skipped node instead of failing.
  const lockedMember = await artifactClient.createTextArtifact(projectId, { title: 'Locked member fixture',
    body: 'This projected member is intentionally locked before first-open.', scopeId: String(rootScope.id) })
  const lockedMemberRevision = repository.getArtifactRevision(lockedMember.revisionId)
  assert.ok(lockedMemberRevision)
  const lockedMemberBindings = await host.projectArtifacts([{ projectId, artifactId: lockedMember.artifactId, kind: 'text',
    title: lockedMember.title, fileRecordId: lockedMember.fileRecordId, currentRevisionId: lockedMember.revisionId,
    mimeType: 'text/markdown', size: { width: 240, height: 150 } }])
  assert.equal(lockedMemberBindings.length, 1)
  const lockedMemberNodeId = String(lockedMemberBindings[0].spatialId)
  const lockedMemberCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection locked-member fixture', members: [{ type: 'artifact', id: lockedMember.artifactId }],
  })
  assert.equal(lockedMemberCollectionResponse.status, 201)
  const lockedMemberCollectionId = String(lockedMemberCollectionResponse.body?.value?.id ?? '')
  const lockedMemberAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: lockedMemberCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(lockedMemberAccepted.status, 200)
  const lockedMemberCarrier = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId: lockedMemberCollectionId })
  assert.equal(lockedMemberCarrier.status, 200)
  const lockedMemberOwnerId = String(valueOf(lockedMemberCarrier).binding.spatialId)
  const lockReceipt = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_LOCKED', items: [{ nodeId: lockedMemberNodeId, locked: true }] }])
  assert.ok(lockReceipt.results.every(result => result.applied === true), JSON.stringify(lockReceipt.results))
  const lockedMemberPath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(lockedMemberCollectionId)}/space`
  const filteredProjection = await facadeCall('GET', lockedMemberPath)
  assert.equal(filteredProjection.status, 200)
  assert.deepEqual(valueOf(filteredProjection).blocked_node_ids, [lockedMemberNodeId])
  assert.deepEqual(valueOf(filteredProjection).node_ids, [])
  const lockedSpaceApply = await facadeCall('POST', lockedMemberPath, { collectionNodeId: lockedMemberOwnerId,
    expectedVersion: valueOf(filteredProjection).version })
  assert.equal(lockedSpaceApply.status, 200, JSON.stringify(lockedSpaceApply.body))
  assert.deepEqual(valueOf(lockedSpaceApply).node_ids, [])
  const lockedMemberAfter = (await facade.spatial.read(canvasId)).state.nodes.find(node => String(node.id) === lockedMemberNodeId)
  assert.equal(lockedMemberAfter?.parentId, undefined, 'the locked member remains outside the new frame')
  assert.equal(lockedMemberAfter?.data?.locked, true)
  report.cases.push('original collectionHost admission filters a locked member and creates the remaining empty frame without locking, reparenting or losing the member')

  // A canonical member with no same-Canvas node stays a Collection preview;
  // it is not materialized by this spatial-only endpoint. Empty/fully
  // unprojected collections still get the original empty frame affordance.
  const unprojectedText = await artifactClient.createTextArtifact(projectId, { title: 'Unprojected preview fixture',
    body: 'This member deliberately has no spatial binding.', scopeId: String(rootScope.id) })
  const emptyCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection empty-host fixture', members: [{ type: 'artifact', id: unprojectedText.artifactId }],
  })
  assert.equal(emptyCollectionResponse.status, 201)
  const emptyCollectionId = String(emptyCollectionResponse.body?.value?.id ?? '')
  const emptyAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: emptyCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(emptyAccepted.status, 200)
  const emptyCarrier = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId: emptyCollectionId })
  assert.equal(emptyCarrier.status, 200, JSON.stringify(emptyCarrier.body))
  const emptyNodeId = String(valueOf(emptyCarrier).binding.spatialId)
  const unprojectedPath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(emptyCollectionId)}/space`
  const emptyBefore = valueOf(await facadeCall('GET', unprojectedPath))
  assert.equal(emptyBefore.unprojected_member_count, 1)
  assert.deepEqual(emptyBefore.node_ids, [])
  const nodesBeforeEmptyApply = (await facade.spatial.read(canvasId)).state.nodes.length
  const emptyApply = await facadeCall('POST', unprojectedPath, { collectionNodeId: emptyNodeId, expectedVersion: emptyBefore.version })
  assert.equal(emptyApply.status, 200, JSON.stringify(emptyApply.body))
  assert.deepEqual(valueOf(emptyApply).node_ids, [])
  const emptyAfter = await facade.spatial.read(canvasId)
  assert.equal(emptyAfter.state.nodes.length, nodesBeforeEmptyApply + 1, 'only the original empty frame is created; the unprojected Artifact stays preview-only')
  assert.equal(emptyAfter.state.nodes.some(node => node.type === 'text' && node.data?.content === 'This member deliberately has no spatial binding.'), false)
  assert.equal(repository.getProjectionBindings(projectId).some(row => row.canvasId === canvasId && row.entityId === unprojectedText.artifactId), false)
  report.cases.push('fully unprojected Collection produced the original empty frame only; missing material was not secretly projected or rebound')

  // A Collection carrier itself being locked blocks first-open before spatial
  // execute. Existing host replay above remains safe and no-op.
  const lockedCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection locked-owner fixture', members: [],
  })
  assert.equal(lockedCollectionResponse.status, 201)
  const lockedCollectionId = String(lockedCollectionResponse.body?.value?.id ?? '')
  const lockedAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: lockedCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(lockedAccepted.status, 200)
  const lockedCarrier = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId: lockedCollectionId })
  assert.equal(lockedCarrier.status, 200)
  const lockedNodeId = String(valueOf(lockedCarrier).binding.spatialId)
  const lockOwner = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_LOCKED', items: [{ nodeId: lockedNodeId, locked: true }] }])
  assert.ok(lockOwner.results.every(result => result.applied === true), JSON.stringify(lockOwner.results))
  const lockedPath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(lockedCollectionId)}/space`
  const lockedBefore = valueOf(await facadeCall('GET', lockedPath))
  const lockedApply = await facadeCall('POST', lockedPath, { collectionNodeId: lockedNodeId, expectedVersion: lockedBefore.version })
  assert.equal(lockedApply.status, 409)
  assert.equal(errorCode(lockedApply), 'COLLECTION_CARRIER_NOT_FREE')
  assert.equal((await facade.spatial.read(canvasId)).version, lockedBefore.version)
  report.cases.push('locked owner refuses first-open before executor call; no partial empty frame was committed')

  // No binding on this Canvas means the exact Collection has not yet arrived
  // spatially; the space endpoint refuses to guess/create a carrier.
  const missingCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection missing-carrier fixture', members: [],
  })
  assert.equal(missingCollectionResponse.status, 201)
  const missingCollectionId = String(missingCollectionResponse.body?.value?.id ?? '')
  const missingAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: missingCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(missingAccepted.status, 200)
  const missingPath = `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(missingCollectionId)}/space`
  const missingBeforeVersion = (await facade.spatial.read(canvasId)).version
  const missingRead = await facadeCall('GET', missingPath)
  assert.equal(missingRead.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, missingBeforeVersion)
  report.cases.push('missing exact carrier binding is rejected without creating a Canvas node or advancing Canvas version')

  const foreignProjectId = `native-collection-space-foreign-${process.pid}`
  const foreignRoot = path.join(runtimeRoot, 'foreign-project')
  await mkdir(foreignRoot, { recursive: true })
  repository.createProject({ id: foreignProjectId, name: 'Synthetic foreign project', rootPath: foreignRoot })
  const foreignCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(foreignProjectId)}/collections`, {
    title: 'Synthetic foreign Collection', members: [],
  })
  assert.equal(foreignCollectionResponse.status, 201)
  const foreignCollectionId = String(foreignCollectionResponse.body?.value?.id ?? '')
  const foreignVersion = (await facade.spatial.read(canvasId)).version
  const foreignRead = await facadeCall('GET', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections/${encodeURIComponent(foreignCollectionId)}/space`)
  assert.equal(foreignRead.status, 404)
  assert.equal((await facade.spatial.read(canvasId)).version, foreignVersion)
  report.cases.push('foreign-project Collection is rejected by canonical owner check before any spatial write')

  // Core's public membership producer rejects cycles. Separately exercise the
  // adapter's defensive cycle branch with a read-only fault-injection wrapper;
  // no malformed relation is persisted in the isolated Core.
  const nestedChildResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Nested cycle child fixture', members: [],
  })
  assert.equal(nestedChildResponse.status, 201)
  const nestedChildId = String(nestedChildResponse.body?.value?.id ?? '')
  const nestedRootResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Nested cycle root fixture', members: [{ type: 'collection', id: nestedChildId }],
  })
  assert.equal(nestedRootResponse.status, 201, JSON.stringify(nestedRootResponse.body))
  const nestedRootId = String(nestedRootResponse.body?.value?.id ?? '')
  const coreCycleAttempt = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(nestedChildId)}/members`, {
    memberType: 'collection', memberId: nestedRootId,
  })
  assert.equal(coreCycleAttempt.status, 422, 'the original Core Collection owner must prevent persisting a cycle')
  const nestedAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: nestedRootId }], targetRef: { kind: 'main' },
  })
  assert.equal(nestedAccepted.status, 200)
  const nestedCarrier = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId: nestedRootId })
  assert.equal(nestedCarrier.status, 200)
  const nestedNodeId = String(valueOf(nestedCarrier).binding.spatialId)
  const cycleVersion = (await facade.spatial.read(canvasId)).version
  const realListMemberships = repository.listCollectionMemberships.bind(repository)
  const corruptedMembershipRead = new Proxy(repository, { get(target, property) {
    if (property === 'listCollectionMemberships') return (pid, id) => {
      const rows = realListMemberships(pid, id)
      return String(id) === nestedChildId ? [...rows, { collectionId: nestedChildId,
        memberRef: { type: 'collection', id: nestedRootId }, relationId: 'read-only-cycle-fault', addedAt: '' }] : rows
    }
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const cycleAdapter = owners.createNativeCollectionSpace({ repository: corruptedMembershipRead, projectId,
    spatial: facade.spatial, projectionHost, fail: statusError })
  await assert.rejects(cycleAdapter.apply({ canvasId, collectionId: nestedRootId, collectionNodeId: nestedNodeId, expectedVersion: cycleVersion }),
    error => error.status === 409 && error.code === 'COLLECTION_MEMBERSHIP_CYCLE')
  assert.equal((await facade.spatial.read(canvasId)).version, cycleVersion, 'cycle read fault must refuse before any command batch')
  report.cases.push('Core membership service blocked a real cycle attempt; adapter also refused an injected corrupt cycle read before Huabu execution')

  const finalRunCount = repository.getProjectRuns(projectId, 100).length
  assert.equal(finalRunCount, initialRunCount, 'spatial grouping must not create or execute a Run')
  assert.deepEqual(report.network.blockedRequests, [], 'no external provider, bridge, or non-loopback request is permitted')
  const collectionList = await coreRequest('GET', `/projects/${encodeURIComponent(projectId)}/collections`)
  assert.equal(collectionList.status, 200)
  const finalCanvas = await facade.spatial.read(canvasId)
  report.final = { canvasId, version: (await facade.spatial.read(canvasId)).version, runCount: finalRunCount,
    coreCollectionCount: collectionList.body?.value?.length,
    coreArtifactCount: repository.getArtifacts(projectId).length,
    mainCanvasNodeCount: finalCanvas.state.nodes.length }
  report.passed = true
} catch (error) {
  report.failure = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
  process.exitCode = 1
} finally {
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.closeError = error instanceof Error ? error.message : String(error) }
  }
  report.network.activeListenersAtClose = [...activeLoopbackOrigins()]
  report.cleanup.listenersReleased = report.network.activeListenersAtClose.length === 0
  globalThis.fetch = originalFetch
  const runtimeResolved = path.resolve(runtimeRoot)
  try {
    assertContained(reportRoot, runtimeResolved)
    if (report.cleanup.facadeClosed && report.cleanup.listenersReleased) {
      await rm(runtimeResolved, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    }
  } catch (error) {
    report.cleanup.removalError = error instanceof Error ? error.message : String(error)
    process.exitCode = 1
    report.passed = false
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
