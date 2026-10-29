import type { ProjectGraphSnapshot, PresentationViewV0, WarehouseItemV1, ConnectedConversationV1, RunCanvasProjection } from '../../lcos/packages/contracts/src/index';
import type { Workspace } from '../../lcos/packages/domain/src/index';
import type { NativeMaterialViewRequest } from './native-material-viewer-port';

export type NativeScopeMember = { key: string; title: string } & (
  | { kind: 'material'; target: NativeMaterialViewRequest }
  | { kind: 'scope'; item: WarehouseItemV1 }
  | { kind: 'collection'; item: WarehouseItemV1 }
  | { kind: 'note'; noteId: string; updatedAt: string }
  | { kind: 'conversation'; conversationId: string }
  | { kind: 'run'; runId: string }
  | { kind: 'workspace'; workspace: Workspace }
  | { kind: 'unavailable'; reason: string }
);

/** Read projection only. Whole Scope members remain whole; no fake Views or
 * memberships are created to let the original preview browse their contents. */
export function nativeLibraryScopeMembers(projectId: string, item: WarehouseItemV1, graph: ProjectGraphSnapshot,
  presentations: readonly PresentationViewV0[], workspaces: readonly Workspace[], conversations: readonly ConnectedConversationV1[] | null = [], runs: readonly RunCanvasProjection[] | null = []): readonly NativeScopeMember[] {
  const scopes = graph.scopes.filter(scope => String(scope.projectId) === projectId && String(scope.id) === item.entityRef.id && scope.kind === item.kind);
  if (String(graph.project.id) !== projectId || scopes.length !== 1) throw new Error('内容来源已变化，请重新读取。');
  const rows = presentations.filter(row => row.projectId === projectId && row.scopeId === item.entityRef.id && row.capability === item.kind);
  if (item.kind === 'context' && (rows.length !== 1 || rows[0].id !== `presentation:context:${item.entityRef.id}`))
    throw new Error('这份上下文的内容暂时无法确认，请重新读取。');
  const refs: { type: string; id: string }[] = [];
  for (const row of rows) {
    const operators = row.state.workflowOperators ?? {};
    refs.push(...row.state.memberViewIds.filter(id=>!(id in operators)||graph.artifactViews.some(view=>String(view.id)===id)).map(id => ({ type: 'view', id })),
      ...(row.state.memberEntityRefs ?? []));
    if (item.kind === 'workflow') {
      for (const action of row.state.workflowActions ?? []) refs.push(...action.attachedViewIds.map(id => ({ type: 'view', id })));
      for (const operator of Object.values(operators)) for (const branch of operator.branches ?? [])
        if (branch.targetViewId) refs.push({ type: 'view', id: branch.targetViewId });
    }
  }
  const seen = new Set<string>();
  return refs.filter(ref => { const key = JSON.stringify([ref.type, ref.id]); if (seen.has(key)) return false; seen.add(key); return true; })
    .map(ref => nativeLibraryMember(projectId, ref, graph, workspaces, conversations, runs));
}

/** One read projection for both Scope refs and canonical Collection members.
 * Collection Artifact members deliberately read current; saved Views stay exact. */
