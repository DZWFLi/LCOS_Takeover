import { expect, it } from 'vitest';

import { navigationGraph } from './navigationFixtures';
import { projectSpatialDestinations, withProjectSpatialCandidates } from './projectNavigationIndex';
import { railwayReceiveSemantic } from './railwayReceiveSemantic';
import { railwaySpatialProjection } from './railwaySpatialProjection';

import type { RailwaySnapshotV1 } from '@local-creative-os/contracts';

const collections = [{ id: 'collection', projectId: 'p', title: '客户素材', createdAt: '', updatedAt: '' }];
const graph = () => navigationGraph({ scopes: [
  { id: 'root', projectId: 'p', kind: 'root', name: 'Main' },
  { id: 'context', projectId: 'p', kind: 'context', name: '需求上下文' },
  { id: 'workflow', projectId: 'p', kind: 'workflow', name: '交付步骤' },
  { id: 'old-collection', projectId: 'p', kind: 'collection', name: '旧范围' },
  { id: 'foreign', projectId: 'other', kind: 'context', name: '别的项目' },
] });
function snapshot(): RailwaySnapshotV1 { return { schemaVersion: 1, projectId: 'p', migrationRequired: false,
  order: { schemaVersion: 1, projectId: 'p', version: 7, updatedAt: '', orderedRefs: [] }, destinations: [], candidates: [] }; }

it('indexes canonical scopes and collections without promoting legacy scopes or manufacturing a canvas/workspace', () => {
  const destinations = projectSpatialDestinations('p',graph(),collections);
  expect(destinations.map(item => item.label).sort()).toEqual(['交付步骤','客户素材','需求上下文']);
  expect(destinations.every(item => item.ref.kind === 'spatial' && item.canvasId === undefined && item.workspaceId === undefined)).toBe(true);
  expect(destinations.find(item => item.label === '客户素材')?.receiveTarget).toEqual({ owner: 'collection-membership', collectionId: 'collection' });
  expect(destinations.find(item => item.label === '需求上下文')?.receiveTarget).toEqual({ owner: 'assembly', targetRef: { kind: 'context', id: 'context' } });
});
it('keeps unpinned spatial objects as explicit-pin candidates without changing canonical CAS order', () => {
  const source = snapshot(); const destinations = projectSpatialDestinations('p',graph(),collections);
  const completed = withProjectSpatialCandidates(source,destinations);
  expect(railwaySpatialProjection(completed,'p')).toEqual([]);
  expect(completed.candidates).toEqual(destinations);
  const pinned={...completed,destinations,order:{...completed.order,orderedRefs:destinations.map(item=>item.ref)}};
  expect(railwaySpatialProjection(pinned,'p')).toEqual(destinations);
  expect(completed.order).toBe(source.order); expect(completed.order.orderedRefs).toEqual([]);
  expect(destinations.map(destination => railwayReceiveSemantic(destination,'main-canvas',completed,true).kind).sort())
    .toEqual(['collection-membership','spatial-membership','spatial-membership']);
});
it('retains registered identity/order and rejects foreign and duplicate canonical identities', () => {
  const items = projectSpatialDestinations('p',graph(),collections);
  const fixed = { ...items[0], label: 'Core现有标题' };
  const source = { ...snapshot(), destinations: [fixed], order: { ...snapshot().order, orderedRefs: [fixed.ref] } };
  expect(withProjectSpatialCandidates(source,items).candidates.some(item => item.key === fixed.key)).toBe(false);
  expect(withProjectSpatialCandidates(source,items).destinations[0]).toBe(fixed);
  expect(projectSpatialDestinations('p',navigationGraph({ project: { id: 'other' }, scopes: graph().scopes }),[])).toEqual([]);
  const duplicate = projectSpatialDestinations('p',undefined,[...collections,...collections]);
  expect(duplicate).toHaveLength(1); expect(duplicate[0].available).toBe(false);
  expect(railwayReceiveSemantic(duplicate[0],'main',snapshot(),true).kind).toBe('drop-exclusion');
});
