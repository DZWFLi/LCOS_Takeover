import { describe, expect, it } from 'vitest';

import {
  nextEnabledTemporalIndex,
  temporalRatioToY,
  temporalTickCount,
} from './temporalNavigation';

describe('Temporal Rail navigation', () => {
  it('browses real items and skips unavailable items', () => {
    const items = [{}, { disabled: true }, {}];
    expect(nextEnabledTemporalIndex(items, 0, 1)).toBe(2);
    expect(nextEnabledTemporalIndex(items, 2, 1)).toBe(0);
    expect(nextEnabledTemporalIndex(items, 0, -1)).toBe(2);
  });

  it('shortens the tick window instead of stretching tick spacing', () => {
    expect(temporalTickCount(555)).toBe(47);
    expect(temporalTickCount(360)).toBeLessThan(47);
  });

  it('maps producer-owned ratio inside current visible window', () => {
    expect(temporalRatioToY(0, 555)).toBe(13);
    expect(temporalRatioToY(1, 555)).toBe(519);
  });
});
