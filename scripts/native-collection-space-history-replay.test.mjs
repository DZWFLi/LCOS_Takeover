import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const filename = 'page-Da_DfwiK.js';
const pageSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
const debounceSource = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');

function parser() {
  const require = createRequire(import.meta.url);
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const cached = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find(file => fs.existsSync(file))
    : undefined;
  if (cached) return require(cached).babelParse;
  const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
  const installed = fs.existsSync(store) && fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'));
  if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.');
  const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'));
  return (source, name) => babel.parse(source, { sourceType: 'module', sourceFilename: name });
}

const parse = parser();
const transformed = transformHistoryIntentScript(filename,
  transformSurfaceDockScript(filename,
    transformNodeBridgeScript(filename,
      transformCutScript(filename, pageSource))));
assert.ok(transformed.startsWith('/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */'));
assert.equal(transformHistoryIntentScript(filename, transformed), transformed, 'history transform remains idempotent');
assert.match(transformed, /collectionSpaceVersion\(e,[A-Za-z_$][\w$]*\.lcos_operation\)/,
  'the existing original r6 node request reads an exact native Canvas CAS version at send time');
assert.match(transformed, /await window\.__LCOS_NATIVE_INTENT__\.collectionSpaceVersion/,
  'version read is awaited inside the original async r6 send owner');
assert.match(transformed, /normalizeCollectionSpaceRedoRemaps\(/,
  'only selected O8 collection-space redo entries can protect frame/child IDs from ordinary duplicate remapping');

function binding(program, name) {
  const matches = [];
  for (const statement of program.body) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node?.type === 'FunctionDeclaration' && node.id?.name === name) matches.push(node);
    if (node?.type === 'VariableDeclaration') for (const item of node.declarations) {
      if (item.id?.type === 'Identifier' && item.id.name === name) matches.push(item.init);
    }
  }
  assert.equal(matches.length, 1, `Expected one original vendor binding ${name}, found ${matches.length}.`);
  return matches[0];
}

const program = parse(transformed, filename).program;
const code = (source, node) => source.slice(node.start, node.end);
const originalNames = ['O8', 'IC', 'TC', 'kC', 'l0', 'P8', 'M8', 'L8', 'R8', 'A8', 'D8', 'j8', 'k8', 'PC'];
const original = new Map(originalNames.map(name => [name, code(transformed, binding(program, name))]));
const debounceProgram = parse(debounceSource, 'UnlimitedModeToggle-D4wysAbz.js').program;
const debounceCode = code(debounceSource, binding(debounceProgram, 'PN'));

function sameDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

class HookHarness {
  constructor(hook) { this.hook = hook; this.slots = []; this.cursor = 0; this.pendingEffects = []; this.dirty = false; }
  slot(kind) {
    const index = this.cursor++;
    let slot = this.slots[index];
    if (!slot) this.slots[index] = slot = { kind, initialized: false };
    assert.equal(slot.kind, kind, `O8 hook order changed at ${index}.`);
    return slot;
  }
  useState(initial) {
    const slot = this.slot('state');
    if (!slot.initialized) { slot.value = typeof initial === 'function' ? initial() : initial; slot.initialized = true; }
    if (!slot.setter) slot.setter = next => { slot.value = typeof next === 'function' ? next(slot.value) : next; this.dirty = true; };
    return [slot.value, slot.setter];
  }
  useRef(initial) {
    const slot = this.slot('ref');
    if (!slot.initialized) { slot.value = { current: initial }; slot.initialized = true; }
    return slot.value;
  }
  useMemo(factory, deps) {
    const slot = this.slot('memo');
    if (!slot.initialized || !sameDeps(slot.deps, deps)) { slot.value = factory(); slot.deps = deps; slot.initialized = true; }
    return slot.value;
  }
  useCallback(callback, deps) { return this.useMemo(() => callback, deps); }
  useEffect(effect, deps) {
    const slot = this.slot('effect');
    if (!slot.initialized || deps === undefined || !sameDeps(slot.deps, deps)) {
      slot.initialized = true; slot.nextEffect = effect; slot.nextDeps = deps; this.pendingEffects.push(slot);
    }
  }
  render(args) {
    for (let pass = 0; pass < 12; pass += 1) {
      this.dirty = false; this.cursor = 0; this.pendingEffects = [];
      this.output = this.hook(...args);
      const effects = this.pendingEffects;
      for (const slot of effects) {
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.deps = slot.nextDeps; slot.cleanup = slot.nextEffect();
      }
      if (!this.dirty) return this.output;
    }
    throw new Error('O8 VM hook harness did not settle.');
  }
}

