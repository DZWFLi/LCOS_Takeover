import type { NativeCanvasSnapshot } from './native-canvas-port';

type Api = NonNullable<NativeCanvasSnapshot['rfInstance']>;
export interface NativeLibraryMaterialPlacement {
  projectId: string; canvasId: string; workspaceId: string; artifactId: string; revisionId: string;
  artifactViewId?: string; fileRecordId: string; title?: string;
  position?: { readonly x: number; readonly y: number };
}
export type NativeLibraryMaterialPlacementResult = { status: 'placed' | 'already-present'; nodeId: string; artifactViewId: string; revisionId: string; outsideVisible?: boolean }
  | { status: 'unconfirmed' | 'rejected'; message: string };
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
/** Original geometry/edit state is observed, never replaced by a Canvas GET. */
const editable = (api: Api) => JSON.stringify({ nodes: api.getNodes().map(node => ({ id: node.id, type: node.type, data: node.data,
  position: node.position, width: node.width, height: node.height, style: node.style, parentId: node.parentId, hidden: node.hidden })), edges: api.getEdges() });

interface Bounds { left: number; top: number; right: number; bottom: number }
/** Reserve the larger of the connected native image/text carrier sizes. */
export const carrierFootprint = { width: 360, height: 280 };
/** Choose an initial top-left, without panning or touching any existing node. */
export function nativeMaterialPlacementPoint(bounds: Bounds, size: { width: number; height: number }, obstacles: readonly Bounds[]) {
  const gap = 16, left = bounds.left + gap, top = bounds.top + gap;
  const right = bounds.right - size.width - gap, bottom = bounds.bottom - size.height - gap;
  if (right < left || bottom < top) return null;
  const clampX = (x: number) => Math.min(right, Math.max(left, x)), clampY = (y: number) => Math.min(bottom, Math.max(top, y));
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const candidates = [center, { x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom }];
  const relevant = obstacles.filter(box => box.right > bounds.left && box.left < bounds.right && box.bottom > bounds.top && box.top < bounds.bottom);
  for (const box of relevant) {
    const xs = [clampX(box.left - size.width - gap), clampX(box.right + gap)];
    const ys = [clampY(box.top - size.height - gap), clampY(box.bottom + gap)];
    for (const x of xs) { candidates.push({ x, y: center.y }, { x, y: top }, { x, y: bottom }); }
    for (const y of ys) { candidates.push({ x: center.x, y }, { x: left, y }, { x: right, y }); }
    for (const x of xs) for (const y of ys) candidates.push({ x, y });
  }
  const score = ({ x, y }: { x: number; y: number }) => ({ overlap: relevant.reduce((sum, box) => sum
    + Math.max(0, Math.min(x + size.width, box.right + gap) - Math.max(x, box.left - gap))
      * Math.max(0, Math.min(y + size.height, box.bottom + gap) - Math.max(y, box.top - gap)), 0),
  distance: (x - center.x) ** 2 + (y - center.y) ** 2 });
  let point = candidates[0]!, best = score(point);
  for (const candidate of candidates.slice(1)) {
    const value = score(candidate);
    if (value.overlap < best.overlap || value.overlap === best.overlap && value.distance < best.distance) { point = candidate; best = value; }
  }
  return best.overlap === 0 ? point : null;
}

export function visibleCanvas() {
  const pane = typeof document === 'undefined' ? null : document.querySelector('.react-flow');
  const rect = pane?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
  let left = rect.left, right = rect.right;
  // fH owns this exact shipped dockbar root. Reserve only its live visible
  // edge; it is unmounted when jF's Library replaces the rail. Never add a
  // fixed phantom width or change the Canvas/camera to make room.
  for (const element of document.querySelectorAll('[data-library-view="library"], [data-lcos-native-chat-frame], [data-testid="canvas-dockbar-container"]')) {
    if (element.getAttribute?.('aria-hidden') === 'true'
      || element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || box.bottom <= rect.top || box.top >= rect.bottom) continue;
    if (box.left <= rect.left + 24 && box.right < right) left = Math.max(left, box.right);
    if (box.right >= rect.right - 24 && box.left > left) right = Math.min(right, box.left);
  }
  return { left, right, top: rect.top, bottom: rect.bottom };
}

