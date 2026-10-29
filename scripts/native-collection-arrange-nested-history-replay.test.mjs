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

const canvasId = 'canvas-nested-collection-arrange-history';
const projectId = 'project-nested-collection-arrange-history';
const workspaceId = 'workspace-nested-collection-arrange-history';
const outerCollectionId = 'outer-collection';
const outerOwnerId = 'outer-root-carrier';
const outerFrameId = 'outer-collection-frame';
const collectionId = 'inner-collection';
const collectionNodeId = 'inner-collection-carrier';
const frameId = 'inner-collection-frame';
const childId = 'inner-existing-child';
const admittedId = 'inner-free-member';
const siblingId = 'outer-structured-sibling';
const outsideId = 'unrelated-root-node';
const operationId = 'nested-collection-arrange-one-o8-entry';

const outerOwner = { id: outerOwnerId, type: 'lcos-collection', position: { x: 20, y: 20 }, width: 240, height: 160,
  data: { id: outerOwnerId, title: 'Outer canonical Collection', lcos_collection_ref: {
    projectId, canvasId, workspaceId, collectionId: outerCollectionId,
  } } };
const outerFrame = { id: outerFrameId, type: 'group', position: { x: 100, y: 100 }, width: 900, height: 700,
  data: { id: outerFrameId, title: 'Outer Collection', createdBy: 'client', layoutType: 'none',
    lcosCollectionId: outerCollectionId, lcosCollectionNodeId: outerOwnerId } };
const innerOwner = { id: collectionNodeId, type: 'lcos-collection', position: { x: 24, y: 28 }, parentId: outerFrameId,
  width: 250, height: 150, data: { id: collectionNodeId, title: 'Inner canonical Collection', lcos_collection_ref: {
    projectId, canvasId, workspaceId, collectionId,
  } } };
const frameBefore = { id: frameId, type: 'group', position: { x: 80, y: 80 }, parentId: outerFrameId,
  width: 520, height: 340, measured: { width: 520, height: 340 },
  data: { id: frameId, title: 'Inner Collection', createdBy: 'client', layoutType: 'none',
    lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId } };
const siblingBefore = { id: siblingId, type: 'text', position: { x: 650, y: 80 }, parentId: outerFrameId,
  width: 220, height: 140, data: { id: siblingId, text: 'Outer sibling remains in its original parent.' } };
const childBefore = { id: childId, type: 'text', position: { x: 28, y: 36 }, parentId: frameId,
  width: 240, height: 150, data: { id: childId, text: 'Existing nested child' } };
const admittedBefore = { id: admittedId, type: 'image', position: { x: 1200, y: 500 }, width: 300, height: 200,
  data: { id: admittedId, src: '/exact-canonical-image.png' } };
const outside = { id: outsideId, type: 'text', position: { x: 1800, y: 400 }, width: 200, height: 100,
  data: { id: outsideId, text: 'Unaffected root sibling' } };
const beforeNodes = [outerOwner, outerFrame, innerOwner, frameBefore, siblingBefore, childBefore, admittedBefore, outside];

// This is a deterministic O8 scope fixture for the full executor fit closure:
// inner frame + direct members, its same-parent ancestor, and every direct
// child of that ancestor. The ancestor hug-fit and its sibling relayout are
// spatial results; all existing IDs/data/parents remain intact except the
// one free member's null -> inner-frame admission.
const outerFrameAfter = { ...outerFrame, position: { x: 94, y: 92 }, width: 930, height: 740 };
const frameAfter = { ...frameBefore, position: { x: 92, y: 84 }, width: 640, height: 410, measured: { width: 640, height: 410 } };
const siblingAfter = { ...siblingBefore, position: { x: 700, y: 80 } };
const childAfter = { ...childBefore, position: { x: 44, y: 50 } };
const admittedAfter = { ...admittedBefore, position: { x: 350, y: 64 }, parentId: frameId };
const afterNodes = [outerOwner, outerFrameAfter, innerOwner, frameAfter, siblingAfter, childAfter, admittedAfter, outside];
const slice = node => ({ id: node.id, position: { ...node.position }, parentId: node.parentId ?? null,
  size: { width: node.width, height: node.height } });
