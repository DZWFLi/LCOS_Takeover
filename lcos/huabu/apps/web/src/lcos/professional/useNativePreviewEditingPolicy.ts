import { useCallback } from 'react';

import { useLcosReferenceStore } from '../lcosReferenceState';

/** Native editors keep owning unbound canvas content. A Core-bound material
 * must use the existing canonical editor instead of writing node.data. */
export function useNativePreviewEditingPolicy(): (nodeId: string) => boolean {
  const references = useLcosReferenceStore((state) => state.nodeEntityRefs);
  const ready = useLcosReferenceStore((state) => state.bindingIdentitiesReady);
  return useCallback((nodeId: string) => ready && !references.has(nodeId), [ready, references]);
}