export function nativeLibraryMember(projectId: string, ref: { type: string; id: string }, graph: ProjectGraphSnapshot,
  workspaces: readonly Workspace[], conversations: readonly ConnectedConversationV1[] | null = [], runs: readonly RunCanvasProjection[] | null = []): NativeScopeMember {
    if (String(graph.project.id) !== projectId) throw new Error('内容来源已变化，请重新读取。');
    const key = JSON.stringify([ref.type, ref.id]);
    const unavailable = (title: string, reason: string): NativeScopeMember => ({ key, title, kind: 'unavailable', reason });
    if (ref.type === 'view' || ref.type === 'artifact') {
      const views = graph.artifactViews.filter(view => String(view.id) === ref.id);
      const view = views.length === 1 ? views[0] : undefined;
      const artifacts = graph.artifacts.filter(artifact => String(artifact.id) === (ref.type === 'artifact' ? ref.id : String(view?.artifactId)) && String(artifact.projectId) === projectId);
      const artifact = artifacts.length === 1 ? artifacts[0] : undefined;
      // Never substitute Current when the saved View/revision cannot be read.
      const revisions = graph.artifactRevisions.filter(revision => String(revision.id) === String(ref.type === 'artifact' ? artifact?.currentRevisionId : view?.revisionId ?? artifact?.currentRevisionId)
        && String(revision.artifactId) === String(artifact?.id));
      const revision = revisions.length === 1 ? revisions[0] : undefined;
      const files = graph.fileRecords.filter(file => String(file.id) === String(revision?.fileRecordId) && String(file.projectId) === projectId);
      if (ref.type === 'view' && (!view || !graph.scopes.some(scope => String(scope.id) === String(view.scopeId) && String(scope.projectId) === projectId))
        || !artifact || !revision || files.length !== 1)
        return unavailable(artifact?.title ?? '原材料', '所存版本暂不可读取，未换用其他版本');
      return { key, title: artifact.title, kind: 'material', target: { projectId, artifactId: String(artifact.id),
        ...(view && ref.type === 'view' ? { artifactViewId: String(view.id) } : {}), revisionId: String(revision.id), title: artifact.title } };
    }
    if (ref.type === 'scope') {
      const matches = graph.scopes.filter(scope => String(scope.id) === ref.id && String(scope.projectId) === projectId);
      const scope = matches.length === 1 ? matches[0] : undefined;
      if (!scope) return unavailable('关联内容', '来源暂不可读取，请重新读取后再试');
      if (scope.kind !== 'context' && scope.kind !== 'workflow') return unavailable(scope.name, '这种关联内容的原页面入口尚未接通');
      return { key, title: scope.name, kind: 'scope', item: { schemaVersion: 1, kind: scope.kind,
        entityRef: { type: scope.kind, id: String(scope.id) }, title: scope.name, updatedAt: scope.updatedAt,
        usageCount: workspaces.filter(workspace => String(workspace.projectId) === projectId && String(workspace.scopeId) === ref.id).length } };
    }
    if (ref.type === 'collection') {
      const matches = graph.collections?.filter(row => String(row.id) === ref.id && String(row.projectId) === projectId) ?? [];
      if (matches.length !== 1) return unavailable('集合', '原集合暂不可读取，请重新读取后再试');
      return { key, title: matches[0].title, kind: 'collection', item: { schemaVersion: 1, kind: 'collection', entityRef: { type: 'collection', id: ref.id },
        title: matches[0].title, updatedAt: matches[0].updatedAt, usageCount: 0 } };
    }
    if (ref.type === 'note') {
      const matches = (graph.notes ?? []).filter(row => String(row.id) === ref.id && String(row.projectId) === projectId);
      const note = matches.length === 1 ? matches[0] : undefined;
      if (!note || typeof note.body !== 'string') return unavailable('附注', '原附注暂不可读取，请重新读取后再试');
      return { key, title: note.body.split('\n').find(line => line.trim())?.slice(0, 72).trim() || '空白附注', kind: 'note', noteId: ref.id, updatedAt: note.updatedAt };
    }
    if (ref.type === 'conversation') {
      if (!conversations) return unavailable('对话', '对话列表暂时无法读取，请重新读取；原成员保留');
      const matches = conversations.filter(row => row.id === ref.id && row.projectId === projectId);
      if (matches.length !== 1) return unavailable('对话', '原对话暂不可读取，请重新读取后再试');
      return { key, title: matches[0].label, kind: 'conversation', conversationId: ref.id };
    }
    if (ref.type === 'run') {
      if (!runs) return unavailable('任务', '任务列表暂时无法读取，请重新读取；原成员保留');
      const matches = runs.filter(row => String(row.id) === ref.id);
      if (matches.length !== 1 || String(matches[0].projectId) !== projectId)
        return unavailable('任务', '原任务暂时无法读取，请重新读取；未换用其他任务');
      return { key, title: matches[0].title?.trim() || '任务', kind: 'run', runId: ref.id };
    }
    if (ref.type === 'workspace') {
      const matches = workspaces.filter(row => String(row.id) === ref.id && String(row.projectId) === projectId);
      if (matches.length !== 1 || !matches[0].canvasId) return unavailable(matches[0]?.name ?? '工作现场', '原现场地址暂不可读取，请重新读取后再试');
      return { key, title: matches[0].name, kind: 'workspace', workspace: matches[0] };
    }
    return unavailable('关联内容', '这项内容的原页面入口尚未接通，原成员保留');
}
