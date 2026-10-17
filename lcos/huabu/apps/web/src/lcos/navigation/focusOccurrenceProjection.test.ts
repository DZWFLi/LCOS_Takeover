import { expect, it } from 'vitest';

import { projectFocusOccurrences } from './focusOccurrenceProjection';
import { navigationGraph, navigationPresentation } from './navigationFixtures';
import { semanticNavigationLocations } from './semanticNavigationLocations';

import type { FocusBinding } from './focusOccurrenceProjection';

const binding = (canvasId: string, entityId: string, spatialId = entityId): FocusBinding =>
  ({ projectId: 'p', canvasId, spatialKind: 'node', spatialId, entityType: 'artifact', entityId });
const selected = [{ entityType: 'artifact', entityId: 'a' },{ entityType: 'artifact', entityId: 'b' }];
const input = { projectId: 'p', selected, activeSurface: 'main' as const, currentCanvasId: 'main',
  currentNodeIds: new Set(['a','b']), selectedNodeIds: new Set(['a','b']), roots: { main: 'main' },
  workspaces: [{ id: 'both', canvasId: 'both-canvas', preferredSurface: 'context', name: '完整现场' },
    { id: 'partial', canvasId: 'partial-canvas', preferredSurface: 'workflow', name: '部分现场' }] };

it('uses the entire selection and fits all exact nodes on a matching canvas', () => {
  const rows = projectFocusOccurrences({ ...input, bindings: [binding('partial-canvas','a','partial-a'),
    binding('both-canvas','a','exact-a'),binding('both-canvas','b','exact-b')] });
  expect(rows.map(row => [row.label,row.matchCount,row.totalCount])).toEqual([['完整现场',2,2],['部分现场',1,2]]);
  expect(rows[0].nodes.map(node => node.nodeId)).toEqual(['exact-a','exact-b']);
  expect(rows[0].destination?.workspaceId).toBe('both');
});
it('keeps single-object occurrences exact rather than collapsing duplicate projections on one canvas', () => {
  const rows = projectFocusOccurrences({ ...input, selected: selected.slice(0,1), bindings: [binding('both-canvas','a','first'),binding('both-canvas','a','second')] });
  expect(rows.map(row => row.nodeId)).toEqual(['first','second']);
});
it('finds canonical Presentation/Collection membership outside an artifact views physical Scope', () => {
  const graph = navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '需求空间' }],
    artifactViews: [{ id: 'va', artifactId: 'a', scopeId: 'unrelated' },{ id: 'vb', artifactId: 'b', scopeId: 'another' }],
    collections: [{ id: 'collection', projectId: 'p', title: '客户材料' }] });
  const locations = semanticNavigationLocations('p',graph,[navigationPresentation('context',['va','vb'])],
    [{ collectionId: 'collection', relationId: 'relation', addedAt: '', memberRef: { type: 'artifact', id: 'a' } }]);
  const rows = projectFocusOccurrences({ ...input, bindings: [], semanticLocations: locations });
  expect(rows.map(row => [row.label,row.matchCount,row.totalCount])).toEqual([['需求空间',2,2],['客户材料',1,2]]);
  expect(rows[0].anchor).toEqual({ entityType: 'scope', entityId: 'context' });
  expect(rows[0].canvasId).toBe('main'); expect(rows[0].nodes).toEqual([]);
});
it('does not turn a member into a recursive aggregate membership or infer from legacy positions', () => {
  const graph = navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '上下文' }],
    artifactViews: [{ id: 'va', artifactId: 'a', scopeId: 'context', position: { x: 12, y: 30 } }],
    collections: [{ id: 'outer', projectId: 'p', title: '外层' },{ id: 'inner', projectId: 'p', title: '内层' }] });
  const locations = semanticNavigationLocations('p',graph,[navigationPresentation('context',[])],[
    { collectionId: 'outer', relationId: 'r1', addedAt: '', memberRef: { type: 'collection', id: 'inner' } },
    { collectionId: 'inner', relationId: 'r2', addedAt: '', memberRef: { type: 'artifact', id: 'a' } },
  ]);
  const rows = projectFocusOccurrences({ ...input, selected: selected.slice(0,1), bindings: [], semanticLocations: locations });
  expect(rows.map(row => row.label)).toEqual(['内层']);
});

it('keeps a selected group of duplicate legacy projections as a group rather than dropping back to first-node Where', () => {
  const rows = projectFocusOccurrences({ ...input, selected: [selected[0],selected[0]],
    bindings: [binding('main','a','first'),binding('main','a','second')] });
  expect(rows).toHaveLength(1); expect(rows[0].totalCount).toBe(2);
  expect(rows[0].nodes.map(node => node.nodeId)).toEqual(['first','second']);
});
it('matches exact view references in semantic membership while retaining distinct views of the same Artifact', () => {
  const graph = navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '需求空间' }],
    artifactViews: [{ id: 'va', artifactId: 'a', scopeId: 'root' },{ id: 'vb', artifactId: 'a', scopeId: 'root' }] });
  const members = semanticNavigationLocations('p',graph,[navigationPresentation('context',['va','vb'])],[]);
  expect(members[0].members.map(member => member.artifactViewId)).toEqual(['va','vb']);
  const rows = projectFocusOccurrences({ ...input, selected: [{ entityType: 'view', entityId: 'va' },{ entityType: 'view', entityId: 'vb' }],
    bindings: [], semanticLocations: members });
  expect(rows[0].matchCount).toBe(2); expect(rows[0].totalCount).toBe(2);
});
it('reports unresolved saved view references rather than turning missing metadata into an empty Scope', () => {
  const graph = navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '需求空间' }] });
  const locations = semanticNavigationLocations('p',graph,[navigationPresentation('context',['missing-view'])],[]);
  expect(locations[0].members).toEqual([]); expect(locations[0].unresolvedViewIds).toEqual(['missing-view']);
});
