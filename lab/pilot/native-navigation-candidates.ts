import type { SpatialMarkerIntentV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/navigation-marker';
import { nativeNavigationTarget, nativeNavigationNodeTarget, nativeNavigationNodeTargets, nativeNavigationRecordTarget, sameNativeNavigationTarget,
  isNativeNavigationNodeMarker, type NativeNavigationFacts, type NativeNavigationTarget, type NativeNavigationRecord,
  type NativeNavigationNodeTarget } from './native-navigation-markers';

type Row = Record<string, any>;
type Facts = NativeNavigationFacts;
export type NativeNavigationCanvasEvidence = { canvasId: string; nodes?: readonly Row[]; available?: boolean; error?: string; surfaceRef?: string };
export type NativeNavigationCandidate = {
  key: string; projectId: string; workspaceId: string; canvasId: string; surfaceRef: string;
  targetRef: NativeNavigationTarget; nodeTargetRef?: NativeNavigationTarget; nodeId?: string;
  kind: 'node' | 'surface'; title: string; workspace: Row; scopeTrail: readonly Row[];
};
export type NativeNavigationCandidateProblem = { reason: string; canvasId?: string; nodeId?: string };
export type NativeNavigationCandidates = { status: 'ready' | 'unplaced' | 'missing' | 'unavailable'; reason?: string;
  complete: boolean; candidates: NativeNavigationCandidate[]; rejected: NativeNavigationCandidateProblem[] };
const rows = (value: any): Row[] => Array.isArray(value) ? value : [];
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const same = (a?: SpatialMarkerTargetRefV0, b?: SpatialMarkerTargetRefV0) => !!a && !!b && a.projectId === b.projectId && a.kind === b.kind && a.id === b.id;
const fields: Record<string, string> = { artifact: 'artifacts', collection: 'collections', note: 'notes', scope: 'scopes', workspace: 'workspaces', conversation: 'connectedConversations', run: 'runs', 'result-slot': 'resultSlots' };
const live = (row: Row) => !row.archivedAt && !row.deletedAt;
function targetState(target: SpatialMarkerTargetRefV0, facts: Facts): { status: 'ready' | 'missing' | 'unavailable'; reason?: string; type?: string; value?: Row } {
  const graph = facts.graph;
  if (!target || !text(target.projectId) || graph?.project?.id !== target.projectId || !text(target.id)) return { status: 'unavailable', reason: 'project-identity-unavailable' };
  if (target.kind === 'surface') {
    if (['main', 'assembly'].includes(target.id)) return { status: 'ready', type: 'surface' };
    const split = target.id.indexOf(':'), type = target.id.slice(0, split), id = target.id.slice(split + 1);
    if (split < 0 || !['scope', 'workspace', 'conversation'].includes(type) || !id) return { status: 'unavailable', reason: 'surface-unknown' };
    if (type === 'conversation' && facts.availability?.conversations === false) return { status: 'unavailable', reason: 'optional-entity-read-unavailable' };
    const values = rows(graph[fields[type]!]).filter(row => row.id === id && row.projectId === target.projectId);
    if (values.length !== 1) return { status: values.length ? 'unavailable' : 'missing', reason: values.length ? 'target-ambiguous' : 'target-missing' };
    return live(values[0]!) ? { status: 'ready', type: 'surface', value: values[0] } : { status: 'missing', reason: 'target-archived' };
  }
  if (target.kind === 'view') {
    const views = rows(graph.artifactViews).filter(row => row.id === target.id && (row.projectId === undefined || row.projectId === target.projectId));
    if (views.length > 1) return { status: 'unavailable', reason: 'target-ambiguous' };
    if (!views.length) return { status: 'missing', reason: 'target-missing' };
    const artifacts = rows(graph.artifacts).filter(row => row.id === views[0]!.artifactId && row.projectId === target.projectId);
    if (artifacts.length !== 1) return { status: artifacts.length ? 'unavailable' : 'missing', reason: artifacts.length ? 'target-ambiguous' : 'target-missing' };
    if (!live(views[0]!) || !live(artifacts[0]!)) return { status: 'missing', reason: 'target-archived' };
    return { status: 'ready', type: 'view', value: views[0] };
  }
  if (target.kind !== 'entity') return { status: 'unavailable', reason: 'target-kind-unknown' };
  const found = Object.entries(fields).flatMap(([type, field]) => rows(graph[field]).filter(row => row.id === target.id && row.projectId === target.projectId).map(value => ({ type, value })));
  if (found.length > 1) return { status: 'unavailable', reason: 'target-ambiguous' };
  if (!found.length) {
    if (facts.availability?.conversations === false || facts.availability?.runs === false || facts.availability?.resultSlots === false) return { status: 'unavailable', reason: 'optional-entity-read-unavailable' };
    return { status: 'missing', reason: 'target-missing' };
  }
  const result = found[0]!;
  if (result.type === 'conversation' && facts.availability?.conversations === false || result.type === 'run' && facts.availability?.runs === false || result.type === 'result-slot' && facts.availability?.resultSlots === false)
    return { status: 'unavailable', reason: 'optional-entity-read-unavailable' };
  return live(result.value) ? { status: 'ready', ...result } : { status: 'missing', reason: 'target-archived' };
}
function relevantBinding(target: SpatialMarkerTargetRefV0, facts: Facts, binding: Row): boolean {
  if (binding.projectId !== target.projectId || binding.spatialKind !== 'node') return false;
  const state = targetState(target, facts);
  if (state.status !== 'ready' || target.kind === 'surface') return false;
  if (target.kind === 'view') return binding.entityType === 'view' && binding.entityId === target.id
    || binding.entityType === 'artifact' && binding.entityId === state.value?.artifactId;
  if (state.type === 'artifact') return binding.entityType === 'artifact' && binding.entityId === target.id
    || binding.entityType === 'view' && rows(facts.graph.artifactViews).some(view => view.id === binding.entityId && view.artifactId === target.id);
  if (state.type === 'result-slot' && (binding.entityType === 'artifact' && binding.entityId === state.value?.artifactId
    || binding.entityType === 'view' && binding.entityId === state.value?.artifactViewId)) return true;
  return binding.entityType === state.type && binding.entityId === target.id;
}
function ownSurfaces(target: SpatialMarkerTargetRefV0, facts: Facts): Row[] {
  const state = targetState(target, facts);
  if (state.status !== 'ready') return [];
  return rows(facts.graph.workspaces).filter(workspace => workspace.projectId === target.projectId && live(workspace) && text(workspace.canvasId) && (
    target.kind === 'surface' && (target.id === 'main' || target.id === 'assembly') ? workspace.preferredSurface === target.id
      && (target.id !== 'main' || rows(facts.graph.scopes).some(scope => scope.id === workspace.scopeId && scope.projectId === target.projectId && scope.kind === 'root'))
    : target.kind === 'surface' && target.id.startsWith('workspace:') ? workspace.id === target.id.slice(10)
    : target.kind === 'surface' && target.id.startsWith('scope:') ? workspace.scopeId === target.id.slice(6)
    : target.kind === 'entity' && state.type === 'workspace' ? workspace.id === target.id
    : target.kind === 'entity' && state.type === 'scope' ? workspace.scopeId === target.id : false));
}
function scopeTrail(projectId: string, workspace: Row, facts: Facts): Row[] | undefined {
  const trail: Row[] = [], seen = new Set<string>(); let id = workspace.scopeId;
  while (text(id)) {
    if (seen.has(id)) return;
    seen.add(id);
    const matches = rows(facts.graph.scopes).filter(scope => scope.id === id && scope.projectId === projectId);
    if (matches.length !== 1 || !live(matches[0]!)) return;
    const scope = matches[0]!; trail.unshift(scope);
    if (scope.parentScopeId === null) return trail;
    if (!text(scope.parentScopeId)) return;
    id = scope.parentScopeId;
  }
}
function surfaceFor(workspace: Row, evidence: NativeNavigationCanvasEvidence | undefined, rootScope: boolean): string {
  const supplied = evidence?.surfaceRef;
  // The caller may witness the exact current original scene surface. Never
  // derive a Conversation subcanvas from its icon, label or workspaceRef.
  if (supplied?.startsWith('conversation:')) return supplied;
  return workspace.preferredSurface === 'assembly' || workspace.preferredSurface === 'main' && rootScope ? workspace.preferredSurface : 'workspace:' + workspace.id;
}
function geometryAvailable(node: Row, nodes: readonly Row[]): boolean {
  const size = node.measured;
  if (![size?.width, size?.height].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) return false;
  const seen = new Set<string>(); let current: Row | undefined = node;
  while (current) {
    if (seen.has(current.id) || ![current.position?.x, current.position?.y].every(value => typeof value === 'number' && Number.isFinite(value))) return false;
    seen.add(current.id);
    const parent = current.parentId ?? current.parent_id;
    if (parent === undefined || parent === null || parent === '') return true;
    if (!text(parent)) return false;
    const matches = nodes.filter(row => row.id === parent);
    if (matches.length !== 1) return false;
    current = matches[0];
  }
  return false;
}

/** Candidate reads are limited to recorded bindings/owned surfaces. No camera,
 * placement, target rebinding or geometry is owned by this pure module. */
export function nativeNavigationCandidateCanvasIds(target: NativeNavigationTarget, facts: Facts): string[] {
  if (target.kind === 'native-node') return nativeWorkspace(target, facts) ? [target.canvasId] : [];
  if (targetState(target, facts).status !== 'ready') return [];
  return [...new Set([...facts.bindings.filter(binding => relevantBinding(target, facts, binding)).map(binding => binding.canvasId),
    ...ownSurfaces(target, facts).map(workspace => workspace.canvasId)].filter(text))];
}

export function nativeNavigationCandidates(target: NativeNavigationTarget, facts: Facts, canvases: readonly NativeNavigationCanvasEvidence[]): NativeNavigationCandidates {
  if (target.kind === 'native-node') return nativeNodeCandidates(target, facts, canvases);
  const state = targetState(target, facts), rejected: NativeNavigationCandidateProblem[] = [], candidates: NativeNavigationCandidate[] = [];
  if (state.status !== 'ready') return { status: state.status, reason: state.reason, complete: state.status === 'missing', candidates, rejected };
  const surfaceOwners = ownSurfaces(target, facts);
  for (const canvasId of nativeNavigationCandidateCanvasIds(target, facts)) {
    const owners = rows(facts.graph.workspaces).filter(workspace => workspace.canvasId === canvasId && workspace.projectId === target.projectId && live(workspace));
    if (owners.length !== 1) { rejected.push({ canvasId, reason: 'workspace-identity-ambiguous' }); continue; }
    const workspace = owners[0]!, trail = scopeTrail(target.projectId, workspace, facts);
    if (!trail) { rejected.push({ canvasId, reason: 'scope-chain-incomplete' }); continue; }
    const samples = canvases.filter(canvas => canvas.canvasId === canvasId), sample = samples[0];
    if (samples.length !== 1 || sample?.available === false || sample?.error || !Array.isArray(sample?.nodes)) {
      rejected.push({ canvasId, reason: 'canvas-read-failed' }); continue;
    }
    const surfaceRef = surfaceFor(workspace, sample, trail.at(-1)?.kind === 'root');
    if (surfaceRef.startsWith('conversation:') && targetState({ projectId: target.projectId, kind: 'surface', id: surfaceRef }, facts).status !== 'ready') {
      rejected.push({ canvasId, reason: 'surface-identity-mismatch' }); continue;
    }
    const shared = { projectId: target.projectId, workspaceId: workspace.id, canvasId, surfaceRef, targetRef: target, workspace, scopeTrail: trail };
    if (surfaceOwners.some(owner => owner.id === workspace.id)) candidates.push({ ...shared, kind: 'surface',
      key: JSON.stringify(['surface', target.projectId, workspace.id, canvasId]), title: String(workspace.name ?? '') });
    for (const binding of facts.bindings.filter(binding => binding.canvasId === canvasId && relevantBinding(target, facts, binding))) {
      const matches = sample!.nodes!.filter(node => node.id === binding.spatialId), node = matches[0];
      if (matches.length !== 1 || !node) { rejected.push({ canvasId, nodeId: binding.spatialId, reason: 'bound-node-missing' }); continue; }
      const nodeTarget = nativeNavigationTarget(node, { ...shared, api: {} }, facts);
      // Another occurrence of the same Artifact is not automatically the
      // ResultSlot's carrier. Require its original exact result relation.
      if(state.type==='result-slot'&&binding.entityType!=='result-slot'&&node.data?.lcos_result_ref?.slotId!==target.id)continue;
      if (target.kind === 'view' && binding.entityType === 'artifact' && nodeTarget?.kind === 'view' && nodeTarget.id !== target.id
        && rows(facts.graph.artifactViews).some(view => view.id === nodeTarget.id && view.artifactId === state.value?.artifactId)) continue;
      const materialMatch = target.kind === 'entity' && state.type === 'artifact' && nodeTarget?.kind === 'view'
        && rows(facts.graph.artifactViews).some(view => view.id === nodeTarget.id && view.artifactId === target.id);
      const promotedSlotMatch=state.type==='result-slot'&&nativeNavigationNodeTargets(node,{...shared,api:{}},facts).some(value=>sameNativeNavigationTarget(value,target));
      if (!same(nodeTarget, target) && !materialMatch && !promotedSlotMatch) { rejected.push({ canvasId, nodeId: node.id, reason: 'binding-carrier-mismatch' }); continue; }
      if (node.hidden) { rejected.push({ canvasId, nodeId: node.id, reason: 'node-hidden' }); continue; }
      if (!geometryAvailable(node, sample!.nodes!)) { rejected.push({ canvasId, nodeId: node.id, reason: 'node-geometry-unavailable' }); continue; }
      candidates.push({ ...shared, kind: 'node', nodeId: node.id, nodeTargetRef: nodeTarget,
        key: JSON.stringify(['node', target.projectId, workspace.id, canvasId, node.id]), title: String(node.data?.title ?? node.data?.label ?? '') });
    }
  }
  const unique = [...new Map(candidates.map(candidate => [candidate.key, candidate])).values()];
  return { status: unique.length ? 'ready' : rejected.length ? 'unavailable' : 'unplaced',
    ...(!unique.length ? { reason: rejected[0]?.reason ?? (target.kind === 'surface' ? 'surface-not-projected' : 'binding-missing') } : {}),
    complete: !rejected.length, candidates: unique, rejected };
}

/** Local is a real stable source surface, never a shared title or the first
 * occurrence. Cross-surface alone is allowed to enumerate project occurrences. */
export function nativeNavigationMarkerApplies(marker: NativeNavigationRecord, candidate: NativeNavigationCandidate, facts: Facts): boolean {
  if (isNativeNavigationNodeMarker(marker)) return marker.projectId === candidate.projectId && marker.scope === 'local'
    && marker.nativeNode.canvasId === candidate.canvasId && marker.nativeNode.nodeId === candidate.nodeId
    && sameNativeNavigationTarget(nativeNavigationRecordTarget(marker), candidate.targetRef) && !!nativeWorkspace(nativeNavigationRecordTarget(marker) as NativeNavigationNodeTarget, facts);
  if (candidate.targetRef.kind === 'native-node') return false;
  if (marker.projectId !== candidate.projectId || !same(marker.targetRef, candidate.targetRef) || facts.graph?.project?.id !== candidate.projectId) return false;
  const owners = rows(facts.graph.workspaces).filter(row => row.id === candidate.workspaceId && row.canvasId === candidate.canvasId && row.projectId === candidate.projectId && live(row));
  if (owners.length !== 1) return false;
  const workspace = owners[0]!;
  if (marker.scope === 'cross-surface') return true;
  if (marker.scope !== 'local' || !text(marker.sourceSurfaceRef)) return false;
  const source = marker.sourceSurfaceRef;
  if (source === 'main' || source === 'assembly') return workspace.preferredSurface === source
    && (source !== 'main' || rows(facts.graph.scopes).some(scope => scope.id === workspace.scopeId && scope.projectId === candidate.projectId && scope.kind === 'root'));
  if (source.startsWith('workspace:')) return workspace.id === source.slice(10);
  if (source.startsWith('scope:')) return workspace.scopeId === source.slice(6);
  if (source.startsWith('conversation:')) return candidate.surfaceRef === source
    && targetState({ projectId: candidate.projectId, kind: 'surface', id: source }, facts).status === 'ready';
  return false;
}

function nativeWorkspace(target: NativeNavigationNodeTarget, facts: Facts): Row | undefined {
  if (!text(target.canvasId) || !text(target.nodeId) || facts.graph?.project?.id !== target.projectId) return;
  const owners = rows(facts.graph.workspaces).filter(row => row.projectId === target.projectId && row.canvasId === target.canvasId && live(row));
  return owners.length === 1 ? owners[0] : undefined;
}
function nativeNodeCandidates(target: NativeNavigationNodeTarget, facts: Facts, canvases: readonly NativeNavigationCanvasEvidence[]): NativeNavigationCandidates {
  const workspace = nativeWorkspace(target, facts), rejected: NativeNavigationCandidateProblem[] = [];
  const failure = (status: NativeNavigationCandidates['status'], reason: string, complete = false): NativeNavigationCandidates =>
    ({ status, reason, complete, candidates: [], rejected: [{ canvasId: target.canvasId, nodeId: target.nodeId, reason }] });
  if (!workspace) return failure('unavailable', 'workspace-identity-ambiguous');
  const trail = scopeTrail(target.projectId, workspace, facts); if (!trail) return failure('unavailable', 'scope-chain-incomplete');
  const samples = canvases.filter(row => row.canvasId === target.canvasId), sample = samples[0];
  if (samples.length !== 1 || !Array.isArray(sample?.nodes) || sample?.available === false || sample?.error) return failure('unavailable', 'canvas-read-failed');
  const matches = sample.nodes.filter(node => node.id === target.nodeId), node = matches[0];
  if (matches.length !== 1) return failure(matches.length ? 'unavailable' : 'missing', matches.length ? 'node-identity-ambiguous' : 'node-missing', !matches.length);
  const surfaceRef = surfaceFor(workspace, sample, trail.at(-1)?.kind === 'root'), scene = { projectId: target.projectId, canvasId: target.canvasId, workspaceId: workspace.id, surfaceRef, api: {} };
  if (!sameNativeNavigationTarget(nativeNavigationNodeTarget(node, scene, facts), target)) return failure('unavailable', 'node-identity-changed');
  if (node.hidden) return failure('unavailable', 'node-hidden');
  if (!geometryAvailable(node, sample.nodes)) return failure('unavailable', 'node-geometry-unavailable');
  return { status: 'ready', complete: true, rejected, candidates: [{ key: JSON.stringify(['native-node', target.projectId, workspace.id, target.canvasId, target.nodeId]),
    projectId: target.projectId, workspaceId: workspace.id, canvasId: target.canvasId, surfaceRef, targetRef: target, nodeTargetRef: target,
    nodeId: target.nodeId, kind: 'node', title: String(node.data?.title ?? node.data?.label ?? '已固定节点'), workspace, scopeTrail: trail }] };
}
