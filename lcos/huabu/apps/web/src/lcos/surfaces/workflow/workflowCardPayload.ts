import { railwayAggregatePayload } from '../../drop/railwayAssemblyDrop';

import type { WorkflowHandCard } from './WorkflowCardPool';

/** WarehouseService emits workflow rows from canonical Scope records. The row
 * category stays 'workflow' for the card; existing consumers need 'scope'.
 * Do not reinterpret an Artifact merely presented as a workflow card. */
export function workflowCardDropPayload(card: WorkflowHandCard, projectId: string) {
  const sourceRef = card.assemblySourceRef;
  if (card.entityType !== 'workflow' || sourceRef?.kind !== 'workflow' || sourceRef.id !== card.entityId
    || card.workspaceTargetRef?.kind !== 'workflow' || card.workspaceTargetRef.entityRef.type !== 'workflow'
    || card.workspaceTargetRef.entityRef.id !== card.entityId) return undefined;
  return railwayAggregatePayload({ projectId, sourceRef, entityRef: { type: 'scope', id: sourceRef.id },
    label: card.title, available: true }, projectId);
}
