/**
 * DIRECT_LIFT: GEN1 features/canvas/CanvasNodeVisual.tsx, ImageLoadPhase /
 * ImageLoadEvent / nextImageLoadPhase. Only file location and formatting changed.
 * Supplier provenance is recorded in the Stage6 handoff.
 */
export type ImageLoadPhase = 'loading' | 'ready' | 'error';
export type ImageLoadEvent = 'load' | 'error' | 'retry' | 'reset';

export function nextImageLoadPhase(_phase: ImageLoadPhase, event: ImageLoadEvent): ImageLoadPhase {
  if (event === 'load') return 'ready';
  if (event === 'error') return 'error';
  return 'loading';
}
