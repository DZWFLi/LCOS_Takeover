import useCanvasStore from '@/store/canvasStore';

import { waitForProjectedEntity } from './waitForProjectedEntity';
import { animateCurrentWorksiteCamera } from './worksiteCameraTransition';
import { useLcosShellStore, type LcosChildReturn } from '../shell/lcosShellStore';

/** The existing return caller, extracted for production/browser verification.
 * Its one-shot shell intent remains alive until navigation commits, not merely
 * until the decorative camera animation ends. New navigation consumes it. */
export async function returnToSourceWorksite(input: {
  readonly projectId: string;
  readonly context: LcosChildReturn | null;
  readonly navigate: (to: string, options: { replace: boolean }) => void;
}): Promise<boolean> {
  const { context, projectId, navigate } = input;
  let transitionId: string | undefined;
  const isCurrent = (): boolean => transitionId === undefined || useLcosShellStore.getState().worksiteCameraTransition?.id === transitionId;
  try {
    if (context?.projectId === projectId && context.sourceCanvasId !== undefined) {
      const shell = useLcosShellStore.getState();
      const currentCanvas = useCanvasStore.getState();
      const outgoing = shell.worksiteCameraTransition;
      if (outgoing?.canvasId === currentCanvas.canvasId && outgoing.targetViewport !== undefined) currentCanvas.setViewport(outgoing.targetViewport);
      transitionId = shell.requestWorksiteCameraTransition({ canvasId: context.sourceCanvasId, kind: 'return-restore',
        ...(context.sourceApproachViewport === undefined ? {} : { startViewport: context.sourceApproachViewport }),
        ...(context.sourceViewport === undefined ? {} : { targetViewport: context.sourceViewport }),
      });
      await animateCurrentWorksiteCamera({ direction: 'retreat' });
      if (!isCurrent()) return false;
      const loaded = await useCanvasStore.getState().switchCanvas(context.sourceCanvasId);
      if (!isCurrent()) return false;
      if (!loaded) throw new Error('来源现场暂不可读取，请重试');
      const currentNodeIds = new Set(useCanvasStore.getState().nodes.map(node => node.id));
      const restored = new Set(context.selectedNodeIds.filter(id => currentNodeIds.has(id)));
      for (const ref of context.sourceEntityRefs ?? []) {
        if (currentNodeIds.has(ref.nodeId)) { restored.add(ref.nodeId); continue; }
        const rebound = await waitForProjectedEntity({ projectId, canvasId: context.sourceCanvasId,
          entityType: ref.entityType, entityId: ref.entityId, timeoutMs: 5000 });
        if (!isCurrent() || useCanvasStore.getState().canvasId !== context.sourceCanvasId) return false;
        if (rebound !== undefined) restored.add(rebound);
      }
      if (!isCurrent() || useCanvasStore.getState().canvasId !== context.sourceCanvasId) return false;
      useCanvasStore.getState().selectNodes([...restored]);
    }
    if (!isCurrent()) return false;
    if (context?.projectId === projectId) useLcosShellStore.getState().clearChildNavigation();
    const surface = context?.projectId === projectId ? context.sourceSurface : 'main';
    const query = context?.projectId === projectId && context.sourceWasChild && context.sourceWorkspaceId !== undefined
      ? `?workspaceId=${encodeURIComponent(context.sourceWorkspaceId)}` : '';
    navigate(`/projects/${encodeURIComponent(projectId)}/${surface}${query}`, { replace: true });
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    throw error;
  } finally {
    if (transitionId !== undefined && isCurrent()) useLcosShellStore.getState().consumeWorksiteCameraTransition(transitionId);
  }
}
