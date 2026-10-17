import { describe, expect, it } from 'vitest';

import { resolveConnectionViewEdges } from './connectionViewEdges';

const edges: Array<{
  id: string;
  source: string;
  target: string;
  selected?: boolean;
  className?: string;
}> = [
  { id: 'nearby', source: 'selected', target: 'peer' },
  { id: 'idle', source: 'peer', target: 'other' },
  { id: 'picked', source: 'other', target: 'peer', selected: true },
  { id: 'hidden-endpoint', source: 'collapsed-child', target: 'peer' },
];

describe('resolveConnectionViewEdges', () => {
  it('keeps idle links quiet while retaining selected, active, and drawable relationships', () => {
    const visible = resolveConnectionViewEdges(
      edges,
      [
        { id: 'selected', selected: true },
        { id: 'peer' },
        { id: 'other' },
        { id: 'collapsed-child', hidden: true },
      ],
      false,
    );

    expect(visible.map((edge) => edge.id)).toEqual(['nearby', 'picked']);
    expect(visible[0]?.className).toContain('lcos-connection-active');
    expect(visible[1]).toMatchObject({ id: 'picked', selected: true });
  });

  it('keeps a dragged node’s neighboring links visible and returns all links when expanded', () => {
    const duringDrag = resolveConnectionViewEdges(
      edges,
      [
        { id: 'selected' },
        { id: 'peer', dragging: true },
        { id: 'other' },
      ],
      false,
    );
    expect(duringDrag.map((edge) => edge.id)).toEqual(['nearby', 'idle', 'picked']);
    expect(resolveConnectionViewEdges(edges, [], true)).toBe(edges);
  });
});