function initialPosition(api: Api) {
  const bounds = visibleCanvas();
  const zoom = api.getZoom?.() ?? api.getViewport().zoom;
  if (bounds && Number.isFinite(zoom) && zoom > 0 && api.screenToFlowPosition) {
    const obstacles = [...document.querySelectorAll('.react-flow__node, [aria-label="材料预览"], .canvas-header-chrome, [data-lcos-surface-dock], [data-testid="canvas-dockbar-container"]')]
      .map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const point = nativeMaterialPlacementPoint(bounds,
      { width: carrierFootprint.width * zoom, height: carrierFootprint.height * zoom }, obstacles);
    if (point) return api.screenToFlowPosition(point);
  }
  // The original Canvas owns the fallback geometry. A failed read must not
  // silently place at (0,0) or choose a knowingly overlapping visible slot.
  const point = api.findMaterialPlacement?.(carrierFootprint);
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
}

export function materialOutsideVisible(api: Api, node: { id: string; position?: { x: number; y: number }; width?: number; height?: number }): boolean {
  const bounds = visibleCanvas();
  if (!bounds || !api.flowToScreenPosition || !node.position) return true;
  const point = api.flowToScreenPosition(node.position), zoom = api.getZoom?.() ?? api.getViewport().zoom;
  const box = { left: point.x, top: point.y, right: point.x + (node.width ?? carrierFootprint.width) * zoom,
    bottom: point.y + (node.height ?? carrierFootprint.height) * zoom };
  return box.left < bounds.left || box.top < bounds.top || box.right > bounds.right || box.bottom > bounds.bottom;
}

/** One explicit locate gesture, through the original camera API. Account for
 * its overlaid rails instead of centering a material behind the right rail. */
export async function locateNativeMaterialNodes(nodeIds: readonly string[], { api, isCurrent }: { api: Api; isCurrent(): boolean }): Promise<boolean> {
  if (!nodeIds.length || !isCurrent() || nodeIds.some(id => !api.getNodes().some(node => node.id === id))) return false;
  const bounds = visibleCanvas(), pane = typeof document === 'undefined' ? null : document.querySelector('.react-flow')?.getBoundingClientRect();
  const box = api.getNodesBounds?.(nodeIds) as { x?: number; y?: number; width?: number; height?: number } | undefined;
  if (bounds && pane && api.setViewport && box && [box.x, box.y, box.width, box.height].every(value => typeof value === 'number' && Number.isFinite(value))
    && box.width! > 0 && box.height! > 0 && bounds.right - bounds.left > 48 && bounds.bottom - bounds.top > 48) {
    const zoom = Math.min(1.3, (bounds.right - bounds.left - 48) / box.width!, (bounds.bottom - bounds.top - 48) / box.height!);
    if (!isCurrent()) return false;
    const result = await api.setViewport({ zoom,
      x: (bounds.left + bounds.right) / 2 - pane.left - (box.x! + box.width! / 2) * zoom,
      y: (bounds.top + bounds.bottom) / 2 - pane.top - (box.y! + box.height! / 2) * zoom }, { duration: 180 });
    return result !== false && isCurrent();
  }
  if (!api.fitView || !isCurrent()) return false;
  const result = await api.fitView({ nodes: nodeIds.map(id => ({ id })), padding: .3, maxZoom: 1.3, duration: 180 });
  return result !== false && isCurrent();
}

