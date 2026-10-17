import type { NativeCanvasSnapshot } from './native-canvas-port';
import type { ProjectionBinding } from '../../lcos/apps/web-gen2/src/spatial/projectionBinding';
import { visibleCanvas, nativeMaterialPlacementPoint, materialOutsideVisible } from './native-material-placement-client';

type Api = NonNullable<NativeCanvasSnapshot['rfInstance']>;
type Row = Record<string, any>;
export interface NativeLibraryCollectionPlacement {
  readonly projectId: string; readonly canvasId: string; readonly workspaceId: string; readonly collectionId: string;
  readonly position?: { readonly x: number; readonly y: number };
}
export type NativeLibraryCollectionPlacementResult = {
  readonly status: 'placed' | 'already-present'; readonly nodeId: string; readonly collectionId: string;
  readonly binding: ProjectionBinding; readonly outsideVisible: boolean;
} | { readonly status: 'unconfirmed' | 'rejected'; readonly message: string };
export interface NativeLibraryCollectionProjection {
  readonly state: 'absent' | 'partial' | 'present'; readonly presentation_received: boolean;
  readonly project_id: string; readonly canvas_id: string; readonly workspace_id: string; readonly collection_id: string;
  readonly provider_execution_started: false; readonly binding: ProjectionBinding | null; readonly node: Row | null;
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const editable = (api: Api) => JSON.stringify({ nodes: api.getNodes().map(node => ({ id: node.id, type: node.type,
  data: node.data, position: node.position, width: node.width, height: node.height, style: node.style,
  parentId: node.parentId, hidden: node.hidden })), edges: api.getEdges() });

/** This is the existing Core Collection carrier, rendered by original yFe/JT.
 * A legacy lcos-collection body is never accepted as a new Library landing. */
export function isNativeLibraryCollectionCarrier(node: unknown, input: Omit<NativeLibraryCollectionPlacement, 'position'>): node is Row {
  if (!record(node) || !text(node.id) || node.type !== 'pile' || !record(node.data)
    || node.data.id !== node.id || node.data.lcos_native_collection !== true) return false;
  const ref = node.data.lcos_collection_ref;
  return record(ref) && ref.projectId === input.projectId && ref.canvasId === input.canvasId
    && ref.workspaceId === input.workspaceId && ref.collectionId === input.collectionId;
}

function validateProjection(value: unknown, input: NativeLibraryCollectionPlacement): NativeLibraryCollectionProjection {
  if (!record(value) || value.project_id !== input.projectId || value.canvas_id !== input.canvasId
    || value.workspace_id !== input.workspaceId || value.collection_id !== input.collectionId
    || value.provider_execution_started !== false || typeof value.presentation_received !== 'boolean'
    || !['absent', 'partial', 'present'].includes(value.state)) throw new Error('Collection projection identity mismatch');
  if (value.state === 'present') {
    const binding = value.binding;
    if (!value.presentation_received || !isNativeLibraryCollectionCarrier(value.node, input) || !record(binding)
      || binding.projectId !== input.projectId || binding.canvasId !== input.canvasId || binding.spatialKind !== 'node'
      || binding.spatialId !== value.node.id || binding.entityType !== 'collection' || binding.entityId !== input.collectionId)
      throw new Error('Collection carrier identity mismatch');
  } else if (value.state === 'absent' && (value.binding !== null || value.node !== null)) throw new Error('Collection absence has a carrier');
  return value as NativeLibraryCollectionProjection;
}

const base = (input: NativeLibraryCollectionPlacement) => `/api/lcos/canvases/${encodeURIComponent(input.canvasId)}`;
async function request(input: NativeLibraryCollectionPlacement, signal?: AbortSignal, post?: Row) {
  const address = post ? `${base(input)}/collections:project`
    : `${base(input)}/collections/${encodeURIComponent(input.collectionId)}/projection`;
  const response = await fetch(address, { cache: 'no-store', redirect: 'error', signal,
    ...(post ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(post) } : {}) });
  const payload = await response.json();
  if (!response.ok || payload?.code !== 0 || !payload.data) throw new Error('Collection projection receipt unavailable');
  return validateProjection(payload.data, input);
}

/** A preview read does not project, move, or change Presentation membership. */
export function readNativeLibraryCollectionProjection(input: NativeLibraryCollectionPlacement, signal?: AbortSignal) {
  return request(input, signal);
}

function positionFor(api: Api) {
  // Native pile's existing initial hint, not a new renderer size contract.
  const footprint = { width: 250, height: 244 }, bounds = visibleCanvas(), zoom = api.getZoom?.() ?? api.getViewport().zoom;
  if (bounds && Number.isFinite(zoom) && zoom > 0 && api.screenToFlowPosition && typeof document !== 'undefined') {
    const obstacles = [...document.querySelectorAll('.react-flow__node, [aria-label="材料预览"], .canvas-header-chrome, [data-lcos-surface-dock], [data-testid="canvas-dockbar-container"]')]
      .map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const point = nativeMaterialPlacementPoint(bounds, { width: footprint.width * zoom, height: footprint.height * zoom }, obstacles);
    if (point) return api.screenToFlowPosition(point);
  }
  const point = api.findMaterialPlacement?.(footprint);
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
}

