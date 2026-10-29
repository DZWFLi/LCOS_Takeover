import { railwayAggregatePayload } from '../../lcos/huabu/apps/web/src/lcos/drop/railwayAssemblyDrop';
import { acquireDrop } from '../../lcos/huabu/apps/web/src/lcos/lcosRecognizers';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { beginNativeLibraryAssemblyDrop, rejectNativeLibraryDropFallback } from './native-library-drop';
export { readNativeLibraryDropCapture } from './native-library-drop';

/** Reuse the original acquisition singleton. Exact-version release and
 * producer dispatch remain with the original Overlay/Router owner seam. */
export function LCOSNativeLibraryDragStart(event: Parameters<typeof beginNativeLibraryAssemblyDrop>[0], asset: unknown,
  notice: (message: string) => void) {
  return beginNativeLibraryAssemblyDrop(event, asset, {
    readOrigin: () => {
      const host = window.__LCOS_NODE_LAB__, shell = useLcosShellStore.getState();
      const canvasId = host?.currentCanvasId ?? host?.canvasId;
      return typeof host?.projectId === 'string' && shell.projectId === host.projectId
        && typeof canvasId === 'string' && host.api ? { projectId: host.projectId, canvasId, api: host.api } : null;
    },
    aggregatePayload: railwayAggregatePayload, read: () => useLcosDropStore.getState(), acquire: acquireDrop, cancel: () => useLcosDropStore.getState().cancel(), notice,
  });
}
export const LCOSNativeLibraryDropFallback = rejectNativeLibraryDropFallback;
