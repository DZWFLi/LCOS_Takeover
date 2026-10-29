import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const runtimeSource = fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8')

function createIntent() {
  const sandbox = {
    window: {}, structuredClone, Date,
    crypto: { randomUUID: (() => { let sequence = 0; return () => 'receipt-' + (++sequence) })() },
  }
  vm.runInNewContext(runtimeSource, sandbox, { filename: 'startup-history-intent.js' })
  return sandbox.window.__LCOS_NATIVE_INTENT__
}

function ref(revisionId, artifactId = 'artifact-text', artifactViewId = 'view-text', entityType = 'artifact') {
  return { version: 1, entityType, entityId: artifactId, artifactId, artifactViewId, revisionId }
}

function makeNode(id, body, nodeRef, extra = {}) {
  return {
    id, type: 'text', position: { x: 31, y: 47 }, width: 640, height: 360,
    measured: { width: 640, height: 360 }, selected: false,
    data: { id, text: body, lcos_ref: structuredClone(nodeRef), lcosTextViewMode: 'text',
      lcosTextCollapsedIds: ['keep-me'], nestedPreference: { keep: true }, ...extra },
    customNodeField: { keep: 'unchanged' },
  }
}

function makeOwner({ canvasId = 'canvas-text', nodeId = 'text-node', liveBody = 'saved body', liveRef = ref('rev-4'), liveExtra = {}, history = [] } = {}) {
  const intent = createIntent()
  const node = makeNode(nodeId, liveBody, liveRef, liveExtra)
  const other = makeNode('other-node', 'other body', ref('other-rev', 'other-artifact', 'other-view'))
  const currentNodesRef = { current: [node, other] }
  const calls = { setNodes: 0, suppress: 0, lastSetNodes: null }
  const setNodes = nodes => { calls.setNodes++; calls.lastSetNodes = nodes }
  const suppress = () => { calls.suppress++ }
  intent.rememberNodeRef(canvasId, nodeId, liveRef)
  return { intent, canvasId, nodeId, node, other, currentNodesRef, history, calls, setNodes, suppress }
}

function callTextReceipt(owner, receiptRef, body, canvasId = owner.canvasId, options = {}) {
  return owner.intent.backfillHistoryReceipt({ receiptKind: 'text-revision', canvasId,
    nodeId: owner.nodeId, ref: receiptRef, body, history: owner.history,
    currentNodesRef: owner.currentNodesRef, setNodes: owner.setNodes, suppress: owner.suppress, ...options })
}

const asJson = value => JSON.parse(JSON.stringify(value))
const originalBody = 'before edit'
const savedBody = 'before edit + exact suffix'
const oldRef = ref('revision-4')
const newRef = ref('revision-5')

// An accepted exact autosave request can return after the user has typed a
// newer local body. Only its actual attempted DTO authorizes advancing base
// metadata; no old body is written into live state or invented as a new frame.
{
  const later = 'newer unsent draft'
  const history = [
    {state:{nodes:[makeNode('text-node',savedBody,oldRef)],edges:[]},timestamp:1},
    {state:{nodes:[makeNode('text-node',later,oldRef)],edges:[]},timestamp:2},
  ]
  const owner = makeOwner({ liveBody: later, liveRef: oldRef, history })
  const queuedTextReceipt = { version:1,source:'native-autosave',operationId:'original-A',
    canvasId:owner.canvasId,nodeId:owner.nodeId,expectedRevisionId:oldRef.revisionId,body:savedBody,
    queuedNode:makeNode(owner.nodeId,savedBody,oldRef) }
  assert.equal(callTextReceipt(owner,newRef,savedBody,owner.canvasId,{queuedTextReceipt}).ok,true)
  assert.equal(owner.currentNodesRef.current[0].data.text,later)
  assert.deepEqual(asJson(owner.currentNodesRef.current[0].data.lcos_ref),newRef)
  assert.deepEqual(asJson(history[0].state.nodes[0].data.lcos_ref),newRef)
  assert.deepEqual(asJson(history[1].state.nodes[0].data.lcos_ref),oldRef)
  assert.equal(history.length,2)
  for(const wrong of [
    {...queuedTextReceipt,canvasId:'foreign'}, {...queuedTextReceipt,body:'not requested'},
    {...queuedTextReceipt,queuedNode:makeNode(owner.nodeId,savedBody,ref('x','different','view-text'))},
  ]) {
    const target=makeOwner({liveBody:later,liveRef:oldRef})
    assert.equal(callTextReceipt(target,newRef,savedBody,target.canvasId,{queuedTextReceipt:wrong}).ok,false)
    assert.equal(target.currentNodesRef.current[0].data.text,later)
    assert.equal(target.calls.setNodes,0)
  }
}

