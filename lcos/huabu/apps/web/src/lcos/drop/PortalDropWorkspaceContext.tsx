import { createContext, useContext, useMemo } from 'react';

import { resolvePortalAddress } from '../navigation/portalIdentity';

import type { Workspace } from '@local-creative-os/domain';

export interface PortalDropWorkspace {
  readonly id: string;
  readonly scopeId?: string;
  readonly name: string;
  readonly canvasId?: string;
  readonly preferredSurface?: string;
}

export interface PortalDropWorkspaceContextValue {
  readonly projectId?: string;
  readonly workspaces: readonly PortalDropWorkspace[];
  readonly mainCanvasId?: string;
  readonly ensureWorkspaceCanvas?: (workspaceId: string) => Promise<string | undefined>;
}

const PortalDropWorkspaceContext = createContext<PortalDropWorkspaceContextValue | null>(null);

export function PortalDropWorkspaceProvider({
  workspaces,
  projectId,
  mainCanvasId,
  ensureWorkspaceCanvas,
  children,
}: PortalDropWorkspaceContextValue & { readonly children: React.ReactNode }): React.JSX.Element {
  const value = useMemo(() => ({ workspaces, projectId, ...(mainCanvasId === undefined ? {} : { mainCanvasId }),
    ...(ensureWorkspaceCanvas === undefined ? {} : { ensureWorkspaceCanvas }) }), [workspaces, projectId, mainCanvasId, ensureWorkspaceCanvas]);
  return <PortalDropWorkspaceContext.Provider value={value}>
    {children}
  </PortalDropWorkspaceContext.Provider>;
}

export function usePortalDropWorkspaceContext(): PortalDropWorkspaceContextValue | null {
  return useContext(PortalDropWorkspaceContext);
}

export function portalDropTargetForCanvas(
  context: PortalDropWorkspaceContextValue | null, canvasId: string | undefined, pinnedWorkspaceId?: string,
) {
  return context === null ? undefined : resolvePortalAddress(context.projectId,context.workspaces,canvasId,pinnedWorkspaceId);
}

export function toPortalDropWorkspaces(workspaces: readonly Workspace[]): readonly PortalDropWorkspace[] {
  return workspaces.map((workspace) => ({
    id: String(workspace.id),
    scopeId: String(workspace.scopeId),
    name: workspace.name,
    preferredSurface: workspace.preferredSurface,
    ...(workspace.canvasId === undefined ? {} : { canvasId: workspace.canvasId }),
  }));
}
