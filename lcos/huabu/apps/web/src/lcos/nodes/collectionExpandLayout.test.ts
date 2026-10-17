import { describe, expect, it } from 'vitest';

import { collectionExpansionGeometry, layoutCollectionMembers, type CollectionLayoutRect } from './collectionExpandLayout';

import type { Node } from '@xyflow/react';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture value');
  return value;
}

describe('layoutCollectionMembers', () => {
  it('fans out using real sizes and walks below occupied space', () => {
    const result = layoutCollectionMembers(
      { id: 'collection', x: 100, y: 100, width: 248, height: 244 },
      [
        { id: 'a', x: 0, y: 100, width: 280, height: 180 },
        { id: 'b', x: 0, y: 100, width: 180, height: 100 },
      ],
      [{ id: 'obstacle', x: 390, y: 90, width: 300, height: 220 }],
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ nodeId: 'a', position: { x: 390, y: 328 } });
    expect(result[1]).toMatchObject({ nodeId: 'b', position: { x: 390, y: 532 } });
  });

  it('opens additional columns after the Gen1 height limit', () => {
    const members = Array.from({ length: 5 }, (_, index) => ({
      id: `n${index}`, x: 0, y: 100 + index, width: 240, height: 220,
    }));
    const result = layoutCollectionMembers(
      { id: 'collection', x: 100, y: 100, width: 248, height: 244 }, members, [],
    );
    expect(result.some((item) => item.position?.x === 660)).toBe(true);
    expect(new Set(result.map((item) => item.nodeId)).size).toBe(5);
  });

  it.each([1, 4, 9, 10, 17, 33])('keeps %i different sized members clear of each other and obstacles', (count) => {
    const members = Array.from({ length: count }, (_, index) => ({
      id: `n${index}`, x: 20, y: 20 + index, width: 140 + (index % 3) * 150, height: 100 + (index % 4) * 80,
    }));
    const obstacles = [{ id: 'wall', x: 390, y: -100, width: 500, height: 2200 },
      { id: 'wall-2', x: 900, y: 1400, width: 500, height: 1700 }];
    const result = layoutCollectionMembers({ id: 'owner', x: 100, y: 100, width: 248, height: 244 }, members, obstacles);
    const rectangles = result.map((item) => ({ ...required(members.find((member) => member.id === item.nodeId)), ...item.position }));
    const intersects = (a: CollectionLayoutRect, b: CollectionLayoutRect) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    expect(rectangles).toHaveLength(count);
    for (const [index, rectangle] of rectangles.entries()) {
      expect(obstacles.some((obstacle) => intersects(rectangle, obstacle))).toBe(false);
      expect(rectangles.slice(index + 1).some((other) => intersects(rectangle, other))).toBe(false);
    }
  });

  it('reads measured dimensions and native CSS lengths instead of zero sized unmounted cards', () => {
    const nodes: Node[] = [
      { id: 'owner', position: { x: 100, y: 100 }, data: {}, style: { width: '248px', height: '244px' } },
      { id: 'a', position: { x: 0, y: 100 }, data: {}, measured: { width: 430, height: 300 }, style: { width: 100, height: 80 } },
      { id: 'b', position: { x: 0, y: 120 }, data: {}, style: { width: '210px', height: '150px' } },
      { id: 'c', position: { x: 0, y: 130 }, data: {} },
    ];
    const updates = collectionExpansionGeometry(nodes, 'owner', ['a', 'b', 'c']);
    expect(updates).toHaveLength(3);
    expect(updates[0]?.position).toEqual({ x: 390, y: 100 });
    expect(updates[1]?.position).toEqual({ x: 390, y: 424 });
    expect(updates[2]?.position).toEqual({ x: 390, y: 598 });
  });

  it('avoids existing children using their absolute position without avoiding their invisible host rectangle', () => {
    const nodes: Node[] = [
      { id: 'owner', position: { x: 100, y: 100 }, data: {}, style: { width: 248, height: 244 } },
      { id: 'host', type: 'frame', position: { x: 370, y: 80 }, data: {}, style: { width: 700, height: 900 } },
      { id: 'child', parentId: 'host', position: { x: 20, y: 20 }, data: {}, style: { width: 280, height: 200 } },
      { id: 'addition', position: { x: 0, y: 0 }, data: {}, style: { width: 200, height: 100 } },
    ];
    expect(collectionExpansionGeometry(nodes, 'owner', ['addition'], ['child'])[0]?.position)
      .toEqual({ x: 390, y: 318 });
  });
});
