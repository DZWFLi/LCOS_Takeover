import type { LcosSurfaceKey } from '../shell/lcosShellStore';
export interface OccurrenceWorkspace {
  readonly id: string;
  readonly canvasId?: string;
  readonly name: string;
  readonly preferredSurface?: string;
}
export interface OccurrenceDestination {
  readonly canvasId: string;
  readonly workspaceId?: string;
  readonly surface: LcosSurfaceKey;
  readonly label: string;
}
export function resolveOccurrenceDestination(
  canvasId: string,
  workspaces: readonly OccurrenceWorkspace[],
  roots: Readonly<Partial<Record<LcosSurfaceKey, string>>>,
): OccurrenceDestination | undefined {
  const root = (Object.entries(roots) as [LcosSurfaceKey, string][]).find(([, id]) => id === canvasId)?.[0];
  const candidates = workspaces.filter((workspace) => workspace.canvasId === canvasId);
  // A canonical Surface root already resolves the route. Workspace aliases on
  // that canvas must not disable its existing occurrences or invent a child.
  if (root !== undefined) return { canvasId, surface: root, label: candidates.length === 1 ? candidates[0].name : ({ main: '主画布', context: '上下文', workflow: '工作流' }[root]) };
  if (candidates.length > 1) return undefined;
  const workspace = candidates[0];
  const surface = workspace?.preferredSurface;
  if (workspace === undefined || (surface !== 'main' && surface !== 'context' && surface !== 'workflow')) return undefined;
  return { canvasId, workspaceId: String(workspace.id), surface, label: workspace.name };
}
