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
assert.match(transformed, /\.queueCollectionArrangeIntent=/,
  'the narrow queue is bound onto the original O8 receipt bridge, not a second history owner');
assert.match(transformed, /\.cancelCollectionArrangeIntent=/,
  'the original O8 owner exposes cancellation for an arrange that never reaches its snapshot');
assert.match(transformed, /collectionSpaceVersion\(e,[A-Za-z_$][\w$]*\.lcos_operation\)/,
  'the existing original R6 node request reads a fresh Canvas version for explicit collection intents');

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

const canvasId = 'canvas-collection-arrange-history';
const projectId = 'project-collection-arrange-history';
const workspaceId = 'workspace-collection-arrange-history';
const collectionId = 'collection-arrange-history';
const collectionNodeId = 'collection-carrier-arrange-history';
const frameId = 'group-frame-arrange-history';
const operationId = 'collection-arrange-history-operation';
const carrier = { id: collectionNodeId, type: 'lcos-collection', position: { x: 12, y: 20 }, width: 360, height: 220,
  data: { id: collectionNodeId, title: 'Canonical Collection', lcos_collection_ref: { projectId, canvasId, workspaceId, collectionId } } };
const frameBefore = { id: frameId, type: 'group', position: { x: 80, y: 80 }, parentId: undefined,
  width: 620, height: 340, measured: { width: 620, height: 340 }, selected: true,
  data: { id: frameId, title: 'Canonical Collection', createdBy: 'client', layoutType: 'none',
    lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId } };
const childA = { id: 'child-already-hosted', type: 'text', position: { x: 30, y: 40 }, parentId: frameId,
  width: 240, height: 140, selected: true, data: { id: 'child-already-hosted', text: 'Keep A', content: 'Keep A' } };
const childB = { id: 'child-newly-admitted', type: 'image', position: { x: 900, y: 300 }, parentId: undefined,
  width: 280, height: 190, selected: false, data: { id: 'child-newly-admitted', src: '/exact-core-image.png' } };
const untouched = { id: 'untouched-other-node', type: 'text', position: { x: 1200, y: 400 }, width: 220, height: 120,
  data: { id: 'untouched-other-node', text: 'Outside arrangement' } };
const beforeNodes = [carrier, frameBefore, childA, childB, untouched];
const frameAfter = { ...frameBefore, width: 700, height: 420, measured: { width: 700, height: 420 } };
const afterA = { ...childA, position: { x: 48, y: 52 } };
const afterB = { ...childB, position: { x: 330, y: 80 }, parentId: frameId };
const afterNodes = [carrier, frameAfter, afterA, afterB, untouched];
const slice = node => ({ id: node.id, position: { ...node.position }, parentId: node.parentId ?? null,
  size: { width: node.width, height: node.height } });
const operation = { version: 1, operationId, kind: 'collection-arrange', phase: 'apply', space: {
  projectId, canvasId, workspaceId, collectionId, collectionNodeId, frameId, sourceVersion: 63,
  before: [slice(frameBefore), slice(childA), slice(childB)], after: [slice(frameAfter), slice(afterA), slice(afterB)],
} };

const fetchCalls = [];
let currentVersion = 63;
const sandbox = {
  console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON, structuredClone,
  setTimeout, clearTimeout, crypto: { randomUUID: (() => { let next = 0; return () => 'native-arrange-' + (++next); })() },
  ef: value => typeof value === 'number' ? value : Number(value),
  F0: value => value !== null && typeof value === 'object', NN: Math.max, MN: Math.min,
  _c: () => Date.now(), kN: 'Expected a function', qp() {}, ee: { PILE: 'pile' },
  fetch: async (address, options) => {
    fetchCalls.push({ address, options });
    return { ok: true, json: async () => ({ code: 0, data: { id: canvasId, version: currentVersion } }) };
  },
};
sandbox.xs = (() => { let next = 0; return () => 'native-arrange-' + (++next); })();
sandbox.window = sandbox;
sandbox.__LCOS_NODE_LAB__ = { api: { nativeOwner: true }, canvasId, projectId };
const context = vm.createContext(sandbox);
vm.runInContext(runtimeSource, context, { filename: 'startup-history-intent.js' });
for (const name of originalNames) sandbox[name] = vm.runInContext('(' + original.get(name) + ')', context, { filename: 'vendor-' + name });
sandbox.Ra = vm.runInContext('(' + debounceCode + ')', context, { filename: 'vendor-original-PN-debounce' });
const intent = sandbox.__LCOS_NATIVE_INTENT__;

