import { useEffect, useRef } from 'react';
import useCanvasStore from './native-canvas-port';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { useLcosShellStore, type LcosSurfaceKey } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { surfaceDockDropSemantic } from '../../lcos/huabu/apps/web/src/lcos/shell/surfaceDockDrop';
import { usePortalDropWorkspaceContext, type PortalDropWorkspaceContextValue } from '../../lcos/huabu/apps/web/src/lcos/drop/PortalDropWorkspaceContext';
import { isDropPointExposed } from '../../lcos/huabu/apps/web/src/lcos/drop/dropOcclusion';
import { rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry';
import type { DropTargetRegistration } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';

export interface NativeSurfaceDockDropState {
  readonly projectId: string | null;
  readonly canvasId: string | null;
  readonly api: object | null;
  readonly ready: boolean;
  readonly surfaceCanvasId: Readonly<Partial<Record<LcosSurfaceKey, string>>>;
  readonly context: PortalDropWorkspaceContextValue | null;
}
const surfaces: readonly LcosSurfaceKey[] = ['main', 'context', 'workflow'];
const labels = { main: 'Main', context: 'Context', workflow: 'Workflow' };
export const NATIVE_SURFACE_DOCK_TARGET_IDS = Object.freeze({
  main: 'native-surface-dock:main', context: 'native-surface-dock:context', workflow: 'native-surface-dock:workflow',
} as const);
export function nativeSurfaceForDropTargetId(targetId: string): LcosSurfaceKey | undefined {
  return surfaces.find(surface => NATIVE_SURFACE_DOCK_TARGET_IDS[surface] === targetId);
}


/** The original Dock buttons are receivers, not a second navigation UI.
 * Resolve from the same root map and existing semantic factory used by GN2. */
export function createNativeSurfaceDockDropTarget(surface: LcosSurfaceKey, element: HTMLButtonElement,
  read: () => NativeSurfaceDockDropState): DropTargetRegistration | undefined {
  const captured = read();
  if (!captured.projectId || !element.isConnected) return undefined;
  const semantic = surfaceDockDropSemantic(captured.projectId, surface, captured.surfaceCanvasId[surface], captured.context);
  const readRect = () => {
    if (!element.isConnected || element.closest('[inert],[aria-hidden="true"]')) return undefined;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') return undefined;
    const rect = rectFromDomRect(element.getBoundingClientRect());
    return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
      && rect.width > 0 && rect.height > 0 ? rect : undefined;
  };
  const rect = readRect();
  if (!rect) return undefined;
  const current = () => {
    const live = read();
    return live.ready && !!live.api && live.api === captured.api && live.canvasId === captured.canvasId
      && live.projectId === captured.projectId && live.surfaceCanvasId[surface] === captured.surfaceCanvasId[surface]
      && JSON.stringify(surfaceDockDropSemantic(live.projectId, surface, live.surfaceCanvasId[surface], live.context))
        === JSON.stringify(semantic);
  };
  return {
    targetId: NATIVE_SURFACE_DOCK_TARGET_IDS[surface], label: labels[surface],
    kind: semantic.kind, semantic, priority: 50, rect, readRect,
    acceptsPoint: point => isDropPointExposed(element, point),
    get enabled() { return semantic.kind !== 'drop-exclusion' && current() && !element.disabled; },
    get ineligibleReason() { return semantic.kind === 'drop-exclusion' ? semantic.reason
      : !current() ? '原现场地址正在更新，材料保留。' : element.disabled ? '现场正在切换，请就绪后再投放。' : undefined; },
  };
}

/** Agent-ui owns this component and the one shared registry. The independent
 * surface-dock-ui.js keeps its existing Ke onClick/flush/navigation unchanged. */
export function NativeSurfaceDockDropTargets(): null {
  const context = usePortalDropWorkspaceContext();
  const projectId = useLcosShellStore(state => state.projectId);
  const surfaceCanvasId = useLcosShellStore(state => state.surfaceCanvasId);
  const canvasId = useCanvasStore(state => state.canvasId);
  const api = useCanvasStore(state => state.rfInstance);
  const status = useCanvasStore(state => state.status);
  const latest = useRef<NativeSurfaceDockDropState>({ projectId, surfaceCanvasId, canvasId, api, ready: status === 'ready', context });
  latest.current = { projectId, surfaceCanvasId, canvasId, api, ready: status === 'ready', context };
  useEffect(() => {
    const registered = new Map<LcosSurfaceKey, { element: HTMLButtonElement; release: () => void }>();
    const publish = () => {
      for (const surface of surfaces) {
        const matches = document.querySelectorAll<HTMLButtonElement>(`[data-lcos-surface-dock] button[data-lcos-surface="${surface}"]`);
        const element = matches.length === 1 ? matches[0] : undefined;
        const previous = registered.get(surface);
        if (previous?.element === element) continue;
        previous?.release(); registered.delete(surface);
        if (!element) continue;
        const target = createNativeSurfaceDockDropTarget(surface, element, () => latest.current);
        if (target) registered.set(surface, { element, release: useLcosDropStore.getState().registerTarget(target) });
      }
    };
    publish();
    const observer = new MutationObserver(publish);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', publish);
      for (const target of registered.values()) target.release();
    };
  }, [projectId, surfaceCanvasId, canvasId, api, status, context]);
  return null;
}
