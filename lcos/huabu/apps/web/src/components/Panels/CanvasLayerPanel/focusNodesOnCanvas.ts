// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getViewportForBounds } from '@xyflow/react';

import type { ReactFlowInstance, Viewport } from '@xyflow/react';

type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ViewportSize = { width: number; height: number };

export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Keep the same flow-space point at the centre when the canvas is resized. */
export const anchorViewportCentre = (
  viewport: Viewport,
  previousSize: ViewportSize,
  nextSize: ViewportSize,
): Viewport => ({
  x: viewport.x + (nextSize.width - previousSize.width) / 2,
  y: viewport.y + (nextSize.height - previousSize.height) / 2,
  zoom: viewport.zoom,
});

/**
 * Reveal flow-space bounds with the smallest screen-space pan possible.
 * Oversized bounds are centred on the axis that cannot fit without zooming.
 */
export const revealBoundsInViewport = (
  viewport: Viewport,
  viewportSize: ViewportSize,
  bounds: NodeBounds,
  padding = 24,
): Viewport => {
  const safeWidth = Math.max(0, viewportSize.width - padding * 2);
  const safeHeight = Math.max(0, viewportSize.height - padding * 2);
  const left = bounds.x * viewport.zoom + viewport.x;
  const top = bounds.y * viewport.zoom + viewport.y;
  const right = left + bounds.width * viewport.zoom;
  const bottom = top + bounds.height * viewport.zoom;
  const safeRight = viewportSize.width - padding;
  const safeBottom = viewportSize.height - padding;

  let dx = 0;
  if (right - left > safeWidth) {
    dx = viewportSize.width / 2 - (left + right) / 2;
  } else if (left < padding) {
    dx = padding - left;
  } else if (right > safeRight) {
    dx = safeRight - right;
  }

  let dy = 0;
  if (bottom - top > safeHeight) {
    dy = viewportSize.height / 2 - (top + bottom) / 2;
  } else if (top < padding) {
    dy = padding - top;
  } else if (bottom > safeBottom) {
    dy = safeBottom - bottom;
  }

  if (dx === 0 && dy === 0) return viewport;
  return { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom };
};

/**
 * Reveal flow-space bounds inside one screen-space safe rectangle.
 *
 * `canvasRect` and `safeRect` use viewport/client coordinates. The returned
 * viewport remains React Flow's canvas-local transform, so Professional
 * Window geometry never becomes a second camera owner.
 */
export const revealBoundsInScreenRect = (
  viewport: Viewport,
  canvasRect: ScreenRect,
  safeRect: ScreenRect,
  bounds: NodeBounds,
  padding = 24,
): Viewport => {
  const available = {
    left: Math.max(canvasRect.left, safeRect.left) + padding,
    top: Math.max(canvasRect.top, safeRect.top) + padding,
    right: Math.min(canvasRect.right, safeRect.right) - padding,
    bottom: Math.min(canvasRect.bottom, safeRect.bottom) - padding,
  };
  if (available.right <= available.left || available.bottom <= available.top) {
    return viewport;
  }

  const left = canvasRect.left + bounds.x * viewport.zoom + viewport.x;
  const top = canvasRect.top + bounds.y * viewport.zoom + viewport.y;
  const right = left + bounds.width * viewport.zoom;
  const bottom = top + bounds.height * viewport.zoom;

  let dx = 0;
  if (right - left > available.right - available.left) {
    dx = (available.left + available.right) / 2 - (left + right) / 2;
  } else if (left < available.left) {
    dx = available.left - left;
  } else if (right > available.right) {
    dx = available.right - right;
  }

  let dy = 0;
  if (bottom - top > available.bottom - available.top) {
    dy = (available.top + available.bottom) / 2 - (top + bottom) / 2;
  } else if (top < available.top) {
    dy = available.top - top;
  } else if (bottom > available.bottom) {
    dy = available.bottom - bottom;
  }

  if (dx === 0 && dy === 0) return viewport;
  return { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom };
};