const invalid = (label, candidate, before = beforeNodes, after = afterNodes) => {
  const result = intent.queueCollectionArrangeIntent({ canvasId, operation: candidate, beforeNodes: before, afterNodes: after });
  assert.equal(result.ok, false, label);
};
invalid('missing changed member', operation, beforeNodes.filter(node => node.id !== childB.id), afterNodes);
invalid('incomplete operation slices', { ...operation, space: { ...operation.space,
  before: operation.space.before.filter(item => item.id !== childB.id), after: operation.space.after.filter(item => item.id !== childB.id) } });
invalid('out-of-scope geometry is not absorbed', operation, beforeNodes,
  afterNodes.map(node => node.id === untouched.id ? { ...node, position: { x: 1201, y: 400 } } : node));
invalid('dirty material data is not absorbed', operation, beforeNodes,
  afterNodes.map(node => node.id === childA.id ? { ...node, data: { ...node.data, text: 'forged' } } : node));
invalid('a parent outside the existing frame is unsupported', { ...operation, space: { ...operation.space,
  after: operation.space.after.map(item => item.id === childB.id ? { ...item, parentId: 'foreign-frame' } : item) } });
invalid('frame parent change is unsupported', { ...operation, space: { ...operation.space,
  before: operation.space.before.map(item => item.id === frameId ? { ...item, parentId: 'old-parent' } : item) } });
invalid('a no-op does not queue an arrange', { ...operation, space: { ...operation.space, after: operation.space.before } },
  beforeNodes, beforeNodes);

const pureGeometry = [{ type: 'replace', id: childA.id, item: { ...childA, position: { x: 31, y: 40 } } }];
intent.tagChanges(pureGeometry, id => beforeNodes.find(node => node.id === id), canvasId);
assert.equal(intent.metadata(pureGeometry[0]), undefined, 'unplanned pure geometry remains an ordinary native update');
assert.equal(intent.partitionOperations(sandbox.M8(pureGeometry, Date.now()))[0].lcos_operation, undefined,
  'ordinary geometry does not acquire the collection-arrange operation kind');

const queuedBeforeCancel = intent.queueCollectionArrangeIntent({ canvasId, operation, beforeNodes, afterNodes });
assert.equal(queuedBeforeCancel.ok, true);
assert.equal(queuedBeforeCancel.anchorNodeId, frameId, 'the first actually changed slice anchors the native history record');
assert.deepEqual(JSON.parse(JSON.stringify(queuedBeforeCancel.changedNodeIds)), [frameId, childA.id, childB.id]);
assert.equal(intent.queueCollectionArrangeIntent({ canvasId, operation: { ...operation, operationId: 'parallel-op' }, beforeNodes, afterNodes }).ok,
  false, 'a second pending collection arrange cannot race the same Canvas history owner');
assert.ok(intent.cancelCollectionArrangeIntent(operationId).removed > 0, 'failed preparation can cancel only its queued operation');

const queued = intent.queueCollectionArrangeIntent({ canvasId, operation, beforeNodes, afterNodes });
assert.equal(queued.ok, true);
const applyChanges = [
  { type: 'replace', id: frameId, item: frameAfter },
  { type: 'replace', id: childA.id, item: afterA },
  { type: 'replace', id: childB.id, item: afterB },
];
intent.tagChanges(applyChanges, id => beforeNodes.find(node => node.id === id), canvasId);
assert.ok(applyChanges.every(change => intent.metadata(change)?.lcos_operation?.operationId === operationId),
  'only exact changed replace events carry this one queued operation');
assert.ok(applyChanges.every(change => !Object.hasOwn(intent.metadata(change), 'lcos_ref')
  && !Object.hasOwn(intent.metadata(change), 'lcos_snapshot')), 'arrange metadata never becomes a material lifecycle receipt');

