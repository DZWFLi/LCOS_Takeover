// Gen1@3e99769 fold lifecycle: mounted for 240ms, transient transforms only.
import { create } from 'zustand';

import { getAbsolutePosition, getNodeSize } from '@huabu/shared/canvas-engine';

import type { Node } from '@xyflow/react';
import type { CSSProperties } from 'react';

export const COLLECTION_FOLD_MS = 240;
export type CollectionFoldPhase = 'enter' | 'opening' | 'closing';
export interface CollectionFold { readonly canvasId: string; readonly phase: CollectionFoldPhase }
export const useCollectionFoldMotion = create<{ folds: ReadonlyMap<string, CollectionFold> }>(() => ({ folds: new Map() }));
export interface CollectionFoldPort {
  read(): { readonly canvasId: string | null; readonly nodes: readonly Node[]; readonly collapsedFrameIds: ReadonlySet<string> };
  toggleFrameCollapse(id: string): void;
  phase(id: string, phase?: CollectionFold): void;
  frame(callback: () => void): number;
  cancelFrame(id: number): void;
  delay(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  cancelDelay(id: ReturnType<typeof setTimeout>): void;
  reducedMotion(): boolean;
}

/** No geometry or membership writes. Cancelled/obsolete transitions never close a new canvas. */
export function createCollectionFoldTransition(port: CollectionFoldPort) {
  const pending = new Map<string, () => void>();
  const cancel = (id: string) => { pending.get(id)?.(); pending.delete(id); port.phase(id); };
  const begin = (id: string, opening: boolean) => {
    cancel(id);
    const initial = port.read();
    const canvasId = initial.canvasId;
    if (!canvasId || !initial.nodes.some(node => node.id === id)) return;
    let second: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const frames: number[] = [];
    pending.set(id, () => {
      frames.forEach(id => port.cancelFrame(id));
      if (second !== undefined) port.cancelFrame(second);
      if (timer !== undefined) port.cancelDelay(timer);
    });
    const current = () => port.read().canvasId === canvasId && port.read().nodes.some(node => node.id === id);
    const finish = () => {
      if (current() && !opening && !port.read().collapsedFrameIds.has(id)
        && !port.read().nodes.some(node => node.parentId === id && node.dragging)) port.toggleFrameCollapse(id);
      cancel(id);
    };
    if (port.reducedMotion()) { finish(); return; }
    port.phase(id, { canvasId, phase: opening ? 'enter' : 'closing' });
    if (!opening) { timer = port.delay(finish, COLLECTION_FOLD_MS); return; }
    frames.push(port.frame(() => { second = port.frame(() => {
      if (!current()) { cancel(id); return; }
      port.phase(id, { canvasId, phase: 'opening' });
      timer = port.delay(finish, COLLECTION_FOLD_MS);
    }); }));
  };
  return {
    reveal: (id: string) => begin(id, true),
    toggle(id: string) {
      // Clicking again while folding reverses it; committed layout stays intact.
      if (pending.has(id) && !port.read().collapsedFrameIds.has(id)) { begin(id, true); return; }
      const opening = port.read().collapsedFrameIds.has(id);
      if (opening) port.toggleFrameCollapse(id);
      begin(id, opening);
    },
    dispose() { for (const id of [...pending.keys()]) cancel(id); },
  };
}

/** Motion is carried on the inner native body, leaving React Flow's position transform intact. */
export function collectionFoldPresentation(node: Node, nodes: readonly Node[],
  folds: ReadonlyMap<string, CollectionFold>, canvasId: string | null,
  index?: ReadonlyMap<string, Node>): { className: string; style: CSSProperties } | undefined {
  if (node.type === 'frame' || folds.size === 0) return;
  const byId = index ?? new Map(nodes.map(item => [item.id, item]));
  const visited = new Set<string>();
  let parentId = node.parentId;
  let match: { frame: Node; fold: CollectionFold } | undefined;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const frame = byId.get(parentId), fold = folds.get(parentId);
    if (!frame) break;
    if (fold?.canvasId === canvasId) match = { frame, fold };
    parentId = frame.parentId;
  }
  if (!match || node.id === match.frame.data.lcosCollectionNodeId) return;
  const owner = byId.get(String(match.frame.data.lcosCollectionNodeId));
  if (!owner) return;
  const position = getAbsolutePosition(nodes as Node[], node.id) ?? node.position;
  const origin = getAbsolutePosition(nodes as Node[], owner.id) ?? owner.position;
  const size = getNodeSize(node), ownerSize = getNodeSize(owner);
  const folded = match.fold.phase !== 'opening';
  return { className: 'lcos-collection-fold-part', style: {
    '--lcos-fold-x': `${folded ? origin.x + ownerSize.width / 2 - position.x - size.width / 2 : 0}px`,
    '--lcos-fold-y': `${folded ? origin.y + ownerSize.height / 2 - position.y - size.height / 2 : 0}px`,
    '--lcos-fold-scale': folded ? .12 : 1,
    '--lcos-fold-opacity': folded ? 0 : 1,
    '--lcos-fold-duration': match.fold.phase === 'enter' ? '0ms' : `${COLLECTION_FOLD_MS}ms`,
    pointerEvents: 'none',
  } as CSSProperties };
}
