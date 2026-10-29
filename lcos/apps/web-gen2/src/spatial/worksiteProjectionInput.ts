import type { PresentationViewV0, ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';
import type { CoreProjectClient } from '../backend/projects.js';

function presentationAddress(workspace: Workspace | undefined, scopeKind?: string) {
  if (!workspace || !String(workspace.scopeId).trim()) return undefined;
  const surface = workspace.preferredSurface ?? (scopeKind === 'context' || scopeKind === 'workflow' ? scopeKind : undefined);
  if (surface !== 'main' && surface !== 'context' && surface !== 'workflow') return undefined;
  const capability = surface === 'workflow' ? 'workflow' : 'context';
  return { scopeId: String(workspace.scopeId), capability,
    id: `presentation:${capability}:${workspace.scopeId}` };
}

/** Production read for the two existing worksite consumers. Only old graph-only
 * ports lacking this method use the legacy path; real read failures propagate. */
export async function readWorksitePresentations(projects: Pick<CoreProjectClient, 'listPresentations'>,
  projectId: string, graph: ProjectGraphSnapshot | undefined, canvasId: string): Promise<readonly PresentationViewV0[] | undefined> {
  if (typeof projects.listPresentations !== 'function') return undefined;
  if (!graph) return [];
  const matches = graph.workspaces.filter(workspace => workspace.canvasId === canvasId);
  const workspace = matches.length === 1 ? matches[0] : undefined;
  const scope = graph.scopes.find(scope => String(scope.id) === String(workspace?.scopeId));
  if (!workspace || String(workspace.projectId) !== projectId || !scope
    || String(scope.projectId) !== projectId) throw new Error('当前画布尚未确认唯一的项目工作现场与 Presentation 地址。');
  const address = presentationAddress(workspace, scope.kind);
  if (!address) {
    console.warn('[lcos] 此旧现场未声明 Surface，保留既有 Graph 读取；未猜测 root 的三个 Presentation 能力。', { workspaceId: workspace.id });
    return undefined;
  }
  const presentations = await projects.listPresentations(projectId);
  return presentations.filter(presentation => presentation.projectId === projectId
    && presentation.id === address.id && presentation.scopeId === address.scopeId && presentation.capability === address.capability);
}

/** Selection for NEW projections, using existing canonical working-set refs.
 * Does not remove existing projections, create memberships or copy Core x/y.
 * An explicitly received view wins over scope fallback, retaining its revision. */
export function worksiteProjectionInput(graph: ProjectGraphSnapshot | undefined, workspace: Workspace | undefined,
  presentations?: readonly PresentationViewV0[]) {
  const scope = graph?.scopes?.find((s) => String(s.id) === String(workspace?.scopeId));
  const root = !workspace || scope?.kind === 'root' && (presentations === undefined || workspace.preferredSurface === 'main');
  const address = presentationAddress(workspace, scope?.kind);
  const projectId = String(workspace?.projectId ?? graph?.project?.id ?? '');
  const matching = presentations?.filter(presentation => presentation.projectId === projectId && presentation.id === address?.id
    && presentation.scopeId === address?.scopeId && presentation.capability === address?.capability) ?? [];
  const presentation = matching.length === 1 ? matching[0] : undefined;
  const received = new Set(presentation?.state.memberViewIds ?? []);
  const views = graph?.artifactViews ?? [];
  const memberships = graph?.workspaceMemberships;
  const focused = new Set(workspace?.focusedViewIds.map(String) ?? []);
  const explicit = new Set((memberships ?? []).filter((m) => String(m.workspaceId) === String(workspace?.id)).map((m) => String(m.artifactViewId)));
  const eligibleViews = root ? (workspace ? views.filter((v) => received.has(String(v.id)) || explicit.has(String(v.id)) || focused.has(String(v.id)) || String(v.scopeId) === String(workspace.scopeId)) : views)
    : views.filter((v) => received.has(String(v.id)) || explicit.has(String(v.id)) || focused.has(String(v.id))
      || scope?.kind !== 'root' && String(v.scopeId) === String(workspace?.scopeId));
  // No hierarchy guess: a view explicitly present in the working set can be from another scope.
  const preferredViews = new Set([...received, ...explicit, ...focused]);
  // Older read-only graph clients omitted BOTH fields altogether. Preserve
  // their previous projection behavior; an explicit empty field in the new
  // graph is authoritative and must never fall back to every project artifact.
  const legacyGraph = graph !== undefined && !Array.isArray(graph.artifactViews) && !Array.isArray(graph.workspaceMemberships);
  const artifactIds = root || legacyGraph ? undefined : new Set(eligibleViews.map((v) => String(v.artifactId)));
  const noteIds = new Set([...(graph?.workspaceEntityMemberships ?? [])
    .filter((m) => String(m.workspaceId) === String(workspace?.id) && m.entityType === 'note').map((m) => String(m.entityId)),
    ...(presentation?.state.memberEntityRefs ?? []).filter(ref => ref.type === 'note').map(ref => ref.id)]);
  const conversationIds = new Set([...(graph?.workspaceEntityMemberships ?? [])
    .filter(m => String(m.workspaceId) === String(workspace?.id) && m.entityType === 'conversation').map(m => String(m.entityId)),
    ...(presentation?.state.memberEntityRefs ?? []).filter(ref => ref.type === 'conversation').map(ref => ref.id)]);
  const scopeIds = new Set([...(graph?.workspaceEntityMemberships ?? [])
    .filter(m => String(m.workspaceId) === String(workspace?.id) && m.entityType === 'scope').map(m => String(m.entityId)),
    ...(presentation?.state.memberEntityRefs ?? []).filter(ref => ref.type === 'scope').map(ref => ref.id)]);
  const workspaceIds = new Set([...(graph?.workspaceEntityMemberships ?? [])
    .filter(m => String(m.workspaceId) === String(workspace?.id) && m.entityType === 'workspace').map(m => String(m.entityId)),
    ...(presentation?.state.memberEntityRefs ?? []).filter(ref => ref.type === 'workspace').map(ref => ref.id)]);
  return {root, views: eligibleViews, preferredViews, receivedViewIds: received, artifactIds,
    conversationIds, scopeIds, workspaceIds,
    notes: (graph?.notes ?? []).filter((n) => (!root || presentation !== undefined) && noteIds.has(String(n.id)))};
}
