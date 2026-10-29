import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installNativeSurfaceSelection, requestNativeSurfaceSelection } from '../lab/surface-dock-ui.js';

test('Rail delegates once to the original Surface callback; it cannot claim arrival', async () => {
  const calls = [];
  const owner = { projectId: 'p', currentCanvasId: 'main', surfaces: new Map([['main', { canvasId: 'main' }], ['context', { canvasId: 'context' }]]),
    onSelect: async item => { calls.push(item); }, disabled: false };
  const release = installNativeSurfaceSelection(owner);
  try {
    assert.deepEqual(await requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'context' }), { delegated: true, sameCanvas: false });
    assert.deepEqual(calls, [{ id: 'context' }]);
    assert.deepEqual(await requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'main' }), { delegated: false, sameCanvas: true });
    await assert.rejects(requestNativeSurfaceSelection({ projectId: 'foreign', sourceCanvasId: 'main', targetCanvasId: 'context' }));
    await assert.rejects(requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'stale', targetCanvasId: 'context' }));
    await assert.rejects(requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'unknown' }));
    assert.equal(calls.length, 1);
  } finally { release(); }
  await assert.rejects(requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'context' }));
});

test('busy, replaced owners and original save rejection are preserved without replay', async () => {
  const surfaces = new Map([['main', { canvasId: 'main' }], ['context', { canvasId: 'context' }]]);
  let calls = 0;
  const install = disabled => installNativeSurfaceSelection({ projectId: 'p', currentCanvasId: 'main', surfaces, disabled,
    onSelect: async () => { calls++; throw new Error('Original save rejected'); } });
  const staleRelease = install(false);
  const releaseBusy = install(true);
  staleRelease();
  await assert.rejects(requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'context' }), /正忙/);
  releaseBusy();
  const release = install(false);
  try {
    await assert.rejects(requestNativeSurfaceSelection({ projectId: 'p', sourceCanvasId: 'main', targetCanvasId: 'context' }), /Original save rejected/);
    assert.equal(calls, 1);
  } finally { release(); }
});
