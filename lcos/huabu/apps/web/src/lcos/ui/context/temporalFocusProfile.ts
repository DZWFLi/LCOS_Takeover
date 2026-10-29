import { temporalTickLength } from './temporalFisheye';
import { TEMPORAL_TICK_STEP, TEMPORAL_TOP_PADDING } from './temporalNavigation';

/**
 * Figma 5156:3080 / ticks 5156:3081–3127, focused at tick 24 (y=277).
 * This is a sampled DESIGN KEYFRAME, not an invented time/grouping algorithm.
 * The approved focus keeps every y unchanged and expands leftwards to x=4.
 * Between samples we interpolate their measured widths; the existing Motion
 * runtime handles time interpolation. Do not restore the old vertical d3 warp.
 */
export const TEMPORAL_FOCUS_FALLOFF: readonly number[] = [
  30,
  28.065208435058594,
  22.97784996032715,
  16.4643497467041,
  10.324613571166992,
  5.666268348693848,
  2.721538543701172,
  1.1440000534057617,
  0.4208536148071289,
  0.1354970932006836,
  0.03817939758300781,
  0.0094146728515625,
  0.0020322799682617188,
  0.0003833770751953125,
  6.389617919921875e-05,
  9.5367431640625e-06,
  9.5367431640625e-07,
  0,
];

function focusExtension(distance: number): number | undefined {
  const lower = Math.floor(distance);
  const a = TEMPORAL_FOCUS_FALLOFF[lower];
  if (a === undefined) return undefined;
  const b = TEMPORAL_FOCUS_FALLOFF[lower + 1] ?? 0;
  return a + (b - a) * (distance - lower);
}

export function temporalFocusTick(index: number, focusY: number | null, reducedMotion: boolean) {
  const y = TEMPORAL_TOP_PADDING + index * TEMPORAL_TICK_STEP;
  const width = temporalTickLength(index);
  const rest = { width, height: 1, backgroundColor: '#a8b8ac' };
  if (reducedMotion || focusY === null || !Number.isFinite(focusY)) return rest;
  const distance = Math.abs(y - focusY) / TEMPORAL_TICK_STEP;
  const extension = focusExtension(distance);
  if (extension === undefined) return rest;
  const focused = index === Math.max(0, Math.round((focusY - TEMPORAL_TOP_PADDING) / TEMPORAL_TICK_STEP));
  return {
    width: Math.min(44, width + extension),
    height: focused ? 4 : 1,
    backgroundColor: focused ? '#000000' : '#a8b8ac',
  };
}

/** T5 §8.6/8.7: add the same bell falloff on top of a canonical group's L0–L4 width. */
export function temporalEpisodeFocusFace(input: {
  readonly staticWidth: number;
  readonly y: number;
  readonly focusY: number | null;
  readonly reducedMotion: boolean;
}) {
  const staticWidth = Math.max(0, Number.isFinite(input.staticWidth) ? input.staticWidth : 0);
  const rest = { width: staticWidth, height: 2, backgroundColor: '#789082' };
  if (input.reducedMotion || input.focusY === null || !Number.isFinite(input.focusY)) return rest;
  const distance = Math.abs(input.y - input.focusY) / TEMPORAL_TICK_STEP;
  const extension = focusExtension(distance);
  if (extension === undefined) return rest;
  const focused = distance < 0.5;
  return {
    width: focused ? 44 : Math.min(44, staticWidth + extension),
    height: focused ? 4 : 2,
    backgroundColor: focused ? '#000000' : '#789082',
  };
}
