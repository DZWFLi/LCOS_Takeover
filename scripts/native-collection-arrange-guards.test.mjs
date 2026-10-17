import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');
const sandbox = {
  console, Date, Promise, Map, Set, WeakMap, Object, Array, Math, Number, String, Boolean, JSON,
  structuredClone,
  crypto: { randomUUID: (() => { let index = 0; return () => `arrange-guard-${++index}`; })() },
};
sandbox.window = sandbox;
vm.runInContext(runtimeSource, vm.createContext(sandbox), { filename: 'startup-history-intent.js' });
const intent = sandbox.__LCOS_NATIVE_INTENT__;
assert.ok(intent, 'load the actual history-intent runtime');

const ids = {
  canvasId: 'guard-canvas', projectId: 'guard-project', workspaceId: 'guard-workspace',
  collectionId: 'guard-collection', collectionNodeId: 'guard-collection-carrier',
  frameId: 'guard-collection-frame', childId: 'guard-child', admittedId: 'guard-admitted',
  outsideId: 'guard-outside',
};

function fixture(operationId = 'guard-operation') {
  const owner = { id: ids.collectionNodeId, type: 'lcos-collection', position: { x: 12, y: 20 }, width: 360, height: 220,
    data: { id: ids.collectionNodeId, title: 'Canonical Collection', lcos_collection_ref: {
      projectId: ids.projectId, canvasId: ids.canvasId, workspaceId: ids.workspaceId, collectionId: ids.collectionId,
    } } };
  const frameBefore = { id: ids.frameId, type: 'group', position: { x: 80, y: 80 }, width: 620, height: 340,
    data: { id: ids.frameId, title: 'Canonical Collection', createdBy: 'client', layoutType: 'none',
      lcosCollectionId: ids.collectionId, lcosCollectionNodeId: ids.collectionNodeId } };
  const child = { id: ids.childId, type: 'text', position: { x: 30, y: 40 }, parentId: ids.frameId,
    width: 240, height: 140, data: { id: ids.childId, text: 'Keep exact content' } };
  const admitted = { id: ids.admittedId, type: 'image', position: { x: 900, y: 300 }, width: 280, height: 190,
    data: { id: ids.admittedId, src: '/exact-core-image.png' } };
  const outside = { id: ids.outsideId, type: 'text', position: { x: 1200, y: 400 }, width: 220, height: 120,
    data: { id: ids.outsideId, text: 'Not in this Collection' } };
  const beforeNodes = [owner, frameBefore, child, admitted, outside];
  const frameAfter = { ...frameBefore, width: 700, height: 420 };
  const childAfter = { ...child, position: { x: 48, y: 52 } };
  const admittedAfter = { ...admitted, position: { x: 330, y: 80 }, parentId: ids.frameId };
  const afterNodes = [owner, frameAfter, childAfter, admittedAfter, outside];
  const slice = node => ({ id: node.id, position: { ...node.position }, parentId: node.parentId ?? null,
    size: { width: node.width, height: node.height } });
  const operation = { version: 1, operationId, kind: 'collection-arrange', phase: 'apply', space: {
    projectId: ids.projectId, canvasId: ids.canvasId, workspaceId: ids.workspaceId,
    collectionId: ids.collectionId, collectionNodeId: ids.collectionNodeId, frameId: ids.frameId, sourceVersion: 12,
    before: [slice(frameBefore), slice(child), slice(admitted)],
    after: [slice(frameAfter), slice(childAfter), slice(admittedAfter)],
  } };
  return { owner, frameBefore, frameAfter, child, childAfter, admitted, admittedAfter, outside, beforeNodes, afterNodes, operation };
}

function rejects(label, operation, beforeNodes, afterNodes) {
  const result = intent.queueCollectionArrangeIntent({ canvasId: ids.canvasId, operation, beforeNodes, afterNodes });
  assert.equal(result.ok, false, label);
  assert.equal(result.reason, 'COLLECTION_ARRANGE_PLAN_MISMATCH', `${label}: rejection is the narrow planner-shape/state guard`);
  assert.equal(intent.cancelCollectionArrangeIntent(operation.operationId).removed, 0,
    `${label}: invalid state did not leave a pending native-history intent`);
}