const sandboxRecord = [];
const originalRecord = intent.recordHistoryTransition;
intent.recordHistoryTransition = (...args) => {
  const result = originalRecord(...args);
  if (result?.lcos_history_operations) sandboxRecord.push(...result.lcos_history_operations);
  return result;
};
let liveNodes = beforeNodes;
let lastNodeChanges = [];
let harness;
const options = {
  enabled: true, maxHistorySize: 30, debounceDelay: 1000,
  defaultOnNodesChange(changes) {
    lastNodeChanges = changes;
    intent.tagChanges(changes, id => liveNodes.find(node => node.id === id), canvasId);
    liveNodes = applyOriginalChanges(liveNodes, changes);
  },
  defaultOnEdgesChange() {},
  onBatchOperations() { return Promise.resolve({}); },
  canvasId,
  setNodes: nodes => { liveNodes = nodes; },
};
harness = new HookHarness(sandbox.O8);
sandbox.l = {
  useState: (...args) => harness.useState(...args), useRef: (...args) => harness.useRef(...args),
  useMemo: (...args) => harness.useMemo(...args), useCallback: (...args) => harness.useCallback(...args),
  useEffect: (...args) => harness.useEffect(...args),
};
let api = harness.render([liveNodes, [], options]);

// One original ReactFlow setNodes call changes the existing frame and all
// changed direct children; the real O8 snapshot owner writes one history entry.
options.setNodes(afterNodes);
api = harness.render([liveNodes, [], options]);
// Geometry-only changes are captured by O8's original debounced snapshot path;
// first-open node-count changes are immediate, but this action must let that
// real debounce elapse rather than manufacturing an O8 entry in the test.
await new Promise(resolve => setTimeout(resolve, 1100));
api = harness.render([liveNodes, [], options]);
const history = api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId: queued.anchorNodeId });
assert.equal(history.ok, true);
assert.equal(history.currentIndex, 1, 'the single setNodes geometry/parent update is one original O8 history frame');
assert.equal(sandboxRecord.length, 1, 'the O8 snapshot consumed one exact queued replace anchor');
assert.equal(sandboxRecord[0].nodeId, queued.anchorNodeId);
assert.equal(sandboxRecord[0].changeType, 'replace');
assert.deepEqual(JSON.parse(JSON.stringify(sandboxRecord[0].aliases)), [frameId, childA.id, childB.id]);
assert.equal(sandboxRecord[0].lcos_operation.kind, 'collection-arrange');
assert.equal(history.currentEntry.operations[0].operation.operationId, operationId);
assert.equal(history.currentEntry.operations[0].operation.kind, 'collection-arrange');

const attachMetadata = changes => {
  const items = sandbox.M8(changes, Date.now());
  for (const item of items) {
    const change = changes.find(value => (value.type === 'add' ? value.item.id : value.id) === item.id);
    const meta = intent.metadata(change);
    if (meta?.lcos_operation) item.lcos_operation = meta.lcos_operation;
    if (meta?.unsupported) item.lcos_intent_unsupported = meta.reason;
  }
  return items;
};
const applyItems = attachMetadata(applyChanges);
const applyBuckets = intent.partitionOperations(applyItems);
assert.equal(applyBuckets.length, 1, 'changed arrange nodes stay in one R6 explicit operation bucket');
assert.deepEqual(JSON.parse(JSON.stringify(applyBuckets[0].items.map(item => [item.id, item.operationType]).sort())),
  [[frameId, 'update'], [childA.id, 'update'], [childB.id, 'update']].sort());
assert.equal(applyBuckets[0].lcos_operation.kind, 'collection-arrange');
assert.equal(applyBuckets[0].lcos_operation.phase, 'apply');
assert.ok(applyBuckets[0].items.every(item => item.lcos_ref === undefined && item.lcos_snapshot === undefined));
assert.throws(() => intent.partitionOperations(applyItems.filter(item => item.id !== childB.id)), /split, mixed, or incomplete/,
  'a missing changed update fails closed instead of committing a partial arrangement');
assert.throws(() => intent.partitionOperations([...applyItems, { id: untouched.id, operationType: 'update',
  position: { ...untouched.position }, parentId: '', dimensions: { width: untouched.width, height: untouched.height },
  lcos_operation: applyBuckets[0].lcos_operation }]), /does not match|split, mixed, or incomplete/,
  'an out-of-scope item cannot be smuggled into the collection-arrange bucket');
assert.throws(() => intent.partitionOperations(applyItems.map(item => item.id === childA.id ? { ...item, lcos_ref: { version: 1 } } : item)),
  /does not match|split, mixed, or incomplete/, 'arrange buckets cannot carry lifecycle refs or snapshots');

