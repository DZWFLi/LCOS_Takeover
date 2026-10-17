import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = path.join(root, '.runtime', 'native-collection-projection-' + Date.now())
await mkdir(runtimeRoot, { recursive: true })

const projectionBundle = path.join(runtimeRoot, 'native-collection-projection.mjs')
const frameBundle = path.join(runtimeRoot, 'native-collection-frame-projection.mjs')
await buildPilotEntry('lab/pilot/native-collection-projection.ts', projectionBundle)
await buildPilotEntry('lab/pilot/native-collection-frame-projection.ts', frameBundle)
const { createNativeCollectionProjection } = await import(pathToFileURL(projectionBundle).href)
const { createNativeCollectionFrameProjection } = await import(pathToFileURL(frameBundle).href)

const projectId = 'nested-projection-project'
const canvasId = 'nested-projection-canvas'
const workspaceId = 'nested-projection-workspace'
const innerCollectionId = 'collection-inner'
const outerCollectionId = 'collection-outer'
const innerCarrierId = 'carrier-inner'
const outerCarrierId = 'carrier-outer'
const outerFrameId = 'frame-outer'
const innerFrameId = 'frame-inner'
const callLog = []

function fail(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  throw error
}

function makeNode(id, type, data, parentId) {
  return { id, type, position: { x: 100, y: 80 }, parentId,
    measured: { width: 420, height: 300 }, data }
}

function makeFixture({ bindings = [], nodes = [], collections = {} } = {}) {
  const repository = {
    getProjectionBindings: id => id === projectId ? bindings : [],
    getWorkspaces: id => id === projectId ? [{ projectId, id: workspaceId, canvasId, preferredSurface: 'main' }] : [],
    getCollection: id => collections[String(id)],
    findProjectionBinding: (pid, cid, spatialKind, entityType, entityId) => bindings.find(row => row.projectId === pid
      && row.canvasId === cid && row.spatialKind === spatialKind && row.entityType === entityType && row.entityId === entityId),
  }
  const spatial = { read: async id => id === canvasId ? { version: 7, state: { nodes, edges: [] } } : undefined }
  const projectionHost = () => ({})
  const frameProjection = createNativeCollectionFrameProjection({ repository, projectId, fail })
  const projection = createNativeCollectionProjection({ repository, projectId, spatial, projectionHost, fail,
    projectParent: (id, carrier, nativeNodes) => {
      callLog.push({ canvasId: id, carrierId: String(carrier.id), nodeIds: nativeNodes.map(node => String(node.id)) })
      return frameProjection.parent(id, carrier, nativeNodes)
    } })
  return { repository, spatial, frameProjection, projection }
}

const baseBindings = [
  { projectId, canvasId, spatialKind: 'node', spatialId: innerCarrierId, entityType: 'collection', entityId: innerCollectionId },
  { projectId, canvasId, spatialKind: 'node', spatialId: outerCarrierId, entityType: 'collection', entityId: outerCollectionId },
]
const baseCollections = {
  [innerCollectionId]: { id: innerCollectionId, projectId, title: 'Inner collection' },
  [outerCollectionId]: { id: outerCollectionId, projectId, title: 'Outer collection' },
}
const nestedNodes = [
  makeNode(outerCarrierId, 'note', {}, undefined),
  makeNode(outerFrameId, 'frame', { lcosCollectionId: outerCollectionId, lcosCollectionNodeId: outerCarrierId }),
  makeNode(innerCarrierId, 'note', {}, outerFrameId),
]

const rootFixture = makeFixture({ bindings: baseBindings, collections: baseCollections,
  nodes: [makeNode(innerCarrierId, 'note', {})] })
const rootNode = rootFixture.projection.node(canvasId, nestedNodes[0])
assert.deepEqual({ id: rootNode.id, canvas_id: rootNode.canvas_id, type: rootNode.type,
  hasParent: Object.hasOwn(rootNode, 'parent_id'), reference: rootNode.data.lcos_collection_ref },
{ id: outerCarrierId, canvas_id: canvasId, type: 'lcos-collection', hasParent: false,
  reference: { projectId, canvasId, workspaceId, collectionId: outerCollectionId } },
'root collection projection preserves its previous shape without a parent port')

const nestedFixture = makeFixture({ bindings: baseBindings, collections: baseCollections, nodes: nestedNodes })
const nestedDto = nestedFixture.projection.node(canvasId, nestedNodes.find(node => node.id === innerCarrierId), nestedNodes)
assert.equal(nestedDto.type, 'lcos-collection')
assert.equal(nestedDto.parent_id, outerFrameId,
  'a canonical nested carrier echoes only its exact parent returned by the original Collection-frame projector')
assert.deepEqual(nestedDto.data.lcos_collection_ref,
  { projectId, canvasId, workspaceId, collectionId: innerCollectionId })

const readBinding = await nestedFixture.projection.readBinding(canvasId, innerCollectionId)
assert.equal(readBinding.workspace_id, workspaceId)
assert.equal(readBinding.binding.spatialId, innerCarrierId)
assert.equal(readBinding.node.parent_id, outerFrameId,
  'readBinding supplies the real saved node list to the read-only parent projector')
assert.ok(callLog.some(row => row.canvasId === canvasId && row.carrierId === innerCarrierId
  && row.nodeIds.includes(outerFrameId)), 'the parent port receives the exact same-Canvas native snapshot')

