import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetTemporalPreviewForTests,
  useTemporalPreviewStore,
} from './temporalPreviewState';

describe('Temporal preview ownership', () => {
  beforeEach(resetTemporalPreviewForTests);

  it('deduplicates node ids without creating durable selection state', () => {
    useTemporalPreviewStore.getState().preview({
      ownerKey: 'context-a',
      canvasId: 'canvas-a',
      nodeIds: ['node-a', 'node-a', '', 'node-b'],
    });

    expect(useTemporalPreviewStore.getState()).toMatchObject({
      ownerKey: 'context-a',
      canvasId: 'canvas-a',
      nodeIds: ['node-a', 'node-b'],
    });
  });

  it('does not let a stale rail cleanup clear a newer worksite preview', () => {
    const store = useTemporalPreviewStore.getState();
    store.preview({ ownerKey: 'old', canvasId: 'canvas-a', nodeIds: ['node-a'] });
    store.preview({ ownerKey: 'new', canvasId: 'canvas-b', nodeIds: ['node-b'] });
    useTemporalPreviewStore.getState().clear('old');

    expect(useTemporalPreviewStore.getState()).toMatchObject({
      ownerKey: 'new',
      canvasId: 'canvas-b',
      nodeIds: ['node-b'],
    });
    useTemporalPreviewStore.getState().clear('new');
    expect(useTemporalPreviewStore.getState()).toMatchObject({
      ownerKey: null,
      canvasId: null,
      nodeIds: [],
    });
  });
});
