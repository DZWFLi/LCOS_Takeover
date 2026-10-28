import { createNativeLibraryScopePreviewDispatcher } from './native-library-scope-preview-drop';
import { createNativeSurfaceCollectionDispatcher } from './native-surface-collection-drop';
import { createNativeSurfaceMaterialDispatcher } from './native-surface-material-drop';
import type { DropPayload } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import useCanvasStore from './native-canvas-port';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { createNativeLibraryMaterialDispatcher } from './native-library-material-dispatch';
export { canCheckNativeLibraryDropReceipt, checkNativeLibraryDropReceipt } from './native-library-material-dispatch';

/** Read only the existing Canvas/Shell/Drop stores. Core and the original
 * history/API remain the unique writers; no copied collection or Canvas state. */
export function createNativeLibraryMaterialOwner(projectId: string, canvasId: string | null, payload: unknown, transactionId: string) {
  const current = () => {
    const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
    return { projectId: shell.projectId ?? '', canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId,
      surface: shell.activeSurface, api: canvas.rfInstance };
  };
  const ports = {
    current, target: (id: string) => useLcosDropStore.getState().targets().find(target => target.targetId === id),
    gesture: (originalPayload: unknown, tx: string, targetId: string, recovery: boolean) => {
      const { state, feedback, resolution } = useLcosDropStore.getState();
      if (!recovery) return state.status === 'committing' && state.transactionId === tx && state.payload === originalPayload
        && resolution?.status === 'ready' && resolution.intent.targetId === targetId;
      return (state.status === 'failed' || state.status === 'idle') && feedback !== null && feedback.attempt.payload === originalPayload
        && feedback.attempt.transactionId === tx && feedback.receipt.transactionId === tx
        && feedback.originalIntent.intent.targetId === targetId;
    },
    refreshConversation: (project: string, conversation: string) => { void useCollaborationSessionStore.getState().refresh(project, conversation); },
    rootCanvas: (surface: 'main' | 'context' | 'workflow') => useLcosShellStore.getState().surfaceCanvasId[surface],
  };
  const release = { ...current(), projectId, canvasId };
  const library = createNativeLibraryMaterialDispatcher(release, payload, transactionId, ports);
  const spatial = createNativeSurfaceMaterialDispatcher(release, payload as DropPayload, transactionId, ports);
  const collection = createNativeSurfaceCollectionDispatcher(release, payload as DropPayload, transactionId, ports);
  const scopePreview = createNativeLibraryScopePreviewDispatcher(release, payload as DropPayload, transactionId, ports);
  return {
    admitComposer: library.admitComposer,
    handle: async (...args: Parameters<typeof library.handle>) => (await scopePreview.handle(...args)) ?? (await collection.handle(...args)) ?? (await spatial.handle(...args)) ?? library.handle(...args),
  };
}
