import assert from 'node:assert/strict'
import { Server as NetServer } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportRoot = path.join(root, '.runtime', 'native-collection-arrange-nested')
await mkdir(reportRoot, { recursive: true })
const reportPath = path.join(reportRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const runtimeRoot = await mkdtemp(path.join(reportRoot, 'case-'))
const blockedPorts = new Set(['17877', '17878', '17879', '17880', '17881', '43122'])
const report = { at: new Date().toISOString(), reportPath, runtimeRoot,
  test: 'native-collection-arrange-nested', mode: 'real isolated Core Assembly/Projection + original Huabu executor',
  boundary: 'synthetic project only; no live service, user database, provider, Run, raw SQL, or schema mutation',
  network: { allowedCore: [], deadSemantic: [], blocked: [], listenersAtClose: [] },
  fixture: {}, cases: [], measurements: {}, warnings: [],
  cleanup: { facadeClosed: false, listenersReleased: false, runtimeRemoved: false }, passed: false }

const originalFetch = globalThis.fetch.bind(globalThis)
const activeCoreOrigins = new Set()
let facade
let coreOrigin
let bootstrapping = false

function isLoopback(hostname) { return ['127.0.0.1', 'localhost', '[::1]'].includes(hostname) }
function activeOrigins() {
  const found = new Set()
  for (const handle of process._getActiveHandles()) {
    if (!(handle instanceof NetServer) || !handle.listening) continue
    const address = handle.address()
    if (!address || typeof address === 'string' || !isLoopback(address.address) || !Number.isInteger(address.port)) continue
    found.add(`http://${address.address.includes(':') ? `[${address.address}]` : address.address}:${address.port}`)
  }
  return found
}
function relativeImport(fromFile, targetFile) {
  let value = path.relative(path.dirname(fromFile), targetFile).replaceAll('\\', '/')
  if (!value.startsWith('.')) value = `./${value}`
  return value
}
function assertContained(parent, target) {
  const resolvedParent = path.resolve(parent), resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedParent, resolvedTarget)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.resolve(resolvedParent, relative) !== resolvedTarget) throw new Error(`Refusing cleanup outside owned test runtime: ${resolvedTarget}`)
}
function installFetchBoundary() {
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
    const url = new URL(address)
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin === 'http://127.0.0.1:1') {
      report.network.deadSemantic.push({ method, path: url.pathname })
      throw new Error('Pinned dead semantic endpoint; provider/model access is prohibited in this test.')
    }
    const active = activeOrigins()
    if (url.protocol === 'http:' && isLoopback(url.hostname) && !blockedPorts.has(url.port)
      && ((activeCoreOrigins.has(url.origin) && active.has(url.origin))
        || (bootstrapping && active.size === 1 && active.has(url.origin)))) {
      const response = await originalFetch(input, init)
      report.network.allowedCore.push({ method, path: url.pathname, status: response.status })
      return response
    }
    report.network.blocked.push({ method, origin: url.origin, path: url.pathname })
    throw new Error('Only this process-owned temporary Core and the pinned dead semantic endpoint are allowed.')
  }
}
async function coreJson(method, pathname, body) {
  const response = await fetch(`${coreOrigin}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const json = await response.json()
  return { status: response.status, body: json?.value ?? json }
}
async function facadeCall(method, pathname, body) {
  return facade.handle({ method, pathname, url: new URL(pathname, coreOrigin), body })
}
function valueOf(result) { return result?.body?.data ?? result?.body?.value ?? result?.body }
function fail(status, code, message) { const error = new Error(message); error.status = status; error.code = code; throw error }
function nodeSize(node) {
  return { width: Number(node.measured?.width ?? node.width ?? node.style?.width ?? 0),
    height: Number(node.measured?.height ?? node.height ?? node.style?.height ?? 0) }
}
function worldPoint(snapshot, id) {
  const nodes = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
  const seen = new Set()
  let cursor = String(id), x = 0, y = 0
  while (cursor) {
    if (seen.has(cursor)) throw new Error(`Spatial parent cycle at ${cursor}`)
    seen.add(cursor)
    const node = nodes.get(cursor)
    if (!node) throw new Error(`Missing spatial node ${cursor}`)
    x += Number(node.position?.x ?? 0)
    y += Number(node.position?.y ?? 0)
    cursor = node.parentId ? String(node.parentId) : ''
  }
  return { x, y }
}
function rectanglesOverlap(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y
}

try {
  for (const key of [
    'HUABU_DATA_DIR', 'HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_CONNECTION_TOKEN', 'HUABU_AGENTLET_ID',
    'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'LCOS_BRIDGE_URL', 'LOCAL_CORE_BRIDGE_PROJECT_ID',
    'LOCAL_CORE_DB_PATH', 'LOCAL_CORE_TEST_PORT', 'LOCAL_CORE_API_TOKEN', 'LOCAL_CORE_DEV_WORKSPACE_ROOT',
    'LOCAL_CORE_ENABLE_MVP_SAMPLE', 'LOCAL_CORE_MVP_SAMPLE_ROOT', 'LOCAL_CORE_ALLOWED_ORIGINS',
    'LCOS_CODEX_AUTO_EXECUTION', 'LCOS_WORKBUDDY_AUTO_EXECUTION', 'LCOS_RECOVERY_TRANSPORT',
    'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR', 'LCOS_OCR_PYTHON', 'LCOS_OLLAMA_URL',
    'LCOS_OLLAMA_EMBED_MODEL', 'LCOS_REPO_ROOT', 'LCOS_SQLITE_VEC_EXTENSION', 'LCOS_RUNTIME_REGISTRY',
    'LCOS_PROJECTS_DIR',
  ]) delete process.env[key]
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'
  process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1'
  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture')
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr')
  assert.equal(activeOrigins().size, 0, 'must not attach to any pre-existing service')
  installFetchBoundary()

  const entry = path.join(runtimeRoot, 'nested-test-owners.ts')
  await writeFile(entry, [
    `export { startSurfaceCoreFacade } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lab/pilot/surface-core-facade.ts')))}`,
    `export { Gen2Host } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lcos/apps/web-gen2/src/host/projectionFacade.ts')))}`,
    `export { HttpClient } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lcos/apps/web-gen2/src/backend/client.ts')))}`,
    `export { CoreArtifactClient } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lcos/apps/web-gen2/src/backend/artifacts.ts')))}`,
    `export { createHeadlessProjectionPort } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lab/pilot/headless-projection-port.ts')))}`,
    `export { createNativeCollectionSpace } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lab/pilot/native-collection-space.ts')))}`,
    `export { createNativeCollectionSpaceHistory } from ${JSON.stringify(relativeImport(entry, path.join(root, 'lab/pilot/native-collection-space-history.ts')))}`,
  ].join('\n'), 'utf8')
  const bundle = path.join(runtimeRoot, 'nested-test-owners.mjs')
  await buildPilotEntry(path.relative(root, entry), bundle)
  const owners = await import(pathToFileURL(bundle).href)
  bootstrapping = true
  facade = await owners.startSurfaceCoreFacade({ runtimeRoot, fullIntegration: true })
  coreOrigin = String(facade.core.origin)
  assert.match(coreOrigin, /^http:\/\/127\.0\.0\.1:\d+$/)
  assert.equal(blockedPorts.has(new URL(coreOrigin).port), false)
  assert.deepEqual([...activeOrigins()], [coreOrigin])
  activeCoreOrigins.add(coreOrigin)
  bootstrapping = false

  const repository = facade.core.repository
  const projectId = String(facade.core.projectId)
  const workspace = facade.workspaces.find(item => item.preferredSurface === 'main')
  const rootScope = repository.getScopes(projectId).find(item => item.kind === 'root')
  assert.ok(workspace?.canvasId && rootScope)
  const canvasId = String(workspace.canvasId)
  const projectionHosts = new Map()
  const projectionHost = targetCanvas => {
    assert.equal(targetCanvas, canvasId)
    let host = projectionHosts.get(targetCanvas)
    if (!host) {
      const http = new owners.HttpClient({ baseUrl: coreOrigin })
      host = new owners.Gen2Host({ projectId, http,
        rfs: owners.createHeadlessProjectionPort({ canvasId, coreOrigin, read: facade.spatial.read, execute: facade.spatial.execute }) })
      projectionHosts.set(targetCanvas, host)
    }
    return host
  }
  const host = projectionHost(canvasId)
  const artifactClient = new owners.CoreArtifactClient(new owners.HttpClient({ baseUrl: coreOrigin }))
  const makeText = suffix => artifactClient.createTextArtifact(projectId, {
    title: `Nested Collection arrange ${suffix}`, body: `嵌套空间合成材料 ${suffix}\nNESTED_ARRANGE_TAIL_${suffix}_雪`,
    scopeId: String(rootScope.id),
  })
  const projectText = async material => {
    const rows = await host.projectArtifacts([{ projectId, artifactId: String(material.artifactId), kind: 'text',
      title: material.title, fileRecordId: String(material.fileRecordId), currentRevisionId: String(material.revisionId),
      mimeType: 'text/markdown', size: { width: 280, height: 180 } }])
    assert.equal(rows.length, 1, `Core-backed text ${material.title} must project exactly once`)
    return String(rows[0].spatialId)
  }
  const createCollection = async (title, members) => {
    const result = await coreJson('POST', `/projects/${encodeURIComponent(projectId)}/collections`, { title, members })
    assert.equal(result.status, 201, JSON.stringify(result.body))
    const id = String(result.body?.id ?? '')
    assert.ok(id)
    return id
  }
  const receiveOnMain = async collectionId => {
    const result = await coreJson('POST', `/projects/${encodeURIComponent(projectId)}/assembly/apply`, {
      schemaVersion: 1, projectId, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef: { kind: 'main' },
    })
    assert.equal(result.status, 200, JSON.stringify(result.body))
  }
  const projectCollectionCarrier = async collectionId => {
    const result = await facadeCall('POST', `/api/lcos/canvases/${encodeURIComponent(canvasId)}/collections:project`, { collectionId })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    return String(valueOf(result).binding.spatialId)
  }
  const space = owners.createNativeCollectionSpace({ repository, projectId, spatial: facade.spatial, projectionHost, fail })
  const largeWorldBeforeParent = { id: 'large-world-parent', type: 'frame', position: { x: 1_000_000_000_000_000, y: 0 } }
  const largeWorldAfterParent = structuredClone(largeWorldBeforeParent)
  const largeWorldBeforeChild = { id: 'large-world-child', type: 'text', position: { x: 1, y: 4 }, parentId: largeWorldBeforeParent.id }
  const largeWorldAfterChild = { ...largeWorldBeforeChild, position: { x: 1.01, y: 4 } }
  const largeWorldBeforeNodes = [largeWorldBeforeParent, largeWorldBeforeChild]
  const largeWorldAfterNodes = [largeWorldAfterParent, largeWorldAfterChild]
  assert.deepEqual(worldPoint({ state: { nodes: largeWorldBeforeNodes } }, largeWorldBeforeChild.id),
    worldPoint({ state: { nodes: largeWorldAfterNodes } }, largeWorldAfterChild.id),
    'large parent coordinates can round distinct local points onto the same IEEE world point')
  assert.equal(space.internal.nestedWorldRoundTripIsNoOp(largeWorldBeforeChild.id, largeWorldBeforeChild,
    largeWorldAfterChild, largeWorldBeforeNodes, largeWorldAfterNodes, fail), false,
  'the hard-capped local ULP guard must reject a 0.01 local offset even when large-world rounding aliases the world point')
  const unchangedOrphan = { id: 'unrelated-orphan', type: 'text', parentId: 'missing-parent', position: { x: 1, y: 2 } }
  assert.equal(space.internal.onlyNestedRoundoffDiffers(unchangedOrphan, structuredClone(unchangedOrphan),
    [unchangedOrphan], [structuredClone(unchangedOrphan)], false, fail), true,
  'an unchanged unrelated orphan outside the operation scope must not require parent-chain resolution')
  report.cases.push('a 0.01 local offset at 1e15-scale was rejected despite world-coordinate rounding; an unchanged unrelated orphan is ignored')

  // Real synthetic Core identity graph: project/open Inner first, then receive
  // a second canonical Collection whose member is Inner plus a canonical sibling.
  const innerOriginal = await makeText('inner-original')
  const innerNewMember = await makeText('inner-new-member')
  const outerSibling = await makeText('outer-sibling')
  const innerCollectionId = await createCollection('Inner nested Collection', [
    { type: 'artifact', id: String(innerOriginal.artifactId) },
  ])
  await receiveOnMain(innerCollectionId)
  const innerOriginalNodeId = await projectText(innerOriginal)
  const innerCarrierId = await projectCollectionCarrier(innerCollectionId)
  const innerPrepared = await space.prepare({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  const innerOpened = await space.apply({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId,
    expectedVersion: innerPrepared.sourceVersion })
  assert.equal(innerOpened.created, true)
  const innerFrameId = String(innerOpened.frame_id)

  const outerCollectionId = await createCollection('Outer nested Collection', [
    { type: 'collection', id: innerCollectionId },
    { type: 'artifact', id: String(outerSibling.artifactId) },
  ])
  await receiveOnMain(outerCollectionId)
  const outerSiblingNodeId = await projectText(outerSibling)
  const outerCarrierId = await projectCollectionCarrier(outerCollectionId)
  const outerPrepared = await space.prepare({ canvasId, collectionId: outerCollectionId, collectionNodeId: outerCarrierId })
  const outerOpened = await space.apply({ canvasId, collectionId: outerCollectionId, collectionNodeId: outerCarrierId,
    expectedVersion: outerPrepared.sourceVersion })
  assert.equal(outerOpened.created, true)
  const outerFrameId = String(outerOpened.frame_id)

  const nestedRead = await facade.spatial.read(canvasId)
  const byId = new Map(nestedRead.state.nodes.map(node => [String(node.id), node]))
  const innerFrame = byId.get(innerFrameId)
  const innerCarrier = byId.get(innerCarrierId)
  const outerSiblingNode = byId.get(outerSiblingNodeId)
  assert.equal(innerFrame?.parentId, outerFrameId, 'opening Outer after Inner nests the original Inner frame')
  assert.equal(innerCarrier?.parentId, outerFrameId, 'Inner carrier remains the companion sibling under Outer')
  assert.equal(outerSiblingNode?.parentId, outerFrameId, 'Outer sibling remains a direct child of Outer')

  const wrongAncestorCarrierSpatial = { withCanvasLock: (targetCanvasId, operation) => facade.spatial.withCanvasLock(targetCanvasId,
    locked => operation({ read: async () => {
      const snapshot = await locked.read()
      return { ...snapshot, state: { ...snapshot.state, nodes: snapshot.state.nodes.map(node => String(node.id) === outerCarrierId
        ? { ...node, parentId: innerFrameId } : node) } }
    }, execute: commands => locked.execute(commands) })) }
  const wrongAncestorCarrierSpace = owners.createNativeCollectionSpace({ repository, projectId,
    spatial: wrongAncestorCarrierSpatial, projectionHost, fail })
  const versionBeforeWrongAncestorCarrier = (await facade.spatial.read(canvasId)).version
  const wrongAncestorCarrier = await wrongAncestorCarrierSpace.prepareArrangement({ canvasId,
    collectionId: innerCollectionId, collectionNodeId: innerCarrierId }).then(() => null, error => error)
  assert.equal(wrongAncestorCarrier?.status, 409)
  assert.equal(wrongAncestorCarrier?.code, 'COLLECTION_ARRANGE_ANCESTOR_CARRIER_PARENT_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBeforeWrongAncestorCarrier,
    'a canonical but wrong-parent ancestor carrier is rejected before any Huabu write')
  report.cases.push('an ancestor Collection carrier with a forged parent was rejected before write')
  const wrongTargetCarrierSpatial = { withCanvasLock: (targetCanvasId, operation) => facade.spatial.withCanvasLock(targetCanvasId,
    locked => operation({ read: async () => {
      const snapshot = await locked.read()
      return { ...snapshot, state: { ...snapshot.state, nodes: snapshot.state.nodes.map(node => String(node.id) === innerCarrierId
        ? { ...node, parentId: null } : node) } }
    }, execute: commands => locked.execute(commands) })) }
  const wrongTargetCarrierSpace = owners.createNativeCollectionSpace({ repository, projectId,
    spatial: wrongTargetCarrierSpatial, projectionHost, fail })
  const versionBeforeWrongTargetCarrier = (await facade.spatial.read(canvasId)).version
  const wrongTargetCarrier = await wrongTargetCarrierSpace.prepareArrangement({ canvasId,
    collectionId: innerCollectionId, collectionNodeId: innerCarrierId }).then(() => null, error => error)
  assert.equal(wrongTargetCarrier?.status, 409)
  assert.equal(wrongTargetCarrier?.code, 'COLLECTION_ARRANGE_TARGET_CARRIER_PARENT_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, versionBeforeWrongTargetCarrier,
    'a canonical target carrier under the wrong parent is rejected before any Huabu write')
  report.cases.push('a target Collection carrier with a forged parent was rejected before write')

  const addMember = await coreJson('POST', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(innerCollectionId)}/members`, {
    memberType: 'artifact', memberId: String(innerNewMember.artifactId),
  })
  assert.equal(addMember.status, 200, JSON.stringify(addMember.body))
  const innerNewMemberNodeId = await projectText(innerNewMember)
  const innerSharedMember = await makeText('inner-shared-parent')
  const addSharedMember = await coreJson('POST', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(innerCollectionId)}/members`, {
    memberType: 'artifact', memberId: String(innerSharedMember.artifactId),
  })
  assert.equal(addSharedMember.status, 200, JSON.stringify(addSharedMember.body))
  const innerSharedNodeId = await projectText(innerSharedMember)
  const parentSharedNode = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_PARENT',
    nodeIds: [innerSharedNodeId], parentId: outerFrameId }])
  assert.equal(parentSharedNode.results.every(result => result.applied === true), true, JSON.stringify(parentSharedNode.results))
  const beforeArrangeFixture = await facade.spatial.read(canvasId)
  assert.equal(beforeArrangeFixture.state.nodes.find(node => String(node.id) === innerSharedNodeId)?.parentId, outerFrameId,
    'a canonical Inner member already parented under the Outer frame must stay a shared sibling, not become free by solver projection')
  const prepared = await space.prepareArrangement({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  const beforePrepare = await facade.spatial.read(canvasId)
  assert.equal(prepared.sameFrame, true)
  assert.equal(prepared.frameId, innerFrameId)
  assert.equal(prepared.sourceVersion, beforePrepare.version)
  assert.ok(prepared.changedIds.includes(innerNewMemberNodeId), 'original Gen2 planner must admit the new free Inner member')
  assert.equal(prepared.admittedIds.includes(innerNewMemberNodeId), true)
  assert.equal(prepared.admittedIds.includes(innerSharedNodeId), false, 'an ancestor-parented canonical member is not stolen by the Inner solver')
  assert.ok(prepared.blockedNodeIds.includes(innerSharedNodeId), 'the parented canonical member is reported as a blocker')
  const exactPreparedChangedIds = prepared.after.flatMap(slice => {
    const before = prepared.before.find(candidate => candidate.id === slice.id)
    assert.ok(before, `prepared scope retains before slice ${slice.id}`)
    return before.parentId !== slice.parentId || before.position.x !== slice.position.x || before.position.y !== slice.position.y
      || before.size.width !== slice.size.width || before.size.height !== slice.size.height ? [slice.id] : []
  })
  assert.deepEqual(prepared.changedIds, exactPreparedChangedIds,
    'a mixed real arrange retains every exact changed id, including companion ULP geometry; only a whole no-op can be classified away')
  assert.deepEqual(prepared.before.map(slice => slice.id).sort(), prepared.after.map(slice => slice.id).sort())
  const scopeIds = new Set(prepared.before.map(slice => slice.id))
  assert.ok(scopeIds.has(innerFrameId) && scopeIds.has(outerFrameId), 'the exact nested target and ancestor frames are scoped')
  assert.ok(scopeIds.has(innerCarrierId) && scopeIds.has(outerSiblingNodeId), 'all direct children of the ancestor frame are scoped')
  const outerDirectChildren = beforeArrangeFixture.state.nodes.filter(node => node.parentId === outerFrameId).map(node => String(node.id)).sort()
  for (const id of outerDirectChildren) assert.ok(scopeIds.has(id), `complete outer direct-child slice ${id}`)
  const beforeSharedNode = beforeArrangeFixture.state.nodes.find(node => String(node.id) === innerSharedNodeId)
  const afterSharedNode = prepared.afterSnapshot.state.nodes.find(node => String(node.id) === innerSharedNodeId)
  assert.ok(beforeSharedNode && afterSharedNode)
  assert.equal(afterSharedNode.parentId, outerFrameId)
  assert.equal(prepared.after.find(slice => slice.id === innerSharedNodeId)?.parentId, outerFrameId,
    'ancestor fit may compensate a sibling local position but must never change its parent')
  assert.deepEqual(worldPoint(prepared.afterSnapshot, innerSharedNodeId), worldPoint(beforeArrangeFixture, innerSharedNodeId),
    'ancestor hug fit may compensate local geometry but must preserve the real shared sibling world position')
  assert.deepEqual(afterSharedNode.data, beforeSharedNode.data, 'solver-only ancestor masking must never write renderer/Core identity data')
  assert.equal(afterSharedNode.hidden, beforeSharedNode.hidden, 'ancestor hidden markers stay confined to the solver clone')
  const arrangedMember = prepared.afterSnapshot.state.nodes.find(node => String(node.id) === innerNewMemberNodeId)
  const arrangedMemberWorld = worldPoint(prepared.afterSnapshot, innerNewMemberNodeId)
  assert.ok(arrangedMember && !rectanglesOverlap({ ...arrangedMemberWorld, ...nodeSize(arrangedMember) },
    { ...worldPoint(beforeArrangeFixture, innerSharedNodeId), ...nodeSize(beforeSharedNode) }),
  'the newly admitted free Inner member must avoid the actual outer-parented canonical sibling')

  const projectNativeNodes = async (targetCanvas, snapshot) => {
      assert.equal(targetCanvas, canvasId)
      const response = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
      assert.equal(response.status, 200, JSON.stringify(response.body))
      const existing = new Map(valueOf(response).nodes.map(node => [String(node.id), node]))
      return snapshot.state.nodes.map(node => {
        const prior = existing.get(String(node.id))
        assert.ok(prior, `native DTO must resolve exact existing node ${node.id}`)
        const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? prior.measured?.width ?? 0)
        const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? prior.measured?.height ?? 0)
        return { ...prior, position: { ...node.position }, parent_id: node.parentId ?? '',
          measured: { width, height }, width, height }
      })
    }
  const history = owners.createNativeCollectionSpaceHistory({ repository, projectId, spatial: facade.spatial,
    collectionSpace: space, projectNativeNodes, fail })
  const beforeDto = new Map((await projectNativeNodes(canvasId, prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const afterDto = new Map((await projectNativeNodes(canvasId, prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const updates = (from, to) => [{ action: 'update', updates: prepared.changedIds.map(id => {
    const source = from.get(id), target = to.get(id)
    assert.ok(source && target, `changed native DTO ${id} must exist on both sides`)
    return { id, canvas_id: canvasId, type: source.type, data: structuredClone(source.data),
      position: structuredClone(target.position), measured: structuredClone(target.measured), parent_id: target.parent_id ?? '' }
  }) }]
  const spaceOperation = phase => ({ version: 1, operationId: `nested-arrange-${process.pid}-${Date.now()}`,
    kind: 'collection-arrange', phase, space: { projectId, canvasId, workspaceId: String(workspace.id),
      collectionId: innerCollectionId, collectionNodeId: innerCarrierId, frameId: innerFrameId,
      sourceVersion: prepared.sourceVersion, before: prepared.before, after: prepared.after } })
  const expectedRevisions = Object.fromEntries([[innerOriginalNodeId, innerOriginal], [innerNewMemberNodeId, innerNewMember],
    [innerSharedNodeId, innerSharedMember]]
    .map(([nodeId, material]) => [nodeId, String(material.revisionId)]))
  const beforeRuns = repository.getProjectRuns(projectId, 100).length
  const beforeArtifacts = [innerOriginal, innerNewMember, innerSharedMember, outerSibling].map(material => repository.getArtifact(String(material.artifactId)))
  const beforeFiles = [innerOriginal, innerNewMember, innerSharedMember, outerSibling].map(material => repository.getFileRecord(String(material.fileRecordId)))
  const beforeMembership = repository.listCollectionMemberships(projectId, innerCollectionId).map(row => ({ ...row.memberRef }))

  const applyReceipt = await history.applyOperation({ canvasId, expectedVersion: prepared.sourceVersion,
    operation: spaceOperation('apply'), actions: updates(beforeDto, afterDto), expectedRevisions })
  assert.equal(applyReceipt.arranged, true)
  assert.equal(applyReceipt.created, false)
  assert.equal(applyReceipt.frame_id, innerFrameId)
  assert.equal(applyReceipt.to_version, prepared.sourceVersion + 1)
  const afterApply = await facade.spatial.read(canvasId)
  assert.equal(afterApply.version, applyReceipt.to_version)
  const afterApplyById = new Map(afterApply.state.nodes.map(node => [String(node.id), node]))
  for (const slice of prepared.after) {
    const node = afterApplyById.get(slice.id)
    assert.ok(node, `after state preserves exact scoped node ${slice.id}`)
    assert.equal(node.parentId ?? null, slice.parentId)
    assert.deepEqual(node.position, slice.position)
  }
  assert.equal(afterApplyById.get(innerFrameId)?.parentId, outerFrameId)
  assert.equal(afterApplyById.get(outerSiblingNodeId)?.parentId, outerFrameId)
  assert.equal(afterApplyById.get(innerCarrierId)?.parentId, outerFrameId)
  assert.equal(afterApplyById.get(innerSharedNodeId)?.parentId, outerFrameId,
    'a canonical Inner member already parented under the Outer frame stays there after nested arrange')
  assert.deepEqual(worldPoint(afterApply, innerSharedNodeId), worldPoint(beforeArrangeFixture, innerSharedNodeId),
    'Huabu ancestor fitting compensates the sibling local position while preserving its world position')
  report.cases.push('nested apply reused the original Gen2 planner, committed the exact ancestor closure, and preserved an other-parent canonical sibling')

  const secondPrepared = await space.prepareArrangement({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  const planBeforeNodes = new Map(secondPrepared.beforeSnapshot.state.nodes.map(node => [String(node.id), node]))
  const plannerChangedNodes = secondPrepared.afterSnapshot.state.nodes.flatMap(node => {
    const before = planBeforeNodes.get(String(node.id))
    if (!before || JSON.stringify(before) === JSON.stringify(node)) return []
    const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(node)])]
      .filter(key => JSON.stringify(before[key]) !== JSON.stringify(node[key]))
    return [{ id: String(node.id), changedKeys, before: Object.fromEntries(changedKeys.map(key => [key, before[key]])),
      after: Object.fromEntries(changedKeys.map(key => [key, node[key]])) }]
  })
  report.measurements.secondPrepareAfterApply = { sourceVersion: secondPrepared.sourceVersion,
    changedIds: secondPrepared.changedIds, admittedIds: secondPrepared.admittedIds,
    plannerChangedNodes,
    idempotent: secondPrepared.changedIds.length === 0,
    changedSlices: secondPrepared.changedIds.map(id => ({ id,
      before: secondPrepared.before.find(slice => slice.id === id),
      after: secondPrepared.after.find(slice => slice.id === id),
      beforeWorld: worldPoint(secondPrepared.beforeSnapshot, id), afterWorld: worldPoint(secondPrepared.afterSnapshot, id),
      worldExactlySame: JSON.stringify(worldPoint(secondPrepared.beforeSnapshot, id))
        === JSON.stringify(worldPoint(secondPrepared.afterSnapshot, id)) })),
    targetFrameSizeBefore: secondPrepared.before.find(slice => slice.id === innerFrameId)?.size,
    targetFrameSizeAfter: secondPrepared.after.find(slice => slice.id === innerFrameId)?.size,
    ancestorFrameSizes: secondPrepared.after.filter(slice => [outerFrameId].includes(slice.id)).map(slice => ({
      id: slice.id, before: secondPrepared.before.find(candidate => candidate.id === slice.id)?.size, after: slice.size })) }
  assert.deepEqual(secondPrepared.changedIds, [], 'an applied nested arrangement must be idempotent under a second original prepare')
  assert.equal(secondPrepared.sourceVersion, applyReceipt.to_version, 'second prepare is read-only at the committed Canvas version')
  for (const slice of secondPrepared.before) {
    const after = secondPrepared.after.find(candidate => candidate.id === slice.id)
    assert.ok(after)
    assert.equal(after.parentId, slice.parentId)
    assert.deepEqual(after.position, slice.position)
    assert.deepEqual(after.size, slice.size)
  }
  if (secondPrepared.changedIds.length) report.warnings.push({ code: 'NESTED_ARRANGE_NOT_IDEMPOTENT',
    message: 'This is a read-only original-planner measurement after the first nested Apply; it was not applied or replayed.',
    changedIds: secondPrepared.changedIds, targetFrameId: innerFrameId, ancestorFrameId: outerFrameId,
    ancestorHeightBefore: secondPrepared.before.find(slice => slice.id === outerFrameId)?.size.height,
    ancestorHeightAfter: secondPrepared.after.find(slice => slice.id === outerFrameId)?.size.height })
  report.cases.push(`read-only second original prepare after nested Apply reported ${secondPrepared.changedIds.length} changed ids`)

  const staleApply = await history.applyOperation({ canvasId, expectedVersion: prepared.sourceVersion,
    operation: spaceOperation('apply'), actions: [], expectedRevisions }).then(() => null, error => error)
  assert.equal(staleApply?.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, applyReceipt.to_version)
  const omittedSiblingOperation = structuredClone(spaceOperation('undo'))
  omittedSiblingOperation.space.before = omittedSiblingOperation.space.before.filter(slice => slice.id !== outerSiblingNodeId)
  omittedSiblingOperation.space.after = omittedSiblingOperation.space.after.filter(slice => slice.id !== outerSiblingNodeId)
  const omittedSibling = await history.applyOperation({ canvasId, expectedVersion: applyReceipt.to_version,
    operation: omittedSiblingOperation, actions: [] }).then(() => null, error => error)
  assert.equal(omittedSibling?.status, 409)
  const forgedAncestorOperation = structuredClone(spaceOperation('undo'))
  for (const side of [forgedAncestorOperation.space.before, forgedAncestorOperation.space.after]) {
    side.find(slice => slice.id === outerFrameId).parentId = 'forged-parent'
  }
  const forgedAncestor = await history.applyOperation({ canvasId, expectedVersion: applyReceipt.to_version,
    operation: forgedAncestorOperation, actions: [] }).then(() => null, error => error)
  assert.equal(forgedAncestor?.status, 409)
  assert.equal((await facade.spatial.read(canvasId)).version, applyReceipt.to_version,
    'stale CAS and forged/incomplete nested scope must not partially write Huabu state')
  report.cases.push('stale CAS, omitted ancestor sibling, and forged ancestor-parent snapshots failed before any spatial write')

  const removeAfterApply = await coreJson('DELETE', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(innerCollectionId)}/members`, {
    memberType: 'artifact', memberId: String(innerNewMember.artifactId),
  })
  assert.equal(removeAfterApply.status, 200, JSON.stringify(removeAfterApply.body))
  const liveAfterDto = async snapshot => {
    const response = await facadeCall('GET', `/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    const existing = new Map(valueOf(response).nodes.map(node => [String(node.id), node]))
    return snapshot.state.nodes.map(node => {
      const prior = existing.get(String(node.id))
      assert.ok(prior, `live native DTO must resolve ${node.id}`)
      const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? prior.measured?.width ?? 0)
      const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? prior.measured?.height ?? 0)
      return { ...prior, position: { ...node.position }, parent_id: node.parentId ?? '', measured: { width, height }, width, height }
    })
  }
  const undoFrom = new Map((await liveAfterDto(afterApply)).map(node => [String(node.id), node]))
  const undoTo = new Map((await projectNativeNodes(canvasId, prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const undoReceipt = await history.applyOperation({ canvasId, expectedVersion: applyReceipt.to_version,
    operation: spaceOperation('undo'), actions: updates(undoFrom, undoTo), expectedRevisions })
  assert.equal(undoReceipt.arranged, true)
  assert.equal(undoReceipt.frame_id, innerFrameId)
  const afterUndo = await facade.spatial.read(canvasId)
  const afterUndoById = new Map(afterUndo.state.nodes.map(node => [String(node.id), node]))
  for (const slice of prepared.before) {
    const node = afterUndoById.get(slice.id)
    assert.ok(node, `Undo retains exact scope node ${slice.id}`)
    assert.equal(node.parentId ?? null, slice.parentId)
  }
  assert.equal(afterUndoById.get(innerFrameId)?.parentId, outerFrameId)
  assert.equal(repository.getCollectionMembership(projectId, innerCollectionId, 'artifact', String(innerNewMember.artifactId)), undefined,
    'Undo changes only recorded spatial state and must not recreate removed Core membership')
  report.cases.push('Undo restored the recorded nested geometry/parents while retaining the same frame and leaving later Core membership removal intact')

  const sizeDriftOperation = structuredClone(spaceOperation('redo'))
  const sizeDriftFrame = sizeDriftOperation.space.after.find(slice => slice.id === innerFrameId)
  assert.ok(sizeDriftFrame)
  sizeDriftFrame.size.height += 0.01
  const beforeSizeDrift = (await facade.spatial.read(canvasId)).version
  const sizeDrift = await history.applyOperation({ canvasId, expectedVersion: beforeSizeDrift,
    operation: sizeDriftOperation, actions: [] }).then(() => null, error => error)
  assert.equal(sizeDrift?.status, 409)
  assert.equal(sizeDrift?.code, 'COLLECTION_ARRANGE_REPLAY_SIZE_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeSizeDrift,
    'an arbitrary 0.01 hug-fit size change must not commit even on the nested engine-replay path')
  report.cases.push('a forged 0.01 nested hug-frame size target was rejected with no Canvas version increase')

  const redoFrom = new Map((await projectNativeNodes(canvasId, prepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const redoTo = new Map((await liveAfterDto(prepared.afterSnapshot)).map(node => [String(node.id), node]))
  const redoReceipt = await history.applyOperation({ canvasId, expectedVersion: undoReceipt.to_version,
    operation: spaceOperation('redo'), actions: updates(redoFrom, redoTo), expectedRevisions })
  assert.equal(redoReceipt.arranged, true)
  assert.equal(redoReceipt.frame_id, innerFrameId)
  const afterRedo = await facade.spatial.read(canvasId)
  const afterRedoById = new Map(afterRedo.state.nodes.map(node => [String(node.id), node]))
  for (const slice of prepared.after) {
    const node = afterRedoById.get(slice.id)
    assert.ok(node, `Redo preserves exact scope node ${slice.id}`)
    assert.equal(node.parentId ?? null, slice.parentId)
    assert.deepEqual(node.position, slice.position, `Redo preserves exact recorded position for ${slice.id}`)
  }
  assert.equal(afterRedoById.get(innerSharedNodeId)?.parentId, outerFrameId,
    'Redo cannot steal the shared canonical sibling from its original ancestor parent')
  assert.deepEqual(worldPoint(afterRedo, innerSharedNodeId), worldPoint(beforeArrangeFixture, innerSharedNodeId),
    'Redo preserves the other-parent canonical sibling world position')
  assert.equal(repository.getCollectionMembership(projectId, innerCollectionId, 'artifact', String(innerNewMember.artifactId)), undefined,
    'Redo replays recorded spatial state only; it must not restore Collection membership')
  report.cases.push('Redo restored the same nested frame/recorded child set without re-reading or rewriting current Collection membership')
  const secondPreparedAfterRedo = await space.prepareArrangement({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  report.measurements.secondPrepareAfterRedo = { sourceVersion: secondPreparedAfterRedo.sourceVersion,
    changedIds: secondPreparedAfterRedo.changedIds, admittedIds: secondPreparedAfterRedo.admittedIds,
    changedSlices: secondPreparedAfterRedo.changedIds.map(id => ({ id,
      before: secondPreparedAfterRedo.before.find(slice => slice.id === id),
      after: secondPreparedAfterRedo.after.find(slice => slice.id === id) })),
    idempotent: secondPreparedAfterRedo.changedIds.length === 0,
    targetFrameSizeBefore: secondPreparedAfterRedo.before.find(slice => slice.id === innerFrameId)?.size,
    targetFrameSizeAfter: secondPreparedAfterRedo.after.find(slice => slice.id === innerFrameId)?.size,
    ancestorFrameSizes: secondPreparedAfterRedo.after.filter(slice => [outerFrameId].includes(slice.id)).map(slice => ({
      id: slice.id, before: secondPreparedAfterRedo.before.find(candidate => candidate.id === slice.id)?.size, after: slice.size })) }
  assert.deepEqual(secondPreparedAfterRedo.changedIds, [], 'a read-only nested prepare after Redo must be idempotent')
  assert.equal(secondPreparedAfterRedo.admittedIds.length, 0, 'Redo repeat does not admit new nodes')
  assert.equal(secondPreparedAfterRedo.sourceVersion, redoReceipt.to_version, 'second prepare after Redo must not write Canvas state')
  for (const slice of secondPreparedAfterRedo.before) {
    const after = secondPreparedAfterRedo.after.find(candidate => candidate.id === slice.id)
    assert.ok(after)
    assert.equal(after.parentId, slice.parentId)
    assert.deepEqual(after.position, slice.position)
    assert.deepEqual(after.size, slice.size)
  }
  report.cases.push(`read-only second original prepare after nested Redo reported ${secondPreparedAfterRedo.changedIds.length} changed ids`)
  const beforeSlicesById = new Map(prepared.before.map(slice => [slice.id, slice]))
  const afterSlicesById = new Map(prepared.after.map(slice => [slice.id, slice]))
  const hugFrameReadback = [...afterRedoById.values()].filter(node => node.type === 'frame'
    && beforeSlicesById.has(String(node.id)) && afterSlicesById.has(String(node.id))
    && (beforeSlicesById.get(String(node.id)).size.width !== afterSlicesById.get(String(node.id)).size.width
      || beforeSlicesById.get(String(node.id)).size.height !== afterSlicesById.get(String(node.id)).size.height))
    .map(node => {
      const actual = nodeSize(node), recorded = afterSlicesById.get(String(node.id)).size
      return { nodeId: String(node.id), collectionId: node.data?.lcosCollectionId,
        frameSizing: node.data?.sizing ?? 'hug', recorded, actual,
        widthDelta: Math.abs(actual.width - recorded.width), heightDelta: Math.abs(actual.height - recorded.height) }
    })
  const maxDerivedHugSizeDelta = Math.max(0, ...hugFrameReadback.flatMap(row => [row.widthDelta, row.heightDelta]))
  report.measurements.nestedHugFrameReadback = { comparison: 'actual Huabu readback vs exact O8 recorded size; bounded ULP only for changing nested hug-fit frames',
    frames: hugFrameReadback, maxAbsoluteDelta: maxDerivedHugSizeDelta }

  // Exercise the hard cap at a genuinely large executor-derived frame size.
  // The width change is a real Huabu command on this disposable fixture; the
  // forged O8 target differs from the measured hug result by only 0.01.
  const scaleProbe = await makeText('hug-fit-scale-probe')
  const scaleProbeArtifactBefore = repository.getArtifact(String(scaleProbe.artifactId))
  const scaleProbeFileBefore = repository.getFileRecord(String(scaleProbe.fileRecordId))
  assert.ok(scaleProbeArtifactBefore && scaleProbeFileBefore)
  const scaleMembership = await coreJson('POST', `/projects/${encodeURIComponent(projectId)}/collections/${encodeURIComponent(innerCollectionId)}/members`, {
    memberType: 'artifact', memberId: String(scaleProbe.artifactId),
  })
  assert.equal(scaleMembership.status, 200, JSON.stringify(scaleMembership.body))
  const scaleProbeNodeId = await projectText(scaleProbe)
  let scaleSnapshot = await facade.spatial.read(canvasId)
  const hugeTextNode = scaleSnapshot.state.nodes.find(node => String(node.id) === innerOriginalNodeId)
  assert.ok(hugeTextNode)
  const hugeWidthWrite = await facade.spatial.execute(canvasId, [{ type: 'SET_NODE_GEOMETRY', items: [
    { nodeId: innerOriginalNodeId, position: structuredClone(hugeTextNode.position),
      size: { width: 1_000_000_000, height: nodeSize(hugeTextNode).height } },
  ] }])
  assert.equal(hugeWidthWrite.results.every(result => result.applied === true), true, JSON.stringify(hugeWidthWrite.results))
  scaleSnapshot = await facade.spatial.read(canvasId)
  const largeInnerFrame = scaleSnapshot.state.nodes.find(node => String(node.id) === innerFrameId)
  const largeFrameSize = nodeSize(largeInnerFrame)
  assert.ok(largeFrameSize.width >= 1_000_000_000 - 1,
    `the real Hug fit must produce a frame size around 1e9, got ${JSON.stringify(largeFrameSize)}`)
  const scalePrepared = await space.prepareArrangement({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  assert.ok(scalePrepared.changedIds.includes(scaleProbeNodeId), 'the original planner admits the canonical scale-probe member')
  const scaleBefore = scalePrepared.before
  const scaleAfter = structuredClone(scalePrepared.after)
  const scaleAfterFrame = scaleAfter.find(slice => slice.id === innerFrameId)
  assert.ok(scaleAfterFrame)
  assert.ok(scaleBefore.find(slice => slice.id === innerFrameId).size.width >= 1_000_000_000 - 1,
    'the recorded real planner source side must also remain at 1e9 scale')
  scaleAfterFrame.size.width += 0.01
  const largeSizeDriftOperation = { version: 1, operationId: `nested-large-size-drift-${process.pid}-${Date.now()}`,
    kind: 'collection-arrange', phase: 'redo', space: { projectId, canvasId, workspaceId: String(workspace.id),
      collectionId: innerCollectionId, collectionNodeId: innerCarrierId, frameId: innerFrameId,
      sourceVersion: scalePrepared.sourceVersion, before: scaleBefore, after: scaleAfter } }
  const beforeLargeSizeDrift = scalePrepared.sourceVersion
  const largeSizeDrift = await history.applyOperation({ canvasId, expectedVersion: beforeLargeSizeDrift,
    operation: largeSizeDriftOperation, actions: [] }).then(() => null, error => error)
  assert.equal(largeSizeDrift?.status, 409)
  assert.equal(largeSizeDrift?.code, 'COLLECTION_ARRANGE_REPLAY_SIZE_MISMATCH')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeLargeSizeDrift,
    'a 0.01 mismatch at approximately 1e9 frame-size scale must fail before Huabu write')
  report.measurements.largeScaleHugSize = { actualBefore: scaleBefore.find(slice => slice.id === innerFrameId).size.width,
    forgedRecordedAfter: scaleAfterFrame.size.width,
    absoluteOffset: Math.abs(scaleAfterFrame.size.width - scaleBefore.find(slice => slice.id === innerFrameId).size.width),
    rejectionCode: largeSizeDrift.code, noWriteVersion: beforeLargeSizeDrift }
  report.cases.push('a synthetic but real-Huabu hug frame near 1e9 rejected a 0.01 size mismatch within the hard-capped ULP path')

  // Manual sizing is a legitimate original command, but arrange history must
  // preserve that authored size exactly rather than treating it as a fit.
  const manualized = await facade.spatial.execute(canvasId, [{ type: 'SET_FRAME_LAYOUT', frameId: innerFrameId,
    mode: 'free', sizing: 'manual' }])
  assert.equal(manualized.results.every(result => result.applied === true), true, JSON.stringify(manualized.results))
  const manualBefore = await facade.spatial.read(canvasId)
  const manualFrame = manualBefore.state.nodes.find(node => String(node.id) === innerFrameId)
  assert.equal(manualFrame?.data?.sizing, 'manual')
  const manualFrameSizeBefore = nodeSize(manualFrame)
  const manualPrepared = await space.prepareArrangement({ canvasId, collectionId: innerCollectionId, collectionNodeId: innerCarrierId })
  assert.ok(manualPrepared.changedIds.includes(scaleProbeNodeId), 'the original manual-frame arrange planner admits the exact free canonical member')
  assert.deepEqual(manualPrepared.before.find(slice => slice.id === innerFrameId)?.size,
    manualPrepared.after.find(slice => slice.id === innerFrameId)?.size,
    'the original producer keeps a manual frame size fixed while arranging children')
  const manualBeforeDto = new Map((await projectNativeNodes(canvasId, manualPrepared.beforeSnapshot)).map(node => [String(node.id), node]))
  const manualAfterDto = new Map((await projectNativeNodes(canvasId, manualPrepared.afterSnapshot)).map(node => [String(node.id), node]))
  const manualActions = [{ action: 'update', updates: manualPrepared.changedIds.map(id => {
    const source = manualBeforeDto.get(id), target = manualAfterDto.get(id)
    assert.ok(source && target, `manual-frame DTO ${id} exists on both sides`)
    return { id, canvas_id: canvasId, type: source.type, data: structuredClone(source.data),
      position: structuredClone(target.position), measured: structuredClone(target.measured), parent_id: target.parent_id ?? '' }
  }) }]
  const manualOperation = phase => ({ version: 1, operationId: `nested-manual-arrange-${process.pid}-${Date.now()}`,
    kind: 'collection-arrange', phase, space: { projectId, canvasId, workspaceId: String(workspace.id),
      collectionId: innerCollectionId, collectionNodeId: innerCarrierId, frameId: innerFrameId,
      sourceVersion: manualPrepared.sourceVersion, before: manualPrepared.before, after: manualPrepared.after } })
  const manualExpectedRevisions = { ...expectedRevisions, [scaleProbeNodeId]: String(scaleProbe.revisionId) }
  const manualReceipt = await history.applyOperation({ canvasId, expectedVersion: manualPrepared.sourceVersion,
    operation: manualOperation('apply'), actions: manualActions, expectedRevisions: manualExpectedRevisions })
  assert.equal(manualReceipt.arranged, true)
  const afterManualApply = await facade.spatial.read(canvasId)
  const afterManualFrame = afterManualApply.state.nodes.find(node => String(node.id) === innerFrameId)
  assert.deepEqual(nodeSize(afterManualFrame), manualFrameSizeBefore,
    'manual Collection frame size remains bitwise/numerically exact across its original arrange producer')
  assert.equal(afterManualFrame?.data?.sizing, 'manual')
  const forgedManualOperation = structuredClone(manualOperation('undo'))
  const forgedManualBefore = forgedManualOperation.space.before.find(slice => slice.id === innerFrameId)
  assert.ok(forgedManualBefore)
  forgedManualBefore.size.width += 0.01
  const beforeForgedManual = afterManualApply.version
  const forgedManual = await history.applyOperation({ canvasId, expectedVersion: beforeForgedManual,
    operation: forgedManualOperation, actions: [] }).then(() => null, error => error)
  assert.equal(forgedManual?.status, 409)
  assert.equal(forgedManual?.code, 'COLLECTION_ARRANGE_SIZE_UNSUPPORTED')
  assert.equal((await facade.spatial.read(canvasId)).version, beforeForgedManual,
    'a manual frame size edit cannot enter collection arrange history')
  report.measurements.manualFrame = { sizing: 'manual', before: manualFrameSizeBefore,
    after: nodeSize(afterManualFrame), forgedOffset: 0.01, rejectionCode: forgedManual.code }
  report.cases.push('original Gen2 arrange kept a real manual frame size exactly unchanged; forged 0.01 manual size history was refused')

  assert.deepEqual(repository.listCollectionMemberships(projectId, innerCollectionId).map(row => ({ ...row.memberRef }))
    .sort((a, b) => a.id.localeCompare(b.id)),
    [...beforeMembership.filter(ref => !(ref.type === 'artifact' && ref.id === String(innerNewMember.artifactId))),
      { type: 'artifact', id: String(scaleProbe.artifactId) }].sort((a, b) => a.id.localeCompare(b.id)))
  assert.equal(repository.getProjectRuns(projectId, 100).length, beforeRuns)
  for (const before of beforeArtifacts) assert.deepEqual(repository.getArtifact(String(before.id)), before)
  for (const before of beforeFiles) assert.deepEqual(repository.getFileRecord(String(before.id)), before)
  assert.deepEqual(repository.getArtifact(String(scaleProbe.artifactId)), scaleProbeArtifactBefore,
    'the large-scale fixture material row remains readable; it is not spatial truth')
  assert.deepEqual(repository.getFileRecord(String(scaleProbe.fileRecordId)), scaleProbeFileBefore,
    'the large-scale fixture FileRecord remains readable; frame geometry did not copy or rewrite it')
  report.fixture = { projectId, canvasId, workspaceId: String(workspace.id), innerCollectionId, innerCarrierId, innerFrameId,
    outerCollectionId, outerCarrierId, outerFrameId, innerOriginalNodeId, innerNewMemberNodeId,
    innerSharedMemberArtifactId: String(innerSharedMember.artifactId), innerSharedNodeId, outerSiblingNodeId,
    scaleProbeNodeId, scaleProbeArtifactId: String(scaleProbe.artifactId), outerDirectChildren,
    sourceVersion: prepared.sourceVersion, appliedVersion: applyReceipt.to_version,
    undoneVersion: undoReceipt.to_version, redoneVersion: redoReceipt.to_version }
  report.final = { scopedNodes: prepared.before.length, changedIds: prepared.changedIds,
    frameIdsPreserved: afterRedoById.get(innerFrameId)?.parentId === outerFrameId,
    collectionMemberCountBefore: beforeMembership.length,
    collectionMemberCountAfter: repository.listCollectionMemberships(projectId, innerCollectionId).length,
    beforeRuns, afterRuns: repository.getProjectRuns(projectId, 100).length, providerExecutionStarted: false }
  assert.deepEqual(report.network.blocked, [])
  report.passed = true
} catch (error) {
  report.error = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined,
    status: error?.status, code: error?.code }
  report.passed = false
} finally {
  if (facade) {
    try { await facade.close(); report.cleanup.facadeClosed = true }
    catch (error) { report.cleanup.closeError = error instanceof Error ? error.message : String(error) }
  }
  activeCoreOrigins.clear()
  report.network.listenersAtClose = [...activeOrigins()]
  report.cleanup.listenersReleased = report.network.listenersAtClose.length === 0
  globalThis.fetch = originalFetch
  try {
    const base = path.resolve(reportRoot), target = path.resolve(runtimeRoot)
    assertContained(base, target)
    if (report.cleanup.facadeClosed && report.cleanup.listenersReleased) {
      await rm(target, { recursive: true, force: true })
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