// Standalone-helper boundary: it checks the carrier's canonical owner/data and
// that the arrange transition itself does not move/resize that unplanned node.
// It does not encode a carrier-space CAS in the operation/baseline. The real
// host's raw-node signature checks around prepare/queue/setNodes and the
// backend sourceVersion/current-plan validation remain required protections.
{
  const f = fixture('owner-geometry-transition');
  const movedOwner = { ...f.owner, position: { x: f.owner.position.x + 1, y: f.owner.position.y } };
  const before = f.beforeNodes.map(node => node.id === ids.collectionNodeId ? movedOwner : node);
  rejects('the collection owner may not move as part of the arrange transition', f.operation,
    f.beforeNodes, f.afterNodes.map(node => node.id === ids.collectionNodeId ? movedOwner : node));
  assert.equal(intent.queueCollectionArrangeIntent({ canvasId: ids.canvasId, operation: f.operation,
    beforeNodes: before, afterNodes: f.afterNodes.map(node => node.id === ids.collectionNodeId ? movedOwner : node) }).ok,
    true, 'carrier geometry is not a standalone-helper sourceVersion CAS; host/backend guards cover prepare-to-write drift');
  intent.cancelCollectionArrangeIntent(f.operation.operationId);
}

// The actual helper validates the complete canonical carrier identity and the
// exact geometry slices it is about to hand to the original O8 owner.
{
  const f = fixture('wrong-owner-ref');
  const wrong = f.beforeNodes.map(node => node.id === ids.collectionNodeId
    ? { ...node, data: { ...node.data, lcos_collection_ref: { ...node.data.lcos_collection_ref, workspaceId: 'foreign-workspace' } } }
    : node);
  rejects('foreign collection owner ref is rejected', f.operation, wrong, wrong.map(node => node.id === ids.collectionNodeId
    ? { ...node, position: { ...node.position } } : node));
}
{
  const f = fixture('wrong-owner-id');
  const wrong = f.beforeNodes.map(node => node.id === ids.collectionNodeId
    ? { ...node, data: { ...node.data, id: 'different-carrier' } } : node);
  rejects('carrier data.id must equal its exact native node id', f.operation, wrong, wrong);
}
{
  const f = fixture('wrong-frame-marker');
  const wrong = nodes => nodes.map(node => node.id === ids.frameId
    ? { ...node, data: { ...node.data, lcosCollectionNodeId: 'foreign-carrier' } } : node);
  rejects('the unique group must carry the canonical collection/carrier markers', f.operation,
    wrong(f.beforeNodes), wrong(f.afterNodes));
}
{
  const f = fixture('wrong-raw-before');
  const wrong = f.beforeNodes.map(node => node.id === ids.childId
    ? { ...node, position: { x: node.position.x + 1, y: node.position.y } } : node);
  rejects('planned raw source geometry must match the operation baseline', f.operation, wrong, f.afterNodes);
}
{
  const f = fixture('wrong-raw-after');
  const wrong = f.afterNodes.map(node => node.id === ids.admittedId
    ? { ...node, width: node.width + 1 } : node);
  rejects('planned raw target size must match the operation slice', f.operation, f.beforeNodes, wrong);
}
{
  const f = fixture('scope-data-drift');
  const wrong = f.afterNodes.map(node => node.id === ids.childId
    ? { ...node, data: { ...node.data, text: 'changed during arrange' } } : node);
  rejects('arrange may not change any scoped node data', f.operation, f.beforeNodes, wrong);
}
{
  const f = fixture('unplanned-scope-drift');
  const wrong = f.afterNodes.map(node => node.id === ids.outsideId
    ? { ...node, position: { x: node.position.x + 1, y: node.position.y } } : node);
  rejects('an out-of-scope raw geometry change cannot hitchhike in the arrange transition', f.operation, f.beforeNodes, wrong);
}

