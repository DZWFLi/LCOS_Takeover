import { describe, expect, it } from 'vitest';

import { temporalLengthPresentation } from './temporalLength';

describe('Temporal Rail static length owner', () => {
  it('quantizes one continuous canonical-count score into all five T5 tiers', () => {
    expect(temporalLengthPresentation({ eventCount: 1, targetCount: 1 })).toMatchObject({ tier: 'L0', width: 8 });
    expect(temporalLengthPresentation({ eventCount: 2, targetCount: 2 })).toMatchObject({ tier: 'L1', width: 11 });
    expect(temporalLengthPresentation({ eventCount: 4, targetCount: 3 })).toMatchObject({ tier: 'L2', width: 16 });
    expect(temporalLengthPresentation({ eventCount: 6, targetCount: 5 })).toMatchObject({ tier: 'L3', width: 23 });
    expect(temporalLengthPresentation({ eventCount: 12, targetCount: 8 })).toMatchObject({ tier: 'L4', width: 34 });
  });

  it('is monotonic and makes invalid counts harmless without inventing facts', () => {
    const inputs = [
      { eventCount: Number.NaN, targetCount: -3 },
      { eventCount: 1, targetCount: 1 },
      { eventCount: 2, targetCount: 2 },
      { eventCount: 8, targetCount: 8 },
    ];
    const scores = inputs.map(temporalLengthPresentation).map((item) => item.score);
    expect(scores).toEqual([...scores].sort((left, right) => left - right));
    expect(scores[0]).toBe(0);
  });
});
