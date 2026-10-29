export interface TemporalNavigableItem {
  readonly disabled?: boolean;
}

export const TEMPORAL_MAX_RAIL_HEIGHT = 555;
export const TEMPORAL_TOP_PADDING = 13;
export const TEMPORAL_BOTTOM_PADDING = 36;
export const TEMPORAL_TICK_STEP = 11;
export const TEMPORAL_MAX_TICKS = 47;

export function nextEnabledTemporalIndex(
  items: readonly TemporalNavigableItem[],
  from: number,
  delta: -1 | 1,
): number {
  if (items.length === 0) return -1;
  const start = Number.isFinite(from) ? Math.trunc(from) : -1;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = ((start + delta * offset) % items.length + items.length) % items.length;
    if (items[index]?.disabled !== true) return index;
  }
  return -1;
}

export function temporalTickCount(railHeight: number): number {
  if (!Number.isFinite(railHeight) || railHeight < TEMPORAL_TOP_PADDING + TEMPORAL_BOTTOM_PADDING) return 0;
  return Math.min(
    TEMPORAL_MAX_TICKS,
    Math.max(0, Math.floor((railHeight - TEMPORAL_TOP_PADDING - TEMPORAL_BOTTOM_PADDING) / TEMPORAL_TICK_STEP) + 1),
  );
}

export function temporalRatioToY(ratio: number, railHeight: number): number {
  const usable = Math.max(0, (Number.isFinite(railHeight) ? railHeight : TEMPORAL_MAX_RAIL_HEIGHT) - TEMPORAL_TOP_PADDING - TEMPORAL_BOTTOM_PADDING);
  return TEMPORAL_TOP_PADDING + Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0)) * usable;
}
