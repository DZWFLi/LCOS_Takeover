import { createNativeCollectionMerge } from './native-collection-merge.ts'
import { isDeepStrictEqual } from 'node:util'
import { executeCanvasCommands, getAbsolutePosition } from '../../lcos/huabu/packages/shared/src/canvas-engine/index.ts'
import { getFrameSizing } from '../../lcos/huabu/packages/shared/src/canvas-engine/frame/sizing.js'
import type { CanvasCommand } from '../../lcos/huabu/packages/shared/src/index.ts'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import type { NativeCollectionSpaceSlice } from './native-collection-space.ts'

type JsonRecord = Record<string, any>
type NativeSnapshot = { version: number; state: { nodes: JsonRecord[]; edges: JsonRecord[] }; updatedAt?: number }
type SpaceOwner = {
  workspace: { id: string; canvasId?: string; projectId?: string }
  collection: { id: string; projectId: string; title: string }
  binding: { spatialId: string }
  bindings: readonly { spatialId: string; entityType: string; entityId: string }[]
  ownerNode: JsonRecord
  nodes: JsonRecord[]
  snapshotEdges: JsonRecord[]
  existingFrame?: JsonRecord
}
type LockedContext = {
  locked: { read(): Promise<unknown>; execute(commands: unknown[]): Promise<any> }
  snapshot: NativeSnapshot
  value: SpaceOwner
}
type PlannedOpen = {
  created: boolean
  frameId: string
  nodeIds: string[]
  commands: CanvasCommand[]
  plannedNodes: JsonRecord[]
  before: NativeCollectionSpaceSlice[]
  after: NativeCollectionSpaceSlice[]
  beforeSnapshot: NativeSnapshot
  afterSnapshot: NativeSnapshot
}

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function point(value: unknown): value is { x: number; y: number } {
  return record(value) && Number.isFinite(value.x) && Number.isFinite(value.y)
}

function samePoint(left: unknown, right: unknown): boolean {
  return point(left) && point(right) && left.x === right.x && left.y === right.y
}

function nearPoint(left: unknown, right: unknown): boolean {
  if (!point(left) || !point(right)) return false
  // Huabu's parent/fit replay can leave a few floating-point ULPs after
  // translating between parent-local and world coordinates. Keep that
  // round-trip accommodation below a hard spatial cap: relative epsilon
  // alone would accept a visible drift at large Canvas coordinates.
  const close = (a: number, b: number) => {
    const ulpBound = Number.EPSILON * 16 * Math.max(1, Math.abs(a), Math.abs(b))
    return Math.abs(a - b) <= Math.min(1e-7, ulpBound)
  }
  return close(left.x, right.x) && close(left.y, right.y)
}

function nearDerivedHugFrameSize(actual: unknown, expected: unknown, node: JsonRecord | undefined,
  allowed: boolean): boolean {
  if (!record(actual) || !record(expected)
    || !Number.isFinite(actual.width) || !Number.isFinite(actual.height)
    || !Number.isFinite(expected.width) || !Number.isFinite(expected.height)) return false
  if (actual.width === expected.width && actual.height === expected.height) return true
  if (!allowed || node?.type !== 'frame' || getFrameSizing(node as never) !== 'hug') return false
  const nearNumber = (left: number, right: number) => {
    const ulpBound = Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right))
    return Math.abs(left - right) <= Math.min(1e-7, ulpBound)
  }
  return nearNumber(actual.width, expected.width) && nearNumber(actual.height, expected.height)
}

function failShape(fail: (status: number, code: string, message: string) => never, code: string, message: string): never {
  return fail(400, code, message)
}

function validateOperation(value: unknown, canvasId: string, projectId: string,
  fail: (status: number, code: string, message: string) => never) {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'kind,operationId,phase,space,version'
    || value.version !== 1 || value.kind !== 'collection-space'
    || !['apply', 'undo', 'redo'].includes(String(value.phase))
    || typeof value.operationId !== 'string' || !value.operationId.trim() || value.operationId.length > 200
    || !record(value.space)
    || Object.keys(value.space).sort().join(',') !== 'after,before,canvasId,collectionId,collectionNodeId,frameId,projectId,sourceVersion,workspaceId'
    || value.space.projectId !== projectId || value.space.canvasId !== canvasId
    || !['workspaceId', 'collectionId', 'collectionNodeId', 'frameId'].every(key =>
      typeof value.space[key] === 'string' && value.space[key].trim().length > 0)
    || !/^node-[0-9a-f-]{36}$/i.test(value.space.frameId)
    || !Number.isSafeInteger(value.space.sourceVersion) || value.space.sourceVersion < 0
    || !Array.isArray(value.space.before) || !Array.isArray(value.space.after)) {
    failShape(fail, 'INVALID_COLLECTION_SPACE_OPERATION', 'Expected an exact collection-space operation owned by this project and Canvas.')
  }
  const validateSlices = (slices: unknown[], label: string) => {
    const ids = new Set<string>()
    for (const slice of slices) {
      if (!record(slice) || Object.keys(slice).sort().join(',') !== 'id,parentId,position,size'
        || typeof slice.id !== 'string' || !slice.id.trim() || ids.has(slice.id)
        || !(slice.parentId === null || typeof slice.parentId === 'string' && slice.parentId.trim())
        || !point(slice.position) || !record(slice.size)
        || Object.keys(slice.size).sort().join(',') !== 'height,width'
        || !Number.isFinite(slice.size.width) || slice.size.width <= 0
        || !Number.isFinite(slice.size.height) || slice.size.height <= 0) {
        failShape(fail, 'INVALID_COLLECTION_SPACE_SNAPSHOT', `${label} must contain unique exact geometry slices.`)
      }
      ids.add(slice.id)
    }
    return ids
  }
  const beforeIds = validateSlices(value.space.before, 'before')
  const afterIds = validateSlices(value.space.after, 'after')
  const beforeMembers = [...beforeIds].filter(id => id !== value.space.frameId).sort()
  const afterMembers = [...afterIds].filter(id => id !== value.space.frameId).sort()
  const hasFrameBefore = beforeIds.has(value.space.frameId)
  const hasFrameAfter = afterIds.has(value.space.frameId)
  if (hasFrameBefore || !hasFrameAfter || !isDeepStrictEqual(beforeMembers, afterMembers)) {
    failShape(fail, 'INVALID_COLLECTION_SPACE_SNAPSHOT', 'A first-open operation has exactly one new frame and the same direct member ids on both sides.')
  }
  const beforeById = new Map(value.space.before.map((slice: NativeCollectionSpaceSlice) => [slice.id, slice]))
  const afterById = new Map(value.space.after.map((slice: NativeCollectionSpaceSlice) => [slice.id, slice]))
  for (const id of beforeMembers) {
    if (beforeById.get(id)?.parentId !== null || afterById.get(id)?.parentId !== value.space.frameId) {
      failShape(fail, 'INVALID_COLLECTION_SPACE_SNAPSHOT', 'First-open members must move from free root nodes directly into the exact new frame.')
    }
  }
  return { operationId: value.operationId, phase: value.phase as 'apply' | 'undo' | 'redo', space: value.space as {
    projectId: string; canvasId: string; workspaceId: string; collectionId: string; collectionNodeId: string;
    frameId: string; sourceVersion: number; before: NativeCollectionSpaceSlice[]; after: NativeCollectionSpaceSlice[]
  } }
}

function validateArrangementOperation(value: unknown, canvasId: string, projectId: string,
  fail: (status: number, code: string, message: string) => never) {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'kind,operationId,phase,space,version'
    || value.version !== 1 || value.kind !== 'collection-arrange'
    || !['apply', 'undo', 'redo'].includes(String(value.phase))
    || typeof value.operationId !== 'string' || !value.operationId.trim() || value.operationId.length > 200
    || !record(value.space)
    || Object.keys(value.space).sort().join(',') !== 'after,before,canvasId,collectionId,collectionNodeId,frameId,projectId,sourceVersion,workspaceId'
    || value.space.projectId !== projectId || value.space.canvasId !== canvasId
    || !['workspaceId', 'collectionId', 'collectionNodeId', 'frameId'].every(key =>
      typeof value.space[key] === 'string' && value.space[key].trim().length > 0)
    || !Number.isSafeInteger(value.space.sourceVersion) || value.space.sourceVersion < 0
    || !Array.isArray(value.space.before) || !Array.isArray(value.space.after)) {
    failShape(fail, 'INVALID_COLLECTION_ARRANGE_OPERATION', 'Expected an exact collection-arrange operation owned by this project and Canvas.')
  }
  const validateSlices = (slices: unknown[], label: string) => {
    const byId = new Map<string, NativeCollectionSpaceSlice>()
    for (const slice of slices) {
      if (!record(slice) || Object.keys(slice).sort().join(',') !== 'id,parentId,position,size'
        || typeof slice.id !== 'string' || !slice.id.trim() || byId.has(slice.id)
        || !(slice.parentId === null || typeof slice.parentId === 'string' && slice.parentId.trim())
        || !point(slice.position) || !record(slice.size)
        || Object.keys(slice.size).sort().join(',') !== 'height,width'
        || !Number.isFinite(slice.size.width) || slice.size.width <= 0
        || !Number.isFinite(slice.size.height) || slice.size.height <= 0) {
        failShape(fail, 'INVALID_COLLECTION_ARRANGE_SNAPSHOT', `${label} must contain unique exact Huabu geometry slices.`)
      }
      byId.set(slice.id, slice as NativeCollectionSpaceSlice)
    }
    return byId
  }
  const beforeById = validateSlices(value.space.before, 'before')
  const afterById = validateSlices(value.space.after, 'after')
  if (!beforeById.has(value.space.frameId) || !afterById.has(value.space.frameId)
    || !isDeepStrictEqual([...beforeById.keys()].sort(), [...afterById.keys()].sort())) {
    failShape(fail, 'INVALID_COLLECTION_ARRANGE_SNAPSHOT', 'Arrange keeps the exact existing frame and same O8 spatial id set on both sides.')
  }
  const beforeFrame = beforeById.get(value.space.frameId)!
  const afterFrame = afterById.get(value.space.frameId)!
  if (beforeFrame.parentId !== afterFrame.parentId) {
    failShape(fail, 'INVALID_COLLECTION_ARRANGE_SNAPSHOT', 'Arrange cannot reparent its existing Collection frame.')
  }
  for (const id of beforeById.keys()) {
    if (id === value.space.frameId) continue
    const before = beforeById.get(id)!, after = afterById.get(id)!
    if (after.parentId !== before.parentId
      && !(before.parentId === null && after.parentId === value.space.frameId)) {
      failShape(fail, 'INVALID_COLLECTION_ARRANGE_SNAPSHOT', 'Arrange may only admit an exact free node into the existing Collection frame; it cannot eject or steal another parent.')
    }
    if (after.parentId !== value.space.frameId && after.parentId !== before.parentId) {
      failShape(fail, 'INVALID_COLLECTION_ARRANGE_SNAPSHOT', 'Arrange introduced an unsupported spatial parent transition.')
    }
  }
  return { operationId: value.operationId, phase: value.phase as 'apply' | 'undo' | 'redo', space: value.space as {
    projectId: string; canvasId: string; workspaceId: string; collectionId: string; collectionNodeId: string;
    frameId: string; sourceVersion: number; before: NativeCollectionSpaceSlice[]; after: NativeCollectionSpaceSlice[]
  } }
}

