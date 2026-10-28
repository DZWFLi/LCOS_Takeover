import { visibleCanvas, locateNativeMaterialNodes } from './native-material-placement-client';

/** The original dH selection/highlight remains. A narrow viewport with an
 * overlaid rail delegates to the existing original-camera locate helper. */
export function LCOSNativeSearchLocateVisible(nodeId: string): boolean {
  const host = window.__LCOS_NODE_LAB__, api = host?.api, canvasId = host?.currentCanvasId || host?.canvasId;
  const pane = document.querySelector('.react-flow')?.getBoundingClientRect(), bounds = visibleCanvas();
  if (innerWidth > 640 || !api || !pane || !bounds
    || bounds.bottom >= pane.bottom - 1 && bounds.left <= pane.left + 1 && bounds.right >= pane.right - 1
    || !api.getNodesBounds || !api.setViewport
    || !api.getNodes().some((node: any) => node.id === nodeId)) return false;
  const current = () => window.__LCOS_NODE_LAB__?.api === api
    && (window.__LCOS_NODE_LAB__?.currentCanvasId || window.__LCOS_NODE_LAB__?.canvasId) === canvasId;
  void locateNativeMaterialNodes([nodeId], { api, isCurrent: current }).catch(() => { /* Original canvas remains available; no node write or retry. */ });
  return true;
}
