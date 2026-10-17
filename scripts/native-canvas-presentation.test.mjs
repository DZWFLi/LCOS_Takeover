import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'native-canvas-presentation-test-' + Date.now());
const portEntry = await buildPilotEntry('lab/pilot/native-canvas-port.ts', path.join(runtimeRoot, 'native-canvas-port.mjs'));
const facadeEntry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'));

const listeners = new Set();
let node = { id: 'native-text', type: 'text', position: { x: 10, y: 20 }, width: 250, height: 140,
  measured: { width: 250, height: 140 }, style: { width: 250, height: 140 },
  data: { id: 'native-text', text: '# Native body', lcos_ref: { entityType: 'artifact', artifactId: 'artifact-real' } } };
const apiCalls = { data: [], replace: [] };
const api = {
  getNodes: () => [node], getNode: (id) => node.id === id ? node : undefined,
  getEdges: () => [], getSelection: () => ({ nodeIds: [], edgeIds: [] }),
  getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  subscribeNative(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  updateNodeData(id, patch, options) {
    apiCalls.data.push({ id, patch: structuredClone(patch), options });
    node = { ...node, data: { ...node.data, ...patch } };
    for (const listener of listeners) listener();
  },
  updateNode(id, changes, options) {
    apiCalls.replace.push({ id, changes: structuredClone(changes), options });
    node = { ...node, ...changes, data: { ...node.data, ...changes.data } };
    for (const listener of listeners) listener();
  },
};
const windowListeners = new Map();
globalThis.window = { __LCOS_NODE_LAB__: { projectId: 'synthetic', canvasId: 'canvas-current', currentCanvasId: 'canvas-current', api },
  addEventListener(name, listener) { windowListeners.set(name, listener); },
  removeEventListener(name) { windowListeners.delete(name); } };
globalThis.document = { querySelector: () => null };
const port = await import(pathToFileURL(portEntry).href);
const store = port.default;

const initial = store.getState();
assert.equal(initial.status, 'ready');
assert.equal(initial.canvasId, 'canvas-current');
assert.equal(initial.pendingInlineEditNodeId, null);
initial.updateNodeData('native-text', { content: 'native updateNodeData payload' });
assert.equal(apiCalls.data.length, 1, 'generic original updateNodeData fields are still forwarded once');
assert.equal(apiCalls.data[0].id, 'native-text');
assert.equal(apiCalls.data[0].patch.content, 'native updateNodeData payload');

assert.throws(() => store.getState().updateNodeData('native-text', { lcosTextViewMode: 'canvas' }), /lcosTextViewMode/);
assert.throws(() => store.getState().updateNodeData('native-text', { lcosTextCollapsedIds: ['ok', 7] }), /array of strings/);
assert.throws(() => store.getState().updateNodeData('native-text', { lcosTextBeforeMindMapSize: { width: 0, height: 120 } }), /positive finite/);
assert.equal(apiCalls.data.length, 1, 'invalid presentation values fail before the original API is called');

port.updateNativeTextPresentation('native-text', {
  lcosTextViewMode: 'mindmap', lcosTextCollapsedIds: ['heading-a'],
  lcosTextBeforeMindMapSize: { width: 250, height: 140 },
}, { size: { width: 480, height: 260 }, position: { x: -15, y: 44 } });
assert.equal(apiCalls.replace.length, 1, 'face plus geometry is one original updateNode call');
assert.equal(apiCalls.data.length, 1, 'composite face update does not submit a second updateNodeData');
assert.equal(apiCalls.replace[0].id, 'native-text');
assert.equal(apiCalls.replace[0].changes.data.content, 'native updateNodeData payload');
assert.equal(apiCalls.replace[0].changes.data.lcos_ref.artifactId, 'artifact-real');
assert.equal(apiCalls.replace[0].changes.position.x, -15);
assert.equal(apiCalls.replace[0].changes.position.y, 44);
assert.equal(apiCalls.replace[0].changes.width, 480);
assert.equal(apiCalls.replace[0].changes.height, 260);
assert.deepEqual(apiCalls.replace[0].changes.measured, { width: 480, height: 260 });
assert.deepEqual(apiCalls.replace[0].changes.style, { width: 480, height: 260 });
assert.throws(() => port.updateNativeTextPresentation('native-text', { lcosTextViewMode: 'diagonal' }), /lcosTextViewMode/);
assert.equal(apiCalls.replace.length, 1, 'invalid helper input leaves the native replacement queue untouched');

const currentStore = store.getState();
currentStore.requestInlineEdit('native-text');
assert.equal(store.getState().pendingInlineEditNodeId, 'native-text', 'focus request is visible in the original-node adapter state');
store.getState().consumeInlineEditRequest('some-other-node');
assert.equal(store.getState().pendingInlineEditNodeId, 'native-text', 'a different node cannot consume the request');
store.getState().consumeInlineEditRequest('native-text');
assert.equal(store.getState().pendingInlineEditNodeId, null, 'the exact native node consumes the one-shot request');
assert.throws(() => store.getState().requestInlineEdit('missing-node'), /inline edit request/);

const staleStore = store.getState();
staleStore.requestInlineEdit('native-text');
assert.equal(store.getState().pendingInlineEditNodeId, 'native-text');
const otherApiCalls = [];
const otherApi = { ...api, getNodes: () => [], getNode: () => undefined,
  updateNodeData: (...args) => otherApiCalls.push(args), updateNode: (...args) => otherApiCalls.push(args) };
window.__LCOS_NODE_LAB__ = { projectId: 'synthetic', canvasId: 'canvas-next', currentCanvasId: 'canvas-next', api: otherApi };
assert.throws(() => staleStore.updateNodeData('native-text', { lcosTextViewMode: 'outline' }), /stale or non-current/);
assert.throws(() => port.updateNativeTextPresentation('native-text', { lcosTextViewMode: 'outline' }), /missing or non-text/);
assert.deepEqual(otherApiCalls, [], 'stale Canvas and absent target make no native write');
windowListeners.get('lcos-native-bridge-changed')?.();
assert.equal(store.getState().canvasId, 'canvas-next');
assert.equal(store.getState().pendingInlineEditNodeId, null, 'a canvas/API switch drops the old inline edit request');

process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const { startSurfaceCoreFacade } = await import(pathToFileURL(facadeEntry).href);
const origin = 'http://127.0.0.1:39823';
let facade;
const call = (method, address, body) => facade.handle({ method,
  pathname: new URL(address, origin).pathname, url: origin + address, body });
try {
  facade = await startSurfaceCoreFacade({ runtimeRoot: path.join(runtimeRoot, 'real-core'), publicOrigin: origin, fullIntegration: true });
  const canvasId = 'surface-core-main';
  const detailPath = '/api/canvas/v1/canvases/' + canvasId;
  const translation = await call('GET', '/api/lcos/translation');
  assert.equal(translation.status, 200);
  assert.equal(translation.body.data.fullScopeComplete, false);
  const savedContextModule = translation.body.data.modules.find((item) => item.id === 'saved-context-atlas');
  assert.equal(savedContextModule.owner, 'Existing ContextAtlasStage / NativeContextReferencePort / Core Assembly Presentation membership');
  assert.match(savedContextModule.caller, /Atlas focused Context summary/);
  assert.equal(savedContextModule.nativeUiVerified, false, 'backend checks do not certify the new Atlas GUI');
  const textBodyModule = translation.body.data.modules.find((item) => item.id === 'native-text-body');
  assert.equal(textBodyModule.owner, 'Existing Milkdown / LcosCanvasTextBody / LcosTextFaces');
  assert.equal(textBodyModule.nativeUiVerified, false);
  const textPresentationModule = translation.body.data.modules.find((item) => item.id === 'native-text-presentation');
  assert.equal(textPresentationModule.owner, 'Original ReactFlow updateNode / Huabu MERGE_NODE_DATA');
  assert.equal(textPresentationModule.nativeUiVerified, false, 'isolated tests do not assert native GUI acceptance');
  const textCreateModule = translation.body.data.modules.find((item) => item.id === 'native-project-text-create');
  assert.equal(textCreateModule.owner, 'Original XD/b_/fi text factory + NodeLab addNodes / existing Core text lifecycle');
  assert.equal(textCreateModule.nativeUiVerified, false, 'the new module does not claim native branch-drop GUI proof from backend tests');
  assert.ok(translation.body.data.unsupported.includes('complete Gen1 text parity/history pending'));
  const beforeResult = await call('GET', detailPath);
  assert.equal(beforeResult.status, 200, JSON.stringify(beforeResult.body));
  const before = beforeResult.body.data.nodes.find((item) => item.id === 'surface-main-text');
  assert.ok(before?.data?.lcos_ref?.artifactId);
  const artifactCount = facade.core.repository.getArtifacts(facade.core.projectId).length;
  const fileCount = facade.core.repository.getFileRecords(facade.core.projectId).length;
  const batchPath = detailPath + '/nodes:batchActions';
  const applyPresentation = (patch, geometry) => call('POST', batchPath, { canvas_id: canvasId,
    actions: [{ action: 'update', updates: [{ id: before.id, type: 'text', data: { id: before.id, ...patch }, ...(geometry ?? {}) }] }] });
  const saved = await applyPresentation({ lcosTextViewMode: 'mindmap', lcosTextCollapsedIds: ['heading-a', 'heading-b'],
    lcosTextBeforeMindMapSize: { width: 244, height: 150 } },
  { position: { x: 520, y: 430 }, measured: { width: 480, height: 260 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.core_saved, false, 'presentation changes have no Core body/title write');
  assert.equal(saved.body.data.spatial_saved, true, 'the Huabu carrier is the presentation state owner');
  assert.deepEqual(saved.body.data.lcos_text_receipts, [], 'presentation changes cannot invent a Core body receipt');
  const afterResult = await call('GET', detailPath);
  const after = afterResult.body.data.nodes.find((item) => item.id === before.id);
  assert.deepEqual(after.data.lcosTextViewMode, 'mindmap');
  assert.deepEqual(after.data.lcosTextCollapsedIds, ['heading-a', 'heading-b']);
  assert.deepEqual(after.data.lcosTextBeforeMindMapSize, { width: 244, height: 150 });
  assert.deepEqual(after.position, { x: 520, y: 430 });
  assert.deepEqual(after.measured, { width: 480, height: 260 });
  assert.equal(after.lcos_revision_id, before.lcos_revision_id, 'presentation-only writes do not create a Core text Revision');
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, artifactCount);
  assert.equal(facade.core.repository.getFileRecords(facade.core.projectId).length, fileCount);

  for (const [patch, expectedCode] of [
    [{ lcosTextViewMode: 'canvas' }, 'INVALID_ARGUMENT'],
    [{ lcosTextCollapsedIds: ['heading-a', 3] }, 'INVALID_ARGUMENT'],
    [{ lcosTextBeforeMindMapSize: { width: -1, height: 150 } }, 'INVALID_ARGUMENT'],
    [{ lcosTextUnownedFlag: true }, 'NODE_DATA_PATCH_NOT_IMPLEMENTED'],
  ]) {
    const rejected = await applyPresentation(patch);
    assert.notEqual(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, expectedCode);
  }
  const stillCurrent = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === before.id);
  assert.equal(stillCurrent.data.lcosTextViewMode, 'mindmap', 'invalid presentation values do not overwrite the confirmed spatial fields');
  assert.equal(stillCurrent.lcos_revision_id, before.lcos_revision_id);

  const lifecyclePrefs = { lcosTextViewMode: 'mindmap', lcosTextCollapsedIds: ['branch-1', 'branch-2'],
    lcosTextBeforeMindMapSize: { width: 252, height: 148 } };
  const lifecycleBody = '# Lifecycle presentation body\n\nThe body remains Core-owned.\n';
  const lifecycleOperation = (operationId, kind, phase) => ({ version: 1, operationId, kind, phase });
  const lifecycleCreate = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-primary-create', 'create', 'apply'),
    actions: [{ action: 'create', creates: [{ id: 'presentation-primary', type: 'text', position: { x: 160, y: 620 },
      measured: { width: 252, height: 148 }, data: { id: 'presentation-primary', type: 'generate', title: 'Lifecycle presentation sample',
        text: lifecycleBody, prompt: '', params: { model: 'gemini-3.1-flash-lite', provider: 'google' }, ...lifecyclePrefs } }] }] });
  assert.equal(lifecycleCreate.status, 200, JSON.stringify(lifecycleCreate.body));
  const lifecycleReceipt = lifecycleCreate.body.data.lifecycle_results[0].nodes[0];
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(lifecycleReceipt.data[key], value);
  let primaryLifecycleNode = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === 'presentation-primary');
  assert.equal(primaryLifecycleNode.data.text, lifecycleBody);
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(primaryLifecycleNode.data[key], value);
  const primaryRevisionId = primaryLifecycleNode.lcos_revision_id;
  const primaryArtifactId = primaryLifecycleNode.data.lcos_ref.artifactId;
  const lifecycleArtifactCount = facade.core.repository.getArtifacts(facade.core.projectId).length;
  const lifecycleFileCount = facade.core.repository.getFileRecords(facade.core.projectId).length;
  const lifecycleViewCount = facade.core.repository.getArtifactViews(primaryArtifactId).length;

  const invalidCreate = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('invalid-presentation-create', 'create', 'apply'),
    actions: [{ action: 'create', creates: [{ id: 'invalid-presentation-primary', type: 'text', position: { x: 160, y: 800 },
      measured: { width: 250, height: 150 }, data: { text: 'must not create', lcosTextViewMode: 'diagonal' } }] }] });
  assert.equal(invalidCreate.status, 400);
  assert.equal(invalidCreate.body.error.code, 'INVALID_ARGUMENT');
  const detailAfterInvalid = (await call('GET', detailPath)).body.data;
  assert.ok(!detailAfterInvalid.nodes.some((item) => item.id === 'invalid-presentation-primary'));
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, lifecycleArtifactCount);

  const originalImage = detailAfterInvalid.nodes.find((item) => item.type === 'image');
  const invalidImagePresentation = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('invalid-image-text-presentation', 'duplicate-view', 'apply'),
    actions: [{ action: 'create', creates: [{ id: 'invalid-image-presentation', type: 'image', position: { x: 800, y: 800 },
      measured: { width: 300, height: 200 }, lcos_ref: originalImage.data.lcos_ref,
      data: { id: 'invalid-image-presentation', title: originalImage.data.title, src: originalImage.data.src, type: 'upload',
        lcosTextViewMode: 'mindmap' } }] }] });
  assert.equal(invalidImagePresentation.status, 400, JSON.stringify(invalidImagePresentation.body));
  assert.equal(invalidImagePresentation.body.error.code, 'NODE_TYPE_MISMATCH');
  assert.ok(!(await call('GET', detailPath)).body.data.nodes.some((item) => item.id === 'invalid-image-presentation'));

  const primaryUndo = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-primary-create', 'create', 'undo'),
    lcos_refs: { 'presentation-primary': primaryLifecycleNode.data.lcos_ref },
    actions: [{ action: 'delete', delete_ids: ['presentation-primary'] }] });
  assert.equal(primaryUndo.status, 200, JSON.stringify(primaryUndo.body));
  assert.deepEqual(primaryUndo.body.data.lcos_refs['presentation-primary'], primaryLifecycleNode.data.lcos_ref);
  assert.ok(!(await call('GET', detailPath)).body.data.nodes.some((item) => item.id === 'presentation-primary'));
  const primaryRedo = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-primary-create', 'create', 'redo'),
    actions: [{ action: 'create', creates: [{ id: 'presentation-primary-restored', type: 'text', position: { x: 160, y: 620 },
      measured: { width: 252, height: 148 }, lcos_ref: primaryUndo.body.data.lcos_refs['presentation-primary'],
      data: { id: 'presentation-primary-restored', title: 'Lifecycle presentation sample', text: lifecycleBody, ...lifecyclePrefs } }] }] });
  assert.equal(primaryRedo.status, 200, JSON.stringify(primaryRedo.body));
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(primaryRedo.body.data.lifecycle_results[0].nodes[0].data[key], value);
  primaryLifecycleNode = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === 'presentation-primary-restored');
  assert.equal(primaryLifecycleNode.data.text, lifecycleBody);
  assert.equal(primaryLifecycleNode.data.lcos_ref.artifactId, primaryArtifactId);
  assert.equal(primaryLifecycleNode.lcos_revision_id, primaryRevisionId);
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(primaryLifecycleNode.data[key], value);
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, lifecycleArtifactCount);
  assert.equal(facade.core.repository.getFileRecords(facade.core.projectId).length, lifecycleFileCount);

  const copied = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-view-copy', 'duplicate-view', 'apply'),
    actions: [{ action: 'create', creates: [{ id: 'presentation-view-copy', type: 'text', position: { x: 500, y: 620 },
      measured: { width: 252, height: 148 }, lcos_ref: primaryLifecycleNode.data.lcos_ref,
      data: { id: 'presentation-view-copy', title: primaryLifecycleNode.data.title, text: lifecycleBody,
        ...lifecyclePrefs } }] }] });
  assert.equal(copied.status, 200, JSON.stringify(copied.body));
  const copiedReceipt = copied.body.data.lifecycle_results[0].nodes[0];
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(copiedReceipt.data[key], value);
  assert.equal(copiedReceipt.lcos_ref.entityType, 'view');
  assert.equal(copiedReceipt.lcos_ref.artifactId, primaryArtifactId);
  const copiedNode = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === 'presentation-view-copy');
  assert.equal(copiedNode.data.text, lifecycleBody);
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(copiedNode.data[key], value);
  assert.equal(copiedNode.lcos_revision_id, primaryRevisionId);
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, lifecycleArtifactCount);
  assert.equal(facade.core.repository.getFileRecords(facade.core.projectId).length, lifecycleFileCount);
  assert.equal(facade.core.repository.getArtifactViews(primaryArtifactId).length, lifecycleViewCount + 1);

  const copiedRef = copied.body.data.lcos_refs['presentation-view-copy'];
  const deletedCopy = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-view-copy', 'duplicate-view', 'undo'),
    lcos_refs: { 'presentation-view-copy': copiedRef },
    actions: [{ action: 'delete', delete_ids: ['presentation-view-copy'] }] });
  assert.equal(deletedCopy.status, 200, JSON.stringify(deletedCopy.body));
  assert.deepEqual(deletedCopy.body.data.lcos_refs['presentation-view-copy'], copiedRef);
  assert.ok(!(await call('GET', detailPath)).body.data.nodes.some((item) => item.id === 'presentation-view-copy'));

  const restored = await call('POST', batchPath, { canvas_id: canvasId,
    lcos_operation: lifecycleOperation('presentation-view-copy', 'duplicate-view', 'redo'),
    actions: [{ action: 'create', creates: [{ id: 'presentation-view-restored', type: 'text', position: { x: 760, y: 620 },
      measured: { width: 252, height: 148 }, lcos_ref: copiedRef,
      data: { id: 'presentation-view-restored', title: primaryLifecycleNode.data.title, text: lifecycleBody,
        ...lifecyclePrefs } }] }] });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const restoredReceipt = restored.body.data.lifecycle_results[0].nodes[0];
  assert.equal(restoredReceipt.nodeId, 'presentation-view-restored');
  assert.equal(restoredReceipt.lcos_ref.entityType, 'view');
  assert.equal(restoredReceipt.lcos_ref.entityId, copiedRef.entityId);
  assert.equal(restoredReceipt.lcos_ref.artifactId, primaryArtifactId);
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(restoredReceipt.data[key], value);
  const restoredNode = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === 'presentation-view-restored');
  assert.equal(restoredNode.data.text, lifecycleBody, 'restore always reads canonical Core bytes, not submitted renderer text');
  assert.equal(restoredNode.lcos_revision_id, primaryRevisionId);
  for (const [key, value] of Object.entries(lifecyclePrefs)) assert.deepEqual(restoredNode.data[key], value);
  assert.equal(facade.core.repository.getArtifact(String(primaryArtifactId)).currentRevisionId, primaryRevisionId,
    'presentation copy/delete/redo never creates or changes the Core body Revision');
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, lifecycleArtifactCount);
  assert.equal(facade.core.repository.getFileRecords(facade.core.projectId).length, lifecycleFileCount);
  assert.equal(facade.core.repository.getArtifactViews(primaryArtifactId).length, lifecycleViewCount + 1,
    'redo reuses the exact saved ArtifactView instead of creating another view or material');
  await facade.close();
  facade = await startSurfaceCoreFacade({ runtimeRoot: path.join(runtimeRoot, 'real-core'), publicOrigin: origin, fullIntegration: true });
  const reopened = (await call('GET', detailPath)).body.data.nodes.find((item) => item.id === before.id);
  assert.equal(reopened.data.lcosTextViewMode, 'mindmap', 'presentation fields survive reopening the real Huabu/Core stores');
  assert.deepEqual(reopened.data.lcosTextCollapsedIds, ['heading-a', 'heading-b']);
  assert.deepEqual(reopened.data.lcosTextBeforeMindMapSize, { width: 244, height: 150 });
  assert.deepEqual(reopened.position, { x: 520, y: 430 });
  assert.deepEqual(reopened.measured, { width: 480, height: 260 });
  assert.equal(reopened.lcos_revision_id, before.lcos_revision_id);
  console.log(JSON.stringify({ passed: true, scope: 'synthetic original-API adapter and isolated real Core/Huabu facade; no browser/runtime writes',
    runtimeRoot, cases: ['exact current Canvas/API and live NodeID checks', 'native updateNodeData forwards one original call',
      'presentation enum/list/size validation', 'mode plus geometry maps to one original updateNode replacement',
      'inline edit request/consume is transient and canvas/API-scoped', 'facade persists exact Huabu presentation fields and reads them back',
      'translation registry names exact text owners and keeps UI/full-scope verification false',
      'fresh text create, duplicate-view, delete/undo, and redo receipts/readback preserve validated text presentation fields',
      'image nodes reject text presentation; malformed values create no node or Core entity',
      'restore reads canonical Core body/revision and reuses exact saved ArtifactView without material duplication',
      'facade persists mode plus position/size through one spatial command batch', 'presentation survives real store reopen without Core revision change',
      'presentation does not create Core Revision/Artifact/FileRecord', 'unsupported presentation data remains fail-closed'] }, null, 2));
} finally {
  await facade?.close();
}
