import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import useCanvasStore from './native-canvas-port.ts';
import type { CoreCollectionClient } from '../../lcos/apps/web-gen2/src/backend/collections.ts';
import type { ProjectionBinding } from '../../lcos/apps/web-gen2/src/spatial/projectionBinding.ts';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState.ts';
import { placeNativeLibraryCollection, readNativeLibraryCollectionProjection } from './native-library-collection-placement';

/** Only the ports actually consumed by the original Collection landing owner.
 * No object is advertised as a full Gen2Host or installed into its global store. */
export interface NativeCollectionPlacementHost {
  readonly projectId: string;
  readonly collections: Pick<CoreCollectionClient, 'members'>;
  readonly nodeProjector: { projectEntity(input: { readonly projectId: string; readonly entityType: string;
    readonly entityId: string; readonly [key: string]: unknown }): Promise<ProjectionBinding> };
  readonly bindings: { findNode(projectId: string, canvasId: string, entityType: string, entityId: string): Promise<ProjectionBinding | undefined> };
  isCurrent(): boolean;
}

function requireRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('集合投影回执结构不可核对；原接收关系保留。');
  return value as Record<string, any>;
}

async function spatialRequest(path: string, init?: RequestInit): Promise<Record<string, any>> {
  const response = await fetch(path, { cache: 'no-store', redirect: 'error', ...init });
  const result = await response.json();
  if (!response.ok || result?.code !== 0 || !result.data) throw new Error(result?.message || `集合空间读取未完成（HTTP ${response.status}）。`);
  return requireRecord(result.data);
}

function requireBinding(value: unknown, projectId: string, canvasId: string, collectionId: string): ProjectionBinding {
  const binding = requireRecord(value);
  if (binding.projectId !== projectId || binding.canvasId !== canvasId || binding.spatialKind !== 'node'
    || binding.entityType !== 'collection' || binding.entityId !== collectionId
    || typeof binding.spatialId !== 'string' || !binding.spatialId.trim()) throw new Error('集合绑定回执不属于当前现场，未借用其他节点。');
  return binding as ProjectionBinding;
}

export function createNativeCollectionPlacementHost(projectId: string, canvasId: string | null): NativeCollectionPlacementHost | null {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
  const api = canvas.rfInstance, workspaceId = shell.activeWorkspaceId;
  if (!canvasId || canvas.canvasId !== canvasId || canvas.status !== 'ready' || !api
    || shell.projectId !== projectId || !workspaceId || shell.surfaceCanvasId[shell.activeSurface] !== canvasId) return null;
  const isCurrent = () => {
    const live = useCanvasStore.getState(), current = useLcosShellStore.getState();
    return live.canvasId === canvasId && live.rfInstance === api && live.status === 'ready'
      && current.projectId === projectId && current.activeWorkspaceId === workspaceId
      && current.surfaceCanvasId[current.activeSurface] === canvasId;
  };
  const current = () => { if (!isCurrent()) throw new Error('集合接收已保存，但原 Canvas/API/Workspace 已切换；未应用迟到落位。'); };
  return {
    projectId, isCurrent, collections: createLcosCoreSession().collections,
    nodeProjector: { async projectEntity(input) {
      current();
      if (input.projectId !== projectId || input.entityType !== 'collection' || !input.entityId?.trim()) throw new Error('这个原生投影口只接收已确认的集合本体。');
      const result = await placeNativeLibraryCollection({ projectId, canvasId, workspaceId, collectionId: input.entityId,
        ...(input.position ? { position: input.position as { x: number; y: number } } : {}) }, { api, isCurrent });
      current();
      if (result.status !== 'placed' && result.status !== 'already-present') throw new Error(result.message);
      return result.binding;
    } },
    bindings: { async findNode(requestProjectId, requestCanvasId, entityType, entityId) {
      current();
      if (requestProjectId !== projectId || requestCanvasId !== canvasId || entityType !== 'collection') throw new Error('集合绑定读取不属于原现场。');
      const result = await readNativeLibraryCollectionProjection({ projectId, canvasId, workspaceId, collectionId: entityId });
      current();
      if (result.state === 'absent') return undefined;
      if (result.state !== 'present') throw new Error('集合放置结果尚未确认，请核对；不会重复创建。');
      const visible = await placeNativeLibraryCollection({ projectId, canvasId, workspaceId, collectionId: entityId }, { api, isCurrent, readOnly: true });
      current();
      if (visible.status !== 'already-present' && visible.status !== 'placed') throw new Error(visible.message);
      return requireBinding(visible.binding, projectId, canvasId, entityId);
    } },
  };
}

/** Original placement helper calls this synchronously after validating every
 * live binding/witness. No arbitrary geometry, parent or lifecycle API opens. */
