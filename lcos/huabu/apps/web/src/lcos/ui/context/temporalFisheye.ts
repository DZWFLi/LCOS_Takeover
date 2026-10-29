/*
 * 1D fisheye scale adapted from Mike Bostock's d3-plugins fisheye implementation.
 * Original algorithm: d3/d3-plugins/fisheye/fisheye.js (BSD-3-Clause).
 * Historical presentation helper only. Stage7 TemporalRail no longer calls this warp:
 * approved Figma 5156:3080 keeps vertical cadence fixed and expands widths inward.
 */
export function fisheye1d(input: {
  value: number;
  focus: number;
  min: number;
  max: number;
  distortion?: number;
}): number {
  const { value, focus, min, max, distortion = 3 } = input;
  if (!Number.isFinite(value) || !Number.isFinite(focus) || max <= min) return value;
  if (value === focus) return focus;
  const left = value < focus;
  let span = left ? focus - min : max - focus;
  if (span === 0) span = max - min;
  const distance = Math.abs(value - focus);
  if (distance === 0) return focus;
  return (left ? -1 : 1) * span * (distortion + 1) / (distortion + span / distance) + focus;
}

export function temporalTickLength(index: number): 8 | 14 | 21 {
  if (index % 9 === 0) return 21;
  if (index % 4 === 0) return 14;
  return 8;
}
