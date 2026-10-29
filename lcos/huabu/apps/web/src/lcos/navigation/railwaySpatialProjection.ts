import { railwayStableKeyV1 } from '@local-creative-os/contracts';

import type { RailwayDestinationV1, RailwaySnapshotV1 } from '@local-creative-os/contracts';

/** T2 destination admission: existing long-term worksites and conversations are
 * automatic; spatial objects appear only after an explicit canonical Rail pin.
 * This read-only projection never writes order, membership or identities.
 */
export function railwaySpatialProjection(
  snapshot: RailwaySnapshotV1 | undefined,
  projectId: string,
): RailwayDestinationV1[] {
  if (snapshot?.projectId !== projectId) return [];
  // Keep Core's stored order and unavailable entries. SurfaceDock owns roots.
  const stored = snapshot.destinations.filter(item => item.ref.projectId === projectId
    && item.role !== 'surface' && item.ref.kind !== 'surface_root');
  const automatic = snapshot.candidates.filter(item => {
    if (item.ref.projectId !== projectId || item.key !== railwayStableKeyV1(item.ref) || !item.available) return false;
    if (item.role === 'worksite' && item.ref.kind === 'worksite') return item.workspaceId === item.ref.worksiteId
      && item.ref.worksiteId.trim().length > 0 && Boolean(item.canvasId?.trim());
    return item.role === 'receiver' && item.ref.kind === 'receiver_conversation'
      && item.ref.connectedConversationId.trim().length > 0;
  });
  const destinations = new Map<string, RailwayDestinationV1>();
  for (const item of [...stored,...automatic]) if (!destinations.has(item.key)) destinations.set(item.key, item);
  return [...destinations.values()];
}
