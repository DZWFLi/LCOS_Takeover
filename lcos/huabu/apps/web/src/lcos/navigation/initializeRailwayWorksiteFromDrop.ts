import { HuabuRfsClient, ProjectToSpaceProjection, ReconciliationRunner, RelationProjection } from '@local-creative-os/web-gen2';
import { getViewportForBounds } from '@xyflow/react';

import { getCanvas, putCanvas } from '@/api/canvas';
import useCanvasStore from '@/store/canvasStore';

import { viewPresentationByArtifact } from '../../../../../../apps/web-gen2/src/spatial/reconciliationRunner';
import { worksiteProjectionInput } from '../../../../../../apps/web-gen2/src/spatial/worksiteProjectionInput';
import { readLcosHostConfig } from '../lcosHost';

import type { GetCanvasResponse } from '@huabu/shared';
import type { AgentCanvasCommand, EntityRefLike, Gen2Host } from '@local-creative-os/web-gen2';

export interface RailwayWorksiteNativeCapture {
  readonly viewport: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly nodes: readonly {
    readonly reference: EntityRefLike;
    readonly absolutePosition: { readonly x: number; readonly y: number };
    readonly size?: { readonly width: number; readonly height?: number | 'auto' };
  }[];
}

export interface RailwayWorksiteInitialization {
  readonly status: 'initialized' | 'skipped';
  readonly canvasId: string;
  readonly initializedNodeIds: readonly string[];
  readonly message?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function stateOf(canvas: GetCanvasResponse): Record<string, unknown> {
  return record(canvas.state) ? canvas.state : {};
}
function defaultViewport(state: Record<string, unknown>): boolean {
  return state.viewport === undefined || state.viewport === null || record(state.viewport)
    && state.viewport.x === 0 && state.viewport.y === 0 && state.viewport.zoom === 1;
}
function nodesOf(state: Record<string, unknown>): readonly Record<string, unknown>[] {
  if (state.nodes === undefined) return [];
  if (!Array.isArray(state.nodes) || !state.nodes.every(record)) throw new Error('新现场节点尚未完整读取。');
  return state.nodes;
}
function geometryMatches(node: { readonly type: string; readonly absolutePosition: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number } } | undefined,
  item: Extract<AgentCanvasCommand, { type: 'SET_NODE_GEOMETRY' }>['items'][number]): boolean {
  return !!node && node.absolutePosition.x === item.position?.x && node.absolutePosition.y === item.position?.y
    && (!item.size || node.size.width === item.size.width && (typeof item.size.height !== 'number'
      || ['text', 'question'].includes(node.type) || node.size.height === item.size.height));
}

/** Initialize only the still-empty new scene. Core supplies identities and the
 * ordinary projection runner; captured geometry and camera stay in native Huabu.
 * No source retarget, private host access, new runtime, renderer or layout truth. */
