import { beforeEach, describe, expect, it } from 'vitest';

import { canvasHistoryManager } from '@/store/canvasHistoryManager';
import useCanvasStore from '@/store/canvasStore';
import { haveNodesChangedStructurally } from '@/store/canvasStore/save/structureDirtyDetector';

import { isNodePresentationHidden, isOwnPresentationHidden, restoreNodePresentationPath, setNodePresentationsHidden } from './nodePresentationVisibility';

import type { Node } from '@xyflow/react';

const node = (id: string, parentId?: string): Node => ({ id, type: 'note', position: { x: 0, y: 0 },
  data: { content: `body:${id}` }, ...(parentId ? { parentId } : {}) });
const requireNode = (nodes: readonly Node[], id: string): Node => {
  const value = nodes.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing node ${id}`);
  return value;
};

beforeEach(() => {
  canvasHistoryManager.clear();
  useCanvasStore.setState({ canvasId: undefined, nodes: [{ ...node('group'), type: 'frame' }, node('a', 'group'), node('b', 'group')], edges: [], canUndo: false, canRedo: false });
});
describe('Huabu presentation visibility', () => {
  it('keeps ids, content and children while saving the spatial preference and undoing a batch once', () => {
    const initial = useCanvasStore.getState().nodes;
    expect(setNodePresentationsHidden(useCanvasStore.getState(), ['a', 'b'], true)).toEqual(['a', 'b']);
    const hidden = useCanvasStore.getState().nodes;
    expect(hidden.map((item) => item.id)).toEqual(initial.map((item) => item.id));
    expect(hidden[1]?.data.content).toBe('body:a');
    expect(hidden.filter(isOwnPresentationHidden)).toHaveLength(2);
    expect(haveNodesChangedStructurally(initial, hidden)).toBe(true);
    // Exact shape survives ordinary Huabu structural JSON serialization.
    const reloaded: Node[] = JSON.parse(JSON.stringify(hidden));
    expect(reloaded.filter(isOwnPresentationHidden)).toHaveLength(2);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes.filter(isOwnPresentationHidden)).toHaveLength(0);
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes.filter(isOwnPresentationHidden)).toHaveLength(2);
  });
  it('restores a hidden ancestor when explicit focus targets its child and leaves unrelated hidden peers alone', () => {
    setNodePresentationsHidden(useCanvasStore.getState(), ['group', 'b'], true);
    const nodes = useCanvasStore.getState().nodes;
    const byId = new Map(nodes.map((item) => [item.id, item]));
    expect(isNodePresentationHidden(requireNode(nodes, 'a'), byId)).toBe(true);
    expect(restoreNodePresentationPath(useCanvasStore.getState(), 'a')).toEqual(['group']);
    const restored = useCanvasStore.getState().nodes;
    expect(isNodePresentationHidden(requireNode(restored, 'a'), new Map(restored.map((item) => [item.id, item])))).toBe(false);
    expect(isOwnPresentationHidden(requireNode(restored, 'b'))).toBe(true);
  });
  it('preserves inherited locks and terminates malformed parent cycles', () => {
    const nodes = useCanvasStore.getState().nodes;
    useCanvasStore.setState({ nodes: nodes.map((item) => item.id === 'group' ? { ...item, data: { ...item.data, locked: true } } : item) });
    expect(setNodePresentationsHidden(useCanvasStore.getState(), ['a'], true)).toEqual([]);
    const cycleA = node('cycle-a', 'cycle-b'), cycleB = node('cycle-b', 'cycle-a');
    expect(isNodePresentationHidden(cycleA, new Map([[cycleA.id, cycleA], [cycleB.id, cycleB]]))).toBe(false);
    expect(restoreNodePresentationPath(useCanvasStore.getState(), 'missing')).toEqual([]);
  });
});
