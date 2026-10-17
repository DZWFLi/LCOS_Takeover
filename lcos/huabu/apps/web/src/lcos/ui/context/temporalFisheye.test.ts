import { describe, expect, it } from 'vitest';

import { fisheye1d, temporalTickLength } from './temporalFisheye';

describe('temporal fisheye presentation math', () => {
  it('keeps Figma tick cadence 21/14/8', () => {
    expect([0,1,4,8,9,12,18].map(temporalTickLength)).toEqual([21,8,14,14,21,14,21]);
  });

  it('keeps focus fixed and warps neighbours monotonically', () => {
    const focus = 200;
    expect(fisheye1d({ value: focus, focus, min: 13, max: 519 })).toBe(focus);
    const left = [80,120,160].map((value) => fisheye1d({ value, focus, min: 13, max: 519 }));
    expect(left[0]).toBeLessThan(left[1]);
    expect(left[1]).toBeLessThan(left[2]);
    expect(left[2]).toBeLessThan(focus);
  });
});
