// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { useCallback, useMemo, useState } from 'react';

import useCanvasStore from '@/store/canvasStore';

import { fitNodesOnCanvas } from '../CanvasLayerPanel/focusNodesOnCanvas';

import type { CanvasViewport } from '@huabu/shared';
import type { ReactFlowInstance } from '@xyflow/react';

type InitialCanvasViewport = {
  defaultViewport?: CanvasViewport;
  nodeIdsToFit: string[];
};

export function resolveInitialCanvasViewport(input: {
  readonly override?: CanvasViewport;
  readonly viewport: CanvasViewport | null;
  readonly nodeIds: readonly string[];
}): InitialCanvasViewport {
  if (input.override !== undefined) {
    return { defaultViewport: input.override, nodeIdsToFit: [] };
  }
  if (input.viewport !== null) {
    return { defaultViewport: input.viewport, nodeIdsToFit: [] };
  }
  return { nodeIdsToFit: [...input.nodeIds] };
}

export interface InitialCanvasViewportOptions {
  /**
   * LCOS owns the first frame through `LcosCanvasCommands`, which can account
   * for the route-level HUD safe area and its projection completion signal.
   * The legacy fit would otherwise run first and zoom a sparse canvas to giant
   * text before LCOS gets a chance to frame it.
   */
  readonly deferFit?: boolean;
  /** Presentation-only first pose; the saved viewport remains in canvasStore. */
  readonly initialViewportOverride?: CanvasViewport;
}

/** Restore a saved viewport or fit persisted node bounds on first mount. */
export const useInitialCanvasViewport = (
  options: InitialCanvasViewportOptions = {},
) => {
  const deferFit = options.deferFit === true;
  const initialViewport = useMemo<InitialCanvasViewport>(() => {
    const { viewport, nodes } = useCanvasStore.getState();
    return resolveInitialCanvasViewport({
      ...(options.initialViewportOverride === undefined
        ? {}
        : { override: options.initialViewportOverride }),
      viewport,
      nodeIds: nodes.map((node) => node.id),
    });
    // Sample once for this Canvas mount. Later motion stays with React Flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isPending, setIsPending] = useState(
    initialViewport.nodeIdsToFit.length > 0 && !deferFit,
  );

  const fitInitialViewport = useCallback(
    (instance: ReactFlowInstance) => {
      if (deferFit) {
        setIsPending(false);
        return;
      }
      if (initialViewport.nodeIdsToFit.length === 0) return;

      try {
        void fitNodesOnCanvas(instance, initialViewport.nodeIdsToFit)
          .catch(() => false)
          .finally(() => setIsPending(false));
      } catch {
        // Guard against a synchronous throw leaving the overlay stuck and the
        // canvas permanently hidden.
        setIsPending(false);
      }
    },
    [deferFit, initialViewport.nodeIdsToFit],
  );

  return {
    defaultViewport: initialViewport.defaultViewport,
    fitInitialViewport,
    isPending,
  };
};