const scopeIds = [outerFrameId, collectionNodeId, frameId, siblingId, childId, admittedId];
const beforeById = new Map(beforeNodes.map(node => [node.id, node]));
const afterById = new Map(afterNodes.map(node => [node.id, node]));
const operation = { version: 1, operationId, kind: 'collection-arrange', phase: 'apply', space: {
  projectId, canvasId, workspaceId, collectionId, collectionNodeId, frameId, sourceVersion: 91,
  before: scopeIds.map(id => slice(beforeById.get(id))), after: scopeIds.map(id => slice(afterById.get(id))),
} };
assert.deepEqual(Object.keys(operation.space).sort(),
  ['after', 'before', 'canvasId', 'collectionId', 'collectionNodeId', 'frameId', 'projectId', 'sourceVersion', 'workspaceId'],
  'Nested arrangement keeps the existing exact 9-key space contract.');

const sandbox = {
  console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON, structuredClone,
  setTimeout, clearTimeout,
  crypto: { randomUUID: (() => { let next = 0; return () => 'nested-arrange-' + (++next); })() },
  ef: value => typeof value === 'number' ? value : Number(value),
  F0: value => value !== null && typeof value === 'object', NN: Math.max, MN: Math.min,
  _c: () => Date.now(), kN: 'Expected a function', qp() {}, ee: { PILE: 'pile' },
  fetch: async () => { throw new Error('Nested history VM must not perform network I/O.'); },
};
sandbox.xs = (() => { let next = 0; return () => 'nested-remapped-' + (++next); })();
sandbox.window = sandbox;
sandbox.__LCOS_NODE_LAB__ = { api: { nativeOwner: true }, canvasId, projectId };
const context = vm.createContext(sandbox);
vm.runInContext(runtimeSource, context, { filename: 'startup-history-intent.js' });
for (const name of originalNames) sandbox[name] = vm.runInContext('(' + original.get(name) + ')', context, { filename: 'vendor-' + name });
sandbox.Ra = vm.runInContext('(' + debounceCode + ')', context, { filename: 'vendor-original-PN-debounce' });
const intent = sandbox.__LCOS_NATIVE_INTENT__;

function rejected(label, candidate, before = beforeNodes, after = afterNodes) {
  const result = intent.queueCollectionArrangeIntent({ canvasId, operation: candidate, beforeNodes: before, afterNodes: after });
  assert.equal(result.ok, false, label);
  assert.equal(intent.cancelCollectionArrangeIntent(candidate.operationId).removed, 0,
    `${label}: rejected plans leave no pending intent in the original O8 owner`);
}

rejected('missing exact ancestor slice', { ...operation, operationId: 'missing-ancestor', space: { ...operation.space,
  before: operation.space.before.filter(item => item.id !== outerFrameId), after: operation.space.after.filter(item => item.id !== outerFrameId) } });
rejected('missing an unchanged direct ancestor sibling/carrier', { ...operation, operationId: 'missing-ancestor-child', space: {
  ...operation.space, before: operation.space.before.filter(item => item.id !== siblingId),
  after: operation.space.after.filter(item => item.id !== siblingId),
} });
rejected('unrelated root node cannot be smuggled into the exact closure', { ...operation, operationId: 'extra-root-id', space: {
  ...operation.space, before: [...operation.space.before, slice(outside)], after: [...operation.space.after, slice(outside)],
} });
rejected('ancestor cycle is rejected', { ...operation, operationId: 'ancestor-cycle', space: {
  ...operation.space,
  before: operation.space.before.map(item => item.id === outerFrameId ? { ...item, parentId: frameId } : item),
  after: operation.space.after.map(item => item.id === outerFrameId ? { ...item, parentId: frameId } : item),
} });
rejected('an ordinary unmapped frame ancestor is not a Collection host', { ...operation, operationId: 'unmapped-ancestor' },
  beforeNodes.map(node => node.id === outerFrameId ? { ...node, data: { ...node.data, lcosCollectionId: undefined,
    lcosCollectionNodeId: undefined } } : node),
  afterNodes.map(node => node.id === outerFrameId ? { ...node, data: { ...node.data, lcosCollectionId: undefined,
    lcosCollectionNodeId: undefined } } : node));
rejected('ancestor carrier ref must resolve to that exact ancestor Collection', { ...operation, operationId: 'foreign-ancestor-carrier' },
  beforeNodes.map(node => node.id === outerOwnerId ? { ...node, data: { ...node.data,
    lcos_collection_ref: { ...node.data.lcos_collection_ref, collectionId: 'foreign-collection' } } } : node),
  afterNodes.map(node => node.id === outerOwnerId ? { ...node, data: { ...node.data,
    lcos_collection_ref: { ...node.data.lcos_collection_ref, collectionId: 'foreign-collection' } } } : node));
