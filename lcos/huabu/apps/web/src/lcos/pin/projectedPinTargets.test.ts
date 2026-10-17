import { expect, it } from 'vitest';
import { colorPinTargetFromEntityRef, colorPinTargetKey } from '@local-creative-os/web-gen2';
import { projectedPinTargets } from './projectedPinTargets';
it('projects only real memberships on current visible nodes and never promotes selection into Pin', () => {
  const ref = { entityId: 'a', entityType: 'artifact' };
  const key = colorPinTargetKey(colorPinTargetFromEntityRef('p', ref));
  const projection = { projectId: 'p', snapshot: { definitions: [{ id: 'pin', color: '#CE824C' }], memberships: [] },
    membershipsByTargetKey: new Map([[key, [{ colorPinId: 'pin' }]]]) } as unknown as Parameters<typeof projectedPinTargets>[2];
  expect(projectedPinTargets([{ id: 'visible' }, { id: 'hidden', hidden: true }, { id: 'unbound' }], new Map([['visible', ref], ['hidden', ref], ['stale', ref]]), projection))
    .toEqual([{ nodeId: 'visible', label: '已标记对象', colors: ['#CE824C'] }]);
});