// React can defer the updater invoked by S.flush(). The real original append
// must receive the accepted reference even though x.current did not yet contain
// its pending saved-body frame when the receipt scanned existing history.
{
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef })
  const pending = { nodes: structuredClone(owner.currentNodesRef.current), edges: [{ id: 'keep-edge' }], extra: 'keep' }
  const before = asJson(pending)
  assert.equal(callTextReceipt(owner, newRef, savedBody, owner.canvasId, {
    flushHistory() {}, getHistory: () => owner.history,
  }).ok, true)
  const normalized = owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, pending)
  assert.deepEqual(asJson(normalized.nodes[0]), { ...before.nodes[0], data: { ...before.nodes[0].data, lcos_ref: newRef } })
  assert.equal(normalized.nodes[1], pending.nodes[1], 'other nodes keep their original identity and fields')
  assert.equal(normalized.edges, pending.edges, 'the original edge owner is untouched')
  assert.equal(normalized.extra, 'keep')
  assert.deepEqual(asJson(pending), before, 'normalization never mutates the captured user frame')
  assert.equal(owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, normalized), normalized)
  assert.equal(owner.intent.normalizeTextReceiptHistoryState('foreign-canvas', pending), pending)
  for (const altered of [
    { ...pending, nodes: pending.nodes.map(node => node.id === owner.nodeId ? { ...node, id: 'foreign-node' } : node) },
    { ...pending, nodes: pending.nodes.map(node => node.id === owner.nodeId ? { ...node, type: 'image' } : node) },
    { ...pending, nodes: pending.nodes.map(node => node.id === owner.nodeId ? { ...node, data: { ...node.data, text: 'later genuine edit' } } : node) },
    { ...pending, nodes: pending.nodes.map(node => node.id === owner.nodeId ? { ...node, data: { ...node.data, lcos_ref: ref('old', 'artifact-text', 'foreign-view') } } : node) },
    { ...pending, nodes: [...pending.nodes, pending.nodes[0]] },
  ]) assert.equal(owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, altered), altered,
    'foreign identities, bodies, types and ambiguous IDs never acquire the receipt')
  owner.intent.rememberNodeRef(owner.canvasId, owner.nodeId, ref('later-canonical-revision'))
  assert.equal(owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, pending), pending,
    'a newer remembered revision invalidates an old receipt even when that old body reappears')
  owner.intent.rememberNodeRef(owner.canvasId, owner.nodeId, newRef)
  assert.equal(owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, pending), pending,
    'returning to an old ref without a new accepted receipt does not revive stale proof')
}

// A rejected owner setter is not an accepted proof for a delayed original frame.
{
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef })
  const pending = { nodes: structuredClone(owner.currentNodesRef.current), edges: [] }
  assert.equal(callTextReceipt(owner, newRef, savedBody, owner.canvasId, {
    setTextReceiptNodes() { throw new Error('original owner rejected') },
  }).ok, false)
  assert.equal(owner.intent.normalizeTextReceiptHistoryState(owner.canvasId, pending), pending)
}

