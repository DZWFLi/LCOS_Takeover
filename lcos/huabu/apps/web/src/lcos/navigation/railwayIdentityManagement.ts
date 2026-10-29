import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { RailwayDestinationV1, RailwayStoredRefV1 } from '@local-creative-os/contracts';

type RailwayIdentityPort={readonly projects:Pick<LcosCoreSession['projects'],'getProjectGraph'|'applyGraphMutations'>};

/** Only capabilities with an existing canonical producer are advertised.
 * Collection CRUD and Scope delete have no public producer in this Core. */
export function railwayIdentityCapabilities(destination: RailwayDestinationV1): { rename: boolean; remove: boolean } {
  return { rename: destination.available && (destination.ref.kind === 'worksite'
      || (destination.ref.kind === 'spatial' && destination.ref.entityType === 'scope')),
    remove: destination.available && destination.ref.kind === 'worksite' };
}
export async function renameRailwayIdentity(session: RailwayIdentityPort, projectId: string,
  ref: RailwayStoredRefV1, name: string): Promise<void> {
  const title = name.trim(); if (!title || ref.projectId !== projectId) throw new Error('空间名称或项目身份无效。');
  const graph = await session.projects.getProjectGraph(projectId);
  if (!graph || String(graph.project.id) !== projectId) throw new Error('项目读取失败，原名称保留。');
  if (ref.kind === 'worksite') {
    const matches = graph.workspaces.filter(item => String(item.id) === ref.worksiteId && String(item.projectId) === projectId);
    const workspace = matches.length === 1 ? matches[0] : undefined;
    if (!workspace) throw new Error('原现场已变化，未更名。');
    await session.projects.applyGraphMutations(projectId,{ baseVersion: graph.graphVersion, actorKind: 'user',
      ops: [{ type: 'upsert_workspace', workspace: { ...workspace,name: title,updatedAt:new Date().toISOString() as typeof workspace.updatedAt } }] });
  } else if (ref.kind === 'spatial' && ref.entityType === 'scope') {
    const matches = graph.scopes.filter(item => String(item.id) === ref.entityId && String(item.projectId) === projectId);
    const scope = matches.length === 1 ? matches[0] : undefined;
    if (!scope || (scope.kind !== 'context' && scope.kind !== 'workflow')) throw new Error('原上下文或工作流已变化，未更名。');
    await session.projects.applyGraphMutations(projectId,{ baseVersion: graph.graphVersion, actorKind: 'user',
      ops: [{ type: 'upsert_scope', scope: { ...scope,name: title,updatedAt:new Date().toISOString() as typeof scope.updatedAt } }] });
  } else throw new Error('这个类型尚未提供更名能力，原对象保留。');
}
export async function removeRailwayWorkspace(session: RailwayIdentityPort, projectId: string,
  ref: RailwayStoredRefV1): Promise<void> {
  if (ref.kind !== 'worksite' || ref.projectId !== projectId) throw new Error('这里只移除真实工作现场，不删除集合或上下文。');
  const graph = await session.projects.getProjectGraph(projectId);
  if (!graph || String(graph.project.id) !== projectId) throw new Error('项目读取失败，现场保留。');
  const matches = graph.workspaces.filter(item => String(item.id) === ref.worksiteId && String(item.projectId) === projectId);
  const workspace = matches.length === 1 ? matches[0] : undefined;
  if (!workspace) throw new Error('原现场已变化，未移除。');
  if (graph.scopes.some(scope => scope.id === workspace.scopeId && scope.kind === 'root')) throw new Error('根工作面保留；只能移除独立工作现场。');
  await session.projects.applyGraphMutations(projectId,{ baseVersion: graph.graphVersion, actorKind: 'user',
    ops: [{ type: 'delete_workspace', workspaceId: workspace.id }] });
}
