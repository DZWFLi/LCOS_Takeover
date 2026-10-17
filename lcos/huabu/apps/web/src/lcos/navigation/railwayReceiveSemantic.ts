import { railwayDestinationCanReceive } from './railwayReceivePresentation';

import type { DropTargetSemantic } from '../drop/dropTypes';
import type { RailwayDestinationV1, RailwaySnapshotV1 } from '@local-creative-os/contracts';

/** Project existing Core reception routes; no automatic pin or new mutation owner.
 * Ordered entries retain Railway's order check. Existing unpinned workspaces use
 * the same batch receiver through its already-supported direct workspace route.
 */
export function railwayReceiveSemantic(
  destination: RailwayDestinationV1,
  currentCanvasId: string | null | undefined,
  snapshot: RailwaySnapshotV1,
  ready: boolean,
): DropTargetSemantic {
  const reason = destination.reason ?? (destination.role === 'receiver'
    ? '这里只打开会话；请把材料拖到画布上的会话本体。'
    : destination.canvasId === currentCanvasId ? '已经在当前现场，请直接在画布整理。' : '目的地暂不能接收材料。');
  if (!ready || !railwayDestinationCanReceive(destination, currentCanvasId)) return { kind: 'drop-exclusion', reason };
  const receiver = destination.receiveTarget;
  if (receiver?.owner === 'collection-membership') return { kind: 'collection-membership', collectionId: receiver.collectionId };
  if (receiver?.owner === 'assembly') return { kind: 'spatial-membership', targetRef: receiver.targetRef };
  if (destination.ref.kind !== 'worksite' || destination.ref.projectId !== snapshot.projectId
    || destination.workspaceId !== destination.ref.worksiteId) return { kind: 'drop-exclusion', reason };
  const targetRef = { kind: 'workspace' as const, id: destination.workspaceId };
  if (!snapshot.destinations.some(item => item.key === destination.key)) return {
    kind: 'portal-receive', targetRef, destinationRef: destination.ref, canvasId: destination.canvasId,
  };
  return { kind: 'railway-receive', targetRef, destinationRef: destination.ref,
    canvasId: destination.canvasId, orderVersion: snapshot.order.version, accepts: destination.accepts };
}