const applyCas = await intent.collectionSpaceVersion(canvasId, applyBuckets[0].lcos_operation);
assert.deepEqual(JSON.parse(JSON.stringify(applyCas)), { lcos_expected_canvas_version: 63 });
assert.equal(fetchCalls.length, 1, 'apply reads the current native Canvas version without caching or writing');

const historyEntry = { lcos_history_operations: sandboxRecord.map(action => structuredClone(action)) };
const remap = new Map();
api.undo();
api = harness.render([liveNodes, [], options]);
assert.deepEqual(liveNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  beforeNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  'O8 Undo restores existing IDs, original parent admission, positions, and group bounds');
const undoItems = attachMetadata(lastNodeChanges);
intent.tagHistoryBatchOperations(canvasId, 'undo', historyEntry, remap, lastNodeChanges, undoItems);
const undoBuckets = intent.partitionOperations(undoItems);
assert.equal(undoBuckets.length, 1);
assert.equal(undoBuckets[0].lcos_operation.operationId, operationId);
assert.equal(undoBuckets[0].lcos_operation.phase, 'undo');
assert.ok(undoBuckets[0].items.every(item => item.operationType === 'update'));
assert.deepEqual(JSON.parse(JSON.stringify(undoBuckets[0].items.map(item => item.id).sort())), [frameId, childA.id, childB.id].sort());
currentVersion = 64;
assert.deepEqual(JSON.parse(JSON.stringify(await intent.collectionSpaceVersion(canvasId, undoBuckets[0].lcos_operation))),
  { lcos_expected_canvas_version: 64 });

api.redo();
api = harness.render([liveNodes, [], options]);
assert.deepEqual(liveNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  afterNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  'O8 Redo restores the same existing frame/child IDs and planned parent-relative geometry');
const redoItems = attachMetadata(lastNodeChanges);
intent.tagHistoryBatchOperations(canvasId, 'redo', historyEntry, remap, lastNodeChanges, redoItems);
const redoBuckets = intent.partitionOperations(redoItems);
assert.equal(redoBuckets.length, 1);
assert.equal(redoBuckets[0].lcos_operation.operationId, operationId);
assert.equal(redoBuckets[0].lcos_operation.phase, 'redo');
assert.ok(redoBuckets[0].items.every(item => item.operationType === 'update'));
assert.equal(remap.size, 0, 'collection-arrange does not add an ID-remap exception or remap operation');
currentVersion = 65;
assert.deepEqual(JSON.parse(JSON.stringify(await intent.collectionSpaceVersion(canvasId, redoBuckets[0].lcos_operation))),
  { lcos_expected_canvas_version: 65 });
assert.equal(fetchCalls.length, 3, 'apply/undo/redo each read a fresh Canvas version');
await assert.rejects(intent.collectionSpaceVersion(canvasId, { ...redoBuckets[0].lcos_operation,
  space: { ...redoBuckets[0].lcos_operation.space, changedNodeIds: [frameId] } }), /original Canvas\/API\/Project/,
  'the arrange CAS path validates its own exact space shape before fetching a version');
assert.equal(fetchCalls.length, 3, 'malformed arrange metadata is rejected before the Canvas read');

assert.throws(() => intent.partitionOperations([...applyItems, { id: 'bad-lifecycle', operationType: 'create',
  lcos_operation: operation }]), /does not match|invalid explicit/, 'mixed lifecycle/out-of-scope work is not admitted to arrange');
assert.equal(intent.metadata({}), undefined, 'private intent metadata remains attached only to actual changes');

const foreignApi = sandbox.__LCOS_NODE_LAB__.api;
sandbox.__LCOS_NODE_LAB__ = { api: foreignApi, canvasId: 'foreign-canvas', projectId };
await assert.rejects(intent.collectionSpaceVersion(canvasId, redoBuckets[0].lcos_operation), /original Canvas\/API\/Project/,
  'a Canvas switch fails before a typed arrange batch is submitted');

console.log('PASS: original TapNow O8 records one existing-frame Collection Arrange snapshot from a single setNodes call; changed IDs stay in one update-only R6 bucket, and Undo/Redo preserve native IDs/parents/geometries with fresh per-phase Canvas CAS reads.');
