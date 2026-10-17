import assert from 'node:assert/strict';
import path from 'node:path';
import { createNodeLabBackend } from '../lab/node-lab-backend.mjs';
const root = path.resolve('.runtime', 'node-backend-test-' + Date.now());
const backend = await createNodeLabBackend({ runtimeRoot: root });
const call = (method, suffix = '', body) => backend.handle({ method, pathname: '/api/canvas/v1/canvases' + suffix, body });
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
await check('isolated seed uses original upload kind', async () => {
  const main = await call('GET', '/offline-fixture-canvas'); assert.equal(main.body.data.nodes[0].data.type, 'upload');
  assert.equal(backend.metadata.core_connected, false);
});
const created = (await call('POST', '', { name: '节点测试空间' })).body.data.canvas;
const id = created.id, batch = (actions, canvas_id = id) => call('POST', '/' + id + '/nodes:batchActions', { canvas_id, actions });
const node = { id: 'test-text', type: 'text', position: { x: 1, y: 2 }, data: { text: 'hello' } };
await check('create, update and file reload', async () => {
  assert.equal((await batch([{ action: 'create', creates: [node] }])).status, 200);
  assert.equal((await batch([{ action: 'update', updates: [{ id: node.id, data: { text: 'changed' }, position: { x: 6, y: 7 } }] }])).status, 200);
  const reloaded = await createNodeLabBackend({ runtimeRoot: root });
  const saved = (await reloaded.getSnapshot()).canvases.find(c => c.id === id).nodes[0];
  assert.equal(saved.data.text, 'changed'); assert.deepEqual(saved.position, { x: 6, y: 7 });
});
await check('failed batch is atomic', async () => {
  const before = await backend.getSnapshot();
  assert.equal((await batch([{ action: 'update', updates: [{ id: node.id, data: { text: 'bad' } }, { id: 'missing', data: {} }] }])).status, 404);
  assert.deepEqual(await backend.getSnapshot(), before);
});
await check('IDs, canvas ownership and geometry validation', async () => {
  assert.equal((await batch([{ action: 'create', creates: [node] }])).status, 409);
  assert.equal((await batch([], 'other-canvas')).status, 400);
  assert.equal((await batch([{ action: 'update', updates: [{ id: node.id, position: { x: NaN, y: 0 } }] }])).status, 400);
});
await check('connections cannot cross canvases', async () => {
  const response = await call('POST', '/' + id + '/connections:batchActions', { canvas_id: id, actions: [{ action: 'create', creates: [{ id: 'edge', source: node.id, target: 'node-lab-image' }] }] });
  assert.equal(response.status, 400);
});
await check('clone retains content with independent identities', async () => {
  const copied = (await call('POST', '/' + id + ':clone', {})).body.data;
  assert.notEqual(copied.new_canvas_id, id); assert.notEqual(copied.canvas.nodes[0].id, node.id);
  assert.equal(copied.canvas.nodes[0].data.text, 'changed');
});
await check('rename, delete and unknown action semantics', async () => {
  assert.equal((await call('PATCH', '/' + id, { is_public: true })).status, 501);
  assert.equal((await batch([{ action: 'delete', delete_ids: ['missing'] }])).status, 404);
  assert.equal((await call('PATCH', '/' + id, { name: '新名称' })).status, 200);
  assert.equal((await batch([{ action: 'generate', creates: [] }])).status, 501);
  assert.equal((await call('DELETE', '/' + id)).status, 200);
  assert.equal((await call('GET', '/' + id)).status, 404);
});
await assert.rejects(createNodeLabBackend({ runtimeRoot: path.resolve('lcos') }), /experiment/);
console.log(JSON.stringify({ passed: passed + 1, fixtureOnly: true, originalCoreWrites: 0 }));