function applyOriginalChanges(nodes, changes) {
  let result = [...nodes];
  for (const change of changes) {
    if (change.type === 'remove') result = result.filter(node => node.id !== change.id);
    else if (change.type === 'add') result.push(change.item);
    else if (change.type === 'replace') result = result.map(node => node.id === change.id ? change.item : node);
  }
  return result;
}

const canvasId = 'canvas-collection-space-history';
const projectId = 'project-collection-space-history';
const workspaceId = 'workspace-collection-space-history';
const collectionId = 'collection-space-history';
const collectionNodeId = 'collection-carrier-history';
const frameId = 'group-frame-history';
const operationId = 'collection-space-history-operation';
const childA = { id: 'child-text-history', type: 'text', position: { x: 80, y: 120 }, parentId: undefined,
  width: 220, height: 140, selected: true, data: { id: 'child-text-history', text: 'Keep exact text', content: 'Keep exact text' } };
const childB = { id: 'child-image-history', type: 'image', position: { x: 360, y: 150 }, parentId: undefined,
  width: 260, height: 180, selected: true, data: { id: 'child-image-history', src: '/canonical.png' } };
const collectionCarrier = { id: collectionNodeId, type: 'lcos-collection', position: { x: 16, y: 24 },
  width: 360, height: 220, selected: false, data: { id: collectionNodeId,
    lcos_collection_ref: { projectId, canvasId, workspaceId, collectionId } } };
const untouchedUnmeasured = { id: 'untouched-unmeasured-node', type: 'text', position: { x: 700, y: 300 }, data: { id: 'untouched-unmeasured-node' } };
const beforeNodes = [collectionCarrier, childA, childB, untouchedUnmeasured];
const afterFrame = { id: frameId, type: 'group', position: { x: 40, y: 60 }, parentId: undefined,
  width: 600, height: 300, selected: true, data: { id: frameId, title: 'Collection frame', createdBy: 'client', layoutType: 'none',
    lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId } };
const afterA = { ...childA, position: { x: 40, y: 40 }, parentId: frameId, selected: false };
const afterB = { ...childB, position: { x: 320, y: 70 }, parentId: frameId, selected: false };
const afterNodes = [collectionCarrier, afterFrame, afterA, afterB, untouchedUnmeasured];
const slice = node => ({ id: node.id, position: { ...node.position }, parentId: node.parentId ?? null,
  size: { width: node.width, height: node.height } });
const operation = { version: 1, operationId, kind: 'collection-space', phase: 'apply', space: {
  projectId, canvasId, workspaceId, collectionId, collectionNodeId, frameId, sourceVersion: 27,
  before: [slice(childA), slice(childB)], after: [slice(afterFrame), slice(afterA), slice(afterB)],
} };

const sandbox = {
  console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON, structuredClone,
  setTimeout, clearTimeout, crypto: { randomUUID: (() => { let next = 0; return () => 'vendor-remap-' + (++next); })() },
  // The original PN debounce only reaches these lodash type/clock helpers on this path.
  ef: value => typeof value === 'number' ? value : Number(value),
  F0: value => value !== null && typeof value === 'object', NN: Math.max, MN: Math.min,
  _c: () => Date.now(), kN: 'Expected a function', qp() {},
  ee: { PILE: 'pile' },
  fetch: async (address, options) => {
    fetchCalls.push({ address, options });
    return { ok: true, json: async () => ({ code: 0, data: { id: canvasId, version: currentVersion } }) };
  },
};
sandbox.xs = (() => { let next = 0; return () => 'vendor-remap-' + (++next); })();
sandbox.window = sandbox;
sandbox.__LCOS_NODE_LAB__ = { api: { nativeOwner: true }, canvasId, projectId };
const context = vm.createContext(sandbox);
vm.runInContext(runtimeSource, context, { filename: 'startup-history-intent.js' });
for (const name of originalNames) sandbox[name] = vm.runInContext('(' + original.get(name) + ')', context, { filename: 'vendor-' + name });
sandbox.Ra = vm.runInContext('(' + debounceCode + ')', context, { filename: 'vendor-original-PN-debounce' });

