import { SqliteBindingStore } from '@local-creative-os/web-gen2';

import { createAbsolutePositionGetter, indexById } from '@huabu/shared/canvas-engine';

import { getSpacePreviewScene } from '@/api/canvas';
import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';

import type { FocusBinding } from './focusOccurrenceProjection';
import type { RailwayMapMember, RailwayMemberGeometry, RailwayMemberMapSnapshot } from './RailwayMemberMap';
import type { NavigationEntityIdentity } from './semanticNavigationLocations';
import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';

export function railwayMemberBindingMatches(member: NavigationEntityIdentity, binding: NavigationEntityIdentity, artifactViews?: ProjectGraphSnapshot['artifactViews']): boolean {
  if (binding.entityType === 'view') {
    if (member.artifactViewId) return binding.entityId === member.artifactViewId;
    if (member.entityType === 'artifact') return artifactViews?.some(view => String(view.id) === binding.entityId
      && String(view.artifactId) === member.entityId) ?? false;
  }
  return binding.entityType === member.entityType && binding.entityId === member.entityId;
}

/** Select exactly one existing scene; coordinates from different canvases never mix. */
export function railwayMemberMapCanvas(projectId: string, owner: NavigationEntityIdentity,
  members: readonly NavigationEntityIdentity[], bindings: readonly FocusBinding[], currentCanvasId?: string, graph?: ProjectGraphSnapshot): string | undefined {
  const nodes = bindings.filter(binding => binding.projectId === projectId && binding.spatialKind === 'node');
  const ownerCanvases = [...new Set(nodes.filter(binding => railwayMemberBindingMatches(owner,binding,graph?.artifactViews)).map(binding => binding.canvasId))];
  const candidates = ownerCanvases.length ? ownerCanvases
    : [...new Set(nodes.filter(binding => members.some(member => railwayMemberBindingMatches(member,binding,graph?.artifactViews))).map(binding => binding.canvasId))];
  return candidates.sort((a,b) => {
    const score = (canvasId: string) => members.filter(member => nodes.some(binding => binding.canvasId === canvasId
      && railwayMemberBindingMatches(member,binding,graph?.artifactViews))).length;
    if (ownerCanvases.length && currentCanvasId && (a === currentCanvasId || b === currentCanvasId)) return a === currentCanvasId ? -1 : 1;
    return score(b) - score(a) || (a === currentCanvasId ? -1 : b === currentCanvasId ? 1 : a.localeCompare(b));
  })[0];
}

/** Bindings are identity only; all positions and sizes come from the sole Huabu geometry owner. */
export async function readRailwayMemberGeometry(session: Pick<LcosCoreSession,'http'|'projects'>, projectId: string,
  owner: NavigationEntityIdentity, members: readonly RailwayMapMember[], signal: AbortSignal, existingGraph?: ProjectGraphSnapshot): Promise<RailwayMemberMapSnapshot> {
  const check = () => { if (signal.aborted) throw new DOMException('Preview read cancelled','AbortError'); };
  check();
  if (!members.length) return { geometry: [] };
  const canvas = useCanvasStore.getState();
  const references = useLcosReferenceStore.getState();
  const local = references.projectId === projectId && references.bindingCanvasId === canvas.canvasId && references.bindingIdentitiesReady;
  const liveCanvasId = local ? canvas.canvasId : undefined;
  const liveBindings: FocusBinding[] = liveCanvasId ? [...references.nodeEntityRefs].map(([nodeId,ref]) => ({
    projectId,canvasId:liveCanvasId,spatialKind:'node',spatialId:nodeId,entityType:ref.entityType,entityId:ref.entityId,
  })) : [];
  let persisted: FocusBinding[] = [];
  let issue: string | undefined;
  try { persisted = await new SqliteBindingStore(session.http,projectId).list(); }
  catch { issue = '成员投影索引暂不可读取'; }
  check();
  // Live bindings replace stored rows on this canvas; removed nodes cannot reappear from stale persistence.
  const bindings = [...liveBindings,...persisted.filter(binding => !local || binding.canvasId !== canvas.canvasId)];
  let graph = existingGraph && String(existingGraph.project.id) === projectId ? existingGraph : undefined;
  if (!graph && bindings.some(binding => binding.projectId === projectId && binding.entityType === 'view')
    && members.some(member => member.entityType === 'artifact' && !member.artifactViewId)) {
    try { const next = await session.projects.getProjectGraph(projectId);
      if (next && String(next.project.id) === projectId) graph = next;
      else issue = '成员引用对应关系身份不匹配';
    } catch { issue = '成员引用对应关系暂不可读取'; }
    check();
  }
  const canvasId = railwayMemberMapCanvas(projectId,owner,members,bindings,local ? canvas.canvasId : undefined,graph);
  if (!canvasId) return { geometry: [], ...(issue ? {issue} : {}) };
  let scene: Awaited<ReturnType<typeof getSpacePreviewScene>> | undefined;
  try { scene = await getSpacePreviewScene(canvasId); }
  catch { issue = '成员空间预览暂不可读取'; }
  check();
  if (scene && scene.canvasId !== canvasId) return { geometry: [], issue: '成员空间预览身份不匹配' };
  const sameLiveCanvas = local && canvasId === canvas.canvasId;
  const liveNodes = new Map(canvas.nodes.map(node => [node.id,node]));
  const absolutePosition = createAbsolutePositionGetter(indexById(canvas.nodes));
  const sceneNodes = new Map(scene?.nodes.map(node => [node.id,node]) ?? []);
  const geometry: RailwayMemberGeometry[] = [];
  for (const member of members) {
    const matches = bindings.filter(binding => binding.projectId === projectId && binding.canvasId === canvasId
      && binding.spatialKind === 'node' && railwayMemberBindingMatches(member,binding,graph?.artifactViews));
    // Ambiguous occurrences need a real view binding; never pick an arbitrary spatial identity.
    const exact = member.artifactViewId ? matches.filter(binding => binding.entityType === 'view' && binding.entityId === member.artifactViewId) : [];
    const choices = [...new Map((exact.length ? exact : matches).map(binding => [binding.spatialId,binding])).values()];
    const choice = choices[0];
    if (choices.length !== 1 || !choice) continue;
    const nodeId = choice.spatialId;
    const preview = sceneNodes.get(nodeId);
    const liveNode = sameLiveCanvas ? liveNodes.get(nodeId) : undefined;
    if (sameLiveCanvas && (!liveNode || liveNode.hidden)) continue;
    const position = liveNode ? absolutePosition(nodeId) : preview;
    const dimensions = liveNode ? { width: liveNode.measured?.width ?? liveNode.width ?? liveNode.style?.width,
      height: liveNode.measured?.height ?? liveNode.height ?? liveNode.style?.height } : preview;
    if (!position || !dimensions || typeof dimensions.width !== 'number' || typeof dimensions.height !== 'number'
      || ![position.x,position.y,dimensions.width,dimensions.height].every(Number.isFinite)
      || dimensions.width <= 0 || dimensions.height <= 0) continue;
    geometry.push({ memberKey:member.key,nodeId,x:position.x,y:position.y,width:dimensions.width,height:dimensions.height,
      ...(preview?.imageSrc ? {imageSrc:preview.imageSrc} : {}) });
  }
  if (scene?.truncated.nodes) issue = '现场较大，部分成员位置未读取';
  return { canvasId,canvasLabel:scene?.title ?? '成员所在现场',geometry,...(issue ? {issue} : {}) };
}
