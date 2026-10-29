import type { DropTargetSemantic } from '../drop/dropTypes';
import type { LcosNodeEntityRef } from '../lcosReferenceState';

/** Existing canonical identity selects its natural membership owner, never the label or Surface. */
export function nodeMembershipDropSemantic(ref: Pick<LcosNodeEntityRef,'entityType'|'entityId'|'descriptor'> | undefined): DropTargetSemantic | undefined {
  if (!ref?.entityId.trim()) return undefined;
  if (ref.entityType === 'collection') return {kind:'collection-membership',collectionId:ref.entityId};
  const descriptor=ref.descriptor;
  if (ref.entityType !== 'scope' || descriptor?.entityType !== 'scope' || descriptor.entityId !== ref.entityId) return undefined;
  const category=descriptor.sourceKind === 'context' || descriptor.sourceKind === 'workflow' ? descriptor.sourceKind
    : descriptor.artifactKind === 'context' || descriptor.artifactKind === 'workflow' ? descriptor.artifactKind : undefined;
  return category ? {kind:'spatial-membership',targetRef:{kind:category,id:ref.entityId}} : undefined;
}