const intent = sandbox.__LCOS_NATIVE_INTENT__;
let currentVersion = 27;
const fetchCalls = [];
const movedUnplanned = { ...untouchedUnmeasured, position: { x: 701, y: 300 } };
assert.equal(intent.queueCollectionSpaceIntent({ canvasId, operation, beforeNodes,
  afterNodes: afterNodes.map(node => node.id === movedUnplanned.id ? movedUnplanned : node) }).ok, false,
  'an unrelated position change is not folded into the Collection space intent');
const initialQueue = intent.queueCollectionSpaceIntent({ canvasId, operation, beforeNodes, afterNodes });
assert.equal(initialQueue.ok, true, 'only the exact original frame-create/child-parent plan can be queued');
const applyChanges = [
  { type: 'add', item: afterFrame },
  { type: 'replace', id: childA.id, item: afterA },
  { type: 'replace', id: childB.id, item: afterB },
];
intent.tagChanges(applyChanges, id => beforeNodes.find(node => node.id === id), canvasId);
const applyMetadata = applyChanges.map(change => intent.metadata(change)?.lcos_operation);
assert.equal(applyMetadata.length, 3);
for (const tagged of applyMetadata) assert.deepEqual(JSON.parse(JSON.stringify(tagged)), operation,
  'frame add and every child replace carry the exact one collection-space intent');

// Run original O8/M8 code in a VM hook harness. The simple node reducer below
// only applies the original emitted add/replace/remove diffs to controlled props.
let liveNodes = beforeNodes;
const edges = [];
const capturedBatches = [];
const persistPromises = [];
let harness;
const setLiveNodes = nodes => { liveNodes = nodes; };
const options = {
  enabled: true, maxHistorySize: 30, debounceDelay: 1000,
  defaultOnNodesChange(changes) {
    intent.tagChanges(changes, id => liveNodes.find(node => node.id === id), canvasId);
    setLiveNodes(applyOriginalChanges(liveNodes, changes));
  },
  defaultOnEdgesChange() {},
  onBatchOperations(nodeOperations, edgeOperations) {
    const persist = (async () => {
      const buckets = intent.partitionOperations(nodeOperations);
      for (const bucket of buckets) {
        const cas = await intent.collectionSpaceVersion(canvasId, bucket.lcos_operation);
        capturedBatches.push({ bucket, cas });
      }
      return {};
    })();
    persistPromises.push(persist);
    return persist;
  },
  canvasId,
  setNodes: nodes => setLiveNodes(nodes),
};
harness = new HookHarness(sandbox.O8);
sandbox.l = {
  useState: (...args) => harness.useState(...args),
  useRef: (...args) => harness.useRef(...args),
  useMemo: (...args) => harness.useMemo(...args),
  useCallback: (...args) => harness.useCallback(...args),
  useEffect: (...args) => harness.useEffect(...args),
};
let api = harness.render([liveNodes, edges, options]);

// R6's metadata-copy step receives the same original M8 item shape and copies
// each exact NodeChange's private intent into its queued Native node operation.
const applyItems = sandbox.M8(applyChanges, Date.now());
for (const item of applyItems) {
  const change = applyChanges.find(value => (value.type === 'add' ? value.item.id : value.id) === item.id);
  const meta = intent.metadata(change);
  if (meta?.lcos_operation) item.lcos_operation = meta.lcos_operation;
}
const applyBuckets = intent.partitionOperations(applyItems);
assert.equal(applyBuckets.length, 1, 'original R6 operation partition keeps frame create + all child updates in one bucket');
assert.deepEqual(JSON.parse(JSON.stringify(applyBuckets[0].items.map(item => item.operationType).sort())), ['create', 'update', 'update']);
assert.ok(applyBuckets[0].items.every(item => !Object.hasOwn(item, 'lcos_ref') && !Object.hasOwn(item, 'lcos_snapshot')),
  'Collection-space actions never acquire Artifact refs or lifecycle delete snapshots');
assert.equal(applyBuckets[0].items.find(item => item.id === childA.id).parentId, frameId,
  'original M8 retains the new parent on child updates');
assert.equal(applyBuckets[0].lcos_operation.operationId, operationId);
const applyCas = await intent.collectionSpaceVersion(canvasId, applyBuckets[0].lcos_operation);
assert.deepEqual(JSON.parse(JSON.stringify(applyCas)), { lcos_expected_canvas_version: 27 });
assert.equal(fetchCalls.length, 1, 'apply reads one fresh native Canvas CAS version; no write is performed');