export async function placeNativeLibraryMaterial(input: NativeLibraryMaterialPlacement,
  { api, isCurrent: sceneIsCurrent, readOnly = false, signal }: { api: Api; isCurrent: () => boolean; readOnly?: boolean; signal?: AbortSignal }): Promise<NativeLibraryMaterialPlacementResult> {
  const isCurrent = () => !signal?.aborted && sceneIsCurrent();
  const rejected = (message: string): NativeLibraryMaterialPlacementResult => ({ status: 'rejected', message });
  const unconfirmed = (message: string): NativeLibraryMaterialPlacementResult => ({ status: 'unconfirmed', message });
  if (![input.projectId, input.canvasId, input.workspaceId, input.artifactId, input.revisionId, input.fileRecordId].every(nonEmpty)
    || !isCurrent() || !api?.flushCanvas || !api.synchronizeMaterialProjection)
    return rejected('当前画布或材料身份尚未就绪，没有提交投放。');
  const point = input.position;
  if (point !== undefined && (!point || typeof point !== 'object' || Array.isArray(point)
    || !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || Object.keys(point).some(key => key !== 'x' && key !== 'y')))
    return rejected('释放位置无法确认，没有提交投放。');
  // A drop already chose its world point. Keep that released value across the
  // asynchronous read; button placement alone asks the original layout owner.
  const releasedPosition = point === undefined ? undefined : { x: point.x, y: point.y };
  const target = { projectId: input.projectId, workspaceId: input.workspaceId, artifactId: input.artifactId,
    revisionId: input.revisionId, fileRecordId: input.fileRecordId, ...(input.artifactViewId ? { artifactViewId: input.artifactViewId } : {}) };
  const base = `/api/lcos/canvases/${encodeURIComponent(input.canvasId)}/materials:place`;
  let posted = false;
  try {
    if (!readOnly && await api.flushCanvas(input.canvasId) !== 'saved') return rejected('原画布还有未确认保存的编辑，请先核对；没有投放材料。');
    if (!isCurrent()) return rejected('现场已切换，没有提交到其他画布。');
    const before = editable(api);
    const read = async (address: string, init?: RequestInit) => {
      const response = await fetch(address, { cache: 'no-store', redirect: 'error', ...init, signal });
      const envelope = await response.json();
      if (!response.ok || envelope?.code !== 0 || !envelope.data) throw new Error('材料投放回执尚未确认。');
      return envelope.data;
    };
    const query = new URLSearchParams(target).toString();
    let receipt = await read(base + '?' + query);
    const sameReceipt = (value: any) => value.project_id === input.projectId && value.canvas_id === input.canvasId
      && value.workspace_id === input.workspaceId && value.artifact_id === input.artifactId
      && value.revision_id === input.revisionId && value.file_record_id === input.fileRecordId && value.provider_execution_started === false;
    if (!sameReceipt(receipt)) return rejected('这份放置记录不属于当前材料或画布，没有提交新的投放。');
    if (!isCurrent() || before !== editable(api)) return rejected('读取期间现场或编辑已变化，没有提交投放。');
    if (receipt.state === 'partial') return unconfirmed('已有部分放置记录，但画布显示还没确认；请核对放置结果，不会重复创建。');
    if (receipt.state === 'absent') {
      if (readOnly) return unconfirmed('还没找到已放置的准确版本，请继续核对；本次没有重新放置。');
      const position = releasedPosition ?? initialPosition(api);
      if (!position) return rejected('画布空白位置暂时无法确认，原布局保留；请稍后重试。');
      posted = true;
      receipt = await read(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...target, ...(position ? { position } : {}) }) });
    } else if (receipt.state !== 'present') throw new Error('材料投放状态无法核对。');
    if (!isCurrent() || before !== editable(api)) return unconfirmed('放置请求后现场或编辑已变化，原操作保留；请核对原画布，不会重复放置。');
    const node = receipt.node, ref = node?.data?.lcos_ref, binding = receipt.binding;
    if (receipt.project_id !== input.projectId || receipt.canvas_id !== input.canvasId || receipt.workspace_id !== input.workspaceId
      || receipt.artifact_id !== input.artifactId || receipt.revision_id !== input.revisionId || receipt.file_record_id !== input.fileRecordId
      || receipt.provider_execution_started !== false || receipt.state !== 'present' || !nonEmpty(receipt.artifact_view_id)
      || !nonEmpty(node?.id) || node.id !== binding?.spatialId || binding.projectId !== input.projectId || binding.canvasId !== input.canvasId
      || binding.spatialKind !== 'node' || binding.entityType !== ref?.entityType || binding.entityId !== ref?.entityId
      || ref?.version !== 1 || ref.artifactId !== input.artifactId || ref.revisionId !== input.revisionId || ref.artifactViewId !== receipt.artifact_view_id)
      throw new Error('材料版本与原空间回执不一致。');
    const applied = await api.synchronizeMaterialProjection({ projectId: input.projectId, canvasId: input.canvasId,
      workspaceId: input.workspaceId, artifactId: input.artifactId, artifactViewId: receipt.artifact_view_id,
      revisionId: input.revisionId, node }, { isCurrent });
    if (applied?.ok !== true || !isCurrent()) return unconfirmed('已提交，但画布显示还没确认；请核对放置结果，不会重复放置。');
    const live = api.getNodes().find(candidate => candidate.id === node.id), liveRef = live?.data?.lcos_ref as Record<string, unknown> | undefined;
    if (liveRef?.artifactId !== input.artifactId || liveRef.revisionId !== input.revisionId || liveRef.artifactViewId !== receipt.artifact_view_id)
      return unconfirmed('原画布尚未读回准确版本，不能报告放置完成。');
    return { status: posted && receipt.already_present !== true ? 'placed' : 'already-present', nodeId: node.id,
      artifactViewId: receipt.artifact_view_id, revisionId: input.revisionId, outsideVisible: materialOutsideVisible(api, live!) };
  } catch {
    return posted || readOnly ? unconfirmed('放置结果尚未确认，原编辑与材料保留；请核对放置结果，不会重复放置。')
      : rejected('材料或画布暂时无法核对，没有提交新的投放。');
  }
}
