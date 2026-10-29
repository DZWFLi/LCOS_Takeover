import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { CanvasNodeBodySlotInput } from '@/lcos-seam/types';

/** The existing editor reads/writes the exact local or proven source carrier.
 * A shared material without a unique source remains a FileRecord reader.
 * Same-scope imported managed text remains editable; creation flags and native
 * creator origins preserve the original canvas-text authoring path. */
export function usesCanvasTextEditor(input: CanvasNodeBodySlotInput, ref: LcosNodeEntityRef | undefined): boolean {
  if (input.nodeType !== 'text' && input.nodeType !== 'note') return false;
  if (input.data.lcosProjectTextCreating === true || typeof input.data.lcosProjectTextCreateError === 'string') return true;
  if (!ref) return input.nodeType === 'text' && input.data.contentMissing !== true;
  const descriptor = ref.descriptor;
  const mime = (descriptor?.mimeType ?? '').split(';', 1)[0]?.trim().toLowerCase();
  if (ref.entityType !== 'artifact' || descriptor?.entityType !== 'artifact' || descriptor.entityId !== ref.entityId
    || descriptor.managed !== true || descriptor.artifactViewReferenceKind === 'explicit_additional'
    || !['markdown', 'text'].includes(descriptor.artifactKind ?? '') || ['url', 'web'].includes(descriptor.sourceKind ?? '')
    || mime && mime !== 'text/plain' && mime !== 'text/markdown' || descriptor.revisionStatus === 'draft'
    || descriptor.presentedRevisionId && descriptor.presentedRevisionId !== descriptor.currentRevisionId) return false;
  if (descriptor.canvasTextEditable === true) return true;
  const source = descriptor.canvasTextSourceAddress;
  if (source && source.canvasId.trim() && source.spatialId.trim() && source.viewId
    && source.viewId === descriptor.artifactViewId) return true;
  if (descriptor.canvasTextEditable !== undefined) return false;
  const origin = input.data.origin;
  const creator = origin !== null && typeof origin === 'object' && !Array.isArray(origin)
    && 'type' in origin && (origin.type === 'user-created' || origin.type === 'user-pasted');
  // Successful project-text creation clears this flag to false on the same
  // native carrier; keep editing available before its graph descriptor refresh.
  return creator || input.data.lcosProjectTextCreating === false;
}