liveNodes = applyOriginalChanges(liveNodes, applyChanges);
api = harness.render([liveNodes, edges, options]);
await new Promise(resolve => setTimeout(resolve, 10));
api = harness.render([liveNodes, edges, options]);
const appliedFrameInspection = api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId: frameId });
assert.equal(appliedFrameInspection.ok, true);
assert.equal(appliedFrameInspection.currentIndex, 1, 'the whole original jC add/replace transaction made one O8 entry');
assert.equal(appliedFrameInspection.currentEntry.operations.length, 1);
assert.equal(appliedFrameInspection.currentEntry.operations[0].operation.operationId, operationId);
assert.equal(appliedFrameInspection.currentEntry.operations[0].operation.kind, 'collection-space');
const childInspection = api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId: childA.id });
assert.equal(childInspection.currentEntry.operations[0].nodeId, frameId,
  'child aliases reference the frame action rather than creating duplicate O8 operations');
assert.deepEqual(JSON.parse(JSON.stringify(childInspection.currentEntry.operations[0].aliases)), [frameId, childA.id, childB.id]);
assert.equal(liveNodes.find(node => node.id === frameId).selected, true);

currentVersion = 28;
api.undo();
api = harness.render([liveNodes, edges, options]);
await Promise.all(persistPromises.splice(0));
assert.equal(liveNodes.some(node => node.id === frameId), false, 'original O8 Undo removes the group frame');
assert.equal(liveNodes.find(node => node.id === childA.id).parentId, undefined, 'Undo restores the exact original no-parent state');
assert.deepEqual(liveNodes.find(node => node.id === childA.id).position, childA.position);
const undoBatch = capturedBatches.at(-1);
assert.deepEqual(JSON.parse(JSON.stringify(undoBatch.bucket.items.map(item => [item.id, item.operationType]).sort())),
  [[childA.id, 'update'], [childB.id, 'update'], [frameId, 'delete']].sort());
assert.equal(undoBatch.bucket.lcos_operation.operationId, operationId);
assert.equal(undoBatch.bucket.lcos_operation.phase, 'undo');
assert.deepEqual(JSON.parse(JSON.stringify(undoBatch.cas)), { lcos_expected_canvas_version: 28 });
// TapNow O8 intentionally preserves selection for nodes that already existed;
// it does not restore the pre-group selection bit as an undoable field.
assert.equal(liveNodes.find(node => node.id === childA.id).selected, false);

currentVersion = 29;
api.redo();
api = harness.render([liveNodes, edges, options]);
await Promise.all(persistPromises.splice(0));
assert.equal(liveNodes.some(node => node.id === frameId), true, 'the exact O8 collection entry restores its original frame ID');
assert.equal(liveNodes.find(node => node.id === childA.id).parentId, frameId, 'children retain their native IDs and parent reference');
assert.deepEqual(liveNodes.find(node => node.id === childB.id).position, afterB.position);
const redoBatch = capturedBatches.at(-1);
assert.deepEqual(JSON.parse(JSON.stringify(redoBatch.bucket.items.map(item => [item.id, item.operationType]).sort())),
  [[childA.id, 'update'], [childB.id, 'update'], [frameId, 'create']].sort());
assert.equal(redoBatch.bucket.lcos_operation.operationId, operationId);
assert.equal(redoBatch.bucket.lcos_operation.phase, 'redo');
assert.deepEqual(JSON.parse(JSON.stringify(redoBatch.cas)), { lcos_expected_canvas_version: 29 });
assert.ok(redoBatch.bucket.items.every(item => !Object.hasOwn(item, 'lcos_ref') && !Object.hasOwn(item, 'lcos_snapshot')));
assert.equal(liveNodes.find(node => node.id === frameId).selected, true);
assert.equal(intent.metadata({}), undefined);
assert.equal(fetchCalls.length, 3, 'apply/undo/redo each read a fresh expected version; no cached CAS token');

// The exact selected collection-space snapshot may suppress remapping only for
// its frame/children; unrelated missing NodeIDs retain native O8 remapping.
const entry = { lcos_history_operations: [{ nodeId: frameId, aliases: [frameId, childA.id, childB.id], changeType: 'add',
  lcos_operation: operation }] };
