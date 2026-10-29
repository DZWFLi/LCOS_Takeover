import { describe, expect, it } from 'vitest';

import { ringVariants, satelliteVariants } from './objectOrbitMotion';

describe('GEN1 ObjectOrbit choreography provenance', () => {
  it('retains the original stagger and reverse exit sequence', () => {
    expect(ringVariants.visible).toEqual({ transition: { staggerChildren: .06, delayChildren: .02 } });
    expect(ringVariants.exiting).toEqual({ transition: { staggerChildren: .03, staggerDirection: -1 } });
  });
  it('retains the original spring rather than a hand-written CSS keyframe', () => {
    expect(satelliteVariants.visible).toEqual({ opacity: 1, scale: 1, x: 0, y: 0,
      transition: { type: 'spring', stiffness: 400, damping: 25 } });
  });
});
