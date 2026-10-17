import { resolveOccurrenceDestination } from './resolveOccurrenceDestination';

import type { ProjectNavigationIndex } from './projectNavigationIndex';
import type { LcosSurfaceKey } from '../shell/lcosShellStore';
import type { RailwayDestinationV1, SearchHitVNext } from '@local-creative-os/contracts';

/** UI-only local results. Core SearchHitVNext remains the unchanged five-type
 * retrieval contract; these identities come from existing project readers. */
export interface LocalProjectSearchHit {
  readonly entityType: 'scope' | 'workspace' | 'collection';
  readonly entityId: string;
  readonly title: string;
  readonly snippet: string;
  readonly matchReason: 'title';
  readonly locationCount?: number;
  readonly available: boolean;
  readonly reason?: string;
  readonly destination?: RailwayDestinationV1;
  readonly worksite?: { readonly surface: LcosSurfaceKey; readonly canvasId: string; readonly workspaceId?: string };
}
export type ProjectSearchVisibleHit = SearchHitVNext | LocalProjectSearchHit;
export function isLocalProjectSearchHit(hit: ProjectSearchVisibleHit): hit is LocalProjectSearchHit {
  return hit.entityType === 'scope' || hit.entityType === 'workspace' || hit.entityType === 'collection';
}
function normalize(value: string): string { return value.normalize('NFKC').toLocaleLowerCase().trim(); }
export function projectLocalSearchEntries(index: ProjectNavigationIndex | undefined, projectId: string,
  roots: Readonly<Partial<Record<LcosSurfaceKey, string>>>): LocalProjectSearchHit[] {
  if (!index) return [];
  const result: LocalProjectSearchHit[] = index.destinations.flatMap(destination => {
    if (destination.ref.kind !== 'spatial' || destination.ref.projectId !== projectId) return [];
    const kind = destination.sourceRef?.kind;
    const snippet = kind === 'context' ? '上下文 · 项目空间' : kind === 'workflow' ? '工作流 · 项目空间' : '集合 · 项目空间';
    return [{ entityType: destination.ref.entityType, entityId: destination.ref.entityId, title: destination.label,
      snippet, matchReason: 'title' as const, available: destination.available,
      ...(destination.reason ? { reason: destination.reason } : {}), destination }];
  });
  const graph = index.graph;
  if (graph && String(graph.project.id) === projectId) for (const workspace of graph.workspaces) {
    if (String(workspace.projectId) !== projectId) continue;
    const destination = workspace.canvasId ? resolveOccurrenceDestination(workspace.canvasId, graph.workspaces, roots) : undefined;
    result.push({ entityType: 'workspace', entityId: String(workspace.id), title: workspace.name,
      snippet: '工作现场 · 项目空间', matchReason: 'title', available: destination !== undefined,
      ...(destination ? { worksite: { surface: destination.surface, canvasId: destination.canvasId,
        ...(destination.workspaceId ? { workspaceId: destination.workspaceId } : {}) } }
        : { reason: '现场尚未绑定可打开的画布。' }) });
  }
  return result;
}
export function localProjectSearchHits(index: ProjectNavigationIndex | undefined, projectId: string, query: string,
  roots: Readonly<Partial<Record<LcosSurfaceKey, string>>>): LocalProjectSearchHit[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return terms.length ? projectLocalSearchEntries(index,projectId,roots)
    .filter(hit => terms.every(term => normalize(hit.title).includes(term))) : [];
}
export function mergeProjectSearchHits(local: readonly LocalProjectSearchHit[], remote: readonly SearchHitVNext[]): ProjectSearchVisibleHit[] {
  const seen = new Set<string>();
  return [...local, ...remote].filter(hit => {
    const key = JSON.stringify([hit.entityType, hit.entityId]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
