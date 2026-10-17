import useCanvasStore from '@/store/canvasStore';

import { waitForProjectedEntity } from './waitForProjectedEntity';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { RailwayDestinationV1 } from '@local-creative-os/contracts';

/** Open the existing Main object through the same locate consumer as Where.
 * Missing projections remain missing; this never opens an Assembly as a fallback. */
export async function locateSpatialDestination(projectId: string, destination: RailwayDestinationV1,
  options: { readonly mainCanvasId?: string; readonly onNavigateMain?: () => Promise<boolean>; readonly signal?: AbortSignal }): Promise<boolean> {
  if (destination.ref.kind !== 'spatial' || destination.ref.projectId !== projectId || !destination.available) return false;
  const identity = { entityType: destination.ref.entityType, entityId: destination.ref.entityId };
  const current = (): boolean => useLcosShellStore.getState().projectId === projectId && !options.signal?.aborted;
  if (!current()) return false;
  const canvas = useCanvasStore.getState();
  const live = new Set(canvas.nodes.map(node => node.id));
  const own = [...useLcosReferenceStore.getState().nodeEntityRefs].find(([id, ref]) =>
    live.has(id) && ref.entityType === identity.entityType && ref.entityId === identity.entityId);
  let canvasId: string | undefined = canvas.canvasId;
  let nodeId = own?.[0];
  if (!nodeId) {
    canvasId = options.mainCanvasId;
    if (!canvasId || !options.onNavigateMain || !await options.onNavigateMain() || !current()) return false;
    nodeId = await waitForProjectedEntity({ projectId, canvasId, ...identity, signal: options.signal });
  }
  if (!nodeId || !canvasId || !current() || useCanvasStore.getState().canvasId !== canvasId) return false;
  useLcosShellStore.getState().requestLocate({ reqId: crypto.randomUUID(), surface: useLcosShellStore.getState().activeSurface,
    canvasId, nodeId, status: 'projected', preserveSelection: true });
  return true;
}
