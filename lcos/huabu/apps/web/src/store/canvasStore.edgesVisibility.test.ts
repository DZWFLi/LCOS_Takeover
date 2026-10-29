import { beforeEach, describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';

import useCanvasStore from './canvasStore';

describe('canvas edge visibility preference', () => {
  beforeEach(() => {
    localStorage.removeItem('huabu.edgesVisible');
    useCanvasStore.setState({ edgesVisible: false, edges: [] });
  });

  it('toggles and persists only the canvas presentation preference', () => {
    const relations: Edge[] = [{ id: 'relation-view-only', source: 'a', target: 'b' }];
    useCanvasStore.setState({ edges: relations });

    useCanvasStore.getState().toggleEdges();
    expect(useCanvasStore.getState().edgesVisible).toBe(true);
    expect(localStorage.getItem('huabu.edgesVisible')).toBe('true');
    expect(useCanvasStore.getState().edges).toBe(relations);

    useCanvasStore.getState().toggleEdges();
    expect(useCanvasStore.getState().edgesVisible).toBe(false);
    expect(localStorage.getItem('huabu.edgesVisible')).toBe('false');
    expect(useCanvasStore.getState().edges).toBe(relations);
  });
});
