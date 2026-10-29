import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const runtimeSource = readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8')
const sandbox = { window: {}, structuredClone, Date, crypto: { randomUUID: () => 'native-image-title-history' } }
vm.runInNewContext(runtimeSource, sandbox, { filename: 'startup-history-intent.js' })
const intent = sandbox.window.__LCOS_NATIVE_INTENT__
assert.ok(intent, 'the existing NativeIntent runtime is installed in the VM')

const canvasId = 'canvas-native-image-title-history'
const nodeId = 'native-image-history-node'
const title = '旧历史标题'
const ref = Object.freeze({ version: 1, entityType: 'view', entityId: 'view-image-copy',
  artifactId: 'artifact-image', artifactViewId: 'view-image-copy', revisionId: 'revision-image' })

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freezeDeep(child)
  return Object.freeze(value)
}

function fixture({ phase = 'undo', id = nodeId, rememberedRef = ref, historyRef = ref,
  replaceRef = ref, actionRef = ref, historyTitle = title, replaceTitle = title,
  actionTitle = title, image = true, changes = 1, operations = 1, remember = true } = {}) {
  if (remember) intent.rememberNodeRef(canvasId, id, rememberedRef)
  const historyNode = freezeDeep({ id, type: 'image', position: { x: 80, y: 120 }, data: {
    id, title: historyTitle, lcos_ref: historyRef, src: '/core/history.png', custom: { keep: true },
  } })
  const replaceItem = freezeDeep({ id, type: image ? 'image' : 'text', position: { x: 80, y: 120 }, data: {
    id, title: replaceTitle, lcos_ref: replaceRef, src: '/core/replace.png', custom: { keep: 'replace' },
  } })
  const historyEntry = freezeDeep({ state: { nodes: [historyNode] }, lcos_history_operations: [] })
  const replaceChange = freezeDeep({ type: 'replace', id, item: replaceItem })
  const changeList = Array.from({ length: changes }, () => replaceChange)
  const operationData = freezeDeep({ id, title: actionTitle, lcos_ref: actionRef, src: '/core/wire.png',
    custom: { nested: ['must', 'survive'] }, otherFlag: true })
  const operationItem = { operationType: 'update', type: 'image', id, data: operationData, envelopeFlag: 'unchanged' }
  const operationList = Array.from({ length: operations }, () => operationItem)
  return { phase, historyEntry, replaceChange, operationItem, operationData, changes: changeList, operations: operationList }
}

function run(f) {
  intent.tagHistoryBatchOperations(canvasId, f.phase, f.historyEntry, new Map(), f.changes, f.operations)
}

for (const phase of ['undo', 'redo']) {
  const f = fixture({ phase })
  const frozenHistoryNode = f.historyEntry.state.nodes[0]
  const frozenReplaceItem = f.replaceChange.item
  const originalOperationData = f.operationData
  const originalNested = originalOperationData.custom
  const originalEnvelope = { ...f.operationItem, data: clone(originalOperationData) }

  run(f)

  assert.notStrictEqual(f.operationItem.data, originalOperationData,
    `${phase} detaches only the O8 wire data before removing its title echo`)
  assert.equal(Object.hasOwn(f.operationItem.data, 'title'), false,
    `${phase} strips the exact old title from the history wire payload`)
  assert.deepEqual(clone(f.operationItem.data), {
    id: nodeId, lcos_ref: ref, src: '/core/wire.png', custom: { nested: ['must', 'survive'] }, otherFlag: true,
  }, `${phase} preserves every non-title wire data field`)
  assert.strictEqual(f.operationItem.data.custom, originalNested, `${phase} shallow-copies data only`)
  assert.deepEqual({ ...f.operationItem, data: clone(f.operationItem.data) },
    { ...originalEnvelope, data: { id: nodeId, lcos_ref: ref, src: '/core/wire.png',
      custom: { nested: ['must', 'survive'] }, otherFlag: true } },
  `${phase} leaves every other O8 operation field unchanged`)
  assert.strictEqual(f.historyEntry.state.nodes[0], frozenHistoryNode)
  assert.equal(f.historyEntry.state.nodes[0].data.title, title, `${phase} leaves the frozen O8 snapshot title unchanged`)
  assert.strictEqual(f.replaceChange.item, frozenReplaceItem)
  assert.equal(f.replaceChange.item.data.title, title, `${phase} leaves the frozen ReactFlow replace node unchanged`)

  const once = f.operationItem.data
  run(f)
  assert.strictEqual(f.operationItem.data, once, `${phase} is idempotent when the title has already been stripped`)
}

