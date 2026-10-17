import { getAbsolutePosition, getNodeSize, type NestableNode } from '@huabu/shared/canvas-engine';

import type { CanvasAnchorRect } from '@/components/Common/CanvasFloatingPopover';
import type { Node } from '@xyflow/react';

/** Read the current projection geometry, not the rectangle captured on open. */
export function composerNodeAnchor(nodes: readonly Node[], nodeId: string | undefined): CanvasAnchorRect | null {
  const node = nodes.find(candidate => candidate.id === nodeId);
  if (!node) return null;
  const position = getAbsolutePosition(nodes as NestableNode[], node.id) ?? node.position;
  const size = getNodeSize(node);
  return { x: position.x, y: position.y, width: size.width || 200, height: size.height || 100 };
}
