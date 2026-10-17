import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const sandbox = { window: {}, structuredClone, Date, Map, Set }
vm.runInNewContext(fs.readFileSync(new URL('../lab/startup-history-intent.js', import.meta.url), 'utf8'), sandbox)
const intent = sandbox.window.__LCOS_NATIVE_INTENT__
const ref = { projectId: 'project', workspaceId: 'workspace', canvasId: 'canvas', collectionId: 'collection' }
const node = (title, members, position) => ({ id: 'native-pile', type: 'pile', position,
  width: 360, height: 240, selected: true, data: { id: 'native-pile', lcos_native_collection: true,
    title, memberIds: members, lcos_collection_ref: ref } })
const old = node('Old title', ['image', 'text'], { x: 40, y: 60 })
const second = node('Old title', ['image', 'text'], { x: 100, y: 120 })
const group = { id: 'native-group', type: 'group', position: { x: 10, y: 20 }, width: 900, height: 500,
  selected: false, data: { id: 'native-group', title: 'Old title', layoutType: 'none',
    lcosCollectionNodeId: 'native-pile', lcosCollectionId: ref.collectionId, lcos_collection_ref: ref } }
const foreign = { ...group, id: 'unrelated-group', data: { ...group.data, id: 'unrelated-group',
  lcos_collection_ref: { ...ref, workspaceId: 'other-workspace' } } }
const beforeGroup = structuredClone(group)
const history = [{ state: { nodes: [old], edges: [] } }, { state: { nodes: [second, group, foreign], edges: [] } }]
const currentNodesRef = { current: [second, group, foreign] }
let sets = 0, suppressed = 0, flushed = 0
const incoming = node('Core title', ['image', 'text', 'third'], { x: 9999, y: 9999 })
const apply = extra => intent.backfillHistoryReceipt({ receiptKind: 'collection-projection', ...ref,
  node: incoming, history, getHistory: () => history, currentNodesRef,
  setNodes: nodes => { sets++; currentNodesRef.current = nodes }, suppress: () => suppressed++,
  flushHistory: () => flushed++, ...extra })
assert.equal(apply().ok, true)
assert.equal(history.length, 2, 'a Core metadata receipt does not append an O8 history entry')
assert.equal(sets, 1)
assert.equal(suppressed, 1)
assert.deepEqual(JSON.parse(JSON.stringify(history.map(h => h.state.nodes[0].position))), [{ x: 40, y: 60 }, { x: 100, y: 120 }])
for (const value of [history[0].state.nodes[0], history[1].state.nodes[0], currentNodesRef.current[0]]) {
  assert.equal(value.type, 'pile')
  assert.equal(value.data.title, 'Core title')
  assert.deepEqual(JSON.parse(JSON.stringify(value.data.memberIds)), ['image', 'text', 'third'])
}
assert.equal(currentNodesRef.current[0].selected, true)
assert.equal(history[0].state.nodes.length, 1, 'title refresh cannot create a Group in pre-expansion history')
for (const owner of [history[1].state.nodes, currentNodesRef.current]) {
  assert.equal(owner[1].data.title, 'Core title', 'existing exact Group title echo follows the same Core name')
  assert.deepEqual(JSON.parse(JSON.stringify({ ...owner[1], data: { ...owner[1].data, title: 'Old title' } })), beforeGroup,
    'Group geometry/parent/layout/selection are not metadata writes')
  assert.equal(owner[2], foreign, 'a different Workspace Group cannot receive this title')
}
assert.equal(apply().idempotent, true)
assert.equal(sets, 1, 'repeated exact receipts do not echo into native editing')
const before = JSON.stringify({ history, current: currentNodesRef.current })
assert.equal(apply({ node: { ...incoming, data: { ...incoming.data, lcos_native_collection: false } } }).ok, false)
assert.equal(apply({ projectId: 'foreign' }).ok, false)
assert.equal(apply({ node: { ...incoming, data: { ...incoming.data, lcos_collection_ref: { ...ref, collectionId: 'other' } } } }).ok, false)
assert.equal(JSON.stringify({ history, current: currentNodesRef.current }), before)
console.log('PASS: native Pile and exact existing Group Core title echoes reuse O8 backfill, preserve geometry/selection/history size, reject missing marker and foreign identities, never insert Groups or enqueue another edit.')
