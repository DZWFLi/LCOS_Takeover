import { layoutNodeLocked } from '../navigation/selectionLayout';

import type { Node } from '@xyflow/react';

/** Presentation preference lives on the existing Huabu spatial node. No
 * entity deletion, binding deletion or separate persisted exclusion list. */
export const PRESENTATION_HIDDEN_FIELD = 'lcosPresentationHidden';
type PresentationNode = Pick<Node, 'id' | 'parentId' | 'data' | 'hidden'>;
export interface PresentationVisibilityState {
  readonly nodes: readonly Node[];
  beginNodeDataGesture(): void;
  updateNodeData(nodeId: string, patch: Record<string, unknown>): void;
  endNodeDataGesture(): void;
}

export function isOwnPresentationHidden(node: PresentationNode): boolean {
  return node.data?.[PRESENTATION_HIDDEN_FIELD] === true;
}

/** Child display follows its hidden physical parent; child state stays intact. */
export function isNodePresentationHidden(node: PresentationNode, nodesById: ReadonlyMap<string, PresentationNode>): boolean {
  let current: PresentationNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.hidden || isOwnPresentationHidden(current)) return true;
    current = current.parentId ? nodesById.get(current.parentId) : undefined;
  }
  return false;
}

/** A public Huabu data gesture groups all selected presentations into one undo
 * entry and uses the same structural save queue as frame presentation state. */
export function setNodePresentationsHidden(state: PresentationVisibilityState, nodeIds: readonly string[], hidden: boolean,
  options: { readonly gestureOwnedByCaller?: boolean } = {}): readonly string[] {
  const requested = new Set(nodeIds);
  const targets = state.nodes.filter((node) => requested.has(node.id)
    && isOwnPresentationHidden(node) !== hidden
    && (!hidden || !layoutNodeLocked(state.nodes, node.id)));
  if (targets.length === 0) return [];
  if (!options.gestureOwnedByCaller) state.beginNodeDataGesture();
  try {
    for (const node of targets) state.updateNodeData(node.id, { [PRESENTATION_HIDDEN_FIELD]: hidden });
  } finally { if (!options.gestureOwnedByCaller) state.endNodeDataGesture(); }
  return targets.map((node) => node.id);
}

/** Explicit Search/Where/Drop focus restores the requested presentation and
 * its hidden physical ancestors. Other hidden children remain hidden. */
export function restoreNodePresentationPath(state: PresentationVisibilityState, nodeId: string): readonly string[] {
  const byId = new Map(state.nodes.map((node) => [node.id, node]));
  const restore: string[] = [];
  const seen = new Set<string>();
  let node = byId.get(nodeId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    if (isOwnPresentationHidden(node)) restore.push(node.id);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return setNodePresentationsHidden(state, restore, false);
}
