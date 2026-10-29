import type { TemporalGroupV1 } from '@local-creative-os/contracts';

export const TEMPORAL_GROUP_WINDOW_CAPACITY = 7;

export interface TemporalGroupWindow {
  readonly groups: readonly TemporalGroupV1[];
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalCount: number;
  readonly canRewind: boolean;
  readonly canAdvance: boolean;
  /** Position and span inside the complete producer result, for the quiet band. */
  readonly positionRatio: number;
  readonly spanRatio: number;
}

function clampStart(startIndex: number, totalCount: number, capacity: number): number {
  const safeCapacity = Math.max(1, Math.trunc(capacity));
  const maxStart = Math.max(0, totalCount - safeCapacity);
  return Math.max(0, Math.min(maxStart, Number.isFinite(startIndex) ? Math.trunc(startIndex) : 0));
}

export function projectTemporalGroupWindow(
  groups: readonly TemporalGroupV1[],
  requestedStart: number,
  capacity = TEMPORAL_GROUP_WINDOW_CAPACITY,
): TemporalGroupWindow {
  const safeCapacity = Math.max(1, Math.trunc(capacity));
  const startIndex = clampStart(requestedStart, groups.length, safeCapacity);
  const visible = groups.slice(startIndex, startIndex + safeCapacity);
  const endIndex = visible.length === 0 ? startIndex : startIndex + visible.length - 1;
  return {
    groups: visible,
    startIndex,
    endIndex,
    totalCount: groups.length,
    canRewind: startIndex > 0,
    canAdvance: endIndex < groups.length - 1,
    positionRatio: groups.length <= visible.length ? 0 : startIndex / Math.max(1, groups.length - visible.length),
    spanRatio: groups.length === 0 ? 0 : visible.length / groups.length,
  };
}

export function shiftTemporalWindowStart(input: {
  readonly currentStart: number;
  readonly direction: -1 | 1;
  readonly totalCount: number;
  readonly capacity?: number;
}): number {
  const capacity = input.capacity ?? TEMPORAL_GROUP_WINDOW_CAPACITY;
  return clampStart(input.currentStart + input.direction, input.totalCount, capacity);
}

/** Position a group inside the current window using durable occurredAt boundaries. */
export function temporalGroupRatio(
  group: TemporalGroupV1,
  visibleGroups: readonly TemporalGroupV1[],
): number {
  if (visibleGroups.length <= 1) return 0.5;
  const first = Date.parse(visibleGroups[0]?.start ?? '');
  const last = Date.parse(visibleGroups.at(-1)?.end ?? '');
  const current = Date.parse(group.start);
  if (Number.isFinite(first) && Number.isFinite(last) && Number.isFinite(current) && last > first) {
    return Math.max(0, Math.min(1, (current - first) / (last - first)));
  }
  const index = visibleGroups.findIndex((candidate) => candidate.id === group.id);
  return index < 0 ? 0 : index / Math.max(1, visibleGroups.length - 1);
}
