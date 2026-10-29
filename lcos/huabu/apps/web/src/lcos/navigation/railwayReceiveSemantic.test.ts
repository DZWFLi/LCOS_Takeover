import { expect, it } from 'vitest';

import { railwayReceiveSemantic } from './railwayReceiveSemantic';
import { resolveDropIntent } from '../drop/dropIntentResolver';

import type { RailwayDestinationV1, RailwaySnapshotV1 } from '@local-creative-os/contracts';

const child: RailwayDestinationV1 = { key: 'child', ref: { kind: 'worksite', projectId: 'p', worksiteId: 'child' },
  workspaceId: 'child', canvasId: 'child-canvas', surface: 'context', role: 'worksite', label: 'Child', available: true,
  accepts: ['artifactView', 'note'] };
const input: RailwaySnapshotV1 = { schemaVersion: 1, projectId: 'p', destinations: [], candidates: [child],
  migrationRequired: false, order: { schemaVersion: 1, projectId: 'p', orderedRefs: [], version: 4, updatedAt: 'now' } };

it('drops into an existing unpinned workspace through the real direct workspace batch owner', () => {
  const semantic = railwayReceiveSemantic(child, 'source-canvas', input, true);
  const resolution = resolveDropIntent({ kind: 'object', entityType: 'artifact', entityId: 'artifact', artifactViewId: 'view' },
    { targetId: 'rail:child', enabled: true, semantic });
  expect(resolution).toMatchObject({ status: 'ready', intent: { kind: 'assembly-apply', portalReceive: true,
    targetRef: { kind: 'workspace', id: 'child' }, railwayDestinationRef: child.ref, railwayCanvasId: 'child-canvas',
    sourceRefs: [{ kind: 'artifactView', id: 'view' }] } });
  expect(input.order.orderedRefs).toEqual([]);
});
it('retains order-version checking for an explicitly ordered destination', () => {
  expect(railwayReceiveSemantic(child, 'source-canvas', { ...input, destinations: [child] }, true))
    .toMatchObject({ kind: 'railway-receive', orderVersion: 4, accepts: ['artifactView', 'note'] });
});
it('excludes the current workspace and unresolved cross-project candidates', () => {
  expect(railwayReceiveSemantic(child, 'child-canvas', input, true).kind).toBe('drop-exclusion');
  expect(railwayReceiveSemantic({ ...child, ref: { kind: 'worksite', projectId: 'other', worksiteId: 'child' } },
    'source', input, true).kind).toBe('drop-exclusion');
});
it('keeps collection membership owned by the existing collection receiver', () => {
  expect(railwayReceiveSemantic({ ...child, receiveTarget: { owner: 'collection-membership', collectionId: 'collection' } },
    'source', input, true)).toEqual({ kind: 'collection-membership', collectionId: 'collection' });
});
