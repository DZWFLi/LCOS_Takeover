import { coreRequest } from '@local-creative-os/web-gen2';

import type { ProjectNavigationIndex } from './projectNavigationIndex';
import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { PresentationViewV0, ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { CoreCollectionMembership } from '@local-creative-os/web-gen2';

export interface NavigationEntityIdentity { readonly entityType: string; readonly entityId: string; readonly artifactViewId?: string }
export const navigationEntityKey = (ref: NavigationEntityIdentity): string => JSON.stringify([ref.entityType, ref.entityId]);
export function navigationMemberMatches(target: NavigationEntityIdentity, member: NavigationEntityIdentity): boolean {
  if (target.entityType === 'view' || target.entityType === 'artifactView') return target.entityId === member.artifactViewId
    || (target.entityType === member.entityType && target.entityId === member.entityId);
  return navigationEntityKey(target) === navigationEntityKey(member);
}
export interface SemanticNavigationLocation extends NavigationEntityIdentity {
  readonly key: string;
  readonly label: string;
  readonly members: readonly NavigationEntityIdentity[];
  readonly unresolvedViewIds?: readonly string[];
}

/** Resolve canonical view membership into its existing Artifact identity, never
 * treating a view ID as an Artifact or reading legacy position as geometry. */
export function navigationMemberIdentity(graph: ProjectGraphSnapshot, type: string, id: string): NavigationEntityIdentity | undefined {
  if (type === 'view' || type === 'artifactView') {
    const view = graph.artifactViews.find(item => String(item.id) === id);
    return view ? { entityType: 'artifact', entityId: String(view.artifactId), artifactViewId: id } : undefined;
  }
  return { entityType: type, entityId: id };
}

function uniqueMembers(members: readonly (NavigationEntityIdentity | undefined)[]): NavigationEntityIdentity[] {
  return [...new Map(members.filter((item): item is NavigationEntityIdentity => item !== undefined)
    .map(item => [JSON.stringify([item.entityType,item.entityId,item.artifactViewId]), item])).values()];
}

export function semanticNavigationLocations(projectId: string, graph: ProjectGraphSnapshot,
  presentations: readonly PresentationViewV0[], collectionMembers: readonly CoreCollectionMembership[]): SemanticNavigationLocation[] {
  if (String(graph.project.id) !== projectId) return [];
  const locations: SemanticNavigationLocation[] = [];
  for (const presentation of presentations) {
    if (presentation.projectId !== projectId) continue;
    const scope = graph.scopes.find(item => String(item.id) === presentation.scopeId && String(item.projectId) === projectId
      && item.kind === presentation.capability && (item.kind === 'context' || item.kind === 'workflow'));
    if (!scope) continue;
    const members = uniqueMembers([
      ...presentation.state.memberViewIds.map(id => navigationMemberIdentity(graph, 'view', id)),
      ...(presentation.state.memberEntityRefs ?? []).map(ref => navigationMemberIdentity(graph, ref.type, ref.id)),
    ]);
    const viewIds = [...presentation.state.memberViewIds,
      ...(presentation.state.memberEntityRefs ?? []).filter(ref => ref.type === 'view').map(ref => ref.id)];
    const unresolvedViewIds = [...new Set(viewIds.filter(id => !graph.artifactViews.some(view => String(view.id) === id)))];
    locations.push({ key: `presentation:${presentation.id}`, entityType: 'scope', entityId: String(scope.id), label: scope.name, members,
      ...(unresolvedViewIds.length ? { unresolvedViewIds } : {}) });
  }
  for (const collection of graph.collections ?? []) {
    if (String(collection.projectId) !== projectId) continue;
    const id = String(collection.id);
    locations.push({ key: `collection:${id}`, entityType: 'collection', entityId: id, label: collection.title,
      members: uniqueMembers(collectionMembers.filter(item => String(item.collectionId) === id)
        .map(item => navigationMemberIdentity(graph, item.memberRef.type, item.memberRef.id))) });
  }
  for (const workspace of graph.workspaces) {
    if (String(workspace.projectId) !== projectId) continue;
    const id = String(workspace.id);
    const members = uniqueMembers([
      ...(graph.workspaceMemberships ?? []).filter(item => String(item.workspaceId) === id)
        .map(item => navigationMemberIdentity(graph, 'view', String(item.artifactViewId))),
      ...(graph.workspaceEntityMemberships ?? []).filter(item => String(item.workspaceId) === id)
        .map(item => navigationMemberIdentity(graph, item.entityType, item.entityId)),
    ]);
    if (members.length) locations.push({ key: `workspace-members:${id}`, entityType: 'workspace', entityId: id, label: workspace.name, members });
  }
  return locations;
}

/** Existing Presentation and Collection readers. Each failed path is reported
 * without erasing valid physical occurrences or another membership source. */
export async function readSemanticNavigationLocations(session: Pick<LcosCoreSession, 'http' | 'collections'>,
  projectId: string, index: ProjectNavigationIndex, signal?: AbortSignal): Promise<{
    readonly locations: readonly SemanticNavigationLocation[]; readonly issues: readonly string[];
  }> {
  if (!index.graph) return { locations: [], issues: index.issues };
  const graph = index.graph;
  const readCollectionMembers = async (): Promise<{ members: readonly CoreCollectionMembership[]; issues: readonly string[] }> => {
    if (graph.collectionMemberships !== undefined) return { members: graph.collectionMemberships, issues: [] };
    const results = await Promise.allSettled(index.collections.map(item => session.collections.members(projectId,item.id,signal)));
    return { members: results.flatMap(result => result.status === 'fulfilled' ? result.value.members : []),
      issues: results.flatMap((result,i) => result.status === 'rejected' ? [`集合「${index.collections[i]?.title ?? '原集合'}」成员读取失败`] : []) };
  };
  const [presentationRead, memberRead] = await Promise.allSettled([
    Promise.resolve().then(() => coreRequest<readonly PresentationViewV0[]>(session.http, 'GET',
      `/projects/${encodeURIComponent(projectId)}/presentations`, { signal })),
    readCollectionMembers(),
  ]);
  if (signal?.aborted) throw new DOMException('Navigation read cancelled', 'AbortError');
  const issues = [...index.issues];
  if (presentationRead.status === 'rejected') issues.push('上下文与工作流成员读取失败');
  if (memberRead.status === 'rejected') issues.push('集合成员读取失败');
  else issues.push(...memberRead.value.issues);
  // Collections use their authoritative list identity even if a concurrent graph
  // snapshot predates the collection creation; no legacy Scope substitution.
  const collections = index.collections.map(item => ({ ...item,
    id: item.id as NonNullable<ProjectGraphSnapshot['collections']>[number]['id'],
    projectId: item.projectId as ProjectGraphSnapshot['project']['id'],
    createdAt: item.createdAt as ProjectGraphSnapshot['project']['createdAt'],
    updatedAt: item.updatedAt as ProjectGraphSnapshot['project']['updatedAt'],
  }));
  return { locations: semanticNavigationLocations(projectId, { ...graph, collections },
    presentationRead.status === 'fulfilled' ? presentationRead.value : [],
    memberRead.status === 'fulfilled' ? memberRead.value.members : []), issues };
}