function mapSlices(slices: readonly NativeCollectionSpaceSlice[]) {
  return new Map(slices.map(slice => [slice.id, slice]))
}

function nodePosition(node: JsonRecord): { x: number; y: number } | undefined {
  return point(node.position) ? { x: node.position.x, y: node.position.y } : undefined
}

function nodeParent(node: JsonRecord): string | null {
  return typeof node.parentId === 'string' && node.parentId ? node.parentId : null
}

function nodeSize(node: JsonRecord): { width: number; height: number } {
  return { width: Number(node.measured?.width ?? node.width ?? node.style?.width ?? 0),
    height: Number(node.measured?.height ?? node.height ?? node.style?.height ?? 0) }
}

function assertCurrentSlices(snapshot: NativeSnapshot, slices: readonly NativeCollectionSpaceSlice[], ids: readonly string[],
  expectedFrame: { id: string; collectionId: string; collectionNodeId: string } | undefined,
  fail: (status: number, code: string, message: string) => never) {
  const byId = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
  if (expectedFrame) {
    const frame = byId.get(expectedFrame.id)
    const frameMatches = snapshot.state.nodes.filter(node => node.type === 'frame'
      && node.data?.lcosCollectionId === expectedFrame.collectionId)
    if (!frame || frame.type !== 'frame' || frame.data?.lcosCollectionId !== expectedFrame.collectionId
      || frame.data?.lcosCollectionNodeId !== expectedFrame.collectionNodeId || frameMatches.length !== 1) {
      fail(409, 'COLLECTION_SPACE_FRAME_STATE_MISMATCH', 'The current Huabu frame is not the exact Collection frame from this O8 operation.')
    }
  } else if (byId.has(ids.find(id => !slices.some(slice => slice.id === id)) || '')) {
    fail(409, 'COLLECTION_SPACE_FRAME_ID_COLLISION', 'The original Collection frame id is already occupied.')
  }
  for (const slice of slices) {
    const node = byId.get(slice.id)
    if (!node || nodeParent(node) !== slice.parentId || !samePoint(nodePosition(node), slice.position)) {
      fail(409, 'COLLECTION_SPACE_STATE_CONFLICT', `Spatial parent/position for ${slice.id} no longer matches this O8 history snapshot.`)
    }
  }
  const expectedMembers = new Set(ids.filter(id => id !== expectedFrame?.id))
  if (expectedFrame) {
    const actualMembers = snapshot.state.nodes.filter(node => node.parentId === expectedFrame.id).map(node => String(node.id)).sort()
    if (!isDeepStrictEqual(actualMembers, [...expectedMembers].sort())) {
      fail(409, 'COLLECTION_SPACE_MEMBER_SET_MISMATCH', 'The Collection frame children changed after the captured O8 transition.')
    }
  }
}

function targetSnapshot(snapshot: NativeSnapshot, slices: readonly NativeCollectionSpaceSlice[], frameId: string,
  includeFrame: boolean, frameTemplate?: JsonRecord): NativeSnapshot {
  const byId = new Map(slices.map(slice => [slice.id, slice]))
  const nodes = snapshot.state.nodes.flatMap(node => {
    const id = String(node.id)
    if (id === frameId && !includeFrame) return []
    const slice = byId.get(id)
    if (!slice) return [node]
    const next = { ...node, position: { ...slice.position } }
    if (slice.parentId === null) delete next.parentId
    else next.parentId = slice.parentId
    return [next]
  })
  if (includeFrame && !nodes.some(node => String(node.id) === frameId) && frameTemplate) nodes.push(frameTemplate)
  return { ...snapshot, state: { ...snapshot.state, nodes } }
}

function normalizeActions(actions: unknown, fail: (status: number, code: string, message: string) => never) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 3) {
    failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'A Collection space history request needs only the original bounded create/update/delete actions.')
  }
  const result: { create: JsonRecord[]; update: JsonRecord[]; delete: string[] } = { create: [], update: [], delete: [] }
  for (const action of actions) {
    if (!record(action) || typeof action.action !== 'string') failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Each original native action needs an action discriminator.')
    if (action.action === 'create') {
      if (Object.keys(action).some(key => !['action', 'nodes', 'creates'].includes(key))
        || Object.hasOwn(action, 'nodes') === Object.hasOwn(action, 'creates')) {
        failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Create actions may contain exactly one original nodes/creates array.')
      }
      const items = action.nodes ?? action.creates
      if (!Array.isArray(items)) failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Create actions need a node array.')
      result.create.push(...items)
    } else if (action.action === 'update') {
      if (Object.keys(action).some(key => key !== 'action' && key !== 'updates') || !Array.isArray(action.updates)) {
        failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Update actions may contain only their original updates array.')
      }
      result.update.push(...action.updates)
    } else if (action.action === 'delete') {
      if (Object.keys(action).some(key => key !== 'action' && key !== 'delete_ids') || !Array.isArray(action.delete_ids)) {
        failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Delete actions may contain only original delete_ids.')
      }
      result.delete.push(...action.delete_ids)
    } else failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Only original create/update/delete actions are accepted for this operation.')
  }
  return result
}

function assertWirePoint(value: unknown, expected: { x: number; y: number }, label: string,
  fail: (status: number, code: string, message: string) => never) {
  if (!samePoint(value, expected)) fail(409, 'COLLECTION_SPACE_ACTION_MISMATCH', `${label} does not match the exact O8 geometry slice.`)
}

function parentWire(slice: NativeCollectionSpaceSlice): string {
  return slice.parentId ?? ''
}

function subsetEqual(actual: unknown, expected: unknown): boolean {
  if (!record(actual) || !record(expected)) return isDeepStrictEqual(actual, expected)
  return Object.entries(actual).every(([key, value]) => Object.hasOwn(expected, key) && isDeepStrictEqual(value, expected[key]))
}

function verifyNativeActions(actions: ReturnType<typeof normalizeActions>, phase: 'apply' | 'undo' | 'redo',
  operation: { frameId: string; collectionId: string; collectionNodeId: string },
  before: readonly NativeCollectionSpaceSlice[], after: readonly NativeCollectionSpaceSlice[],
  beforeDto: readonly JsonRecord[], afterDto: readonly JsonRecord[], fail: (status: number, code: string, message: string) => never) {
  const beforeById = mapSlices(before), afterById = mapSlices(after)
  const beforeDtoById = new Map(beforeDto.map(node => [String(node.id), node]))
  const afterDtoById = new Map(afterDto.map(node => [String(node.id), node]))
  const frameDto = (phase === 'undo' ? beforeDtoById : afterDtoById).get(operation.frameId)
  if (!frameDto || frameDto.type !== 'group' || frameDto.data?.lcosCollectionId !== operation.collectionId
    || frameDto.data?.lcosCollectionNodeId !== operation.collectionNodeId) {
    fail(409, 'COLLECTION_SPACE_NATIVE_PROJECTION_MISMATCH', 'The original Canvas projection did not produce the exact native Collection group.')
  }

  const createExpected = phase === 'apply' || phase === 'redo'
  const deleteExpected = phase === 'undo'
  if (actions.create.length !== (createExpected ? 1 : 0)
    || actions.delete.length !== (deleteExpected ? 1 : 0)
    || actions.update.length !== beforeById.size) {
    fail(409, 'COLLECTION_SPACE_ACTION_SET_MISMATCH', 'Native actions must contain exactly the frame lifecycle change and every affected member update.')
  }
  if (createExpected) {
    const node = actions.create[0]!
    if (!record(node) || Object.keys(node).some(key => !['id', 'canvas_id', 'type', 'position', 'measured', 'data', 'parent_id', 'width', 'height', 'style'].includes(key))
      || node.id !== operation.frameId || node.type !== 'group'
      || (node.canvas_id !== undefined && node.canvas_id !== frameDto.canvas_id)
      || !isDeepStrictEqual(node.data, frameDto.data)) {
      fail(409, 'COLLECTION_SPACE_FRAME_CREATE_MISMATCH', 'Create must be the exact native group projection for this Collection; material data/ref/title writes are not allowed.')
    }
    const slice = afterById.get(operation.frameId)!
    assertWirePoint(node.position, slice.position, 'frame create position', fail)
    if (Object.hasOwn(node, 'parent_id') && node.parent_id !== parentWire(slice)) {
      fail(409, 'COLLECTION_SPACE_FRAME_CREATE_MISMATCH', 'Frame create parent does not match the planned native group parent.')
    }
    if (Object.hasOwn(node, 'measured') && (!record(node.measured)
      || !Number.isFinite(node.measured.width) || node.measured.width <= 0
      || !Number.isFinite(node.measured.height) || node.measured.height <= 0)) {
      failShape(fail, 'COLLECTION_SPACE_FRAME_CREATE_MISMATCH', 'Frame measurement is invalid.')
    }
  }
  if (deleteExpected && (actions.delete[0] !== operation.frameId)) {
    fail(409, 'COLLECTION_SPACE_FRAME_DELETE_MISMATCH', 'Undo may delete only the exact Collection frame id.')
  }

  const memberIds = [...beforeById.keys()].filter(id => id !== operation.frameId).sort()
  const updateById = new Map<string, JsonRecord>()
  for (const patch of actions.update) {
    if (!record(patch) || typeof patch.id !== 'string' || updateById.has(patch.id)) {
      failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', 'Native updates must target each affected member exactly once.')
    }
    if (Object.keys(patch).some(key => !['id', 'canvas_id', 'type', 'data', 'position', 'measured', 'parent_id'].includes(key))) {
      fail(501, 'COLLECTION_SPACE_MEMBER_UPDATE_UNSUPPORTED', 'Collection space history cannot write material payload, ref, title, or arbitrary native node fields.')
    }
    updateById.set(patch.id, patch)
  }
  if (!isDeepStrictEqual([...updateById.keys()].sort(), memberIds)) {
    fail(409, 'COLLECTION_SPACE_ACTION_SET_MISMATCH', 'Member updates do not exactly match the prepared bound-node set.')
  }
  for (const id of memberIds) {
    const patch = updateById.get(id)!
    const from = phase === 'undo' ? afterById.get(id)! : beforeById.get(id)!
    const to = phase === 'undo' ? beforeById.get(id)! : afterById.get(id)!
    const fromDto = (phase === 'undo' ? afterDtoById : beforeDtoById).get(id)
    const toDto = (phase === 'undo' ? beforeDtoById : afterDtoById).get(id)
    if (!fromDto || !toDto || fromDto.type !== toDto.type || !isDeepStrictEqual(fromDto.data, toDto.data)) {
      fail(409, 'COLLECTION_SPACE_MATERIAL_PROJECTION_CHANGED', `Native material ${id} changed data/ref/title within the O8 space operation.`)
    }
    if (patch.type !== undefined && patch.type !== fromDto.type) fail(409, 'COLLECTION_SPACE_ACTION_MISMATCH', `Node type for ${id} changed.`)
    if (patch.canvas_id !== undefined && patch.canvas_id !== fromDto.canvas_id) fail(409, 'COLLECTION_SPACE_ACTION_MISMATCH', `Canvas for ${id} changed.`)
    assertWirePoint(patch.position, to.position, `node ${id} position`, fail)
    if (!Object.hasOwn(patch, 'parent_id') || patch.parent_id !== parentWire(to)) {
      fail(409, 'COLLECTION_SPACE_ACTION_MISMATCH', `Node ${id} parent does not match its exact O8 target snapshot.`)
    }
    if (Object.hasOwn(patch, 'data') && !subsetEqual(patch.data, fromDto.data)) {
      fail(501, 'COLLECTION_SPACE_MATERIAL_WRITE_NOT_ALLOWED', `Node ${id} update attempts to alter material data, ref, or title.`)
    }
    // measured is ReactFlow/DOM bookkeeping, not authored Canvas geometry for this operation.
    if (Object.hasOwn(patch, 'measured') && (!record(patch.measured)
      || !Number.isFinite(patch.measured.width) || patch.measured.width <= 0
      || !Number.isFinite(patch.measured.height) || patch.measured.height <= 0)) {
      failShape(fail, 'COLLECTION_SPACE_ACTIONS_INVALID', `Node ${id} has an invalid measured-size echo.`)
    }
    if (from.parentId === to.parentId && samePoint(from.position, to.position)) {
      fail(409, 'COLLECTION_SPACE_ACTION_MISMATCH', `Node ${id} is not actually changed by this O8 space operation.`)
    }
  }
}

