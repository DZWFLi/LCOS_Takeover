import { describe, expect, it } from 'vitest';

import { selectTemporalPreviewNodes } from './TemporalPreviewOutlines';

import type { CanvasNode } from '@/components/Nodes/types';

describe('Temporal preview node projection', () => {
  it('returns every existing target in canvas order without mutating selection', () => {
    const nodes = [
      { id: 'node-a', position: { x: 0, y: 0 }, data: {}, selected: false },
      { id: 'node-b', position: { x: 10, y: 10 }, data: {}, selected: true },
      { id: 'node-c', position: { x: 20, y: 20 }, data: {}, selected: false },
    ] as unknown as readonly CanvasNode[];

    const result = selectTemporalPreviewNodes(nodes, ['node-c', 'missing', 'node-a']);

    expect(result.map((node) => node.id)).toEqual(['node-a', 'node-c']);
    expect(nodes.map((node) => node.selected)).toEqual([false, true, false]);
  });

  it('returns no nodes for an empty preview', () => {
    expect(selectTemporalPreviewNodes([], [])).toEqual([]);
  });
});
