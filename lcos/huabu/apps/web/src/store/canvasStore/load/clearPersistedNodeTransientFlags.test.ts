import { expect, it } from 'vitest';

import { clearPersistedNodeTransientFlags } from './clearPersistedNodeTransientFlags';

import type { Node } from '@xyflow/react';

it('removes historical drag/resize flags without changing geometry, parents, content, or locks', () => {
  const historical: Node = { id: 'collection-host', type: 'frame', position: { x: -39.5, y: -117 },
    parentId: 'outer', style: { width: 242, height: 190 }, dragging: true, resizing: true,
    data: { locked: true, lcosCollectionId: 'canonical-collection', content: 'Original text' } };
  const [loaded] = clearPersistedNodeTransientFlags([historical]);
  expect(loaded).not.toHaveProperty('dragging'); expect(loaded).not.toHaveProperty('resizing');
  expect(loaded?.position).toBe(historical.position); expect(loaded?.parentId).toBe('outer');
  expect(loaded?.style).toBe(historical.style); expect(loaded?.data).toBe(historical.data);
  expect(historical.dragging).toBe(true); expect(historical.resizing).toBe(true);
});

it('does not mutate live gesture state when preparing a save and keeps untouched identities stable', () => {
  const live: Node = { id: 'live-drag', position: { x: 70, y: 40 }, data: {}, dragging: true, resizing: false };
  const settled: Node = { id: 'settled', position: { x: 12, y: 15 }, data: { locked: false } };
  const result = clearPersistedNodeTransientFlags([live, settled]);
  expect(result[0]).toEqual({ id: 'live-drag', position: live.position, data: live.data });
  expect(live.dragging).toBe(true); expect(live.resizing).toBe(false);
  expect(result[1]).toBe(settled); expect(clearPersistedNodeTransientFlags(result)[0]).toBe(result[0]);
});
