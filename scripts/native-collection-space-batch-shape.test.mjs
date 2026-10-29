import assert from 'node:assert/strict';

import { assertCollectionSpaceBatchShape } from './native-collection-space-browser.mjs';

const canvasId = 'surface-batch-shape';
const workspaceId = 'workspace-batch-shape';
const projectId = 'project-batch-shape';
const collectionId = 'collection-batch-shape';
const collectionNodeId = 'carrier-batch-shape';
const frameId = 'frame-batch-shape';
const sourceVersion = 14;
const textId = 'material-text-batch-shape';
const imageId = 'material-image-batch-shape';

const textRef = { version: 1, entityType: 'artifact', entityId: 'artifact-text', artifactId: 'artifact-text',
  artifactViewId: 'view-text', revisionId: 'revision-text' };
const imageRef = { version: 1, entityType: 'artifact', entityId: 'artifact-image', artifactId: 'artifact-image',
  artifactViewId: 'view-image', revisionId: 'revision-image' };
const textBefore = { id: textId, canvas_id: canvasId, type: 'text', position: { x: 48, y: 72 },
  measured: { width: 360, height: 280 }, parent_id: '',
  data: { id: textId, title: 'Bound text', content: '# exact body', lcos_ref: textRef } };
const imageBefore = { id: imageId, canvas_id: canvasId, type: 'image', position: { x: 470, y: 80 },
  measured: { width: 375, height: 250 }, parent_id: '',
  data: { id: imageId, title: 'Bound image', src: '/local/exact.png', lcos_ref: imageRef } };
const frameAfter = { id: frameId, canvas_id: canvasId, type: 'group', position: { x: 40, y: 60 },
  measured: { width: 820, height: 430 }, width: 820, height: 430,
  data: { id: frameId, title: 'Collection fixture', createdBy: 'client', loading: false, layoutType: 'none',
    lcosCollectionId: collectionId, lcosCollectionNodeId: collectionNodeId } };
const textAfter = { ...textBefore, position: { x: 8, y: 12 }, parent_id: frameId };
const imageAfter = { ...imageBefore, position: { x: 430, y: 20 }, parent_id: frameId };

const plan = {
  project_id: projectId,
  canvas_id: canvasId,
  workspace_id: workspaceId,
  collection_id: collectionId,
  collection_node_id: collectionNodeId,
  frame_id: frameId,
  source_version: sourceVersion,
  before_nodes: [textBefore, imageBefore],
  after_nodes: [frameAfter, textAfter, imageAfter],
  space: {
    projectId, canvasId, workspaceId, collectionId, collectionNodeId, frameId, sourceVersion,
    before: [
      { id: textId, position: { x: 48, y: 72 }, parentId: null, size: { width: 360, height: 280 } },
      { id: imageId, position: { x: 470, y: 80 }, parentId: null, size: { width: 375, height: 250 } },
    ],
    after: [
      { id: frameId, position: { x: 40, y: 60 }, parentId: null, size: { width: 820, height: 430 } },
      { id: textId, position: { x: 8, y: 12 }, parentId: frameId, size: { width: 360, height: 280 } },
      { id: imageId, position: { x: 430, y: 20 }, parentId: frameId, size: { width: 375, height: 250 } },
    ],
  },
};

const operationId = 'native-collection-space-shape-operation';
function update(node) {
  // Original renderer traffic can omit the redundant Canvas field on updates;
  // the same exact material data and geometry remain present.
  const { canvas_id: _canvasId, ...wire } = node;
  return wire;
}
function bodyFor(phase, actions, expectedVersion) {
  return {
    canvas_id: canvasId,
    actions,
    created_by_role: 'user',
    lcos_operation: { version: 1, operationId, kind: 'collection-space', phase, space: structuredClone(plan.space) },
    lcos_expected_canvas_version: expectedVersion,
    lcos_expected_revisions: { [textId]: textRef.revisionId, [imageId]: imageRef.revisionId },
    lcos_refs: {},
    lcos_snapshots: {},
  };
}

const applyBody = bodyFor('apply', [
  { action: 'create', nodes: [{ id: frameId, canvas_id: canvasId, type: 'group', position: frameAfter.position,
    measured: frameAfter.measured, data: frameAfter.data }] },
  { action: 'update', updates: [update(textAfter), update(imageAfter)] },
], sourceVersion);
const undoBody = bodyFor('undo', [
  { action: 'delete', delete_ids: [frameId] },
  { action: 'update', updates: [update(textBefore), update(imageBefore)] },
], sourceVersion + 1);
const redoBody = bodyFor('redo', [
  // The original redo serializer can emit the empty root parent marker. The
  // helper accepts only this semantically equivalent root representation.
  { action: 'create', creates: [{ id: frameId, canvas_id: canvasId, type: 'group', position: frameAfter.position,
    measured: frameAfter.measured, data: frameAfter.data, parent_id: '' }] },
  { action: 'update', updates: [update(textAfter), update(imageAfter)] },
], sourceVersion + 2);

