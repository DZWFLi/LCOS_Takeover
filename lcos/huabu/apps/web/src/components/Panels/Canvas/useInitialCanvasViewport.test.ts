import { describe, expect, it } from 'vitest';

import { resolveInitialCanvasViewport } from './useInitialCanvasViewport';

describe('initial canvas viewport', () => {
  it('uses a host transition pose without replacing the saved viewport target', () => {
    expect(resolveInitialCanvasViewport({
      override: { x: 12, y: 18, zoom: 0.7 },
      viewport: { x: 20, y: 30, zoom: 0.9 },
      nodeIds: ['a'],
    })).toEqual({
      defaultViewport: { x: 12, y: 18, zoom: 0.7 },
      nodeIdsToFit: [],
    });
  });

  it('keeps the existing first-fit path when a target has no saved viewport', () => {
    expect(resolveInitialCanvasViewport({
      viewport: null,
      nodeIds: ['a', 'b'],
    })).toEqual({ nodeIdsToFit: ['a', 'b'] });
  });
});
