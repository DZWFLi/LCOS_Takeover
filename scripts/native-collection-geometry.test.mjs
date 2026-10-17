import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const asJson = value => JSON.parse(JSON.stringify(value));
const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');
function createIntent() {
  const sandbox = { window: {}, structuredClone, Date,
    crypto: { randomUUID: (() => { let sequence = 0; return () => 'collection-' + (++sequence); })() } };
  vm.runInNewContext(runtimeSource, sandbox, { filename: 'startup-history-intent.js' });
  return sandbox.window.__LCOS_NATIVE_INTENT__;
}

const scope = { projectId: 'project-collection', canvasId: 'canvas-collection', workspaceId: 'workspace-collection' };
const collectionId = 'collection-canonical';
const collectionNodeId = 'native-collection-carrier';
function collectionNode(overrides = {}) {
  const node = { id: collectionNodeId, type: 'lcos-collection', position: { x: 410, y: 270 },
    width: 360, height: 220, measured: { width: 360, height: 220 }, style: { width: 360, height: 220 },
    selected: true, data: { id: collectionNodeId, title: 'Canonical collection', locked: false,
      lcos_collection_ref: { ...scope, collectionId }, lcos_collection_facts: { title: 'Canonical collection' } } };
  return { ...node, ...overrides, data: { ...node.data, ...(overrides.data || {}) } };
}
function ordinaryNode(id = 'ordinary-node') {
  return { id, type: 'text', position: { x: 20, y: 30 }, width: 280, height: 170,
    selected: true, data: { id, text: 'Keep original body' } };
}
function makeOwner({ current, history, flushError, setterError } = {}) {
  const intent = createIntent();
  const currentNodesRef = { current: current ?? [ordinaryNode()] };
  const ownerHistory = history ?? [
    { timestamp: 1, state: { nodes: [ordinaryNode()], edges: [{ id: 'edge-a' }], viewport: { x: 8, y: 9, zoom: 1.2 } } },
    { timestamp: 2, state: { nodes: [ordinaryNode()], edges: [{ id: 'edge-a' }], viewport: { x: 8, y: 9, zoom: 1.2 } },
      lcos_history_operations: [{ nodeId: 'unrelated-node', aliases: ['unrelated-node'], changeType: 'add',
        lcos_operation: { version: 1, operationId: 'unrelated', kind: 'create', phase: 'apply' } }] },
  ];
  const calls = { setNodes: 0, suppress: 0, flush: 0 };
  const owner = {
    intent, history: ownerHistory, currentNodesRef, calls,
    setNodes(nodes) {
      calls.setNodes++;
      if (setterError) throw new Error('test setter failure');
      currentNodesRef.current = nodes;
    },
    suppress() { calls.suppress++; },
    flushHistory() { calls.flush++; if (flushError) throw new Error('test O8 flush failure'); },
  };
  owner.backfill = (node = collectionNode(), inputScope = scope) => intent.backfillHistoryReceipt({
    receiptKind: 'collection-projection', ...inputScope, canvasId: inputScope.canvasId, node,
    history: owner.history, getHistory: () => owner.history, currentNodesRef,
    setNodes: owner.setNodes, suppress: owner.suppress, flushHistory: owner.flushHistory,
  });
  return owner;
}

