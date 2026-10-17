import type {
  ColorPinDefinitionV0,
  ColorPinMembershipV0,
  ColorPinSnapshotV0,
  SpatialMarkerTargetRefV0,
} from '@local-creative-os/contracts';

/** Stable compatibility key for the current V0 canonical target contract. */
export function colorPinTargetKey(targetRef: SpatialMarkerTargetRefV0): string {
  return JSON.stringify([targetRef.projectId, targetRef.kind, targetRef.id]);
}

/**
 * Compatibility adapter for the current V0 target contract. A selected
 * Artifact is kept as a canonical entity; an explicitly selected ArtifactView
 * remains a specific view. The adapter never converts an entity into a view.
 */
export function colorPinTargetFromEntityRef(
  projectId: string,
  ref: { readonly entityType: string; readonly entityId: string },
): SpatialMarkerTargetRefV0 {
  return {
    projectId,
    kind: ref.entityType === 'view' ? 'view' : 'entity',
    id: ref.entityId,
  };
}

/** Navigation HUDs show only definitions that still have at least one membership. */
export function usedColorPinDefinitions(
  snapshot: ColorPinSnapshotV0,
): readonly ColorPinDefinitionV0[] {
  const usedIds = new Set(snapshot.memberships.map((membership) => membership.colorPinId));
  return snapshot.definitions
    .filter((definition) => usedIds.has(definition.id))
    .slice()
    .sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
}

export function colorPinMembershipsByDefinition(
  snapshot: ColorPinSnapshotV0,
): ReadonlyMap<string, readonly ColorPinMembershipV0[]> {
  const grouped = new Map<string, ColorPinMembershipV0[]>();
  for (const membership of snapshot.memberships) {
    const members = grouped.get(membership.colorPinId) ?? [];
    members.push(membership);
    grouped.set(membership.colorPinId, members);
  }
  return grouped;
}

export function colorPinMembershipsByTarget(
  snapshot: ColorPinSnapshotV0,
): ReadonlyMap<string, readonly ColorPinMembershipV0[]> {
  const grouped = new Map<string, ColorPinMembershipV0[]>();
  for (const membership of snapshot.memberships) {
    const key = colorPinTargetKey(membership.targetRef);
    const members = grouped.get(key) ?? [];
    members.push(membership);
    grouped.set(key, members);
  }
  return grouped;
}

export function colorPinMembershipsForTarget(
  snapshot: ColorPinSnapshotV0,
  targetRef: SpatialMarkerTargetRefV0,
): readonly ColorPinMembershipV0[] {
  return colorPinMembershipsByTarget(snapshot).get(colorPinTargetKey(targetRef)) ?? [];
}
