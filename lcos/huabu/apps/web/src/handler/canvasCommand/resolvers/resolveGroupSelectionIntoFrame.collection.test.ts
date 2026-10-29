import { describe, expect, it } from 'vitest';
import resolveGroupSelectionIntoFrame from './resolveGroupSelectionIntoFrame';

describe('collection host grouping', () => {
  it('applies planned member geometry before hosting members and keeps the Collection visible', () => {
    const result = resolveGroupSelectionIntoFrame({
      type: 'GROUP_SELECTION_INTO_FRAME',
      frameLabel: 'Evidence',
      collectionId: 'collection-1',
      collectionNodeId: 'node-collection',
      geometryUpdates: [{ nodeId: 'node-member-1', position: { x: 500, y: 180 } }],
    }, {
      nodes: [
        { id: 'node-collection', type: 'text', position: { x: 100, y: 100 }, width: 248, height: 244, data: {} },
        { id: 'node-member-1', type: 'image', position: { x: 120, y: 120 }, width: 280, height: 180, data: {}, selected: true },
      ],
      edges: [],
    });

    expect(result.commands[0]).toMatchObject({
      type: 'SET_NODE_GEOMETRY', items: [{ nodeId: 'node-member-1', position: { x: 500, y: 180 } }],
    });
    expect(result.commands[1]).toMatchObject({
      type: 'CREATE_NODES', nodes: [{ nodeType: 'frame', data: { lcosCollectionId: 'collection-1', lcosCollectionNodeId: 'node-collection' } }],
    });
    expect(result.commands[2]).toMatchObject({ type: 'SET_NODE_PARENT', nodeIds: ['node-member-1'] });
    expect(result.commands[3]).toMatchObject({ type: 'SET_NODE_SELECTION', nodeIds: ['node-collection'] });
  });
});
