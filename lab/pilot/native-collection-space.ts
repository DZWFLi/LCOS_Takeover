import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { executeCanvasCommands, getAbsolutePosition, planNodeFramePlacement } from '../../lcos/huabu/packages/shared/src/canvas-engine/index.ts'
import { getFrameSizing } from '../../lcos/huabu/packages/shared/src/canvas-engine/frame/sizing.js'
import type { CanvasCommand } from '../../lcos/huabu/packages/shared/src/index.ts'
import { collectionHostMemberIds, collectionHostMemberPlacement, collectionProjectedMemberIds, toggleCollectionHost } from '../../lcos/huabu/apps/web/src/lcos/nodes/collectionHost.ts'
import resolveGroupSelectionIntoFrame from '../../lcos/huabu/apps/web/src/handler/canvasCommand/resolvers/resolveGroupSelectionIntoFrame.ts'
import { readWorksitePresentations } from '../../lcos/apps/web-gen2/src/spatial/worksiteProjectionInput.ts'
import { planNativePileGroupLayout } from './native-pile-space-adapter.ts'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import type { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts'
import type { Node } from '@xyflow/react'
import type { NodeFramePlacement } from '../../lcos/huabu/packages/shared/src/canvas-engine/index.ts'

type JsonRecord = Record<string, any>
type SpatialSnapshot = { version: number; state: { nodes: Node[]; edges: unknown[] }; updatedAt?: number }
type LockedCanvas = { read(): Promise<unknown>; execute(commands: unknown[]): Promise<any> }
type NormalizedBinding = { spatialId: string; entityType: string; entityId: string }
type CollectionMembership = { collectionId: string; memberRef: { type: string; id: string } }
type CanonicalCollectionAncestor = { frameId: string; collectionId: string; carrierId: string }
export type NativeCollectionSpaceSlice = {
  id: string
  position: { x: number; y: number }
  parentId: string | null
  size: { width: number; height: number }
}

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function snapshotOf(value: unknown, fail: (status: number, code: string, message: string) => never): SpatialSnapshot {
  if (!record(value) || typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version < 0
    || !record(value.state) || !Array.isArray(value.state.nodes) || !Array.isArray(value.state.edges)) {
    fail(503, 'COLLECTION_SPACE_SNAPSHOT_UNAVAILABLE', 'The locked Huabu snapshot is incomplete; no spatial command was sent.')
  }
  return value as SpatialSnapshot
}

function nodeId(node: Node): string {
  return typeof node?.id === 'string' ? node.id : ''
}

function absolutePosition(nodes: readonly Node[], id: string, fail: (status: number, code: string, message: string) => never) {
  const value = getAbsolutePosition(nodes as Node[], id)
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    fail(409, 'COLLECTION_SPACE_GEOMETRY_UNRESOLVED', `Huabu could not resolve the absolute position for spatial node ${id}.`)
  }
  return { x: value.x, y: value.y }
}

function spatialSize(node: Node, fail: (status: number, code: string, message: string) => never) {
  const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? 0)
  const height = Number(node.measured?.height ?? node.height ?? node.style?.height ?? 0)
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    fail(409, 'COLLECTION_SPACE_GEOMETRY_UNRESOLVED', `Huabu has no positive measured size for spatial node ${node.id}.`)
  }
  return { width, height }
}

function spaceSlice(node: Node, fail: (status: number, code: string, message: string) => never): NativeCollectionSpaceSlice {
  const position = node.position
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    fail(409, 'COLLECTION_SPACE_GEOMETRY_UNRESOLVED', `Huabu has no finite local position for spatial node ${node.id}.`)
  }
  return { id: nodeId(node), position: { x: position.x, y: position.y },
    parentId: typeof node.parentId === 'string' && node.parentId ? node.parentId : null, size: spatialSize(node, fail) }
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return left.x === right.x && left.y === right.y
}

function nestedWorldRoundTripIsNoOp(id: string, before: Node, after: Node, beforeNodes: readonly Node[], afterNodes: readonly Node[],
  fail: (status: number, code: string, message: string) => never): boolean {
  const parentId = typeof before.parentId === 'string' && before.parentId ? before.parentId : null
  if (parentId !== (typeof after.parentId === 'string' && after.parentId ? after.parentId : null)) return false
  const localNear = (left: number, right: number) => Math.abs(left - right)
    <= Math.min(1e-7, Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right)))
  if (!localNear(before.position.x, after.position.x) || !localNear(before.position.y, after.position.y)) return false
  if (parentId) {
    const oldParentWorld = absolutePosition(beforeNodes, parentId, fail)
    const newParentWorld = absolutePosition(afterNodes, parentId, fail)
    if (!samePoint(oldParentWorld, newParentWorld)) return false
  }
  return samePoint(absolutePosition(beforeNodes, id, fail), absolutePosition(afterNodes, id, fail))
}

function nearNestedHugFitSize(before: Node, after: Node, nestedFrame: boolean,
  fail: (status: number, code: string, message: string) => never): boolean {
  const oldSize = spatialSize(before, fail), newSize = spatialSize(after, fail)
  const nestedHugFrame = nestedFrame && before.type === 'frame' && after.type === 'frame'
    && getFrameSizing(before as never) === 'hug'
  const near = (left: number, right: number) => Math.abs(left - right)
    <= Math.min(1e-7, Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right)))
  const sameDimensionSource = (left: unknown, right: unknown, key: 'width' | 'height') => {
    const leftHas = record(left) && Object.hasOwn(left, key), rightHas = record(right) && Object.hasOwn(right, key)
    if (leftHas !== rightHas) return false
    if (!leftHas) return true
    const a = (left as JsonRecord)[key], b = (right as JsonRecord)[key]
    if (a === b) return true
    return nestedHugFrame && typeof a === 'number' && Number.isFinite(a)
      && typeof b === 'number' && Number.isFinite(b) && near(a, b)
  }
  const sizeExact = oldSize.width === newSize.width && oldSize.height === newSize.height
  if (!sizeExact && (!nestedHugFrame || !near(oldSize.width, newSize.width) || !near(oldSize.height, newSize.height))) return false
  return ['width', 'height'].every(key => sameDimensionSource(before, after, key as 'width' | 'height')
    && sameDimensionSource(before.measured, after.measured, key as 'width' | 'height')
    && sameDimensionSource(before.style, after.style, key as 'width' | 'height'))
}

