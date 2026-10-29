import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { nativeCanvasGuiReferenceFields } from './native-canvas-gui-markers.ts'

type NodeRecord = Record<string, any>

/** Presentation translation only. Huabu retains the actual frame, parent and
 * local coordinates; TapNow's existing group renderer receives that same ID.
 * No Collection membership or material identity is inferred from a label. */
export function createNativeCollectionFrameProjection({ repository, projectId, fail, includeCollectionRef = false }: {
  repository: SqliteMetadataRepository
  projectId: string
  fail: (status: number, code: string, message: string) => never
  /** Native-pile pilot echo only; the Core binding remains the identity owner. */
  includeCollectionRef?: boolean
}) {
  function frame(canvasId: string, source: NodeRecord, nodes: readonly NodeRecord[], seen = new Set<string>()): NodeRecord | undefined {
    if (source.type !== 'frame') return undefined
    const ordinary = !['lcosCollectionId', 'lcosCollectionNodeId', 'lcos_collection_ref', 'lcos_native_collection']
      .some(key => Object.hasOwn(source.data ?? {}, key))
    const code = (name: string) => ordinary ? 'FRAME_' + name : 'COLLECTION_FRAME_' + name
    if (typeof source.id !== 'string' || !source.id.trim()
      || nodes.filter(node => node.id === source.id).length !== 1
      || source.data?.id !== undefined && source.data.id !== source.id) {
      fail(409, code('IDENTITY_MISMATCH'), 'The saved frame must have one exact spatial node identity.')
    }
    if (ordinary) {
      const workspaces = repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId)
      const bindings = repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
        && row.spatialKind === 'node' && row.spatialId === source.id)
      if (workspaces.length !== 1 || String(workspaces[0]?.projectId) !== projectId || bindings.length
        || nativeCanvasGuiReferenceFields.some(key => Object.hasOwn(source.data ?? {}, key))) {
        fail(409, 'FRAME_IDENTITY_MISMATCH', 'Only an exact unbound spatial frame has an ordinary Group presentation.')
      }
    }
    const collectionId = source.data?.lcosCollectionId
    const collectionNodeId = source.data?.lcosCollectionNodeId
    if (!ordinary && (typeof collectionId !== 'string' || !collectionId.trim()
      || typeof collectionNodeId !== 'string' || !collectionNodeId.trim())) {
      fail(501, 'FRAME_PRESENTATION_NOT_CONNECTED', 'Only an original canonical Collection frame has a TapNow group presentation.')
    }
    const collection = ordinary ? undefined : repository.getCollection(collectionId)
    const workspaces = repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId)
    const bindings = repository.getProjectionBindings(projectId).filter(row => row.canvasId === canvasId
      && row.spatialKind === 'node' && (row.spatialId === collectionNodeId || row.entityType === 'collection' && row.entityId === collectionId))
    const owner = nodes.filter(node => node.id === collectionNodeId)
    if (!ordinary && (!collection || String(collection.projectId) !== projectId || workspaces.length !== 1
      || bindings.length !== 1 || bindings[0]?.spatialId !== collectionNodeId
      || bindings[0]?.entityType !== 'collection' || bindings[0]?.entityId !== collectionId
      || owner.length !== 1 || source.id === collectionNodeId
      || nodes.filter(node => node.type === 'frame' && node.data?.lcosCollectionId === collectionId).length !== 1)) {
      fail(409, 'COLLECTION_FRAME_IDENTITY_MISMATCH', 'The saved frame does not resolve to one exact current-project Collection carrier.')
    }
    if (seen.has(String(source.id))) fail(409, code('PARENT_CYCLE'), 'A saved Collection frame has a cyclic parent chain.')
    seen.add(String(source.id))
    const parentId = source.parentId
    if (parentId !== undefined && parentId !== null && (typeof parentId !== 'string' || !parentId.trim())) {
      fail(409, code('PARENT_UNAVAILABLE'), 'The saved frame parent id must be a nonempty spatial node id.')
    }
    if (parentId) {
      const parents = nodes.filter(node => node.id === parentId)
      const parent = parents[0]
      if (typeof parentId !== 'string' || parents.length !== 1 || !parent || !frame(canvasId, parent, nodes, seen)) {
        fail(409, code('PARENT_UNAVAILABLE'), 'The saved Collection frame parent has no connected native group presentation.')
      }
    }
    const width = Number(source.measured?.width ?? source.size?.width ?? source.style?.width ?? source.width)
    const height = Number(source.measured?.height ?? source.size?.height ?? source.style?.height ?? source.height)
    if (!Number.isFinite(source.position?.x) || !Number.isFinite(source.position?.y)
      || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      fail(409, code('GEOMETRY_INVALID'), 'The saved Collection frame has no finite position and positive dimensions.')
    }
    return {
      id: String(source.id), canvas_id: canvasId, type: 'group',
      position: { x: source.position.x, y: source.position.y },
      measured: { width, height }, width, height,
      ...(parentId ? { parent_id: String(parentId) } : {}),
      ...(source.data?.locked === true || source.draggable === false ? { draggable: false } : {}),
      // Original GroupNode auto-layout runs for createdBy=server only. These
      // coordinates already came from the selected planner (TapNow original
      // Group helper in native-pile mode, legacy Gen2 otherwise) and must stay.
      data: { id: String(source.id), title: ordinary ? String(source.data?.label ?? source.data?.title ?? '未命名框') : collection!.title,
        createdBy: 'client', loading: false, layoutType: 'none',
        ...(ordinary ? { lcos_ordinary_frame_title: true, ...(source.data?.label !== undefined ? { label: source.data.label } : {}),
          ...Object.fromEntries(['color_pins', 'lcos_gui_navigation_pin', 'lcos_gui_emphasis'].filter(key => Object.hasOwn(source.data ?? {}, key))
            .map(key => [key, structuredClone(source.data[key])])) } : { lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId }),
        ...(!ordinary && includeCollectionRef ? { lcos_collection_ref: { projectId, canvasId, workspaceId: String(workspaces[0]!.id), collectionId } } : {}),
        ...(Object.hasOwn(source.data ?? {}, 'locked') ? { locked: source.data.locked } : {}) },
    }
  }

  function parent(canvasId: string, source: NodeRecord, nodes: readonly NodeRecord[]): { parent_id: string } | Record<string, never> {
    if (source.parentId === undefined || source.parentId === null) return {}
    if (typeof source.parentId !== 'string' || !source.parentId.trim()) {
      fail(409, 'NODE_PARENT_PRESENTATION_NOT_CONNECTED', 'The saved parent id is not a valid spatial node id.')
    }
    const candidate = nodes.find(node => node.id === source.parentId)
    if (!candidate || !frame(canvasId, candidate, nodes)) {
      fail(501, 'NODE_PARENT_PRESENTATION_NOT_CONNECTED', 'This parent has no connected original Collection group presentation.')
    }
    return { parent_id: String(source.parentId) }
  }

  return { frame, parent }
}
