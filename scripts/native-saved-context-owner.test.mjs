import assert from 'node:assert/strict';

import { isNativeSavedContextOwnerCurrent } from '../lab/pilot/native-saved-context-owner.ts';

const apiA = Object.freeze({ identity: 'tapnow-api-a' });
const apiB = Object.freeze({ identity: 'tapnow-api-b' });
const canvasA = Object.freeze({ projectId: 'project-a', canvasId: 'canvas-a', rfInstance: apiA });
const sameCanvasA = Object.freeze({ projectId: 'project-a', canvasId: 'canvas-a', rfInstance: apiA });

assert.equal(isNativeSavedContextOwnerCurrent(canvasA, sameCanvasA, apiA, 4, 4), true,
  'the exact captured project/Canvas/API and action generation remain current');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA,
  { ...sameCanvasA, rfInstance: apiB }, apiB, 4, 4), false,
'a replacement API on the same Canvas ID invalidates the captured action');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA,
  { ...sameCanvasA, canvasId: 'canvas-b' }, apiA, 4, 4), false,
'a different Canvas ID cannot receive the old selection');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA,
  { ...sameCanvasA, projectId: 'project-b' }, apiA, 4, 4), false,
'a different project cannot receive the old selection');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA, sameCanvasA, apiA, 4, 5), false,
'after committed A → B → A, the old generation stays invalid even when the same Canvas/API returns');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA, sameCanvasA, apiA, 11, 12), false,
'a late preview/apply/readback response from an old generation is not displayed');
assert.equal(isNativeSavedContextOwnerCurrent(canvasA, sameCanvasA, apiB, 4, 4), false,
'the live NodeLab host must still expose the exact captured API');

console.log(JSON.stringify({
  passed: true,
  scope: 'pure native Saved Context async owner guard; no browser/Core service or writes',
  cases: [
    'same exact owner remains valid',
    'same Canvas with replaced ReactFlow API is rejected',
    'Canvas/project switch rejects the old selection',
    'A → B → A invalidates the old action generation',
    'late generation response and host API replacement are rejected',
  ],
}, null, 2));
