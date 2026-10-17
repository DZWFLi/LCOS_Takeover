import { deletableCanvasNodeIds, type CoreNodeBinding } from '@/hooks/shortcuts/deleteSelection';

import { isNodePresentationHidden, setNodePresentationsHidden, type PresentationVisibilityState } from './nodePresentationVisibility';
import { layoutNodeLocked } from '../navigation/selectionLayout';

import type { Node } from '@xyflow/react';

interface RemovalState extends PresentationVisibilityState {
  readonly nodes: readonly Node[];
  deleteNodes(ids: string[]): void;
  disconnectEdges(ids: string[]): void;
}
/** One intention across keyboard, selection toolbar and its context menu.
 * Project objects only lose their presentation; native nodes keep native Undo. */
export function removeCanvasSelection(state: RemovalState, refs: ReadonlyMap<string, CoreNodeBinding>,
  nodeIds: readonly string[], edgeIds: readonly string[] = []): void {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const visible = nodeIds.filter((id) => { const node = byId.get(id); return node && !isNodePresentationHidden(node, byId); });
  const native = deletableCanvasNodeIds(state.nodes, refs, visible);
  const hidden = visible.filter((id) => !native.includes(id) && !layoutNodeLocked(state.nodes, id));
  if (!hidden.length && !native.length && !edgeIds.length) return;
  state.beginNodeDataGesture();
  try {
    setNodePresentationsHidden(state, hidden, true, { gestureOwnedByCaller: true });
    if (native.length) state.deleteNodes(native);
    if (edgeIds.length) state.disconnectEdges([...edgeIds]);
  } finally { state.endNodeDataGesture(); }
}
