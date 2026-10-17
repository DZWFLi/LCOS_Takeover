import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const filename = 'page-Da_DfwiK.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
const transformed = transformHistoryIntentScript(filename,
  transformSurfaceDockScript(filename,
    transformNodeBridgeScript(filename, transformCutScript(filename, original))));

assert.ok(transformed.includes('inspectNativeHistory({canvasId:__lcosHistoryCanvasId,requestedCanvasId:__lcosQuery?.canvasId,nodeId:__lcosQuery?.nodeId,history:x.current,currentIndex:p.current})'),
  'AST transform must bind the read-only inspector to the exact O8 history ref and current-index ref discovered from the original owner.');
assert.match(transformed, /inspectNativeHistory:P\.inspectNativeHistory/,
  'B8 must forward the O8-owned inspector without a side channel.');
assert.match(transformed, /inspectNativeHistory:__lcosInspectNativeHistory\}=B8\(/,
  'the existing Canvas destructure receives the O8 callback from B8.');
assert.match(transformed, /LCOSOriginalNodeBridge,\{canvasId:e,undo:__lcosNativeUndo,redo:__lcosNativeRedo,originalNodes:[$A-Za-z_][$\w]*,backfillNodeReceipt:__lcosBackfillNodeReceipt,inspectNativeHistory:__lcosInspectNativeHistory\}/,
  'the original NodeBridge receives the callback through its existing props boundary.');
assert.equal(transformHistoryIntentScript(filename, transformed), transformed,
  'transform remains idempotent.');

const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');
const runtimeSandbox = { window: {}, structuredClone, Date,
  crypto: { randomUUID: (() => { let id = 0; return () => 'diagnostic-' + (++id); })() } };
vm.runInNewContext(runtimeSource, runtimeSandbox, { filename: 'startup-history-intent.js' });
const intent = runtimeSandbox.window.__LCOS_NATIVE_INTENT__;
assert.equal(typeof intent.inspectNativeHistory, 'function');

const branch = {
  id: 'branch-node', type: 'text', width: undefined, height: undefined,
  position: { x: 17.25, y: -4 },
  measured: { width: 250, height: 250 },
  data: { text: 'PRIVATE_BODY_MUST_NOT_ESCAPE', params: { secret: 'PRIVATE_PARAMS_MUST_NOT_ESCAPE' },
    lcos_ref: { version: 1, entityType: 'artifact', entityId: 'artifact-secret', artifactId: 'artifact-secret', revisionId: 'revision-secret' } },
};
const other = { id: 'other-node', type: 'image', width: 80, height: 60, measured: { width: 80, height: 60 },
  data: { src: 'PRIVATE_URL_MUST_NOT_ESCAPE' } };
const createOperation = { version: 1, operationId: 'create-op-1', kind: 'create', phase: 'apply' };
const history = [
  { state: { nodes: [other], edges: [] }, timestamp: 10 },
  { state: { nodes: [other, branch], edges: [] }, timestamp: 20,
    lcos_history_operations: [{ nodeId: 'branch-node', aliases: ['branch-node'], carrierId: 'branch-node', changeType: 'add',
      lcos_operation: createOperation, lcos_ref: branch.data.lcos_ref, lcos_snapshot: branch }] },
  { state: { nodes: [other, { ...branch, width: 250, height: 250 }], edges: [] }, timestamp: 30 },
];
const historyBefore = JSON.stringify(history);
const currentIndex = 2;
const currentIndexBefore = currentIndex;
const observed = intent.inspectNativeHistory({ canvasId: 'canvas-1', requestedCanvasId: 'canvas-1',
  nodeId: 'branch-node', history, currentIndex });
assert.equal(observed.ok, true);
assert.equal(observed.canvasId, 'canvas-1');
assert.equal(observed.currentIndex, 2);
assert.equal(observed.historySize, 3);
assert.equal(observed.canUndo, true);
assert.equal(observed.canRedo, false);
assert.deepEqual(JSON.parse(JSON.stringify(observed.undoTarget.nodes)), [
  { id: 'branch-node', type: 'text', position: { x: 17.25, y: -4 }, width: null, height: null, measured: { width: 250, height: 250 } },
]);
assert.deepEqual(JSON.parse(JSON.stringify(observed.undoTarget.operations)), [{
  nodeId: 'branch-node', aliases: ['branch-node'], carrierId: 'branch-node', changeType: 'add',
  operation: { version: 1, operationId: 'create-op-1', kind: 'create', phase: 'apply' }, unsupported: null,
}]);
assert.deepEqual(JSON.parse(JSON.stringify(observed.currentEntry.nodes)), [
  { id: 'branch-node', type: 'text', position: { x: 17.25, y: -4 }, width: 250, height: 250, measured: { width: 250, height: 250 } },
]);
assert.equal(observed.redoTarget, null);
const serializedObserved = JSON.stringify(observed);
for (const secret of ['PRIVATE_BODY_MUST_NOT_ESCAPE', 'PRIVATE_PARAMS_MUST_NOT_ESCAPE', 'PRIVATE_URL_MUST_NOT_ESCAPE',
  'artifact-secret', 'revision-secret', 'lcos_ref', 'data', 'edges']) {
  assert.equal(serializedObserved.includes(secret), false, `inspector must not return ${secret}.`);
}
assert.equal(JSON.stringify(history), historyBefore, 'inspection must not mutate O8 entries or node snapshots.');
assert.equal(currentIndex, currentIndexBefore, 'inspection must not advance or rewind O8 history.');
assert.deepEqual(Object.keys(observed.undoTarget.nodes[0]).sort(), ['height', 'id', 'measured', 'position', 'type', 'width']);

