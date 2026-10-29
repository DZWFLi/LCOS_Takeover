import { createContext, useContext } from 'react';

// A host supplies editing permission for a native preview. Huabu/dev mode
// retains its existing behavior; the seam never knows a Core entity or API.
const PreviewEditingPolicyContext = createContext<(nodeId: string) => boolean>(() => true);
export const PreviewEditingPolicyProvider = PreviewEditingPolicyContext.Provider;

export function useNativePreviewCanEdit(nodeId: string | null | undefined): boolean {
  const canEdit = useContext(PreviewEditingPolicyContext);
  return nodeId !== undefined && nodeId !== null && canEdit(nodeId);
}
