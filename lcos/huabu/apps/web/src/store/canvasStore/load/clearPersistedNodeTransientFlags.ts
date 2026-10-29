import type { Node } from '@xyflow/react';

/** Pointer gestures belong to the live client. Historical snapshots cannot
 * restore an active drag/resize; saving a live gesture cannot persist one.
 * Only the snapshot copy changes: live gesture flags and geometry stay intact.
 */
export function clearPersistedNodeTransientFlags(nodes: readonly Node[]): Node[] {
  return nodes.map(node => {
    if (!('dragging' in node) && !('resizing' in node)) return node;
    const { dragging: _dragging, resizing: _resizing, ...persisted } = node;
    return persisted;
  });
}