function onlyNestedRoundoffDiffers(before: Node, after: Node, beforeNodes: readonly Node[], afterNodes: readonly Node[],
  nestedFrame: boolean, fail: (status: number, code: string, message: string) => never): boolean {
  if (isDeepStrictEqual(before, after)) return true
  const parentId = typeof before.parentId === 'string' && before.parentId ? before.parentId : null
  if (parentId !== (typeof after.parentId === 'string' && after.parentId ? after.parentId : null)) return false
  if (!nestedWorldRoundTripIsNoOp(String(before.id), before, after, beforeNodes, afterNodes, fail)) return false
  if (!nearNestedHugFitSize(before, after, nestedFrame, fail)) return false
  const stripGeometry = (node: Node) => {
    const { position: _position, parentId: _parentId, measured, width: _width, height: _height, style, ...rest } = node
    const stableMeasured = measured && typeof measured === 'object'
      ? Object.fromEntries(Object.entries(measured).filter(([key]) => key !== 'width' && key !== 'height')) : measured
    const stableStyle = style && typeof style === 'object'
      ? Object.fromEntries(Object.entries(style).filter(([key]) => key !== 'width' && key !== 'height')) : style
    return { ...rest, measured: stableMeasured, style: stableStyle }
  }
  return isDeepStrictEqual(stripGeometry(before), stripGeometry(after))
}

function remapFrameId(commands: CanvasCommand[], oldId: string, newId: string): CanvasCommand[] {
  if (oldId === newId) return commands
  return commands.map(command => {
    if (command.type === 'CREATE_NODES') return { ...command, nodes: command.nodes.map(node => node.id === oldId ? { ...node, id: newId as never } : node) }
    if (command.type === 'SET_NODE_PARENT') return { ...command,
      nodeIds: command.nodeIds.map(id => id === oldId ? newId as never : id),
      parentId: command.parentId === oldId ? newId as never : command.parentId }
    if (command.type === 'SET_NODE_GEOMETRY') return { ...command,
      items: command.items.map(item => item.nodeId === oldId ? { ...item, nodeId: newId as never } : item) }
    if (command.type === 'SET_NODE_SELECTION') return { ...command,
      nodeIds: command.nodeIds.map(id => id === oldId ? newId as never : id) }
    return command
  })
}

/**
 * First-open adapter over the existing Core Collection/bindings and spatial
 * executor. Native-pile mode uses TapNow's original Group geometry helper;
 * legacy mode keeps its existing Gen2 collectionHost/group resolver. In-memory
 * simulations are discarded and never own Canvas truth or history.
 */
