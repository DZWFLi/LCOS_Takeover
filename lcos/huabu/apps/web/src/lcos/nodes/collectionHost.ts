import { getAbsolutePosition } from '@huabu/shared/canvas-engine';

import { withCollectionGeometryCompanions } from './collectionDragCompanions';
import { collectionExpansionGeometry } from './collectionExpandLayout';

import type { CanvasNodeGeometryUpdate } from '@huabu/shared';
import type { NodeFramePlacement } from '@huabu/shared/canvas-engine';
import type { Node } from '@xyflow/react';

/** Presentation only. An existing physical host is never stolen by opening
 * another collection. Shared members remain available in the real preview. */
export function collectionHostMemberIds(nodes: readonly Node[], memberIds: readonly string[], ownerId: string): string[] {
  const ids = new Set(memberIds);
  const hosted = nodes.filter((node) => ids.has(node.id) && node.id !== ownerId && !node.parentId
    && node.data?.locked !== true && !node.dragging);
  const accepted = new Set(hosted.map((node) => node.id));
  // A selected nested collection carries its already-existing spatial host;
  // this is not an additional canonical member or a second projection.
  for (const frame of nodes) {
    const bodyId = frame.data?.lcosCollectionNodeId;
    if (frame.type !== 'frame' || typeof bodyId !== 'string' || !accepted.has(bodyId)) continue;
    if (frame.parentId || frame.data?.locked === true || frame.dragging) accepted.delete(bodyId);
    else accepted.add(frame.id);
  }
  return [...accepted];
}

export interface CollectionFrameOptions {
  readonly nodeIds?: readonly string[];
  readonly label?: string;
  readonly collectionId?: string;
  readonly collectionNodeId?: string;
  readonly geometryUpdates?: CanvasNodeGeometryUpdate[];
  readonly emptyBounds?: { x: number; y: number; width: number; height: number };
}
export interface CollectionHostState {
  readonly nodes: readonly Node[];
  readonly collapsedFrameIds: ReadonlySet<string>;
  frameSelectedNodes(options: CollectionFrameOptions): void;
  toggleFrameCollapse(id: string): void;
}
/** Reopening does NOT enrol newly shared members or re-run a layout. */
export function toggleCollectionHost(getState: () => CollectionHostState, collectionId: string, ownerId: string,
  title: string, memberIds: readonly string[]): boolean {
  const state = getState();
  const owner = state.nodes.find((node) => node.id === ownerId);
  if (!owner) return false;
  const frame = state.nodes.find((node) => node.type === 'frame' && node.data?.lcosCollectionId === collectionId);
  if (frame) { state.toggleFrameCollapse(frame.id); return true; }
  const nodeIds = collectionHostMemberIds(state.nodes, memberIds, ownerId);
  const position = getAbsolutePosition(state.nodes as Node[], owner.id) ?? owner.position;
  // G1's first-open fan-out used to be an orphaned helper here. Feed it through
  // the existing Huabu grouping command so layout + parenting share history.
  // Existing hosts take the early return above: user placement wins on reopen.
  const geometryUpdates = withCollectionGeometryCompanions(state.nodes,
    collectionExpansionGeometry(state.nodes, ownerId, nodeIds));
  state.frameSelectedNodes({ nodeIds, label: title, collectionId, collectionNodeId: ownerId,
    geometryUpdates,
    emptyBounds: { x: position.x + 292, y: position.y, width: 320, height: 220 } });
  return getState().nodes.some((node) => node.type === 'frame' && node.data?.lcosCollectionId === collectionId);
}

/** Explicit repair/tidy of an existing host. Resolve in absolute coordinates,
 * then send existing Huabu parent-relative geometry back in one undoable batch.
 * Neither opening nor refreshing calls this action. */
export function collectionHostArrangementGeometry(nodes: readonly Node[], collectionId: string): CanvasNodeGeometryUpdate[] {
  const frame = nodes.find((node) => node.type === 'frame' && node.data?.lcosCollectionId === collectionId);
  const ownerId = frame?.data?.lcosCollectionNodeId;
  if (!frame || frame.data.locked === true || frame.dragging || typeof ownerId !== 'string') return [];
  const owner = nodes.find((node) => node.id === ownerId);
  if (!owner || owner.dragging || owner.data.locked === true) return [];
  const framePosition = getAbsolutePosition(nodes as Node[], frame.id) ?? frame.position;
  const childIds = nodes.filter((node) => node.parentId === frame.id).map((node) => node.id);
  // A solver snapshot only. Existing runtime nodes/parents remain untouched.
  const planningNodes = nodes.map((node) => {
    if (node.id === frame.id) return { ...node, hidden: true };
    if (node.parentId !== frame.id) return node;
    const { parentId: _parentId, ...rest } = node;
    return { ...rest, position: getAbsolutePosition(nodes as Node[], node.id) ?? node.position };
  });
  const movableIds = collectionHostMemberIds(planningNodes, childIds, ownerId);
  const geometry = withCollectionGeometryCompanions(planningNodes,
    collectionExpansionGeometry(planningNodes, ownerId, movableIds, childIds.filter((id) => !movableIds.includes(id))));
  return geometry.flatMap((update) => update.position ? [{ ...update, position: {
    x: update.position.x - framePosition.x, y: update.position.y - framePosition.y,
  } }] : []);
}

