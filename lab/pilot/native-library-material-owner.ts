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
  return createNativeLibraryMaterialDispatcher({ ...current(), projectId, canvasId }, payload, transactionId, {
    current, target: id => useLcosDropStore.getState().targets().find(target => target.targetId === id),
    gesture: (originalPayload, tx, targetId, recovery) => {
      const { state, feedback, resolution } = useLcosDropStore.getState();
      if (!recovery) return state.status === 'committing' && state.transactionId === tx && state.payload === originalPayload
        && resolution?.status === 'ready' && resolution.intent.targetId === targetId;
      return (state.status === 'failed' || state.status === 'idle') && feedback?.attempt.payload === originalPayload
        && feedback.attempt.transactionId === tx && feedback.receipt.transactionId === tx
        && feedback.originalIntent.intent.targetId === targetId;
    },
    refreshConversation: (project, conversation) => { void useCollaborationSessionStore.getState().refresh(project, conversation); },
  });
}
