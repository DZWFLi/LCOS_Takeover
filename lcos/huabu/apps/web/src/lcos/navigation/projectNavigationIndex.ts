import { railwayStableKeyV1 } from '@local-creative-os/contracts';

import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { ProjectGraphSnapshot, RailwayDestinationV1, RailwaySnapshotV1 } from '@local-creative-os/contracts';
import type { CoreCollectionIdentity } from '@local-creative-os/web-gen2';

export interface ProjectNavigationIndex {
  readonly graph?: ProjectGraphSnapshot;
  readonly collections: readonly CoreCollectionIdentity[];
  readonly destinations: readonly RailwayDestinationV1[];
  readonly issues: readonly string[];
}

/** Real project entities, independent of bookmarks. Mirrors Core's existing
 * spatial reception owners; no Workspace or Canvas is manufactured here. */
export function projectSpatialDestinations(projectId: string, graph: ProjectGraphSnapshot | undefined,
  collections: readonly CoreCollectionIdentity[]): RailwayDestinationV1[] {
  const result: RailwayDestinationV1[] = [];
  const collectionIds = [...new Set(collections.filter(item => item.projectId === projectId).map(item => item.id))];
  for (const id of collectionIds) {
    const matches = collections.filter(item => item.projectId === projectId && item.id === id);
    const ref = { kind: 'spatial' as const, projectId, entityType: 'collection' as const, entityId: id };
    const available = matches.length === 1;
    result.push({ key: railwayStableKeyV1(ref), ref, role: 'spatial', accepts: [], available,
      label: matches[0]?.title || '集合', ...(available ? {
        sourceRef: { kind: 'collection', id }, receiveTarget: { owner: 'collection-membership', collectionId: id },
      } : { reason: '集合身份不唯一，暂不能打开或接收。' }) });
  }
  if (graph && String(graph.project.id) === projectId) {
    const scopes = graph.scopes.filter(item => String(item.projectId) === projectId && (item.kind === 'context' || item.kind === 'workflow'));
    for (const id of new Set(scopes.map(item => String(item.id)))) {
      const matches = scopes.filter(item => String(item.id) === id);
      const scope = matches[0];
      if (!scope || (scope.kind !== 'context' && scope.kind !== 'workflow')) continue;
      const ref = { kind: 'spatial' as const, projectId, entityType: 'scope' as const, entityId: id };
      const available = matches.length === 1;
      result.push({ key: railwayStableKeyV1(ref), ref, role: 'spatial', accepts: [], available, label: scope.name,
        ...(available ? { sourceRef: { kind: scope.kind, id },
          receiveTarget: { owner: 'assembly', targetRef: { kind: scope.kind, id } } }
          : { reason: '现场身份不唯一，暂不能打开或接收。' }) });
    }
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.key.localeCompare(b.key));
}

/** Existing read APIs, with independent failure handling. A failed collection
 * read may use the graph's canonical Collections, never legacy collection Scopes. */
export async function readProjectNavigationIndex(session: Pick<LcosCoreSession, 'projects' | 'collections'>,
  projectId: string, signal?: AbortSignal): Promise<ProjectNavigationIndex> {
  const [graphRead, collectionRead] = await Promise.allSettled([
    Promise.resolve().then(() => session.projects.getProjectGraph(projectId)),
    Promise.resolve().then(() => session.collections.list(projectId, signal)),
  ]);
  if (signal?.aborted) throw new DOMException('Navigation read cancelled', 'AbortError');
  const graph = graphRead.status === 'fulfilled' && graphRead.value && String(graphRead.value.project.id) === projectId
    ? graphRead.value : undefined;
  const issues: string[] = [];
  if (!graph) issues.push('项目空间读取失败');
  if (collectionRead.status === 'rejected') issues.push('集合索引读取失败');
  const collections: readonly CoreCollectionIdentity[] = collectionRead.status === 'fulfilled'
    ? collectionRead.value.filter(item => item.projectId === projectId)
    : (graph?.collections ?? []).filter(item => String(item.projectId) === projectId).map(item => ({
      id: String(item.id), projectId, title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt,
    }));
  return { ...(graph ? { graph } : {}), collections, destinations: projectSpatialDestinations(projectId, graph, collections), issues };
}

/** User order stays canonical. Visible unpinned entities are request-local
 * candidates only; saving/reordering never adds them to orderedRefs. */
export function withProjectSpatialCandidates(snapshot: RailwaySnapshotV1,
  destinations: readonly RailwayDestinationV1[]): RailwaySnapshotV1 {
  const seen = new Set(snapshot.destinations.map(item => item.key));
  const candidates: RailwayDestinationV1[] = [];
  for (const item of [...snapshot.candidates, ...destinations]) {
    if (item.ref.projectId !== snapshot.projectId || seen.has(item.key)) continue;
    seen.add(item.key); candidates.push(item);
  }
  return { ...snapshot, candidates };
}