// Collection projection is inserted into the real snapshot arrays, not as a
// fabricated lifecycle action. Existing graph metadata remains byte-equivalent.
{
  const owner = makeOwner();
  const beforeOther = asJson(owner.currentNodesRef.current[0]);
  const beforeEdges = owner.history.map(entry => asJson(entry.state.edges));
  const beforeViewports = owner.history.map(entry => asJson(entry.state.viewport));
  const beforeOperations = asJson(owner.history[1].lcos_history_operations);
  const receipt = owner.backfill();
  assert.deepEqual(asJson(receipt), { ok: true, idempotent: false, framesPatched: 2, framesInserted: 2 });
  assert.equal(owner.calls.flush, 1, 'the original O8 debounce is flushed before external projection snapshots are patched');
  assert.equal(owner.calls.suppress, 1, 'projection hydration suppresses only its native setter echo');
  assert.equal(owner.calls.setNodes, 1);
  assert.equal(owner.currentNodesRef.current.length, 2);
  assert.deepEqual(asJson(owner.currentNodesRef.current[0]), beforeOther);
  const liveProjection = owner.currentNodesRef.current[1];
  assert.equal(liveProjection.id, collectionNodeId);
  assert.equal(liveProjection.selected, false, 'external projection does not take over selection');
  for (const entry of owner.history) {
    assert.deepEqual(asJson(entry.state.nodes.map(node => node.id)), ['ordinary-node', collectionNodeId]);
    assert.equal(entry.state.nodes[1].type, 'lcos-collection');
  }
  assert.deepEqual(owner.history.map(entry => asJson(entry.state.edges)), beforeEdges);
  assert.deepEqual(owner.history.map(entry => asJson(entry.state.viewport)), beforeViewports);
  assert.deepEqual(asJson(owner.history[1].lcos_history_operations), beforeOperations,
    'the projection creates no fake create/delete lifecycle operation');
  const repeated = owner.backfill();
  assert.deepEqual(asJson(repeated), { ok: true, idempotent: true, framesPatched: 0, framesInserted: 0 });
  assert.equal(owner.calls.setNodes, 1, 'repeated exact projection is a true no-op in live state');
  assert.equal(owner.calls.suppress, 1);
  assert.equal(owner.history.length, 2, 'projection never appends a second history stack/frame');
}

// Same Native ID + same explicit Collection identity may receive canonical
// facts, but frame geometry, parent, selection, camera, and the local lock stay native.
{
  const existing = collectionNode({ position: { x: 91, y: 92 }, width: 401, height: 302,
    measured: { width: 401, height: 302 }, style: { width: 401, height: 302 }, selected: true,
    parentId: 'native-parent', data: { title: 'stale title', locked: true, rendererPreference: 'keep' } });
  const other = ordinaryNode();
  const history = [
    { state: { nodes: [existing, other], edges: [], viewport: { x: 1, y: 2, zoom: 3 } } },
    { state: { nodes: [{ ...existing, position: { x: 5, y: 6 }, selected: false }, other], edges: [], viewport: { x: 8, y: 9, zoom: 1 } } },
  ];
  const owner = makeOwner({ current: [existing, other], history });
  const result = owner.backfill(collectionNode({ data: { title: 'fresh title', locked: false,
    lcos_collection_facts: { title: 'fresh title', count: 3 } } }));
  assert.equal(result.ok, true);
  assert.deepEqual(owner.currentNodesRef.current[0].position, { x: 91, y: 92 });
  assert.deepEqual(owner.currentNodesRef.current[0].style, { width: 401, height: 302 });
  assert.equal(owner.currentNodesRef.current[0].parentId, 'native-parent');
  assert.equal(owner.currentNodesRef.current[0].selected, true);
  assert.equal(owner.currentNodesRef.current[0].data.locked, true);
  assert.equal(owner.currentNodesRef.current[0].data.title, 'fresh title');
  assert.equal(owner.currentNodesRef.current[0].data.rendererPreference, 'keep');
  assert.deepEqual(owner.history[1].state.nodes[0].position, { x: 5, y: 6 });
  assert.equal(owner.history[1].state.nodes[0].selected, false);
}

