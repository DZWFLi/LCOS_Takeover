import useCanvasStore from '@/store/canvasStore';

import { createCollectionFoldTransition, useCollectionFoldMotion } from './collectionFoldMotion';
import { admitCollectionHostMembers, toggleCollectionHost } from './collectionHost';

const transition = createCollectionFoldTransition({
  read: () => useCanvasStore.getState(),
  toggleFrameCollapse: id => useCanvasStore.getState().toggleFrameCollapse(id),
  phase: (id, phase) => useCollectionFoldMotion.setState(state => {
    const folds = new Map(state.folds);
    if (phase) folds.set(id, phase); else folds.delete(id);
    return { folds };
  }),
  frame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
  delay: (callback, ms) => setTimeout(callback, ms), cancelDelay: id => clearTimeout(id),
  reducedMotion: () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

export const disposeCollectionFoldMotion = () => transition.dispose();
export function toggleCollectionHostWithMotion(collectionId: string, ownerId: string, title: string, memberIds: readonly string[]): boolean {
  const existing = useCanvasStore.getState().nodes.find(node => node.type === 'frame' && node.data.lcosCollectionId === collectionId);
  if (existing) {
    if (!admitCollectionHostMembers(useCanvasStore.getState(), collectionId, memberIds)) return false;
    transition.toggle(existing.id); return true;
  }
  const opened = toggleCollectionHost(() => useCanvasStore.getState(), collectionId, ownerId, title, memberIds);
  const created = useCanvasStore.getState().nodes.find(node => node.type === 'frame' && node.data.lcosCollectionId === collectionId);
  if (opened && created) transition.reveal(created.id);
  return opened;
}