export async function commitNativeCollectionGeometry(input: {
  readonly projectId: string; readonly canvasId: string; readonly collectionId: string;
  readonly nodeId: string; readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState(), api = canvas.rfInstance;
  if (canvas.status !== 'ready' || canvas.canvasId !== input.canvasId || shell.projectId !== input.projectId
    || !shell.activeWorkspaceId || shell.surfaceCanvasId[shell.activeSurface] !== input.canvasId
    || !api?.placeCollectionCarrier) throw new Error('原集合几何／历史owner尚未就绪。');
  const context = { projectId: input.projectId, canvasId: input.canvasId, workspaceId: shell.activeWorkspaceId };
  const isCurrent = () => {
    const live = useCanvasStore.getState(), current = useLcosShellStore.getState();
    return live.status === 'ready' && live.canvasId === input.canvasId && live.rfInstance === api
      && current.projectId === input.projectId && current.activeWorkspaceId === context.workspaceId
      && current.surfaceCanvasId[current.activeSurface] === input.canvasId;
  };
  // The original bridge performs its O8 flush and final identity/geometry
  // check inside this one synchronous placement call; no second pre-flush.
  const placed = api.placeCollectionCarrier({ ...input, ...context }, { isCurrent });
  if (placed?.ok !== true) throw new Error(placed?.reason || '原几何owner未接收集合位置。');
  // updateNode queues a controlled ReactFlow update. Observe the actual sole
  // Flow owner; do not mirror a provisional position or guess a delay.
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let releaseCanvas = () => {}, releaseShell = () => {};
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); releaseCanvas(); releaseShell();
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (!isCurrent()) return finish(new Error('等待原几何回执时现场已切换；接收关系保留，未重放。'));
      const node = useCanvasStore.getState().nodes.find(candidate => candidate.id === input.nodeId);
      const ref = node?.data?.lcos_collection_ref as Record<string, unknown> | undefined;
      if (!node || !(node.type === 'lcos-collection' || node.type === 'pile' && node.data?.lcos_native_collection === true) || node.data?.id !== input.nodeId
        || ref?.projectId !== context.projectId || ref?.canvasId !== context.canvasId
        || ref?.workspaceId !== context.workspaceId || ref?.collectionId !== input.collectionId
        || node.dragging || node.data?.locked) return finish(new Error('原集合身份或编辑现场已变化；未借用其他节点。'));
      if (Math.abs(Number(node.position?.x) - input.position.x) <= 0.000001
        && Math.abs(Number(node.position?.y) - input.position.y) <= 0.000001) finish();
    };
    const timer = setTimeout(() => finish(new Error('原画布尚未确认集合位置；未按时间猜成功。')), 4000);
    releaseCanvas = useCanvasStore.subscribe(check);
    releaseShell = useLcosShellStore.subscribe(check);
    check();
  });
}

export async function drainNativeCollectionSaves(): Promise<void> {
  const canvas = useCanvasStore.getState(), api = canvas.rfInstance;
  if (!canvas.canvasId || canvas.status !== 'ready' || !api?.flushCanvas) throw new Error('集合位置尚未连接原保存owner。');
  if (await api.flushCanvas(canvas.canvasId) !== 'saved') throw new Error('集合接收已保存，空间位置保存未确认；未自动重试接收。');
  const live = useCanvasStore.getState();
  if (live.canvasId !== canvas.canvasId || live.rfInstance !== api) throw new Error('原画布保存完成时已切换，未宣布其他现场落位成功。');
}

export async function readNativeCollectionCanvas(canvasId: string) {
  const canvas = useCanvasStore.getState(), api = canvas.rfInstance;
  if (canvas.canvasId !== canvasId || canvas.status !== 'ready') throw new Error('原Canvas读回目标已经切换。');
  const value = await spatialRequest(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}`);
  const live = useCanvasStore.getState();
  if (live.canvasId !== canvasId || live.rfInstance !== api || value.id !== canvasId || !Array.isArray(value.nodes)) throw new Error('集合原空间读回身份不一致。');
  return { canvasId, state: { nodes: value.nodes } };
}

/** Read-only lab diagnostics; no store, writer, host port or document bytes escape. */
export function inspectNativeCollectionLanding() {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState(), drop = useLcosDropStore.getState();
  return { canvasId: canvas.canvasId, canvasStatus: canvas.status, apiReady: !!canvas.rfInstance,
    projectId: shell.projectId, activeSurface: shell.activeSurface, workspaceId: shell.activeWorkspaceId,
    activeSurfaceCanvasId: shell.surfaceCanvasId[shell.activeSurface] ?? null,
    placementHostReady: !!(shell.projectId && createNativeCollectionPlacementHost(shell.projectId, canvas.canvasId)),
    dropStatus: drop.state.status, transactionId: 'transactionId' in drop.state ? drop.state.transactionId : null,
    resolution: drop.resolution?.status ?? null, feedback: drop.feedback ? {
      hidden: drop.feedback.hidden, status: drop.feedback.receipt.status, message: drop.feedback.receipt.message,
    } : null };
}
