// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { useViewport, useStore } from '@xyflow/react';
import { useRef } from 'react';

import {
  SEMANTIC_ZOOM_CONFIG,
  type LODRenderMode,
} from '@/config/semanticZoom';

export interface ResolveNodeLODModeInput {
  readonly enabled: boolean;
  readonly nodeType: string;
  readonly screenWidth: number;
  readonly previousMode: LODRenderMode;
}

/**
 * Resolve Huabu's native binary LOD without taking ownership from a hosted
 * presentation body. LCOS-hosted nodes pass `enabled: false`; their four-tier
 * density is resolved by the Gen2 presentation seam instead.
 */
export function resolveNodeLODMode(
  input: ResolveNodeLODModeInput,
): LODRenderMode {
  if (!input.enabled) return 'full';

  const lodConfig = SEMANTIC_ZOOM_CONFIG.nodeLOD[input.nodeType];
  if (!lodConfig || lodConfig.minimal !== 'minimal') return 'full';

  const { hysteresis, screenThresholds } = SEMANTIC_ZOOM_CONFIG;
  const threshold = screenThresholds.minimal ?? 120;
  return input.previousMode === 'minimal'
    ? input.screenWidth >= threshold + hysteresis
      ? 'full'
      : 'minimal'
    : input.screenWidth < threshold - hysteresis
      ? 'minimal'
      : 'full';
}

/**
 * Returns the LODRenderMode for a specific node at the current viewport zoom.
 * Node types not listed in the config always return 'full'.
 *
 * A single boundary with hysteresis to avoid flicker near the edge:
 * full ↔ minimal on the node's screen-space WIDTH vs the `minimal` threshold.
 * A `minimal` label just keeps scaling down with the node as you zoom out
 * (its tier font is a canvas size), so there is no separate small-text floor.
 */
export function useNodeLOD(
  nodeId: string,
  nodeType: string,
  enabled = true,
): LODRenderMode {
  const { zoom } = useViewport();
  const nodeWidth = useStore((s) => {
    const node = s.nodeLookup.get(nodeId);
    return (node?.style?.width as number) || node?.measured?.width || 400;
  });

  const prevModeRef = useRef<LODRenderMode>('full');

  const screenWidth = nodeWidth * zoom;
  const mode = resolveNodeLODMode({
    enabled,
    nodeType,
    screenWidth,
    previousMode: prevModeRef.current,
  });

  prevModeRef.current = mode;
  return mode;
}
