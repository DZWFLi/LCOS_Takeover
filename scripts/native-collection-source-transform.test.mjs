import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { transformNativeCollectionPlacement, transformNativeCollectionOverlay } from '../lab/native-ui-source-transforms.mjs';

const sourceOf = relative => fs.readFileSync(path.join(currentGen2Root, 'huabu/apps/web/src/lcos', relative), 'utf8');
const placement = sourceOf('drop/assemblyCollectionPlacement.ts').replaceAll('\r\n', '\n');
const adapted = transformNativeCollectionPlacement(placement);
const restored = adapted
  .replace("import { nativeCollectionSavedPlacementMatches } from '../../../../../../../lab/pilot/native-collection-save-precision.mjs';\n", '')
  .replace("import { readNativeCollectionCanvas as getCanvas, drainNativeCollectionSaves as drainPendingSaves, commitNativeCollectionGeometry } from '../../../../../../../lab/pilot/native-collection-placement.ts';", "import { getCanvas } from '@/api/canvas';")
  .replace("import useCanvasStore from '@/store/canvasStore';", "import useCanvasStore, { drainPendingSaves } from '@/store/canvasStore';")
  .replace("import type { NativeCollectionPlacementHost as Gen2Host } from '../../../../../../../lab/pilot/native-collection-placement.ts';", "import type { Gen2Host } from '@local-creative-os/web-gen2';")
  .replace('  if (planned[0]) await commitNativeCollectionGeometry({ projectId, canvasId,\n    collectionId: planned[0].collectionId, nodeId: planned[0].nodeId, position: geometry[0]!.position });', "  canvas.beginGesture('SET_NODE_GEOMETRY');\n  canvas.setNodeGeometry(geometry);")
  .replace('placed.some(id => !nativeCollectionSavedPlacementMatches(getAbsolutePosition(nodes, id), point))', 'placed.some(id => !placementMatches(getAbsolutePosition(nodes, id), point))');
assert.equal(restored, placement,
  'all original positive receipt, binding, geometry witness, abort, duplicate/multi-collection, flush and saved readback logic survives byte-for-byte outside the explicit native port and saved-precision seams');
for (const witness of ['geometryAtRelease', 'preservedSourceNodeIds', 'Promise.all(planned.map',
  "item.channel === 'presentation-membership'", "item.channel === 'already-member'",
  'if (planned.length > 1)', 'await drainPendingSaves', 'await getCanvas(canvasId)', 'input.signal?.aborted']) {
  assert.ok(adapted.includes(witness), `current placement still owns ${witness}`);
}
assert.throws(() => transformNativeCollectionPlacement(placement.replace("canvas.beginGesture('SET_NODE_GEOMETRY');", 'canvas.changedGeometryOwner();')), /seam changed/);
assert.throws(() => transformNativeCollectionPlacement(placement + "\nimport { getCanvas } from '@/api/canvas';"), /seam changed/);

const overlay = sourceOf('LcosHostOverlay.tsx').replaceAll('\r\n', '\n');
const adaptedOverlay = transformNativeCollectionOverlay(overlay);
const restoredOverlay = adaptedOverlay
  .replace("import { createNativeCollectionPlacementHost } from '../../../../../../lab/pilot/native-collection-placement.ts';\n", '')
  .replace("import { useNativeWorksiteDropTarget } from '../../../../../../lab/pilot/native-worksite-drop.ts';\n", '')
  .replace('  const nativeWorksiteTargetRef = useNativeWorksiteDropTarget(projectId, canvasId, activeSurface, activeWorkspaceId);\n', '')
  .replace('    nativeWorksiteTargetRef,\n', '')
  .replace('    const targetRef = nativeWorksiteTargetRef;', "    const targetRef = activeSurface === 'main'\n      ? { kind: 'main' as const }\n      : activeWorkspaceId === null\n        ? undefined\n        : { kind: 'workspace' as const, id: activeWorkspaceId };")
  .replace('    const placementHost = createNativeCollectionPlacementHost(projectId, dropCanvasId);', '    const placementHost = useLcosHostStore.getState().host;')
  .replace('placementHost?.isCurrent() === true', 'useLcosHostStore.getState().host === placementHost');
assert.equal(restoredOverlay, overlay, 'current DropCommitRouter/preparation/abort and receiver geometry remain original outside narrow host and original Surface address seams');
assert.throws(() => transformNativeCollectionOverlay(overlay.replace('useLcosHostStore.getState().host === placementHost', 'true')), /seam changed/);
assert.doesNotMatch(adaptedOverlay, /useLcosHostStore\.setState\(/, 'the limited placement ports never impersonate a full global Gen2Host');
assert.throws(() => transformNativeCollectionOverlay(overlay.replace("{ kind: 'workspace' as const, id: activeWorkspaceId }", "{ kind: 'scene' as const, id: activeWorkspaceId }")), /seam changed/);
assert.throws(() => transformNativeCollectionOverlay(overlay.replace('    activeWorkspaceId,\n    canvasId,\n    canvasWrapper,', '    activeWorkspaceId,\n    canvasWrapper,')), /seam changed/);
console.log(JSON.stringify({ passed: true, source: currentGen2Root, mode: 'exact reversible source adaptation, not runtime/GUI evidence', cases: 9 }));