// Nested scopes are accepted only when every ancestor is itself an exact
// canonical Collection host with its bound carrier and complete direct-child
// closure. This isolated ancestor has no matching Collection owner, so it must
// still fail closed rather than being admitted as an ordinary/unmapped group.
{
  const f = fixture('nested-ancestor-plan');
  const ancestorId = 'guard-ancestor-frame';
  const before = f.beforeNodes.map(node => node.id === ids.frameId ? { ...node, parentId: ancestorId } : node);
  const after = f.afterNodes.map(node => node.id === ids.frameId ? { ...node, parentId: ancestorId } : node);
  const ancestor = { id: ancestorId, type: 'group', position: { x: 10, y: 10 }, width: 900, height: 700,
    data: { id: ancestorId, createdBy: 'client', layoutType: 'none' } };
  before.push(ancestor);
  after.push(ancestor);
  const ancestorSlice = { id: ancestorId, position: { ...ancestor.position }, parentId: null,
    size: { width: ancestor.width, height: ancestor.height } };
  const nestedOperation = { ...f.operation, space: { ...f.operation.space,
    before: [ancestorSlice, ...f.operation.space.before.map(slice => slice.id === ids.frameId
      ? { ...slice, parentId: ancestorId } : slice)],
    after: [ancestorSlice, ...f.operation.space.after.map(slice => slice.id === ids.frameId
      ? { ...slice, parentId: ancestorId } : slice)],
  } };
  rejects('an unmapped nested ancestor is not admitted as a canonical Collection arrange closure', nestedOperation, before, after);
}

// O8 snapshot consumption rechecks the queue-time data baseline. If scoped
// content drifts after queuing but before the real snapshot, it records an
// unsupported action rather than attaching a false collection intent.
{
  const f = fixture('snapshot-baseline-drift');
  const queued = intent.queueCollectionArrangeIntent({ canvasId: ids.canvasId, operation: f.operation,
    beforeNodes: f.beforeNodes, afterNodes: f.afterNodes });
  assert.equal(queued.ok, true, 'canonical direct-child plan queues against the actual helper');
  const drift = nodes => nodes.map(node => node.id === ids.childId
    ? { ...node, data: { ...node.data, text: 'changed after queue, before O8 snapshot' } } : node);
  const entry = intent.recordHistoryTransition(ids.canvasId,
    { nodes: drift(f.beforeNodes) }, { nodes: drift(f.afterNodes) });
  assert.equal(entry.lcos_history_operations.length, 1, 'the original O8 owner consumes the matching replace frame once');
  assert.equal(entry.lcos_history_operations[0].lcos_intent_unsupported,
    'COLLECTION_ARRANGE_HISTORY_SNAPSHOT_MISMATCH', 'queue-time scope data drift is fail-closed at O8 snapshot consumption');
  assert.equal(entry.lcos_history_operations[0].lcos_operation.operationId, f.operation.operationId);
}
{
  const f = fixture('snapshot-geometry-baseline-drift');
  const queued = intent.queueCollectionArrangeIntent({ canvasId: ids.canvasId, operation: f.operation,
    beforeNodes: f.beforeNodes, afterNodes: f.afterNodes });
  assert.equal(queued.ok, true);
  const drift = nodes => nodes.map(node => node.id === ids.childId
    ? { ...node, position: { x: node.position.x + 1, y: node.position.y } } : node);
  const entry = intent.recordHistoryTransition(ids.canvasId,
    { nodes: drift(f.beforeNodes) }, { nodes: drift(f.afterNodes) });
  assert.equal(entry.lcos_history_operations.length, 1);
  assert.equal(entry.lcos_history_operations[0].lcos_intent_unsupported,
    'COLLECTION_ARRANGE_HISTORY_SNAPSHOT_MISMATCH', 'the exact operation slices also guard geometry drift before the debounced O8 snapshot');
}

console.log('PASS: actual native history helper rejects foreign owner/data/raw-geometry drift and unmapped nested ancestors; the existing O8 snapshot consumer fails closed on queue-time baseline drift.');
