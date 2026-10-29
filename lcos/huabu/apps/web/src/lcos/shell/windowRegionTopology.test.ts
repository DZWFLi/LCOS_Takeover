import { describe, expect, it } from 'vitest';
import { activeWindowIdForRegion, activateRegionWindow, createWindowRegion, mergeRegionGroups, moveRegionWindow, normalizeWindowRegion, removeRegionWindow, reorderRegionWindow, splitRegionGroup, windowIdsForRegion } from './windowRegionTopology';

describe('existing window region group topology', () => {
  const region = () => createWindowRegion('region-a', ['a', 'b', 'c'], 'a');
  it('owns each member once and derives legacy flat selection without storing it', () => {
    const value = region(); expect(windowIdsForRegion(value)).toEqual(['a', 'b', 'c']); expect(activeWindowIdForRegion(value)).toBe('a');
    expect(value).not.toHaveProperty('windowIds'); expect(value).not.toHaveProperty('activeWindowId');
  });
  it.each(['a', 'b', 'c'])('splits %s while retaining all instance identities once', (id) => {
    const before = region(); const split = splitRegionGroup(before, id, 'horizontal');
    expect(split.groups).toHaveLength(2); expect(new Set(split.groups.map(group => group.id)).size).toBe(2);
    expect([...windowIdsForRegion(split)].sort()).toEqual(['a', 'b', 'c']); expect(activeWindowIdForRegion(split)).toBe(id);
    expect(windowIdsForRegion(before)).toEqual(['a', 'b', 'c']);
    expect(split.splitDirection).toBe('horizontal'); expect(split.splitRatio).toBe(0.5);
  });
  it('does not invent a second reader, exceed two groups or split an unknown target', () => {
    const single = createWindowRegion('region-a', ['a'], 'a');
    expect(splitRegionGroup(single, 'a', 'vertical')).toBe(single);
    const before = region(); expect(splitRegionGroup(before, 'unknown', 'horizontal')).toBe(before);
    const split = splitRegionGroup(before, 'c', 'vertical'); expect(splitRegionGroup(split, 'b', 'vertical')).toBe(split);
  });
  it('activates the exact owning group without replacing targets', () => {
    const split = splitRegionGroup(region(), 'c', 'horizontal'); const focused = activateRegionWindow(split, 'b');
    expect(activeWindowIdForRegion(focused)).toBe('b'); expect(focused.activeGroupId).toBe(split.groups[0]?.id);
    expect(windowIdsForRegion(focused)).toEqual(windowIdsForRegion(split)); expect(activateRegionWindow(split, 'missing')).toBe(split);
  });
  it('moves a tab into the other group and removes an empty group rather than duplicating the tab', () => {
    const split = splitRegionGroup(region(), 'c', 'horizontal'); const first = split.groups[0]; if (!first) throw new Error('group missing');
    const moved = moveRegionWindow(split, 'c', first.id);
    expect(moved.groups).toHaveLength(1); expect(windowIdsForRegion(moved)).toEqual(['a', 'b', 'c']); expect(activeWindowIdForRegion(moved)).toBe('c');
    expect(moveRegionWindow(moved, 'c', first.id)).toBe(moved); expect(moveRegionWindow(moved, 'c', 'missing')).toBe(moved);
  });
  it('preserves the other active tab when moving a non-active sibling', () => {
    const split = splitRegionGroup(region(), 'c', 'horizontal'); const second = split.groups[1]; if (!second) throw new Error('group missing');
    const moved = moveRegionWindow(split, 'b', second.id);
    expect(moved.groups[0]?.activeWindowId).toBe('a'); expect(moved.groups[1]?.windowIds).toEqual(['c', 'b']); expect(activeWindowIdForRegion(moved)).toBe('b');
  });
  it('merges content tabs in displayed order with the currently focused target retained', () => {
    const split = splitRegionGroup(region(), 'b', 'horizontal'); const merged = mergeRegionGroups(split);
    expect(merged.groups).toHaveLength(1); expect(windowIdsForRegion(merged)).toEqual(['a', 'c', 'b']); expect(activeWindowIdForRegion(merged)).toBe('b');
    expect(merged).not.toHaveProperty('splitDirection'); expect(merged).not.toHaveProperty('splitRatio');
    expect(mergeRegionGroups(merged)).toBe(merged);
  });
  it('reorders within the original group without switching active target or exceeding its edges', () => {
    const before = region(); const moved = reorderRegionWindow(before, 'b', -1);
    expect(windowIdsForRegion(moved)).toEqual(['b', 'a', 'c']); expect(activeWindowIdForRegion(moved)).toBe('a');
    expect(reorderRegionWindow(moved, 'b', -1)).toBe(moved); expect(reorderRegionWindow(moved, 'c', 1)).toBe(moved);
  });
  it('closes only the specified tab and falls back to the surviving group', () => {
    const split = splitRegionGroup(region(), 'c', 'horizontal'); const remaining = removeRegionWindow(split, 'c');
    expect(remaining?.groups).toHaveLength(1); if (!remaining) throw new Error('remaining missing');
    expect(activeWindowIdForRegion(remaining)).toBe('a'); expect(windowIdsForRegion(remaining)).toEqual(['a', 'b']);
    expect(remaining).not.toHaveProperty('splitDirection'); expect(remaining).not.toHaveProperty('splitRatio');
    expect(removeRegionWindow(createWindowRegion('region-a', ['a'], 'a'), 'a')).toBeUndefined();
    expect(removeRegionWindow(remaining, 'missing')).toBe(remaining);
  });
});

it('migrates an old same-tab region once, retaining its geometry and exact selected target', () => {
  const legacy = { id: 'region-b', layout: 'docked-right' as const, windowIds: ['reader-a', 'reader-b'], activeWindowId: 'reader-a', rect: { x: 10, y: 20, width: 1120, height: 720 }, dockWidth: 1120 };
  const next = normalizeWindowRegion(legacy);
  expect(windowIdsForRegion(next)).toEqual(legacy.windowIds); expect(activeWindowIdForRegion(next)).toBe(legacy.activeWindowId);
  expect(next.rect).toBe(legacy.rect); expect(next.layout).toBe(legacy.layout); expect(next.dockWidth).toBe(legacy.dockWidth);
  expect(next).not.toHaveProperty('windowIds'); expect(next).not.toHaveProperty('activeWindowId'); expect(normalizeWindowRegion(next)).toBe(next);
});
