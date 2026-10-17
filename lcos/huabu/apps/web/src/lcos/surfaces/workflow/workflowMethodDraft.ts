import { coreRequest } from '@local-creative-os/web-gen2';

import type { WorkflowHandCard } from './WorkflowCardPool';
import type { LcosCoreSession } from '../../app/lcosCoreClient';
import type { LcosNodeEntityRef } from '../../lcosReferenceState';
import type { PresentationViewV0, ProjectGraphSnapshot } from '@local-creative-os/contracts';

export type WorkflowMethodDraft =
  | { readonly status: 'ready'; readonly prompt: string; readonly references: readonly LcosNodeEntityRef[] }
  | { readonly status: 'unavailable'; readonly reason: string };

export const WORKFLOW_METHOD_UNAVAILABLE = '这张工作流卡没有已保存的方法步骤，仍可进入工作现场或拖放。';

/** Read-only authoring DTO → one unsent Composer method block. This does not
 * execute predicates, create a Skill/file, or send unsupported Scope input. */
export function buildWorkflowMethodDraft(projectId: string, scopeId: string,
  graph: ProjectGraphSnapshot, presentations: readonly PresentationViewV0[]): WorkflowMethodDraft {
  const scope = graph.scopes.find((item) => String(item.id) === scopeId && item.kind === 'workflow');
  if (!scope || String(graph.project.id) !== projectId) return { status: 'unavailable', reason: '工作流身份已变化，请重新读取卡片。' };
  const views = presentations.filter((item) => item.projectId === projectId && item.scopeId === scopeId && item.capability === 'workflow');
  const methods = views.filter((view) => (view.state.workflowActions?.length ?? 0) > 0 || Object.keys(view.state.workflowOperators ?? {}).length > 0);
  if (!methods.length) return { status: 'unavailable', reason: WORKFLOW_METHOD_UNAVAILABLE };
  const text = [`工作流方法：${scope.name}`, `来源 Project：${projectId}`, `来源 Scope：${scopeId}`];
  const viewIds = new Set<string>();
  for (const method of methods) {
    text.push(`来源 Presentation：${method.id} · version ${method.version}`);
    const actions = method.state.workflowActions ?? [];
    const operators = method.state.workflowOperators ?? {};
    const actionNames = new Map(actions.map((action) => [action.id, action.label]));
    for (const action of actions) {
      text.push(`动作：${action.label}${action.description?.trim() ? `\n${action.description}` : ''}`);
      action.attachedViewIds.forEach((id) => viewIds.add(id));
    }
    for (const edge of method.state.workflowActionEdges ?? [])
      text.push(`动作连接：${actionNames.get(edge.fromActionId) ?? edge.fromActionId} → ${actionNames.get(edge.toActionId) ?? edge.toActionId}${edge.label ? `（${edge.label}）` : ''}`);
    for (const [id, operator] of Object.entries(operators)) {
      text.push(`结构标记：${operator.label || id} · ${operator.kind}`);
      for (const branch of operator.branches ?? [])
        text.push(`分支：${branch.label}${branch.predicateText ? `；条件说明：${branch.predicateText}` : ''}${branch.targetViewId ? `；目标：${branch.targetViewId}` : ''}`);
    }
    for (const id of method.state.memberViewIds) if (!(id in operators)) viewIds.add(id);
  }
  const references: LcosNodeEntityRef[] = [];
  for (const viewId of viewIds) {
    const view = graph.artifactViews.find((item) => String(item.id) === viewId);
    const artifact = view ? graph.artifacts.find((item) => item.id === view.artifactId) : undefined;
    const revisionId = view?.revisionId ?? artifact?.currentRevisionId;
    const revision = graph.artifactRevisions.find((item) => item.id === revisionId && item.artifactId === artifact?.id);
    const file = revision ? graph.fileRecords.find((item) => item.id === revision.fileRecordId) : undefined;
    if (!view || !artifact || !revision || !file) return { status: 'unavailable', reason: `方法使用的材料或版本已缺失：${viewId}。原草稿保留。` };
    references.push({ entityType: 'artifact', entityId: String(artifact.id), artifactViewId: viewId,
      revisionId: String(revision.id), mimeType: file.mimeType, displayLabel: artifact.title });
  }
  return { status: 'ready', prompt: text.join('\n\n'), references };
}

/** Use the existing Presentation and Project readers; no new method endpoint. */
export async function readWorkflowMethodDraft(session: Pick<LcosCoreSession, 'http' | 'projects'>,
  projectId: string, card: WorkflowHandCard, signal?: AbortSignal): Promise<WorkflowMethodDraft> {
  if (card.entityType !== 'workflow' || card.workspaceTargetRef?.kind !== 'workflow'
    || card.workspaceTargetRef.entityRef.type !== 'workflow' || card.workspaceTargetRef.entityRef.id !== card.entityId)
    return { status: 'unavailable', reason: '这张卡没有可核对的工作流方法来源。' };
  return readWorkflowScopeMethodDraft(session, projectId, card.entityId, signal);
}

export async function readWorkflowScopeMethodDraft(session: Pick<LcosCoreSession, 'http' | 'projects'>,
  projectId: string, scopeId: string, signal?: AbortSignal): Promise<WorkflowMethodDraft> {
  const [graph, presentations] = await Promise.all([
    session.projects.getProjectGraph(projectId),
    coreRequest<readonly PresentationViewV0[]>(session.http, 'GET', `/projects/${encodeURIComponent(projectId)}/presentations`, { signal }),
  ]);
  if (!graph || signal?.aborted) return { status: 'unavailable', reason: '工作流读取已结束，原草稿保留。' };
  return buildWorkflowMethodDraft(projectId, scopeId, graph, presentations);
}