// Early receipt uses the original flush before metadata changes its arguments.
// That flush may replace x.current: inspect its fresh array rather than patching
// the stale array captured by the backfill caller.
{
  const initial = [{ state: { nodes: [makeNode('text-node', originalBody, oldRef)], edges: [] }, timestamp: 1 }]
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef, history: initial })
  let flushes = 0, metadataSets = 0
  const result = callTextReceipt(owner, newRef, savedBody, owner.canvasId, {
    flushHistory() {
      flushes++
      owner.history = [...initial, { state: { nodes: structuredClone(owner.currentNodesRef.current), edges: [] }, timestamp: 2 }]
    },
    getHistory: () => owner.history,
    isHistoryApplying: () => false,
    setTextReceiptNodes(nodes) { metadataSets++; owner.setNodes(nodes) },
  })
  assert.equal(result.ok, true)
  assert.equal(flushes, 1)
  assert.equal(metadataSets, 1)
  assert.equal(owner.history.length, 2, 'the genuine user edit is retained as one original frame')
  assert.deepEqual(asJson(owner.history[1].state.nodes[0].data.lcos_ref), newRef)
  assert.deepEqual(asJson(initial[0].state.nodes[0].data.lcos_ref), oldRef)
  assert.equal(owner.calls.suppress, 0, 'text does not engage broad timing-based history suppression')
}

// Undo/Redo already owns an applying transition. Do not flush and accidentally
// record that intermediate target as a fresh edit; only patch its exact receipt.
{
  const history = [
    { state: { nodes: [makeNode('text-node', originalBody, oldRef)], edges: [] }, timestamp: 1 },
    { state: { nodes: [makeNode('text-node', savedBody, newRef)], edges: [] }, timestamp: 2 },
  ]
  const owner = makeOwner({ liveBody: originalBody, liveRef: oldRef, history })
  let metadataSets = 0
  const result = callTextReceipt(owner, ref('undo-revision'), originalBody, owner.canvasId, {
    flushHistory() { throw new Error('applying history must not be flushed') },
    getHistory: () => history,
    isHistoryApplying: () => true,
    setTextReceiptNodes(nodes) { metadataSets++; owner.setNodes(nodes) },
  })
  assert.equal(result.ok, true)
  assert.equal(metadataSets, 1)
  assert.equal(history.length, 2)
  assert.equal(history[1].timestamp, 2)
  assert.deepEqual(asJson(history[1].state.nodes[0].data.lcos_ref), newRef, 'the redo body/version is not rewritten by the undo receipt')
  assert.equal(owner.calls.suppress, 0)
}

// A user state change during flush is never overwritten by receipt metadata.
{
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef })
  const result = callTextReceipt(owner, newRef, savedBody, owner.canvasId, {
    flushHistory() { owner.currentNodesRef.current = owner.currentNodesRef.current.map(node => node.id === owner.nodeId
      ? { ...node, data: { ...node.data, text: 'later user input' } } : node) },
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'LIVE_STATE_CHANGED_DURING_HISTORY_FLUSH')
  assert.equal(owner.currentNodesRef.current[0].data.text, 'later user input')
  assert.equal(owner.calls.setNodes, 0)
}

// Early Core receipt: O8 has not produced a saved-body snapshot yet. Patch only
// the exact live node; do not suppress the native history debounce.
{
  const oldBodySnapshot = makeNode('text-node', originalBody, oldRef)
  const history = [{ state: { nodes: [oldBodySnapshot], edges: [] }, timestamp: 1 }]
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef, history })
  const beforeOther = asJson(owner.currentNodesRef.current[1])
  const beforeHistory = asJson(history)
  const result = callTextReceipt(owner, newRef, savedBody)
  assert.deepEqual(asJson(result), { ok: true })
  assert.equal(owner.calls.setNodes, 1)
  assert.equal(owner.calls.suppress, 0, 'text-revision receipts never suppress the original O8 debounce')
  assert.equal(owner.currentNodesRef.current[0].data.text, savedBody)
  assert.deepEqual(asJson(owner.currentNodesRef.current[0].data.lcos_ref), newRef)
  assert.deepEqual(asJson(history), beforeHistory, 'no nonmatching/old-body history snapshot is synthesized or rewritten')
  assert.deepEqual(asJson(owner.currentNodesRef.current[1]), beforeOther, 'other live nodes remain byte-equivalent')
}

