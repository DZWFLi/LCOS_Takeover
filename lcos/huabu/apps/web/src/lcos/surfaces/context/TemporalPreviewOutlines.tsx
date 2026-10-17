import { useStore, useViewport } from '@xyflow/react';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

import { getAbsolutePosition, getNodeSize, type NestableNode } from '@huabu/shared/canvas-engine';

import useCanvasStore from '@/store/canvasStore';

import { useTemporalPreviewStore } from './temporalPreviewState';

import type { CanvasNode } from '@/components/Nodes/types';

export function selectTemporalPreviewNodes(
  nodes: readonly CanvasNode[],
  requestedNodeIds: readonly string[],
): readonly CanvasNode[] {
  if (requestedNodeIds.length === 0) return [];
  const requested = new Set(requestedNodeIds);
  return nodes.filter((node) => requested.has(node.id));
}

function ActiveTemporalPreviewOutlines({
  requestedNodeIds,
}: {
  readonly requestedNodeIds: readonly string[];
}): React.JSX.Element | null {
  // Keep these high-frequency subscriptions out of the idle owner. The child
  // exists only for the lifetime of one active Episode preview.
  const nodes = useCanvasStore((state) => state.nodes) as unknown as readonly CanvasNode[];
  const domNode = useStore((state) => state.domNode);
  const { zoom, x: viewportX, y: viewportY } = useViewport();
  const previewNodes = useMemo(
    () => selectTemporalPreviewNodes(nodes, requestedNodeIds),
    [nodes, requestedNodeIds],
  );

  if (domNode === null || previewNodes.length === 0) return null;

  return createPortal(<>{previewNodes.map((node) => {
    const absolute = getAbsolutePosition(nodes as unknown as NestableNode[], node.id) ?? node.position;
    const size = getNodeSize(node);
    return <div
      key={node.id}
      data-lcos-temporal-preview-outline={node.id}
      className="lcos-temporal-preview-outline pointer-events-none absolute z-997"
      style={{
        left: absolute.x * zoom + viewportX,
        top: absolute.y * zoom + viewportY,
        width: (size.width || 200) * zoom,
        height: (size.height || 100) * zoom,
        borderRadius: 8 * zoom,
      }}
    />;
  })}</>, domNode);
}

/**
 * One canvas-level visual seam for Episode hover. This is deliberately
 * separate from SelectionOutlines: preview never raises toolbars, mutates
 * selection or changes the camera.
 */
export function TemporalPreviewOutlines(): React.JSX.Element | null {
  const currentCanvasId = useCanvasStore((state) => state.canvasId);
  const previewCanvasId = useTemporalPreviewStore((state) => state.canvasId);
  const requestedNodeIds = useTemporalPreviewStore((state) => state.nodeIds);
  if (previewCanvasId !== currentCanvasId || requestedNodeIds.length === 0) return null;
  return <ActiveTemporalPreviewOutlines requestedNodeIds={requestedNodeIds} />;
}