rejected('ancestor frame must remain a companion of its exact canonical owner', { ...operation, operationId: 'ancestor-owner-parent-mismatch' },
  beforeNodes.map(node => node.id === outerOwnerId ? { ...node, parentId: 'unrelated-parent' } : node),
  afterNodes.map(node => node.id === outerOwnerId ? { ...node, parentId: 'unrelated-parent' } : node));
rejected('locked ancestor frame blocks fit closure', { ...operation, operationId: 'locked-ancestor' },
  beforeNodes.map(node => node.id === outerFrameId ? { ...node, data: { ...node.data, locked: true } } : node),
  afterNodes.map(node => node.id === outerFrameId ? { ...node, data: { ...node.data, locked: true } } : node));
rejected('dragging changed sibling blocks the complete fit closure', { ...operation, operationId: 'dragging-sibling' },
  beforeNodes.map(node => node.id === siblingId ? { ...node, dragging: true } : node),
  afterNodes.map(node => node.id === siblingId ? { ...node, dragging: true } : node));
rejected('ancestor sibling data/ref cannot change with geometry', { ...operation, operationId: 'sibling-data-drift' }, beforeNodes,
  afterNodes.map(node => node.id === siblingId ? { ...node, data: { ...node.data, text: 'changed' } } : node));
rejected('the existing Collection frame cannot be reparented by Arrange', { ...operation, operationId: 'main-frame-reparent', space: {
  ...operation.space, after: operation.space.after.map(item => item.id === frameId ? { ...item, parentId: null } : item),
} });
rejected('only a free root member may enter the main Collection frame', { ...operation, operationId: 'foreign-parent-transition', space: {
  ...operation.space, after: operation.space.after.map(item => item.id === siblingId ? { ...item, parentId: frameId } : item),
} });

// Owner carrier raw geometry is guarded by the actual bridge's rawSignature;
// the O8 history baseline additionally pins its identity and data even when it
// sits outside the spatial slice scope.
{
  const driftOperation = { ...operation, operationId: 'external-ancestor-owner-baseline' };
  assert.equal(intent.queueCollectionArrangeIntent({ canvasId, operation: driftOperation, beforeNodes, afterNodes }).ok, true);
  const driftOwner = nodes => nodes.map(node => node.id === outerOwnerId
    ? { ...node, data: { ...node.data, title: 'Changed after queue, before O8 snapshot' } } : node);
  const entry = intent.recordHistoryTransition(canvasId,
    { nodes: driftOwner(beforeNodes) }, { nodes: driftOwner(afterNodes) });
  assert.equal(entry.lcos_history_operations.length, 1);
  assert.equal(entry.lcos_history_operations[0].lcos_intent_unsupported,
    'COLLECTION_ARRANGE_HISTORY_SNAPSHOT_MISMATCH', 'external ancestor carrier type/data identity is anchored to the queued O8 baseline');
}

const queued = intent.queueCollectionArrangeIntent({ canvasId, operation, beforeNodes, afterNodes });
assert.equal(queued.ok, true, 'the exact nested collection/ancestor/complete-child closure is queueable');
const expectedChanged = operation.space.after.filter((item, index) => {
  const before = operation.space.before[index];
  return item.position.x !== before.position.x || item.position.y !== before.position.y
    || item.parentId !== before.parentId || item.size.width !== before.size.width || item.size.height !== before.size.height;
}).map(item => item.id);
assert.deepEqual(JSON.parse(JSON.stringify(queued.changedNodeIds)), expectedChanged,
  'Only slices changed by original Huabu geometry become O8 aliases/R6 update items; unchanged ancestor siblings remain closure guards.');
