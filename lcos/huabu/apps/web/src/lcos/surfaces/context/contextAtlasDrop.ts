import { railwayAggregatePayload } from '../../drop/railwayAssemblyDrop';

import type { DropPayload, DropTargetSemantic } from '../../drop/dropTypes';
import type { WarehouseItemV1 } from '@local-creative-os/contracts';

/** Atlas is a projection of canonical collections or Context scopes. It never
 * converts a scope into a typed Collection or expands an aggregate's members. */
export function contextAtlasDropSource(item: WarehouseItemV1, projectId: string):
  Extract<DropPayload, { kind: 'assembly' }> | undefined {
  if (!item.entityRef.id.trim()) return undefined;
  if (item.kind === 'collection' && item.entityRef.type === 'collection') {
    return railwayAggregatePayload({ projectId, sourceRef: { kind: 'collection', id: item.entityRef.id },
      entityRef: { type: 'collection', id: item.entityRef.id }, label: item.title, available: true }, projectId);
  }
  if (item.kind === 'context' && item.entityRef.type === 'context') {
    return railwayAggregatePayload({ projectId, sourceRef: { kind: 'context', id: item.entityRef.id },
      entityRef: { type: 'scope', id: item.entityRef.id }, label: item.title, available: true }, projectId);
  }
  return undefined;
}

export function contextAtlasDropSemantic(item: WarehouseItemV1): DropTargetSemantic | undefined {
  if (!item.entityRef.id.trim()) return undefined;
  if (item.kind === 'collection' && item.entityRef.type === 'collection')
    return { kind: 'collection-membership', collectionId: item.entityRef.id };
  if (item.kind === 'context' && item.entityRef.type === 'context')
    return { kind: 'spatial-membership', targetRef: { kind: 'context', id: item.entityRef.id } };
  return undefined;
}