// Late receipt: patch only the same Native ID + same Artifact/View + exact
// saved body snapshot. Earlier body snapshots and unrelated nodes stay intact.
{
  const staleContentAlias = 'stale renderer alias'
  const matchingSnapshot = makeNode('text-node', savedBody, oldRef, { content: staleContentAlias })
  const oldBodySnapshot = makeNode('text-node', originalBody, oldRef)
  const matchingOperationSnapshot = makeNode('text-node', savedBody, oldRef)
  const oldOperationSnapshot = makeNode('text-node', originalBody, oldRef)
  const otherSnapshot = makeNode('other-node', 'other body', ref('other-rev', 'other-artifact', 'other-view'))
  const history = [
    { state: { nodes: [oldBodySnapshot, otherSnapshot], edges: [{ id: 'edge-stable' }] }, timestamp: 1 },
    { state: { nodes: [matchingSnapshot, otherSnapshot], edges: [{ id: 'edge-stable' }] }, timestamp: 2,
      lcos_history_operations: [
        { nodeId: 'text-node', lcos_snapshot: matchingOperationSnapshot },
        { nodeId: 'text-node', lcos_snapshot: oldOperationSnapshot },
      ] },
  ]
  const owner = makeOwner({ liveBody: savedBody, liveRef: oldRef, liveExtra: { content: staleContentAlias }, history })
  const beforeOther = asJson(owner.currentNodesRef.current[1])
  const beforeOld = asJson(oldBodySnapshot)
  const beforeOldOperation = asJson(oldOperationSnapshot)
  const beforeMatching = asJson(matchingSnapshot)
  const beforeOperation = asJson(matchingOperationSnapshot)
  const result = callTextReceipt(owner, newRef, savedBody)
  assert.deepEqual(asJson(result), { ok: true })
  assert.equal(owner.calls.setNodes, 1)
  assert.equal(owner.calls.suppress, 0)
  assert.deepEqual(asJson(matchingSnapshot.data.lcos_ref), oldRef, 'the immutable pre-patch test object is not mutated in place')
  assert.deepEqual(asJson(history[1].state.nodes[0].data.lcos_ref), newRef)
  assert.deepEqual(asJson(history[1].lcos_history_operations[0].lcos_snapshot.data.lcos_ref), newRef)
  assert.deepEqual(asJson(history[0].state.nodes[0]), beforeOld, 'older body snapshot remains exactly unchanged')
  assert.deepEqual(asJson(history[1].lcos_history_operations[1].lcos_snapshot), beforeOldOperation,
    'older operation snapshot remains exactly unchanged')
  assert.deepEqual(asJson(history[1].state.nodes[1]), beforeOther, 'other historical nodes remain unchanged')
  assert.deepEqual(asJson(owner.currentNodesRef.current[1]), beforeOther, 'other live nodes remain unchanged')
  assert.deepEqual(asJson(history[1].state.nodes[0].data), {
    ...beforeMatching.data, lcos_ref: newRef,
  }, 'matching snapshot changes only lcos_ref and leaves the stale content alias intact')
  assert.deepEqual(asJson(history[1].lcos_history_operations[0].lcos_snapshot), {
    ...beforeOperation, data: { ...beforeOperation.data, lcos_ref: newRef },
  }, 'matching lifecycle snapshot changes only lcos_ref')
  assert.deepEqual(asJson(owner.currentNodesRef.current[0].data), {
    ...asJson(owner.node.data), lcos_ref: newRef,
  }, 'live receipt changes only lcos_ref and leaves the stale content alias intact')
}

// Wrong material, wrong view, a non-primary view reference, wrong live body,
// and wrong Canvas owner all fail closed before any setter/history mutation.
for (const testCase of [
  { name: 'wrong Artifact', receiptRef: ref('revision-5', 'foreign-artifact', 'view-text'), body: savedBody },
  { name: 'wrong ArtifactView', receiptRef: ref('revision-5', 'artifact-text', 'foreign-view'), body: savedBody },
  { name: 'view entity is not a primary Artifact receipt', receiptRef: ref('revision-5', 'artifact-text', 'view-text', 'view'), body: savedBody },
  { name: 'wrong body', receiptRef: newRef, body: 'not the current live body' },
  { name: 'text wins over newer content alias', receiptRef: newRef, body: savedBody,
    liveBody: originalBody, liveExtra: { content: savedBody } },
  { name: 'malformed text does not fall back to content', receiptRef: newRef, body: savedBody,
    liveBody: originalBody, liveExtra: { text: null, content: savedBody } },
  { name: 'wrong Canvas', receiptRef: newRef, body: savedBody, canvasId: 'another-canvas' },
]) {
  const owner = makeOwner({ liveBody: testCase.liveBody ?? savedBody, liveRef: oldRef, liveExtra: testCase.liveExtra, history: [
    { state: { nodes: [makeNode('text-node', testCase.liveBody ?? savedBody, oldRef, testCase.liveExtra)], edges: [] } },
  ] })
  const beforeCurrent = asJson(owner.currentNodesRef.current)
  const beforeHistory = asJson(owner.history)
  const result = callTextReceipt(owner, testCase.receiptRef, testCase.body, testCase.canvasId)
  assert.equal(result.ok, false, testCase.name)
  assert.equal(owner.calls.setNodes, 0, testCase.name + ': no live setter')
  assert.equal(owner.calls.suppress, 0, testCase.name + ': no history suppression')
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent, testCase.name + ': live nodes unchanged')
  assert.deepEqual(asJson(owner.history), beforeHistory, testCase.name + ': history unchanged')
}