assert.ok(expectedChanged.includes(outerFrameId) && expectedChanged.includes(siblingId)
  && expectedChanged.includes(frameId) && expectedChanged.includes(childId) && expectedChanged.includes(admittedId));

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
const applyChanges = expectedChanged.map(id => ({ type: 'replace', id, item: afterById.get(id) }));
intent.tagChanges(applyChanges, id => beforeById.get(id), canvasId);
const applyItems = attachMetadata(applyChanges);
const applyBuckets = intent.partitionOperations(applyItems);
assert.equal(applyBuckets.length, 1, 'all changed nested geometry stays in one original R6 operation bucket');
assert.equal(applyBuckets[0].lcos_operation.operationId, operationId);
assert.deepEqual([...applyBuckets[0].items.map(item => item.id)].sort(), [...expectedChanged].sort());
assert.ok(applyBuckets[0].items.every(item => item.operationType === 'update'));
assert.throws(() => intent.partitionOperations(applyItems.filter(item => item.id !== siblingId)), /split, mixed, or incomplete/,
  'omitting one changed ancestor sibling fails closed before R6 persistence');
assert.throws(() => intent.partitionOperations([...applyItems, { id: outsideId, operationType: 'update',
  position: { ...outside.position }, parentId: '', dimensions: { width: outside.width, height: outside.height },
  lcos_operation: applyBuckets[0].lcos_operation }]), /does not match|split, mixed, or incomplete/,
  'an unrelated root update cannot hitchhike in the nested Collection batch');

let sandboxRecord = [];
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
options.setNodes(afterNodes);
api = harness.render([liveNodes, [], options]);
await new Promise(resolve => setTimeout(resolve, 1100));
api = harness.render([liveNodes, [], options]);

const appliedHistory = api.inspectNativeHistory({ canvasId, requestedCanvasId: canvasId, nodeId: queued.anchorNodeId });
assert.equal(appliedHistory.ok, true);
assert.equal(appliedHistory.currentIndex, 1, 'one original debounced O8 snapshot records every nested fit consequence');
assert.equal(sandboxRecord.length, 1, 'nested ancestor/sibling geometry is one original O8 action, not another stack');
const historyEntry = { lcos_history_operations: sandboxRecord.map(action => structuredClone(action)) };
assert.equal(historyEntry.lcos_history_operations[0].lcos_operation.kind, 'collection-arrange');
assert.deepEqual(JSON.parse(JSON.stringify(historyEntry.lcos_history_operations[0].aliases)), expectedChanged);
assert.deepEqual(JSON.parse(JSON.stringify(appliedHistory.currentEntry.operations[0].aliases)).sort(), expectedChanged.slice().sort());

const remap = new Map();
api.undo();
api = harness.render([liveNodes, [], options]);
assert.deepEqual(liveNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  beforeNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  'original O8 Undo restores nested ancestor/frame/sibling/member geometry and same IDs');
const undoItems = attachMetadata(lastNodeChanges);
intent.tagHistoryBatchOperations(canvasId, 'undo', historyEntry, remap, lastNodeChanges, undoItems);
const undoBuckets = intent.partitionOperations(undoItems);
assert.equal(undoBuckets.length, 1);
assert.equal(undoBuckets[0].lcos_operation.operationId, operationId);
assert.equal(undoBuckets[0].lcos_operation.phase, 'undo');
assert.ok(undoBuckets[0].items.every(item => item.operationType === 'update'));
assert.deepEqual([...undoBuckets[0].items.map(item => item.id)].sort(), [...expectedChanged].sort());

api.redo();
api = harness.render([liveNodes, [], options]);
assert.deepEqual(liveNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  afterNodes.map(node => [node.id, node.parentId ?? null, node.position, node.width, node.height]),
  'original O8 Redo restores exact nested fit snapshot without ID remap');
const redoItems = attachMetadata(lastNodeChanges);
intent.tagHistoryBatchOperations(canvasId, 'redo', historyEntry, remap, lastNodeChanges, redoItems);
const redoBuckets = intent.partitionOperations(redoItems);
assert.equal(redoBuckets.length, 1);
assert.equal(redoBuckets[0].lcos_operation.operationId, operationId);
assert.equal(redoBuckets[0].lcos_operation.phase, 'redo');
assert.ok(redoBuckets[0].items.every(item => item.operationType === 'update'));
assert.deepEqual([...redoBuckets[0].items.map(item => item.id)].sort(), [...expectedChanged].sort());
assert.equal(remap.size, 0, 'nested arrange remains same-ID geometry; no remap exception is added');

console.log('PASS: original TapNow O8/M8 records one nested Collection arrange snapshot over exact ancestor/direct-child closure; R6 apply/undo/redo stay one update-only bucket with stable native IDs and complete geometry.');