export function arrangeCollectionHost(state: {
  readonly nodes: readonly Node[];
  beginGesture(command: 'SET_NODE_GEOMETRY'): void;
  setNodeGeometry(items: CanvasNodeGeometryUpdate[]): void;
  placeNodesInFrame?(items: readonly NodeFramePlacement[], frameId: string): boolean;
}, collectionId: string, memberIds: readonly string[] = []): boolean {
  const placement = collectionHostMemberPlacement(state.nodes, collectionId, memberIds, 'arrange');
  if (placement && state.placeNodesInFrame) return state.placeNodesInFrame(placement.items, placement.frameId);
  // A port without the existing native parent batch must never report orphan adoption as success.
  if (placement?.admittedIds.length) return false;
  const geometry = collectionHostArrangementGeometry(state.nodes, collectionId);
  if (!geometry.length) return false;
  // SET_NODE_GEOMETRY has snapshot:'caller'. Match native resize/tidy actions.
  state.beginGesture('SET_NODE_GEOMETRY');
  state.setNodeGeometry(geometry);
  return true;
}

/** Reuse the native geometry+parent batch. Existing members retain world positions
 * on admission; only explicit Arrange authors a new layout. Shared parents are never stolen. */
export function collectionHostMemberPlacement(nodes: readonly Node[], collectionId: string, memberIds: readonly string[],
  mode: 'preserve' | 'arrange'): { frameId: string; admittedIds: readonly string[]; items: readonly NodeFramePlacement[] } | undefined {
  const frame = nodes.find(node => node.type === 'frame' && node.data.lcosCollectionId === collectionId);
  const ownerId = frame?.data.lcosCollectionNodeId;
  const owner = typeof ownerId === 'string' ? nodes.find(node => node.id === ownerId) : undefined;
  if (!frame || !owner || frame.data.locked || frame.dragging || owner.data.locked || owner.dragging) return;
  const admittedIds = collectionHostMemberIds(nodes, memberIds, owner.id).filter(id => id !== frame.id);
  const admitted = new Set(admittedIds);
  if (mode === 'preserve') {
    // A structured native frame reflows children; it cannot promise stable world coordinates.
    if (admittedIds.length && frame.data.layoutMode && frame.data.layoutMode !== 'free') return;
    return { frameId: frame.id, admittedIds, items: admittedIds.flatMap(id => {
      const node = nodes.find(candidate => candidate.id === id);
      return node ? [{ nodeId: id, position: getAbsolutePosition(nodes as Node[], id) ?? node.position }] : [];
    }) };
  }
  const framePosition = getAbsolutePosition(nodes as Node[], frame.id) ?? frame.position;
  // Solver-only parent projection, not a write or another runtime.
  const planning = nodes.map(node => admitted.has(node.id) ? { ...node, parentId: frame.id, position: {
    x: (getAbsolutePosition(nodes as Node[], node.id) ?? node.position).x - framePosition.x,
    y: (getAbsolutePosition(nodes as Node[], node.id) ?? node.position).y - framePosition.y,
  } } : node);
  const geometry = collectionHostArrangementGeometry(planning, collectionId);
  const items = geometry.flatMap(update => update.position ? [{ nodeId: String(update.nodeId), position: admitted.has(String(update.nodeId))
    ? { x: update.position.x + framePosition.x, y: update.position.y + framePosition.y } : update.position }] : []);
  return items.length ? { frameId: frame.id, admittedIds, items } : undefined;
}

export function admitCollectionHostMembers(state: {
  readonly nodes: readonly Node[];
  placeNodesInFrame(items: readonly NodeFramePlacement[], frameId: string): boolean;
}, collectionId: string, memberIds: readonly string[]): boolean {
  const placement = collectionHostMemberPlacement(state.nodes, collectionId, memberIds, 'preserve');
  return placement !== undefined && (placement.items.length === 0 || state.placeNodesInFrame(placement.items, placement.frameId));
}

/** Actual Core membership + actual host bindings; labels/paths never identify a member. */
export function collectionProjectedMemberIds(nodes: readonly Node[], bindings: readonly {
  readonly spatialId: string; readonly entityType: string; readonly entityId: string;
}[], members: readonly { readonly memberRef: { readonly type: string; readonly id: string } }[]): string[] {
  const available = new Set(nodes.map(node => node.id));
  return [...new Set(members.flatMap(member => bindings.filter(binding => available.has(binding.spatialId)
    && binding.entityType === member.memberRef.type && binding.entityId === member.memberRef.id).map(binding => binding.spatialId)))];
}
