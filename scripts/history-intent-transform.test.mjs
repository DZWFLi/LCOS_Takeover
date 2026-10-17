import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const filename = 'page-Da_DfwiK.js';
const original = fs.readFileSync(new URL('../reference/tapnow-installed/resources/web/assets/' + filename, import.meta.url), 'utf8');
const cut = transformCutScript(filename, original);
const bridged = transformNodeBridgeScript(filename, cut);
const docked = transformSurfaceDockScript(filename, bridged);
const transformed = transformHistoryIntentScript(filename, docked);

assert.ok(transformed.startsWith('/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */'));
assert.equal(transformHistoryIntentScript(filename, transformed), transformed);
assert.equal(transformHistoryIntentScript('other.js', 'const untouched = true;'), 'const untouched = true;');
assert.match(transformed, /wrapHistory\("undo"/);
assert.match(transformed, /wrapHistory\("redo"/);
assert.match(transformed, /wrapPaste\(/);
assert.match(transformed, /recordHistoryTransition\(/, 'native O8 snapshots carry explicit lifecycle operations');
assert.match(transformed, /L=window\.__LCOS_NATIVE_INTENT__\.normalizeTextReceiptHistoryState\(__lcosHistoryCanvasId,\{nodes:I,edges:j\}\)/,
  'the original O8 candidate receives accepted exact text receipt metadata before its original R8 comparison and append');
assert.match(transformed, /withHistoryEntry\(/, 'undo/redo callbacks bind changes to the selected native snapshot');
assert.match(transformed, /tagHistoryBatchOperations\(/, 'native O8 undo/redo DTOs carry intent before executeBatchOperations');
assert.ok(transformed.indexOf('tagHistoryBatchOperations(') < transformed.indexOf('h(B,ce)', transformed.indexOf('tagHistoryBatchOperations(')),
  'explicit history operation and lineage validation run before the native batch flush');
assert.ok(transformed.includes('_(P,x.current[I],"undo")'), 'undo uses the snapshot being left, where the original action is recorded');
assert.ok(transformed.includes('_(P,x.current[j],"redo")'), 'redo uses the target snapshot containing the original action');
assert.match(transformed, /backfillNodeReceipt:__lcosBackfillNodeReceipt/, 'the native B8/O8 receipt-only setter reaches the original bridge');
assert.match(transformed, /backfillNodeReceipt:P\.backfillNodeReceipt/, 'B8 exposes the O8 history-owned receipt setter');
assert.match(transformed, /setNodes:__lcosHistorySetNodes/, 'receipt patch receives the original React state setter, not updateNodeData');
const originalGetter = transformed.match(/getNode:(__lcosHistoryId=>__lcosBackfillNodeReceipt\?\.readCollectionHistoryNode\?\.\(e,__lcosHistoryId\)\?\?M\(\)\.find\(__lcosHistoryNode=>__lcosHistoryNode\.id===__lcosHistoryId\))/)?.[1];
assert.ok(originalGetter, 'r6 keeps its original getter and prefers the existing O8 raw Collection reader');
const canonicalCollection={id:'collection-node',type:'pile',position:{x:599.304,y:-51.444},width:250,data:{lcos_native_collection:true}};
const displayCollection={...canonicalCollection,position:{x:544.304,y:-102.889},width:360,data:{...canonicalCollection.data,displayMembers:[]}};
const ordinary={id:'ordinary',type:'text',data:{content:'unchanged'}};
const actualGetter=new Function('e','M','__lcosBackfillNodeReceipt','return ('+originalGetter+')')('canvas',()=>[displayCollection,ordinary],
  {readCollectionHistoryNode:(canvas,id)=>canvas==='canvas'&&id===canonicalCollection.id?canonicalCollection:undefined});
assert.equal(actualGetter(canonicalCollection.id),canonicalCollection,'Core merge removes the canonical carrier, not the widened Pile fan');
assert.equal(actualGetter(ordinary.id),ordinary,'ordinary lifecycle reads keep the donor getter');
assert.equal((transformed.match(/wrapPaste\(/g) || []).length, 2, 'native paste and explicit context-menu duplicate callbacks are both wrapped');
assert.match(transformed, /tagCreatedNodes\(B\)/, 'paste nodes get explicit NodeID intent before deferred native callbacks');
assert.match(transformed, /tagCreatedNode\(q\)/, 'right-click duplicate clone gets explicit NodeID intent');
assert.ok(transformed.includes('wrapPaste(T,__lcosCanvasId)'), 'keyboard and paste handlers capture the actual Canvas ID at the consumer hook');
assert.ok(transformed.includes('lcosCanvasId:i') && transformed.includes('lcosCanvasId:e'), 'each native paste hook call passes its owning Canvas ID');
assert.match(transformed, /partitionOperations\(le\)\.flatMap/);
assert.match(transformed, /operationKey\(me\)/);
assert.match(transformed, /metadata\(z\)/);
assert.match(transformed, /rememberNodeRef\(e,le\.id,le\.lcos_ref,le\.lcos_operation\)/);
assert.match(transformed, /lcos_refs:Object\.fromEntries/);
assert.match(transformed, /lcos_snapshots:Object\.fromEntries/);
assert.equal((transformed.match(/lcos_refs:Object\.fromEntries/g) || []).length, 1, 'only the native node request carries LCOS refs');
assert.equal((transformed.match(/lcos_snapshots:Object\.fromEntries/g) || []).length, 1, 'only the native node request carries delete snapshots');
assert.ok(!transformed.includes('partitionOperations(z)'), 'edge queue remains on its original native route');

const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8');
const sandbox = { window: {}, structuredClone, Date, crypto: { randomUUID: (() => { let n = 0; return () => 'intent-' + (++n); })() } };
vm.runInNewContext(runtimeSource, sandbox, { filename: 'startup-history-intent.js' });
const intent = sandbox.window.__LCOS_NATIVE_INTENT__;
assert.ok(intent, 'runtime helper installs the expected global');

const ref = { version: 1, entityType: 'artifact', entityId: 'artifact-1', artifactId: 'artifact-1', revisionId: 'revision-1' };
const newerRevision = { ...ref, revisionId: 'revision-2' };
const deleteOperation = { version: 1, operationId: 'delete-1', kind: 'delete', phase: 'apply' };
intent.rememberNodeRef('canvas-1', 'old-node', ref, deleteOperation);
intent.rememberNodeRef('canvas-1', 'old-node', newerRevision);

const restored = { type: 'add', item: { id: 'new-node', type: 'image', data: { lcos_ref: newerRevision } } };
const receiver = { value: 42 };
const syncReturn = { exact: true };
const undo = intent.wrapHistory('undo', function (arg) {
  assert.equal(this, receiver);
  assert.equal(arg, 'arg');
  intent.tagChanges([restored], null, 'canvas-1');
  return syncReturn;
});
assert.equal(undo.call(receiver, 'arg'), syncReturn, 'sync return identity is preserved');
assert.equal(intent.metadata(restored).reason, 'HISTORY_OPERATION_ENTRY_ASSOCIATION_MISSING', 'ref history is never guessed from the last matching Node/ref record');

const coreRef = { version: 1, entityType: 'view', entityId: 'view-copy-1', artifactId: 'artifact-1', artifactViewId: 'view-copy-1', revisionId: 'revision-3' };
const duplicateNode = { id: 'copy-node-a', type: 'image', position: { x: 9, y: 12 }, data: { id: 'copy-node-a', title: 'source title', src: 'old-upload-url', lcos_ref: ref } };
const duplicateAdd = { type: 'add', item: duplicateNode };
const duplicatePaste = intent.wrapPaste(() => { intent.tagCreatedNode(duplicateNode); return syncReturn; }, 'canvas-history');
assert.equal(duplicatePaste(), syncReturn);
intent.tagChanges([duplicateAdd], null, 'canvas-history');
const duplicateOperation = intent.metadata(duplicateAdd).lcos_operation;
assert.equal(duplicateOperation.kind, 'duplicate-view');
const historyEntry = { state: { nodes: [duplicateNode], edges: [] }, timestamp: 1,
  ...intent.recordHistoryTransition('canvas-history', { nodes: [], edges: [] }, { nodes: [duplicateNode], edges: [] }) };
assert.equal(historyEntry.lcos_history_operations.length, 1, 'apply intent is attached to the original TapNow snapshot entry');
assert.equal(historyEntry.lcos_history_operations[0].lcos_operation.kind, 'duplicate-view');

const liveHistoryNodes = { current: [duplicateNode] };
let directStateValue;
const beforeEntryCount = 1;
const patched = intent.backfillHistoryReceipt({ canvasId: 'canvas-history', nodeId: 'copy-node-a', ref: coreRef,
  operation: { ...duplicateOperation, operationId: 'not-the-entry' }, data: { id: 'copy-node-a', title: 'canonical title', src: '/core/canonical-file' },
  history: [historyEntry], currentNodesRef: liveHistoryNodes, setNodes: nodes => { directStateValue = nodes; }, suppress() {} });
assert.deepEqual(JSON.parse(JSON.stringify(patched)), { ok: false, reason: 'HISTORY_OPERATION_ENTRY_NOT_FOUND' }, 'receipt must be tied to the exact operation id');
const receipt = intent.backfillHistoryReceipt({ canvasId: 'canvas-history', nodeId: 'copy-node-a', ref: coreRef,
  operation: historyEntry.lcos_history_operations[0].lcos_operation, data: { id: 'copy-node-a', title: 'canonical title', src: '/core/canonical-file' },
  history: [historyEntry], currentNodesRef: liveHistoryNodes, setNodes: nodes => { directStateValue = nodes; }, suppress() {} });
assert.deepEqual(JSON.parse(JSON.stringify(receipt)), { ok: true }, 'Core receipt patches the original history owner');
assert.equal(historyEntry.state.nodes[0].data.lcos_ref.entityId, coreRef.entityId);
assert.equal(historyEntry.state.nodes[0].data.src, '/core/canonical-file', 'receipt replaces stale signed/upload URL in the native undo snapshot');
assert.equal(directStateValue[0].data.lcos_ref.entityId, coreRef.entityId, 'live nodes are refreshed through React setState');
assert.equal(liveHistoryNodes.current[0].data.src, '/core/canonical-file');
assert.equal(beforeEntryCount, 1, 'receipt backfill does not add another native history entry');

const deleteApplied = { type: 'remove', id: 'copy-node-a' };
intent.tagChanges([deleteApplied], id => id === 'copy-node-a' ? liveHistoryNodes.current[0] : undefined, 'canvas-history');
const userDeleteOperation = intent.metadata(deleteApplied).lcos_operation;
const userDeleteEntry = { state: { nodes: [], edges: [] },
  ...intent.recordHistoryTransition('canvas-history', { nodes: liveHistoryNodes.current, edges: [] }, { nodes: [], edges: [] }) };
assert.equal(userDeleteEntry.lcos_history_operations[0].lcos_snapshot.data.lcos_ref.entityId, coreRef.entityId,
  'native delete entry snapshots the receipt-bound persistent identity');
const undoDeleteAdd = { type: 'add', item: { ...duplicateNode, id: 'delete-restore-new-id', data: { ...duplicateNode.data, id: 'delete-restore-new-id' } } };
intent.withHistoryEntry('canvas-history', 'undo', userDeleteEntry, new Map([['copy-node-a', 'delete-restore-new-id']]), () => {
  intent.tagChanges([undoDeleteAdd], null, 'canvas-history');
  const batch = [{ operationType: 'create', id: 'delete-restore-new-id', data: undoDeleteAdd.item.data }];
  intent.tagHistoryBatchOperations('canvas-history', 'undo', userDeleteEntry, new Map([['copy-node-a', 'delete-restore-new-id']]), [undoDeleteAdd], batch);
  assert.deepEqual(JSON.parse(JSON.stringify(batch[0].lcos_operation)), { ...userDeleteOperation, phase: 'undo' });
  assert.equal(batch[0].lcos_ref.entityId, coreRef.entityId, 'delete undo restores the exact Core-bound view');
});
liveHistoryNodes.current = [{ ...duplicateNode, id: 'delete-restore-new-id', data: { ...duplicateNode.data, id: 'delete-restore-new-id' } }];
const restoreReceipt = intent.backfillHistoryReceipt({ canvasId: 'canvas-history', nodeId: 'delete-restore-new-id', ref: coreRef,
  operation: { ...userDeleteOperation, phase: 'undo' }, data: { id: 'delete-restore-new-id', title: 'canonical title', src: '/core/canonical-file' },
  history: [historyEntry, userDeleteEntry], currentNodesRef: liveHistoryNodes, setNodes: nodes => { directStateValue = nodes; }, suppress() {} });
assert.deepEqual(JSON.parse(JSON.stringify(restoreReceipt)), { ok: true }, 'receipt owner accepts the exact original operation in undo phase');
const redoDelete = { type: 'remove', id: 'delete-restore-new-id' };
intent.withHistoryEntry('canvas-history', 'redo', userDeleteEntry, new Map(), () => {
  intent.tagChanges([redoDelete], () => ({ ...duplicateNode, id: 'delete-restore-new-id', data: { ...duplicateNode.data, id: 'delete-restore-new-id' } }), 'canvas-history');
  const batch = [{ operationType: 'delete', id: 'delete-restore-new-id', data: {} }];
  intent.tagHistoryBatchOperations('canvas-history', 'redo', userDeleteEntry, new Map(), [redoDelete], batch);
  assert.deepEqual(JSON.parse(JSON.stringify(batch[0].lcos_operation)), { ...userDeleteOperation, phase: 'redo' });
  assert.equal(batch[0].lcos_snapshot.data.lcos_ref.entityId, coreRef.entityId);
});

const undoRemoval = { type: 'remove', id: 'copy-node-a' };
intent.withHistoryEntry('canvas-history', 'undo', historyEntry, new Map(), () => {
  intent.tagChanges([undoRemoval], id => id === 'copy-node-a' ? liveHistoryNodes.current[0] : undefined, 'canvas-history');
  const batch = [{ operationType: 'delete', id: 'copy-node-a', data: {} }];
  intent.tagHistoryBatchOperations('canvas-history', 'undo', historyEntry, new Map(), [undoRemoval], batch);
  assert.deepEqual(JSON.parse(JSON.stringify(batch[0].lcos_operation)), { ...duplicateOperation, phase: 'undo' });
});
assert.deepEqual(JSON.parse(JSON.stringify(intent.metadata(undoRemoval).lcos_operation)), { ...duplicateOperation, phase: 'undo' });
assert.equal(intent.metadata(undoRemoval).lcos_ref.entityId, coreRef.entityId, 'undo obtains identity from the exact native entry');

const originalHistoryNode = historyEntry.state.nodes[0];
originalHistoryNode.data.historySourceNodeId = 'copy-node-a';
const redoAdd = { type: 'add', item: { ...originalHistoryNode, id: 'copy-node-redo', data: originalHistoryNode.data } };
intent.withHistoryEntry('canvas-history', 'redo', historyEntry, new Map([['copy-node-a', 'copy-node-redo']]), () => {
  intent.tagChanges([redoAdd], null, 'canvas-history');
  const batch = [{ operationType: 'create', id: 'copy-node-redo', data: redoAdd.item.data }];
  intent.tagHistoryBatchOperations('canvas-history', 'redo', historyEntry, new Map([['copy-node-a', 'copy-node-redo']]), [redoAdd], batch);
  assert.deepEqual(JSON.parse(JSON.stringify(batch[0].lcos_operation)), { ...duplicateOperation, phase: 'redo' });
  assert.equal(Object.hasOwn(batch[0].data, 'historySourceNodeId'), false, 'verified renderer lineage is stripped only from the wire DTO');
  assert.equal(originalHistoryNode.data.historySourceNodeId, 'copy-node-a', 'the native O8 snapshot retains its renderer lineage');
  assert.equal(redoAdd.item.data.historySourceNodeId, 'copy-node-a', 'the live redo node data is not mutated');
});
assert.deepEqual(JSON.parse(JSON.stringify(intent.metadata(redoAdd).lcos_operation)), { ...duplicateOperation, phase: 'redo' });
assert.equal(intent.metadata(redoAdd).lcos_ref.entityId, coreRef.entityId);
assert.equal(historyEntry.lcos_history_operations[0].carrierId, 'copy-node-redo', 'redo NodeID remapping stays bound to the original snapshot operation');

const foreignLineageData = { ...originalHistoryNode.data, historySourceNodeId: 'foreign-node' };
const foreignLineageAdd = { type: 'add', item: { ...originalHistoryNode, id: 'copy-node-foreign', data: foreignLineageData } };
const foreignLineageBatch = [{ operationType: 'create', id: 'copy-node-foreign', data: foreignLineageData }];
intent.tagHistoryBatchOperations('canvas-history', 'redo', historyEntry, new Map([['copy-node-a', 'copy-node-foreign']]),
  [foreignLineageAdd], foreignLineageBatch);
assert.equal(foreignLineageBatch[0].lcos_intent_unsupported, 'HISTORY_SOURCE_NODE_ID_ALIAS_MISMATCH', 'foreign lineage is rejected against the selected entry and remap');
assert.equal(foreignLineageBatch[0].data.historySourceNodeId, 'foreign-node', 'unverified lineage is not silently stripped');
assert.equal(foreignLineageBatch[0].data, foreignLineageData, 'failure preserves the unmodified DTO for diagnosis');
assert.throws(() => intent.partitionOperations(foreignLineageBatch), /refusing persistence/);

const sharedRef = { ...ref, entityId: 'same-artifact', artifactId: 'same-artifact' };
const sharedNode = { id: 'same-node', type: 'image', data: { id: 'same-node', src: '/same.png', lcos_ref: sharedRef } };
const sharedAdd = { type: 'add', item: sharedNode };
intent.tagChanges([sharedAdd], null, 'canvas-multi');
const firstOperation = intent.metadata(sharedAdd).lcos_operation;
const firstEntry = { state: { nodes: [sharedNode], edges: [] }, ...intent.recordHistoryTransition('canvas-multi', { nodes: [], edges: [] }, { nodes: [sharedNode], edges: [] }) };
const sharedDelete = { type: 'remove', id: 'same-node' };
intent.tagChanges([sharedDelete], () => sharedNode, 'canvas-multi');
const secondOperation = intent.metadata(sharedDelete).lcos_operation;
const secondEntry = { state: { nodes: [], edges: [] }, ...intent.recordHistoryTransition('canvas-multi', { nodes: [sharedNode], edges: [] }, { nodes: [], edges: [] }) };
assert.notEqual(firstOperation.operationId, secondOperation.operationId);
assert.equal(firstEntry.lcos_history_operations[0].lcos_ref.entityId, secondEntry.lcos_history_operations[0].lcos_ref.entityId,
  'one durable ref can participate in multiple distinct native history entries');
const restoreDelete = { type: 'add', item: { ...sharedNode, id: 'restored-delete-id', data: { ...sharedNode.data, id: 'restored-delete-id' } } };
intent.withHistoryEntry('canvas-multi', 'undo', secondEntry, new Map([['same-node', 'restored-delete-id']]), () => {
  intent.tagChanges([restoreDelete], null, 'canvas-multi');
});
assert.equal(intent.metadata(restoreDelete).lcos_operation.operationId, secondOperation.operationId,
  'undo uses the selected delete entry, not another entry for the same Artifact');
assert.equal(intent.metadata(restoreDelete).lcos_ref.entityId, sharedRef.entityId);
const undoEarlierCreate = { type: 'remove', id: 'same-node' };
intent.withHistoryEntry('canvas-multi', 'undo', firstEntry, new Map(), () => {
  intent.tagChanges([undoEarlierCreate], () => sharedNode, 'canvas-multi');
});
assert.equal(intent.metadata(undoEarlierCreate).lcos_operation.operationId, firstOperation.operationId,
  'an older same-entity history entry retains its own operation ID');

const ambiguousNode = { id: 'ambiguous-node', type: 'image', data: { lcos_ref: sharedRef } };
intent.tagChanges([{ type: 'add', item: ambiguousNode }], null, 'canvas-ambiguous');
intent.tagChanges([{ type: 'add', item: ambiguousNode }], null, 'canvas-ambiguous');
const ambiguousEntry = { state: { nodes: [ambiguousNode], edges: [] },
  ...intent.recordHistoryTransition('canvas-ambiguous', { nodes: [], edges: [] }, { nodes: [ambiguousNode], edges: [] }) };
assert.equal(ambiguousEntry.lcos_history_operations[0].lcos_intent_unsupported,
  'MULTIPLE_APPLY_OPERATIONS_BEFORE_NATIVE_HISTORY_COMMIT', 'ambiguous coalesced changes are preserved as unsupported, never assigned the last operation');
const ambiguousHistoryRemove = { type: 'remove', id: 'ambiguous-node' };
intent.withHistoryEntry('canvas-ambiguous', 'undo', ambiguousEntry, new Map(), () => {
  intent.tagChanges([ambiguousHistoryRemove], () => ambiguousNode, 'canvas-ambiguous');
});
assert.equal(intent.metadata(ambiguousHistoryRemove).reason, 'HISTORY_OPERATION_ENTRY_ASSOCIATION_MISSING');

const liveNode = {
  id: 'live-node', type: 'image', position: { x: 9, y: 12 }, selected: false,
  data: { lcos_ref: ref, src: 'blob:local', custom: { preserved: true } }, customField: ['persist', 1],
};
const removed = { type: 'remove', id: 'live-node' };
intent.tagChanges([removed], id => id === liveNode.id ? liveNode : undefined, 'canvas-2');
const removeMeta = intent.metadata(removed);
assert.equal(removeMeta.lcos_operation.kind, 'delete');
assert.deepEqual(JSON.parse(JSON.stringify(removeMeta.lcos_snapshot)), liveNode, 'delete snapshot keeps full node data and custom persisted fields');
assert.equal(Object.keys(removed).includes('__lcos_native_intent'), false, 'change metadata does not pollute TapNow change serialization');

const batchAdds = [
  { type: 'add', item: { id: 'paste-a', data: { lcos_ref: ref } } },
  { type: 'add', item: { id: 'paste-b', data: { lcos_ref: ref } } },
];
const createdNodes = [{ id: 'paste-a' }, { id: 'paste-b' }];
const paste = intent.wrapPaste(function (arg) {
  assert.equal(this, receiver);
  assert.equal(arg, 7);
  intent.tagCreatedNodes(createdNodes);
  return syncReturn;
}, 'canvas-3');
assert.equal(paste.call(receiver, 7), syncReturn);
intent.tagChanges(batchAdds, null, 'canvas-3'); // Simulates the later React/Native onNodesChange callback.
const pasteOps = batchAdds.map(change => intent.metadata(change).lcos_operation);
assert.ok(pasteOps.every(operation => operation.kind === 'duplicate-view' && operation.phase === 'apply'));
assert.equal(new Set(pasteOps.map(operation => operation.operationId)).size, 1, 'one native paste call is one explicit operation bucket');
const firstPasteId = pasteOps[0].operationId;
paste.call(receiver, 7);
intent.tagChanges(batchAdds, null, 'canvas-3');
assert.notEqual(intent.metadata(batchAdds[0]).lcos_operation.operationId, firstPasteId, 'each actual paste invocation gets a fresh operation ID');

const promise = Promise.resolve('same promise');
const asyncHistory = intent.wrapHistory('redo', () => promise);
assert.equal(asyncHistory(), promise, 'thenable return identity is preserved');
const outsideContext = { type: 'add', item: { id: 'after-async', data: {} } };
intent.tagChanges([outsideContext], null, 'canvas-4');
assert.equal(intent.metadata(outsideContext).lcos_operation.kind, 'create', 'intent context ends when the synchronous native callback returns');

const opA = { version: 1, operationId: 'bucket-a', kind: 'create', phase: 'apply' };
const opB = { version: 1, operationId: 'bucket-b', kind: 'delete', phase: 'apply' };
const groups = intent.partitionOperations([
  { operationType: 'create', id: 'a1', lcos_operation: opA },
  { operationType: 'create', id: 'a2', lcos_operation: opA },
  { operationType: 'update', id: 'u1' },
  { operationType: 'delete', id: 'b1', lcos_operation: opB },
]);
assert.equal(groups.length, 3, 'explicit operations and ordinary updates are isolated');
assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => group.items.length))), [2, 1, 1]);
assert.throws(() => intent.partitionOperations([{ operationType: 'delete', id: 'ambiguous', lcos_intent_unsupported: 'HISTORY_OPERATION_ASSOCIATION_MISSING' }]), /refusing persistence/);

intent.rememberNodeRef('canvas-5', 'same-ref-a', ref, { version: 1, operationId: 'create-same', kind: 'create', phase: 'apply' });
intent.rememberNodeRef('canvas-5', 'same-ref-b', ref, { version: 1, operationId: 'delete-same', kind: 'delete', phase: 'apply' });
const ambiguousUndo = { type: 'remove', id: 'history-new-id' };
intent.wrapHistory('undo', () => intent.tagChanges([ambiguousUndo], id => ({ id, data: { lcos_ref: ref } }), 'canvas-5'))();
assert.equal(intent.metadata(ambiguousUndo).unsupported, true, 'no entry metadata fails closed even when remembered refs appear to match');

console.log('PASS: original TapNow node-history/queue AST, node-only intent partitioning, identity-safe receipts, snapshots, and fail-closed history association.');
