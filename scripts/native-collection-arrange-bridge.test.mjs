import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../lab/startup-node-bridge.js', import.meta.url), 'utf8');
const stripped = source.replace(/^import .+;\r?\n/gm, '').replaceAll('export function ', 'function ');
const reference = { projectId: 'project', canvasId: 'canvas', workspaceId: 'workspace', collectionId: 'collection' };
const frameData = { id: 'frame', title: 'Collection', createdBy: 'client', layoutType: 'none',
  lcosCollectionId: reference.collectionId, lcosCollectionNodeId: 'owner' };
const material = id => ({ id, title: id, content: 'same canonical body', lcos_ref: { revisionId: 'revision-' + id } });
const sized = (id, type, position, data, parentId) => ({ id, type, position, data,
  width: 100, height: 80, measured: { width: 100, height: 80 }, ...(parentId ? { parentId } : {}) });

async function scenario({ staleDuringPrepare = false, noOp = false, nested = false, stealSibling = false } = {}) {
  let raw = [
    sized('owner', 'lcos-collection', { x: -300, y: 0 }, { id: 'owner', title: 'Collection', lcos_collection_ref: reference }),
    sized('frame', 'group', { x: 0, y: 0 }, frameData),
    sized('child', 'text', { x: 60, y: 40 }, material('child'), 'frame'),
    sized('free', 'text', { x: 500, y: 300 }, material('free'), noOp ? 'frame' : undefined),
    { ...sized('independently-hidden', 'text', { x: -200, y: -100 }, material('independently-hidden')), hidden: true },
  ];
  if (nested) {
    raw = raw.map(node => ['owner', 'frame'].includes(node.id) ? { ...node, parentId: 'outer-frame' } : node);
    raw.push(sized('outer-owner', 'lcos-collection', { x: -600, y: 0 }, {
      id: 'outer-owner', lcos_collection_ref: { ...reference, collectionId: 'outer-collection' } }),
    sized('outer-frame', 'group', { x: 200, y: 100 }, { ...frameData, id: 'outer-frame',
      lcosCollectionId: 'outer-collection', lcosCollectionNodeId: 'outer-owner' }),
    sized('outer-sibling', 'text', { x: 400, y: 300 }, material('outer-sibling'), 'outer-frame'));
  }
  const original = structuredClone(raw);
  const scopeIds = ['frame', 'child', 'free', ...(nested ? ['outer-frame', 'owner', 'outer-sibling'] : [])];
  const before = raw.filter(node => scopeIds.includes(node.id));
  const after = before.map(node => noOp ? node : node.id === 'frame'
    ? { ...node, width: 164, height: 248, measured: { width: 164, height: 248 } }
    : node.id === 'outer-frame'
      ? { ...node, position: { x: 180, y: 80 }, width: 600, height: 500, measured: { width: 600, height: 500 } }
    : nested && ['owner', 'outer-sibling'].includes(node.id)
      ? { ...node, position: { x: node.position.x + 20, y: node.position.y + 20 },
        ...(stealSibling && node.id === 'outer-sibling' ? { parentId: 'frame' } : {}) }
    : { ...node, position: { x: 32, y: node.id === 'child' ? 32 : 136 }, parentId: 'frame' });
  const slice = node => ({ id: node.id, position: node.position, parentId: node.parentId ?? null,
    size: { width: node.width, height: node.height } });
  const dto = node => {
    const { parentId, ...rest } = node;
    return { ...rest, parent_id: parentId ?? '', canvas_id: reference.canvasId };
  };
  const plan = { project_id: reference.projectId, canvas_id: reference.canvasId, workspace_id: reference.workspaceId,
    collection_id: reference.collectionId, collection_node_id: 'owner', frame_id: 'frame', same_frame: true,
    created: false, committed: false, provider_execution_started: false, source_version: 7,
    changed_node_ids: noOp ? [] : [...scopeIds], before_nodes: before.map(dto), after_nodes: after.map(dto),
    space: { ...reference, collectionNodeId: 'owner', frameId: 'frame', sourceVersion: 7,
      before: before.map(slice), after: after.map(slice) } };
  let writes = 0, queueCalls = 0, flushes = 0, queued;
  const ownerApi = {};
  const api = {
    // Simulate an already-collapsed original Flow. Its hidden flags are derived.
    getNodes: () => raw.map(node => ['frame', 'child'].includes(node.id) ? { ...node, hidden: true } : node),
    setNodes(nodes) { writes++; raw = nodes; },
  };
  const window = { __LCOS_NATIVE_INTENT__: {
    queueCollectionArrangeIntent(input) {
      queueCalls++; queued = input;
      return { ok: true, operationId: input.operation.operationId, anchorNodeId: 'frame', changedNodeIds: plan.changed_node_ids };
    },
  } };
  const factory = new Function('window', 'crypto', stripped + '\nreturn createCollectionCarrierControls;')(window, globalThis.crypto);
  const controls = factory({ api, ownerApi, getHost: () => ({ api: ownerApi, projectId: reference.projectId, currentCanvasId: reference.canvasId }),
    prepareHistory: () => ({ ok: true }), readOriginalNodes: () => raw,
    queueCollectionArrangeIntent: input => window.__LCOS_NATIVE_INTENT__.queueCollectionArrangeIntent(input),
    flushCanvas: async () => { flushes++; return 'saved'; },
    inspectHistory: () => ({ currentEntry: { operations: [{ operation: queued?.operation }] } }),
    normalizeNodes: rows => rows.map(node => ({ ...node, parentId: node.parent_id || undefined })),
    request: async address => {
      assert.equal(address, '/api/lcos/canvases/canvas/collections/collection/space:arrange-prepare');
      if (staleDuringPrepare) raw = raw.map(node => node.id === 'child' ? { ...node, position: { x: 77, y: 88 } } : node);
      return { ok: true, json: async () => ({ code: 0, data: plan }) };
    },
  });
  const result = await controls.arrangeCollectionSpace({ ...reference, nodeId: 'owner' }, { isCurrent: () => true });
  if (stealSibling) {
    assert.equal(result.ok, false);
    assert.equal(writes, 0); assert.equal(queueCalls, 0);
    assert.deepEqual(raw, original, 'a same-parent sibling cannot be stolen into the target frame');
  } else if (staleDuringPrepare) {
    assert.equal(result.ok, false);
    assert.equal(writes, 0); assert.equal(queueCalls, 0);
    assert.deepEqual(raw.find(node => node.id === 'child').position, { x: 77, y: 88 });
  } else if (noOp) {
    assert.equal(result.ok, true, result.reason); assert.equal(result.idempotent, true);
    assert.equal(writes, 0); assert.equal(queueCalls, 0);
    assert.deepEqual(raw, original);
  } else {
    assert.equal(result.ok, true, result.reason);
    assert.equal(writes, 1); assert.equal(queueCalls, 1); assert.equal(flushes, 2);
    assert.equal(raw.find(node => node.id === 'free').parentId, 'frame');
    assert.deepEqual(raw.find(node => node.id === 'frame').measured, { width: 164, height: 248 });
    for (const id of ['frame', 'child', 'free']) {
      assert.notEqual(raw.find(node => node.id === id).hidden, true, 'derived collapsed hidden must not leak into the original Canvas/O8 input');
      assert.deepEqual(raw.find(node => node.id === id).data, original.find(node => node.id === id).data);
    }
    assert.deepEqual(raw.find(node => node.id === 'independently-hidden'), original.find(node => node.id === 'independently-hidden'));
    assert.equal(queued.operation.kind, 'collection-arrange');
    assert.deepEqual(queued.beforeNodes, original);
    if (nested) {
      assert.equal(raw.find(node => node.id === 'frame').parentId, 'outer-frame');
      assert.equal(raw.find(node => node.id === 'owner').parentId, 'outer-frame');
      assert.equal(raw.find(node => node.id === 'outer-sibling').parentId, 'outer-frame');
      assert.deepEqual(raw.find(node => node.id === 'outer-frame').measured, { width: 600, height: 500 });
      assert.equal(raw.find(node => node.id === 'outer-frame').position.x + raw.find(node => node.id === 'outer-sibling').position.x,
        original.find(node => node.id === 'outer-frame').position.x + original.find(node => node.id === 'outer-sibling').position.x);
      assert.deepEqual(raw.find(node => node.id === 'outer-owner'), original.find(node => node.id === 'outer-owner'));
    }
  }
}

await scenario();
await scenario({ staleDuringPrepare: true });
await scenario({ noOp: true });
await scenario({ nested: true });
await scenario({ nested: true, stealSibling: true });
console.log(JSON.stringify({ passed: true, scope: 'source-executed Native bridge; not real Core/O8/GUI',
  cases: ['one original setNodes and original history/flush delegation', 'collapsed Flow input does not persist derived hidden flags',
    'independent hidden/data/IDs preserved', 'late raw-node edit rejects before queue/write', 'no-op does not create history or write',
    'nested ancestor/sibling geometry is forwarded without changing parents or outside owners', 'nested sibling parent theft rejects before queue/write'] }));
