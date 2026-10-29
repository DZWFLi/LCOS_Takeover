import type { PresentationStateV0, ProjectGraphSnapshot } from '../../lcos/packages/contracts/src/index';

export type WorkflowMaterial = { id: string; title: string; detail: string; available: boolean };
/** Read existing project views and exact revisions. Selecting one never clones it. */
export function workflowMaterialCatalog(graph: ProjectGraphSnapshot): WorkflowMaterial[] {
  return graph.artifactViews.map(view => {
    const artifact = graph.artifacts.find(a => a.id === view.artifactId);
    const revision = graph.artifactRevisions.find(r => r.id === (view.revisionId ?? artifact?.currentRevisionId) && r.artifactId === artifact?.id);
    const file = graph.fileRecords.find(f => f.id === revision?.fileRecordId);
    const scope = graph.scopes.find(s => s.id === view.scopeId);
    const readable = !!artifact && String(artifact.projectId) === String(graph.project.id) && !!revision && !!file;
    const available = readable && artifact.archivedAt === undefined;
    return { id: String(view.id), title: artifact?.title || '未命名材料',
      detail: [scope?.name, view.revisionId ? '固定版本' : '当前版本', !readable ? '材料或版本暂不可用' : artifact?.archivedAt ? '已归档，现有引用保留' : ''].filter(Boolean).join(' · '), available };
  });
}

/** Only remove local membership and its dependent view references. Other
 * materials, workspaces, entities and geometry are not changed. */
export function withWorkflowMaterials(state: PresentationStateV0, memberViewIds: string[]): PresentationStateV0 {
  const next = structuredClone(state), removed = new Set(state.memberViewIds.filter(id => !memberViewIds.includes(id)));
  next.memberViewIds = [...memberViewIds];
  if (!removed.size) return next;
  const keep = (id: string) => !removed.has(id);
  const entries = <T,>(value: Record<string, T>) => Object.fromEntries(Object.entries(value).filter(([id]) => keep(id)));
  next.hiddenViewIds = next.hiddenViewIds.filter(keep);
  next.pinnedViewIds = next.pinnedViewIds.filter(keep);
  next.positions = entries(next.positions);
  next.emphasisByViewId = entries(next.emphasisByViewId);
  if (next.gridLayout) next.gridLayout.order = next.gridLayout.order.filter(keep);
  const promoted=Object.entries(next.hierarchy.parentByViewId).filter(([id,parent])=>keep(id)&&parent!==null&&removed.has(parent)).map(([id])=>id);
  next.hierarchy.parentByViewId = Object.fromEntries(Object.entries(next.hierarchy.parentByViewId)
    .filter(([id]) => keep(id)).map(([id, parent]) => [id, parent && removed.has(parent) ? null : parent]));
  next.hierarchy.orderByParent = Object.fromEntries(Object.entries(next.hierarchy.orderByParent)
    .filter(([id]) => keep(id)).map(([id, children]) => [id, children.filter(keep)]));
  if(promoted.length)next.hierarchy.orderByParent['']=[...new Set([...(next.hierarchy.orderByParent['']??[]),...promoted])];
  next.presentationEdges = next.presentationEdges.filter(edge => keep(edge.fromViewId) && keep(edge.toViewId));
  if (next.memberEntityRefs) next.memberEntityRefs = next.memberEntityRefs.filter(ref => ref.type !== 'view' || keep(ref.id));
  for (const colony of next.colonies ?? []) colony.memberIds = colony.memberIds.filter(keep);
  if(next.colonies)next.colonies=next.colonies.filter(colony=>colony.memberIds.length>0);
  for (const segment of next.trackSegments ?? []) segment.memberViewIds = segment.memberViewIds.filter(keep);
  for (const element of next.surfaceElements ?? []) {
    if (element.binding?.projectViewId && removed.has(element.binding.projectViewId)) delete element.binding.projectViewId;
    if (element.binding?.projectViewIds) {
      element.binding.projectViewIds = element.binding.projectViewIds.filter(keep);
      if(!element.binding.projectViewIds.length)delete element.binding.projectViewIds;
    }
  }
  for (const action of next.workflowActions ?? []) action.attachedViewIds = action.attachedViewIds.filter(keep);
  for (const operator of Object.values(next.workflowOperators ?? {})) for (const branch of operator.branches ?? []) {
    if (branch.targetViewId && removed.has(branch.targetViewId)) delete branch.targetViewId;
  }
  return next;
}