export async function initializeRailwayWorksiteFromDrop(host: Gen2Host,
  created: { readonly workspaceId: string; readonly canvasId: string }, capture: RailwayWorksiteNativeCapture,
  isCurrent?: () => boolean, signal?: AbortSignal): Promise<RailwayWorksiteInitialization> {
  const sourceCanvasId = useCanvasStore.getState().canvasId;
  const current = (): void => {
    if (signal?.aborted || isCurrent?.() === false || !sourceCanvasId
      || useCanvasStore.getState().isLoading || useCanvasStore.getState().canvasId !== sourceCanvasId || sourceCanvasId === created.canvasId)
      throw new Error('来源现场已变化，保留当前布局与镜头。');
  };
  let initializedNodeIds: string[] = [];
  try {
    current();
    if (![capture.viewport.x, capture.viewport.y, capture.viewport.zoom].every(Number.isFinite) || capture.viewport.zoom <= 0
      || capture.nodes.some(node => ![node.absolutePosition.x, node.absolutePosition.y].every(Number.isFinite)
        || node.size && (!Number.isFinite(node.size.width) || node.size.width <= 0
          || typeof node.size.height === 'number' && (!Number.isFinite(node.size.height) || node.size.height <= 0))))
      throw new Error('起手布局或镜头没有可用的原生数值。');
    const initial = await getCanvas(created.canvasId);
    current();
    if (!initial || initial.canvasId !== created.canvasId) throw new Error('新现场画布身份尚未确认。');
    const initialState = stateOf(initial);
    if (nodesOf(initialState).length || Array.isArray(initialState.edges) && initialState.edges.length || !defaultViewport(initialState))
      throw new Error('新现场已有内容或镜头编辑，未覆盖。');
    const graph = await host.projects.getProjectGraph(host.projectId);
    current();
    const workspaces = graph?.workspaces.filter(workspace => String(workspace.id) === created.workspaceId
      && String(workspace.projectId) === host.projectId && workspace.canvasId === created.canvasId) ?? [];
    const workspace = workspaces.length === 1 ? workspaces[0] : undefined;
    const scope = graph?.scopes.find(item => item.id === workspace?.scopeId);
    if (!graph || String(graph.project.id) !== host.projectId || !workspace || !scope || scope.kind === 'root')
      throw new Error('新现场不是本次独立工作现场，未初始化。');
    const worksite = worksiteProjectionInput(graph, workspace);
    const defaults = viewPresentationByArtifact(worksite.views, { focusedViewIds: worksite.preferredViews, preferPrimary: worksite.root });
    const addresses = capture.nodes.map(node => {
      const ref = node.reference;
      if (ref.entityType === 'note') {
        if (!worksite.notes.some(note => String(note.id) === ref.entityId)) throw new Error('原笔记尚未归入该现场。');
        return { entityType: 'note' as const, entityId: ref.entityId, node };
      }
      const requestedViewId = ref.artifactViewId ?? (ref.entityType === 'view' || ref.entityType === 'artifactView' ? ref.entityId : undefined);
      const candidates = worksite.views.filter(view => requestedViewId ? String(view.id) === requestedViewId
        : ref.entityType === 'artifact' && String(view.artifactId) === ref.entityId);
      const view = candidates.length === 1 ? candidates[0] : undefined;
      const artifact = view && graph.artifacts.find(item => item.id === view.artifactId && String(item.projectId) === host.projectId);
      const revisionId = view?.revisionId ?? artifact?.currentRevisionId;
      if (!view || !artifact || ref.entityType === 'artifact' && String(artifact.id) !== ref.entityId
        || ref.revisionId !== undefined && ref.revisionId !== String(revisionId))
        throw new Error('所见View或版本没有精确对应目标，未借用同材料的其他引用。');
      return defaults.get(String(artifact.id))?.viewId === String(view.id)
        ? { entityType: 'artifact' as const, entityId: String(artifact.id), node }
        : { entityType: 'view' as const, entityId: String(view.id), node };
    });
    const config = readLcosHostConfig(import.meta.env as Record<string, string | undefined>);
    const rfs = new HuabuRfsClient({ canvasId: created.canvasId, baseUrl: config.rfsUrl, bearerToken: config.rfsToken });
    const nodeProjector = new ProjectToSpaceProjection(rfs, host.bindings);
    const relationProjector = new RelationProjection(rfs, {
      createRelation: async input => ({ id: (await host.relations.createRelation(host.projectId, {
        sourceEntityType: input.from.entityType, sourceEntityId: input.from.entityId,
        targetEntityType: input.to.entityType, targetEntityId: input.to.entityId, kind: input.kind,
      })).relation.id }),
      deleteRelation: async id => { await host.relations.deleteRelation(host.projectId, id); },
    }, host.bindings, host.projectId);
    await new ReconciliationRunner({ projectId: host.projectId, canvasId: created.canvasId, projects: host.projects,
      relations: host.relations, conversations: host.conversations, collections: host.collections, runs: host.runs,
      resources: host.resources, bindings: host.bindings, nodeProjector, relationProjector }).runOnce();
    current();
    const bindings = (await host.bindings.list()).filter(binding => binding.projectId === host.projectId
      && binding.canvasId === created.canvasId && binding.spatialKind === 'node');
    current();
    const geometry: Extract<AgentCanvasCommand, { type: 'SET_NODE_GEOMETRY' }>['items'] = [];
    for (const address of addresses) {
      const matches = bindings.filter(binding => binding.entityType === address.entityType && binding.entityId === address.entityId);
      const binding = matches.length === 1 ? matches[0] : undefined;
      if (!binding || geometry.some(item => item.nodeId === binding.spatialId))
        throw new Error('目标投影缺失或引用重叠，未把两份历史引用写到同一节点。');
      geometry.push({ nodeId: binding.spatialId, position: { ...address.node.absolutePosition },
        ...(address.node.size ? { size: { ...address.node.size } } : {}) });
    }
    let canvas = await getCanvas(created.canvasId);
    current();
    if (!canvas || canvas.canvasId !== created.canvasId || !defaultViewport(stateOf(canvas)))
      throw new Error('新现场镜头已改变，未覆盖。');
    const allowed = new Set(bindings.map(binding => binding.spatialId));
    const targetNodes = nodesOf(stateOf(canvas));
    const selectedIds = new Set(geometry.map(item => item.nodeId));
    if (targetNodes.some(node => typeof node.id !== 'string' || !allowed.has(node.id)
      || capture.nodes.length > 0 && !selectedIds.has(node.id)
        && !bindings.some(binding => binding.spatialId === node.id && binding.entityType === 'conversation')))
      throw new Error('新现场出现额外节点或已有编辑，未覆盖布局。');
    if (geometry.some(item => !targetNodes.some(node => node.id === item.nodeId && !node.parentId)))
      throw new Error('目标节点缺失或已进入其他容器，未覆盖布局。');
    const beforeGeometry = await rfs.outline();
    current();
    if (beforeGeometry.result.version !== canvas.version) throw new Error('新现场已有后续编辑，未覆盖布局。');
    const needsGeometry = geometry.some(item => !geometryMatches(beforeGeometry.result.nodes.find(node => node.id === item.nodeId), item));
    // An already-correct native position is not an RFS failure/no-op. Camera
    // initialization must still complete when no geometry command is needed.
    if (needsGeometry) {
      current();
      const receipt = await rfs.execute([{ type: 'SET_NODE_GEOMETRY', items: geometry }]);
      current();
      if (receipt.canvasId !== created.canvasId || receipt.fromVersion !== canvas.version || receipt.results.length !== 1
        || receipt.results[0]?.type !== 'SET_NODE_GEOMETRY' || receipt.results[0].applied !== true)
        throw new Error('原生布局回执尚未确认，未继续覆盖镜头。');
      canvas = await getCanvas(created.canvasId);
      current();
      if (!canvas || canvas.canvasId !== created.canvasId || canvas.version !== receipt.toVersion)
        throw new Error('新现场在布局期间又有编辑，未覆盖镜头。');
    }
    const outline = await rfs.outline();
    current();
    if (outline.result.version !== canvas.version) throw new Error('目标布局读回已变化，未覆盖镜头。');
    for (const item of geometry) {
      const node = outline.result.nodes.find(candidate => candidate.id === item.nodeId);
      if (!geometryMatches(node, item))
        throw new Error('原生位置或尺寸尚未读回，未宣称布局恢复。');
    }
    initializedNodeIds = geometry.map(item => item.nodeId);
    const content = outline.result.nodes.filter(node => bindings.some(binding => binding.spatialId === node.id
      && ['artifact', 'view', 'note'].includes(binding.entityType)));
    if (!content.length) throw new Error('该现场尚无可见材料投影，未保存空白镜头。');
    let viewport = { ...capture.viewport };
    if (!capture.nodes.length) {
      const wrapper = useCanvasStore.getState().canvasWrapper;
      const width = capture.viewportSize?.width ?? wrapper?.clientWidth ?? window.innerWidth;
      const height = capture.viewportSize?.height ?? wrapper?.clientHeight ?? window.innerHeight;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('现场可见区域尺寸尚未确认。');
      const x = Math.min(...content.map(node => node.absolutePosition.x)), y = Math.min(...content.map(node => node.absolutePosition.y));
      const right = Math.max(...content.map(node => node.absolutePosition.x + node.size.width));
      const bottom = Math.max(...content.map(node => node.absolutePosition.y + node.size.height));
      viewport = getViewportForBounds({ x, y, width: right - x, height: bottom - y }, width, height, 0.15, 1.25, 0.15);
    }
    current();
    const saved = await putCanvas(created.canvasId, { version: canvas.version, state: { ...stateOf(canvas), viewport } });
    current();
    const confirmed = await getCanvas(created.canvasId);
    current();
    const camera = confirmed && stateOf(confirmed).viewport;
    if (!confirmed || saved.canvasId !== created.canvasId || confirmed.canvasId !== created.canvasId
      || confirmed.version !== saved.version || !record(camera) || camera.x !== viewport.x || camera.y !== viewport.y || camera.zoom !== viewport.zoom)
      throw new Error('原生镜头尚未读回，现场内容保留。');
    return { status: 'initialized', canvasId: created.canvasId,
      initializedNodeIds: geometry.length ? initializedNodeIds : content.map(node => node.id) };
  } catch (error: unknown) {
    return { status: 'skipped', canvasId: created.canvasId, initializedNodeIds,
      message: error instanceof Error ? error.message : String(error) };
  }
}