function expectFailure(operation, { status, code }, label) {
  assert.throws(operation, error => error?.status === status && error?.code === code,
    label)
}

const noPort = createNativeCollectionProjection({ repository: nestedFixture.repository, projectId,
  spatial: nestedFixture.spatial, projectionHost: () => ({}), fail })
expectFailure(() => noPort.node(canvasId, nestedNodes.find(node => node.id === innerCarrierId), nestedNodes),
  { status: 501, code: 'COLLECTION_PARENT_NOT_CONNECTED' },
  'parented Collection carriers remain unavailable unless the original parent presenter is injected')
expectFailure(() => nestedFixture.projection.node(canvasId, nestedNodes.find(node => node.id === innerCarrierId)),
  { status: 501, code: 'COLLECTION_PARENT_NOT_CONNECTED' },
  'a saved parent is not inferred when the caller omits the canonical node snapshot')

const wrongParent = createNativeCollectionProjection({ repository: nestedFixture.repository, projectId,
  spatial: nestedFixture.spatial, projectionHost: () => ({}), fail,
  projectParent: () => ({ parent_id: 'another-frame' }) })
expectFailure(() => wrongParent.node(canvasId, nestedNodes.find(node => node.id === innerCarrierId), nestedNodes),
  { status: 409, code: 'COLLECTION_PARENT_PRESENTATION_MISMATCH' },
  'the port cannot substitute a foreign/stale parent id')

const missingParentNodes = [nestedNodes[0], nestedNodes[2]]
const missingFixture = makeFixture({ bindings: baseBindings, collections: baseCollections, nodes: missingParentNodes })
expectFailure(() => missingFixture.projection.node(canvasId, missingParentNodes[1], missingParentNodes),
  { status: 501, code: 'NODE_PARENT_PRESENTATION_NOT_CONNECTED' },
  'an absent parent group is not treated as an ordinary/free Collection carrier')

const foreignParentNodes = [nestedNodes[0],
  makeNode(outerFrameId, 'frame', { lcosCollectionId: 'foreign-collection', lcosCollectionNodeId: outerCarrierId }),
  nestedNodes[2]]
const foreignParentFixture = makeFixture({ bindings: baseBindings, collections: baseCollections, nodes: foreignParentNodes })
expectFailure(() => foreignParentFixture.projection.node(canvasId, foreignParentNodes[2], foreignParentNodes),
  { status: 409, code: 'COLLECTION_FRAME_IDENTITY_MISMATCH' },
  'a parent Collection without same-project Core ownership/binding is not projected')

const duplicateBindings = [...baseBindings, { ...baseBindings[0], entityType: 'artifact', entityId: 'conflicting-entity' }]
const ambiguousFixture = makeFixture({ bindings: duplicateBindings, collections: baseCollections, nodes: nestedNodes })
expectFailure(() => ambiguousFixture.projection.node(canvasId, nestedNodes[2], nestedNodes),
  { status: 409, code: 'COLLECTION_BINDING_AMBIGUOUS' },
  'a collection carrier with more than one projection binding remains ambiguous and unavailable')

const cyclicNodes = [
  makeNode(outerCarrierId, 'note', {}, innerFrameId),
  makeNode(outerFrameId, 'frame', { lcosCollectionId: outerCollectionId, lcosCollectionNodeId: outerCarrierId }, innerFrameId),
  makeNode(innerCarrierId, 'note', {}, outerFrameId),
  makeNode(innerFrameId, 'frame', { lcosCollectionId: innerCollectionId, lcosCollectionNodeId: innerCarrierId }, outerFrameId),
]
const cycleFixture = makeFixture({ bindings: baseBindings, collections: baseCollections, nodes: cyclicNodes })
expectFailure(() => cycleFixture.projection.node(canvasId, cyclicNodes[2], cyclicNodes),
  { status: 409, code: 'COLLECTION_FRAME_PARENT_CYCLE' },
  'the original frame presenter rejects cyclic nested parent chains')

const conflictingParentNode = { ...nestedNodes[2], parent_id: 'snake-parent-other', parentId: outerFrameId }
expectFailure(() => nestedFixture.projection.node(canvasId, conflictingParentNode, [nestedNodes[1], conflictingParentNode]),
  { status: 409, code: 'COLLECTION_PARENT_ID_MISMATCH' },
  'conflicting native parentId/parent_id echoes are rejected before projection')

const emptyReturn = createNativeCollectionProjection({ repository: nestedFixture.repository, projectId,
  spatial: nestedFixture.spatial, projectionHost: () => ({}), fail, projectParent: () => ({}) })
expectFailure(() => emptyReturn.node(canvasId, nestedNodes[2], nestedNodes),
  { status: 409, code: 'COLLECTION_PARENT_PRESENTATION_MISMATCH' },
  'an injected port must return the exact parent, not merely claim success')

console.log(JSON.stringify({ test: 'native-collection-projection',
  originalParentOwner: 'createNativeCollectionFrameProjection.parent',
  rootCarrierShapeUnchanged: true, nestedParentEcho: 'read-only exact parent_id',
  refusals: ['unwired parent', 'missing group', 'foreign group owner', 'ambiguous binding', 'cycle', 'mismatched parent ids'],
}, null, 2))
