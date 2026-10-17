import { describe, expect, it } from 'vitest';

import {
  createTemporalLocateRequest,
  projectTemporalGroupTargets,
  temporalPartialReason,
} from './temporalTargetProjection';

import type { LcosNodeEntityRef } from '../../lcosReferenceState';
import type { TemporalGroupV1 } from '@local-creative-os/contracts';

const group: TemporalGroupV1 = {
  id: 'mid:one',
  level: 'mid',
  start: '2026-09-20T00:00:00.000Z',
  end: '2026-09-20T00:10:00.000Z',
  eventIds: ['event-1'],
  targets: [
    { type: 'artifact', id: 'artifact-a' },
    { type: 'run', id: 'run-a' },
    { type: 'note', id: 'note-missing' },
  ],
  eventCount: 1,
};

describe('temporal target projection', () => {
  it('keeps every projected node for the MID group and reports canonical misses', () => {
    const refs = new Map<string, LcosNodeEntityRef>([
      ['artifact-node-a', { entityType: 'artifact', entityId: 'artifact-a' }],
      ['artifact-node-b', { entityType: 'artifact', entityId: 'artifact-a' }],
      ['run-node', { entityType: 'run', entityId: 'run-a' }],
      ['other-node', { entityType: 'artifact', entityId: 'artifact-other' }],
    ]);

    const projection = projectTemporalGroupTargets(group, refs);

    expect(projection.nodeIds).toEqual(['artifact-node-a', 'artifact-node-b', 'run-node']);
    expect(projection.projectedTargetCount).toBe(2);
    expect(projection.missingTargets).toEqual([{ type: 'note', id: 'note-missing' }]);
    expect(temporalPartialReason(projection, group.targets.length)).toBe(
      '已定位 2/3 个时间目标；1 个尚未投影到当前 Context',
    );
    expect(createTemporalLocateRequest({
      reqId: 'temporal-1',
      canvasId: 'canvas-context',
      projection,
    })).toEqual({
      reqId: 'temporal-1',
      surface: 'context',
      canvasId: 'canvas-context',
      nodeId: 'artifact-node-a',
      nodeIds: ['artifact-node-a', 'artifact-node-b', 'run-node'],
      status: 'projected',
    });
  });

  it('does not invent a target when no current Context binding matches', () => {
    const projection = projectTemporalGroupTargets(group, new Map());

    expect(projection.nodeIds).toEqual([]);
    expect(projection.projectedTargetCount).toBe(0);
    expect(projection.missingTargets).toHaveLength(3);
    expect(createTemporalLocateRequest({ reqId: 'temporal-2', projection })).toBeUndefined();
  });
});
