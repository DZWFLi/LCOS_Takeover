import assert from 'node:assert/strict'
import { assertCollectionArrangeBatchShape } from './native-collection-space-browser.mjs'

const canvasId = 'canvas'
const reference = id => ({ version: 1, entityType: 'artifact', entityId: 'artifact-' + id,
  artifactId: 'artifact-' + id, artifactViewId: 'view-' + id, revisionId: 'revision-' + id })
const slice = (id, parentId, x, y, width = 100, height = 80) => ({ id, parentId, position: { x, y }, size: { width, height } })
const before = [slice('outer', null, 0, 0, 500, 400), slice('inner', 'outer', 32, 32, 200, 180),
  slice('text', 'inner', 60, 40), slice('sibling', 'outer', 300, 32)]
const after = [slice('outer', null, 0, 0, 500, 450), slice('inner', 'outer', 32, 32, 220, 210),
  slice('text', 'inner', 32, 32), before[3]]
const dto = row => ({ id: row.id, type: ['outer', 'inner'].includes(row.id) ? 'group' : 'text', canvas_id: canvasId,
  position: row.position, measured: row.size, parent_id: row.parentId ?? '',
  data: ['outer', 'inner'].includes(row.id) ? { id: row.id, createdBy: 'client', layoutType: 'none' }
    : { id: row.id, content: 'same body', lcos_ref: reference(row.id) } })
const space = { projectId: 'project', canvasId, workspaceId: 'workspace', collectionId: 'collection',
  collectionNodeId: 'owner', frameId: 'inner', sourceVersion: 7, before, after }
const plan = { frame_id: 'inner', space, changed_node_ids: ['outer', 'inner', 'text'],
  before_nodes: before.map(dto), after_nodes: after.map(dto) }
const body = { canvas_id: canvasId, created_by_role: 'user', lcos_expected_canvas_version: 7,
  lcos_operation: { version: 1, operationId: 'one-operation', kind: 'collection-arrange', phase: 'apply', space },
  lcos_refs: {}, lcos_snapshots: {},
  lcos_expected_revisions: { text: 'revision-text', sibling: 'revision-sibling' },
  actions: [{ action: 'update', updates: plan.after_nodes.filter(row => plan.changed_node_ids.includes(row.id)) }] }
assert.doesNotThrow(() => assertCollectionArrangeBatchShape(body, plan, 'apply', canvasId))
const rejects = change => { const mutated = structuredClone(body); change(mutated); assert.throws(() => assertCollectionArrangeBatchShape(mutated, plan, 'apply', canvasId)) }
rejects(value => { value.lcos_expected_revisions.sibling = 'stale-revision' })
rejects(value => { value.lcos_expected_revisions['outside-operation'] = 'revision-outside' })
rejects(value => { value.actions[0].updates.push(plan.after_nodes.find(row => row.id === 'sibling')) })
rejects(value => { value.actions[0].updates.pop() })
rejects(value => { value.actions[0].updates.find(row => row.id === 'text').data.content = 'rewritten body' })
console.log(JSON.stringify({ passed: true, helper: 'assertCollectionArrangeBatchShape',
  exactScopedUnchangedRevisionAllowed: true, unchangedNodeWriteRejected: true,
  staleAndForeignRevisionsRejected: true, missingChangeAndMaterialRewriteRejected: true }))
