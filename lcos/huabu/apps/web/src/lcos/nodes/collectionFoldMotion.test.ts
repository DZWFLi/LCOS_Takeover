import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectionFoldPresentation, createCollectionFoldTransition } from './collectionFoldMotion';

import type { CollectionFold } from './collectionFoldMotion';
import type { Node } from '@xyflow/react';

afterEach(() => vi.useRealTimers());
function fixture(reduced = false) {
  vi.useFakeTimers();
  const nodes: Node[] = [
    { id: 'owner', position: { x: 100, y: 100 }, width: 248, height: 146, data: {} },
    { id: 'host', type: 'frame', position: { x: 400, y: 100 }, data: { lcosCollectionNodeId: 'owner' } },
    { id: 'a', parentId: 'host', position: { x: 73, y: 57 }, width: 200, height: 150, data: {} },
  ];
  const state = { canvasId: 'canvas-a', nodes, collapsedFrameIds: new Set<string>() };
  const folds = new Map<string, CollectionFold>();
  const raf = new Map<number, () => void>(); let next = 0;
  const toggle = vi.fn((id: string) => { if (state.collapsedFrameIds.has(id)) state.collapsedFrameIds.delete(id); else state.collapsedFrameIds.add(id); });
  const motion = createCollectionFoldTransition({ read: () => state, toggleFrameCollapse: toggle,
    phase: (id, value) => { if (value) folds.set(id, value); else folds.delete(id); },
    frame: callback => { raf.set(++next, callback); return next; }, cancelFrame: id => { raf.delete(id); },
    delay: (callback, ms) => setTimeout(callback, ms), cancelDelay: id => clearTimeout(id), reducedMotion: () => reduced,
  });
  const frame = () => { const current = [...raf.values()]; raf.clear(); current.forEach(callback => callback()); };
  return { state, folds, toggle, motion, frame };
}
describe('mounted collection fold lifecycle', () => {
  it('keeps members mounted for 240ms, then uses only the existing collapse preference', () => {
    const { state, folds, motion, toggle } = fixture(); const before = JSON.stringify(state.nodes);
    motion.toggle('host');
    expect(state.collapsedFrameIds.has('host')).toBe(false);
    expect(folds.get('host')?.phase).toBe('closing');
    const member = state.nodes[2];
    expect(collectionFoldPresentation(member, state.nodes, folds, state.canvasId)?.style).toMatchObject({ '--lcos-fold-scale': .12, '--lcos-fold-opacity': 0 });
    vi.advanceTimersByTime(239); expect(toggle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(state.collapsedFrameIds.has('host')).toBe(true); expect(folds.size).toBe(0);
    expect(JSON.stringify(state.nodes)).toBe(before);
  });
  it('reopens at the committed manual position and starts animation after two frames', () => {
    const { state, folds, motion, frame } = fixture(); const before = JSON.stringify(state.nodes);
    state.collapsedFrameIds.add('host'); motion.toggle('host');
    expect(state.collapsedFrameIds.has('host')).toBe(false); expect(folds.get('host')?.phase).toBe('enter');
    frame(); expect(folds.get('host')?.phase).toBe('enter'); frame(); expect(folds.get('host')?.phase).toBe('opening');
    vi.advanceTimersByTime(240); expect(folds.size).toBe(0); expect(JSON.stringify(state.nodes)).toBe(before);
  });
  it('reverses a rapid close and never applies a stale timer to a different canvas', () => {
    const { state, folds, motion, frame, toggle } = fixture();
    motion.toggle('host'); motion.toggle('host'); frame(); frame(); vi.advanceTimersByTime(240);
    expect(toggle).not.toHaveBeenCalled(); expect(folds.size).toBe(0);
    motion.toggle('host'); state.canvasId = 'canvas-b'; vi.advanceTimersByTime(240); expect(toggle).not.toHaveBeenCalled();
  });
  it('honors reduced motion and disposes pending timers without committing collapse', () => {
    const reduced = fixture(true); reduced.motion.toggle('host'); expect(reduced.toggle).toHaveBeenCalledOnce(); expect(reduced.folds.size).toBe(0);
    const normal = fixture(); normal.motion.toggle('host'); normal.motion.dispose(); vi.advanceTimersByTime(240);
    expect(normal.toggle).not.toHaveBeenCalled(); expect(normal.folds.size).toBe(0);
  });
});