for (const [phase, body] of [['apply', applyBody], ['undo', undoBody], ['redo', redoBody]]) {
  assert.doesNotThrow(() => assertCollectionSpaceBatchShape(body, plan, phase, canvasId),
    `${phase} accepts the original bounded action shape and exact prepared scope`);
}

const createAliasBody = structuredClone(applyBody);
createAliasBody.actions[0] = { action: 'create', creates: structuredClone(createAliasBody.actions[0].nodes) };
assert.doesNotThrow(() => assertCollectionSpaceBatchShape(createAliasBody, plan, 'apply', canvasId),
  'the original creates alias is accepted when nodes is absent');

const twoCreateAliases = structuredClone(redoBody);
twoCreateAliases.actions[0].nodes = structuredClone(twoCreateAliases.actions[0].creates);
assert.throws(() => assertCollectionSpaceBatchShape(twoCreateAliases, plan, 'redo', canvasId),
  /Object\.hasOwn|true/,
  'the same create action cannot carry both creates and nodes aliases');

const staleRevision = structuredClone(applyBody);
staleRevision.lcos_expected_revisions[textId] = 'stale-revision';
assert.throws(() => assertCollectionSpaceBatchShape(staleRevision, plan, 'apply', canvasId), /strictEqual|exact scoped canonical node/,
  'a stale material revision CAS is rejected');
const unknownRevision = structuredClone(applyBody);
unknownRevision.lcos_expected_revisions['foreign-node'] = 'revision-text';
assert.throws(() => assertCollectionSpaceBatchShape(unknownRevision, plan, 'apply', canvasId), /strictEqual|exact scoped canonical node/,
  'a revision for an unscoped native node is rejected');

const dataDrift = structuredClone(applyBody);
dataDrift.actions[1].updates[0].data.content = '# changed body';
assert.throws(() => assertCollectionSpaceBatchShape(dataDrift, plan, 'apply', canvasId), /exact original create\/delete/,
  'a space operation cannot alter bound material data');
const parentDrift = structuredClone(applyBody);
parentDrift.actions[1].updates[0].parent_id = 'foreign-frame';
assert.throws(() => assertCollectionSpaceBatchShape(parentDrift, plan, 'apply', canvasId), /exact original create\/delete/,
  'a child cannot be parented to a different frame');
const frameIdDrift = structuredClone(applyBody);
frameIdDrift.actions[0].nodes[0].id = 'different-frame';
assert.throws(() => assertCollectionSpaceBatchShape(frameIdDrift, plan, 'apply', canvasId), /exact original create\/delete/,
  'the operation cannot remap the canonical frame id');
const deleteIdDrift = structuredClone(undoBody);
deleteIdDrift.actions[0].delete_ids[0] = 'different-frame';
assert.throws(() => assertCollectionSpaceBatchShape(deleteIdDrift, plan, 'undo', canvasId), /exact original create\/delete/,
  'Undo must delete the exact frame created by Apply');

const unknownTopLevel = structuredClone(applyBody);
unknownTopLevel.unrelated = true;
assert.throws(() => assertCollectionSpaceBatchShape(unknownTopLevel, plan, 'apply', canvasId), /unknown top-level field/,
  'unknown batch metadata is refused');
const unknownActionField = structuredClone(applyBody);
unknownActionField.actions[0].sideEffect = true;
assert.throws(() => assertCollectionSpaceBatchShape(unknownActionField, plan, 'apply', canvasId),
  'unknown create action fields are refused');
const nonEmptyLifecycleRefs = structuredClone(applyBody);
nonEmptyLifecycleRefs.lcos_refs = { [frameId]: textRef };
assert.throws(() => assertCollectionSpaceBatchShape(nonEmptyLifecycleRefs, plan, 'apply', canvasId), /cannot carry material identity/,
  'space batches cannot carry material lifecycle refs');

process.stdout.write(JSON.stringify({
  positivePhases: ['apply', 'undo', 'redo'],
  acceptedOriginalVariants: ['create.nodes', 'create.creates alias', 'redo root parent_id empty string', 'update omitted canvas_id', 'exact lcos_expected_revisions'],
  rejected: ['stale/foreign revision', 'both create aliases', 'material data drift', 'parent drift', 'frame/delete ID drift', 'unknown fields', 'non-empty lifecycle refs'],
  helper: 'assertCollectionSpaceBatchShape',
}, null, 2) + '\n');
