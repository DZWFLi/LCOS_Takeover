import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  colorPinMembershipsByDefinition,
  colorPinMembershipsForTarget,
  colorPinTargetFromEntityRef,
  usedColorPinDefinitions,
} from '../src/presentation/colorPinPresentation.js';

import type { ColorPinSnapshotV0 } from '@local-creative-os/contracts';

const at = '2026-09-20T00:00:00.000Z';
const snapshot: ColorPinSnapshotV0 = {
  definitions: [
    { id: 'orphan', projectId: 'p', color: '#111111', createdAt: at, updatedAt: at },
    { id: 'blue', projectId: 'p', color: '#3366FF', createdAt: at, updatedAt: at },
    { id: 'red', projectId: 'p', color: '#FF3355', createdAt: at, updatedAt: at },
  ],
  memberships: [
    { id: 'm-blue-a', projectId: 'p', colorPinId: 'blue', targetRef: { projectId: 'p', kind: 'entity', id: 'artifact-a' }, createdAt: at, updatedAt: at },
    { id: 'm-red-a', projectId: 'p', colorPinId: 'red', targetRef: { projectId: 'p', kind: 'entity', id: 'artifact-a' }, createdAt: at, updatedAt: at },
    { id: 'm-blue-view', projectId: 'p', colorPinId: 'blue', targetRef: { projectId: 'p', kind: 'view', id: 'view-stale' }, createdAt: at, updatedAt: at },
  ],
};

test('active colors hide orphan definitions and preserve many-to-many memberships', () => {
  assert.deepEqual(usedColorPinDefinitions(snapshot).map((definition) => definition.id), ['blue', 'red']);
  assert.deepEqual(
    colorPinMembershipsByDefinition(snapshot).get('blue')?.map((membership) => membership.id),
    ['m-blue-a', 'm-blue-view'],
  );
  assert.deepEqual(
    colorPinMembershipsForTarget(snapshot, { projectId: 'p', kind: 'entity', id: 'artifact-a' })
      .map((membership) => membership.id),
    ['m-blue-a', 'm-red-a'],
  );
  assert.equal(colorPinMembershipsForTarget(snapshot, { projectId: 'p', kind: 'view', id: 'view-stale' }).length, 1);
  assert.equal('worldPosition' in snapshot.memberships[0]!, false);
});

test('selected Artifact stays canonical entity while explicit View stays specific occurrence', () => {
  assert.deepEqual(colorPinTargetFromEntityRef('p', { entityType: 'artifact', entityId: 'artifact-a' }), {
    projectId: 'p', kind: 'entity', id: 'artifact-a',
  });
  assert.deepEqual(colorPinTargetFromEntityRef('p', { entityType: 'view', entityId: 'view-a' }), {
    projectId: 'p', kind: 'view', id: 'view-a',
  });
});
