import { describe, expect, it } from 'vitest';

import {
  projectTemporalGroupWindow,
  shiftTemporalWindowStart,
  temporalGroupRatio,
} from './temporalWindow';

import type { TemporalGroupV1 } from '@local-creative-os/contracts';

function group(index: number, start = `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`): TemporalGroupV1 {
  return {
    id: `group-${index}`,
    level: 'mid',
    start,
    end: start,
    eventIds: [`event-${index}`],
    targets: [{ type: 'artifact', id: `artifact-${index}` }],
    eventCount: index + 1,
  };
}

describe('producer-owned Temporal Rail window', () => {
  const groups = Array.from({ length: 10 }, (_, index) => group(index));

  it('moves only a bounded group window and exposes its overview band', () => {
    const first = projectTemporalGroupWindow(groups, 0, 4);
    const nextStart = shiftTemporalWindowStart({ currentStart: first.startIndex, direction: 1, totalCount: groups.length, capacity: 4 });
    const next = projectTemporalGroupWindow(groups, nextStart, 4);
    expect(first.groups.map((item) => item.id)).toEqual(['group-0', 'group-1', 'group-2', 'group-3']);
    expect(next.groups.map((item) => item.id)).toEqual(['group-1', 'group-2', 'group-3', 'group-4']);
    expect(next).toMatchObject({ startIndex: 1, endIndex: 4, totalCount: 10, canRewind: true, canAdvance: true, spanRatio: 0.4 });
    expect(next.positionRatio).toBeCloseTo(1 / 6);
  });

  it('clamps repeated wheel shifts at both ends', () => {
    expect(projectTemporalGroupWindow(groups, -100, 4).startIndex).toBe(0);
    expect(projectTemporalGroupWindow(groups, 100, 4).startIndex).toBe(6);
    expect(shiftTemporalWindowStart({ currentStart: 6, direction: 1, totalCount: 10, capacity: 4 })).toBe(6);
    expect(shiftTemporalWindowStart({ currentStart: 0, direction: -1, totalCount: 10, capacity: 4 })).toBe(0);
  });

  it('clamps to one full window when the producer has fewer groups than capacity', () => {
    const short = groups.slice(0, 3);
    expect(projectTemporalGroupWindow(short, 99, 7)).toMatchObject({
      startIndex: 0,
      endIndex: 2,
      totalCount: 3,
      canRewind: false,
      canAdvance: false,
      positionRatio: 0,
      spanRatio: 1,
    });
    expect(shiftTemporalWindowStart({ currentStart: 0, direction: 1, totalCount: 3, capacity: 7 })).toBe(0);
  });

  it('recomputes visible ratios from durable time boundaries, with an index fallback', () => {
    const visible = groups.slice(2, 6);
    expect(visible.map((item) => temporalGroupRatio(item, visible))).toEqual([0, 1 / 3, 2 / 3, 1]);
    const invalid = [group(0, 'not-a-time'), group(1, 'also-not-a-time')];
    expect(invalid.map((item) => temporalGroupRatio(item, invalid))).toEqual([0, 1]);
  });
});