/** Resolve bounds even when `onlyRenderVisibleElements` left nodes unmeasured. */
export const getReliableNodeBounds = (
  rfInstance: ReactFlowInstance,
  nodeIds: string[],
): NodeBounds | null => {
  if (nodeIds.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const internal = rfInstance.getInternalNode(nodeId);
    if (!internal || internal.hidden) continue;
    const width =
      internal.measured.width ??
      internal.width ??
      internal.initialWidth ??
      (typeof internal.style?.width === 'number' ? internal.style.width : 0);
    const height =
      internal.measured.height ??
      internal.height ??
      internal.initialHeight ??
      (typeof internal.style?.height === 'number' ? internal.style.height : 0);
    const x = internal.internals.positionAbsolute.x;
    const y = internal.internals.positionAbsolute.y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + width > maxX) maxX = x + width;
    if (y + height > maxY) maxY = y + height;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/** Fit a set of nodes using reliable bounds rather than React Flow measurements. */
export const fitNodesOnCanvas = (
  rfInstance: ReactFlowInstance,
  nodeIds: string[],
  padding = 0.15,
): Promise<boolean> => {
  const bounds = getReliableNodeBounds(rfInstance, nodeIds);
  if (!bounds) return Promise.resolve(false);
  return rfInstance.fitBounds(bounds, { padding });
};

/**
 * Re-center the canvas viewport on a set of node ids.
 *
 * The Canvas runs with `onlyRenderVisibleElements`, so a target node that
 * is currently outside the viewport has never been measured by React
 * Flow. That breaks the obvious `rfInstance.fitView({ nodes })` call:
 * `fitView` derives its bounds from `node.measured.width|height`
 * (with fallbacks to `width` / `initialWidth`) and silently produces an
 * empty rect when none of those are set — leaving the viewport where it
 * was. That is the "click a row → canvas doesn't move" bug.
 *
 * This helper sidesteps the issue by computing the bounding rect from
 * `getInternalNode` (which always returns `internals.positionAbsolute`,
 * even for un-rendered nodes) and falling back to `style.width|height`
 * for the dimensions of nodes that haven't been mounted yet. We then
 * call `setCenter` directly. Zoom is capped at the current zoom (so we
 * never zoom IN past what the user has set) and at 1 (matching the
 * previous `maxZoom: 1` from the `fitView` callers).
 */
export const focusNodesOnCanvas = (
  rfInstance: ReactFlowInstance,
  nodeIds: string[],
  duration = 800,
): Promise<boolean> => {
  const bounds = getReliableNodeBounds(rfInstance, nodeIds);
  if (!bounds) return Promise.resolve(false);

  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const zoom = Math.min(rfInstance.getZoom(), 1);
  return rfInstance.setCenter(cx, cy, { duration, zoom }).then(
    () => true,
    () => false,
  );
};

/**
 * Locator camera command: preserve zoom and apply only the minimum pan needed
 * to reveal the current node union inside T4's published safe rectangle.
 */
export const locateNodesOnCanvas = (
  rfInstance: ReactFlowInstance,
  nodeIds: string[],
  input: {
    canvasRect: ScreenRect;
    safeRect: ScreenRect;
    duration?: number;
    padding?: number;
  },
): Promise<boolean> => {
  const bounds = getReliableNodeBounds(rfInstance, nodeIds);
  if (!bounds) return Promise.resolve(false);
  const current = rfInstance.getViewport();
  const next = revealBoundsInScreenRect(
    current,
    input.canvasRect,
    input.safeRect,
    bounds,
    input.padding,
  );
  if (next === current) return Promise.resolve(true);
  return rfInstance.setViewport(next, { duration: input.duration ?? 800 }).then(
    () => true,
    () => false,
  );
};

/**
 * Fit a multi-target focus without zooming in beyond the user's current view.
 * This stays beside Huabu's existing bounds helpers so LCOS callers do not
 * grow a second camera policy.
 */
export const focusNodeGroupOnCanvas = (
  rfInstance: ReactFlowInstance,
  nodeIds: string[],
  viewportSize: ViewportSize,
  duration = 800,
  padding = 0.15,
): Promise<boolean> => {
  const bounds = getReliableNodeBounds(rfInstance, nodeIds);
  if (!bounds) return Promise.resolve(false);
  const maxZoom = Math.min(rfInstance.getZoom(), 1);
  const viewport = getViewportForBounds(
    bounds,
    viewportSize.width,
    viewportSize.height,
    0.1,
    maxZoom,
    padding,
  );
  return rfInstance.setViewport(viewport, { duration }).then(
    () => true,
    () => false,
  );
};