const remap = new Map([[frameId, 'must-keep-frame'], [childA.id, 'must-keep-child'], [childB.id, 'must-keep-child-b'],
  ['unrelated-missing-node', 'native-remap-kept']]);
assert.equal(intent.normalizeCollectionSpaceRedoRemaps(remap, entry, 'redo', canvasId, beforeNodes, afterNodes), true);
assert.equal(remap.has(frameId), false);
assert.equal(remap.has(childA.id), false);
assert.equal(remap.has(childB.id), false);
assert.equal(remap.get('unrelated-missing-node'), 'native-remap-kept', 'unrelated missing-node behavior remains the original O8 remap');
const foreignRemap = new Map([[frameId, 'must-not-change']]);
intent.normalizeCollectionSpaceRedoRemaps(foreignRemap, entry, 'redo', 'foreign-canvas', beforeNodes, afterNodes);
assert.equal(foreignRemap.get(frameId), 'must-not-change', 'foreign Canvas history cannot activate the exception');

const remapRows = () => [[frameId, 'remapped-frame'], [childA.id, 'remapped-child-a'], [childB.id, 'remapped-child-b']];
for (const [label, current, target] of [
  ['missing original child', beforeNodes.filter(node => node.id !== childA.id), afterNodes],
  ['occupied frame id', [...beforeNodes, { ...afterFrame }], afterNodes],
  ['child parent mismatch', beforeNodes.map(node => node.id === childA.id ? { ...node, parentId: 'foreign-parent' } : node), afterNodes],
  ['child position mismatch', beforeNodes.map(node => node.id === childA.id
    ? { ...node, position: { ...node.position, x: node.position.x + 1 } } : node), afterNodes],
  ['duplicate original child id', [...beforeNodes, { ...childA }], afterNodes],
  ['target frame canonical marker mismatch', beforeNodes, afterNodes.map(node => node.id === frameId
    ? { ...node, data: { ...node.data, lcosCollectionNodeId: 'foreign-collection-node' } } : node)],
  ['target frame renderer layout mismatch', beforeNodes, afterNodes.map(node => node.id === frameId
    ? { ...node, data: { ...node.data, layoutType: 'horizontal' } } : node)],
]) {
  const retained = new Map(remapRows());
  assert.equal(intent.normalizeCollectionSpaceRedoRemaps(retained, entry, 'redo', canvasId, current, target), false, label);
  assert.deepEqual(JSON.parse(JSON.stringify([...retained])), remapRows(), label + ' preserves original remaps');
}
const missingChildRemap = new Map(remapRows());
const missingChildBatchChanges = [
  { type: 'add', item: { ...afterFrame, id: 'remapped-frame', data: { ...afterFrame.data, id: 'remapped-frame' } } },
  { type: 'remove', id: childA.id }, { type: 'remove', id: childB.id },
  { type: 'add', item: { ...afterA, id: 'remapped-child-a', parentId: 'remapped-frame', data: { ...afterA.data, id: 'remapped-child-a' } } },
  { type: 'add', item: { ...afterB, id: 'remapped-child-b', parentId: 'remapped-frame', data: { ...afterB.data, id: 'remapped-child-b' } } },
];
const missingChildItems = sandbox.M8(missingChildBatchChanges, Date.now());
assert.equal(intent.normalizeCollectionSpaceRedoRemaps(missingChildRemap, entry, 'redo', canvasId,
  beforeNodes.filter(node => node.id !== childA.id), afterNodes), false,
  'a missing original child keeps the vendor remap active');
intent.tagHistoryBatchOperations(canvasId, 'redo', entry, missingChildRemap, missingChildBatchChanges, missingChildItems);
assert.throws(() => intent.partitionOperations(missingChildItems), /ambiguous|invalid explicit|incomplete|does not match/,
  'when a child is missing, the retained original remap causes the space replay to fail closed');

