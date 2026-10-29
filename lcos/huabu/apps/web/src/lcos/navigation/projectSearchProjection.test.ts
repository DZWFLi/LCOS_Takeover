import { expect, it } from 'vitest';

import { navigationGraph } from './navigationFixtures';
import { projectSpatialDestinations } from './projectNavigationIndex';
import { localProjectSearchHits, mergeProjectSearchHits } from './projectSearchProjection';

it('finds existing Scope/Collection/Workspace titles and keeps ready addresses direct', () => {
  const graph = navigationGraph({ scopes: [{ id: 'context', projectId: 'p', kind: 'context', name: '客户需求' }],
    workspaces: [{ id: 'workspace', projectId: 'p', scopeId: 'context', name: '客户会议', canvasId: 'child', preferredSurface: 'context' }] });
  const collections = [{ id: 'collection', projectId: 'p', title: '客户素材', createdAt: '', updatedAt: '' }];
  const index = { graph, collections, destinations: projectSpatialDestinations('p',graph,collections), issues: [] };
  const hits = localProjectSearchHits(index,'p','客户',{ main: 'main' });
  expect(hits.map(hit => hit.entityType).sort()).toEqual(['collection','scope','workspace']);
  expect(hits.find(hit => hit.entityType === 'workspace')?.worksite).toEqual({ surface: 'context', canvasId: 'child', workspaceId: 'workspace' });
  expect(localProjectSearchHits(index,'p','客户 需求',{}).map(hit => hit.title)).toEqual(['客户需求']);
  expect(localProjectSearchHits(index,'other','客户',{})).toEqual([]);
});
it('keeps local results when Core retrieval returns nothing and never merges same-named identities', () => {
  const graph = navigationGraph();
  const collections = [{ id: 'one', projectId: 'p', title: '同名', createdAt: '', updatedAt: '' },{ id: 'two', projectId: 'p', title: '同名', createdAt: '', updatedAt: '' }];
  const local = localProjectSearchHits({ graph, collections, destinations: projectSpatialDestinations('p',graph,collections), issues: [] },'p','同名',{});
  expect(mergeProjectSearchHits(local,[])).toHaveLength(2);
  expect(mergeProjectSearchHits(local,[{ entityType: 'artifact', entityId: 'a', title: '同名', snippet: '', source: 'title', score: 1 }]).map(item => item.entityType))
    .toEqual(['collection','collection','artifact']);
});