/** Wait for the original controlled ReactFlow publication; a successful bridge
 * call alone is not evidence that the real pile appeared. No mirrored store. */
async function publishedCarrier(api: Api, input: NativeLibraryCollectionPlacement, nodeId: string,
  isCurrent: () => boolean): Promise<Row | undefined> {
  const find = () => api.getNodes().find(node => node.id === nodeId && isNativeLibraryCollectionCarrier(node, input));
  if (!isCurrent()) return undefined;
  const ready = find(); if (ready) return ready;
  return new Promise(resolve => {
    let settled = false, release = () => {};
    const finish = (node?: Row) => { if (settled) return; settled = true; clearTimeout(timer); release(); resolve(node); };
    const check = () => { if (!isCurrent()) finish(); else { const node = find(); if (node) finish(node); } };
    const timer = setTimeout(() => finish(), 4000);
    release = api.subscribeNative?.(check) ?? (() => {});
    check();
  });
}

/** One user intent → one existing Assembly/ProjectToSpace producer. An unknown
 * POST can only be checked with GET; absence after a lost reply is not retry. */
export async function placeNativeLibraryCollection(input: NativeLibraryCollectionPlacement,
  { api, isCurrent: sceneIsCurrent, readOnly = false, signal }: {
    readonly api: Api; readonly isCurrent: () => boolean; readonly readOnly?: boolean; readonly signal?: AbortSignal;
  }): Promise<NativeLibraryCollectionPlacementResult> {
  const isCurrent = () => !signal?.aborted && sceneIsCurrent();
  const rejected = (message: string): NativeLibraryCollectionPlacementResult => ({ status: 'rejected', message });
  const unknown = (message: string): NativeLibraryCollectionPlacementResult => ({ status: 'unconfirmed', message });
  if (![input.projectId, input.canvasId, input.workspaceId, input.collectionId].every(text)
    || !isCurrent() || !api?.flushCanvas || !api.synchronizeCollectionCarrier)
    return rejected('当前画布尚未就绪，没有放置集合。');
  if (input.position !== undefined && (!record(input.position) || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)
    || Object.keys(input.position).some(key => key !== 'x' && key !== 'y'))) return rejected('释放位置无法确认，没有放置集合。');
  const released = input.position && { x: input.position.x, y: input.position.y };
  let posted = false;
  try {
    if (!readOnly && await api.flushCanvas(input.canvasId) !== 'saved') return rejected('画布还有未确认保存的编辑，请先核对；没有放置集合。');
    if (!isCurrent()) return rejected('现场已切换，没有放到其他画布。');
    const before = editable(api);
    let receipt = await request(input, signal);
    if (!isCurrent() || before !== editable(api)) return rejected('读取期间现场或编辑已变化，没有提交放置。');
    if (receipt.state === 'partial') return unknown('已有部分放置记录，请核对放置结果，不会重复创建。');
    if (receipt.state === 'absent') {
      if (readOnly) return unknown('放置结果还没确认，请继续核对；本次没有重新放置。');
      const position = released ?? positionFor(api);
      if (!position) return rejected('暂时找不到可用的画布位置，请稍后再试。');
      posted = true;
      receipt = await request(input, signal, { collectionId: input.collectionId, position });
    }
    if (receipt.state !== 'present') return unknown('已提交，集合显示还没确认，请核对放置结果。');
    if (!isCurrent() || before !== editable(api)) return unknown('放置后现场或编辑已变化，请回原画布核对；不会重复创建。');
    const applied = await api.synchronizeCollectionCarrier({ projectId: input.projectId, canvasId: input.canvasId,
      workspaceId: input.workspaceId, node: receipt.node! }, { isCurrent });
    if (applied?.ok !== true || !isCurrent()) return unknown('集合已接收，画布显示还没确认，请核对放置结果。');
    const live = await publishedCarrier(api, input, receipt.node!.id, isCurrent);
    if (!live || !isCurrent()) return unknown('集合已接收，原画布还没显示，请核对放置结果。');
    return { status: posted ? 'placed' : 'already-present', nodeId: live.id, collectionId: input.collectionId,
      binding: receipt.binding!, outsideVisible: materialOutsideVisible(api, live as any) };
  } catch {
    return posted || readOnly ? unknown('放置结果尚未确认，原内容保留；请核对放置结果，不会重复放置。')
      : rejected('集合或画布暂时无法读取，没有提交放置。');
  }
}
