import { applyNodeChanges, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createCollectionDragCompanions, withCollectionGeometryCompanions } from './collectionDragCompanions';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture value');
  return value;
}

const collectionNodes = (): Node[] => [
  { id: 'node-collection', position: { x: 100, y: 100 }, data: {} },
  { id: 'host', type: 'frame', position: { x: 390, y: 100 }, data: { lcosCollectionNodeId: 'node-collection' } },
  { id: 'member', parentId: 'host', position: { x: 20, y: 20 }, data: {} },
];

describe('Collection existing Huabu host movement', () => {
  it('moves the existing host with a folder drag while children keep native relative geometry', () => {
    let nodes = collectionNodes();
    const companions = createCollectionDragCompanions(() => nodes);
    companions.onStart([required(nodes[0])]);
    nodes = applyNodeChanges(companions.filterChanges([
      { type: 'position', id: 'node-collection', position: { x: 170, y: 140 }, dragging: true },
    ]), nodes);
    expect(nodes.find((node) => node.id === 'host')?.position).toEqual({ x: 460, y: 140 });
    nodes = applyNodeChanges(companions.filterChanges([
      { type: 'position', id: 'node-collection', position: { x: 200, y: 190 }, dragging: false },
    ]), nodes);
    expect(nodes.find((node) => node.id === 'host')?.position).toEqual({ x: 490, y: 190 });
    expect(nodes.find((node) => node.id === 'member')?.position).toEqual({ x: 20, y: 20 });
    expect(nodes.find((node) => node.id === 'member')?.parentId).toBe('host');
    expect(companions.externallyChanged()).toEqual([]);
  });

  it('lets an independent host move win over a stale folder drag', () => {
    const nodes = collectionNodes();
    const companions = createCollectionDragCompanions(() => nodes);
    companions.onStart([required(nodes[0])]);
    required(nodes[1]).position = { x: 990, y: 480 };
    expect(companions.filterChanges([{ type: 'position', id: 'node-collection', position: { x: 200, y: 190 }, dragging: true }])).toEqual([]);
    expect(companions.externallyChanged()).toEqual(['host']);
    expect(required(nodes[1]).position).toEqual({ x: 990, y: 480 });
  });

  it('explicit layout carries the same existing host, without emitting child or membership updates', () => {
    const nodes = collectionNodes();
    const result = withCollectionGeometryCompanions(nodes, [{ nodeId: 'node-collection', position: { x: 200, y: 190 } }]);
    expect(result).toEqual([
      { nodeId: 'node-collection', position: { x: 200, y: 190 } },
      { nodeId: 'host', position: { x: 490, y: 190 } },
    ]);
  });
});