export function createNativeCollectionSpaceHistory({ repository, projectId, spatial, collectionSpace, projectNativeNodes, fail,
  nativeTapNowGroupBounds = false }: {
  repository: SqliteMetadataRepository
  projectId: string
  spatial: { withCanvasLock<T>(canvasId: string, operation: (locked: { read(): Promise<unknown>; execute(commands: unknown[]): Promise<any> }) => Promise<T>): Promise<T> }
  collectionSpace: {
    internal: {
      withValidatedLock<T>(input: { canvasId: string; collectionId: string; collectionNodeId?: string },
        operation: (context: LockedContext) => Promise<T>): Promise<T>
      buildFirstOpenPlan(input: { canvasId: string; collectionId: string }, value: SpaceOwner, snapshot: NativeSnapshot,
        requestedFrameId?: string): PlannedOpen
      validateCollectionAncestorChain(canvasId: string, value: SpaceOwner, snapshot: NativeSnapshot, frameId: string):
        Array<{ frameId: string; collectionId: string; carrierId: string }>
    }
  }
  projectNativeNodes: (canvasId: string, snapshot: NativeSnapshot) => Promise<Array<Record<string, any>>>
  fail: (status: number, code: string, message: string) => never
  nativeTapNowGroupBounds?: boolean
}) {
  if (!repository.getProject(projectId)) fail(404, 'PROJECT_NOT_FOUND', 'Collection space history needs an existing project owner.')
  const collectionMerge = createNativeCollectionMerge({ repository, projectId, spatial, projectNativeNodes, fail })

  function canonicalBindingOwned(binding: { entityType: string; entityId: string }): boolean {
    const id = binding.entityId
    switch (binding.entityType) {
      case 'artifact': {
        const artifact = repository.getArtifact(id)
        return !!artifact && String(artifact.projectId) === projectId
      }
      case 'view': {
        const view = repository.getArtifactView(id)
        const artifact = view ? repository.getArtifact(String(view.artifactId)) : undefined
        return !!view && !!artifact && String(artifact.projectId) === projectId
          && repository.getScopes(projectId).some(scope => String(scope.id) === String(view.scopeId))
      }
      case 'collection': {
        const collection = repository.getCollection(id)
        return !!collection && String(collection.projectId) === projectId
      }
      case 'note': {
        const note = repository.getNote(id)
        return !!note && String(note.projectId) === projectId
      }
      case 'scope':
        return repository.getScopes(projectId).some(scope => String(scope.id) === id)
      case 'workspace':
        return repository.getWorkspaces(projectId).some(workspace => String(workspace.id) === id)
      case 'conversation':
        return !!repository.getConnectedConversation(projectId, id)
      case 'run': {
        const run = repository.getRun(id as never)
        return !!run && String(run.projectId) === projectId
      }
      default:
        return false
    }
  }

  function expectedRevisionForNode(canvasId: string, spatialId: string, value: SpaceOwner): string {
    const normalized = value.bindings.filter(binding => binding.spatialId === spatialId)
    const raw = repository.getProjectionBindings(projectId).filter(binding => binding.canvasId === canvasId
      && binding.spatialKind === 'node' && String(binding.spatialId) === spatialId)
    if (normalized.length !== 1 || raw.length !== 1) {
      fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_UNAVAILABLE', `Node ${spatialId} has no unique exact Core material binding.`)
    }
    const binding = raw[0]!
    let artifactId: string
    let revisionId: string | undefined
    if (binding.entityType === 'artifact') {
      artifactId = String(binding.entityId)
      const artifact = repository.getArtifact(artifactId)
      if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined
        || !['image', 'markdown', 'text'].includes(String(artifact.kind))) {
        fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_UNAVAILABLE', `Node ${spatialId} is not an active project-owned material Artifact.`)
      }
      revisionId = artifact.currentRevisionId ? String(artifact.currentRevisionId) : undefined
      if (normalized[0]!.entityType !== 'artifact' || normalized[0]!.entityId !== artifactId) {
        fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_MISMATCH', `Host and Core disagree on the canonical Artifact identity for ${spatialId}.`)
      }
    } else if (binding.entityType === 'view') {
      const view = repository.getArtifactView(String(binding.entityId))
      const artifact = view ? repository.getArtifact(String(view.artifactId)) : undefined
      if (!view || !artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined
        || !['image', 'markdown', 'text'].includes(String(artifact.kind))) {
        fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_UNAVAILABLE', `Node ${spatialId} is not an active project-owned ArtifactView material.`)
      }
      artifactId = String(artifact.id)
      revisionId = view.revisionId ? String(view.revisionId) : undefined
      const hostIdentityMatches = normalized[0]!.entityType === 'artifact' && normalized[0]!.entityId === artifactId
        || normalized[0]!.entityType === 'view' && normalized[0]!.entityId === String(view.id)
      if (!hostIdentityMatches) fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_MISMATCH', `Gen2Host normalization conflicts with the exact ArtifactView for ${spatialId}.`)
    } else {
      fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_UNAVAILABLE', `Node ${spatialId} is not bound to a revisioned material Artifact or View.`)
    }
    const revision = revisionId ? repository.getArtifactRevision(revisionId) : undefined
    const file = revision ? repository.getFileRecord(String(revision.fileRecordId)) : undefined
    if (!revision || String(revision.artifactId) !== artifactId || revision.status === 'draft'
      || !file || String(file.projectId) !== projectId) {
      fail(409, 'COLLECTION_SPACE_REVISION_IDENTITY_UNAVAILABLE', `Node ${spatialId} has no exact readable non-draft material Revision.`)
    }
    return String(revision.id)
  }

  function validateExpectedRevisions(expected: unknown, space: ReturnType<typeof validateOperation>['space'], value: SpaceOwner) {
    if (expected === undefined) return
    if (!record(expected)) fail(400, 'COLLECTION_SPACE_REVISIONS_INVALID', 'lcos_expected_revisions must be an object keyed by exact native material NodeID.')
    const memberIds = new Set([...space.before, ...space.after].map(slice => slice.id).filter(id => id !== space.frameId))
    for (const [spatialId, revisionId] of Object.entries(expected)) {
      if (!spatialId.trim() || typeof revisionId !== 'string' || !revisionId.trim()) {
        fail(400, 'COLLECTION_SPACE_REVISIONS_INVALID', 'Each expected revision entry needs a non-empty native NodeID and RevisionID.')
      }
      if (!memberIds.has(spatialId)) {
        fail(409, 'COLLECTION_SPACE_REVISION_SCOPE_MISMATCH', `Expected revision key ${spatialId} is outside this exact Collection space operation.`)
      }
      const currentRevisionId = expectedRevisionForNode(space.canvasId, spatialId, value)
      if (revisionId !== currentRevisionId) {
        fail(409, 'COLLECTION_SPACE_REVISION_MISMATCH', `The expected material Revision for ${spatialId} is stale or does not match its canonical binding.`)
      }
    }
  }

  function validateTouchedBindings(snapshot: NativeSnapshot, value: SpaceOwner, ids: readonly string[], canvasId: string, frameId: string,
    allowedAncestorFrameIds: ReadonlySet<string> = new Set(), allowUnboundPhysicalIds: ReadonlySet<string> = new Set()) {
    const touchedIds = new Set(ids.filter(id => id !== frameId))
    // Use the same Gen2Host normalization as Collection planning. In particular,
    // a bound ArtifactView is intentionally surfaced as its canonical Artifact;
    // repository raw rows would reject that valid carrier or tempt a primary-view guess.
    const normalizedBindings = value.bindings
    if (!Array.isArray(normalizedBindings)) fail(503, 'COLLECTION_SPACE_BINDINGS_UNAVAILABLE', 'The original host did not provide normalized node bindings.')
    const bindingCounts = new Map<string, number>()
    for (const row of normalizedBindings) {
      if (!row || typeof row.spatialId !== 'string' || !row.spatialId
        || typeof row.entityType !== 'string' || !row.entityType
        || typeof row.entityId !== 'string' || !row.entityId) {
        fail(409, 'COLLECTION_SPACE_BINDING_INVALID', 'The original host returned an incomplete normalized ProjectionBinding.')
      }
      bindingCounts.set(row.spatialId, (bindingCounts.get(row.spatialId) ?? 0) + 1)
    }
    const duplicateTouched = [...touchedIds].find(id => (bindingCounts.get(id) ?? 0) > 1)
    if (duplicateTouched) fail(409, 'COLLECTION_SPACE_MEMBER_BINDING_MISMATCH', `Spatial member ${duplicateTouched} has multiple normalized Core bindings.`)
    const rowsById = new Map(normalizedBindings.map(row => [row.spatialId, row]))
    for (const id of touchedIds) {
      const node = snapshot.state.nodes.find(candidate => String(candidate.id) === id)
      if (allowedAncestorFrameIds.has(id) && node?.type === 'frame') continue
      const row = rowsById.get(id)
      if (row) {
        if (node?.type === 'frame') {
          fail(409, 'COLLECTION_SPACE_MEMBER_BINDING_MISMATCH', `Spatial frame ${id} cannot be treated as a bound material node.`)
        }
        if (!canonicalBindingOwned(row)) {
          fail(409, 'COLLECTION_SPACE_MEMBER_BINDING_MISMATCH', `Spatial member ${id} no longer resolves to a canonical entity owned by this project.`)
        }
        continue
      }
      if (allowUnboundPhysicalIds.has(id) && node?.type !== 'frame'
        && (node?.parentId === frameId || typeof node?.parentId === 'string' && allowedAncestorFrameIds.has(node.parentId))) continue
      // The original collectionHost includes an already-expanded nested Collection frame
      // beside its bound carrier as one layout footprint. The frame has no Core binding of
      // its own; prove the exact carrier/binding/member chain rather than guessing by label.
      const nestedCollectionId = node?.type === 'frame' ? node.data?.lcosCollectionId : undefined
      const nestedCarrierId = node?.type === 'frame' ? node.data?.lcosCollectionNodeId : undefined
      const nestedOwner = typeof nestedCarrierId === 'string' ? rowsById.get(nestedCarrierId) : undefined
      const nestedCollection = typeof nestedCollectionId === 'string' ? repository.getCollection(nestedCollectionId) : undefined
      const nestedFrames = typeof nestedCollectionId === 'string' ? snapshot.state.nodes.filter(candidate => candidate.type === 'frame'
        && candidate.data?.lcosCollectionId === nestedCollectionId) : []
      const nestedRaw = typeof nestedCarrierId === 'string' ? repository.getProjectionBindings(projectId).filter(binding =>
        binding.canvasId === canvasId && binding.spatialKind === 'node' && String(binding.spatialId) === nestedCarrierId) : []
      const nestedCarrier = typeof nestedCarrierId === 'string'
        ? snapshot.state.nodes.find(candidate => String(candidate.id) === nestedCarrierId) : undefined
      const nestedEcho = nestedCarrier?.data?.lcos_collection_ref
      if (typeof nestedCollectionId !== 'string' || !nestedCollectionId || !nestedCollection
        || String(nestedCollection.projectId) !== projectId || typeof nestedCarrierId !== 'string'
        || !nestedOwner || nestedOwner.entityType !== 'collection' || nestedOwner.entityId !== nestedCollectionId
        || !canonicalBindingOwned(nestedOwner) || nestedFrames.length !== 1 || String(nestedFrames[0]?.id) !== id
        || nestedRaw.length !== 1 || nestedRaw[0]?.entityType !== 'collection' || String(nestedRaw[0]?.entityId) !== nestedCollectionId
        || !nestedCarrier || nestedCarrier.type === 'frame'
        || (nestedEcho !== undefined && (!record(nestedEcho) || nestedEcho.projectId !== projectId || nestedEcho.canvasId !== canvasId
          || nestedEcho.workspaceId !== String(value.workspace.id) || nestedEcho.collectionId !== nestedCollectionId))) {
        fail(409, 'COLLECTION_SPACE_MEMBER_BINDING_MISMATCH', `Spatial member ${id} has no exact direct member binding or nested Collection frame owner.`)
      }
      fail(409, 'COLLECTION_SPACE_MEMBER_BINDING_MISMATCH', `Spatial member ${id} has no exact direct member binding or canonical nested Collection frame owner.`)
    }
  }

  function validateCurrentOperationSide(snapshot: NativeSnapshot, space: ReturnType<typeof validateOperation>['space'], value: SpaceOwner): 'before' | 'after' {
    const ids = [...new Set([...space.before.map(slice => slice.id), ...space.after.map(slice => slice.id)])]
    const exactFrame = snapshot.state.nodes.find(node => node.type === 'frame' && String(node.id) === space.frameId
      && node.data?.lcosCollectionId === space.collectionId && node.data?.lcosCollectionNodeId === space.collectionNodeId)
    if (exactFrame) {
      assertCurrentSlices(snapshot, space.after, ids, { id: space.frameId, collectionId: space.collectionId,
        collectionNodeId: space.collectionNodeId }, fail)
      const frameEdges = snapshot.state.edges.filter(edge => edge.source === space.frameId || edge.target === space.frameId)
      if (frameEdges.length) fail(409, 'COLLECTION_SPACE_FRAME_HAS_EDGES', 'The frame has user connections; undo will not discard them.')
      if (snapshot.state.nodes.some(node => node.type === 'frame' && node.data?.lcosCollectionId === space.collectionId && node.id !== space.frameId)) {
        fail(409, 'COLLECTION_SPACE_FRAME_ID_MISMATCH', 'A second Collection frame conflicts with the operation-owned frame id.')
      }
    } else {
      if (snapshot.state.nodes.some(node => node.type === 'frame' && node.data?.lcosCollectionId === space.collectionId)) {
        fail(409, 'COLLECTION_SPACE_FRAME_ID_MISMATCH', 'The Collection exists under a different frame id than this O8 history operation.')
      }
      assertCurrentSlices(snapshot, space.before, ids, undefined, fail)
    }
    const workspaceId = String(value.workspace.id)
    if (workspaceId !== space.workspaceId || String(value.collection.id) !== space.collectionId
      || String(value.binding.spatialId) !== space.collectionNodeId) {
      fail(409, 'COLLECTION_SPACE_OWNER_MISMATCH', 'Collection, carrier, Workspace, and Canvas no longer match the prepared O8 operation.')
    }
    validateTouchedBindings(snapshot, value, ids, space.canvasId, space.frameId)
    return exactFrame ? 'after' : 'before'
  }

  function sliceChangedIds(space: { frameId: string; before: readonly NativeCollectionSpaceSlice[]; after: readonly NativeCollectionSpaceSlice[] }): string[] {
    const before = mapSlices(space.before), after = mapSlices(space.after)
    return [...after.keys()].filter(id => {
      const a = before.get(id)!, b = after.get(id)!
      return a.parentId !== b.parentId || !samePoint(a.position, b.position)
        || a.size.width !== b.size.width || a.size.height !== b.size.height
    }).sort()
  }

  function positionParentChangedIds(space: { before: readonly NativeCollectionSpaceSlice[]; after: readonly NativeCollectionSpaceSlice[] }): string[] {
    const before = mapSlices(space.before), after = mapSlices(space.after)
    return [...after.keys()].filter(id => {
      const a = before.get(id)!, b = after.get(id)!
      return a.parentId !== b.parentId || !samePoint(a.position, b.position)
    }).sort()
  }

  function nestedArrangeFrameChain(snapshot: NativeSnapshot, targetFrameId: string): Set<string> {
    const nodes = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
    const chain = new Set<string>([targetFrameId])
    let cursor = nodes.get(targetFrameId)
    const visited = new Set<string>([targetFrameId])
    while (cursor?.parentId) {
      const parentId = String(cursor.parentId)
      if (visited.has(parentId)) break
      visited.add(parentId)
      const parent = nodes.get(parentId)
      if (!parent || parent.type !== 'frame') break
      chain.add(parentId)
      cursor = parent
    }
    return chain
  }

  function validateArrangeSide(snapshot: NativeSnapshot, space: ReturnType<typeof validateArrangementOperation>['space'], value: SpaceOwner): 'before' | 'after' | 'both' {
    const ids = [...new Set([...space.before.map(slice => slice.id), ...space.after.map(slice => slice.id)])]
    const byId = new Map<string, JsonRecord>()
    for (const node of snapshot.state.nodes) {
      const id = String(node.id ?? '')
      if (!id || byId.has(id)) fail(409, 'COLLECTION_ARRANGE_NODE_ID_AMBIGUOUS', 'The current Huabu snapshot has duplicate or missing node ids.')
      byId.set(id, node)
    }
    const exactFrame = byId.get(space.frameId)
    const frames = snapshot.state.nodes.filter(node => node.type === 'frame' && node.data?.lcosCollectionId === space.collectionId)
    if (!exactFrame || exactFrame.type !== 'frame' || exactFrame.data?.lcosCollectionId !== space.collectionId
      || exactFrame.data?.lcosCollectionNodeId !== space.collectionNodeId || frames.length !== 1) {
      fail(409, 'COLLECTION_ARRANGE_FRAME_MISMATCH', 'Arrange requires the same unique canonical Collection frame; frame lifecycle is not part of this operation.')
    }
    if (exactFrame.data?.locked === true || exactFrame.dragging === true
      || value.ownerNode.data?.locked === true || value.ownerNode.dragging === true) {
      fail(409, 'COLLECTION_HOST_NOT_FREE', 'The Collection host or carrier is locked or being dragged; no arrange history phase was applied.')
    }
    if (String(value.workspace.id) !== space.workspaceId || String(value.collection.id) !== space.collectionId
      || String(value.binding.spatialId) !== space.collectionNodeId || !value.existingFrame
      || String(value.existingFrame.id) !== space.frameId) {
      fail(409, 'COLLECTION_ARRANGE_OWNER_MISMATCH', 'Collection, carrier, Workspace, Canvas, and same-frame O8 history no longer match.')
    }
    const ancestorProofs = collectionSpace.internal.validateCollectionAncestorChain(space.canvasId, value, snapshot, space.frameId)
    const ancestors = new Set(ancestorProofs.map(item => item.frameId))
    const allowedHugFitFrames = ancestors.size ? new Set([space.frameId, ...ancestors]) : new Set<string>()
    const before = mapSlices(space.before), after = mapSlices(space.after)
    const expectedScopeIds = new Set<string>([space.frameId])
    for (const slices of [space.before, space.after]) {
      for (const slice of slices) if (slice.parentId === space.frameId) expectedScopeIds.add(slice.id)
    }
    for (const ancestor of ancestorProofs) {
      expectedScopeIds.add(ancestor.frameId)
      const actualChildren = snapshot.state.nodes.filter(node => node.parentId === ancestor.frameId).map(node => String(node.id)).sort()
      const beforeChildren = space.before.filter(slice => slice.parentId === ancestor.frameId).map(slice => slice.id).sort()
      const afterChildren = space.after.filter(slice => slice.parentId === ancestor.frameId).map(slice => slice.id).sort()
      if (!isDeepStrictEqual(beforeChildren, actualChildren) || !isDeepStrictEqual(afterChildren, actualChildren)) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_SCOPE_INCOMPLETE', `O8 must capture every direct child of canonical ancestor frame ${ancestor.frameId}.`)
      }
      for (const id of actualChildren) expectedScopeIds.add(id)
    }
    if (!isDeepStrictEqual([...expectedScopeIds].sort(), ids.slice().sort())) {
      fail(409, 'COLLECTION_ARRANGE_SCOPE_INCOMPLETE', 'O8 scope must equal the target frame/member set plus each exact canonical ancestor and its complete direct-child set.')
    }
    const ancestorParents = new Map(ancestorProofs.map(ancestor => [ancestor.frameId,
      nodeParent(byId.get(ancestor.frameId) ?? {})]))
    const fitFrameIds = new Set([space.frameId, ...ancestors])
    for (const id of ids) {
      const node = byId.get(id), beforeSlice = before.get(id), afterSlice = after.get(id)
      if (!node || !beforeSlice || !afterSlice) fail(409, 'COLLECTION_ARRANGE_NODE_MISSING', `Spatial node ${id} is missing from the current O8 scope.`)
      if ((beforeSlice.size.width !== afterSlice.size.width || beforeSlice.size.height !== afterSlice.size.height)
        && node.type !== 'frame') {
        fail(409, 'COLLECTION_ARRANGE_SIZE_UNSUPPORTED', `Only executor-owned frame fit bounds may differ in arrange history (${id}).`)
      }
      const frameSizeChanged = beforeSlice.size.width !== afterSlice.size.width || beforeSlice.size.height !== afterSlice.size.height
      if (frameSizeChanged) {
        const childIds = new Set([...space.before, ...space.after].filter(slice => slice.parentId === id).map(slice => slice.id))
        const childGeometryChanged = [...childIds].some(childId => {
          const a = before.get(childId), b = after.get(childId)
          return !!a && !!b && (a.parentId !== b.parentId || !samePoint(a.position, b.position)
            || a.size.width !== b.size.width || a.size.height !== b.size.height)
        })
        if (!fitFrameIds.has(id) || getFrameSizing(node as never) !== 'hug' || !childGeometryChanged) {
          fail(409, 'COLLECTION_ARRANGE_SIZE_UNSUPPORTED', `Arrange may change only a hug Collection/ancestor frame size derived from changed direct-child geometry (${id}).`)
        }
      }
      if (ancestors.has(id) || id === space.frameId) {
        const parentId = id === space.frameId ? nodeParent(exactFrame) : ancestorParents.get(id)!
        if (node.type !== 'frame' || beforeSlice.parentId !== parentId || afterSlice.parentId !== parentId) {
          fail(409, 'COLLECTION_ARRANGE_ANCESTOR_PARENT_CHANGED', `Collection frame ${id} must retain its exact existing parent.`)
        }
      } else if (beforeSlice.parentId !== afterSlice.parentId
        && !(beforeSlice.parentId === null && afterSlice.parentId === space.frameId)) {
        fail(409, 'COLLECTION_ARRANGE_SCOPE_INVALID', `Only a canonical free member may move from null parent into the target Collection frame (${id}).`)
      }
      const geometryChanged = beforeSlice.parentId !== afterSlice.parentId || !samePoint(beforeSlice.position, afterSlice.position)
        || beforeSlice.size.width !== afterSlice.size.width || beforeSlice.size.height !== afterSlice.size.height
      if (geometryChanged && (node.dragging === true || node.data?.locked === true)) {
        fail(409, 'COLLECTION_ARRANGE_LOCKED_NODE_CHANGED', `Arrange history would alter locked or dragging node ${id}.`)
      }
    }

    const matchesSide = (slices: readonly NativeCollectionSpaceSlice[]) => {
      const sliceById = mapSlices(slices)
      for (const id of ids) {
        const node = byId.get(id)!, expected = sliceById.get(id)!
        if (nodeParent(node) !== expected.parentId || !nearPoint(nodePosition(node), expected.position)) return false
        const beforeSlice = before.get(id)!, afterSlice = after.get(id)!
        if ((beforeSlice.size.width !== afterSlice.size.width || beforeSlice.size.height !== afterSlice.size.height)
          && node.type === 'frame') {
          const actualSize = nodeSize(node)
          if (!nearDerivedHugFrameSize(actualSize, expected.size, node,
            allowedHugFitFrames.has(id))) return false
        }
      }
      const actualChildren = snapshot.state.nodes.filter(node => node.parentId === space.frameId).map(node => String(node.id)).sort()
      const expectedChildren = slices.filter(slice => slice.id !== space.frameId && slice.parentId === space.frameId)
        .map(slice => slice.id).sort()
      if (!isDeepStrictEqual(actualChildren, expectedChildren)) return false
      for (const ancestor of ancestorProofs) {
        const ancestorNode = byId.get(ancestor.frameId)
        if (!ancestorNode || ancestorNode.type !== 'frame' || nodeParent(ancestorNode) !== ancestorParents.get(ancestor.frameId)) return false
        const actualAncestorChildren = snapshot.state.nodes.filter(node => node.parentId === ancestor.frameId).map(node => String(node.id)).sort()
        const expectedAncestorChildren = slices.filter(slice => slice.parentId === ancestor.frameId).map(slice => slice.id).sort()
        if (!isDeepStrictEqual(actualAncestorChildren, expectedAncestorChildren)) return false
      }
      return true
    }
    const beforeMatches = matchesSide(space.before)
    const afterMatches = matchesSide(space.after)
    if (!beforeMatches && !afterMatches) fail(409, 'COLLECTION_ARRANGE_STATE_CONFLICT', 'The current Canvas is not on either recorded O8 position/parent/frame-fit side.')

    // Every current physical child may be rearranged even if a prior Core
    // membership removal left it in place. New free admissions still require
    // an exact normalized canonical binding; this reuses the same owner check
    // as first-open, without re-running today's Collection membership on Undo.
    const allowedUnboundPhysicalIds = new Set([...space.before, ...space.after]
      .filter(slice => slice.id !== space.frameId && (slice.parentId === space.frameId || ancestors.has(String(slice.parentId))))
      .map(slice => slice.id))
    validateTouchedBindings(snapshot, value, ids, space.canvasId, space.frameId, ancestors, allowedUnboundPhysicalIds)
    return beforeMatches && afterMatches ? 'both' : beforeMatches ? 'before' : 'after'
  }

  async function project(snapshot: NativeSnapshot, canvasId: string) {
    const nodes = await projectNativeNodes(canvasId, snapshot)
    if (!Array.isArray(nodes)) fail(503, 'COLLECTION_SPACE_NATIVE_PROJECTION_UNAVAILABLE', 'The original native node projector did not return a node list.')
    const byId = new Map<string, JsonRecord>()
    for (const node of nodes) {
      if (!record(node) || typeof node.id !== 'string' || byId.has(node.id)) {
        fail(409, 'COLLECTION_SPACE_NATIVE_PROJECTION_AMBIGUOUS', 'The original native projection has duplicate or invalid node identities.')
      }
      byId.set(node.id, node)
    }
    return byId
  }

  function compareSlices(left: readonly NativeCollectionSpaceSlice[], right: readonly NativeCollectionSpaceSlice[],
    ids: readonly string[], label: string) {
    const a = mapSlices(left), b = mapSlices(right)
    for (const id of ids) {
      const first = a.get(id), second = b.get(id)
      if (!first || !second || first.parentId !== second.parentId || !samePoint(first.position, second.position)) {
        fail(409, 'COLLECTION_SPACE_SNAPSHOT_MISMATCH', `${label} parent/position does not match the original locked Huabu planner.`)
      }
    }
  }

  function compareArrangeSlices(left: readonly NativeCollectionSpaceSlice[], right: readonly NativeCollectionSpaceSlice[], label: string) {
    if (!isDeepStrictEqual(left.map(slice => slice.id).sort(), right.map(slice => slice.id).sort())) {
      fail(409, 'COLLECTION_ARRANGE_SNAPSHOT_MISMATCH', `${label} id set does not match the original locked Gen2 planner.`)
    }
    const a = mapSlices(left), b = mapSlices(right)
    for (const id of a.keys()) {
      const first = a.get(id)!, second = b.get(id)!
      if (first.parentId !== second.parentId || !samePoint(first.position, second.position)
        || first.size.width !== second.size.width || first.size.height !== second.size.height) {
        fail(409, 'COLLECTION_ARRANGE_SNAPSHOT_MISMATCH', `${label} position/parent/fit size does not match the original locked Gen2 planner.`)
      }
    }
  }

  function snapshotForArrangeProjection(snapshot: NativeSnapshot, slices: readonly NativeCollectionSpaceSlice[]): NativeSnapshot {
    const sliceById = mapSlices(slices)
    const nodes = snapshot.state.nodes.map(node => {
      const slice = sliceById.get(String(node.id))
      if (!slice) return node
      const next: JsonRecord = { ...node, position: { ...slice.position } }
      if (slice.parentId === null) delete next.parentId
      else next.parentId = slice.parentId
      if (node.type === 'frame') {
        next.width = slice.size.width
        next.height = slice.size.height
        next.measured = { ...(record(node.measured) ? node.measured : {}), ...slice.size }
        next.style = { ...(record(node.style) ? node.style : {}), ...slice.size }
      }
      return next
    })
    return { ...snapshot, state: { ...snapshot.state, nodes } }
  }

  function arrangeReplayCommands(snapshot: NativeSnapshot, space: ReturnType<typeof validateArrangementOperation>['space'],
    fromSlices: readonly NativeCollectionSpaceSlice[], toSlices: readonly NativeCollectionSpaceSlice[]): CanvasCommand[] {
    const from = mapSlices(fromSlices), to = mapSlices(toSlices)
    const currentNodes = new Map(snapshot.state.nodes.map(node => [String(node.id), node]))
    const outIds: string[] = [], inIds: string[] = []
    const geometry: Array<{ nodeId: string; position?: { x: number; y: number }; size?: { width: number; height: number } }> = []
    for (const id of from.keys()) {
      const prior = from.get(id)!, target = to.get(id)!
      const current = currentNodes.get(id)
      if (!current) fail(409, 'COLLECTION_ARRANGE_NODE_MISSING', `Spatial node ${id} disappeared before history replay.`)
      if (prior.parentId === space.frameId && target.parentId !== space.frameId) outIds.push(id)
      if (prior.parentId !== space.frameId && target.parentId === space.frameId) inIds.push(id)
      const positionChanged = !samePoint(prior.position, target.position) || prior.parentId !== target.parentId
      const sizeChanged = prior.size.width !== target.size.width || prior.size.height !== target.size.height
      if (positionChanged || sizeChanged) {
        const item: { nodeId: string; position?: { x: number; y: number }; size?: { width: number; height: number } } = { nodeId: id }
        // SET_NODE_PARENT performs world/local conversion. Write the exact
        // O8 target coordinate after the parent commands in this same engine
        // batch, before its final frame-fit pass, to avoid a floating-point
        // add/subtract round trip changing the recorded hug bounds.
        if (positionChanged || id === space.frameId) item.position = { ...target.position }
        if (current.type === 'frame' && sizeChanged) item.size = { ...target.size }
        geometry.push(item)
      }
    }
    const commands: CanvasCommand[] = []
    if (outIds.length) commands.push({ type: 'SET_NODE_PARENT', nodeIds: outIds as never[], parentId: null })
    if (inIds.length) commands.push({ type: 'SET_NODE_PARENT', nodeIds: inIds as never[], parentId: space.frameId as never })
    if (geometry.length) commands.push({ type: 'SET_NODE_GEOMETRY', items: geometry as never })
    return commands
  }

  function simulateArrangeReplay(snapshot: NativeSnapshot, space: ReturnType<typeof validateArrangementOperation>['space'],
    fromSlices: readonly NativeCollectionSpaceSlice[], toSlices: readonly NativeCollectionSpaceSlice[], canvasId: string) {
    const commands = arrangeReplayCommands(snapshot, space, fromSlices, toSlices)
    if (!commands.length) return { commands, target: snapshot }
    const result = executeCanvasCommands({ commands, source: 'ui' }, {
      nodes: [...snapshot.state.nodes] as never[], edges: [...snapshot.state.edges] as never[], canvasId,
    })
    if (result.commandResults.length !== commands.length || result.commandResults.some(command =>
      command.applied !== true && command.reason !== 'no-op')) {
      fail(409, 'COLLECTION_ARRANGE_PREFLIGHT_REJECTED', 'Huabu rejected the complete recorded arrange replay; no spatial write was sent.')
    }
    const target = { ...snapshot, state: { ...snapshot.state, nodes: result.writeResult.nodes, edges: result.writeResult.edges } }
    const targetById = new Map(target.state.nodes.map(node => [String(node.id), node]))
    const before = mapSlices(fromSlices), expected = mapSlices(toSlices)
    const frameChain = nestedArrangeFrameChain(snapshot, space.frameId)
    const nestedReplay = before.get(space.frameId)?.parentId !== null
    for (const id of before.keys()) {
      const node = targetById.get(id), slice = expected.get(id)
      if (!node || !slice || nodeParent(node) !== slice.parentId || !nearPoint(nodePosition(node), slice.position)) {
        fail(409, 'COLLECTION_ARRANGE_REPLAY_MISMATCH', `The original Huabu executor did not restore recorded position/parent for ${id}; got ${JSON.stringify({ parentId: node ? nodeParent(node) : undefined, position: node ? nodePosition(node) : undefined })}, expected ${JSON.stringify({ parentId: slice?.parentId, position: slice?.position })}.`)
      }
      const from = before.get(id)!
      if ((from.size.width !== slice.size.width || from.size.height !== slice.size.height)
        && node.type === 'frame') {
        const size = nodeSize(node)
        if (!nearDerivedHugFrameSize(size, slice.size, node, nestedReplay && frameChain.has(id))) {
          fail(409, 'COLLECTION_ARRANGE_REPLAY_SIZE_MISMATCH', `The original Huabu executor did not restore recorded same-frame fit bounds for ${id}; got ${JSON.stringify(size)}, expected ${JSON.stringify(slice.size)}.`)
        }
      }
    }
    return { commands, target }
  }

  function verifyArrangeNativeActions(actions: ReturnType<typeof normalizeActions>, phase: 'apply' | 'undo' | 'redo',
    space: ReturnType<typeof validateArrangementOperation>['space'],
    beforeDto: readonly JsonRecord[], afterDto: readonly JsonRecord[]) {
    if (actions.create.length || actions.delete.length) {
      fail(409, 'COLLECTION_ARRANGE_ACTION_SET_MISMATCH', 'Arrange is an update-only operation on the same existing Collection frame.')
    }
    const beforeSlices = mapSlices(space.before), afterSlices = mapSlices(space.after)
    const fromSlices = phase === 'undo' ? space.after : space.before
    const toSlices = phase === 'undo' ? space.before : space.after
    const fromById = mapSlices(fromSlices), toById = mapSlices(toSlices)
    const beforeById = new Map(beforeDto.map(node => [String(node.id), node]))
    const afterById = new Map(afterDto.map(node => [String(node.id), node]))
    const scopeIds = [...beforeSlices.keys()].sort()
    for (const id of scopeIds) {
      const from = beforeById.get(id), to = afterById.get(id)
      if (!from || !to || from.type !== to.type || !isDeepStrictEqual(from.data, to.data)) {
        fail(409, 'COLLECTION_ARRANGE_NATIVE_PROJECTION_MISMATCH', `Native identity/data/ref/title for ${id} changed across a spatial-only arrange.`)
      }
      const fromSlice = fromById.get(id)!, toSlice = toById.get(id)!
      if (!nearPoint(from.position, fromSlice.position) || !nearPoint(to.position, toSlice.position)
        || (from.parent_id ?? '') !== parentWire(fromSlice) || (to.parent_id ?? '') !== parentWire(toSlice)) {
        fail(409, 'COLLECTION_ARRANGE_NATIVE_PROJECTION_MISMATCH', `Native Canvas projection for ${id} does not match the exact O8 position/parent slices.`)
      }
    }
    const frame = afterById.get(space.frameId)
    if (!frame || frame.type !== 'group' || frame.data?.lcosCollectionId !== space.collectionId
      || frame.data?.lcosCollectionNodeId !== space.collectionNodeId) {
      fail(409, 'COLLECTION_ARRANGE_NATIVE_PROJECTION_MISMATCH', 'The native projection is not the exact same canonical Collection group.')
    }
    const updateById = new Map<string, JsonRecord>()
    for (const patch of actions.update) {
      if (!record(patch) || typeof patch.id !== 'string' || updateById.has(patch.id) || !beforeSlices.has(patch.id)) {
        failShape(fail, 'COLLECTION_ARRANGE_ACTIONS_INVALID', 'Arrange updates must address scoped existing nodes at most once.')
      }
      if (Object.keys(patch).some(key => !['id', 'canvas_id', 'type', 'data', 'position', 'measured', 'parent_id'].includes(key))) {
        fail(501, 'COLLECTION_ARRANGE_ACTION_UNSUPPORTED', 'Arrange cannot write node material, refs, titles, or arbitrary native fields.')
      }
      const source = beforeById.get(patch.id)!, target = afterById.get(patch.id)!
      if ((patch.type !== undefined && patch.type !== source.type)
        || (patch.canvas_id !== undefined && patch.canvas_id !== source.canvas_id)
        || (Object.hasOwn(patch, 'data') && !isDeepStrictEqual(patch.data, source.data))) {
        fail(409, 'COLLECTION_ARRANGE_MATERIAL_WRITE_NOT_ALLOWED', `Arrange attempted to change canonical native identity/data for ${patch.id}.`)
      }
      if (Object.hasOwn(patch, 'position') && !nearPoint(patch.position, target.position)) {
        fail(409, 'COLLECTION_ARRANGE_ACTION_MISMATCH', `Native position for ${patch.id} does not match the O8 target.`)
      }
      if (Object.hasOwn(patch, 'parent_id') && patch.parent_id !== (target.parent_id ?? '')) {
        fail(409, 'COLLECTION_ARRANGE_ACTION_MISMATCH', `Native parent for ${patch.id} does not match the O8 target.`)
      }
      if (Object.hasOwn(patch, 'measured') && !isDeepStrictEqual(patch.measured, target.measured)) {
        fail(409, 'COLLECTION_ARRANGE_MEASURED_MISMATCH', `Native measured-size echo for ${patch.id} does not match the target Canvas DTO.`)
      }
      const sourceSlice = fromById.get(patch.id)!, targetSlice = toById.get(patch.id)!
      if (sourceSlice.parentId !== targetSlice.parentId && (!Object.hasOwn(patch, 'parent_id') || patch.parent_id !== parentWire(targetSlice))) {
        fail(409, 'COLLECTION_ARRANGE_ACTION_MISMATCH', `Native parent update for ${patch.id} is missing or stale.`)
      }
      if (!nearPoint(sourceSlice.position, targetSlice.position) && (!Object.hasOwn(patch, 'position') || !nearPoint(patch.position, target.position))) {
        fail(409, 'COLLECTION_ARRANGE_ACTION_MISMATCH', `Native position update for ${patch.id} is missing or stale.`)
      }
      if ((sourceSlice.size.width !== targetSlice.size.width || sourceSlice.size.height !== targetSlice.size.height)
        && target.type === 'group' && (!Object.hasOwn(patch, 'measured') || !isDeepStrictEqual(patch.measured, target.measured))) {
        fail(409, 'COLLECTION_ARRANGE_MEASURED_MISMATCH', `Frame measured-size echo for ${patch.id} must equal its original target DTO.`)
      }
      updateById.set(patch.id, patch)
    }
    const required = sliceChangedIds(space).filter(id => {
      const beforeSlice = beforeSlices.get(id)!, afterSlice = afterSlices.get(id)!
      return beforeSlice.parentId !== afterSlice.parentId || !samePoint(beforeSlice.position, afterSlice.position)
        || ((beforeSlice.size.width !== afterSlice.size.width || beforeSlice.size.height !== afterSlice.size.height)
          && (beforeById.get(id)?.type === 'group' || afterById.get(id)?.type === 'group'))
    })
    const expectedActionIds = (phase === 'undo' ? required : required).sort()
    if (!isDeepStrictEqual([...updateById.keys()].sort(), expectedActionIds)) {
      fail(409, 'COLLECTION_ARRANGE_ACTION_SET_MISMATCH', 'Native update set must exactly cover moved nodes and effective native frame-size changes.')
    }
  }

  function recordedFrameTemplate(space: ReturnType<typeof validateOperation>['space'], collection: SpaceOwner['collection'],
    nativeTapNowGroupBounds: boolean): JsonRecord {
    const slice = space.after.find(item => item.id === space.frameId)
    if (!slice) fail(409, 'COLLECTION_SPACE_SNAPSHOT_MISMATCH', 'The recorded after side has no exact Collection frame slice.')
    const size = { width: slice.size.width, height: slice.size.height }
    return { id: space.frameId, type: 'frame', position: { ...slice.position }, parentId: slice.parentId ?? undefined,
      width: size.width, height: size.height, measured: size, style: size,
      data: { label: String(collection.title), origin: { type: 'user-created' },
        ...(nativeTapNowGroupBounds ? { sizing: 'manual' } : {}),
        lcosCollectionId: space.collectionId, lcosCollectionNodeId: space.collectionNodeId } }
  }

  function recordedRedoCommands(snapshot: NativeSnapshot, space: ReturnType<typeof validateOperation>['space'],
    collection: SpaceOwner['collection'], nativeTapNowGroupBounds: boolean): CanvasCommand[] {
    const frame = space.after.find(slice => slice.id === space.frameId)
    if (!frame) fail(409, 'COLLECTION_SPACE_SNAPSHOT_MISMATCH', 'Redo has no recorded frame geometry.')
    let createPosition = { ...frame.position }
    if (frame.parentId) {
      const parent = getAbsolutePosition(snapshot.state.nodes as never[], frame.parentId)
      if (!parent || !Number.isFinite(parent.x) || !Number.isFinite(parent.y)) {
        fail(409, 'COLLECTION_SPACE_GEOMETRY_UNRESOLVED', 'The recorded frame parent no longer has an absolute position.')
      }
      createPosition = { x: parent.x + frame.position.x, y: parent.y + frame.position.y }
    }
    const commands: CanvasCommand[] = [{ type: 'CREATE_NODES', nodes: [{
      id: space.frameId as never, nodeType: 'frame',
      data: { label: String(collection.title), origin: { type: 'user-created' },
        ...(nativeTapNowGroupBounds ? { sizing: 'manual' } : {}),
        lcosCollectionId: space.collectionId, lcosCollectionNodeId: space.collectionNodeId } as never,
      position: createPosition, size: { width: frame.size.width, height: frame.size.height },
    }] }]
    if (frame.parentId) commands.push({ type: 'SET_NODE_PARENT', nodeIds: [space.frameId as never], parentId: frame.parentId as never })
    const members = space.after.filter(slice => slice.id !== space.frameId)
    if (members.length) {
      commands.push({ type: 'SET_NODE_PARENT', nodeIds: members.map(slice => slice.id) as never[], parentId: space.frameId as never })
      commands.push({ type: 'SET_NODE_GEOMETRY', items: members.map(slice => ({ nodeId: slice.id as never, position: { ...slice.position } })) })
    }
    commands.push({ type: 'SET_NODE_SELECTION', nodeIds: [space.collectionNodeId as never] })
    return commands
  }

  async function commit(locked: LockedContext['locked'], snapshot: NativeSnapshot, commands: CanvasCommand[], canvasId: string,
    verify: (after: NativeSnapshot, receipt: any) => JsonRecord | Promise<JsonRecord>) {
    const simulation = executeCanvasCommands({ commands, source: 'ui' }, {
      nodes: [...snapshot.state.nodes] as never[], edges: [...snapshot.state.edges] as never[], canvasId,
    })
    if (simulation.commandResults.length !== commands.length || simulation.commandResults.some(result =>
      result.applied !== true && result.reason !== 'no-op')) {
      fail(409, 'COLLECTION_SPACE_PREFLIGHT_REJECTED', 'Huabu rejected the complete Collection space batch; no command was sent.')
    }
    const receipt = await locked.execute(commands)
    if (!record(receipt) || receipt.fromVersion !== snapshot.version || !Number.isSafeInteger(receipt.toVersion)
      || !Array.isArray(receipt.results) || receipt.results.length !== commands.length
      || receipt.results.some((result: JsonRecord) => result?.applied !== true && result?.reason !== 'no-op')) {
      fail(409, 'COLLECTION_SPACE_EXECUTION_INCOMPLETE', 'Huabu did not confirm the complete prevalidated Collection space batch.')
    }
    const after = await locked.read() as NativeSnapshot
    if (!record(after) || after.version !== receipt.toVersion || after.version <= snapshot.version) {
      fail(409, 'COLLECTION_SPACE_READBACK_VERSION_MISMATCH', 'Huabu did not read back the single committed space version.')
    }
    return await verify(after, receipt)
  }

  async function applyArrangeOperation(input: { canvasId: string; expectedVersion: number; operation: unknown; actions: unknown; expectedRevisions?: unknown }) {
    const operation = validateArrangementOperation(input.operation, input.canvasId, projectId, fail)
    const { space, phase } = operation
    const actions = Array.isArray(input.actions) && input.actions.length === 0
      ? { create: [] as JsonRecord[], update: [] as JsonRecord[], delete: [] as string[] }
      : normalizeActions(input.actions, fail)
    return collectionSpace.internal.withValidatedLock({ canvasId: input.canvasId, collectionId: space.collectionId, collectionNodeId: space.collectionNodeId },
      async ({ locked, snapshot, value }) => {
        if (snapshot.version !== input.expectedVersion) {
          fail(409, 'CANVAS_VERSION_CONFLICT', 'The current Canvas version changed; retain the O8 arrange entry and reread before retrying.')
        }
        const currentSide = validateArrangeSide(snapshot, space, value)
        validateExpectedRevisions(input.expectedRevisions, space as ReturnType<typeof validateOperation>['space'], value)
        const changedIds = sliceChangedIds(space)
        const children = (slices: readonly NativeCollectionSpaceSlice[]) => slices.filter(slice =>
          slice.id !== space.frameId && slice.parentId === space.frameId).map(slice => slice.id).sort()
        const noWriteReceipt = () => ({ canvas_id: input.canvasId, workspace_id: space.workspaceId,
          collection_id: space.collectionId, frame_id: space.frameId, node_ids: children(space.after),
          from_version: snapshot.version, to_version: snapshot.version, created: false, arranged: true,
          idempotent: true, provider_execution_started: false })

        let fromSnapshot: NativeSnapshot
        let toSnapshot: NativeSnapshot
        let commands: CanvasCommand[] = []
        let shouldWrite = false
        if (phase === 'apply' && currentSide === 'before') {
          if (space.sourceVersion !== snapshot.version) {
            fail(409, 'CANVAS_VERSION_CONFLICT', 'Arrange prepare version is stale; retain the O8 entry and prepare again.')
          }
          const plan = collectionSpace.internal.buildArrangementPlan({ canvasId: input.canvasId, collectionId: space.collectionId }, value, snapshot)
          if (plan.frameId !== space.frameId) fail(409, 'COLLECTION_ARRANGE_FRAME_MISMATCH', 'The original planner selected a different existing Collection frame.')
          compareArrangeSlices(plan.before, space.before, 'before')
          compareArrangeSlices(plan.after, space.after, 'after')
          if (!isDeepStrictEqual(plan.changedIds.slice().sort(), changedIds)) {
            fail(409, 'COLLECTION_ARRANGE_SNAPSHOT_MISMATCH', 'The O8 arrange changed-id set is not the exact position/parent/fit result of the original planner.')
          }
          fromSnapshot = plan.beforeSnapshot
          toSnapshot = plan.afterSnapshot
          commands = plan.commands
          shouldWrite = changedIds.length > 0 && commands.length > 0
        } else if (phase === 'apply' && (currentSide === 'after' || currentSide === 'both')) {
          fromSnapshot = snapshotForArrangeProjection(snapshot, space.before)
          toSnapshot = snapshotForArrangeProjection(snapshot, space.after)
        } else if (phase === 'undo' && currentSide === 'after') {
          fromSnapshot = snapshot
          const replay = simulateArrangeReplay(snapshot, space, space.after, space.before, input.canvasId)
          commands = replay.commands
          toSnapshot = snapshotForArrangeProjection(snapshot, space.before)
          shouldWrite = commands.length > 0
        } else if (phase === 'undo' && (currentSide === 'before' || currentSide === 'both')) {
          fromSnapshot = snapshotForArrangeProjection(snapshot, space.after)
          toSnapshot = snapshot
        } else if (phase === 'redo' && currentSide === 'before') {
          fromSnapshot = snapshot
          const replay = simulateArrangeReplay(snapshot, space, space.before, space.after, input.canvasId)
          commands = replay.commands
          toSnapshot = snapshotForArrangeProjection(snapshot, space.after)
          shouldWrite = commands.length > 0
        } else if (phase === 'redo' && (currentSide === 'after' || currentSide === 'both')) {
          fromSnapshot = snapshotForArrangeProjection(snapshot, space.before)
          toSnapshot = snapshot
        } else {
          fail(409, 'COLLECTION_ARRANGE_STATE_CONFLICT', 'The Canvas is not on the exact O8 side for this arrange phase.')
        }

        const fromDto = await project(fromSnapshot, input.canvasId)
        const toDto = await project(toSnapshot, input.canvasId)
        verifyArrangeNativeActions(actions, phase, space, [...fromDto.values()], [...toDto.values()])
        if (!shouldWrite) return noWriteReceipt()

        const expectedSlices = phase === 'undo' ? space.before : space.after
        const initialEdges = snapshot.state.edges
        return commit(locked, snapshot, commands, input.canvasId, async (after, receipt) => {
          const actualById = new Map(after.state.nodes.map(node => [String(node.id), node]))
          const exactFrame = actualById.get(space.frameId)
          if (!exactFrame || exactFrame.type !== 'frame' || exactFrame.data?.lcosCollectionId !== space.collectionId
            || exactFrame.data?.lcosCollectionNodeId !== space.collectionNodeId) {
            fail(409, 'COLLECTION_ARRANGE_READBACK_MISMATCH', 'Arrange did not preserve the same canonical Collection frame id and owner.')
          }
          const frameChain = nestedArrangeFrameChain(after, space.frameId)
          const nestedReplay = space.after.find(slice => slice.id === space.frameId)?.parentId !== null
          for (const slice of expectedSlices) {
            const node = actualById.get(slice.id)
            if (!node || nodeParent(node) !== slice.parentId || !nearPoint(nodePosition(node), slice.position)) {
              fail(409, 'COLLECTION_ARRANGE_READBACK_MISMATCH', `Huabu did not preserve parent/position for ${slice.id}.`)
            }
            const originalBefore = mapSlices(space.before).get(slice.id)!, originalAfter = mapSlices(space.after).get(slice.id)!
            if ((originalBefore.size.width !== originalAfter.size.width || originalBefore.size.height !== originalAfter.size.height)
              && node.type === 'frame') {
              const size = nodeSize(node)
              if (!nearDerivedHugFrameSize(size, slice.size, node,
                nestedReplay && frameChain.has(slice.id))) {
                fail(409, 'COLLECTION_ARRANGE_READBACK_SIZE_MISMATCH', `Huabu did not preserve executor-derived frame bounds for ${slice.id}.`)
              }
            }
          }
          const actualChildren = after.state.nodes.filter(node => node.parentId === space.frameId).map(node => String(node.id)).sort()
          if (!isDeepStrictEqual(actualChildren, children(expectedSlices))) {
            fail(409, 'COLLECTION_ARRANGE_READBACK_MISMATCH', 'Huabu did not preserve the exact same-frame direct-child set.')
          }
          const edgeKeys = (edges: readonly JsonRecord[]) => edges.map(edge => [String(edge.id), String(edge.source), String(edge.target)]).sort((a, b) => a[0].localeCompare(b[0]))
          if (!isDeepStrictEqual(edgeKeys(initialEdges as JsonRecord[]), edgeKeys(after.state.edges as JsonRecord[]))) {
            fail(409, 'COLLECTION_ARRANGE_EDGE_READBACK_MISMATCH', 'Arrange unexpectedly added, removed, or retargeted a Huabu edge.')
          }
          const actualDto = await project(after, input.canvasId)
          const expectedDto = toDto
          for (const id of space.before.map(slice => slice.id)) {
            const actual = actualDto.get(id), expected = expectedDto.get(id)
            const actualNode = actualById.get(id)
            const originalBefore = mapSlices(space.before).get(id)!, originalAfter = mapSlices(space.after).get(id)!
            const sizeChanged = originalBefore.size.width !== originalAfter.size.width || originalBefore.size.height !== originalAfter.size.height
            if (!actual || !expected || actual.type !== expected.type || !isDeepStrictEqual(actual.data, expected.data)
              || !nearPoint(actual.position, expected.position) || (actual.parent_id ?? '') !== (expected.parent_id ?? '')
              || !isDeepStrictEqual(actual.measured, expected.measured)
                && !nearDerivedHugFrameSize(actual.measured, expected.measured, actualNode,
                  nestedReplay && sizeChanged && frameChain.has(id))) {
              fail(409, 'COLLECTION_ARRANGE_NATIVE_READBACK_MISMATCH', `Native projection did not read back the exact target DTO for ${id}.`)
            }
          }
          return { canvas_id: input.canvasId, workspace_id: space.workspaceId, collection_id: space.collectionId,
            frame_id: space.frameId, node_ids: children(expectedSlices), from_version: receipt.fromVersion,
            to_version: after.version, created: false, arranged: true, idempotent: false, provider_execution_started: false }
        })
      })
  }

  async function applyOperation(input: { canvasId: string; expectedVersion: number; operation: unknown; actions: unknown; expectedRevisions?: unknown }) {
    if (!input || typeof input.canvasId !== 'string' || !input.canvasId.trim()
      || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      fail(400, 'INVALID_ARGUMENT', 'A current Canvas id and expected spatial version are required.')
    }
    if (record(input.operation) && input.operation.kind === 'collection-merge') return collectionMerge.applyOperation(input)
    if (record(input.operation) && input.operation.kind === 'collection-arrange') return applyArrangeOperation(input)
    const operation = validateOperation(input.operation, input.canvasId, projectId, fail)
    const { space, phase } = operation
    const actions = normalizeActions(input.actions, fail)
    return collectionSpace.internal.withValidatedLock({ canvasId: input.canvasId, collectionId: space.collectionId, collectionNodeId: space.collectionNodeId },
      async ({ locked, snapshot, value }) => {
        if (snapshot.version !== input.expectedVersion) {
          fail(409, 'CANVAS_VERSION_CONFLICT', 'The current Canvas version changed; retain the O8 edit and reread before retrying.')
        }
        const currentSide = validateCurrentOperationSide(snapshot, space, value)
        validateExpectedRevisions(input.expectedRevisions, space, value)
        const touchedIds = [...new Set([...space.before.map(slice => slice.id), ...space.after.map(slice => slice.id)])]
        let plan: PlannedOpen | undefined
        if (phase === 'apply' && currentSide === 'before') {
          plan = collectionSpace.internal.buildFirstOpenPlan({ canvasId: input.canvasId, collectionId: space.collectionId }, value, snapshot, space.frameId)
          if (space.sourceVersion !== snapshot.version) {
            fail(409, 'CANVAS_VERSION_CONFLICT', 'First-open prepare version is stale; retain the native edit and prepare again.')
          }
          if (!plan.created) fail(409, 'COLLECTION_SPACE_PLAN_UNAVAILABLE', 'First-open does not produce a new frame in the exact current Collection membership.')
          compareSlices(plan.before, space.before, touchedIds.filter(id => id !== space.frameId), 'before')
          compareSlices(plan.after, space.after, touchedIds, 'after')
        }
        const frameTemplate = recordedFrameTemplate(space, value.collection, nativeTapNowGroupBounds)
        let targetBeforeSnapshot: NativeSnapshot
        let targetAfterSnapshot: NativeSnapshot
        if (phase === 'apply' && plan) {
          targetBeforeSnapshot = plan.beforeSnapshot
          targetAfterSnapshot = plan.afterSnapshot
        } else if (phase === 'undo' && currentSide === 'after') {
          targetBeforeSnapshot = snapshot
          targetAfterSnapshot = targetSnapshot(snapshot, space.before, space.frameId, false)
        } else if (phase === 'undo' && currentSide === 'before') {
          // A retry after the committed Undo is validated against the recorded
          // O8 after-side, not a new plan based on today's Collection members.
          targetBeforeSnapshot = targetSnapshot(snapshot, space.after, space.frameId, true, frameTemplate)
          targetAfterSnapshot = snapshot
        } else if (phase === 'redo' && currentSide === 'before') {
          // Redo is a spatial history replay: membership may have changed since
          // first-open, so restore the exact recorded child set and coordinates.
          targetBeforeSnapshot = snapshot
          targetAfterSnapshot = targetSnapshot(snapshot, space.after, space.frameId, true, frameTemplate)
        } else if ((phase === 'apply' || phase === 'redo') && currentSide === 'after') {
          targetBeforeSnapshot = targetSnapshot(snapshot, space.before, space.frameId, false)
          targetAfterSnapshot = snapshot
        } else {
          fail(409, 'COLLECTION_SPACE_STATE_CONFLICT', 'The current Canvas is not on either exact side of this O8 operation.')
        }
        const beforeDto = await project(targetBeforeSnapshot, input.canvasId)
        const afterDto = await project(targetAfterSnapshot, input.canvasId)
        verifyNativeActions(actions, phase, { frameId: space.frameId, collectionId: space.collectionId,
          collectionNodeId: space.collectionNodeId }, space.before, space.after, [...beforeDto.values()], [...afterDto.values()], fail)

        if (phase === 'apply' || phase === 'redo') {
          if (currentSide === 'after') return { canvas_id: input.canvasId, workspace_id: space.workspaceId,
            collection_id: space.collectionId, frame_id: space.frameId,
            node_ids: space.after.map(slice => slice.id).filter(id => id !== space.frameId),
            from_version: snapshot.version, to_version: snapshot.version, created: false, idempotent: true,
            provider_execution_started: false }
          if (phase === 'apply' && !plan?.created) fail(409, 'COLLECTION_SPACE_PLAN_UNAVAILABLE', 'The original first-open plan did not produce a new frame.')
          const expectedChildren = space.after.map(slice => slice.id).filter(id => id !== space.frameId).sort()
          const commands = phase === 'apply' ? plan!.commands : recordedRedoCommands(snapshot, space, value.collection, nativeTapNowGroupBounds)
          return commit(locked, snapshot, commands, input.canvasId, (after, receipt) => {
            const frames = after.state.nodes.filter(node => node.type === 'frame' && node.data?.lcosCollectionId === space.collectionId)
            const savedFrame = frames.length === 1 ? frames[0] : undefined
            const actualChildren = after.state.nodes.filter(node => node.parentId === space.frameId).map(node => String(node.id)).sort()
            if (!savedFrame || String(savedFrame.id) !== space.frameId || savedFrame.data?.lcosCollectionNodeId !== space.collectionNodeId
              || !samePoint(nodePosition(savedFrame), space.after.find(slice => slice.id === space.frameId)?.position)
              || nodeParent(savedFrame) !== (space.after.find(slice => slice.id === space.frameId)?.parentId ?? null)
              || !isDeepStrictEqual(actualChildren, expectedChildren)) {
              fail(409, 'COLLECTION_SPACE_READBACK_MISMATCH', 'Huabu did not preserve the exact frame id, canonical owner, and direct child set.')
            }
            for (const id of expectedChildren) {
              const saved = after.state.nodes.find(node => String(node.id) === id)
              const planned = plan?.plannedNodes.find(node => String(node.id) === id)
              const expected = space.after.find(slice => slice.id === id)
              if (!saved || !expected || saved.parentId !== space.frameId
                || !samePoint(saved.position, expected.position)
                || (planned && !samePoint(saved.position, planned.position))) {
                fail(409, 'COLLECTION_SPACE_READBACK_MISMATCH', `Huabu did not preserve the exact parent/position for ${id}.`)
              }
            }
            return { canvas_id: input.canvasId, workspace_id: space.workspaceId, collection_id: space.collectionId,
              frame_id: space.frameId, node_ids: expectedChildren, from_version: receipt.fromVersion, to_version: after.version,
              created: true, idempotent: false, provider_execution_started: false }
          })
        }

        const frame = snapshot.state.nodes.find(node => String(node.id) === space.frameId)
        if (!frame) {
          // O8 retry after an already committed Undo is read-only and idempotent.
          return { canvas_id: input.canvasId, workspace_id: space.workspaceId, collection_id: space.collectionId,
            frame_id: space.frameId, node_ids: space.before.map(slice => slice.id), from_version: snapshot.version,
            to_version: snapshot.version, created: false, idempotent: true, provider_execution_started: false }
        }
        const childIds = space.before.map(slice => slice.id)
        const parentGroups = new Map<string, string[]>()
        for (const slice of space.before) {
          const key = slice.parentId ?? ''
          const ids = parentGroups.get(key) ?? []
          ids.push(slice.id)
          parentGroups.set(key, ids)
        }
        const commands: CanvasCommand[] = []
        for (const [parentId, ids] of parentGroups) commands.push({ type: 'SET_NODE_PARENT', nodeIds: ids as never[], parentId: parentId ? parentId as never : null })
        // DISSOLVE_FRAME is crucial: DELETE_NODES recursively removes descendants.
        // Children are detached first, so their Core-backed carrier files remain untouched.
        commands.push({ type: 'DISSOLVE_FRAME', frameId: space.frameId as never })
        if (space.before.length) commands.push({ type: 'SET_NODE_GEOMETRY', items: space.before.map(slice => ({
          nodeId: slice.id as never, position: { ...slice.position },
        })) })
        return commit(locked, snapshot, commands, input.canvasId, (after, receipt) => {
          if (after.state.nodes.some(node => node.type === 'frame' && node.data?.lcosCollectionId === space.collectionId
            && node.data?.lcosCollectionNodeId === space.collectionNodeId)) {
            fail(409, 'COLLECTION_SPACE_READBACK_MISMATCH', 'Undo did not remove the exact Collection frame.')
          }
          for (const slice of space.before) {
            const saved = after.state.nodes.find(node => String(node.id) === slice.id)
            if (!saved || nodeParent(saved) !== slice.parentId || !samePoint(saved.position, slice.position)) {
              fail(409, 'COLLECTION_SPACE_READBACK_MISMATCH', `Undo did not restore the original spatial parent/position for ${slice.id}.`)
            }
          }
          return { canvas_id: input.canvasId, workspace_id: space.workspaceId, collection_id: space.collectionId,
            frame_id: space.frameId, node_ids: childIds, from_version: receipt.fromVersion, to_version: after.version,
            created: false, idempotent: false, provider_execution_started: false }
        })
      })
  }

  return { applyOperation, prepareMerge: collectionMerge.prepare }
}
