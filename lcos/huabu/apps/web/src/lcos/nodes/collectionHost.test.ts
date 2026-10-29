import { describe, expect, it } from 'vitest';

import { executeCanvasCommands, getAbsolutePosition, planNodeFramePlacement } from '@huabu/shared/canvas-engine';

import resolveGroupSelectionIntoFrame from '@/handler/canvasCommand/resolvers/resolveGroupSelectionIntoFrame';

import { admitCollectionHostMembers, arrangeCollectionHost, collectionHostArrangementGeometry, collectionHostMemberIds, collectionProjectedMemberIds, toggleCollectionHost, type CollectionHostState } from './collectionHost';

import type { NodeFramePlacement } from '@huabu/shared/canvas-engine';
import type { Node } from '@xyflow/react';

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Missing fixture value');
  return value;
}

const node = (id: string, x = 0, y = 0, width = 200, height = 150): Node =>
  ({ id, type: 'image', position: { x, y }, style: { width, height }, data: {} });

function hostState(initial: Node[]) {
  let groups = 0;
  const state: CollectionHostState = {
    nodes: initial,
    collapsedFrameIds: new Set(),
    frameSelectedNodes(options) {
      groups += 1;
      const result = resolveGroupSelectionIntoFrame({ type: 'GROUP_SELECTION_INTO_FRAME',
        ...options, frameLabel: options.label }, { nodes: [...state.nodes], edges: [] });
      const committed = executeCanvasCommands({ commands: result.commands, source: 'ui' },
        { nodes: [...state.nodes], edges: [], canvasId: 'canvas-test' });
      Object.assign(state, { nodes: committed.writeResult.nodes });
    },
    toggleFrameCollapse(id) {
      const next = new Set(state.collapsedFrameIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      Object.assign(state, { collapsedFrameIds: next });
    },
  };
  return { state, groupCount: () => groups };
}

describe('Collection first-open production geometry', () => {
  it('still rejects an actually dragging live host without changing members or opening history', () => {
    const live = [node('owner'), { ...node('host', 100, 100), type: 'frame', dragging: true,
      data: { lcosCollectionId: 'c', lcosCollectionNodeId: 'owner' } }, node('a', -300, 20)];
    const unexpected = () => { throw new Error('Live drag must retain ownership'); };
    expect(arrangeCollectionHost({ nodes: live, beginGesture: unexpected, setNodeGeometry: unexpected,
      placeNodesInFrame: unexpected }, 'c', ['a'])).toBe(false);
    expect(live.find(item => item.id === 'host')?.dragging).toBe(true);
    expect(live.find(item => item.id === 'a')?.parentId).toBeUndefined();
  });
  it('repairs an existing empty host from actual member bindings in one native batch, and undo restores original parents/world positions', () => {
    const before = [node('owner', 100, 100), { ...node('host', 900, 600), type: 'frame', data: { lcosCollectionId: 'c', lcosCollectionNodeId: 'owner' } },
      node('a', -900, -300), node('b', -500, 250)];
    let current = before, snapshots = 0;
    const state = { get nodes() { return current; }, beginGesture: () => { throw new Error('Native port owns snapshot'); },
      setNodeGeometry: () => { throw new Error('Do not split parent/geometry'); },
      placeNodesInFrame(items: readonly NodeFramePlacement[], frameId: string) {
        const commands = planNodeFramePlacement({ nodes: current, edges: [], canvasId: 'canvas', source: 'ui' }, items, frameId);
        if (!commands) return false;
        snapshots += 1;
        current = executeCanvasCommands({ commands, source: 'ui' }, { nodes: current, edges: [], canvasId: 'canvas' }).writeResult.nodes;
        return true;
      } };
    const memberIds = collectionProjectedMemberIds(current, [{ spatialId: 'a', entityType: 'artifact', entityId: 'material-a' },
      { spatialId: 'b', entityType: 'artifact', entityId: 'material-b' }], [{ memberRef: { type: 'artifact', id: 'material-a' } }, { memberRef: { type: 'artifact', id: 'material-b' } }]);
    expect(arrangeCollectionHost(state, 'c', memberIds)).toBe(true); expect(snapshots).toBe(1);
    expect(current.filter(item => item.parentId === 'host').map(item => item.id)).toEqual(['a', 'b']);
    const a = required(getAbsolutePosition(current, 'a')), b = required(getAbsolutePosition(current, 'b'));
    expect(Math.abs(a.y - b.y) >= 150 || Math.abs(a.x - b.x) >= 200).toBe(true);
    expect(current.map(item => item.id)).toEqual(before.map(item => item.id));
    // Native Undo's single pre-batch snapshot includes original parents and coordinates.
    current = before;
    expect(getAbsolutePosition(current, 'a')).toEqual({ x: -900, y: -300 }); expect(current.find(item => item.id === 'a')?.parentId).toBeUndefined();
  });
  it('adopts only free canonical members at unchanged world positions and does not steal shared/locked parents', () => {
    const before = [node('owner', 100, 100), { ...node('host', 500, 500), type: 'frame', data: { lcosCollectionId: 'c', lcosCollectionNodeId: 'owner' } },
      { ...node('manual', 20, 45), parentId: 'host' }, node('a', -400, 270),
      { ...node('shared', 12, 20), parentId: 'other' }, { ...node('other', 900, 0), type: 'frame' }, { ...node('locked', 25, 75), data: { locked: true } }];
    let current = before;
    const absolute = new Map(before.map(item => [item.id, getAbsolutePosition(before, item.id)]));
    const state = { get nodes() { return current; }, placeNodesInFrame(items: readonly NodeFramePlacement[], frameId: string) {
      const commands = planNodeFramePlacement({ nodes: current, edges: [], canvasId: 'canvas', source: 'ui' }, items, frameId);
      if (!commands) return false;
      current = executeCanvasCommands({ source: 'ui', commands }, { nodes: current, edges: [], canvasId: 'canvas' }).writeResult.nodes; return true;
    } };
    expect(admitCollectionHostMembers(state, 'c', ['a', 'shared', 'locked'])).toBe(true);
    expect(current.find(item => item.id === 'a')?.parentId).toBe('host');
    expect(current.find(item => item.id === 'shared')?.parentId).toBe('other');
    // Native frame admission hugs its contents; source nodes keep their world
    // anchors even when the container itself changes its bounding rectangle.
    for (const item of current.filter(item => item.id !== 'host')) expect(getAbsolutePosition(current, item.id)).toEqual(absolute.get(item.id));
  });
  it('explicitly arranges a persisted overlapping host through a single undoable native geometry batch', () => {
    const original = [node('owner', 100, 100, 248, 244),
      { ...node('host', 350, 100, 800, 450), type: 'frame', data: { lcosCollectionId: 'collection-a', lcosCollectionNodeId: 'owner' } },
      { ...node('a', 20, 20, 300, 200), parentId: 'host' },
      { ...node('b', 20, 20, 200, 150), parentId: 'host' }];
    const initialPositions = original.map((item) => ({ ...item.position }));
    const geometry = collectionHostArrangementGeometry(original, 'collection-a');
    const committed = executeCanvasCommands({ source: 'ui', commands: [{ type: 'SET_NODE_GEOMETRY', items: geometry }] },
      { canvasId: 'canvas-test', nodes: original, edges: [] });
    // Native SET_NODE_GEOMETRY is caller-snapshotted; the production helper
    // must open exactly one gesture before dispatching the geometry command.
    const actions: string[] = [];
    expect(arrangeCollectionHost({ nodes: original, beginGesture: () => { actions.push('snapshot'); },
      setNodeGeometry: (items) => { expect(items).toEqual(geometry); actions.push('geometry'); } }, 'collection-a')).toBe(true);
    expect(actions).toEqual(['snapshot', 'geometry']);
    expect(original.map((item) => item.position)).toEqual(initialPositions);
    const a = required(getAbsolutePosition(committed.writeResult.nodes, 'a'));
    const b = required(getAbsolutePosition(committed.writeResult.nodes, 'b'));
    expect(b.y >= a.y + 200 || a.y >= b.y + 150 || b.x >= a.x + 300 || a.x >= b.x + 200).toBe(true);
    expect(committed.writeResult.nodes.find((item) => item.id === 'a')?.parentId).toBe('host');
    expect(committed.writeResult.nodes.find((item) => item.id === 'b')?.parentId).toBe('host');
    expect(committed.writeResult.nodes.map((item) => item.id)).toEqual(original.map((item) => item.id));
  });

  it('packs actual members through Huabu commands while preserving projection ids and later manual placement', () => {
    const initial = [node('owner', 100, 100, 248, 244), node('a', 0, 100, 280, 180), node('b', 0, 100, 180, 100)];
    const { state, groupCount } = hostState(initial);
    expect(toggleCollectionHost(() => state, 'collection-a', 'owner', 'References', ['a', 'b'])).toBe(true);
    const host = required(state.nodes.find((item) => item.type === 'frame'));
    expect(state.nodes.map((item) => item.id)).toEqual(expect.arrayContaining(['owner', 'a', 'b']));
    expect(state.nodes.find((item) => item.id === 'owner')?.parentId).toBeUndefined();
    expect(getAbsolutePosition([...state.nodes], 'a')).toEqual({ x: 390, y: 100 });
    expect(getAbsolutePosition([...state.nodes], 'b')).toEqual({ x: 390, y: 304 });
    expect(state.nodes.find((item) => item.id === 'a')?.parentId).toBe(host.id);
    const member = required(state.nodes.find((item) => item.id === 'a'));
    member.position = { x: member.position.x + 77, y: member.position.y + 51 };
    const manual = getAbsolutePosition([...state.nodes], 'a');
    expect(toggleCollectionHost(() => state, 'collection-a', 'owner', 'References', ['a', 'b'])).toBe(true);
    expect(state.collapsedFrameIds.has(host.id)).toBe(true);
    // Simulate persisted Huabu node reload: ordinary reopen is only a UI toggle.
    Object.assign(state, { nodes: JSON.parse(JSON.stringify(state.nodes)) });
    expect(toggleCollectionHost(() => state, 'collection-a', 'owner', 'References', ['a', 'b'])).toBe(true);
    expect(state.collapsedFrameIds.has(host.id)).toBe(false);
    expect(getAbsolutePosition([...state.nodes], 'a')).toEqual(manual);
    expect(groupCount()).toBe(1);
  });

  it('never steals an existing physical member when another canonical collection references it', () => {
    const { state } = hostState([node('owner-a', 100, 100, 248, 244), node('owner-b', 1200, 100, 248, 244), node('shared')]);
    toggleCollectionHost(() => state, 'collection-a', 'owner-a', 'A', ['shared']);
    const shared = required(state.nodes.find((item) => item.id === 'shared'));
    const firstHost = shared.parentId;
    const before = getAbsolutePosition([...state.nodes], 'shared');
    toggleCollectionHost(() => state, 'collection-b', 'owner-b', 'B', ['shared']);
    expect(state.nodes.find((item) => item.id === 'shared')?.parentId).toBe(firstHost);
    expect(getAbsolutePosition([...state.nodes], 'shared')).toEqual(before);
    expect(state.nodes.filter((item) => item.id === 'shared')).toHaveLength(1);
    expect(state.nodes.filter((item) => item.type === 'frame')).toHaveLength(2);
  });

  it('packs a nested collection as its whole existing host footprint and carries its children unchanged', () => {
    const body = node('nested', 50, 20, 248, 244);
    const nestedHost = { ...node('nested-host', 330, 20, 650, 430), type: 'frame', data: { lcosCollectionNodeId: 'nested', lcosCollectionId: 'nested-collection' } };
    const child = { ...node('child', 20, 20), parentId: 'nested-host' };
    const { state } = hostState([node('owner', 100, 100, 248, 244), body, nestedHost, child, node('other', 40, 60)]);
    const offset = { x: nestedHost.position.x - body.position.x, y: nestedHost.position.y - body.position.y };
    toggleCollectionHost(() => state, 'collection-a', 'owner', 'A', ['nested', 'other']);
    const bodyAfter = required(getAbsolutePosition([...state.nodes], 'nested'));
    const hostAfter = required(getAbsolutePosition([...state.nodes], 'nested-host'));
    expect({ x: hostAfter.x - bodyAfter.x, y: hostAfter.y - bodyAfter.y }).toEqual(offset);
    expect(state.nodes.find((item) => item.id === 'child')?.position).toEqual({ x: 20, y: 20 });
    const otherAfter = required(getAbsolutePosition([...state.nodes], 'other'));
    expect(otherAfter.y >= hostAfter.y + 430 || otherAfter.y + 150 <= hostAfter.y
      || otherAfter.x >= hostAfter.x + 650 || otherAfter.x + 200 <= hostAfter.x).toBe(true);
  });

  it('keeps locked and dragging host companions in their original presentation', () => {
    const body = node('nested');
    const frame = { ...node('host'), type: 'frame', data: { lcosCollectionNodeId: 'nested', locked: true } };
    expect(collectionHostMemberIds([body, frame], ['nested'], 'owner')).toEqual([]);
    expect(collectionHostMemberIds([body, { ...frame, data: { lcosCollectionNodeId: 'nested' }, dragging: true }], ['nested'], 'owner')).toEqual([]);
  });
});
