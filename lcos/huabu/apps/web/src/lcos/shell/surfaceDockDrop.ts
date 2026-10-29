import type { LcosSurfaceKey } from './lcosShellStore';
import type { DropTargetSemantic } from '../drop/dropTypes';
import type { PortalDropWorkspaceContextValue } from '../drop/PortalDropWorkspaceContext';

/** Navigation and receiving use the same Core worksite mapping. A label is
 * never an address, and the root Main target is not an active-workspace alias. */
export function surfaceDockDropSemantic(projectId: string, surface: LcosSurfaceKey,
  canvasId: string | undefined, context: PortalDropWorkspaceContextValue | null): DropTargetSemantic {
  const unavailable = (reason: string): DropTargetSemantic => ({ kind: 'drop-exclusion', reason });
  if (!canvasId) return unavailable('现场画布尚未建立；先进入此现场后即可接收。');
  if (context?.projectId !== projectId) return unavailable('此项目的现场地址尚未就绪。');
  const matches = context.workspaces.filter((workspace) => workspace.canvasId === canvasId);
  if (matches.length !== 1 || !matches[0]?.id.trim())
    return unavailable('此现场尚未确认唯一的真实工作现场地址。');
  const workspace = matches[0];
  if (workspace.preferredSurface !== surface)
    return unavailable('工作现场与此入口的类型尚未匹配。');
  if (surface === 'main') return { kind: 'spatial-membership', targetRef: { kind: 'main' } };
  if (!workspace.scopeId?.trim()) return unavailable('此现场的真实上下文或工作流地址尚未就绪。');
  return { kind: 'spatial-membership', targetRef: { kind: surface, id: workspace.scopeId } };
}