const invalidCases = [
  ['execution carrier cannot enter collection receipt path', collectionNode({ type: 'lcos-execution' })],
  ['foreign collection reference is rejected', collectionNode({ data: { lcos_collection_ref: { ...scope, projectId: 'foreign', collectionId } } })],
  ['node data ID must equal the Native ID', collectionNode({ data: { id: 'foreign-native-id' } })],
];
for (const [label, node] of invalidCases) {
  const owner = makeOwner();
  const beforeCurrent = asJson(owner.currentNodesRef.current), beforeHistory = asJson(owner.history);
  assert.equal(owner.backfill(node).ok, false, label);
  assert.equal(owner.calls.setNodes, 0, label);
  assert.equal(owner.calls.suppress, 0, label);
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent, label);
  assert.deepEqual(asJson(owner.history), beforeHistory, label);
}

for (const [label, invalidScope] of [
  ['foreign Canvas scope', { ...scope, canvasId: 'another-canvas' }],
  ['foreign Workspace scope', { ...scope, workspaceId: 'another-workspace' }],
  ['foreign Project scope', { ...scope, projectId: 'another-project' }],
]) {
  const owner = makeOwner();
  const beforeCurrent = asJson(owner.currentNodesRef.current), beforeHistory = asJson(owner.history);
  assert.equal(owner.backfill(collectionNode(), invalidScope).ok, false, label);
  assert.equal(owner.calls.setNodes, 0, label);
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent, label);
  assert.deepEqual(asJson(owner.history), beforeHistory, label);
}

{
  const owner = makeOwner();
  const beforeCurrent = asJson(owner.currentNodesRef.current), beforeHistory = asJson(owner.history);
  const result = owner.intent.backfillHistoryReceipt({ receiptKind: 'execution-projection', canvasId: scope.canvasId,
    nodes: [collectionNode()], history: owner.history, getHistory: () => owner.history,
    currentNodesRef: owner.currentNodesRef, setNodes: owner.setNodes, suppress: owner.suppress,
    flushHistory: owner.flushHistory });
  assert.equal(result.reason, 'EXECUTION_PROJECTION_NODE_INVALID',
    'collection identity never passes through or weakens the execution projection validator');
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent);
  assert.deepEqual(asJson(owner.history), beforeHistory);
}

for (const [label, owner] of [
  ['duplicate Native ID in live owner', makeOwner({ current: [ordinaryNode(), collectionNode(), collectionNode()] })],
  ['incompatible existing Native ID', makeOwner({ current: [ordinaryNode(), collectionNode({ data: {
    lcos_collection_ref: { ...scope, collectionId: 'other-collection' } } })] })],
  ['same Collection bound by another Native ID', makeOwner({ current: [ordinaryNode(), collectionNode({ id: 'other-native', data: {
    id: 'other-native', lcos_collection_ref: { ...scope, collectionId } } })] })],
  ['history lifecycle entry conflicts with external projection', makeOwner({ history: [
    { state: { nodes: [ordinaryNode()], edges: [] }, lcos_history_operations: [{ nodeId: collectionNodeId,
      aliases: [collectionNodeId], lcos_operation: { version: 1, operationId: 'native-create', kind: 'create', phase: 'apply' } }] },
  ] })],
]) {
  const beforeCurrent = asJson(owner.currentNodesRef.current), beforeHistory = asJson(owner.history);
  const result = owner.backfill();
  assert.equal(result.ok, false, label);
  assert.equal(owner.calls.setNodes, 0, label);
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent, label);
  assert.deepEqual(asJson(owner.history), beforeHistory, label);
}

{
  const flushFailure = makeOwner({ flushError: true });
  const beforeHistory = asJson(flushFailure.history), beforeCurrent = asJson(flushFailure.currentNodesRef.current);
  assert.equal(flushFailure.backfill().reason, 'HISTORY_DEBOUNCE_FLUSH_FAILED');
  assert.equal(flushFailure.calls.setNodes, 0);
  assert.deepEqual(asJson(flushFailure.history), beforeHistory);
  assert.deepEqual(asJson(flushFailure.currentNodesRef.current), beforeCurrent);

  const setterFailure = makeOwner({ setterError: true });
  const historyBefore = asJson(setterFailure.history), currentBefore = asJson(setterFailure.currentNodesRef.current);
  assert.equal(setterFailure.backfill().reason, 'NATIVE_STATE_SETTER_FAILED');
  assert.deepEqual(asJson(setterFailure.history), historyBefore, 'history plans roll back if the original React setter fails');
  assert.deepEqual(asJson(setterFailure.currentNodesRef.current), currentBefore);
}

