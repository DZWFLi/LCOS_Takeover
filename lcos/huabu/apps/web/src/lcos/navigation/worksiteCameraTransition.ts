// Child-worksite camera transition — a thin adapter over Huabu's one RF owner.
//
// It never owns geometry, selection or a second viewport. The source approach
// is rendered by the current `canvasStore.rfInstance`; the exact source/target
// poses remain ordinary Huabu CanvasViewport values. Cross-canvas continuity is
// represented by one ephemeral intent in the existing shell store.

import { getReliableNodeBounds } from '@/components/Panels/CanvasLayerPanel/focusNodesOnCanvas';
import useCanvasStore from '@/store/canvasStore';

import { prefersReducedSpatialMotion } from '../ui/motion/useReducedSpatialMotion';

import type { CanvasViewport } from '@huabu/shared';

export type WorksiteCameraDirection = 'approach' | 'retreat';

const APPROACH_RATIO = 1.1;
const RETREAT_RATIO = 0.94;
const ENTRY_START_RATIO = 0.92;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.25;
const APPROACH_DURATION_MS = 240;
const RETREAT_DURATION_MS = 180;

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Scale one viewport around a screen-space anchor without moving that anchor. */
export function scaleViewportAroundPoint(
  viewport: CanvasViewport,
  size: ViewportSize,
  ratio: number,
  anchor = { x: size.width / 2, y: size.height / 2 },
): CanvasViewport {
  const zoom = clampZoom(viewport.zoom * ratio);
  const appliedRatio = zoom / viewport.zoom;
  return {
    x: anchor.x - (anchor.x - viewport.x) * appliedRatio,
    y: anchor.y - (anchor.y - viewport.y) * appliedRatio,
    zoom,
  };
}

/** A destination starts slightly wider, then settles into its saved Huabu pose. */
export function entryStartViewport(
  target: CanvasViewport,
  size: ViewportSize,
): CanvasViewport {
  return scaleViewportAroundPoint(target, size, ENTRY_START_RATIO);
}

function currentViewportSize(): ViewportSize {
  const wrapper = useCanvasStore.getState().canvasWrapper;
  const rect = wrapper?.getBoundingClientRect();
  return {
    width: rect !== undefined && rect.width > 0 ? rect.width : window.innerWidth,
    height: rect !== undefined && rect.height > 0 ? rect.height : window.innerHeight,
  };
}

/**
 * Retarget the current visible RF camera and resolve with the pose actually
 * reached. A later RF camera call naturally interrupts this interpolation;
 * no timer or parallel animation runtime is created.
 */
export async function animateCurrentWorksiteCamera(input: {
  readonly direction: WorksiteCameraDirection;
  readonly nodeIds?: readonly string[];
}): Promise<CanvasViewport | undefined> {
  const store = useCanvasStore.getState();
  const rf = store.rfInstance;
  const current = rf?.getViewport() ?? store.viewport ?? undefined;
  if (current === undefined || rf === null || prefersReducedSpatialMotion()) return current;

  const sourceCanvasId = store.canvasId;
  const size = currentViewportSize();
  const ratio = input.direction === 'approach' ? APPROACH_RATIO : RETREAT_RATIO;
  const duration = input.direction === 'approach' ? APPROACH_DURATION_MS : RETREAT_DURATION_MS;
  const visibleNodeIds = (input.nodeIds ?? []).filter((nodeId) =>
    store.nodes.some((node) => node.id === nodeId && node.hidden !== true));
  const bounds = getReliableNodeBounds(rf, visibleNodeIds);
  const target = bounds === null
    ? scaleViewportAroundPoint(current, size, ratio)
    : (() => {
        const zoom = clampZoom(current.zoom * ratio);
        const worldX = bounds.x + bounds.width / 2;
        const worldY = bounds.y + bounds.height / 2;
        return {
          x: size.width / 2 - worldX * zoom,
          y: size.height / 2 - worldY * zoom,
          zoom,
        };
      })();

  try {
    await rf.setViewport(target, { duration });
  } catch {
    return rf.getViewport();
  } finally {
    // The transition pose is not a durable framing choice. Keep the saved
    // viewport exact while the RF instance remains visibly at the reached pose.
    if (useCanvasStore.getState().canvasId === sourceCanvasId) {
      useCanvasStore.getState().setViewport(current);
    }
  }
  return rf.getViewport();
}

export function worksiteCameraViewportSize(): ViewportSize {
  return currentViewportSize();
}