function assertUnchanged(label, options, mutate) {
  const f = fixture(options)
  if (mutate) mutate(f)
  const operationData = f.operationItem.data
  const before = clone(operationData)
  const operationFields = { ...f.operationItem }
  run(f)
  assert.strictEqual(f.operationItem.data, operationData, `${label}: unverified update must keep the original data object`)
  assert.deepEqual(clone(f.operationItem.data), before, `${label}: unverified title echo is not stripped`)
  assert.deepEqual({ ...f.operationItem, data: clone(f.operationItem.data) },
    { ...operationFields, data: before }, `${label}: other operation fields remain untouched`)
}

assertUnchanged('ordinary apply update', { phase: 'apply' })
assertUnchanged('non-image O8 action', {}, f => { f.operationItem.type = 'text' })
assertUnchanged('non-image replace target', {}, f => {
  f.changes[0] = { type: 'replace', id: nodeId, item: { ...f.replaceChange.item, type: 'text' } }
})
assertUnchanged('operation id differs from the exact replace node', {}, f => { f.operationItem.id = 'other-node' })
assertUnchanged('replace change id differs from its node id', {}, f => {
  f.changes[0] = { type: 'replace', id: 'other-node', item: f.replaceChange.item }
})
assertUnchanged('multiple matching replace changes are ambiguous', { changes: 2 })
assertUnchanged('multiple O8 update operations for the same node are ambiguous', { operations: 2 })
assertUnchanged('history target title differs from the O8 action title', { actionTitle: 'newer title' })
assertUnchanged('replace target title differs from the history target', { replaceTitle: 'different title' })
assertUnchanged('operation ref differs from the remembered current Canvas ref', {}, f => {
  f.operationItem.data = { ...f.operationItem.data, lcos_ref: { ...ref, revisionId: 'wrong-revision' } }
})
assertUnchanged('replace ref differs from the remembered current Canvas ref', { replaceRef: { ...ref, artifactViewId: 'wrong-view', entityId: 'wrong-view' } })
assertUnchanged('history target ref differs from the remembered current Canvas ref', { historyRef: { ...ref, artifactId: 'wrong-artifact' } })
assertUnchanged('no exact ref was remembered for this Canvas/node', { remember: false, id: 'unremembered-native-image-node' })
assertUnchanged('duplicate history target NodeID is ambiguous', {}, f => {
  f.historyEntry = freezeDeep({ state: { nodes: [...f.historyEntry.state.nodes, f.historyEntry.state.nodes[0]] },
    lcos_history_operations: [] })
})

const historySource = fixture({ phase: 'redo' })
historySource.operationItem.data = { ...historySource.operationItem.data, historySourceNodeId: 'renderer-only' }
const historySourceBefore = clone(historySource.operationItem.data)
run(historySource)
assert.equal(historySource.operationItem.lcos_intent_unsupported, 'HISTORY_SOURCE_NODE_ID_ON_NON_LIFECYCLE_ACTION',
  'existing renderer-lineage rejection remains in force for O8 updates')
assert.deepEqual(clone(historySource.operationItem.data), historySourceBefore,
  'the title shim does not bypass or mutate the existing unsupported lineage path')

console.log(JSON.stringify({ passed: true, cases: [
  'exact undo and redo strip only data.title from O8 image updates',
  'history snapshot, replace node, refs, envelopes and all non-title payload fields remain unchanged',
  'ordinary/non-image/mismatched/ambiguous updates fail closed and remain byte-shape equivalent',
  'the existing historySourceNodeId rejection is preserved',
  'repeated invocation is idempotent',
] }, null, 2))
