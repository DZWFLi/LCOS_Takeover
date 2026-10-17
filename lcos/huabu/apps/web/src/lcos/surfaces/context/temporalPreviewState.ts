import { create } from 'zustand';

export interface TemporalPreviewSnapshot {
  readonly ownerKey: string | null;
  readonly canvasId: string | null;
  readonly nodeIds: readonly string[];
}

interface TemporalPreviewState extends TemporalPreviewSnapshot {
  readonly preview: (input: {
    readonly ownerKey: string;
    readonly canvasId: string;
    readonly nodeIds: readonly string[];
  }) => void;
  readonly clear: (ownerKey: string) => void;
}

/**
 * One ephemeral bridge from the Context Temporal Rail to the canvas overlay.
 * It never writes React Flow selection, Core truth, camera or persistence.
 */
export const useTemporalPreviewStore = create<TemporalPreviewState>((set) => ({
  ownerKey: null,
  canvasId: null,
  nodeIds: [],
  preview: ({ ownerKey, canvasId, nodeIds }) => set({
    ownerKey,
    canvasId,
    nodeIds: [...new Set(nodeIds.filter((nodeId) => nodeId.length > 0))],
  }),
  clear: (ownerKey) => set((state) => state.ownerKey === ownerKey
    ? { ownerKey: null, canvasId: null, nodeIds: [] }
    : state),
}));

export function resetTemporalPreviewForTests(): void {
  useTemporalPreviewStore.setState({ ownerKey: null, canvasId: null, nodeIds: [] });
}
