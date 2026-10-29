import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
const stripped = source.replace(/^import .+;\r?\n/gm, '').replaceAll('export function ', 'function ');
const reference = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', collectionId: 'outer' };
const sized = (id, type, position, data, parentId) => ({ id, type, position, data,
  measured: { width: 240, height: 180 }, ...(parentId ? { parentId } : {}) });
let raw = [
  sized('outer-owner', 'lcos-collection', { x: -300, y: 0 }, { id: 'outer-owner', lcos_collection_ref: reference }),
  sized('inner-owner', 'lcos-collection', { x: 0, y: 0 }, { id: 'inner-owner',
    lcos_collection_ref: { ...reference, collectionId: 'inner' } }),
  sized('inner-frame', 'group', { x: 292, y: 0 }, { id: 'inner-frame', createdBy: 'client', layoutType: 'none',
    lcosCollectionId: 'inner', lcosCollectionNodeId: 'inner-owner' }),
  sized('inner-child', 'text', { x: 32, y: 32 }, { id: 'inner-child', text: 'canonical body' }, 'inner-frame'),
  { ...sized('independently-hidden', 'text', { x: -500, y: -200 }, { id: 'independently-hidden' }), hidden: true },
];
const original = structuredClone(raw);
const before = raw.filter(node => ['inner-owner', 'inner-frame'].includes(node.id));
const after = [sized('outer-frame', 'group', { x: 0, y: 0 }, {
  id: 'outer-frame', createdBy: 'client', layoutType: 'none', lcosCollectionId: 'outer', lcosCollectionNodeId: 'outer-owner' }),
...before.map(node => ({ ...node, parentId: 'outer-frame' }))];
const dto = node => { const { parentId, ...rest } = node; return { ...rest, canvas_id: reference.canvasId, parent_id: parentId ?? '' }; };
const slice = node => ({ id: node.id, position: node.position, parentId: node.parentId ?? null, size: node.measured });
const plan = { project_id: reference.projectId, canvas_id: reference.canvasId, workspace_id: reference.workspaceId,
  collection_id: reference.collectionId, collection_node_id: 'outer-owner', frame_id: 'outer-frame', source_version: 7,
  before_nodes: before.map(dto), after_nodes: after.map(dto), committed: false, provider_execution_started: false,
  space: { ...reference, collectionNodeId: 'outer-owner', frameId: 'outer-frame', sourceVersion: 7,
    before: before.map(slice), after: after.map(slice) } };
let writes = 0, queued;
const ownerApi = {};
const api = {
  getNodes: () => raw.map(node => node.id === 'inner-owner' ? { ...node, position: { x: 999, y: 777 } }
    : ['inner-frame', 'inner-child'].includes(node.id) ? { ...node, hidden: true } : node),
  getEdges: () => [],
  setNodes(nodes) { writes++; raw = nodes; },
};
const window = { __LCOS_NATIVE_INTENT__: {
  queueCollectionSpaceIntent(input) { queued = input; return { ok: true }; },
} };
const createControls = new Function('window', 'crypto', stripped + '\nreturn createCollectionCarrierControls;')(window, globalThis.crypto);
const controls = createControls({ api, ownerApi,
  getHost: () => ({ api: ownerApi, projectId: reference.projectId, currentCanvasId: reference.canvasId }),
  readOriginalNodes: () => raw, prepareHistory: () => ({ ok: true }), flushCanvas: async () => 'saved',
  normalizeNodes: nodes => nodes.map(node => ({ ...node, parentId: node.parent_id || undefined })),
  inspectHistory: () => ({ currentEntry: { operations: [{ operation: queued?.operation }] } }),
  request: async address => {
    assert.equal(address, '/api/lcos/canvases/canvas/collections/outer/space:prepare');
    return { ok: true, json: async () => ({ code: 0, data: plan }) };
  },
});
const result = await controls.toggleCollectionSpace({ ...reference, nodeId: 'outer-owner' }, { isCurrent: () => true });
assert.equal(result.ok, true, result.reason);
assert.equal(writes, 1);
assert.deepEqual(queued.beforeNodes, original, 'First-open O8 input must be the actual original Canvas array, not collapsed display nodes.');
for (const id of ['inner-frame', 'inner-child']) {
  assert.notEqual(raw.find(node => node.id === id).hidden, true, 'Opening a parent must not bake its already-collapsed child display state into raw Canvas nodes.');
}
assert.equal(raw.find(node => node.id === 'inner-frame').parentId, 'outer-frame');
assert.equal(raw.find(node => node.id === 'inner-child').parentId, 'inner-frame');
assert.deepEqual(raw.find(node => node.id === 'independently-hidden'), original.find(node => node.id === 'independently-hidden'));
console.log(JSON.stringify({ passed: true, scope: 'source-executed first-open bridge; not real Core/O8/GUI',
  originalArrayPreserved: true, collapsedDisplayNotAuthored: true, displayGeometryNotAuthored: true,
  independentHiddenPreserved: true, oneSetNodes: true }));
