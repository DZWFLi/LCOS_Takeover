import { resolveOccurrenceDestination } from './resolveOccurrenceDestination';
import { navigationEntityKey, navigationMemberMatches } from './semanticNavigationLocations';

import type { OccurrenceDestination, OccurrenceWorkspace } from './resolveOccurrenceDestination';
import type { NavigationEntityIdentity, SemanticNavigationLocation } from './semanticNavigationLocations';
import type { LcosSurfaceKey } from '../shell/lcosShellStore';

export interface FocusProjectedNode extends NavigationEntityIdentity { readonly nodeId: string }
export interface FocusOccurrenceRow {
  readonly key: string;
  readonly nodeId?: string;
  readonly nodes: readonly FocusProjectedNode[];
  readonly canvasId: string;
  readonly destination?: OccurrenceDestination;
  readonly local: boolean;
  readonly current: boolean;
  readonly label: string;
  readonly matchCount: number;
  readonly totalCount: number;
  /** Semantic membership navigates to its existing Main body, not a fake
   * projection of all members into a new workspace. */
  readonly anchor?: NavigationEntityIdentity;
  readonly members?: readonly NavigationEntityIdentity[];
}
export interface FocusBinding extends NavigationEntityIdentity {
  readonly projectId: string; readonly canvasId: string; readonly spatialKind: string; readonly spatialId: string;
}

export function projectFocusOccurrences(input: {
  readonly projectId: string; readonly selected: readonly NavigationEntityIdentity[];
  readonly bindings: readonly FocusBinding[]; readonly currentCanvasId?: string;
  readonly currentNodeIds: ReadonlySet<string>; readonly selectedNodeIds: ReadonlySet<string>;
  readonly activeSurface: LcosSurfaceKey; readonly workspaces: readonly OccurrenceWorkspace[];
  readonly roots: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly semanticLocations?: readonly SemanticNavigationLocation[];
}): FocusOccurrenceRow[] {
  const selected = input.selected;
  const wanted = new Set(selected.map(navigationEntityKey));
  const totalCount = selected.length;
  const matches = input.bindings.filter(binding => binding.projectId === input.projectId && binding.spatialKind === 'node'
    && wanted.has(navigationEntityKey(binding)));
  const rows: FocusOccurrenceRow[] = [];
  const rowFor = (bindings: readonly FocusBinding[]): FocusOccurrenceRow => {
    const first = bindings[0];
    if (!first) throw new Error('No occurrence nodes');
    const nodes = [...new Map(bindings.map(binding => [binding.spatialId, { nodeId: binding.spatialId,
      entityType: binding.entityType, entityId: binding.entityId }])).values()];
    const local = first.canvasId === input.currentCanvasId;
    const live = local && nodes.every(node => input.currentNodeIds.has(node.nodeId));
    const destination = resolveOccurrenceDestination(first.canvasId, input.workspaces, input.roots);
    return { key: JSON.stringify([first.canvasId, nodes.map(node => node.nodeId)]), nodeId: nodes[0]?.nodeId, nodes,
      canvasId: first.canvasId, ...(destination ? { destination } : {}), local,
      current: local && nodes.some(node => input.selectedNodeIds.has(node.nodeId)),
      label: local ? live ? ({ main: '主画布', context: '上下文', workflow: '工作流' }[input.activeSurface]) : '当前现场 · 投影待就绪'
        : destination?.label ?? '位置暂不可打开', matchCount: selected.filter(ref => nodes.some(node => navigationEntityKey(node) === navigationEntityKey(ref))).length, totalCount };
  };
  if (totalCount <= 1) {
    const seen = new Set<string>();
    for (const binding of matches) {
      const key = JSON.stringify([binding.canvasId, binding.spatialId]);
      if (seen.has(key)) continue;
      seen.add(key); rows.push(rowFor([binding]));
    }
  } else {
    const byCanvas = new Map<string, FocusBinding[]>();
    for (const binding of matches) {
      const group = byCanvas.get(binding.canvasId) ?? []; group.push(binding); byCanvas.set(binding.canvasId, group);
    }
    for (const group of byCanvas.values()) rows.push(rowFor(group));
  }
  const mainCanvasId = input.roots.main;
  for (const location of input.semanticLocations ?? []) {
    const matching = selected.filter(ref => location.members.some(member => navigationMemberMatches(ref,member)));
    const matchCount = matching.length;
    if (!matchCount) continue;
    if (location.entityType === 'workspace') {
      const workspace = input.workspaces.find(item => String(item.id) === location.entityId);
      const destination = workspace?.canvasId ? resolveOccurrenceDestination(workspace.canvasId,input.workspaces,input.roots) : undefined;
      if (!workspace?.canvasId || !destination) continue;
      if (rows.some(row => row.canvasId === workspace.canvasId && row.matchCount >= matchCount)) continue;
      rows.push({ key: location.key, nodes: [], canvasId: workspace.canvasId, destination,
        local: workspace.canvasId === input.currentCanvasId, current: false, label: location.label, matchCount, totalCount,
        members: matching.map(ref => location.members.find(member => navigationMemberMatches(ref,member)) ?? ref) });
      continue;
    }
    if (!mainCanvasId) continue;
    const anchorBinding = input.bindings.find(binding => binding.projectId === input.projectId && binding.spatialKind === 'node'
      && binding.canvasId === mainCanvasId && binding.entityType === location.entityType && binding.entityId === location.entityId);
    const destination = resolveOccurrenceDestination(mainCanvasId,input.workspaces,input.roots);
    rows.push({ key: location.key, nodes: [], ...(anchorBinding ? { nodeId: anchorBinding.spatialId } : {}), canvasId: mainCanvasId,
      ...(destination ? { destination } : {}), local: mainCanvasId === input.currentCanvasId, current: false,
      label: location.label, matchCount, totalCount, anchor: { entityType: location.entityType, entityId: location.entityId } });
  }
  return rows.sort((a, b) => Number(b.matchCount === totalCount) - Number(a.matchCount === totalCount)
    || Number(b.current) - Number(a.current) || b.matchCount - a.matchCount);
}
