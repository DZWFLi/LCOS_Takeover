import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'
import { currentGen2Root } from '../lab/current-gen2-resources.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-arrange')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const report = {
  at: new Date().toISOString(), reportPath, runtimeRoot, test: 'native-collection-arrange',
  implementation: 'real isolated Core + original Gen2 collectionHostMemberPlacement + Huabu planNodeFramePlacement and same-O8 arrange replay',
  boundary: 'synthetic Core-owned materials only; Collection membership is read-only except one explicit fixture removal after Apply; only Huabu spatial frame/member geometry is arranged',
  currentRoot: currentGen2Root, originalUserDatabaseOpened: false, live17881Accessed: false,
  providerOrBridgeStarted: false, rawSqlUsed: false, schemaChanged: false,
  network: { allowedCoreRequests: [], rejectedDeadSemanticRequests: [], blockedRequests: [], activeListeners: [], activeListenersAtClose: [] },
  fixture: {}, cases: [], measurements: {}, cleanup: { facadeClosed: false, listenersReleased: false, runtimeRemoved: false }, passed: false,
}
const originalFetch = globalThis.fetch.bind(globalThis)
const coreOrigins = new Set()
let facade
let coreOrigin
let repository
let fetchInstalled = false
let bootstrapping = false

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
    || path.resolve(resolvedParent, relative) !== resolvedTarget) throw new Error(`Refusing cleanup outside owned runtime: ${resolvedTarget}`)
}
function installFetchBoundary() {
  if (fetchInstalled) return
  fetchInstalled = true
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.rejectedDeadSemanticRequests.push({ method, path: url.pathname })
      throw new Error('Pinned dead semantic endpoint; no model/provider access is allowed.')
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
    throw new Error('Only the test-owned isolated Core loopback listener and pinned dead semantic endpoint are permitted.')
  }
}
function relativeImport(fromFile, targetFile) {
  let value = path.relative(path.dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = './' + value
  return value
}
async function coreRequest(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const payload = (response.headers.get('content-type') || '').includes('application/json')
    ? await response.json() : Buffer.from(await response.arrayBuffer())
  return { status: response.status, body: payload }
}
async function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
}
function valueOf(result) { return result?.body?.data ?? result?.body?.value ?? result?.body }
function statusError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error }
function parentWire(slice) { return slice.parentId ?? '' }
function clone(value) { return structuredClone(value) }
function absolutePosition(snapshot, id) {
  const nodes = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
  const seen = new Set()
  let currentId = id, x = 0, y = 0
  while (currentId) {
    if (seen.has(currentId)) throw new Error(`Spatial parent cycle at ${currentId}`)
    seen.add(currentId)
    const node = nodes.get(currentId)
    if (!node) throw new Error(`Missing spatial node ${currentId}`)
    x += Number(node.position?.x ?? 0)
    y += Number(node.position?.y ?? 0)
    currentId = node.parentId ? String(node.parentId) : ''
  }
  return { x, y }
}
function assertNearPoint(actual, expected, message) {
  const withinHuabuRoundoff = (left, right) => Math.abs(left - right) <= Math.min(1e-7,
    Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right)))
  assert.ok(actual && expected
    && withinHuabuRoundoff(actual.x, expected.x)
    && withinHuabuRoundoff(actual.y, expected.y),
  `${message ?? 'points should match'}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
}

function frameSizeAndHeightModes(snapshot, ids) {
  const byId = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
  return ids.slice().sort().map(id => {
    const node = byId.get(id)
    assert.ok(node, `snapshot must retain node ${id}`)
    return { id, frameSizing: node.data?.frameSizing, heightMode: node.data?.heightMode }
  })
}

const providerEnv = ['LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT',
  'LCOS_INTELLIGENCE_PROVIDERS', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY',
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_API_KEY',
  'GROQ_BASE_URL', 'GROQ_API_KEY', 'MISTRAL_BASE_URL', 'MISTRAL_API_KEY', 'XAI_BASE_URL', 'XAI_API_KEY',
  'QWEN_BASE_URL', 'DASHSCOPE_API_KEY', 'ZHIPU_BASE_URL', 'ZHIPU_API_KEY', 'MOONSHOT_BASE_URL',
  'SILICONFLOW_BASE_URL', 'SILICONFLOW_API_KEY', 'MINIMAX_BASE_URL', 'HUNYUAN_BASE_URL', 'BEDROCK_API_KEY',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'LMSTUDIO_BASE_URL', 'LCOS_BRIDGE_URL']

try {
  const currentPlanPath = path.join(currentGen2Root, 'huabu/packages/shared/src/canvas-engine/commands/planNodeFramePlacement.ts')
  const copiedPlanPath = path.join(root, 'lcos/huabu/packages/shared/src/canvas-engine/commands/planNodeFramePlacement.ts')
  const [currentPlanBytes, copiedPlanBytes] = await Promise.all([readFile(currentPlanPath), readFile(copiedPlanPath)])
  report.plannerProvenance = { currentPlanPath, copiedPlanPath, byteLength: currentPlanBytes.length,
    currentEqualsCopied: currentPlanBytes.equals(copiedPlanBytes) }
  assert.equal(currentPlanBytes.equals(copiedPlanBytes), true, 'the copied Huabu placement planner must match current Gen2 bytes')

  for (const key of providerEnv) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  assert.equal(activeLoopbackOrigins().size, 0, 'arrange test must not inherit a service listener')
  installFetchBoundary()

  const ownersEntry = path.join(runtimeRoot, 'native-collection-arrange-test-owners.ts')
  await writeFile(ownersEntry, [
    `export { startSurfaceCoreFacade } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/surface-core-facade.ts')))}`,
    `export { Gen2Host } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/host/projectionFacade.ts')))}`,
    `export { HttpClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/client.ts')))}`,
    `export { CoreArtifactClient } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lcos/apps/web-gen2/src/backend/artifacts.ts')))}`,
    `export { createHeadlessProjectionPort } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/headless-projection-port.ts')))}`,
    `export { createNativeCollectionSpace } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space.ts')))}`,
    `export { createNativeCollectionSpaceHistory } from ${JSON.stringify(relativeImport(ownersEntry, path.join(root, 'lab/pilot/native-collection-space-history.ts')))}`,
  ].join('\n'), 'utf8')
  const ownersBundle = path.join(runtimeRoot, 'native-collection-arrange-test-owners.mjs')
  await buildPilotEntry(path.relative(root, ownersEntry), ownersBundle)
  const owners = await import(pathToFileURL(ownersBundle).href)

  bootstrapping = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, fullIntegration: true })
  coreOrigin = String(facade.core.origin)
  repository = facade.core.repository
  assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false)
  coreOrigins.add(coreOrigin)
  assert.deepEqual([...activeLoopbackOrigins()], [coreOrigin])
  report.network.activeListeners.push(coreOrigin)
  bootstrapping = false

  const projectId = String(facade.core.projectId)
  const workspace = facade.workspaces.find(row => row.preferredSurface === 'main')
  const rootScope = repository.getScopes(projectId).find(row => row.kind === 'root')
  assert.ok(workspace?.canvasId && rootScope)
  const canvasId = String(workspace.canvasId)
  const hosts = new Map()
  const projectionHost = targetCanvas => {
    if (targetCanvas !== canvasId) throw new Error('This fixture exposes only its one synthetic Main Canvas.')
    let host = hosts.get(targetCanvas)
    if (!host) {
      host = new owners.Gen2Host({ projectId, http: new owners.HttpClient({ baseUrl: coreOrigin }),
        rfs: owners.createHeadlessProjectionPort({ canvasId, coreOrigin, read: facade.spatial.read, execute: facade.spatial.execute }) })
      hosts.set(targetCanvas, host)
    }
    return host
  }
  const host = projectionHost(canvasId)
  const artifacts = new owners.CoreArtifactClient(new owners.HttpClient({ baseUrl: coreOrigin }))
  const makeText = suffix => artifacts.createTextArtifact(projectId, {
    title: `Native Collection arrange ${suffix}`, body: `合成空间排列材料 ${suffix}\nARRANGE_TAIL_${suffix}_雪`, scopeId: String(rootScope.id),
  })
  const ownerMaterial = await makeText('owner')
  const lockedMaterial = await makeText('locked')
  const admittedMaterial = await makeText('admitted')
  const sharedMaterial = await makeText('shared-parent')
  const unprojectedMaterial = await makeText('unprojected')
  const collectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection arrange isolated fixture', members: [{ type: 'artifact', id: String(ownerMaterial.artifactId) }],
  })
  assert.equal(collectionResponse.status, 201, JSON.stringify(collectionResponse.body))
  const collectionId = String(collectionResponse.body?.value?.id ?? '')
  assert.ok(collectionId)
  const accepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

  const projectionInput = material => ({ projectId, artifactId: String(material.artifactId), kind: 'text', title: material.title,
    fileRecordId: String(material.fileRecordId), currentRevisionId: String(material.revisionId), mimeType: 'text/markdown',
    size: { width: 260, height: 180 } })
  const ownerProjection = await host.projectArtifacts([projectionInput(ownerMaterial)])
  assert.equal(ownerProjection.length, 1)
  const ownerNodeId = String(ownerProjection[0].spatialId)
  const ownerCarrierReceipt = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
  assert.equal(ownerCarrierReceipt.status, 200, JSON.stringify(ownerCarrierReceipt.body))
  const collectionNodeId = String(valueOf(ownerCarrierReceipt).binding.spatialId)
  const failure = (status, code, message) => statusError(status, code, message)
  const collectionSpace = owners.createNativeCollectionSpace({ repository, projectId, spatial: facade.spatial,
    projectionHost, fail: failure })
  const initial = await collectionSpace.prepare({ canvasId, collectionId, collectionNodeId })
  assert.equal(initial.created, true)
  const firstOpen = await collectionSpace.apply({ canvasId, collectionId, collectionNodeId, expectedVersion: initial.sourceVersion })
  assert.equal(firstOpen.created, true)
  const frameId = String(firstOpen.frame_id)
  assert.ok(frameId)

  for (const material of [lockedMaterial, admittedMaterial, sharedMaterial, unprojectedMaterial]) {
    const member = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`, {
      memberType: 'artifact', memberId: String(material.artifactId),
    })
    assert.equal(member.status, 200, JSON.stringify(member.body))
  }
  const extraProjections = await host.projectArtifacts([lockedMaterial, admittedMaterial, sharedMaterial].map(projectionInput))
  const [lockedProjection, admittedProjection, sharedProjection] = extraProjections
  const lockedNodeId = String(lockedProjection?.spatialId ?? '')
  const admittedNodeId = String(admittedProjection?.spatialId ?? '')
  const sharedNodeId = String(sharedProjection?.spatialId ?? '')
  assert.ok(lockedNodeId && admittedNodeId && sharedNodeId)

  const lockedReceipt = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_LOCKED', items: [{ nodeId: lockedNodeId, locked: true }] }])
  assert.equal(lockedReceipt.results.every(result => result.applied === true), true, JSON.stringify(lockedReceipt.results))
  const otherCollectionResponse = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/collections`, {
    title: 'Native Collection arrange shared-parent fixture', members: [{ type: 'artifact', id: String(sharedMaterial.artifactId) }],
  })
  assert.equal(otherCollectionResponse.status, 201, JSON.stringify(otherCollectionResponse.body))
  const otherCollectionId = String(otherCollectionResponse.body?.value?.id ?? '')
  assert.ok(otherCollectionId)
  const otherAccepted = await coreRequest('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
    schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: otherCollectionId }], targetRef: { kind: 'main' },
  })
  assert.equal(otherAccepted.status, 200, JSON.stringify(otherAccepted.body))
  const otherCarrierResponse = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId: otherCollectionId })
  assert.equal(otherCarrierResponse.status, 200, JSON.stringify(otherCarrierResponse.body))
  const otherCollectionNodeId = String(valueOf(otherCarrierResponse).binding.spatialId)
  const otherPrepared = await collectionSpace.prepare({ canvasId, collectionId: otherCollectionId, collectionNodeId: otherCollectionNodeId })
  const otherFirstOpen = await collectionSpace.apply({ canvasId, collectionId: otherCollectionId,
    collectionNodeId: otherCollectionNodeId, expectedVersion: otherPrepared.sourceVersion })
  assert.equal(otherFirstOpen.created, true)
  const sharedFrameId = String(otherFirstOpen.frame_id)
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(node => String(node.id) === sharedNodeId)?.parentId, sharedFrameId)
  const beforeMessy = await facade.spatial.read(canvasId)
  const beforeMessyOwnerAbsolute = absolutePosition(beforeMessy, ownerNodeId)
  const messy = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: ownerNodeId, position: { x: 520, y: -375 } },
  ] }])
  assert.equal(messy.results.every(result => result.applied === true), true, JSON.stringify(messy.results))
  const messyReadback = await facade.spatial.read(canvasId)
  const messyOwnerAbsolute = absolutePosition(messyReadback, ownerNodeId)
  report.measurements.messyExistingChild = { localPosition: messyReadback.state.nodes.find(node => String(node.id) === ownerNodeId)?.position,
    framePosition: messyReadback.state.nodes.find(node => String(node.id) === frameId)?.position,
    beforeWorldPosition: beforeMessyOwnerAbsolute, afterWorldPosition: messyOwnerAbsolute }
  assert.notDeepEqual(messyOwnerAbsolute, beforeMessyOwnerAbsolute, 'Huabu hug-fit may absorb the local offset into the frame origin; verify world position instead')

  const collectionSpaceHistory = owners.createNativeCollectionSpaceHistory({ repository, projectId, spatial: facade.spatial,
    collectionSpace, projectNativeNodes: async (targetCanvas, snapshot) => {
      assert.equal(targetCanvas, canvasId)
      const response = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
      assert.equal(response.status, 200, JSON.stringify(response.body))
      const existing = new Map(valueOf(response).nodes.map(node => [String(node.id), node]))
      return snapshot.state.nodes.map(node => {
        const prior = existing.get(String(node.id))
        assert.ok(prior, `native projection must resolve the actual existing node ${node.id}`)
        const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? prior.measured?.width ?? 0)
        const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? prior.measured?.height ?? 0)
        return { ...prior, position: { ...node.position }, parent_id: node.parentId ?? '',
          measured: { width, height }, width, height }
      })
    }, fail: failure })

  const beforeMembership = repository.listCollectionMemberships(projectId, collectionId).map(row => ({ ...row.memberRef }))
  const beforeRuns = repository.getProjectRuns(projectId, 100).length
  const beforeArtifacts = [ownerMaterial, lockedMaterial, admittedMaterial, sharedMaterial, unprojectedMaterial]
    .map(material => repository.getArtifact(String(material.artifactId)))
  const beforeFiles = [ownerMaterial, admittedMaterial].map(material => repository.getFileRecord(String(material.fileRecordId)))
  const beforeVersion = (await facade.spatial.read(canvasId)).version
  const prepared = await collectionSpace.prepareArrangement({ canvasId, collectionId, collectionNodeId })
  assert.equal(prepared.sameFrame, true)
  assert.equal(prepared.frameId, frameId)
  assert.equal(prepared.sourceVersion, beforeVersion)
  assert.equal(prepared.admittedIds.includes(admittedNodeId), true, 'new free canonical member must be admitted by the original planner')
  assert.equal(prepared.admittedIds.includes(lockedNodeId), false, 'locked member is excluded')
  assert.equal(prepared.admittedIds.includes(sharedNodeId), false, 'member under another parent is not stolen')
  assert.equal(prepared.unprojectedMemberCount, 1, 'unprojected canonical Collection member stays absent from Canvas planning')
  assert.ok(prepared.blockedNodeIds.includes(lockedNodeId))
  assert.ok(prepared.blockedNodeIds.includes(sharedNodeId))
  assert.equal(prepared.nodeIds.includes(admittedNodeId), true)
  assert.equal(prepared.nodeIds.includes(lockedNodeId), false)
  assert.equal(prepared.nodeIds.includes(sharedNodeId), false)
  assert.equal(prepared.nodeIds.includes(unprojectedMaterial.artifactId), false)
  const changedGeometry = prepared.changedIds
  report.measurements = { frameId, before: prepared.before.find(slice => slice.id === frameId)?.size,
    after: prepared.after.find(slice => slice.id === frameId)?.size, changedIds: changedGeometry,
    admittedIds: prepared.admittedIds, blockedNodeIds: prepared.blockedNodeIds, unprojectedMemberCount: prepared.unprojectedMemberCount,
    beforeSlices: prepared.before, afterSlices: prepared.after,
    messyExistingChild: report.measurements.messyExistingChild,
    arrangedExistingChildWorldPosition: absolutePosition(prepared.afterSnapshot, ownerNodeId) }
  assert.ok(changedGeometry.includes(admittedNodeId), 'the new free member receives a parent/position update')

  const projectNativeNodes = async (snapshot) => {
    const response = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    const existing = new Map(valueOf(response).nodes.map(node => [String(node.id), node]))
    return snapshot.state.nodes.map(node => {
      const prior = existing.get(String(node.id))
      assert.ok(prior, `exact existing native node ${node.id} must be projectable`)
      const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? prior.measured?.width ?? 0)
      const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? prior.measured?.height ?? 0)
      return { ...prior, position: { ...node.position }, parent_id: node.parentId ?? '',
        measured: { width, height }, width, height }
    })
  }
  const operation = phase => ({ version: 1, operationId: `collection-arrange-${process.pid}-${Date.now()}`,
    kind: 'collection-arrange', phase, space: { projectId, canvasId, workspaceId: String(workspace.id), collectionId,
      collectionNodeId, frameId, sourceVersion: prepared.sourceVersion, before: prepared.before, after: prepared.after } })
  const historyScopeIds = prepared.before.map(slice => slice.id)
  const beforeFrameSizeAndHeightModes = frameSizeAndHeightModes(prepared.beforeSnapshot, historyScopeIds)
  const beforeNative = new Map((await projectNativeNodes(prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const afterNative = new Map((await projectNativeNodes(prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const actions = (from, to) => [{ action: 'update', updates: prepared.changedIds.map(id => {
    const source = from.get(id), target = to.get(id)
    assert.ok(source && target, `changed native DTO ${id} must exist on both sides`)
    return { id, canvas_id: canvasId, type: source.type, data: clone(source.data), position: clone(target.position),
      measured: clone(target.measured), parent_id: target.parent_id ?? '' }
  }) }]
  const applyActions = actions(beforeNative, afterNative)
  const expectedRevisions = Object.fromEntries([[ownerNodeId, ownerMaterial], [admittedNodeId, admittedMaterial]]
    .map(([nodeId, material]) => [nodeId, String(material.revisionId)]))
  const applyReceipt = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: prepared.sourceVersion,
    operation: operation('apply'), actions: applyActions, expectedRevisions })
  assert.equal(applyReceipt.arranged, true)
  assert.equal(applyReceipt.created, false)
  assert.equal(applyReceipt.frame_id, frameId)
  assert.equal(applyReceipt.to_version, prepared.sourceVersion + 1, 'the exact original geometry/parent command batch is one Canvas version')
  const afterApply = await facade.spatial.read(canvasId)
  assert.equal(afterApply.version, applyReceipt.to_version)
  assert.deepEqual(frameSizeAndHeightModes(afterApply, historyScopeIds), beforeFrameSizeAndHeightModes,
    'Apply changes only geometry/parent; frameSizing and heightMode remain authored-data exact')
  for (const id of [ownerNodeId, admittedNodeId]) {
    const node = afterApply.state.nodes.find(candidate => String(candidate.id) === id)
    const target = prepared.after.find(slice => slice.id === id)
    assert.equal(node?.parentId, frameId)
    assert.deepEqual(node?.position, target.position)
  }
  assert.equal(afterApply.state.nodes.find(node => String(node.id) === lockedNodeId)?.parentId ?? null, null)
  assert.equal(afterApply.state.nodes.find(node => String(node.id) === sharedNodeId)?.parentId, sharedFrameId)
  assert.ok(afterApply.state.nodes.some(node => node.type === 'frame' && node.id === frameId))
  report.cases.push('original Gen2 arrange admitted the exact free canonical member, tidied the existing messy child, and committed same-frame Huabu state in one version')
  report.cases.push('locked/shared-parent projected members stayed outside the arrange scope; the unprojected Collection member produced no Canvas node')

  const stale = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: prepared.sourceVersion,
    operation: operation('apply'), actions: applyActions, expectedRevisions }).then(() => null, error => error)
  assert.equal(stale?.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, applyReceipt.to_version)
  report.cases.push('stale Canvas CAS refused a repeated arrange without a second spatial version')
  const forgedActions = clone(applyActions)
  forgedActions[0].updates[0].data = { ...forgedActions[0].updates[0].data, title: 'forged material title' }
  const forged = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: applyReceipt.to_version,
    operation: operation('apply'), actions: forgedActions, expectedRevisions }).then(() => null, error => error)
  assert.equal(forged?.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, applyReceipt.to_version)
  report.cases.push('forged material DTO/data/title in O8 action was rejected before any Canvas write')

  const noOpPrepared = await collectionSpace.prepareArrangement({ canvasId, collectionId, collectionNodeId })
  assert.deepEqual(noOpPrepared.changedIds, [], 'the original planner is stable after Arrange')
  const noOpOperation = { ...operation('apply'), space: { projectId, canvasId, workspaceId: String(workspace.id), collectionId,
    collectionNodeId, frameId, sourceVersion: noOpPrepared.sourceVersion,
    before: noOpPrepared.before, after: noOpPrepared.after } }
  const noOp = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: noOpPrepared.sourceVersion,
    operation: noOpOperation, actions: [], expectedRevisions })
  assert.equal(noOp.idempotent, true)
  assert.equal(noOp.to_version, noOpPrepared.sourceVersion)
  assert.equal((await facade.spatial.read(canvasId)).version, noOpPrepared.sourceVersion)
  report.cases.push('stable Arrange produced an empty O8 history operation and zero Huabu batch/version changes')

  const removeMember = await coreRequest('DELETE', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(collectionId)}/members`, {
    memberType: 'artifact', memberId: String(admittedMaterial.artifactId),
  })
  assert.equal(removeMember.status, 200, JSON.stringify(removeMember.body))
  assert.equal(repository.getCollectionMembership(projectId, collectionId, 'artifact', String(admittedMaterial.artifactId)), undefined)
  const undoNativeFrom = new Map((await projectNativeNodes(prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const undoNativeTo = new Map((await projectNativeNodes(prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const undoReceipt = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: noOpPrepared.sourceVersion,
    operation: operation('undo'), actions: actions(undoNativeFrom, undoNativeTo), expectedRevisions })
  assert.equal(undoReceipt.arranged, true)
  assert.equal(undoReceipt.created, false)
  assert.equal(undoReceipt.frame_id, frameId, 'Undo of arrange keeps the same frame rather than deleting it')
  const afterUndo = await facade.spatial.read(canvasId)
  assert.equal(afterUndo.version, undoReceipt.to_version)
  assert.deepEqual(frameSizeAndHeightModes(afterUndo, historyScopeIds), beforeFrameSizeAndHeightModes,
    'Undo preserves frameSizing and heightMode without manufacturing authored-mode changes')
  assert.equal(afterUndo.state.nodes.some(node => node.type === 'frame' && node.id === frameId), true)
  assertNearPoint(afterUndo.state.nodes.find(node => String(node.id) === ownerNodeId)?.position,
    prepared.before.find(slice => slice.id === ownerNodeId).position, 'Undo restores existing child geometry within Huabu floating-point fit precision')
  assert.equal(afterUndo.state.nodes.find(node => String(node.id) === ownerNodeId)?.parentId, frameId)
  assertNearPoint(afterUndo.state.nodes.find(node => String(node.id) === admittedNodeId)?.position,
    prepared.before.find(slice => slice.id === admittedNodeId).position, 'Undo restores admitted child world geometry')
  assert.equal(afterUndo.state.nodes.find(node => String(node.id) === admittedNodeId)?.parentId ?? null, null)
  assert.equal(repository.getCollectionMembership(projectId, collectionId, 'artifact', String(admittedMaterial.artifactId)), undefined,
    'O8 Undo restores only spatial state; it does not recreate Core Collection membership')
  report.cases.push('Undo restored the exact O8 child parent/geometry while keeping the same frame and leaving the later Core membership removal intact')

  const redoReceipt = await collectionSpaceHistory.applyOperation({ canvasId, expectedVersion: undoReceipt.to_version,
    operation: operation('redo'), actions: actions(undoNativeTo, undoNativeFrom), expectedRevisions })
  assert.equal(redoReceipt.arranged, true)
  assert.equal(redoReceipt.created, false)
  assert.equal(redoReceipt.frame_id, frameId)
  const afterRedo = await facade.spatial.read(canvasId)
  assert.equal(afterRedo.version, redoReceipt.to_version)
  assert.deepEqual(frameSizeAndHeightModes(afterRedo, historyScopeIds), beforeFrameSizeAndHeightModes,
    'Redo preserves frameSizing and heightMode exactly')
  assert.equal(afterRedo.state.nodes.find(node => String(node.id) === admittedNodeId)?.parentId, frameId)
  assertNearPoint(afterRedo.state.nodes.find(node => String(node.id) === admittedNodeId)?.position,
    prepared.after.find(slice => slice.id === admittedNodeId).position, 'Redo restores admitted child geometry within Huabu floating-point fit precision')
  assert.equal(repository.getCollectionMembership(projectId, collectionId, 'artifact', String(admittedMaterial.artifactId)), undefined,
    'Redo restores the recorded O8 set and never restores Core membership')
  report.cases.push('Redo replayed the exact recorded admitted-child geometry/parent under the same Collection frame without consulting current membership')

  const beforeLargeCoordinateProbe = await facade.spatial.read(canvasId)
  const frameBeforeProbe = beforeLargeCoordinateProbe.state.nodes.find(node => String(node.id) === frameId)
  assert.ok(frameBeforeProbe && frameBeforeProbe.position)
  const movedToLargeCoordinate = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: frameId, position: { x: 1_000_000_000, y: -1_000_000_000 } },
  ] }])
  assert.equal(movedToLargeCoordinate.results.every(result => result.applied === true), true, JSON.stringify(movedToLargeCoordinate.results))
  const largeCoordinateState = await facade.spatial.read(canvasId)
  const largeFrame = largeCoordinateState.state.nodes.find(node => String(node.id) === frameId)
  assert.ok(Math.abs(largeFrame?.position?.x ?? 0) >= 1_000_000_000 - 1e-7,
    `fixture must exercise large coordinates, got ${JSON.stringify(largeFrame?.position)}`)
  const driftOperation = clone(operation('redo'))
  const driftFrame = driftOperation.space.after.find(slice => slice.id === frameId)
  assert.ok(driftFrame)
  driftFrame.position.x = largeFrame.position.x + 0.01
  const versionBeforeDriftAttempt = largeCoordinateState.version
  const largeCoordinateDrift = await collectionSpaceHistory.applyOperation({ canvasId,
    expectedVersion: versionBeforeDriftAttempt, operation: driftOperation, actions: [], expectedRevisions }).then(() => null, error => error)
  assert.equal(largeCoordinateDrift?.status, 409)
  assert.equal(largeCoordinateDrift?.code, 'COLLECTION_ARRANGE_STATE_CONFLICT',
    'a 0.01-coordinate O8 drift at 1e9 must fail in the arrange-side validator, not pass on a relative epsilon')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBeforeDriftAttempt,
    'large-coordinate drift rejection must not write a Canvas version')
  const restoreFramePosition = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: frameId, position: clone(frameBeforeProbe.position) },
  ] }])
  assert.equal(restoreFramePosition.results.every(result => result.applied === true), true, JSON.stringify(restoreFramePosition.results))
  const afterLargeCoordinateRestore = await facade.spatial.read(canvasId)
  assert.deepEqual(afterLargeCoordinateRestore.state.nodes.find(node => String(node.id) === frameId)?.position,
    frameBeforeProbe.position, 'test-only high-coordinate probe restores the exact original frame position')
  assert.deepEqual(frameSizeAndHeightModes(afterLargeCoordinateRestore, historyScopeIds), beforeFrameSizeAndHeightModes)
  report.measurements.largeCoordinateDrift = { at: largeFrame.position, rejectedOffset: 0.01,
    rejectionCode: largeCoordinateDrift.code, noWriteVersion: versionBeforeDriftAttempt,
    restoredPosition: afterLargeCoordinateRestore.state.nodes.find(node => String(node.id) === frameId)?.position }
  report.cases.push('arrange-local ULP tolerance rejected a 0.01 position drift at 1e9 coordinates and restored the isolated probe exactly')

  const afterMembership = repository.listCollectionMemberships(projectId, collectionId).map(row => ({ ...row.memberRef }))
  assert.equal(afterMembership.some(ref => ref.type === 'artifact' && ref.id === String(admittedMaterial.artifactId)), false)
  assert.equal(repository.getProjectRuns(projectId, 100).length, beforeRuns)
  assert.equal(beforeRuns, 0)
  for (const before of beforeArtifacts) {
    assert.deepEqual(repository.getArtifact(String(before.id)), before, 'spatial arrange must not change canonical Artifact rows')
  }
  for (const before of beforeFiles) assert.deepEqual(repository.getFileRecord(String(before.id)), before, 'spatial arrange must not change FileRecords')
  assert.deepEqual(afterMembership, beforeMembership.filter(ref => !(ref.type === 'artifact' && ref.id === String(admittedMaterial.artifactId))))
  assert.deepEqual(report.network.blockedRequests, [])
  report.fixture = { projectId, canvasId, workspaceId: String(workspace.id), collectionId, collectionNodeId,
    otherCollectionId, otherCollectionNodeId, frameId,
    ownerNodeId, lockedNodeId, admittedNodeId, sharedNodeId, sharedFrameId,
    unprojectedArtifactId: String(unprojectedMaterial.artifactId), beforeRuns, afterRuns: repository.getProjectRuns(projectId, 100).length }
  report.final = { canvasVersion: afterLargeCoordinateRestore.version, collectionMemberCountBefore: beforeMembership.length,
    collectionMemberCountAfter: afterMembership.length, frameIdPreserved: afterRedo.state.nodes.some(node => node.id === frameId),
    providerExecutionStarted: false }
  report.cases.push('canonical Artifact rows, material Revision/FileRecord identity, non-member blockers, and zero Run count were preserved')
  report.passed = true
} catch (error) {
  report.failure = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined,
    status: error?.status, code: error?.code }
  report.passed = false
} finally {
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.closeError = error instanceof Error ? error.message : String(error) }
  }
  report.network.activeListenersAtClose = [...activeLoopbackOrigins()]
  report.cleanup.listenersReleased = report.network.activeListenersAtClose.length === 0
  if (fetchInstalled) globalThis.fetch = originalFetch
  try {
    const resolvedRuntime = path.resolve(runtimeRoot)
    assertContained(reportRoot, resolvedRuntime)
    if (report.cleanup.facadeClosed && report.cleanup.listenersReleased) {
      await rm(resolvedRuntime, { recursive: true, force: true })
      report.cleanup.runtimeRemoved = true
    }
  } catch (error) {
    report.cleanup.removalError = error instanceof Error ? error.message : String(error)
    report.passed = false
  }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