const afterUndo = intent.inspectNativeHistory({ canvasId: 'canvas-1', requestedCanvasId: 'canvas-1',
  nodeId: 'branch-node', history, currentIndex: 1 });
assert.equal(afterUndo.undoTarget.nodes.length, 0, 'the prior target snapshot reports that the branch ID is absent.');
assert.deepEqual(JSON.parse(JSON.stringify(afterUndo.redoTarget.nodes)), [
  { id: 'branch-node', type: 'text', position: { x: 17.25, y: -4 }, width: 250, height: 250, measured: { width: 250, height: 250 } },
]);
assert.deepEqual(JSON.parse(JSON.stringify(afterUndo.currentEntry.operations[0].operation)), createOperation,
  'the current/being-left O8 entry exposes its already-recorded create operation separately from the undo destination.');

assert.deepEqual(JSON.parse(JSON.stringify(intent.inspectNativeHistory({ canvasId: 'canvas-1', requestedCanvasId: 'canvas-foreign',
  nodeId: 'branch-node', history, currentIndex }))), { ok: false, reason: 'HISTORY_CANVAS_MISMATCH' },
  'foreign Canvas inspection must fail closed before returning history data.');
assert.deepEqual(JSON.parse(JSON.stringify(intent.inspectNativeHistory({ canvasId: 'canvas-1', requestedCanvasId: 'canvas-1',
  history, currentIndex }))), { ok: false, reason: 'HISTORY_NODE_ID_REQUIRED' }, 'a node ID is required to keep the query narrow.');
assert.deepEqual(JSON.parse(JSON.stringify(intent.inspectNativeHistory({ canvasId: 'canvas-1', requestedCanvasId: 'canvas-1',
  nodeId: 'branch-node', history, currentIndex: 99 }))), { ok: false, reason: 'HISTORY_OWNER_STATE_INVALID' });

const nodeBridgeSource = fs.readFileSync(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
assert.match(nodeBridgeSource, /inspectNativeHistory:\s*query\s*=>\s*typeof inspectNativeHistory === 'function'/,
  'the original NodeBridge API exposes only an explicit read-only history callback.');
assert.match(nodeBridgeSource, /historyCallbacks\.current\s*=\s*\{\s*undo,\s*redo,\s*backfillNodeReceipt,\s*inspectNativeHistory\s*\}/,
  'the stable bridge facade delegates to the latest original O8 callback.');
const executableBridge = nodeBridgeSource
  .replace(/^import [^\r\n]+;\r?\n/gm, '')
  .replace(/^export /gm, '') + '\n;globalThis.__historyBridgeTest={createOriginalNodeApi};';
const bridgeSandbox = {};
vm.runInNewContext(executableBridge, bridgeSandbox, { filename: 'startup-node-bridge.js' });
let forwardedQuery;
const receiptValue = { ...observed, undoTarget: { ...observed.undoTarget, nodes: observed.undoTarget.nodes.map(node => ({ ...node })) } };
const facade = bridgeSandbox.__historyBridgeTest.createOriginalNodeApi({
  getNodes: () => [], getEdges: () => [], getNode: () => undefined, getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}, { inspectNativeHistory: query => { forwardedQuery = query; return receiptValue; } });
const bridgeQuery = { canvasId: 'canvas-1', nodeId: 'branch-node' };
const bridgeQueryBefore = JSON.stringify(bridgeQuery);
const bridgeResult = facade.inspectNativeHistory(bridgeQuery);
assert.deepEqual(JSON.parse(JSON.stringify(forwardedQuery)), bridgeQuery);
assert.equal(JSON.stringify(bridgeQuery), bridgeQueryBefore, 'bridge forwarding must not mutate caller input.');
bridgeResult.undoTarget.nodes[0].width = 999;
bridgeResult.undoTarget.nodes[0].position.x = 999;
assert.equal(receiptValue.undoTarget.nodes[0].width, null, 'bridge returns a safe clone, not the O8 summary object reference.');
assert.equal(receiptValue.undoTarget.nodes[0].position.x, 17.25, 'read-only position diagnostics cannot mutate the original summary.');
assert.deepEqual(JSON.parse(JSON.stringify(bridgeSandbox.__historyBridgeTest.createOriginalNodeApi({
  getNodes: () => [], getEdges: () => [], getNode: () => undefined, getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}).inspectNativeHistory({}))), { ok: false, reason: 'Original history inspection port is unavailable.' });

console.log('PASS: O8 read-only snapshot inspection uses the parsed history/index refs, filters one NodeID, returns geometry/operation metadata only, rejects foreign canvases, and forwards immutable summaries through the original NodeBridge.');
