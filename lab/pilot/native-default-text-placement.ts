import type { NativeCanvasNode, NativeCanvasSnapshot } from './native-canvas-port';
import { carrierFootprint, locateNativeMaterialNodes, materialOutsideVisible, nativeMaterialPlacementPoint, visibleCanvas } from './native-material-placement-client';

type Api = NonNullable<NativeCanvasSnapshot['rfInstance']>;
type Host = { canvasId?: string; currentCanvasId?: string; projectId?: string; api?: Api };
const host = () => (globalThis as typeof globalThis & { __LCOS_NODE_LAB__?: Host }).__LCOS_NODE_LAB__;
const finite = (point?: Readonly<{ x: number; y: number }>): point is { x: number; y: number } =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** Called only by fH's default Add Text action, after its original XD factory.
 * Explicit click/drop/branch positions never call this function. No node,
 * selection, camera or history is authored until the original Ke consumes it. */
export function LCOSNativeDefaultTextPlacement(node: NativeCanvasNode, canvasId: string) {
  const owner = host(), api = owner?.api;
  const width = node.width ?? node.measured?.width, height = node.height ?? node.measured?.height;
  const isCurrent = () => !!api && host()?.api === api && host()?.projectId === owner?.projectId
    && host()?.canvasId === canvasId && (host()?.currentCanvasId ?? canvasId) === canvasId;
  if (!api || !owner?.projectId || !isCurrent() || node.type !== 'text' || !node.id || !finite(node.position)
    || !Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0) {
    throw new Error('原画布或文本尺寸尚未就绪，未创建新文本。');
  }
  // Reuse the existing connected-carrier planning allowance, not a new node
  // size. XD's actual dimensions and all later user resizing remain unchanged.
  const size = { width: Math.max(width!, carrierFootprint.width), height: Math.max(height!, carrierFootprint.height) }, bounds = visibleCanvas();
  const zoom = api.getZoom?.() ?? api.getViewport().zoom;
  let position: { x: number; y: number } | undefined;
  if (bounds && Number.isFinite(zoom) && zoom > 0 && api.flowToScreenPosition && api.screenToFlowPosition) {
    const obstacles = [...document.querySelectorAll('.react-flow__node, [aria-label="材料预览"], .canvas-header-chrome, [data-lcos-surface-dock], [data-library-view="library"], [data-lcos-native-chat-frame]')]
      .map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const preferred = api.flowToScreenPosition(node.position), screenSize = { width: size.width * zoom, height: size.height * zoom };
    const right = preferred.x + screenSize.width, bottom = preferred.y + screenSize.height;
    const clear = preferred.x >= bounds.left && preferred.y >= bounds.top && right <= bounds.right && bottom <= bounds.bottom
      && !obstacles.some(box => preferred.x < box.right && right > box.left && preferred.y < box.bottom && bottom > box.top);
    if (clear) position = node.position;
    else {
      const point = nativeMaterialPlacementPoint(bounds, screenSize, obstacles);
      if (point) position = api.screenToFlowPosition(point);
    }
  }
  // This is the same installed export-placement algorithm used by material
  // placement, not a second layout engine. It never moves the camera.
  position ??= api.findMaterialPlacement?.(size);
  if (!finite(position) || !isCurrent()) throw new Error('画布空白位置暂时无法确认，未创建新文本。');
  const placed = position === node.position ? node : { ...node, position: { ...position } };
  const outsideVisible = materialOutsideVisible(api, placed);
  return {
    node: placed, outsideVisible,
    async locate(): Promise<boolean> {
      if (!isCurrent()) return false;
      const published = () => isCurrent() && api.getNodes().some(value => value.id === node.id && value.type === 'text');
      if (!published()) {
        if (typeof api.subscribeNative !== 'function') return false;
        const ready = await new Promise<boolean>(resolve => {
          let dispose = () => {}, finished = false;
          const timer = setTimeout(() => finish(false), 2000);
          const finish = (ok: boolean) => { if (finished) return; finished = true; clearTimeout(timer); dispose(); resolve(ok); };
          dispose = api.subscribeNative!(() => { if (!isCurrent()) finish(false); else if (published()) finish(true); });
          if (finished) dispose();
          if (published()) finish(true);
          else if (!isCurrent()) finish(false);
        });
        if (!ready) return false;
      }
      return isCurrent() && locateNativeMaterialNodes([node.id], { api, isCurrent });
    },
  };
}