// Empty saved Collections still produce a real O8 frame intent: the group is
// the whole scope, not an invalid plan just because no child is projected yet.
{
  const emptyFrameId = 'group-empty-collection-history';
  const emptyFrame = { id: emptyFrameId, type: 'group', position: { x: 15, y: 25 }, width: 280, height: 180,
    selected: true, data: { id: emptyFrameId, title: 'Empty Collection', createdBy: 'client', layoutType: 'horizontal' } };
  const emptyOperation = { version: 1, operationId: 'empty-collection-space-operation', kind: 'collection-space', phase: 'apply',
    space: { projectId, canvasId, workspaceId, collectionId: 'empty-collection', collectionNodeId: 'empty-carrier',
      frameId: emptyFrameId, sourceVersion: 1, before: [], after: [slice(emptyFrame)] } };
  assert.equal(intent.queueCollectionSpaceIntent({ canvasId, operation: emptyOperation, beforeNodes: [], afterNodes: [emptyFrame] }).ok, true);
  const add = { type: 'add', item: emptyFrame };
  intent.tagChanges([add], () => undefined, canvasId);
  const createItems = sandbox.M8([add], Date.now());
  createItems[0].lcos_operation = intent.metadata(add).lcos_operation;
  const createBuckets = intent.partitionOperations(createItems);
  assert.equal(createBuckets.length, 1);
  assert.equal(createBuckets[0].items.length, 1);
  assert.equal(createBuckets[0].items[0].id, emptyFrameId);
  assert.equal(createBuckets[0].items[0].operationType, 'create');
  assert.equal(createBuckets[0].lcos_operation.kind, 'collection-space');
  const emptyEntry = intent.recordHistoryTransition(canvasId, { nodes: [], edges: [] }, { nodes: [emptyFrame], edges: [] });
  assert.equal(emptyEntry.lcos_history_operations.length, 1);
  const undoDiff = sandbox.P8([emptyFrame], [], [], []).nodeChanges;
  const undoItems = sandbox.M8(undoDiff, Date.now());
  intent.tagHistoryBatchOperations(canvasId, 'undo', emptyEntry, new Map(), undoDiff, undoItems);
  const undoBuckets = intent.partitionOperations(undoItems);
  assert.equal(undoBuckets.length, 1);
  assert.equal(undoBuckets[0].items[0].id, emptyFrameId);
  assert.equal(undoBuckets[0].items[0].operationType, 'delete');
  assert.equal(undoBuckets[0].lcos_operation.phase, 'undo');
  const redoDiff = sandbox.P8([], [emptyFrame], [], []).nodeChanges;
  const redoItems = sandbox.M8(redoDiff, Date.now());
  intent.tagHistoryBatchOperations(canvasId, 'redo', emptyEntry, new Map(), redoDiff, redoItems);
  const redoBuckets = intent.partitionOperations(redoItems);
  assert.equal(redoBuckets.length, 1);
  assert.equal(redoBuckets[0].items[0].id, emptyFrameId);
  assert.equal(redoBuckets[0].items[0].operationType, 'create');
  assert.equal(redoBuckets[0].lcos_operation.phase, 'redo');
}
const queuedForCancel = intent.queueCollectionSpaceIntent({ canvasId, operation, beforeNodes, afterNodes });
assert.equal(queuedForCancel.ok, true);
assert.deepEqual(JSON.parse(JSON.stringify(intent.cancelCollectionSpaceIntent(operationId))), { ok: true, removed: 3 },
  'the caller can clear only an exact unconsumed queue if its native update was never emitted');
assert.throws(() => intent.partitionOperations([...applyItems, { id: 'unplanned-node', operationType: 'update',
  position: { x: 0, y: 0 }, dimensions: { width: 1, height: 1 }, parentId: '', lcos_operation: operation }]),
/does not match|split or incomplete/, 'unsupported nodes cannot be appended to a collection-space operation bucket');

for (const [label, invalid] of [
  ['operation canvas mismatch', { ...operation, space: { ...operation.space, canvasId: 'foreign-canvas' } }],
  ['missing after child', { ...operation, space: { ...operation.space, after: [slice(afterFrame), slice(afterA)] } }],
]) {
  const invalidResult = intent.queueCollectionSpaceIntent({ canvasId, operation: invalid, beforeNodes, afterNodes });
  assert.equal(invalidResult.ok, false, label);
}
await assert.rejects(intent.collectionSpaceVersion('foreign-canvas', operation), /original Canvas\/API\/Project/,
  'a stale native Canvas/API/project fails before sending the batch');

console.log('PASS: actual TapNow O8/M8 replay groups collection frame+child replace as one O8 action and one R6 bucket; Undo/Redo retain parent geometry and stable child IDs, selected-entry-only remap exception, and per-phase fresh Canvas CAS reads.');