export function createNativeCollectionSpace({ repository, projectId, spatial, projectionHost, mode = 'gen2',
  nativeMemberNodeIds, nativeUnprojectedMemberCount, fail }: {
  repository: SqliteMetadataRepository
  projectId: string
  spatial: {
    withCanvasLock<T>(canvasId: string, operation: (locked: LockedCanvas) => Promise<T>): Promise<T>
  }
  projectionHost: (canvasId: string) => Pick<Gen2Host, 'projectId' | 'projects' | 'listNodeBindings'>
  mode?: 'gen2' | 'native-pile'
  nativeMemberNodeIds?: (canvasId: string, collectionId: string, nodes: readonly JsonRecord[]) => string[]
  nativeUnprojectedMemberCount?: (canvasId: string, collectionId: string, nodes: readonly JsonRecord[]) => number
  fail: (status: number, code: string, message: string) => never
}) {
  function ownedWorkspace(canvasId: string) {
    const matches = repository.getWorkspaces(projectId).filter(workspace => String(workspace.canvasId ?? '') === canvasId)
    if (matches.length !== 1 || String(matches[0]?.projectId ?? '') !== projectId) {
      fail(404, 'COLLECTION_SPACE_WORKSPACE_UNAVAILABLE', 'Collection space needs one exact Workspace owned by this project and Canvas.')
    }
    return matches[0]!
  }

  function ownedCollection(collectionId: string) {
    const collection = repository.getCollection(collectionId)
    if (!collection || String(collection.projectId) !== projectId || String(collection.id) !== collectionId) {
      fail(404, 'COLLECTION_NOT_FOUND', 'The canonical Collection is not owned by this project.')
    }
    return collection
  }

  async function withValidatedLock<T>(input: { canvasId: string; collectionId: string; collectionNodeId?: string },
    operation: (context: { locked: LockedCanvas; snapshot: SpatialSnapshot; value: Awaited<ReturnType<typeof validateAddress>> }) => Promise<T>): Promise<T> {
    if (!input || typeof input.canvasId !== 'string' || !input.canvasId.trim()
      || typeof input.collectionId !== 'string' || !input.collectionId.trim()) {
      fail(400, 'INVALID_ARGUMENT', 'Canvas and Collection ids are required.')
    }
    return spatial.withCanvasLock(input.canvasId, async locked => {
      const snapshot = snapshotOf(await locked.read(), fail)
      const value = await validateAddress(input.canvasId, input.collectionId, snapshot, input.collectionNodeId)
      return operation({ locked, snapshot, value })
    })
  }

  function assertAcyclicCollectionMembership(collectionId: string) {
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (currentId: string) => {
      if (visiting.has(currentId)) fail(409, 'COLLECTION_MEMBERSHIP_CYCLE', 'A nested Collection cycle blocks spatial expansion; no Canvas command was sent.')
      if (visited.has(currentId)) return
      const collection = ownedCollection(currentId)
      visiting.add(currentId)
      const rows = repository.listCollectionMemberships(projectId, currentId) as CollectionMembership[]
      for (const row of rows) {
        if (!row || String(row.collectionId) !== currentId || !row.memberRef
          || typeof row.memberRef.type !== 'string' || typeof row.memberRef.id !== 'string' || !row.memberRef.id.trim()) {
          fail(409, 'COLLECTION_MEMBER_INVALID', 'Core returned an incomplete Collection membership; no Canvas command was sent.')
        }
        if (row.memberRef.type === 'collection') {
          if (row.memberRef.id === String(collection.id) || !repository.getCollection(row.memberRef.id)) {
            fail(409, 'COLLECTION_MEMBER_INVALID', 'A nested Collection reference is missing or self-referential.')
          }
          visit(row.memberRef.id)
        }
      }
      visiting.delete(currentId)
      visited.add(currentId)
    }
    visit(collectionId)
  }

  async function validateAddress(canvasId: string, collectionId: string, snapshot: SpatialSnapshot,
    requestedCollectionNodeId?: string) {
    if (!canvasId.trim() || !collectionId.trim()) fail(400, 'INVALID_ARGUMENT', 'Canvas and Collection ids are required.')
    const workspace = ownedWorkspace(canvasId)
    const collection = ownedCollection(collectionId)
    let host: ReturnType<typeof projectionHost> | undefined
    if (mode !== 'native-pile') {
      host = projectionHost(canvasId)
      if (!host || String(host.projectId) !== projectId) fail(503, 'COLLECTION_SPACE_HOST_UNAVAILABLE', 'The original project projection host is not available for this project.')
      const graph = await host.projects.getProjectGraph(projectId)
      if (!graph || String(graph.project?.id ?? graph.projectId ?? '') !== projectId) {
        fail(404, 'PROJECT_NOT_FOUND', 'The original Gen2 project graph is unavailable.')
      }
      const presentations = await readWorksitePresentations(host.projects, projectId, graph, canvasId)
      if (presentations?.length !== 1 || !presentations[0]!.state.memberEntityRefs?.some(ref =>
        ref.type === 'collection' && String(ref.id) === collectionId)) {
        fail(409, 'COLLECTION_NOT_RECEIVED', 'This Worksite has not received the canonical Collection; spatial expansion does not create Core membership.')
      }
    }

    const nodes = snapshot.state.nodes
    const nodeRows: Array<[string, Node]> = nodes.map(node => [nodeId(node), node])
    const nodeById = new Map(nodeRows.filter(([id]) => id !== ''))
    if (nodeById.size !== nodes.length) fail(409, 'COLLECTION_SPACE_NODE_ID_AMBIGUOUS', 'The Canvas has missing or duplicate spatial node ids.')
    const bindings = (mode === 'native-pile'
      ? repository.getProjectionBindings(projectId).filter(binding => binding.projectId === projectId
        && binding.canvasId === canvasId && binding.spatialKind === 'node')
        .map(binding => ({ spatialId: String(binding.spatialId), entityType: String(binding.entityType), entityId: String(binding.entityId) }))
      : await host!.listNodeBindings()) as readonly NormalizedBinding[]
    if (!Array.isArray(bindings)) fail(503, 'COLLECTION_SPACE_BINDINGS_UNAVAILABLE', 'The original host did not return its canonical node bindings.')
    const bySpatial = new Map<string, NormalizedBinding>()
    for (const binding of bindings) {
      if (!binding || typeof binding.spatialId !== 'string' || !binding.spatialId
        || typeof binding.entityType !== 'string' || typeof binding.entityId !== 'string' || !binding.entityId) {
        fail(409, 'COLLECTION_SPACE_BINDING_INVALID', 'The original host returned an incomplete ProjectionBinding.')
      }
      const prior = bySpatial.get(binding.spatialId)
      if (prior) fail(409, 'COLLECTION_SPACE_BINDING_AMBIGUOUS', `Spatial node ${binding.spatialId} has multiple canonical identities.`)
      bySpatial.set(binding.spatialId, binding)
    }
    const collectionBindings = bindings.filter(binding => binding.entityType === 'collection' && binding.entityId === collectionId)
    if (collectionBindings.length !== 1) fail(409, 'COLLECTION_BINDING_AMBIGUOUS', 'The target Canvas must have exactly one canonical Collection carrier binding.')
    const binding = collectionBindings[0]!
    if (requestedCollectionNodeId !== undefined && requestedCollectionNodeId !== binding.spatialId) {
      fail(409, 'COLLECTION_CARRIER_MISMATCH', 'The requested carrier id does not match the exact Core ProjectionBinding.')
    }
    const ownerNode = nodeById.get(binding.spatialId)
    if (!ownerNode || ownerNode.type === 'frame') fail(409, 'COLLECTION_CARRIER_UNAVAILABLE', 'The exact Collection carrier binding has no saved non-frame Canvas node.')
    const echo = (ownerNode.data as JsonRecord | undefined)?.lcos_collection_ref
    if (echo !== undefined && (!record(echo) || echo.projectId !== projectId || echo.canvasId !== canvasId
      || echo.workspaceId !== String(workspace.id) || echo.collectionId !== collectionId)) {
      fail(409, 'COLLECTION_CARRIER_MISMATCH', 'The carrier renderer echo conflicts with the canonical Collection binding.')
    }

    assertAcyclicCollectionMembership(collectionId)
    const members = repository.listCollectionMemberships(projectId, collectionId) as CollectionMembership[]
    const seen = new Set<string>()
    for (const member of members) {
      const key = JSON.stringify([member.memberRef.type, member.memberRef.id])
      if (seen.has(key)) fail(409, 'COLLECTION_MEMBER_DUPLICATE', 'The canonical Collection returned a duplicate direct member.')
      seen.add(key)
    }
    // Gen2Host.listNodeBindings normalizes exact view bindings to artifact ids;
    // join those canonical identities to Core member refs, never to renderer data.
    const projectedMemberIds = mode === 'native-pile'
      ? nativeMemberNodeIds?.(canvasId, collectionId, nodes)
      : collectionProjectedMemberIds(nodes, bindings, members)
    if (!projectedMemberIds) fail(501, 'NATIVE_COLLECTION_MEMBERS_NOT_CONNECTED', 'Native pile space needs the same exact Core-member/current-Canvas join as its read projection.')
    const frameMemberIds = mode === 'native-pile'
      ? projectedMemberIds.filter(id => {
        const node = nodeById.get(id)
        const nodeBinding = bySpatial.get(id)
        // This first pass only groups free native material nodes. A nested Core
        // Collection's carrier and its existing Group are left untouched.
        return id !== binding.spatialId && !!node && node.type !== 'frame' && !node.parentId
          && node.data?.locked !== true && node.dragging !== true && nodeBinding?.entityType !== 'collection'
      })
      : collectionHostMemberIds(nodes, projectedMemberIds, binding.spatialId)
    const blockedMemberIds = projectedMemberIds.filter(id => !frameMemberIds.includes(id))
    const unprojectedMemberCount = mode === 'native-pile'
      ? nativeUnprojectedMemberCount?.(canvasId, collectionId, nodes) ?? members.length - Math.min(members.length, projectedMemberIds.length)
      : members.filter(member => !bindings.some(candidate =>
        candidate.entityType === member.memberRef.type && candidate.entityId === member.memberRef.id
        && nodeById.has(candidate.spatialId))).length
    const frames = nodes.filter(node => node.type === 'frame'
      && String((node.data as JsonRecord | undefined)?.lcosCollectionId ?? '') === collectionId)
    if (frames.length > 1) fail(409, 'COLLECTION_FRAME_AMBIGUOUS', 'More than one original Collection frame exists for this carrier.')
    const existingFrame = frames[0]
    if (existingFrame && String((existingFrame.data as JsonRecord | undefined)?.lcosCollectionNodeId ?? '') !== binding.spatialId) {
      fail(409, 'COLLECTION_FRAME_OWNER_MISMATCH', 'The existing Huabu frame is not owned by the exact Collection carrier.')
    }
    return { workspace, collection, host, binding, ownerNode, nodes, snapshotEdges: snapshot.state.edges, members, bindings,
      projectedMemberIds, frameMemberIds, blockedMemberIds, unprojectedMemberCount, existingFrame }
  }

  async function readProjection(input: { canvasId: string; collectionId: string; collectionNodeId?: string }) {
    if (!input || typeof input.canvasId !== 'string' || typeof input.collectionId !== 'string') {
      fail(400, 'INVALID_ARGUMENT', 'A Canvas id and canonical Collection id are required.')
    }
    return withValidatedLock(input, async ({ snapshot, value }) => {
      return {
        canvas_id: input.canvasId,
        workspace_id: String(value.workspace.id),
        collection_id: input.collectionId,
        collection_node_id: value.binding.spatialId,
        version: snapshot.version,
        frame_id: value.existingFrame ? nodeId(value.existingFrame) : null,
        node_ids: value.existingFrame
          ? value.nodes.filter(node => node.parentId === nodeId(value.existingFrame!)).map(nodeId)
          : value.frameMemberIds,
        unprojected_member_count: value.unprojectedMemberCount,
        blocked_node_ids: value.existingFrame ? [] : value.blockedMemberIds,
        created: false,
        provider_execution_started: false,
      }
    })
  }

  function buildFirstOpenPlan(input: { canvasId: string; collectionId: string }, value: Awaited<ReturnType<typeof validateAddress>>,
    snapshot: SpatialSnapshot, requestedFrameId?: string) {
    if (value.existingFrame) {
      const frameId = nodeId(value.existingFrame)
      const nodeIds = [frameId, ...value.nodes.filter(node => node.parentId === frameId).map(nodeId)]
      return { created: false as const, frameId, nodeIds, commands: [] as CanvasCommand[], plannedNodes: [...value.nodes],
        beforeSnapshot: snapshot, afterSnapshot: snapshot, before: value.nodes.filter(node => nodeIds.includes(nodeId(node)))
          .map(node => spaceSlice(node, fail)), after: value.nodes.filter(node => nodeIds.includes(nodeId(node)))
          .map(node => spaceSlice(node, fail)) }
    }
    if ((value.ownerNode.data as JsonRecord | undefined)?.locked === true || value.ownerNode.dragging === true) {
      fail(409, 'COLLECTION_CARRIER_NOT_FREE', 'The Collection carrier is locked or being dragged; no frame command was sent.')
    }
    if (requestedFrameId !== undefined && (!/^node-[0-9a-f-]{36}$/i.test(requestedFrameId)
      || value.nodes.some(node => nodeId(node) === requestedFrameId))) {
      fail(409, 'COLLECTION_FRAME_ID_INVALID', 'The preview frame id is malformed or already occupied in this Canvas.')
    }

    if (mode === 'native-pile') {
      if (value.ownerNode.parentId) {
        fail(501, 'NATIVE_COLLECTION_NESTED_CARRIER_UNAVAILABLE', 'This first native-pile pass only expands a root-level pile; no parent or spatial state was changed.')
      }
      const frameId = requestedFrameId ?? 'node-' + randomUUID()
      const selectedIds = [...value.frameMemberIds]
      if (!selectedIds.length) {
        fail(409, 'NATIVE_COLLECTION_GROUP_EMPTY', 'TapNow original Group layout needs at least one current Canvas member; canonical empty/unprojected membership remains unchanged.')
      }
      const title = String(value.collection.title)
      const layout = planNativePileGroupLayout({ nodes: value.nodes as unknown as JsonRecord[], selectedNodeIds: selectedIds,
        groupId: frameId, collectionNodeId: value.binding.spatialId, title, fail })
      const groupPosition = { x: Number(layout.frame.position.x), y: Number(layout.frame.position.y) }
      const groupSize = { width: Number(layout.frame.width), height: Number(layout.frame.height) }
      const commands: CanvasCommand[] = [{ type: 'CREATE_NODES', nodes: [{ id: frameId as never, nodeType: 'frame',
        // TapNow's original Group helper already owns the exact bounds. Huabu
        // defaults frames to `hug` and would add its own 12px fit padding at
        // the end of this command batch, translating/resizing the native Group.
        // Only this native-Group path marks its imported bounds as manual.
        data: { label: title, origin: { type: 'user-created' }, sizing: 'manual', lcosCollectionId: input.collectionId,
          lcosCollectionNodeId: value.binding.spatialId } as never,
        position: groupPosition, size: groupSize }] }]
      commands.push({ type: 'SET_NODE_PARENT', nodeIds: selectedIds as never[], parentId: frameId as never })
      commands.push({ type: 'SET_NODE_GEOMETRY', items: layout.nodes.map(node => ({
        nodeId: String(node.id) as never, position: { x: Number(node.position.x), y: Number(node.position.y) },
      })) })
      commands.push({ type: 'SET_NODE_SELECTION', nodeIds: [String(value.binding.spatialId) as never] })
      const simulation = executeCanvasCommands({ commands, source: 'ui' }, {
        nodes: [...value.nodes] as never[], edges: [...snapshot.state.edges] as never[], canvasId: input.canvasId,
      })
      if (simulation.commandResults.length !== commands.length || simulation.commandResults.some(result =>
        result.applied !== true && result.reason !== 'no-op')) {
        fail(409, 'NATIVE_COLLECTION_GROUP_PREFLIGHT_REJECTED', 'Huabu rejected TapNow original Group geometry before any spatial write.')
      }
      const plannedNodes = simulation.writeResult.nodes as Node[]
      const plannedFrame = plannedNodes.find(node => nodeId(node) === frameId && node.type === 'frame')
      if (!plannedFrame || String(plannedFrame.data?.lcosCollectionId ?? '') !== input.collectionId
        || String(plannedFrame.data?.lcosCollectionNodeId ?? '') !== value.binding.spatialId
        || plannedFrame.position.x !== groupPosition.x || plannedFrame.position.y !== groupPosition.y
        || spatialSize(plannedFrame, fail).width !== groupSize.width || spatialSize(plannedFrame, fail).height !== groupSize.height) {
        const actualSize = plannedFrame ? spatialSize(plannedFrame, fail) : undefined
        fail(409, 'NATIVE_COLLECTION_GROUP_PREFLIGHT_MISMATCH', 'Huabu simulation did not preserve the exact TapNow original Group bounds and Core identity: '
          + JSON.stringify({ expected: { frameId, collectionId: input.collectionId, collectionNodeId: value.binding.spatialId,
            position: groupPosition, size: groupSize }, actual: plannedFrame ? { frameId: nodeId(plannedFrame), type: plannedFrame.type,
            collectionId: plannedFrame.data?.lcosCollectionId ?? null, collectionNodeId: plannedFrame.data?.lcosCollectionNodeId ?? null,
            position: plannedFrame.position, size: actualSize } : null }))
      }
      for (const plannedChild of layout.nodes) {
        const saved = plannedNodes.find(node => nodeId(node) === String(plannedChild.id))
        if (!saved || saved.parentId !== frameId || saved.position.x !== plannedChild.position.x
          || saved.position.y !== plannedChild.position.y) {
          fail(409, 'NATIVE_COLLECTION_GROUP_PREFLIGHT_MISMATCH', `Huabu simulation did not preserve TapNow Group placement for ${String(plannedChild.id)}.`)
        }
      }
      const nodeIds = [frameId, ...selectedIds]
      const beforeNodes = value.nodes.filter(node => nodeIds.includes(nodeId(node)))
      const afterNodes = plannedNodes.filter(node => nodeIds.includes(nodeId(node)))
      return { created: true as const, frameId, nodeIds, commands, plannedNodes,
        beforeSnapshot: snapshot,
        afterSnapshot: { ...snapshot, state: { ...snapshot.state, nodes: plannedNodes } },
        before: beforeNodes.map(node => spaceSlice(node, fail)), after: afterNodes.map(node => spaceSlice(node, fail)) }
    }

    let commands: CanvasCommand[] | undefined
    let plannedNodes = [...value.nodes]
    let simulation: ReturnType<typeof executeCanvasCommands> | undefined
    const localState = {
      get nodes() { return plannedNodes },
      collapsedFrameIds: new Set<string>(),
      frameSelectedNodes: (options: { nodeIds?: readonly string[]; label?: string; collectionId?: string;
        collectionNodeId?: string; geometryUpdates?: any[]; emptyBounds?: { x: number; y: number; width: number; height: number } }) => {
        if (commands) fail(409, 'COLLECTION_FRAME_PLAN_AMBIGUOUS', 'The original first-open planner emitted more than one command batch.')
        const resolved = resolveGroupSelectionIntoFrame({ type: 'GROUP_SELECTION_INTO_FRAME', ...options,
          frameLabel: options.label }, { nodes: [...plannedNodes], edges: value.snapshotEdges ?? [] } as never)
        const initialCommands = resolved.commands
        if (!initialCommands.length) fail(409, 'COLLECTION_FRAME_PLAN_EMPTY', 'The original Huabu group resolver produced no frame commands.')
        const frameCreates = initialCommands.flatMap(command => command.type === 'CREATE_NODES'
          ? command.nodes.filter(node => node.nodeType === 'frame' && (node.data as JsonRecord | undefined)?.lcosCollectionId === input.collectionId
            && (node.data as JsonRecord | undefined)?.lcosCollectionNodeId === value.binding.spatialId).map(node => String(node.id ?? '')) : [])
        if (frameCreates.length !== 1 || !frameCreates[0]) fail(409, 'COLLECTION_FRAME_PLAN_INVALID', 'The original resolver must create exactly one frame for this Collection carrier.')
        commands = requestedFrameId ? remapFrameId(initialCommands, frameCreates[0]!, requestedFrameId) : initialCommands
        const permitted = new Set(['CREATE_NODES', 'SET_NODE_PARENT', 'SET_NODE_GEOMETRY', 'SET_NODE_SELECTION'])
        if (commands.some(command => !permitted.has(command.type))) {
          fail(409, 'COLLECTION_FRAME_PLAN_UNSUPPORTED', 'The original group resolver emitted a command outside first-open framing.')
        }
        simulation = executeCanvasCommands({ commands, source: 'ui' }, {
          nodes: [...plannedNodes], edges: value.snapshotEdges ?? [], canvasId: input.canvasId,
        })
        if (simulation.commandResults.length !== commands.length || simulation.commandResults.some(result =>
          result.applied !== true && result.reason !== 'no-op')) {
          fail(409, 'COLLECTION_FRAME_PREFLIGHT_REJECTED', 'The original Huabu engine rejected the complete frame batch; nothing was sent to the spatial writer.')
        }
        plannedNodes = simulation.writeResult.nodes
      },
      toggleFrameCollapse: (_id: string) => {},
    }
    const opened = toggleCollectionHost(() => localState, input.collectionId, value.binding.spatialId,
      String(value.collection.title), value.projectedMemberIds)
    if (!opened || !commands || !simulation) fail(409, 'COLLECTION_FRAME_PLAN_FAILED', 'The original Collection first-open planner did not produce a frame.')
    const plannedFrame = plannedNodes.find(node => node.type === 'frame'
      && String((node.data as JsonRecord | undefined)?.lcosCollectionId ?? '') === input.collectionId
      && String((node.data as JsonRecord | undefined)?.lcosCollectionNodeId ?? '') === value.binding.spatialId)
    if (!plannedFrame) fail(409, 'COLLECTION_FRAME_PLAN_FAILED', 'The original Huabu resolver did not create a canonical Collection frame.')
    const frameId = nodeId(plannedFrame)
    const children = plannedNodes.filter(node => node.parentId === frameId)
    const nodeIds = [frameId, ...children.map(nodeId)]
    if (!frameId || nodeIds.some(id => !id)) fail(409, 'COLLECTION_FRAME_PLAN_INVALID', 'The frame plan contains an incomplete spatial identity.')
    const beforeNodes = value.nodes.filter(node => nodeIds.includes(nodeId(node)))
    const afterNodes = plannedNodes.filter(node => nodeIds.includes(nodeId(node)))
    return { created: true as const, frameId, nodeIds, commands: commands!, plannedNodes, simulation: simulation!,
      beforeSnapshot: snapshot,
      afterSnapshot: { ...snapshot, state: { ...snapshot.state, nodes: plannedNodes } },
      before: beforeNodes.map(node => spaceSlice(node, fail)), after: afterNodes.map(node => spaceSlice(node, fail)) }
  }

  /** Resolve the physical parent chain through canonical Collection frames.
   * Renderer markers only locate candidates; repository rows and exact Core
   * ProjectionBindings prove each ancestor identity. Membership is purposely
   * not re-read as a history precondition: Undo/Redo replay recorded space. */
  function validateCollectionAncestorChain(canvasId: string, value: Awaited<ReturnType<typeof validateAddress>>,
    snapshot: SpatialSnapshot, frameId: string): CanonicalCollectionAncestor[] {
    const nodes = snapshot.state.nodes
    const byId = new Map(nodes.map(node => [nodeId(node), node]))
    const targetFrame = byId.get(frameId)
    const sameParent = (left: Node) => typeof left.parentId === 'string' && left.parentId ? left.parentId : null
    if (!targetFrame || sameParent(value.ownerNode) !== sameParent(targetFrame)) {
      fail(409, 'COLLECTION_ARRANGE_TARGET_CARRIER_PARENT_MISMATCH', 'The target Collection carrier must share the target frame parent.')
    }
    const seen = new Set<string>([frameId])
    const ancestors: CanonicalCollectionAncestor[] = []
    let child = byId.get(frameId)
    while (child?.parentId) {
      const ancestorId = String(child.parentId)
      if (seen.has(ancestorId)) fail(409, 'COLLECTION_SPACE_PARENT_CYCLE', 'The Collection frame parent chain is cyclic.')
      seen.add(ancestorId)
      const ancestor = byId.get(ancestorId)
      if (!ancestor) fail(409, 'COLLECTION_SPACE_PARENT_MISSING', 'An ancestor of the Collection frame is missing from the locked Canvas.')
      if (ancestor.type !== 'frame') {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_UNSUPPORTED', 'Only canonical Collection frames may be ancestors of this arrange operation.')
      }
      if (ancestor.data?.locked === true || ancestor.dragging === true) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_NOT_FREE', 'A locked or dragging Collection ancestor cannot participate in nested arrange.')
      }
      const collectionId = ancestor.data?.lcosCollectionId
      const carrierId = ancestor.data?.lcosCollectionNodeId
      if (typeof collectionId !== 'string' || !collectionId.trim() || typeof carrierId !== 'string' || !carrierId.trim()) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_UNSUPPORTED', 'An ordinary or unowned frame cannot be treated as a canonical Collection ancestor.')
      }
      const collection = repository.getCollection(collectionId)
      if (!collection || String(collection.id) !== collectionId || String(collection.projectId) !== projectId) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_OWNER_MISMATCH', 'A Collection ancestor is missing or belongs to another project.')
      }
      const frameCandidates = nodes.filter(node => node.type === 'frame'
        && String(node.data?.lcosCollectionId ?? '') === collectionId)
      if (frameCandidates.length !== 1 || nodeId(frameCandidates[0]!) !== ancestorId
        || String(frameCandidates[0]?.data?.lcosCollectionNodeId ?? '') !== carrierId) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_FRAME_MISMATCH', 'The ancestor frame marker does not resolve to one exact Collection frame and carrier.')
      }
      const normalized = value.bindings.filter(binding => binding.spatialId === carrierId)
      const raw = repository.getProjectionBindings(projectId).filter(binding => binding.canvasId === canvasId
        && binding.spatialKind === 'node' && String(binding.spatialId) === carrierId)
      const owner = byId.get(carrierId)
      if (normalized.length !== 1 || normalized[0]?.entityType !== 'collection' || normalized[0]?.entityId !== collectionId
        || raw.length !== 1 || raw[0]?.entityType !== 'collection' || String(raw[0]?.entityId) !== collectionId
        || !owner || owner.type === 'frame') {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_BINDING_MISMATCH', 'The ancestor carrier lacks one exact same-project Canvas Collection binding.')
      }
      if (sameParent(owner) !== sameParent(ancestor)) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_CARRIER_PARENT_MISMATCH', 'The canonical ancestor Collection carrier must share the ancestor frame parent.')
      }
      const echo = owner.data?.lcos_collection_ref
      if (echo !== undefined && (!record(echo) || echo.projectId !== projectId || echo.canvasId !== canvasId
        || echo.workspaceId !== String(value.workspace.id) || echo.collectionId !== collectionId)) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_CARRIER_MISMATCH', 'The ancestor carrier renderer reference conflicts with its canonical Core binding.')
      }
      ancestors.push({ frameId: ancestorId, collectionId, carrierId })
      child = ancestor
    }
    return ancestors
  }

  function nestedArrangeScope(value: Awaited<ReturnType<typeof validateAddress>>, beforeNodes: readonly Node[],
    afterNodes: readonly Node[], targetFrameId: string, placementItems: readonly NodeFramePlacement[],
    ancestors: readonly CanonicalCollectionAncestor[]) {
    const ids = new Set<string>([targetFrameId, ...placementItems.map(item => String(item.nodeId))])
    for (const nodes of [beforeNodes, afterNodes]) {
      for (const node of nodes) {
        if (node.parentId === targetFrameId) ids.add(nodeId(node))
        for (const ancestor of ancestors) if (node.parentId === ancestor.frameId) ids.add(nodeId(node))
      }
    }
    for (const ancestor of ancestors) ids.add(ancestor.frameId)
    const ordered = value.nodes.filter(node => ids.has(nodeId(node))).map(nodeId)
    if (ordered.length !== ids.size || ordered.some(id => !id)) {
      fail(409, 'COLLECTION_ARRANGE_PLAN_INVALID', 'The original planner scope references a missing or ambiguous spatial node.')
    }
    const beforeById = new Map(beforeNodes.map(node => [nodeId(node), node]))
    const afterById = new Map(afterNodes.map(node => [nodeId(node), node]))
    for (const id of ordered) {
      const before = beforeById.get(id), after = afterById.get(id)
      if (!before || !after) fail(409, 'COLLECTION_ARRANGE_PLAN_INVALID', `The original Huabu simulation omitted scoped node ${id}.`)
      if (!isDeepStrictEqual(before.data, after.data)) {
        fail(409, 'COLLECTION_ARRANGE_AUTHORED_DATA_CHANGED', `Spatial arrange would alter authored data for ${id}.`)
      }
      if (before.dragging === true || before.data?.locked === true) {
        const changed = before.parentId !== after.parentId || before.position.x !== after.position.x || before.position.y !== after.position.y
          || spatialSize(before, fail).width !== spatialSize(after, fail).width
          || spatialSize(before, fail).height !== spatialSize(after, fail).height
        if (changed) fail(409, 'COLLECTION_ARRANGE_LOCKED_NODE_CHANGED', `The original Huabu fit would move or resize locked/dragging node ${id}.`)
      }
      if (ancestors.some(ancestor => ancestor.frameId === id) && before.parentId !== after.parentId) {
        fail(409, 'COLLECTION_ARRANGE_ANCESTOR_PARENT_CHANGED', `The original arrange may fit an ancestor but cannot reparent it (${id}).`)
      }
    }
    return ordered
  }

  function nestedArrangeSolverNodes(value: Awaited<ReturnType<typeof validateAddress>>, targetFrameId: string,
    ancestors: readonly CanonicalCollectionAncestor[]): Node[] {
    const ancestorIds = new Set(ancestors.map(ancestor => ancestor.frameId))
    const protectedFrameIds = new Set([targetFrameId, ...ancestorIds])
    const flattenedSiblingIds = new Set(value.nodes.filter(node => typeof node.parentId === 'string'
      && ancestorIds.has(node.parentId) && !protectedFrameIds.has(nodeId(node))).map(nodeId))
    // The Collection carrier is the planner's stable anchor even when the
    // physical host is nested under a Collection frame. These clones exist
    // only for the original layout helper; commands and executor always use
    // the actual, parented Canvas nodes below.
    flattenedSiblingIds.add(String(value.binding.spatialId))
    return value.nodes.map(node => {
      const id = nodeId(node)
      if (ancestorIds.has(id)) return { ...node, hidden: true }
      if (!flattenedSiblingIds.has(id)) return node
      const world = absolutePosition(value.nodes, id, fail)
      const { parentId: _parentId, ...unparented } = node
      return { ...unparented, position: world }
    })
  }

  function buildArrangementPlan(input: { canvasId: string; collectionId: string }, value: Awaited<ReturnType<typeof validateAddress>>,
    snapshot: SpatialSnapshot) {
    if (mode === 'native-pile') {
      fail(501, 'NATIVE_COLLECTION_ARRANGE_UNAVAILABLE', 'Native Collection arrange has no connected original TapNow helper yet; first-open uses only original Group layout.')
    }
    const frame = value.existingFrame
    if (!frame) fail(409, 'COLLECTION_FRAME_NOT_OPEN', 'Arrange requires the original Collection host frame to exist; it does not create a frame.')
    const frameId = nodeId(frame)
    if ((frame.data as JsonRecord | undefined)?.locked === true || frame.dragging === true
      || (value.ownerNode.data as JsonRecord | undefined)?.locked === true || value.ownerNode.dragging === true) {
      fail(409, 'COLLECTION_HOST_NOT_FREE', 'The Collection host or its carrier is locked or being dragged; no arrange batch was sent.')
    }
    const ancestors = validateCollectionAncestorChain(input.canvasId, value, snapshot, frameId)

    // This is the same Gen2 arrange planner used by arrangeCollectionHost.
    // For nested Collections only, hide ancestor frames and flatten their
    // complete direct-child siblings to world-space in the solver-only input:
    // the original helper sees real obstacles rather than repeatedly pushing
    // the nested host out of its own hugging ancestor. Its eligibility input
    // remains the real-host result (not the transformed node array), so a
    // canonical member already parented under an outer/sibling frame is never
    // made newly free or stolen. Root-level arrange keeps the untouched path.
    const nested = ancestors.length > 0
    const solverNodes = nested ? nestedArrangeSolverNodes(value, frameId, ancestors) : value.nodes
    const solverMemberIds = nested ? value.frameMemberIds : value.projectedMemberIds
    const placement = collectionHostMemberPlacement(solverNodes as Node[], input.collectionId,
      solverMemberIds, 'arrange')
    let commands: CanvasCommand[] = []
    let plannedNodes = [...value.nodes]
    if (placement) {
      if (placement.frameId !== frameId) fail(409, 'COLLECTION_FRAME_OWNER_MISMATCH', 'The original arrange planner selected a different Collection frame.')
      commands = planNodeFramePlacement({ nodes: [...value.nodes] as never[], edges: [...snapshot.state.edges] as never[],
        canvasId: input.canvasId, source: 'ui' }, placement.items as readonly NodeFramePlacement[], frameId) ?? []
      if (placement.items.length && commands.length !== 2) {
        fail(409, 'COLLECTION_ARRANGE_PLAN_REJECTED', 'The original Huabu parent/geometry planner rejected this entire Collection arrange batch.')
      }
      if (commands.length) {
        const simulation = executeCanvasCommands({ commands, source: 'ui' }, {
          nodes: [...value.nodes] as never[], edges: [...snapshot.state.edges] as never[], canvasId: input.canvasId,
        })
        if (simulation.commandResults.length !== commands.length || simulation.commandResults.some(result =>
          result.applied !== true && result.reason !== 'no-op')) {
          fail(409, 'COLLECTION_ARRANGE_PREFLIGHT_REJECTED', 'Huabu rejected the complete original arrange batch; no spatial write was sent.')
        }
        plannedNodes = simulation.writeResult.nodes as Node[]
      }
    }

    // The original executor can fit the target Collection and every hugging
    // ancestor. Include each ancestor's complete direct-child set (including
    // same-parent siblings) so parent-local compensation remains part of O8.
    // No unprojected Collection member is synthesized.
    const scopeIds = nestedArrangeScope(value, value.nodes, plannedNodes, frameId, placement?.items ?? [], ancestors)
    const nodeById = new Map(value.nodes.map(node => [nodeId(node), node]))
    const afterById = new Map(plannedNodes.map(node => [nodeId(node), node]))
    if (scopeIds.some(id => !id || !nodeById.has(id) || !afterById.has(id))) {
      fail(409, 'COLLECTION_ARRANGE_PLAN_INVALID', 'The original arrange planner referenced a missing or ambiguous spatial node.')
    }
    const before = scopeIds.map(id => spaceSlice(nodeById.get(id)!, fail))
    const after = scopeIds.map(id => spaceSlice(afterById.get(id)!, fail))
    const beforeById = new Map(before.map(slice => [slice.id, slice]))
    const exactChangedIds = after.filter(slice => {
      const prior = beforeById.get(slice.id)!
      // Size changes are included as Huabu's effective hug-fit result. They
      // are observed and replay-validated, never accepted as arbitrary size
      // commands from the native action payload.
      return prior.parentId !== slice.parentId || prior.position.x !== slice.position.x || prior.position.y !== slice.position.y
        || prior.size.width !== slice.size.width || prior.size.height !== slice.size.height
    }).map(slice => slice.id)
    const noAdmission = (placement?.admittedIds.length ?? 0) === 0
    const plannedById = new Map(plannedNodes.map(node => [nodeId(node), node]))
    const nestedFrameIds = new Set([frameId, ...ancestors.map(ancestor => ancestor.frameId)])
    const nestedNoOpRoundoffOnly = nested && noAdmission && value.nodes.length === plannedNodes.length
      && value.nodes.every(node => {
        const id = nodeId(node), afterNode = plannedById.get(id)
        return !!afterNode && onlyNestedRoundoffDiffers(node, afterNode, value.nodes, plannedNodes,
          nestedFrameIds.has(id), fail)
      })
    // Exact changed ids stay intact for every real/mixed operation. Only a
    // whole nested plan with no admission can discard planner-only ULP noise;
    // no approximation is applied to actions in a batch that really changes.
    const changedIds = nestedNoOpRoundoffOnly ? [] : exactChangedIds
    // A planner may emit an identity placement for a no-op Collection. Do not
    // create an empty O8 history record or increment the Canvas version.
    if (nestedNoOpRoundoffOnly || exactChangedIds.length === 0) commands = []
    const admittedIds = commands.length ? [...(placement?.admittedIds ?? [])].map(String) : []
    return { created: false as const, frameId, nodeIds: scopeIds, commands, plannedNodes,
      beforeSnapshot: snapshot,
      afterSnapshot: commands.length ? { ...snapshot, state: { ...snapshot.state, nodes: plannedNodes } } : snapshot,
      before, after: commands.length ? after : before, changedIds: commands.length ? changedIds : [], admittedIds }
  }

  async function prepare(input: { canvasId: string; collectionId: string; collectionNodeId?: string }) {
    return withValidatedLock(input, async ({ snapshot, value }) => {
      const plan = buildFirstOpenPlan(input, value, snapshot)
      return { sourceVersion: snapshot.version, workspaceId: String(value.workspace.id), collectionId: input.collectionId,
        collectionNodeId: value.binding.spatialId, frameId: plan.frameId, nodeIds: plan.nodeIds,
        before: plan.before, after: plan.after, beforeSnapshot: plan.beforeSnapshot, afterSnapshot: plan.afterSnapshot,
        created: plan.created }
    })
  }

  async function prepareArrangement(input: { canvasId: string; collectionId: string; collectionNodeId?: string }) {
    return withValidatedLock(input, async ({ snapshot, value }) => {
      const plan = buildArrangementPlan(input, value, snapshot)
      return { sourceVersion: snapshot.version, workspaceId: String(value.workspace.id), collectionId: input.collectionId,
        collectionNodeId: value.binding.spatialId, frameId: plan.frameId, sameFrame: true as const, nodeIds: plan.nodeIds,
        before: plan.before, after: plan.after, beforeSnapshot: plan.beforeSnapshot, afterSnapshot: plan.afterSnapshot,
        changedIds: plan.changedIds, admittedIds: plan.admittedIds, unprojectedMemberCount: value.unprojectedMemberCount,
        blockedNodeIds: value.blockedMemberIds.filter(id => !value.nodes.some(node => node.parentId === plan.frameId && nodeId(node) === id)),
        created: false as const }
    })
  }

  async function apply(input: { canvasId: string; collectionId: string; collectionNodeId: string; expectedVersion: number }) {
    if (!input || typeof input.canvasId !== 'string' || !input.canvasId.trim()
      || typeof input.collectionId !== 'string' || !input.collectionId.trim()
      || typeof input.collectionNodeId !== 'string' || !input.collectionNodeId.trim()
      || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      fail(400, 'INVALID_ARGUMENT', 'Apply requires exact Canvas, Collection, carrier ids and the current Canvas version.')
    }
    return withValidatedLock(input, async ({ locked, snapshot, value }) => {
      if (snapshot.version !== input.expectedVersion) {
        fail(409, 'CANVAS_VERSION_CONFLICT', 'The Canvas changed since the space action was prepared; read it again before retrying.')
      }
      if (value.existingFrame) {
        const frameId = nodeId(value.existingFrame)
        return { canvas_id: input.canvasId, workspace_id: String(value.workspace.id), collection_id: input.collectionId,
          frame_id: frameId, node_ids: value.nodes.filter(node => node.parentId === frameId).map(nodeId),
          from_version: snapshot.version, to_version: snapshot.version, created: false, provider_execution_started: false }
      }
      const plan = buildFirstOpenPlan(input, value, snapshot)
      const { commands, plannedNodes, frameId } = plan
      const expectedChildren = plan.nodeIds.filter(id => id !== frameId).sort()
      const expectedPositions = new Map<string, { x: number; y: number }>([frameId, ...expectedChildren]
        .map(id => [id, absolutePosition(plannedNodes, id, fail)]))

      const receipt = await locked.execute(commands)
      if (!record(receipt) || receipt.fromVersion !== snapshot.version || !Number.isSafeInteger(receipt.toVersion)
        || !Array.isArray(receipt.results) || receipt.results.length !== commands.length
        || receipt.results.some((result: JsonRecord) => result?.applied !== true && result?.reason !== 'no-op')) {
        fail(409, 'COLLECTION_FRAME_EXECUTION_INCOMPLETE', 'The original spatial executor did not confirm the complete prevalidated frame batch.')
      }
      const after = snapshotOf(await locked.read(), fail)
      if (after.version !== receipt.toVersion || after.version <= snapshot.version) {
        fail(409, 'COLLECTION_FRAME_READBACK_VERSION_MISMATCH', 'Huabu committed the frame without a matching version readback.')
      }
      const afterFrames = after.state.nodes.filter(node => node.type === 'frame'
        && String((node.data as JsonRecord | undefined)?.lcosCollectionId ?? '') === input.collectionId)
      const savedFrame = afterFrames.length === 1 ? afterFrames[0] : undefined
      if (!savedFrame || nodeId(savedFrame) !== frameId
        || String((savedFrame.data as JsonRecord | undefined)?.lcosCollectionNodeId ?? '') !== value.binding.spatialId) {
        fail(409, 'COLLECTION_FRAME_READBACK_MISMATCH', 'The Huabu readback did not preserve the canonical Collection frame identity.')
      }
      const actualChildren = after.state.nodes.filter(node => node.parentId === frameId).map(nodeId).sort()
      if (JSON.stringify(actualChildren) !== JSON.stringify(expectedChildren)) {
        fail(409, 'COLLECTION_FRAME_READBACK_MISMATCH', 'The Huabu readback did not preserve the complete planned parent set.')
      }
      for (const id of [frameId, ...expectedChildren]) {
        const actual = after.state.nodes.find(node => nodeId(node) === id)
        const expected = plannedNodes.find(node => nodeId(node) === id)
        if (!actual || !expected || actual.parentId !== expected.parentId) {
          fail(409, 'COLLECTION_FRAME_READBACK_MISMATCH', `Huabu did not preserve parent identity for ${id}.`)
        }
        const actualPosition = absolutePosition(after.state.nodes, id, fail)
        const expectedPosition = expectedPositions.get(id)!
        if (actualPosition.x !== expectedPosition.x || actualPosition.y !== expectedPosition.y) {
          fail(409, 'COLLECTION_FRAME_READBACK_MISMATCH', `Huabu did not preserve the planned absolute position for ${id}.`)
        }
      }
      return { canvas_id: input.canvasId, workspace_id: String(value.workspace.id), collection_id: input.collectionId,
        frame_id: frameId, node_ids: expectedChildren, from_version: snapshot.version,
        to_version: after.version, created: true, provider_execution_started: false }
    })
  }

  return { readProjection, prepare, prepareArrangement, apply, internal: { withValidatedLock, buildFirstOpenPlan,
    buildArrangementPlan, validateCollectionAncestorChain, nestedWorldRoundTripIsNoOp, onlyNestedRoundoffDiffers } }
}
