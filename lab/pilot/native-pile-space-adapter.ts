import { planOriginalTapNowGroupLayout } from '../native-pile-group-layout.mjs'

type JsonRecord = Record<string, any>

function record(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Adapter for TapNow's original createNewGroup geometry only. It translates
 * current Huabu nodes to the original ReactFlow-shaped input, then checks that
 * the helper returns exactly the selected IDs as one direct group. It does not
 * own a Canvas snapshot, issue commands, or provide an arrange fallback.
 */
export function planNativePileGroupLayout({ nodes, selectedNodeIds, groupId, collectionNodeId, title, fail }: {
  readonly nodes: readonly JsonRecord[]
  readonly selectedNodeIds: readonly string[]
  readonly groupId: string
  readonly collectionNodeId: string
  readonly title: string
  readonly fail: (status: number, code: string, message: string) => never
}) {
  if (!Array.isArray(nodes) || !Array.isArray(selectedNodeIds) || selectedNodeIds.length === 0
    || !groupId.trim() || !collectionNodeId.trim()) {
    fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_UNAVAILABLE', 'TapNow Group layout needs a non-empty exact current-Canvas selection.')
  }
  const byId = new Map<string, JsonRecord>()
  for (const node of nodes) {
    const id = String(node?.id ?? '')
    if (!id || byId.has(id)) fail(409, 'COLLECTION_SPACE_NODE_ID_AMBIGUOUS', 'The current Canvas has missing or duplicate node IDs.')
    byId.set(id, node)
  }
  if (new Set(selectedNodeIds).size !== selectedNodeIds.length) {
    fail(409, 'NATIVE_COLLECTION_GROUP_SELECTION_AMBIGUOUS', 'TapNow Group layout selection contains duplicate node IDs.')
  }
  const selectedInput = selectedNodeIds.map(id => byId.get(id))
  if (selectedInput.some(node => !node || node.type === 'frame' || node.parentId
    || node.data?.locked === true || node.dragging === true)) {
    fail(409, 'NATIVE_COLLECTION_GROUP_SELECTION_UNAVAILABLE', 'Only exact free root-level Collection member nodes can be grouped in this first native pilot.')
  }

  const toTapNowNode = (node: JsonRecord): JsonRecord => {
    const width = Number(node.measured?.width ?? node.size?.width ?? node.style?.width ?? node.width ?? 0)
    const height = Number(node.measured?.height ?? node.size?.height ?? node.style?.height ?? node.height ?? 0)
    if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
      || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      fail(409, 'NATIVE_COLLECTION_GROUP_GEOMETRY_UNAVAILABLE', `TapNow Group layout needs finite current geometry for ${String(node.id)}.`)
    }
    const type = node.id === collectionNodeId ? 'pile' : node.type === 'frame' ? 'group'
      : node.type === 'note' ? 'text' : node.type
    return { ...node, type, position: { x: node.position.x, y: node.position.y },
      measured: { width, height } }
  }
  const nativeNodes = nodes.map(toTapNowNode)
  const nativeById = new Map(nativeNodes.map(node => [String(node.id), node]))
  const layout = planOriginalTapNowGroupLayout(nativeNodes, selectedNodeIds.map(id => nativeById.get(id)!), groupId, { title })
  if (!record(layout) || !record(layout.frame) || layout.frame.id !== groupId || layout.frame.type !== 'group'
    || !record(layout.frame.position) || !Number.isFinite(layout.frame.position.x) || !Number.isFinite(layout.frame.position.y)
    || !Number.isFinite(layout.frame.width) || layout.frame.width <= 0
    || !Number.isFinite(layout.frame.height) || layout.frame.height <= 0 || !Array.isArray(layout.nodes)) {
    fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_INVALID', 'TapNow original Group helper returned an incomplete Group or geometry result.')
  }
  const plannedById = new Map<string, JsonRecord>()
  for (const node of layout.nodes) {
    const id = String(node?.id ?? '')
    if (!id || plannedById.has(id)) fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_INVALID', 'TapNow original Group helper returned duplicate or missing child IDs.')
    plannedById.set(id, node)
  }
  if (plannedById.size !== byId.size || [...byId.keys()].some(id => !plannedById.has(id))) {
    fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_INVALID', 'TapNow original Group helper must preserve the complete current Canvas ID set.')
  }
  const selected = new Set(selectedNodeIds)
  for (const id of byId.keys()) {
    const source = nativeById.get(id)!
    const planned = plannedById.get(id)!
    if (selected.has(id)) {
      if (planned.parentId !== groupId || !planned.position
        || !Number.isFinite(planned.position.x) || !Number.isFinite(planned.position.y)
        || planned.type !== source.type || JSON.stringify(planned.data) !== JSON.stringify(source.data)) {
        fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_INVALID', `TapNow original Group helper returned an invalid or authored-data-changing child ${id}.`)
      }
      continue
    }
    if (planned.parentId !== source.parentId || planned.type !== source.type
      || planned.position?.x !== source.position?.x || planned.position?.y !== source.position?.y
      || JSON.stringify(planned.data) !== JSON.stringify(source.data)
      || planned.measured?.width !== source.measured?.width || planned.measured?.height !== source.measured?.height) {
      fail(409, 'NATIVE_COLLECTION_GROUP_LAYOUT_INVALID', `TapNow original Group helper changed non-selected Canvas node ${id}.`)
    }
  }
  return { frame: layout.frame as JsonRecord, nodes: selectedNodeIds.map(id => plannedById.get(id)!), bounds: layout.bounds }
}

