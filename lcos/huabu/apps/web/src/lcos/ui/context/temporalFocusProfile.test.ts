import { describe, expect, it } from 'vitest';

import { temporalEpisodeFocusFace, temporalFocusTick } from './temporalFocusProfile';

// Exact nearby Figma nodes 5156:3099–3111. No synthetic business records.
describe('Figma 5156:3080 fixed-cadence inward focus', () => {
  it('matches the measured center and its neighbours', () => {
    for (const [index, width] of [[18, 23.721538543701172], [19, 13.666268348693848], [20, 24.324613571166992], [21, 24.4643497467041], [22, 30.97784996032715], [23, 36.065208435058594], [24, 44], [25, 36.065208435058594], [26, 30.97784996032715], [27, 37.46434783935547]] as const) {
      expect(temporalFocusTick(index, 277, false).width).toBeCloseTo(width, 4);
    }
  });
  it('renders the exact temporary black 4px focus face', () => expect(temporalFocusTick(24, 277, false)).toEqual({ width: 44, height: 4, backgroundColor: '#000000' }));
  it('never supplies vertical displacement', () => {
    for (let index = 0; index < 47; index += 1) expect(temporalFocusTick(index, 277, false)).not.toHaveProperty('y');
  });
  it('has only one focused dark tick', () => expect(Array.from({ length: 47 }, (_, i) => temporalFocusTick(i, 277, false)).filter(x => x.height === 4)).toHaveLength(1));
  it('restores the idle face on leave', () => expect(temporalFocusTick(24, null, false)).toEqual({ width: 14, height: 1, backgroundColor: '#a8b8ac' }));
  it('disables the bump for reduced motion', () => expect(temporalFocusTick(24, 277, true)).toEqual(temporalFocusTick(24, null, false)));
  it('ignores non-finite focus positions', () => {
    for (const focus of [NaN, Infinity, -Infinity]) expect(temporalFocusTick(24, focus, false)).toEqual(temporalFocusTick(24, null, false));
  });
  it('interpolates measured widths between ticks', () => expect(temporalFocusTick(23, 271.5, false).width).toBeCloseTo(8 + (30 + 28.065208435058594) / 2, 4));
  it('keeps the inward face within the rail', () => {
    for (let focus = 13; focus <= 519; focus += 5.5) {
      for (let index = 0; index < 47; index += 1) {
        const { width } = temporalFocusTick(index, focus, false);
        expect(width).toBeGreaterThanOrEqual(8);
        expect(width).toBeLessThanOrEqual(44);
      }
    }
  });

  it('adds the bell profile to every L0–L4 width and restores the exact static width on leave', () => {
    for (const staticWidth of [8, 11, 16, 23, 34]) {
      expect(temporalEpisodeFocusFace({ staticWidth, y: 200, focusY: 200, reducedMotion: false })).toEqual({
        width: 44,
        height: 4,
        backgroundColor: '#000000',
      });
      const neighbor = temporalEpisodeFocusFace({ staticWidth, y: 211, focusY: 200, reducedMotion: false });
      expect(neighbor.width).toBeGreaterThan(staticWidth);
      expect(neighbor.width).toBeLessThanOrEqual(44);
      expect(temporalEpisodeFocusFace({ staticWidth, y: 200, focusY: null, reducedMotion: false })).toEqual({
        width: staticWidth,
        height: 2,
        backgroundColor: '#789082',
      });
    }
  });

  it('keeps the static episode tier under reduced motion', () => {
    expect(temporalEpisodeFocusFace({ staticWidth: 23, y: 200, focusY: 200, reducedMotion: true })).toEqual({
      width: 23,
      height: 2,
      backgroundColor: '#789082',
    });
  });
});
