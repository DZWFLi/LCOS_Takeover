import { useMemo } from 'react';
import type { AssemblyTargetRefV1 } from '../../lcos/packages/contracts/src/index.ts';
import { portalDropTargetForCanvas, usePortalDropWorkspaceContext, type PortalDropWorkspaceContextValue } from '../../lcos/huabu/apps/web/src/lcos/drop/PortalDropWorkspaceContext.tsx';
import { surfaceDockDropSemantic } from '../../lcos/huabu/apps/web/src/lcos/shell/surfaceDockDrop.ts';
import { useLcosShellStore, type LcosSurfaceKey } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';

/** Translate only the original host boundary. Surface/Scene membership remains
 * owned by the existing Core channels; no inferred Scope or copied membership. */
export function nativeWorksiteDropTarget(input: {
  readonly projectId: string | null;
  readonly canvasId: string | null;
  readonly activeSurface: LcosSurfaceKey;
  readonly activeWorkspaceId: string | null;
  readonly surfaceCanvasId: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly context: PortalDropWorkspaceContextValue | null;
}): AssemblyTargetRefV1 | undefined {
  const { projectId, canvasId, activeSurface, activeWorkspaceId, surfaceCanvasId, context } = input;
  if (!projectId || !canvasId || !activeWorkspaceId || context?.projectId !== projectId) return undefined;
  const matches = context.workspaces.filter(workspace => workspace.canvasId === canvasId);
  if (matches.length !== 1 || matches[0]?.id !== activeWorkspaceId) return undefined;
  // An explicitly addressed child workspace keeps its original working set.
  // A missing root map is unresolved, not permission to guess a child target.
  const rootCanvasId = surfaceCanvasId[activeSurface];
  if (!rootCanvasId) return undefined;
  if (canvasId !== rootCanvasId) {
    const child = portalDropTargetForCanvas(context, canvasId, activeWorkspaceId);
    return child?.targetSurface === activeSurface ? child.targetRef : undefined;
  }
  const semantic = surfaceDockDropSemantic(projectId, activeSurface, canvasId, context);
  return semantic.kind === 'spatial-membership' ? semantic.targetRef : undefined;
}

export function useNativeWorksiteDropTarget(projectId: string | null, canvasId: string | null,
  activeSurface: LcosSurfaceKey, activeWorkspaceId: string | null): AssemblyTargetRefV1 | undefined {
  const context = usePortalDropWorkspaceContext();
  const surfaceCanvasId = useLcosShellStore(state => state.surfaceCanvasId);
  return useMemo(() => nativeWorksiteDropTarget({ projectId, canvasId, activeSurface,
    activeWorkspaceId, surfaceCanvasId, context }),
  [projectId, canvasId, activeSurface, activeWorkspaceId, surfaceCanvasId, context]);
}