// The installed converter and O8 bridge are used by the projection hydration
// control; geometry writes call only original updateNode({position}).
{
  const bridgeSource = fs.readFileSync(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
  const helperStart = bridgeSource.indexOf('function nonEmptyString(value)');
  const helperEnd = bridgeSource.indexOf('export function LCOSOriginalNodeBridge', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'collection bridge seam remains a targeted source slice');
  const helperSource = bridgeSource.slice(helperStart, helperEnd)
    .replace('export function createCollectionCarrierControls', 'function createCollectionCarrierControls');
  const createControls = new Function('currentCanvasId', helperSource + '\nreturn createCollectionCarrierControls;')(
    host => host?.currentCanvasId || host?.canvasId);
  const ownerApi = {};
  let nodes = [collectionNode(), ordinaryNode()];
  let host = { api: ownerApi, projectId: scope.projectId, canvasId: scope.canvasId, currentCanvasId: scope.canvasId };
  const events = [], writes = [], receipts = [];
  let receiptSuppression = false;
  let ordinarySaveResult = 'saved';
  const api = {
    getNodes: () => nodes,
    updateNode(id, changes) {
      writes.push({ id, changes: asJson(changes) });
      nodes = nodes.map(node => node.id === id ? { ...node, ...changes } : node);
    },
  };
  const controls = createControls({ api, ownerApi, getHost: () => host,
    prepareHistory: () => { events.push('O8.flush'); return { ok: true }; },
    backfillReceipt: receipt => {
      receipts.push(asJson(receipt)); receiptSuppression = true;
      setTimeout(() => { receiptSuppression = false; }, 0);
      return { ok: true };
    },
    flushCanvas: async id => { events.push('native.flush:' + id); return ordinarySaveResult; },
    retryCanvas: async id => { events.push('native.retry:' + id); return 'saved'; },
    normalizeNodes: candidates => { events.push('native.normalize'); return candidates.map(node => ({ ...node, normalizedByNativeConverter: true })); },
  });
  const isCurrent = () => true;
  const synchronize = node => controls.synchronizeCollectionCarrier(node, { isCurrent });
  const place = target => controls.placeCollectionCarrier(target, { isCurrent });
  const input = { ...scope, collectionId, nodeId: collectionNodeId, position: { x: -180, y: 77 } };
  assert.equal(controls.placeCollectionCarrier(input).ok, false,
    'workspace currentness must be supplied explicitly; node self-reported workspace is not authority');
  assert.deepEqual(asJson(await synchronize({ ...scope, node: collectionNode() })),
    { ok: true });
  assert.equal(receiptSuppression, false,
    'collection hydration resolves only after the existing O8 setTimeout(0) suppression reset, protecting the following geometry frame');
  assert.deepEqual(events, ['native.normalize']);
  assert.equal(receipts[0].receiptKind, 'collection-projection');
  assert.equal(receipts[0].node.normalizedByNativeConverter, true);
  const receiptCount = receipts.length;
  assert.equal((await controls.synchronizeCollectionCarrier({ ...scope, node: collectionNode() },
    { isCurrent: () => false })).ok, false, 'a lost Workspace callback rejects before another receipt');
  assert.equal(receipts.length, receiptCount);
  events.length = 0;
  const beforeData = asJson(nodes[0].data), beforeParent = nodes[0].parentId, beforeSelection = nodes[0].selected;
  const placed = place(input);
  assert.equal(placed.ok, true);
  assert.deepEqual(events, ['O8.flush'], 'geometry separates from the preceding history/debounce frame');
  assert.deepEqual(writes, [{ id: collectionNodeId, changes: { position: { x: -180, y: 77 } } }]);
  assert.deepEqual(nodes[0].position, input.position);
  assert.deepEqual(asJson(nodes[0].data), beforeData);
  assert.equal(nodes[0].parentId, beforeParent);
  assert.equal(nodes[0].selected, beforeSelection);

  events.length = 0;
  assert.deepEqual(await controls.flushCanvas(scope.canvasId), 'saved');
  assert.deepEqual(events, ['native.flush:' + scope.canvasId]);
  events.length = 0;
  assert.deepEqual(await controls.flushCanvas(scope.canvasId, { retry: true }), 'saved');
  assert.deepEqual(events, ['native.retry:' + scope.canvasId], 'only an explicit retry option invokes the original retry owner');
  events.length = 0;
  ordinarySaveResult = 'blocked';
  assert.deepEqual(await controls.flushCanvas(scope.canvasId), 'blocked');
  assert.deepEqual(events, ['native.flush:' + scope.canvasId], 'a blocked ordinary flush does not silently call retry');

  const beforeWrites = writes.length, beforeFlushes = events.length;
  nodes = nodes.map(node => node.id === collectionNodeId ? { ...node, dragging: true } : node);
  assert.equal(place({ ...input, position: { x: 999, y: 888 } }).ok, false);
  assert.equal(writes.length, beforeWrites, 'dragging carrier is never overwritten');
  assert.equal(events.length, beforeFlushes, 'no O8 history flush for a rejected dragging carrier');
  nodes = nodes.map(node => node.id === collectionNodeId ? { ...node, dragging: false, data: { ...node.data, locked: true } } : node);
  assert.equal(place({ ...input, position: { x: 999, y: 888 } }).ok, false);
  assert.equal(writes.length, beforeWrites, 'locked carrier is never overwritten');
  host = { ...host, currentCanvasId: 'replacement-canvas' };
  assert.equal(place(input).ok, false, 'stale canvas cannot write');
  assert.equal(writes.length, beforeWrites);
  assert.deepEqual(await controls.flushCanvas(scope.canvasId), 'blocked', 'flush cannot claim saved for a stale canvas');
  host = { ...host, currentCanvasId: scope.canvasId, projectId: 'replacement-project' };
  assert.equal(place(input).ok, false, 'stale project cannot write');
  assert.equal(writes.length, beforeWrites);
}

// Prove the bridge installs the flush callback from the real transformed O8
// owner and forwards it through B8 → Hook → OriginalNodeBridge.
{
  const filename = 'page-Da_DfwiK.js';
  const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
  assert.match(original, /setTimeout\(\(\)=>\{[A-Za-z_$][\w$]*\.current=!1\},0\)/,
    'the original O8 suppression reset is scheduled on its 0ms timer, which hydration awaits before geometry');
  const transformed = transformHistoryIntentScript(filename,
    transformSurfaceDockScript(filename, transformNodeBridgeScript(filename, transformCutScript(filename, original))));
  assert.match(transformed, /__lcosPrepareCollectionGeometryHistory=l\.useCallback\(\(\)=>\{try\{[^}]*\.flush\(\);return\{ok:true\}/,
    'O8 geometry preparation calls the actual native debounce flush');
  assert.ok(transformed.includes('__lcosBackfillNodeReceipt.prepareCollectionGeometryHistory=__lcosPrepareCollectionGeometryHistory'),
    'O8 carries its real debounce flush as metadata on the existing receipt callback');
  assert.ok(transformed.includes('backfillNodeReceipt:P.backfillNodeReceipt'),
    'the callback decorator reaches OriginalNodeBridge through the unchanged B8 receipt prop');
}

console.log('PASS: strict Collection projection hydrates through the original O8 history owner; explicit placement flushes prior history and updates only original position; execution receipt path remains separate.');