// Idempotent receipt: matching live and historical refs are already current,
// so it is a true no-op and does not emit another React/O8 state frame.
{
  const currentSnapshot = makeNode('text-node', savedBody, newRef)
  const history = [{ state: { nodes: [currentSnapshot], edges: [] } }]
  const owner = makeOwner({ liveBody: savedBody, liveRef: newRef, history })
  const beforeCurrent = asJson(owner.currentNodesRef.current)
  const beforeHistory = asJson(history)
  const result = callTextReceipt(owner, newRef, savedBody)
  assert.deepEqual(asJson(result), { ok: true })
  assert.equal(owner.calls.setNodes, 0, 'an idempotent receipt never calls the original setter')
  assert.equal(owner.calls.suppress, 0)
  assert.deepEqual(asJson(owner.currentNodesRef.current), beforeCurrent)
  assert.deepEqual(asJson(history), beforeHistory)
}

// Existing lifecycle receipts stay on the old operation-bound branch, including
// canonical data replacement and its established suppression behavior.
{
  const lifecycleRef = ref('revision-9', 'artifact-copy', 'view-copy')
  const sourceRef = ref('revision-8', 'artifact-copy', 'view-copy')
  const lifecycleNode = makeNode('copy-node', 'renderer body', sourceRef, { src: 'old-signed-url', title: 'renderer title' })
  const operation = { version: 1, operationId: 'duplicate-operation', kind: 'duplicate-view', phase: 'apply' }
  const action = { nodeId: 'copy-node', aliases: ['copy-node'], carrierId: 'copy-node', changeType: 'add',
    lcos_operation: { ...operation, phase: 'apply' }, lcos_ref: sourceRef, lcos_snapshot: structuredClone(lifecycleNode) }
  const history = [{ state: { nodes: [structuredClone(lifecycleNode)], edges: [] }, lcos_history_operations: [action] }]
  const owner = makeOwner({ canvasId: 'canvas-lifecycle', nodeId: 'copy-node', liveBody: 'renderer body', liveRef: sourceRef, history })
  const result = owner.intent.backfillHistoryReceipt({ canvasId: owner.canvasId, nodeId: owner.nodeId,
    ref: lifecycleRef, operation, data: { id: owner.nodeId, text: 'canonical body', src: '/core/canonical-file', title: 'canonical title' },
    history, currentNodesRef: owner.currentNodesRef, setNodes: owner.setNodes, suppress: owner.suppress })
  assert.deepEqual(asJson(result), { ok: true })
  assert.equal(owner.calls.setNodes, 1)
  assert.equal(owner.calls.suppress, 1, 'the preexisting lifecycle branch keeps its established suppression')
  assert.equal(owner.currentNodesRef.current[0].data.text, 'canonical body')
  assert.equal(owner.currentNodesRef.current[0].data.src, '/core/canonical-file')
  assert.equal(history[0].state.nodes[0].data.title, 'canonical title')
  assert.equal(history[0].lcos_history_operations[0].lcos_snapshot.data.src, '/core/canonical-file')
  assert.deepEqual(asJson(history[0].lcos_history_operations[0].lcos_ref), lifecycleRef)
}

console.log('PASS: exact text metadata uses the original pending-frame flush/fresh history and scoped receipt setter; applying Undo/Redo never flushes, newer user state survives, and lifecycle behavior is preserved.')
